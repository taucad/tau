import type { AgentMessage } from '@earendil-works/pi-agent-core';
import type { Api, AssistantMessage, AssistantMessageDiagnostic, Model } from '@earendil-works/pi-ai';
import { uint8ArrayToBase64 } from 'uint8array-extras';
import { util as zodUtility } from 'zod';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type { DurableEventLog, HostRunFailure, MaterializedDocument } from '#waist/ports.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { reduceEventLog } from '#log/reducer.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { attachmentPathPattern, fileRefBlockSchema } from '#log/event-schema.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type {
  AgentLogEvent,
  AssistantProviderMessage,
  FileRefContentBlock,
  JsonValue,
  LogEventBase,
  ProviderMessage,
  ProviderMessageMetadata,
  ToolInputProviderMessage,
} from '#log/event-types.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { normalizeToolInput, tauToolKinds, toPiToolContent } from '#harness/tools.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type { HostToolExecutionDetails } from '#harness/tools.js';

type WithoutBase<Event> = Event extends LogEventBase ? Omit<Event, keyof LogEventBase> : never;

/**
 * Tau's own facts about one of its dispatched calls, in the shared vocabulary.
 *
 * N11: the same `call` field an external agent's row carries, so one client
 * projection renders both. Tau is the emitter, so the emitter's call id is
 * Tau's own; the native name is the tool's name, and there is no agent-authored
 * title to record.
 *
 * @param toolCallId - Tau's dispatch id for the call.
 * @param toolName - The tool's canonical name.
 * @returns The `call` projection, or `undefined` for a tool with no known kind.
 */
const tauCallFacts = (toolCallId: string, toolName: string): ToolInputProviderMessage['call'] => {
  const kind = tauToolKinds.get(toolName);
  return kind === undefined ? undefined : { toolCallId, kind, nativeName: toolName };
};

const transportFailureDiagnosticType = 'tau.model-transport-failure';
const providerMetadataDiagnosticType = 'tau.provider-message-metadata';
const liveMessageIdentityDiagnosticType = 'tau.live-message-identity';

/** Convert a coded transport exception into pi's durable diagnostic shape. @internal */
export const createTransportFailureDiagnostic = (
  error: unknown,
  timestamp: number,
): AssistantMessageDiagnostic | undefined => {
  if (!zodUtility.isObject(error) || typeof error['code'] !== 'string') {
    return undefined;
  }
  const message =
    error instanceof Error ? error.message : typeof error['message'] === 'string' ? error['message'] : error['code'];
  const status = typeof error['status'] === 'number' && Number.isFinite(error['status']) ? error['status'] : undefined;
  const refusal = zodUtility.isObject(error['details']) ? error['details'] : undefined;
  const details = { ...(status === undefined ? {} : { status }), ...(refusal === undefined ? {} : { refusal }) };
  return {
    type: transportFailureDiagnosticType,
    timestamp,
    error: {
      name: error instanceof Error ? error.name : 'ModelTransportError',
      message,
      code: error['code'],
    },
    ...(Object.keys(details).length === 0 ? {} : { details }),
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
  return zodUtility.isObject(value) ? (value as ProviderMessageMetadata) : undefined;
};

/** Recover a typed transport refusal from durable provider history. @internal */
export const transportFailureFromProviderMessages = (
  messages: readonly ProviderMessage[],
): HostRunFailure | undefined => {
  for (const message of messages.toReversed()) {
    if (message.role !== 'assistant' || !Array.isArray(message.metadata?.diagnostics)) {
      continue;
    }
    for (const candidate of message.metadata.diagnostics.toReversed()) {
      if (!zodUtility.isObject(candidate) || candidate['type'] !== transportFailureDiagnosticType) {
        continue;
      }
      const error = zodUtility.isObject(candidate['error']) ? candidate['error'] : undefined;
      if (!error || typeof error['code'] !== 'string' || typeof error['message'] !== 'string') {
        continue;
      }
      const details = zodUtility.isObject(candidate['details']) ? candidate['details'] : undefined;
      const status = details && typeof details['status'] === 'number' ? details['status'] : undefined;
      const refusal = details && zodUtility.isObject(details['refusal']) ? details['refusal'] : undefined;
      return {
        code: error['code'],
        message: error['message'],
        ...(status === undefined ? {} : { status }),
        ...(refusal === undefined ? {} : { details: refusal }),
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

/**
 * Reads a chat's attachment bytes for materialisation (D15).
 *
 * @public
 */
export type AttachmentReader = {
  /**
   * Read one attachment of one chat.
   *
   * @param chatId - The chat whose `.tau/chats/<chatId>` directory owns the reference.
   * @param path - The durable `file-ref` path, `attachments/<sha256>.<ext>`.
   * @returns The bytes, or `undefined` when they have not arrived on this device.
   */
  read(chatId: string, path: string): Promise<Uint8Array<ArrayBuffer> | undefined>;
};

/**
 * The project-root-relative path of one chat attachment.
 *
 * Readers are public, so the segments are checked here rather than trusted: a
 * chat id is one directory name, and the path must be exactly the shape a
 * durable `file-ref` may carry.
 *
 * @param chatId - The owning chat.
 * @param path - The durable `file-ref` path.
 * @returns `.tau/chats/<chatId>/attachments/<sha256>.<ext>`.
 * @internal
 */
export const chatAttachmentPath = (chatId: string, path: string): string => {
  if (!chatId || chatId === '.' || chatId === '..' || /[/\\]/u.test(chatId)) {
    throw Object.assign(new Error('chatId must be one storage path segment.'), { code: 'STORAGE_PATH_INVALID' });
  }
  if (!attachmentPathPattern.test(path)) {
    throw Object.assign(new Error(`"${path}" is not an attachment path.`), { code: 'STORAGE_PATH_INVALID' });
  }
  return `.tau/chats/${chatId}/${path}`;
};

/**
 * The text a document reference becomes until a transport rewrites it (D15, D21).
 *
 * @param hash - The document's lowercase hex SHA-256, as its attachment path names it.
 * @returns The sentinel, which must never reach a provider.
 * @internal
 */
export const documentSentinel = (hash: string): string => `⟃tau:document:${hash}⟄`;

/**
 * The text a user message is left with when every attachment it held was
 * omitted, so the turn still reaches the model instead of vanishing (F10).
 *
 * @internal
 */
export const absentAttachmentMarker = '[attachment not available on this device]';

/**
 * Builds the transient block — or blocks — a document reference becomes.
 *
 * An array is carried through flattened, so one document may reach the agent by
 * more than one carrier at once (a link it can open *and* the bytes themselves).
 * A block is always an object, so a returned array is never mistaken for one.
 * Annotate a multi-block builder's return as `readonly JsonValue[]`: an
 * unannotated heterogeneous array literal normalises to `prop?: undefined`
 * members, which no index signature of `JsonValue` accepts.
 *
 * @public
 */
export type DocumentBlockBuilder = (
  hash: string,
  document: MaterializedDocument,
  reference: FileRefContentBlock,
) => JsonValue | readonly JsonValue[];

/** The transient result of {@link materializeAttachments}. @public */
export type MaterializedAttachments = {
  /** The input messages with every reference replaced; unchanged messages keep their identity. */
  readonly messages: ProviderMessage[];
  /** Each document read, keyed by its SHA-256 (the side table). */
  readonly documents: Map<string, MaterializedDocument>;
  /** The paths of references whose bytes were absent or could not be read; each was omitted. */
  readonly absent: string[];
  /** How many reference rows were malformed; each was omitted. */
  readonly malformed: number;
};

const hashOf = (path: string): string => path.slice('attachments/'.length, path.lastIndexOf('.'));

const isFileRef = (block: unknown): boolean => zodUtility.isObject(block) && block['type'] === 'file-ref';

/**
 * Whether a builder returned several blocks rather than one.
 *
 * `Array.isArray` alone widens a readonly array to `any[]`, so the predicate is
 * written out. A content block is always an object, never an array.
 *
 * @param built - What {@link DocumentBlockBuilder} returned.
 * @returns `true` when the blocks must be flattened into the message.
 */
const isBlockList = (built: JsonValue | readonly JsonValue[]): built is readonly JsonValue[] => Array.isArray(built);

/**
 * Replace every attachment reference in user messages with the bytes a model reads (D15).
 *
 * Returns a transient copy: the input messages — the durable rows — are never
 * mutated. An image becomes an inline `image` block. A document becomes the
 * block `buildDocument` returns — by default a text block holding its
 * {@link documentSentinel} — and an entry in the side table. A reference whose
 * bytes are absent or unreadable is omitted and reported in `absent`, and a
 * malformed reference row is omitted and counted in `malformed`; it never
 * throws (D19). A user message left with no content keeps
 * {@link absentAttachmentMarker}, because every provider codec drops an empty
 * message and the user's turn would vanish with it.
 *
 * @param messages - Durable provider history.
 * @param read - Reads one attachment path of the owning chat.
 * @param buildDocument - The block a document becomes; defaults to the sentinel text block.
 * @returns The materialised copy, the side table and the omitted references.
 * @public
 */
export const materializeAttachments = async (
  messages: readonly ProviderMessage[],
  read: (path: string) => Promise<Uint8Array<ArrayBuffer> | undefined>,
  buildDocument: DocumentBlockBuilder = (hash) => ({ type: 'text', text: documentSentinel(hash) }),
): Promise<MaterializedAttachments> => {
  const documents = new Map<string, MaterializedDocument>();
  const absent: string[] = [];
  let malformed = 0;
  const readOrAbsent = async (path: string): Promise<Uint8Array<ArrayBuffer> | undefined> => {
    try {
      return await read(path);
    } catch {
      // An unreadable file (EACCES, EIO) is, to this turn, a file that is not here.
      return undefined;
    }
  };
  const materializeBlock = async (block: JsonValue): Promise<JsonValue[]> => {
    if (!isFileRef(block)) {
      return [block];
    }
    const parsed = fileRefBlockSchema.safeParse(block);
    if (!parsed.success) {
      malformed += 1;
      return [];
    }
    const reference = parsed.data;
    const bytes = await readOrAbsent(reference.path);
    if (bytes === undefined) {
      absent.push(reference.path);
      return [];
    }
    const data = uint8ArrayToBase64(bytes);
    if (reference.mimeType.startsWith('image/')) {
      return [{ type: 'image', mimeType: reference.mimeType, data }];
    }
    const hash = hashOf(reference.path);
    const document: MaterializedDocument = {
      data,
      mediaType: reference.mimeType,
      ...(reference.filename === undefined ? {} : { filename: reference.filename }),
    };
    documents.set(hash, document);
    const built = buildDocument(hash, document, reference);
    return isBlockList(built) ? [...built] : [built];
  };
  const materialized = await Promise.all(
    messages.map(async (message): Promise<ProviderMessage> => {
      if (message.role !== 'user' || !Array.isArray(message.content) || !message.content.some(isFileRef)) {
        return message;
      }
      const blocks = await Promise.all(message.content.map(materializeBlock));
      const content = blocks.flat();
      return { ...message, content: content.length === 0 ? [{ type: 'text', text: absentAttachmentMarker }] : content };
    }),
  );
  return { messages: materialized, documents, absent, malformed };
};

/**
 * Whether a message still carries an unresolved attachment reference.
 *
 * @param message - A provider message.
 * @returns `true` when any content block is a `file-ref`.
 * @internal
 */
export const hasFileRef = (message: ProviderMessage): boolean =>
  Array.isArray(message.content) && message.content.some(isFileRef);

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
  const call = tauCallFacts(message.toolCallId, message.toolName);
  return {
    id,
    role: 'tool-output',
    toolCallId: message.toolCallId,
    toolName: message.toolName,
    content: toJsonValue(details?.content ?? message.content),
    isError: message.isError,
    ...(call ? { call: { ...call, status: message.isError ? 'failed' : 'completed' } } : {}),
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
}): ToolInputProviderMessage => {
  const call = tauCallFacts(options.toolCallId, options.toolName);
  return {
    id: options.id,
    role: 'tool-input',
    toolCallId: options.toolCallId,
    toolName: options.toolName,
    content: toJsonValue(options.input),
    ...(call ? { call } : {}),
  };
};

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
    const api =
      metadata.provider === 'anthropic' && metadata.api === 'openai-completions' && model.provider === 'anthropic'
        ? model.api
        : typeof metadata.api === 'string'
          ? (metadata.api as Api)
          : model.api;
    const hydrated: AssistantMessage = {
      role: 'assistant',
      content: message.content as unknown as AssistantMessage['content'],
      api,
      provider: typeof metadata.provider === 'string' ? metadata.provider : model.provider,
      model: typeof metadata.model === 'string' ? metadata.model : model.id,
      ...(typeof metadata.responseModel === 'string' ? { responseModel: metadata.responseModel } : {}),
      ...(typeof metadata.responseId === 'string' ? { responseId: metadata.responseId } : {}),
      ...(Array.isArray(metadata.diagnostics)
        ? { diagnostics: metadata.diagnostics as AssistantMessage['diagnostics'] }
        : {}),
      usage: isUsage(metadata.usage) ? metadata.usage : zeroUsage,
      stopReason: metadata.stopReason ?? 'stop',
      ...(typeof metadata.errorMessage === 'string' ? { errorMessage: metadata.errorMessage } : {}),
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
      substituted: message.metadata?.substituted === true,
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
