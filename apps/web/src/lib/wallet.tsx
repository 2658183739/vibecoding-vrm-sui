/* eslint-disable react-refresh/only-export-components */
import { useMemo, useState } from "react";
import { Button, Card } from "@heroui/react";
import {
  useCurrentAccount as useCurrentAccountFromKit,
  useDAppKit,
  useWalletConnection,
  useWallets
} from "@mysten/dapp-kit-react";
import { isSmokeMode, SMOKE_WALLET_ADDRESS } from "./smokeMode";
import { smokeMockTxResult } from "./smokeState";

interface WalletAccountLike {
  address: string;
}

export function useWalletAccount(): WalletAccountLike | null {
  const account = useCurrentAccountFromKit();
  const accountAddress = account?.address;
  const smokeMode = isSmokeMode();

  return useMemo(() => {
    if (accountAddress) return { address: accountAddress };
    if (smokeMode) return { address: SMOKE_WALLET_ADDRESS };
    return null;
  }, [accountAddress, smokeMode]);
}

export function useWalletDAppKit(): ReturnType<typeof useDAppKit> {
  const dAppKit = useDAppKit();
  if (!isSmokeMode()) return dAppKit;

  return {
    ...dAppKit,
    async signAndExecuteTransaction() {
      return smokeMockTxResult("success") as never;
    }
  } as unknown as ReturnType<typeof useDAppKit>;
}

export function ConnectWalletButton() {
  const dAppKit = useDAppKit();
  const wallets = useWallets();
  const connection = useWalletConnection();
  const account = useCurrentAccountFromKit();
  const [open, setOpen] = useState(false);
  const [busyWalletName, setBusyWalletName] = useState<string | null>(null);

  if (isSmokeMode()) {
    return (
      <Button variant="secondary" isDisabled>
        Smoke Test Wallet Connected
      </Button>
    );
  }

  const shortAddress = account?.address
    ? `${account.address.slice(0, 6)}...${account.address.slice(-4)}`
    : "Not Connected";

  async function onConnect(walletName: string): Promise<void> {
    const wallet = wallets.find((item) => item.name === walletName);
    if (!wallet) return;

    try {
      setBusyWalletName(wallet.name);
      await dAppKit.connectWallet({
        wallet,
        account: wallet.accounts[0]
      });
      setOpen(false);
    } finally {
      setBusyWalletName(null);
    }
  }

  async function onDisconnect(): Promise<void> {
    await dAppKit.disconnectWallet();
    setOpen(false);
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant={connection.isConnected ? "secondary" : "primary"} onPress={() => setOpen(true)}>
          {connection.isConnected ? `Connected ${shortAddress}` : "Connect Wallet"}
        </Button>
        {connection.isConnected && (
          <Button variant="secondary" onPress={() => void onDisconnect()}>
            Disconnect
          </Button>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4">
          <Card
            variant="secondary"
            className="panel-card w-full max-w-lg border border-white/15 shadow-[0_24px_80px_rgba(4,12,26,0.55)]"
          >
            <Card.Content className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-base font-semibold text-slate-100">Connect Wallet</p>
                  <p className="text-xs text-slate-400">Selecting a wallet will trigger the browser wallet signature flow.</p>
                </div>
                <Button variant="secondary" onPress={() => setOpen(false)}>
                  Close
                </Button>
              </div>

              {wallets.length === 0 && (
                <p className="text-sm text-amber-200">
                  No wallets detected. Please install a Sui wallet extension (e.g. Slush Wallet).
                </p>
              )}

              {wallets.length > 0 && (
                <div className="space-y-2">
                  {wallets.map((wallet) => {
                    const connected = connection.wallet?.name === wallet.name;
                    const busy = busyWalletName === wallet.name;
                    return (
                      <button
                        key={wallet.name}
                        type="button"
                        className="flex w-full items-center justify-between rounded-xl border border-white/15 bg-white/[0.03] px-3 py-2 text-left transition hover:border-emerald-300/40 hover:bg-emerald-500/10 disabled:opacity-50"
                        onClick={() => void onConnect(wallet.name)}
                        disabled={Boolean(busyWalletName)}
                      >
                        <span className="text-sm text-slate-100">{wallet.name}</span>
                        <span className="text-xs text-slate-400">
                          {busy
                            ? "Connecting..."
                            : connected
                              ? "Connected"
                              : wallet.accounts.length > 0
                                ? `Authorized ${wallet.accounts.length} accounts`
                                : "Unauthorized"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </Card.Content>
          </Card>
        </div>
      )}
    </>
  );
}
