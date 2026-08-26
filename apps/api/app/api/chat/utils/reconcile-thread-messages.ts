import { RemoveMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { isTauInternalKind, isTauInternalMessage } from '#api/chat/utils/tau-internal-message.js';

export type LangGraphRunnableConfig = {
  [key: string]: unknown;
  configurable?: Record<string, unknown>;
};

export type GraphStateSnapshot = {
  values?: {
    [key: string]: unknown;
    messages?: unknown;
  };
};

export type ChatGraphStateApi = {
  getState(config: LangGraphRunnableConfig): Promise<GraphStateSnapshot>;
  updateState(
    config: LangGraphRunnableConfig,
    values: Record<string, unknown>,
    asNode?: string,
  ): Promise<LangGraphRunnableConfig>;
};

export type ReconcileThreadMessagesInput = {
  readonly graph: ChatGraphStateApi;
  readonly runnableConfig: LangGraphRunnableConfig;
  readonly clientMessages: readonly BaseMessage[];
};

export type ReconciledThreadMessages = {
  readonly graphStateMessages: readonly BaseMessage[];
  readonly clientMessages: readonly BaseMessage[];
  readonly commonVisiblePrefixLength: number;
  readonly clientVisiblePrefixLength: number;
  readonly removedMessageIds: readonly string[];
  readonly runnableConfig: LangGraphRunnableConfig;
  readonly streamInputMessages: readonly BaseMessage[];
};

const updateStateAsNodeCandidates = [undefined, '__start__', 'agent', 'model'] as const;
const invalidToolCallsKey = 'invalid_tool_calls';
const toolCallIdKey = 'tool_call_id';
const toolCallsKey = 'tool_calls';

export async function reconcileThreadMessages(input: ReconcileThreadMessagesInput): Promise<ReconciledThreadMessages> {
  const snapshot = await input.graph.getState(input.runnableConfig);
  const graphStateMessages = extractBaseMessages(snapshot.values?.messages);
  const graphVisibleMessages = toVisibleProjection(graphStateMessages);
  const clientVisibleMessages = toVisibleProjection(input.clientMessages);
  const hasCompactionArtifact = graphStateMessages.some((message) => isTauInternalKind(message, 'compaction-summary'));
  const alignment = findBestVisibleAlignment({
    allowCompactedClientPrefix: hasCompactionArtifact,
    clientVisibleMessages,
    graphVisibleMessages,
  });
  const { clientVisiblePrefixLength, commonVisiblePrefixLength, graphVisiblePrefixLength } = alignment;
  const messagesToRemove =
    hasCompactionArtifact && commonVisiblePrefixLength === 0
      ? graphStateMessages
      : graphVisibleMessages.slice(graphVisiblePrefixLength);
  const removedMessageIds = messagesToRemove
    .map((message) => messageId(message))
    .filter((id): id is string => id !== undefined);

  const { runnableConfig: inputRunnableConfig } = input;
  let runnableConfig = inputRunnableConfig;
  if (removedMessageIds.length > 0) {
    runnableConfig = await updateGraphState(input.graph, inputRunnableConfig, {
      messages: removedMessageIds.map((id) => new RemoveMessage({ id })),
    });
  }

  return {
    graphStateMessages,
    clientMessages: input.clientMessages,
    commonVisiblePrefixLength,
    clientVisiblePrefixLength,
    removedMessageIds,
    runnableConfig,
    streamInputMessages: clientVisibleMessages.slice(clientVisiblePrefixLength),
  };
}

export function toVisibleProjection(messages: readonly BaseMessage[]): BaseMessage[] {
  return messages.filter((message) => !isTauInternalMessage(message));
}

export function findCommonVisiblePrefix(
  graphVisibleMessages: readonly BaseMessage[],
  clientVisibleMessages: readonly BaseMessage[],
): number {
  const max = Math.min(graphVisibleMessages.length, clientVisibleMessages.length);
  for (let index = 0; index < max; index += 1) {
    if (!sameVisibleMessage(graphVisibleMessages[index]!, clientVisibleMessages[index]!)) {
      return index;
    }
  }
  return max;
}

export type VisibleAlignment = {
  readonly clientVisibleStartIndex: number;
  readonly commonVisiblePrefixLength: number;
  readonly graphVisiblePrefixLength: number;
  readonly clientVisiblePrefixLength: number;
};

export function findBestVisibleAlignment(input: {
  readonly graphVisibleMessages: readonly BaseMessage[];
  readonly clientVisibleMessages: readonly BaseMessage[];
  readonly allowCompactedClientPrefix: boolean;
}): VisibleAlignment {
  const directPrefixLength = findCommonVisiblePrefix(input.graphVisibleMessages, input.clientVisibleMessages);
  if (directPrefixLength > 0 || !input.allowCompactedClientPrefix) {
    return toVisibleAlignment(0, directPrefixLength);
  }

  let best = toVisibleAlignment(0, directPrefixLength);
  for (
    let clientVisibleStartIndex = 1;
    clientVisibleStartIndex < input.clientVisibleMessages.length;
    clientVisibleStartIndex += 1
  ) {
    const commonVisiblePrefixLength = findCommonVisiblePrefix(
      input.graphVisibleMessages,
      input.clientVisibleMessages.slice(clientVisibleStartIndex),
    );
    if (commonVisiblePrefixLength > best.commonVisiblePrefixLength) {
      best = toVisibleAlignment(clientVisibleStartIndex, commonVisiblePrefixLength);
    }
  }

  return best;
}

function toVisibleAlignment(clientVisibleStartIndex: number, commonVisiblePrefixLength: number): VisibleAlignment {
  return {
    clientVisibleStartIndex,
    commonVisiblePrefixLength,
    graphVisiblePrefixLength: commonVisiblePrefixLength,
    clientVisiblePrefixLength: clientVisibleStartIndex + commonVisiblePrefixLength,
  };
}

export function sameVisibleMessage(left: BaseMessage, right: BaseMessage): boolean {
  const leftId = messageId(left);
  const rightId = messageId(right);
  return (
    leftId !== undefined && leftId === rightId && fingerprintVisibleMessage(left) === fingerprintVisibleMessage(right)
  );
}

export function fingerprintVisibleMessage(message: BaseMessage): string {
  return stableStringify({
    content: normalizeJson(message.content),
    id: messageId(message),
    [invalidToolCallsKey]: normalizeJson(messageExtra(message, invalidToolCallsKey)),
    name: messageExtra(message, 'name'),
    status: messageExtra(message, 'status'),
    [toolCallIdKey]: messageExtra(message, toolCallIdKey),
    [toolCallsKey]: normalizeJson(messageExtra(message, toolCallsKey)),
    type: messageType(message),
  });
}

export function messageId(message: BaseMessage): string | undefined {
  const record = message as { id?: unknown; kwargs?: { id?: unknown }; lc_kwargs?: { id?: unknown } };
  const id = record.id ?? record.kwargs?.id ?? record.lc_kwargs?.id;
  return typeof id === 'string' ? id : undefined;
}

function extractBaseMessages(value: unknown): BaseMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item) => isBaseMessageLike(item));
}

function isBaseMessageLike(value: unknown): value is BaseMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'content' in value &&
    ('id' in value || 'lc_kwargs' in value || 'kwargs' in value || '_getType' in value || 'getType' in value)
  );
}

async function updateGraphState(
  graph: ChatGraphStateApi,
  runnableConfig: LangGraphRunnableConfig,
  values: Record<string, unknown>,
): Promise<LangGraphRunnableConfig> {
  return updateGraphStateWithCandidate({
    asNodeIndex: 0,
    graph,
    runnableConfig,
    values,
  });
}

async function updateGraphStateWithCandidate(input: {
  readonly asNodeIndex: number;
  readonly graph: ChatGraphStateApi;
  readonly runnableConfig: LangGraphRunnableConfig;
  readonly values: Record<string, unknown>;
}): Promise<LangGraphRunnableConfig> {
  const asNode = updateStateAsNodeCandidates[input.asNodeIndex];
  try {
    return await input.graph.updateState(input.runnableConfig, input.values, asNode);
  } catch (error) {
    if (!isStateAttributionError(error) || input.asNodeIndex === updateStateAsNodeCandidates.length - 1) {
      throw error;
    }
    return updateGraphStateWithCandidate({
      ...input,
      asNodeIndex: input.asNodeIndex + 1,
    });
  }
}

function isStateAttributionError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return /node|asnode|attribute|infer/i.test(error.message);
}

function messageType(message: BaseMessage): string | undefined {
  const record = message as {
    _getType?: () => string;
    getType?: () => string;
    type?: unknown;
  };
  const type = record._getType?.() ?? record.getType?.() ?? record.type;
  return typeof type === 'string' ? type : undefined;
}

function messageExtra(message: BaseMessage, key: string): unknown {
  const record = message as unknown as Record<string, unknown> & {
    kwargs?: Record<string, unknown>;
    lc_kwargs?: Record<string, unknown>;
  };
  return record[key] ?? record.kwargs?.[key] ?? record.lc_kwargs?.[key];
}

function normalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeJson(item));
  }
  if (!isRecord(value)) {
    return value;
  }
  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    if (key === 'additional_kwargs' || key === 'kwargs' || key === 'lc_kwargs') {
      continue;
    }
    normalized[key] = normalizeJson(value[key]);
  }
  return normalized;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeJson(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
