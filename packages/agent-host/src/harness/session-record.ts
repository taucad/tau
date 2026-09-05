import type { AgentMessage } from '@earendil-works/pi-agent-core';
import type { Api, AssistantMessage, AssistantMessageDiagnostic, Model, StopReason } from '@earendil-works/pi-ai';
import { util as zodUtil } from 'zod';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type { DurableEventLog, HostRunFailure } from '#waist/ports.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { reduceEventLog } from '#log/reducer.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type {
  AgentLogEvent,
  AssistantProviderMessage,
  JsonValue,
  LogEventBase,
  ProviderMessage,
  ProviderMessageMetadata,
  ToolInputProviderMessage,
} from '#log/event-types.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { normalizeToolInput, toPiToolContent } from '#harness/tools.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type { HostToolExecutionDetails } from '#harness/tools.js';

type WithoutBase<Event> = Event extends LogEventBase ? Omit<Event, keyof LogEventBase> : never;

const transportFailureDiagnosticType = 'tau.model-transport-failure';
const providerMetadataDiagnosticType = 'tau.provider-message-metadata';
const liveMessageIdentityDiagnosticType = 'tau.live-message-identity';

/** Convert a coded transport exception into pi's durable diagnostic shape. @internal */
export const createTransportFailureDiagnostic = (
  error: unknown,
  timestamp: number,
): AssistantMessageDiagnostic | undefined => {
  if (!zodUtil.isObject(error) || typeof error['code'] !== 'string') {
    return undefined;
  }
  const message =
    error instanceof Error ? error.message : typeof error['message'] === 'string' ? error['message'] : error['code'];
  const status = typeof error['status'] === 'number' && Number.isFinite(error['status']) ? error['status'] : undefined;
  return {
    type: transportFailureDiagnosticType,
    timestamp,
    error: {
      name: error instanceof Error ? error.name : 'ModelTransportError',
      message,
      code: error['code'],
    },
    ...(status === undefined ? {} : { details: { status } }),
  };
};

/** Carry opaque provider metadata through pi's assistant-message copies. @internal */
export const createProviderMetadataDiagnostic = (
  metadata: ProviderMessageMetadata,
  timestamp: number,
): AssistantMessageDiagnostic => ({
  type: providerMetadataDiagnosticType,
  timestamp,
  details: { metadata },
});

/** Carry the live stream id through pi's immutable message copies without persisting the marker. @internal */
export const createLiveMessageIdentityDiagnostic = (
  messageId: string,
  timestamp: number,
): AssistantMessageDiagnostic => ({
  type: liveMessageIdentityDiagnosticType,
  timestamp,
  details: { messageId },
});

const liveMessageIdFromDiagnostics = (
  diagnostics: readonly AssistantMessageDiagnostic[] | undefined,
): string | undefined => {
  const value = diagnostics?.findLast((diagnostic) => diagnostic.type === liveMessageIdentityDiagnosticType)?.details?.[
    'messageId'
  ];
  return typeof value === 'string' ? value : undefined;
};

const providerMetadataFromDiagnostics = (
  diagnostics: readonly AssistantMessageDiagnostic[] | undefined,
): ProviderMessageMetadata | undefined => {
  const value = diagnostics?.findLast((diagnostic) => diagnostic.type === providerMetadataDiagnosticType)?.details?.[
    'metadata'
  ];
  return zodUtil.isObject(value) ? (value as ProviderMessageMetadata) : undefined;
};

/** Recover a typed transport refusal from durable provider history. @internal */
export const transportFailureFromProviderMessages = (
  messages: readonly ProviderMessage[],
): HostRunFailure | undefined => {
  for (const message of messages.toReversed()) {
    if (message.role !== 'assistant' || !Array.isArray(message.metadata?.['diagnostics'])) {
      continue;
    }
    for (const candidate of message.metadata['diagnostics'].toReversed()) {
      if (!zodUtil.isObject(candidate) || candidate['type'] !== transportFailureDiagnosticType) {
        continue;
      }
      const error = zodUtil.isObject(candidate['error']) ? candidate['error'] : undefined;
      if (!error || typeof error['code'] !== 'string' || typeof error['message'] !== 'string') {
        continue;
      }
      const details = zodUtil.isObject(candidate['details']) ? candidate['details'] : undefined;
      const status = details && typeof details['status'] === 'number' ? details['status'] : undefined;
      return {
        code: error['code'],
        message: error['message'],
        ...(status === undefined ? {} : { status }),
      };
    }
  }
  return undefined;
};

/** Event body completed with cursor metadata by the active session record. @public */
export type SessionLogEvent = WithoutBase<AgentLogEvent>;

/** A1-backed record used by the pi session adapter. @public */
export type SessionRecord = {
  readonly messages: MessageIdentities;
  append(event: SessionLogEvent): Promise<void>;
  events(): Promise<readonly AgentLogEvent[]>;
  history(): Promise<readonly ProviderMessage[]>;
};

/** Stable provider-message identities for pi messages, which do not carry ids. @public */
export class MessageIdentities {
  readonly #ids = new WeakMap<AgentMessage, string>();
  readonly #metadata = new WeakMap<AgentMessage, ProviderMessageMetadata>();
  readonly #createId: () => string;

  public constructor(createId: () => string) {
    this.#createId = createId;
  }

  public get(message: AgentMessage): string | undefined {
    return this.#ids.get(message);
  }

  public id(message: AgentMessage): string {
    const current = this.#ids.get(message);
    if (current) {
      return current;
    }
    const created = this.#createId();
    this.#ids.set(message, created);
    return created;
  }

  public metadata(message: AgentMessage): ProviderMessageMetadata | undefined {
    return this.#metadata.get(message);
  }

  public set(message: AgentMessage, id: string, metadata?: ProviderMessageMetadata): void {
    this.#ids.set(message, id);
    if (metadata) {
      this.#metadata.set(message, metadata);
    }
  }

  public transfer(from: AgentMessage, to: AgentMessage): void {
    const id = this.#ids.get(from);
    if (id) {
      this.#ids.set(to, id);
    }
    const metadata = this.#metadata.get(from);
    if (metadata) {
      this.#metadata.set(to, metadata);
    }
  }
}

/** Generate an opaque id with browser-safe Web Crypto available on non-secure origins. @public */
export const createPortableId = (): string =>
  Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );

/** Strip `undefined` and prototypes at the durable JSON trust boundary. @public */
export const toJsonValue = (value: unknown): JsonValue => {
  // oxlint-disable-next-line unicorn/prefer-structured-clone -- JSON serialization validates the durable wire format and strips prototypes.
  const parsed: unknown = JSON.parse(JSON.stringify({ value }));
  if (typeof parsed !== 'object' || parsed === null || !Object.hasOwn(parsed, 'value')) {
    throw new TypeError('Agent session values must be JSON serializable.');
  }
  return (parsed as { readonly value: JsonValue }).value;
};

type CreateSessionRecordOptions = {
  readonly log: DurableEventLog;
  readonly runId: string;
  readonly leaderEpoch: string;
  readonly createId?: (() => string) | undefined;
  readonly now?: (() => string) | undefined;
};

/** Adapt pi's append-oriented session shape directly onto the PH19 event log. @public */
export const createSessionRecord = async (options: CreateSessionRecordOptions): Promise<SessionRecord> => {
  const existing = await options.log.read();
  const last = existing.at(-1);
  let sequence = last?.leaderEpoch === options.leaderEpoch ? last.sequence + 1 : 0;
  const messages = new MessageIdentities(options.createId ?? createPortableId);
  const now = options.now ?? (() => new Date().toISOString());
  let pending: Promise<void> = Promise.resolve();

  const append = async (body: SessionLogEvent): Promise<void> => {
    const prior = pending;
    const next = Promise.withResolvers<void>();
    pending = next.promise;
    await prior;
    try {
      const event: AgentLogEvent = {
        ...body,
        version: 1,
        leaderEpoch: options.leaderEpoch,
        sequence,
        recordedAt: now(),
        runId: options.runId,
      };
      const outcome = await options.log.append(event);
      if (outcome.appended) {
        sequence++;
      }
    } finally {
      next.resolve();
    }
  };

  return {
    messages,
    append,
    events: async () => {
      await pending;
      return options.log.read();
    },
    history: async () => {
      await pending;
      return reduceEventLog(await options.log.read());
    },
  };
};

const metadataNumber = (message: ProviderMessage, key: string, fallback = 0): number => {
  const value = message.metadata?.[key];
  return typeof value === 'number' ? value : fallback;
};

/** Convert one pi message to the provider-native A1 log envelope. @public */
export const piMessageToProvider = (message: AgentMessage, identities: MessageIdentities): ProviderMessage => {
  const id =
    message.role === 'assistant'
      ? (liveMessageIdFromDiagnostics(message.diagnostics) ?? identities.id(message))
      : identities.id(message);
  if (message.role === 'user') {
    return {
      id,
      role: 'user',
      content: toJsonValue(message.content),
      metadata: { ...identities.metadata(message), timestamp: message.timestamp },
    };
  }
  if (message.role === 'assistant') {
    const content = message.content.map((block) =>
      block.type === 'toolCall'
        ? { ...block, arguments: normalizeToolInput(block.name, block.arguments) as typeof block.arguments }
        : block,
    );
    const diagnostics = message.diagnostics?.filter(
      (diagnostic) =>
        diagnostic.type !== providerMetadataDiagnosticType && diagnostic.type !== liveMessageIdentityDiagnosticType,
    );
    return {
      id,
      role: 'assistant',
      content: toJsonValue(content),
      metadata: toJsonValue({
        ...providerMetadataFromDiagnostics(message.diagnostics),
        ...identities.metadata(message),
        api: message.api,
        provider: message.provider,
        model: message.model,
        responseModel: message.responseModel,
        responseId: message.responseId,
        diagnostics: diagnostics?.length ? diagnostics : undefined,
        usage: message.usage,
        stopReason: message.stopReason,
        errorMessage: message.errorMessage,
        timestamp: message.timestamp,
      }) as AssistantProviderMessage['metadata'],
    };
  }
  if (message.role !== 'toolResult') {
    throw new TypeError(`Unsupported pi session message role: ${String(message.role)}`);
  }
  const details = message.details as HostToolExecutionDetails | undefined;
  return {
    id,
    role: 'tool-output',
    toolCallId: message.toolCallId,
    toolName: message.toolName,
    content: toJsonValue(details?.content ?? message.content),
    isError: message.isError,
    metadata: {
      timestamp: message.timestamp,
      ...(details ? { substituted: details.substituted } : {}),
    },
  };
};

/** Build the explicit tool-input row that pi otherwise keeps in an assistant block. @public */
export const toolInputToProvider = (options: {
  readonly id: string;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly input: unknown;
}): ToolInputProviderMessage => ({
  id: options.id,
  role: 'tool-input',
  toolCallId: options.toolCallId,
  toolName: options.toolName,
  content: toJsonValue(options.input),
});

/** Rehydrate pi's linear context from the A1 reducer projection. @public */
export function providerMessageToPi(
  message: ToolInputProviderMessage,
  model: Model<Api>,
  identities: MessageIdentities,
): undefined;
export function providerMessageToPi(
  message: Exclude<ProviderMessage, ToolInputProviderMessage>,
  model: Model<Api>,
  identities: MessageIdentities,
): AgentMessage;
export function providerMessageToPi(
  message: ProviderMessage,
  model: Model<Api>,
  identities: MessageIdentities,
): AgentMessage | undefined;
export function providerMessageToPi(
  message: ProviderMessage,
  model: Model<Api>,
  identities: MessageIdentities,
): AgentMessage | undefined {
  if (message.role === 'tool-input') {
    return undefined;
  }
  if (message.role === 'user') {
    const hydrated: AgentMessage = {
      role: 'user',
      content: typeof message.content === 'string' ? message.content : toPiToolContent(message.content),
      timestamp: metadataNumber(message, 'timestamp'),
    };
    identities.set(hydrated, message.id, message.metadata);
    return hydrated;
  }
  if (message.role === 'assistant') {
    const metadata = message.metadata ?? {};
    const hydrated: AssistantMessage = {
      role: 'assistant',
      content: message.content as unknown as AssistantMessage['content'],
      api: typeof metadata['api'] === 'string' ? (metadata['api'] as Api) : model.api,
      provider: typeof metadata['provider'] === 'string' ? metadata['provider'] : model.provider,
      model: typeof metadata['model'] === 'string' ? metadata['model'] : model.id,
      ...(typeof metadata['responseModel'] === 'string' ? { responseModel: metadata['responseModel'] } : {}),
      ...(typeof metadata['responseId'] === 'string' ? { responseId: metadata['responseId'] } : {}),
      ...(Array.isArray(metadata['diagnostics'])
        ? { diagnostics: metadata['diagnostics'] as AssistantMessage['diagnostics'] }
        : {}),
      usage: isUsage(metadata['usage']) ? metadata['usage'] : zeroUsage,
      stopReason: (metadata['stopReason'] as StopReason | undefined) ?? 'stop',
      ...(typeof metadata['errorMessage'] === 'string' ? { errorMessage: metadata['errorMessage'] } : {}),
      timestamp: metadataNumber(message, 'timestamp'),
    };
    identities.set(hydrated, message.id, message.metadata);
    return hydrated;
  }
  const hydrated: AgentMessage = {
    role: 'toolResult',
    toolCallId: message.toolCallId,
    toolName: message.toolName,
    content: toPiToolContent(message.content),
    details: {
      content: message.content,
      isError: message.isError,
      substituted: message.metadata?.['substituted'] === true,
    },
    isError: message.isError,
    timestamp: metadataNumber(message, 'timestamp'),
  };
  identities.set(hydrated, message.id, message.metadata);
  return hydrated;
}

const zeroUsage: AssistantMessage['usage'] = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

const isUsage = (value: unknown): value is AssistantMessage['usage'] =>
  typeof value === 'object' && value !== null && 'input' in value && 'output' in value && 'cost' in value;
