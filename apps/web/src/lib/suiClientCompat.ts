import { SuiGraphQLClient } from "@mysten/sui/graphql";

export type SuiNetwork = "mainnet" | "testnet" | "devnet" | "localnet";

const GRAPHQL_ENDPOINTS: Record<SuiNetwork, string> = {
  mainnet: "https://sui-mainnet.mystenlabs.com/graphql",
  testnet: "https://sui-testnet.mystenlabs.com/graphql",
  devnet: "https://sui-devnet.mystenlabs.com/graphql",
  localnet: "http://127.0.0.1:9125/graphql"
};

const DYNAMIC_FIELD_PAGE_LIMIT = 50;

function trimTrailingSlash(input: string): string {
  return input.endsWith("/") ? input.slice(0, -1) : input;
}

function inferNetworkFromUrl(url: string): SuiNetwork {
  const lower = url.toLowerCase();
  if (lower.includes("mainnet")) return "mainnet";
  if (lower.includes("devnet")) return "devnet";
  if (lower.includes("127.0.0.1") || lower.includes("localhost")) return "localnet";
  return "testnet";
}

export function getFullnodeUrl(network: SuiNetwork): string {
  return GRAPHQL_ENDPOINTS[network];
}

export function resolveSuiClientUrl(rawUrl: string | undefined, network: SuiNetwork): string {
  if (!rawUrl) return getFullnodeUrl(network);

  const normalized = trimTrailingSlash(rawUrl);
  const lower = normalized.toLowerCase();

  if (lower.endsWith("/graphql")) return normalized;

  if (lower.includes("fullnode.mainnet.sui.io")) return getFullnodeUrl("mainnet");
  if (lower.includes("fullnode.testnet.sui.io")) return getFullnodeUrl("testnet");
  if (lower.includes("fullnode.devnet.sui.io")) return getFullnodeUrl("devnet");

  if (lower.includes("127.0.0.1") || lower.includes("localhost")) {
    return `${normalized}/graphql`;
  }

  return `${normalized}/graphql`;
}

function toLegacyMoveObjectContent(
  json: Record<string, unknown> | null | undefined
): { dataType: "moveObject"; fields: Record<string, unknown> } | undefined {
  if (!json || typeof json !== "object") return undefined;
  return {
    dataType: "moveObject",
    fields: json
  };
}

function matchesTypeNameKeyBytes(keyBytes: Uint8Array, expected: string): boolean {
  const decoded = new TextDecoder().decode(keyBytes);
  if (decoded.includes(expected)) return true;
  const printable = decoded.replace(/[^\x20-\x7E]/g, "");
  return printable.includes(expected);
}

function readLegacyTypeName(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const value = (input as { value?: unknown }).value;
  if (!value || typeof value !== "object") return undefined;
  const name = (value as { name?: unknown }).name;
  return typeof name === "string" ? name : undefined;
}

export interface LegacyCoinStruct {
  coinObjectId: string;
  balance: string;
}

export interface LegacyCoinsPage {
  data: LegacyCoinStruct[];
  hasNextPage: boolean;
  nextCursor: string | null;
}

export interface LegacySuiObjectResponse {
  data?: {
    objectId?: string;
    type?: string;
    content?: {
      dataType: "moveObject";
      fields: Record<string, unknown>;
    };
  };
}

export interface LegacyOwnedObjectsPage {
  data: LegacySuiObjectResponse[];
  hasNextPage: boolean;
  nextCursor: string | null;
}

export interface LegacyTransactionEventItem {
  id: { txDigest: string; eventSeq: string };
  type: string;
  sender?: string;
}

export interface LegacyObjectChange {
  type: "created";
  objectId: string;
  objectType?: string;
}

export interface LegacyTransactionBlockResponse {
  digest: string;
  effects?: {
    status: {
      status: "success" | "failure";
      error: unknown;
    };
    gasUsed?: {
      computationCost: string;
      storageCost: string;
      storageRebate: string;
      nonRefundableStorageFee: string;
    };
  };
  events?: LegacyTransactionEventItem[];
  objectChanges?: LegacyObjectChange[];
  checkpoint?: string;
  timestampMs?: string;
}

interface LegacyGetOwnedObjectsInput {
  owner: string;
  cursor?: string | null;
  limit?: number;
  options?: {
    showType?: boolean;
    showContent?: boolean;
  };
}

interface LegacyGetObjectInput {
  id: string;
  options?: {
    showType?: boolean;
    showContent?: boolean;
  };
}

interface LegacyGetCoinsInput {
  owner: string;
  coinType: string;
  cursor?: string | null;
  limit?: number;
}

interface LegacyGetDynamicFieldObjectInput {
  parentId: string;
  name: unknown;
}

interface LegacyGetTransactionBlockInput {
  digest: string;
  options?: {
    showEffects?: boolean;
    showEvents?: boolean;
    showObjectChanges?: boolean;
  };
}

interface LegacyQueryEventItem {
  id: {
    txDigest: string;
    eventSeq: string;
  };
  type: string;
  sender?: string;
  timestampMs?: string;
  parsedJson?: Record<string, unknown>;
}

export class SuiClient {
  readonly network: SuiNetwork;
  readonly url: string;

  private readonly client: SuiGraphQLClient;

  constructor(options: { url: string; network?: SuiNetwork }) {
    const inferredNetwork = options.network ?? inferNetworkFromUrl(options.url);
    const resolvedUrl = resolveSuiClientUrl(options.url, inferredNetwork);

    this.network = inferredNetwork;
    this.url = resolvedUrl;
    this.client = new SuiGraphQLClient({
      network: inferredNetwork,
      url: resolvedUrl
    });
  }

  async getBalance(input: { owner: string; coinType: string }): Promise<{ totalBalance: string }> {
    const response = await this.client.getBalance({
      owner: input.owner,
      coinType: input.coinType
    });

    return {
      totalBalance: response.balance.balance
    };
  }

  async getCoins(input: LegacyGetCoinsInput): Promise<LegacyCoinsPage> {
    const response = await this.client.listCoins({
      owner: input.owner,
      coinType: input.coinType,
      cursor: input.cursor ?? null,
      limit: input.limit
    });

    return {
      data: response.objects.map((coin) => ({
        coinObjectId: coin.objectId,
        balance: coin.balance
      })),
      hasNextPage: response.hasNextPage,
      nextCursor: response.cursor
    };
  }

  async getOwnedObjects(input: LegacyGetOwnedObjectsInput): Promise<LegacyOwnedObjectsPage> {
    const includeJson = input.options?.showContent === true;
    const response = await this.client.listOwnedObjects({
      owner: input.owner,
      cursor: input.cursor ?? null,
      limit: input.limit,
      include: { json: includeJson }
    });

    return {
      data: response.objects.map((obj) => ({
        data: {
          objectId: obj.objectId,
          type: obj.type,
          content: includeJson ? toLegacyMoveObjectContent(obj.json) : undefined
        }
      })),
      hasNextPage: response.hasNextPage,
      nextCursor: response.cursor
    };
  }

  async getObject(input: LegacyGetObjectInput): Promise<LegacySuiObjectResponse> {
    const includeJson = input.options?.showContent === true;
    const response = await this.client.getObject({
      objectId: input.id,
      include: { json: includeJson }
    });

    return {
      data: {
        objectId: response.object.objectId,
        type: response.object.type,
        content: includeJson ? toLegacyMoveObjectContent(response.object.json) : undefined
      }
    };
  }

  async getDynamicFieldObject(input: LegacyGetDynamicFieldObjectInput): Promise<LegacySuiObjectResponse> {
    const expectedName = readLegacyTypeName(input.name);
    const expectedType =
      input.name && typeof input.name === "object"
        ? (input.name as { type?: unknown }).type
        : undefined;
    const expectedTypeString = typeof expectedType === "string" ? expectedType : undefined;

    let cursor: string | null = null;
    do {
      const page = await this.client.listDynamicFields({
        parentId: input.parentId,
        cursor,
        limit: DYNAMIC_FIELD_PAGE_LIMIT
      });

      const matched = page.dynamicFields.find((field) => {
        if (expectedTypeString && field.name.type !== expectedTypeString) return false;
        if (!expectedName) return true;
        return matchesTypeNameKeyBytes(field.name.bcs, expectedName);
      });

      if (matched) {
        return this.getObject({
          id: matched.fieldId,
          options: { showType: true, showContent: true }
        });
      }

      cursor = page.hasNextPage ? page.cursor : null;
    } while (cursor);

    throw new Error("Dynamic field object not found for the provided key.");
  }

  async queryEvents(_input?: unknown): Promise<{ data: LegacyQueryEventItem[] }> {
    // GraphQL API has no JSON-RPC-compatible queryEvents surface in this shim yet.
    return { data: [] };
  }

  async getLatestCheckpointSequenceNumber(): Promise<string> {
    try {
      const response = await this.client.query<{ checkpoints?: { nodes?: Array<{ sequenceNumber?: string }> } }>({
        query: "query latestCheckpoint { checkpoints(last: 1) { nodes { sequenceNumber } } }",
        variables: {}
      });
      const seq = response.data?.checkpoints?.nodes?.[0]?.sequenceNumber;
      return typeof seq === "string" ? seq : "0";
    } catch {
      return "0";
    }
  }

  async getTransactionBlock(input: LegacyGetTransactionBlockInput): Promise<LegacyTransactionBlockResponse> {
    const showEffects = input.options?.showEffects === true || input.options?.showObjectChanges === true;
    const showEvents = input.options?.showEvents === true;
    const showObjectChanges = input.options?.showObjectChanges === true;

    const result = await this.client.getTransaction<{
      effects: true;
      events: true;
      objectTypes: true;
    }>({
      digest: input.digest,
      include: {
        effects: true,
        events: true,
        objectTypes: true
      }
    });
    const tx = result.$kind === "Transaction" ? result.Transaction : result.FailedTransaction;

    const objectChanges =
      showObjectChanges && tx.effects
        ? tx.effects.changedObjects
            .filter((change) => change.idOperation === "Created")
            .map((change) => ({
              type: "created" as const,
              objectId: change.objectId,
              objectType: tx.objectTypes?.[change.objectId]
            }))
        : undefined;

    const events = showEvents
      ? tx.events.map((event, index) => ({
          id: { txDigest: tx.digest, eventSeq: String(index) },
          type: event.eventType,
          sender: event.sender || undefined
        }))
      : undefined;

    return {
      digest: tx.digest,
      effects: tx.effects
        ? {
            status: {
              status: tx.status.success ? "success" : "failure",
              error: tx.status.error
            },
            gasUsed: tx.effects.gasUsed
          }
        : undefined,
      events,
      objectChanges,
      checkpoint: undefined,
      timestampMs: undefined
    };
  }
}
