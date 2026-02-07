import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button, Card, Input } from "@heroui/react";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { CheckoutAgentEngine, type AgentOutput, type SuggestedAction } from "@vibesui/agent";
import { appConfig } from "../config";
import { createWebAgentToolbox } from "../lib/agentTools";
import { normalizeTxFeedback, parseErrorMessage, type TxFeedback } from "../lib/sui";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
}

function summarizeOutput(output: AgentOutput): string {
  if (output.intent === "PAY") return "Detected intent: PAY. I prepared payment steps and actions.";
  if (output.intent === "REDEEM") return "Detected intent: REDEEM. Choose burn amount or burn all.";
  if (output.intent === "CLAIM")
    return "Detected intent: CLAIM. You can trigger a claim transaction now.";
  if (output.intent === "STATUS")
    return "Detected intent: STATUS. I can query transaction status for you.";
  return "Detected intent: HELP. Use one of the suggested actions below.";
}

function stepColor(status: AgentOutput["steps"][number]["status"]): string {
  if (status === "completed") return "text-emerald-300";
  if (status === "in_progress") return "text-amber-300";
  if (status === "failed") return "text-red-300";
  return "text-slate-400";
}

function actionNeedsWallet(actionType: string): boolean {
  return (
    actionType === "PAY_MINT_AND_PAY" ||
    actionType === "REDEEM_ALL" ||
    actionType === "REDEEM_AMOUNT" ||
    actionType === "CLAIM_REVENUE"
  );
}

function parseInvoiceIdFromPath(pathname: string): string | undefined {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] === "pay" && parts[1]) return parts[1];
  return undefined;
}

function buildMessageId(): string {
  return `m_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function AgentDrawer() {
  const account = useCurrentAccount();
  const dAppKit = useDAppKit();
  const location = useLocation();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionLoadingType, setActionLoadingType] = useState<string | null>(null);
  const [lastDigest, setLastDigest] = useState<string | undefined>(undefined);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: buildMessageId(),
      role: "assistant",
      text: "Agent ready. Ask me to pay invoice, redeem, claim, or check status."
    }
  ]);
  const [latestOutput, setLatestOutput] = useState<AgentOutput | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [txFeedback, setTxFeedback] = useState<TxFeedback | null>(null);

  const engine = useMemo(() => new CheckoutAgentEngine(), []);
  const toolbox = useMemo(
    () => (account ? createWebAgentToolbox(account.address) : null),
    [account]
  );

  async function onSend(): Promise<void> {
    const text = input.trim();
    if (!text) return;

    setMessages((prev) => [...prev, { id: buildMessageId(), role: "user", text }]);
    setInput("");
    setLoading(true);
    setActionError(null);

    try {
      const invoiceId = parseInvoiceIdFromPath(location.pathname);
      const balances = account && toolbox ? await toolbox.getBalances(account.address) : {};

      const output = await engine.run(
        {
          userInput: text,
          context: {
            invoiceId,
            stableCoinType: appConfig.stableLayer.stableCoinType,
            balances,
            address: account?.address,
            currentPath: location.pathname,
            lastDigest
          }
        },
        toolbox ?? undefined
      );

      setLatestOutput(output);
      setMessages((prev) => [
        ...prev,
        {
          id: buildMessageId(),
          role: "assistant",
          text: summarizeOutput(output)
        }
      ]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: buildMessageId(),
          role: "assistant",
          text: `Agent error: ${parseErrorMessage(error)}`
        }
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function executeAction(action: SuggestedAction): Promise<void> {
    setActionLoadingType(action.actionType);
    setActionError(null);

    try {
      if (!toolbox && actionNeedsWallet(action.actionType)) {
        throw new Error("Please connect wallet first.");
      }

      if (action.actionType === "NAVIGATE") {
        const path = typeof action.payload?.path === "string" ? action.payload.path : "/merchant";
        navigate(path);
        setMessages((prev) => [
          ...prev,
          { id: buildMessageId(), role: "system", text: `Navigated to ${path}` }
        ]);
        return;
      }

      if (action.actionType === "CHECK_TX_STATUS") {
        const digest =
          typeof action.payload?.digest === "string" ? action.payload.digest : lastDigest;
        if (!digest) throw new Error("Missing tx digest for status check.");
        const status = await toolbox!.getTxStatus(digest);
        setMessages((prev) => [
          ...prev,
          {
            id: buildMessageId(),
            role: "system",
            text: `Tx ${status.digest}: ${status.status}${status.explorerUrl ? ` | ${status.explorerUrl}` : ""}`
          }
        ]);
        return;
      }

      if (action.actionType === "REFRESH_INVOICE") {
        const invoiceId =
          typeof action.payload?.invoiceId === "string"
            ? action.payload.invoiceId
            : parseInvoiceIdFromPath(location.pathname);
        if (!invoiceId) throw new Error("Missing invoice id.");
        const invoice = await toolbox!.getInvoice(invoiceId);
        setMessages((prev) => [
          ...prev,
          {
            id: buildMessageId(),
            role: "system",
            text: `Invoice ${invoice.objectId}: amount=${invoice.amountU64}, status=${invoice.status}, buyer=${invoice.buyer || "-"}`
          }
        ]);
        return;
      }

      if (action.actionType === "SHOW_HELP") {
        setMessages((prev) => [
          ...prev,
          {
            id: buildMessageId(),
            role: "assistant",
            text: "Try: 'pay this invoice', 'redeem all', 'claim revenue', or 'check tx status <digest>'."
          }
        ]);
        return;
      }

      let tx;
      if (action.actionType === "PAY_MINT_AND_PAY") {
        const invoiceId =
          typeof action.payload?.invoiceId === "string"
            ? action.payload.invoiceId
            : parseInvoiceIdFromPath(location.pathname);
        if (!invoiceId) throw new Error("Missing invoiceId for payment.");
        tx = await toolbox!.buildMintAndPayTx(invoiceId);
      } else if (action.actionType === "REDEEM_ALL") {
        tx = await toolbox!.buildBurnTx({ all: true });
      } else if (action.actionType === "REDEEM_AMOUNT") {
        const amount = typeof action.payload?.amount === "string" ? action.payload.amount : "1";
        tx = await toolbox!.buildBurnTx({ amount });
      } else if (action.actionType === "CLAIM_REVENUE") {
        tx = await toolbox!.buildClaimTx();
      } else {
        throw new Error(`Unsupported actionType: ${action.actionType}`);
      }

      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
      const feedback = await normalizeTxFeedback(result);
      setTxFeedback(feedback);
      setLastDigest(feedback.digest || undefined);
      setMessages((prev) => [
        ...prev,
        {
          id: buildMessageId(),
          role: "system",
          text: `Action ${action.actionType} completed: status=${feedback.status}, digest=${feedback.digest || "-"}`
        }
      ]);
    } catch (error) {
      const message = parseErrorMessage(error);
      setActionError(message);
      setMessages((prev) => [
        ...prev,
        { id: buildMessageId(), role: "system", text: `Action failed: ${message}` }
      ]);
    } finally {
      setActionLoadingType(null);
    }
  }

  return (
    <>
      <div className="fixed bottom-6 right-6 z-40">
        <Button variant="primary" onPress={() => setOpen(true)}>
          Agent
        </Button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40">
          <div className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-white/10 bg-slate-950">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-100">Checkout Agent</p>
                <p className="text-xs text-slate-400">Rule-driven mode (LLM enhancement off)</p>
              </div>
              <Button variant="secondary" onPress={() => setOpen(false)}>
                Close
              </Button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              <Card variant="secondary">
                <Card.Content className="space-y-1 text-xs text-slate-300">
                  <p>Address: {account?.address || "-"}</p>
                  <p>Path: {location.pathname}</p>
                  <p>InvoiceId: {parseInvoiceIdFromPath(location.pathname) || "-"}</p>
                </Card.Content>
              </Card>

              <Card variant="secondary">
                <Card.Content className="space-y-2">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`rounded-lg px-3 py-2 text-sm ${
                        message.role === "user"
                          ? "bg-emerald-500/15 text-emerald-100"
                          : message.role === "assistant"
                            ? "bg-slate-800 text-slate-100"
                            : "bg-sky-500/10 text-sky-100"
                      }`}
                    >
                      {message.text}
                    </div>
                  ))}
                </Card.Content>
              </Card>

              {latestOutput && (
                <Card variant="secondary">
                  <Card.Content className="space-y-3">
                    <p className="text-sm font-semibold text-slate-100">
                      Steps ({latestOutput.intent})
                    </p>
                    <div className="space-y-2">
                      {latestOutput.steps.map((step) => (
                        <div
                          key={`${step.title}-${step.details}`}
                          className="rounded-lg border border-white/10 px-3 py-2"
                        >
                          <p className={`text-sm font-medium ${stepColor(step.status)}`}>
                            {step.title}
                          </p>
                          <p className="text-xs text-slate-300">{step.details}</p>
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {latestOutput.suggestedActions.map((action) => (
                        <Button
                          key={`${action.label}-${action.actionType}`}
                          variant="secondary"
                          isDisabled={loading || actionLoadingType !== null}
                          onPress={() => executeAction(action)}
                        >
                          {actionLoadingType === action.actionType ? "Running..." : action.label}
                        </Button>
                      ))}
                    </div>
                  </Card.Content>
                </Card>
              )}

              {(actionError || txFeedback) && (
                <Card variant="secondary">
                  <Card.Content className="space-y-2 text-sm">
                    <p className="font-semibold text-slate-100">Action Result</p>
                    {actionError && <p className="text-red-300">{actionError}</p>}
                    {txFeedback && (
                      <div className="space-y-1 text-slate-200">
                        <p>Digest: {txFeedback.digest || "-"}</p>
                        <p>Status: {txFeedback.status}</p>
                        {txFeedback.explorerUrl && (
                          <a
                            className="text-emerald-300 underline"
                            href={txFeedback.explorerUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open in Explorer
                          </a>
                        )}
                      </div>
                    )}
                  </Card.Content>
                </Card>
              )}
            </div>

            <div className="border-t border-white/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <Input
                  aria-label="Agent input"
                  placeholder="Ask: pay/redeem/claim/status/help..."
                  value={input}
                  onChange={(event) => setInput(event.currentTarget.value)}
                  variant="secondary"
                />
                <Button variant="primary" isDisabled={loading} onPress={onSend}>
                  {loading ? "Thinking..." : "Send"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
