export type LocalAgentActionType = "OPEN_URL" | "MINT_AND_PAY" | "BURN" | "CLAIM" | "CHECK_TX";

export interface LocalAgentActionPayload {
  invoiceId?: string;
  url?: string;
  amount?: string;
  stableCoinType?: string;
  digest?: string;
}

export interface LocalAgentAction {
  type: LocalAgentActionType;
  payload: LocalAgentActionPayload;
  label?: string;
  disabled?: boolean;
  disabledReason?: string;
}

