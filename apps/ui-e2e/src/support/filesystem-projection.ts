import type { ProjectionDirectoryReceipt } from '#support/projection-fixture-validation.js';
import {
  decodeProjectionFile,
  encodeProjectionFile,
  iterateProjectionHistory,
} from '#support/filesystem-projection-writer.js';
import { randomUuid } from '@taucad/utils/id';
import { emptyChatLedger, foldChatLedger, parseEventLog, reduceEventLog } from '@taucad/agent-host';
import { seededChatIds } from '#support/chat-attachments.js';
import * as target from '#support/external-target.js';
import { readProjectStorageState, readPhysicalDatabasePrefix } from '#support/project-storage-state.js';
import type { StoredProjectConfig } from '#support/project-storage-state.js';
import type {
  ProjectionClosure,
  ProjectionWriterReceipt,
  ProjectionWriterProject,
  ProjectionWriterHome,
  ProjectionHomeWriterReceipt,
} from '#support/filesystem-projection-writer.js';

/** Bound fixture JSON transfers only; temporary state never supplies filesystem authority. */
const transferProjectionValue = async <Result, Argument>(
  callback: (argument: Argument) => Result | Promise<Result>,
  argument: Argument,
): Promise<Result> => {
  const id = randomUuid();
  const input = JSON.stringify(argument);
  await target.commands.uiEvaluateTarget(
    '(id) => { (globalThis.__tauProjectionTransfers ??= {})[id] = { input: [] }; }',
    id,
  );
  try {
    for (let offset = 0; offset < input.length; offset += 65_536) {
      // oxlint-disable-next-line no-await-in-loop -- Bound every independent fixture transport frame, in order.
      await target.commands.uiEvaluateTarget(
        '({ id, chunk }) => { globalThis.__tauProjectionTransfers[id].input.push(chunk); }',
        { id, chunk: input.slice(offset, offset + 65_536) },
      );
    }
    const length = (await target.commands.uiEvaluateTarget(
      'async ({ id, source }) => { const transfer = globalThis.__tauProjectionTransfers[id]; const argument = JSON.parse(transfer.input.join("")); transfer.input = []; const value = await (globalThis.eval("(" + source + ")"))(argument); transfer.output = JSON.stringify({ value }); return transfer.output.length; }',
      { id, source: callback.toString() },
    )) as number;
    const parts: string[] = [];
    for (let offset = 0; offset < length; offset += 65_536) {
      // oxlint-disable-next-line no-await-in-loop -- Binary arrays/UTF16 text are reassembled exactly before parsing.
      const part = (await target.commands.uiEvaluateTarget(
        '({ id, offset }) => globalThis.__tauProjectionTransfers[id].output.slice(offset, offset + 65536)',
        { id, offset },
      )) as string;
      parts.push(part);
    }
    return (JSON.parse(parts.join('')) as { value: Result }).value;
  } finally {
    await target.commands.uiEvaluateTarget(
      '(id) => { delete globalThis.__tauProjectionTransfers[id]; if (Object.keys(globalThis.__tauProjectionTransfers).length === 0) { delete globalThis.__tauProjectionTransfers; } }',
      id,
    );
  }
};

/** Canonically validated transcript benchmark input; native execution is outside this fixture's claim. */
export type ProjectionHistoryFixture = {
  readonly text: string;
  readonly turns: number;
  readonly rows: number;
  readonly bytes: number;
  readonly messages: number;
  readonly prompts: readonly string[];
};

/** Build accumulated histories from one real completed turn, preserving real revision references. */
export const createProjectionHistory = (template: string, turns: number): ProjectionHistoryFixture => {
  const rows = [...iterateProjectionHistory(template, turns)];
  const expectedMessages = reduceEventLog(parseEventLog(template)).length * turns;
  const prompts = Array.from({ length: turns }, (_, index) => `Fixture turn ${index + 1} of ${turns}.`);
  const messages = reduceEventLog(rows);
  const ledger = foldChatLedger(emptyChatLedger, rows);
  if (
    !ledger.historyIntact ||
    ledger.anomalies.length > 0 ||
    messages.length !== expectedMessages ||
    Object.keys(ledger.runs).length !== turns
  ) {
    throw new Error('Generated history failed canonical reducer/ledger qualification.');
  }
  const text = rows.map((row) => JSON.stringify(row)).join('\n') + '\n';
  return {
    text,
    turns,
    rows: rows.length,
    bytes: new TextEncoder().encode(text).byteLength,
    messages: messages.length,
    prompts,
  };
};

/** Resolve the fixture's actual persistent provider, without deriving a path from the route. */
export const projectionProject = async (): Promise<StoredProjectConfig> => {
  const { projectId } = await seededChatIds();
  const state = await readProjectStorageState();
  const config = state.configs.find((candidate) => candidate.projectId === projectId);
  if (!config) {
    throw new Error(`No persistent filesystem configuration for ${projectId}.`);
  }
  return config;
};

/** Read the authoritative log through the provider selected by the real fixture. */
export const projectionLog = async (chatId: string): Promise<string> => {
  const closure = await exportProjectionProjectClosure(await projectionProject(), [
    `.tau/chats/${chatId}/events.jsonl`,
  ]);
  const file = closure.files.find((candidate) => candidate.path === `.tau/chats/${chatId}/events.jsonl`);
  return file ? new TextDecoder().decode(decodeProjectionFile(file)) : '';
};

/** Bind rendered assertions to the admitted turn's actual durable identity and retained DOM node. */
export const captureProjectionTurn = async (chatId: string, prompt: string): Promise<string> => {
  const log = await projectionLog(chatId);
  const rows = log
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { type: string; state?: string; runId?: string });
  const runId = rows.findLast((row) => row.type === 'run.lifecycle' && row.state === 'admitted')?.runId;
  if (!runId) {
    throw new Error('The visible turn has no durable admission identity.');
  }
  await target.evaluate(
    ({ prompt, runId }) => {
      const paragraph = [...document.querySelectorAll('article [role="button"] p')].find(
        (candidate) => candidate.textContent.trim() === prompt,
      );
      const group = paragraph?.closest('article')?.parentElement;
      if (!group) {
        throw new Error('The admitted prompt has no rendered turn group.');
      }
      group.dataset['projectionTurn'] = runId;
    },
    { prompt, runId },
  );
  return runId;
};

/** Write Home using its persisted engine pin, never a fabricated project configuration. */
export const writeProjectionHomeFile = async (
  path: string,
  content?: string | Uint8Array<ArrayBuffer>,
): Promise<ProjectionHomeWriterReceipt> => {
  const { pin } = await readProjectStorageState();
  if (pin !== 'opfs' && pin !== 'indexeddb') {
    throw new Error(`Independent Home writer refuses unsupported or unpinned authority: ${pin ?? 'unpinned'}.`);
  }
  const databasePrefix = await readPhysicalDatabasePrefix(pin === 'indexeddb');
  const home: ProjectionWriterHome = { backend: pin, databasePrefix };
  const moduleUrl = new URL('filesystem-projection-writer.ts', import.meta.url).href;
  await target.commands.uiEvaluateTarget(
    'async (moduleUrl) => { globalThis.__tauProjectionWriter = await import(moduleUrl); }',
    moduleUrl,
  );
  return transferProjectionValue(
    async ({ home, path, content }) => {
      const writer = (globalThis as typeof globalThis & { __tauProjectionWriter: unknown }).__tauProjectionWriter as {
        writeProjectionHomeFile(
          home: ProjectionWriterHome,
          path: string,
          content?: string | Uint8Array<ArrayBuffer>,
        ): Promise<ProjectionHomeWriterReceipt>;
      };
      return writer.writeProjectionHomeFile(home, path, Array.isArray(content) ? new Uint8Array(content) : content);
    },
    { home, path, content: content instanceof Uint8Array ? [...content] : content },
  );
};

/** Write through the production independent rooted writer in the actual application's origin. */
export const writeProjectionProjectFile = async (
  config: StoredProjectConfig,
  path: string,
  content?: string | Uint8Array<ArrayBuffer>,
): Promise<ProjectionWriterReceipt> => {
  if (config.backend !== 'opfs' && config.backend !== 'indexeddb') {
    throw new Error(`Independent browser writer does not own provider ${config.backend}.`);
  }
  const moduleUrl = new URL('filesystem-projection-writer.ts', import.meta.url).href;
  // Serialized source avoids Vitest's import wrapper in the independent production document.
  await target.commands.uiEvaluateTarget(
    'async (moduleUrl) => { globalThis.__tauProjectionWriter = await import(moduleUrl); }',
    moduleUrl,
  );
  const databasePrefix = await readPhysicalDatabasePrefix(config.backend === 'indexeddb');
  return transferProjectionValue(
    async ({ config, path, content, databasePrefix }) => {
      const writer = (globalThis as typeof globalThis & { __tauProjectionWriter: unknown }).__tauProjectionWriter as {
        writeProjectionFile(
          project: ProjectionWriterProject,
          path: string,
          content?: string | Uint8Array<ArrayBuffer>,
        ): Promise<ProjectionWriterReceipt>;
      };
      return writer.writeProjectionFile(
        {
          ...config,
          databasePrefix,
        },
        path,
        Array.isArray(content) ? new Uint8Array(content) : content,
      );
    },
    {
      config: { ...config, backend: config.backend },
      databasePrefix,
      path,
      content: content instanceof Uint8Array ? [...content] : content,
      moduleUrl,
    },
  );
};

/** Replace or delete a nonwriter chat through real production filesystem receipts. */
export const replaceProjectionLog = async (chatId: string, content?: string): Promise<ProjectionWriterReceipt> =>
  writeProjectionProjectFile(await projectionProject(), `.tau/chats/${chatId}/events.jsonl`, content);

/** Evidence from the actual agent worker connection whose delivery the control holds. */
export type ProjectionDeliveryEvidence = {
  readonly resources?: {
    readonly status: 'observing' | 'unsupported' | 'failed';
    readonly timeOrigin: number;
    readonly installedAt: number;
    readonly observedAt: number;
    readonly deliveredEntries: number;
    readonly evictedEntries: number;
    readonly nativeBufferFullEvents: number;
    readonly entries: ReadonlyArray<{
      readonly origin: string;
      readonly path: string;
      readonly initiator: string;
      readonly startedAt: number;
      readonly responseEnd: number;
    }>;
  };
  readonly startupRpc?: {
    readonly droppedRequests: number;
    readonly droppedStartupRequests: number;
    readonly calls: ReadonlyArray<{
      readonly port: number;
      readonly id: string;
      readonly method: string;
      readonly requestedAt: number;
      respondedAt?: number;
      response: 'absent' | 'success' | 'error' | 'invalid';
    }>;
  };
  readonly requestedChats: readonly string[];
  readonly requested: number;
  readonly readRequests: number;
  readonly readAnswers: number;
  readonly readSuccessfulAnswers: number;
  readonly readFailedAnswers: number;
  readonly readAnswersDelivered: number;
  readonly catchUpStreams: ReadonlyArray<{
    readonly port: number;
    readonly id: string;
    readonly chatId: string;
    fa: number;
    fw: number;
    su: number;
    credits: number;
    sn: number;
    sc: number;
    se: number;
    lastOutgoingAt?: number;
    lastIncomingAt?: number;
    lastCursor?: number;
    /** Renderer receipt milliseconds relative to this document's performance time origin; not fold completion. */
    receipt?: {
      requestedAt: number;
      sourceGeneration?: string;
      firstPageAt?: number;
      lastPageAt?: number;
      validatedAt?: number;
      maxInterPageGap: number;
    };
  }>;
  readonly catchUpPageFrames: number;
  readonly catchUpRequests: ReadonlyArray<{ port: number; id: string; chatId: string; at: number }>;
  readonly catchUpFrames: ReadonlyArray<{
    readonly port: number;
    readonly id: string;
    readonly chatId: string;
    readonly at: number;
    readonly kind: string;
    readonly type?: string;
    readonly status?: string;
    readonly reason?: string;
    readonly cursor?: number;
    readonly sourceGeneration?: string;
    readonly observedEndCursor?: number;
    readonly error?: string;
  }>;
  readonly liveFrames: number;
  readonly liveRequests: ReadonlyArray<{ port: number; id: string; chatId: string; at: number }>;
  readonly outstandingReadCount: number;
  readonly outstandingReads: ReadonlyArray<{
    readonly port: number;
    readonly id: string;
    readonly chatId: string;
    readonly cursor?: number;
  }>;
  readonly latestReadAnswers: ReadonlyArray<{
    readonly port: number;
    readonly id: string;
    readonly chatId: string;
    readonly successful: boolean;
    readonly status?: string;
    readonly cursor?: number;
    readonly nextCursor?: number;
    readonly endCursor?: number;
    readonly sourceGeneration?: string;
  }>;
  readonly held: number;
  readonly restored: number;
  readonly delivered: number;
  readonly deliveredSamples: ReadonlyArray<{
    readonly port: number;
    readonly id: string;
    readonly method: string;
    readonly chatId: string;
    readonly at: number;
    readonly payload: string;
  }>;
  readonly deliveredFrames: ReadonlyArray<{
    readonly port: number;
    readonly id: string;
    readonly kind: string;
    readonly chatId: string;
  }>;
  readonly ports: readonly number[];
  readonly chats: readonly string[];
  readonly frames: ReadonlyArray<{
    readonly port: number;
    readonly id: string;
    readonly kind: string;
    readonly chatId: string;
  }>;
  readonly keepalives: number;
  readonly unrelatedResponses: number;
};

export type ProjectionUnrelatedRead = {
  readonly port: number;
  readonly id: string;
  readonly chatId: string;
  readonly status: 'refused';
  readonly reason: 'cursor-ahead' | 'identity-mismatch' | 'owner-fenced' | 'unreadable';
};

type DeliveryControl = {
  probe(): Promise<ProjectionUnrelatedRead>;
  hold(chatId: string): void;
  restore(): void;
  evidence(): ProjectionDeliveryEvidence;
};

type DeliveryOptions = { probeSeed: string; captureReceiptTiming: boolean };

/** Install a reversible control on actual agent read/live frames before the document starts. */
export const installProjectionDeliveryControl = async (captureReceiptTiming = false): Promise<void> => {
  const options: DeliveryOptions = { probeSeed: randomUuid(), captureReceiptTiming };
  await target.addInitScript((options: DeliveryOptions) => {
    const { probeSeed, captureReceiptTiming } = options;
    let probeSequence = 0;
    type ResourceEvidence = NonNullable<ProjectionDeliveryEvidence['resources']>;
    const resourceEntries: Array<ResourceEvidence['entries'][number]> = [];
    let resourceObserver: PerformanceObserver | undefined;
    let resourceStatus: ResourceEvidence['status'] = 'unsupported';
    const resourceInstalledAt = captureReceiptTiming ? performance.now() : 0;
    let deliveredResourceEntries = 0;
    let evictedResourceEntries = 0;
    let nativeBufferFullEvents = 0;
    const collectResources = (entries: readonly PerformanceEntry[]): void => {
      for (const entry of entries) {
        if (!(entry instanceof PerformanceResourceTiming) || !/^https?:/u.test(entry.name)) {
          continue;
        }
        const url = new URL(entry.name);
        deliveredResourceEntries += 1;
        if (resourceEntries.length === 256) {
          resourceEntries.shift();
          evictedResourceEntries += 1;
        }
        resourceEntries.push({
          origin: url.origin,
          path: url.pathname,
          initiator: entry.initiatorType,
          startedAt: entry.startTime,
          responseEnd: entry.responseEnd,
        });
      }
    };
    if (captureReceiptTiming && typeof PerformanceObserver !== 'undefined') {
      try {
        resourceObserver = new PerformanceObserver((list) => {
          collectResources(list.getEntries());
        });
        resourceObserver.observe({ type: 'resource', buffered: true });
        resourceStatus = 'observing';
        performance.addEventListener('resourcetimingbufferfull', () => {
          nativeBufferFullEvents += 1;
        });
        addEventListener('pagehide', () => resourceObserver?.disconnect(), { once: true });
      } catch {
        resourceStatus = 'failed';
        resourceObserver?.disconnect();
      }
    }
    const resourceEvidence = (): ResourceEvidence => {
      collectResources(resourceObserver?.takeRecords() ?? []);
      return {
        status: resourceStatus,
        timeOrigin: performance.timeOrigin,
        installedAt: resourceInstalledAt,
        observedAt: performance.now(),
        deliveredEntries: deliveredResourceEntries,
        evictedEntries: evictedResourceEntries,
        nativeBufferFullEvents,
        entries: [...resourceEntries],
      };
    };
    type Frame = {
      s?: number;
      e?: { m?: string };
      o?: number;
      k?: string;
      n?: string;
      i?: string;
      a?: { chatId?: string; cursor?: number };
      d?: { chatId?: string };
    };
    type Pending = { readonly deliver: () => void };
    const catchUpStreams = new Map<string, ProjectionDeliveryEvidence['catchUpStreams'][number]>();
    const catchUpCalls = new WeakMap<MessagePort, Map<string, string>>();
    const catchUpRequests: Array<ProjectionDeliveryEvidence['catchUpRequests'][number]> = [];
    const catchUpFrames: Array<ProjectionDeliveryEvidence['catchUpFrames'][number]> = [];
    const capturedCatchUp = new WeakSet<Event>();
    const startupCalls = new Map<string, NonNullable<ProjectionDeliveryEvidence['startupRpc']>['calls'][number]>();
    let droppedRequests = 0;
    let droppedStartupRequests = 0;
    let startupRequestCount = 0;
    let otherRequestCount = 0;
    const startupMethods = new Set(['init', 'provide', 'capabilities', 'connect', 'open', 'hello']);
    let catchUpPageFrames = 0;
    const calls = new WeakMap<MessagePort, Map<string, string>>();
    const methods = new WeakMap<MessagePort, Map<string, string>>();
    const deliveredSamples: Array<{
      port: number;
      id: string;
      method: string;
      chatId: string;
      at: number;
      payload: string;
    }> = [];
    const identities = new WeakMap<MessagePort, number>();
    const listeners = new WeakMap<EventListenerOrEventListenerObject, EventListener>();
    const held: Pending[] = [];
    const frames: Array<{ port: number; id: string; kind: string; chatId: string }> = [];
    const deliveredFrames: Array<{ port: number; id: string; kind: string; chatId: string }> = [];
    let delivered = 0;
    let requested = 0;
    let readRequests = 0;
    let readAnswers = 0;
    let readSuccessfulAnswers = 0;
    let readFailedAnswers = 0;
    let readAnswersDelivered = 0;
    let liveFrames = 0;
    const liveRequests: Array<ProjectionDeliveryEvidence['liveRequests'][number]> = [];
    const answered = new WeakSet<Event>();
    const deliveredReads = new WeakSet<Event>();
    const outstandingReads = new Map<string, ProjectionDeliveryEvidence['outstandingReads'][number]>();
    const latestReadAnswers: Array<ProjectionDeliveryEvidence['latestReadAnswers'][number]> = [];
    const requestedChats = new Set<string>();
    const matchedPorts = new Set<number>();
    const matchedChats = new Set<string>();
    let nextPort = 0;
    let heldCount = 0;
    let restored = 0;
    let keepalives = 0;
    let unrelatedResponses = 0;
    const unrelatedAnswered = new WeakSet<Event>();
    let agentReadPort: WeakRef<MessagePort> | undefined;
    let mutedChat: string | undefined;
    const originalPost = MessagePort.prototype.postMessage;
    const originalAdd = MessagePort.prototype.addEventListener;
    const originalRemove = MessagePort.prototype.removeEventListener;
    MessagePort.prototype.postMessage = function (
      this: MessagePort,
      message: unknown,
      options?: Transferable[] | StructuredSerializeOptions,
    ): void {
      const frame = message as Frame | undefined;
      if (captureReceiptTiming && frame?.k === 'rq' && frame.i && frame.n) {
        if (!identities.has(this)) {
          identities.set(this, ++nextPort);
        }
        const port = identities.get(this)!;
        const startup = startupMethods.has(frame.n);
        if (startup ? startupRequestCount < 64 : otherRequestCount < 192) {
          if (startup) {
            startupRequestCount += 1;
          } else {
            otherRequestCount += 1;
          }
          startupCalls.set(`${port}:${frame.i}`, {
            port,
            id: frame.i.slice(0, 256),
            method: frame.n.slice(0, 128),
            requestedAt: performance.now(),
            response: 'absent',
          });
        } else {
          droppedRequests += 1;
          if (startup) {
            droppedStartupRequests += 1;
          }
        }
      }
      if (frame?.i && frame.n === 'catchUp' && frame.a?.chatId) {
        let captures = catchUpCalls.get(this);
        if (captures === undefined) {
          captures = new Map();
          catchUpCalls.set(this, captures);
        }
        if (!identities.has(this)) {
          identities.set(this, ++nextPort);
        }
        if (captures.size === 16) {
          const oldest = captures.keys().next().value;
          if (oldest !== undefined) {
            captures.delete(oldest);
          }
        }
        captures.set(frame.i, frame.a.chatId);
        if (catchUpStreams.size === 16) {
          const oldest = catchUpStreams.keys().next().value;
          if (oldest !== undefined) {
            catchUpStreams.delete(oldest);
          }
        }
        catchUpStreams.set(`${identities.get(this)!}:${frame.i}`, {
          port: identities.get(this)!,
          id: frame.i,
          chatId: frame.a.chatId,
          fa: 0,
          fw: 0,
          su: 0,
          credits: 0,
          sn: 0,
          sc: 0,
          se: 0,
          ...(captureReceiptTiming ? { receipt: { requestedAt: performance.now(), maxInterPageGap: 0 } } : {}),
        });

        if (catchUpRequests.length === 16) {
          catchUpRequests.shift();
        }
        catchUpRequests.push({ port: identities.get(this)!, id: frame.i, chatId: frame.a.chatId, at: Date.now() });
      }

      if (frame?.i && (frame.n === 'read' || frame.n === 'liveEvents') && frame.a?.chatId) {
        let requests = calls.get(this);
        if (!requests) {
          requests = new Map();
          calls.set(this, requests);
          if (!identities.has(this)) {
            identities.set(this, ++nextPort);
          }
        }
        requests.set(frame.i, frame.a.chatId);
        let names = methods.get(this);
        if (!names) {
          names = new Map();
          methods.set(this, names);
        }
        names.set(frame.i, frame.n);
        requested += 1;
        if (frame.n === 'liveEvents') {
          if (liveRequests.length === 16) {
            liveRequests.shift();
          }
          liveRequests.push({ port: identities.get(this)!, id: frame.i, chatId: frame.a.chatId, at: Date.now() });
        }
        requestedChats.add(frame.a.chatId);
        if (frame.n === 'read') {
          if (mutedChat === undefined || frame.a.chatId === mutedChat) {
            agentReadPort = new WeakRef(this);
          }
          readRequests += 1;
          if (outstandingReads.size < 16) {
            const port = identities.get(this)!;
            outstandingReads.set(`${port}:${frame.i}`, {
              port,
              id: frame.i,
              chatId: frame.a.chatId,
              ...(typeof frame.a.cursor === 'number' ? { cursor: frame.a.cursor } : {}),
            });
          }
        }
      }
      if (frame?.i && (frame.k === 'fa' || frame.k === 'fw' || frame.k === 'su')) {
        const stream = catchUpStreams.get(`${identities.get(this)!}:${frame.i}`);
        if (stream !== undefined) {
          stream[frame.k] += 1;
          stream.lastOutgoingAt = Date.now();
          if (frame.k === 'fw' && typeof frame.s === 'number') {
            stream.credits += frame.s;
          }
        }
      }
      originalPost.call(this, message, Array.isArray(options) ? { transfer: options } : options);
    };
    MessagePort.prototype.addEventListener = function (
      this: MessagePort,
      ...[type, listener, options]: Parameters<EventTarget['addEventListener']>
    ): void {
      if (listener === null) {
        return;
      }
      if (type !== 'message') {
        originalAdd.call(this, type, listener, options);
        return;
      }
      const wrapped: EventListener = (event) => {
        const frame = (event as MessageEvent<Frame | undefined>).data;
        if (captureReceiptTiming && frame?.k === 'rs' && frame.i) {
          const call = startupCalls.get(`${identities.get(this)}:${frame.i}`);
          if (call?.response === 'absent') {
            call.respondedAt = performance.now();
            call.response = frame.o === 1 ? 'success' : frame.o === 0 ? 'error' : 'invalid';
          }
        }
        const method = frame?.i ? methods.get(this)?.get(frame.i) : undefined;
        const deliver = (): void => {
          if (method === 'read' && frame?.k === 'rs' && !deliveredReads.has(event)) {
            deliveredReads.add(event);
            readAnswersDelivered += 1;
          }
          if (typeof listener === 'function') {
            listener.call(this, event);
          } else {
            listener.handleEvent(event);
          }
        };
        if (frame === undefined) {
          deliver();
          return;
        }
        const captureChat = frame.i ? catchUpCalls.get(this)?.get(frame.i) : undefined;
        if (
          captureChat !== undefined &&
          (frame.k === 'sn' || frame.k === 'sc' || frame.k === 'se') &&
          !capturedCatchUp.has(event)
        ) {
          capturedCatchUp.add(event);
          const value = frame.d as
            | {
                type?: unknown;
                answer?: {
                  status?: unknown;
                  reason?: unknown;
                  cursor?: unknown;
                  nextCursor?: unknown;
                  sourceGeneration?: unknown;
                };
                position?: { cursor?: unknown; sourceGeneration?: unknown };
                observedEndCursor?: unknown;
              }
            | undefined;
          const position = value?.answer ?? value?.position;
          const stream = catchUpStreams.get(`${identities.get(this)!}:${frame.i!}`);
          if (stream !== undefined) {
            stream[frame.k] += 1;
            stream.lastIncomingAt = Date.now();
            if (stream.receipt !== undefined && frame.k === 'sn') {
              if (typeof position?.sourceGeneration === 'string') {
                stream.receipt.sourceGeneration = position.sourceGeneration;
              }
              if (value?.type === 'page') {
                const receivedAt = performance.now();
                if (stream.receipt.lastPageAt !== undefined) {
                  stream.receipt.maxInterPageGap = Math.max(
                    stream.receipt.maxInterPageGap,
                    receivedAt - stream.receipt.lastPageAt,
                  );
                }
                stream.receipt.firstPageAt ??= receivedAt;
                stream.receipt.lastPageAt = receivedAt;
              } else if (value?.type === 'validated') {
                stream.receipt.validatedAt = performance.now();
              }
            }
            if (typeof value?.answer?.nextCursor === 'number') {
              stream.lastCursor = value.answer.nextCursor;
            } else if (typeof position?.cursor === 'number') {
              stream.lastCursor = position.cursor;
            }
          }

          if (frame.k === 'sn' && value?.type === 'page') {
            catchUpPageFrames += 1;
          }
          if (catchUpFrames.length === 16) {
            catchUpFrames.shift();
          }
          catchUpFrames.push({
            port: identities.get(this)!,
            id: frame.i!,
            chatId: captureChat,
            at: Date.now(),
            kind: frame.k,
            ...(typeof value?.type === 'string' ? { type: value.type.slice(0, 256) } : {}),
            ...(typeof value?.answer?.status === 'string' ? { status: value.answer.status.slice(0, 256) } : {}),
            ...(typeof value?.answer?.reason === 'string' ? { reason: value.answer.reason.slice(0, 256) } : {}),
            ...(typeof position?.cursor === 'number' ? { cursor: position.cursor } : {}),
            ...(typeof position?.sourceGeneration === 'string'
              ? { sourceGeneration: position.sourceGeneration.slice(0, 256) }
              : {}),
            ...(typeof value?.observedEndCursor === 'number' ? { observedEndCursor: value.observedEndCursor } : {}),
            ...(typeof frame.e?.m === 'string' ? { error: frame.e.m.slice(0, 256) } : {}),
          });
          if (frame.k === 'sc' || frame.k === 'se') {
            catchUpCalls.get(this)?.delete(frame.i!);
          }
        }
        const chat = frame.i ? calls.get(this)?.get(frame.i) : undefined;
        if (chat !== undefined && !answered.has(event)) {
          if (method === 'read' && frame.k === 'rs') {
            answered.add(event);
            readAnswers += 1;
            if (frame.o === 1) {
              readSuccessfulAnswers += 1;
            } else {
              readFailedAnswers += 1;
            }
            const port = identities.get(this)!;
            outstandingReads.delete(`${port}:${frame.i!}`);
            const answer = frame.d as
              | {
                  status?: unknown;
                  cursor?: unknown;
                  nextCursor?: unknown;
                  endCursor?: unknown;
                  sourceGeneration?: unknown;
                }
              | undefined;
            latestReadAnswers.push({
              port,
              id: frame.i!,
              chatId: chat,
              successful: frame.o === 1,
              ...(typeof answer?.status === 'string' ? { status: answer.status.slice(0, 256) } : {}),
              ...(typeof answer?.cursor === 'number' ? { cursor: answer.cursor } : {}),
              ...(typeof answer?.nextCursor === 'number' ? { nextCursor: answer.nextCursor } : {}),
              ...(typeof answer?.endCursor === 'number' ? { endCursor: answer.endCursor } : {}),
              ...(typeof answer?.sourceGeneration === 'string'
                ? { sourceGeneration: answer.sourceGeneration.slice(0, 256) }
                : {}),
            });
            if (latestReadAnswers.length > 16) {
              latestReadAnswers.shift();
            }
          } else if (method === 'liveEvents' && frame.k === 'sn') {
            answered.add(event);
            liveFrames += 1;
          }
        }
        if (
          mutedChat !== undefined &&
          frame.k === 'rs' &&
          frame.o === 1 &&
          chat !== mutedChat &&
          calls.has(this) &&
          !unrelatedAnswered.has(event)
        ) {
          unrelatedAnswered.add(event);
          unrelatedResponses += 1;
        }
        if (frame.k === 'lk' && calls.has(this)) {
          keepalives += 1;
        }
        if (mutedChat !== undefined && chat === mutedChat && (frame.k === 'rs' || frame.k === 'sn')) {
          held.push({ deliver });
          heldCount += 1;
          matchedPorts.add(identities.get(this)!);
          matchedChats.add(chat);
          frames.push({ port: identities.get(this)!, id: frame.i!, kind: frame.k, chatId: chat });
          return;
        }
        if (chat !== undefined && (frame.k === 'rs' || frame.k === 'sn')) {
          delivered += 1;
          if (deliveredSamples.length === 16) {
            deliveredSamples.shift();
          }
          if (deliveredSamples.length < 16) {
            const answer = frame.d as
              | {
                  status?: unknown;
                  cursor?: unknown;
                  nextCursor?: unknown;
                  sourceGeneration?: unknown;
                  reason?: unknown;
                  events?: readonly unknown[];
                }
              | undefined;
            const payload =
              frame.k === 'rs'
                ? {
                    kind: frame.k,
                    status: answer?.status,
                    cursor: answer?.cursor,
                    nextCursor: answer?.nextCursor,
                    sourceGeneration: answer?.sourceGeneration,
                    reason: answer?.reason,
                    rows: answer?.events?.map((row) => {
                      if (typeof row !== 'object' || row === null) {
                        return { unreadable: true };
                      }
                      const event = row as { type?: unknown; state?: unknown; runId?: unknown; sequence?: unknown };
                      return { type: event.type, state: event.state, runId: event.runId, sequence: event.sequence };
                    }),
                  }
                : { kind: frame.k, event: frame.d };
            deliveredSamples.push({
              port: identities.get(this)!,
              id: frame.i!,
              method: method ?? 'unknown',
              chatId: chat,
              at: Date.now(),
              payload: JSON.stringify(payload).slice(0, 2048),
            });
          }
          if (deliveredFrames.length < 32) {
            deliveredFrames.push({ port: identities.get(this)!, id: frame.i!, kind: frame.k, chatId: chat });
          }
        }
        deliver();
      };
      listeners.set(listener, wrapped);
      originalAdd.call(this, type, wrapped, options);
    };
    MessagePort.prototype.removeEventListener = function (
      this: MessagePort,
      ...[type, listener, options]: Parameters<EventTarget['removeEventListener']>
    ): void {
      if (listener === null) {
        return;
      }
      originalRemove.call(this, type, listeners.get(listener) ?? listener, options);
    };
    const control: DeliveryControl = {
      probe: async () => {
        const port = agentReadPort?.deref();
        if (
          port === undefined ||
          mutedChat === undefined ||
          ![...(calls.get(port)?.values() ?? [])].includes(mutedChat)
        ) {
          throw new Error('The held chat has no captured actual agent read port.');
        }
        const id = `fixture-unrelated-${probeSeed}-${++probeSequence}`;
        const chatId = 'chat_fixture_control';
        if (chatId === mutedChat) {
          throw new Error('The independent probe must address another chat.');
        }
        let listener: EventListener | undefined;
        let deadline: ReturnType<typeof setTimeout> | undefined;
        try {
          return await new Promise<ProjectionUnrelatedRead>((resolve, reject) => {
            listener = (event) => {
              const frame = (event as MessageEvent<Frame | undefined>).data;
              if (frame?.i !== id || frame.k !== 'rs') {
                return;
              }
              const answer = frame.d as { chatId?: unknown; status?: unknown; reason?: unknown } | undefined;
              if (
                frame.o !== 1 ||
                answer?.chatId !== chatId ||
                answer.status !== 'refused' ||
                (answer.reason !== 'cursor-ahead' &&
                  answer.reason !== 'identity-mismatch' &&
                  answer.reason !== 'owner-fenced' &&
                  answer.reason !== 'unreadable')
              ) {
                reject(new Error('The independent actual read did not return a valid refusal.'));
                return;
              }
              resolve({ port: identities.get(port)!, id, chatId, status: 'refused', reason: answer.reason });
            };
            originalAdd.call(port, 'message', listener);
            deadline = setTimeout(() => {
              originalPost.call(port, {
                v: 1,
                k: 'rc',
                i: id,
                e: { m: 'Independent fixture read deadline exceeded.' },
              });
              reject(new Error('The independent actual read exceeded its 5 second deadline.'));
            }, 5000);
            port.postMessage({ v: 1, k: 'rq', i: id, n: 'read', a: { chatId, cursor: 1, limit: 1, maxBytes: 1024 } });
          });
        } finally {
          if (deadline !== undefined) {
            clearTimeout(deadline);
          }
          if (listener !== undefined) {
            originalRemove.call(port, 'message', listener);
          }
        }
      },
      hold: (chatId) => {
        mutedChat = chatId;
      },
      restore: () => {
        mutedChat = undefined;
        for (const pending of held.splice(0)) {
          pending.deliver();
          restored += 1;
        }
      },
      evidence: () => ({
        ...(captureReceiptTiming
          ? {
              resources: resourceEvidence(),
              startupRpc: {
                droppedRequests,
                droppedStartupRequests,
                calls: [...startupCalls.values()].map((call) => ({ ...call })),
              },
            }
          : {}),
        held: heldCount,
        restored,
        delivered,
        deliveredFrames: [...deliveredFrames],
        deliveredSamples: [...deliveredSamples],
        requested,
        readRequests,
        readAnswers,
        readSuccessfulAnswers,
        readFailedAnswers,
        readAnswersDelivered,
        catchUpStreams: [...catchUpStreams.values()].map((stream) => ({ ...stream })),
        catchUpPageFrames,
        catchUpRequests: [...catchUpRequests],
        catchUpFrames: [...catchUpFrames],
        liveFrames,
        liveRequests: [...liveRequests],
        outstandingReadCount: readRequests - readAnswers,
        outstandingReads: [...outstandingReads.values()],
        latestReadAnswers: [...latestReadAnswers],
        requestedChats: [...requestedChats],
        ports: [...matchedPorts],
        chats: [...matchedChats],
        frames: [...frames],
        keepalives,
        unrelatedResponses,
      }),
    };
    Object.assign(globalThis, { __tauProjectionDeliveryControl: control });
  }, options);
};

/** Hold actual read/live delivery for exactly one chat. */
export const holdProjectionDelivery = async (chatId: string): Promise<void> => {
  await target.evaluate((id) => {
    (globalThis as unknown as { __tauProjectionDeliveryControl: DeliveryControl }).__tauProjectionDeliveryControl.hold(
      id,
    );
  }, chatId);
};

/** Issue an independent real read on the captured held chat's actual agent connection. */
export const probeProjectionUnrelatedRead = async (): Promise<ProjectionUnrelatedRead> =>
  target.evaluate(async () =>
    (
      globalThis as unknown as { __tauProjectionDeliveryControl: DeliveryControl }
    ).__tauProjectionDeliveryControl.probe(),
  );

/** Restore the original matching frames in arrival order. */
export const restoreProjectionDelivery = async (): Promise<void> => {
  await target.evaluate(() => {
    (
      globalThis as unknown as { __tauProjectionDeliveryControl: DeliveryControl }
    ).__tauProjectionDeliveryControl.restore();
  });
};

/** Inspect proof that the negative control intercepted a real connection. */
export const projectionDeliveryEvidence = async (): Promise<ProjectionDeliveryEvidence> =>
  target.evaluate(() =>
    (
      globalThis as unknown as { __tauProjectionDeliveryControl: DeliveryControl }
    ).__tauProjectionDeliveryControl.evidence(),
  );

/** Actual browser click-to-render timing; fixture command round trips are excluded. */
export type ProjectionGestureMeasurement = {
  readonly id: string;
  readonly startedAt?: number;
  readonly renderedAt?: number;
  readonly promptRenderedAt?: number;
  readonly duration?: number;
  readonly trusted?: boolean;
};

/** Arm one actual sidebar gesture and a uniquely identified rendered prompt in the target browser. */
export const armProjectionGestureMeasurement = async (
  ...[id, chatName, renderedText, activeChatName = chatName, assistantText]: [
    id: string,
    chatName: string,
    renderedText: string,
    activeChatName?: string,
    assistantText?: string,
  ]
): Promise<void> => {
  await target.evaluate(
    ({ id, chatName, renderedText, activeChatName, assistantText }) => {
      type Measurement = {
        id: string;
        startedAt?: number;
        renderedAt?: number;
        promptRenderedAt?: number;
        duration?: number;
        trusted?: boolean;
      };
      type Control = { snapshot: Measurement; dispose(): void };
      const globals = globalThis as typeof globalThis & { __projectionGestureMeasurement?: Control };
      globals.__projectionGestureMeasurement?.dispose();
      const snapshot: Measurement = { id };
      const mounted = (): boolean =>
        [...document.querySelectorAll<HTMLElement>('article [role="button"] p')].some((node) => {
          if (!node.textContent.includes(renderedText)) {
            return false;
          }
          const history = node.closest('[aria-label="Chat history"]');
          if (history === null) {
            return false;
          }
          const viewport = history.getBoundingClientRect();
          const intersects = (element: Element): boolean => {
            const rectangle = element.getBoundingClientRect();
            return (
              rectangle.width > 0 &&
              rectangle.height > 0 &&
              rectangle.bottom > viewport.top &&
              rectangle.top < viewport.bottom &&
              rectangle.right > viewport.left &&
              rectangle.left < viewport.right
            );
          };
          if (!intersects(node)) {
            return false;
          }
          if (snapshot.startedAt !== undefined) {
            snapshot.promptRenderedAt ??= performance.now();
          }
          return (
            assistantText === undefined ||
            [...(node.closest('[data-index]')?.querySelectorAll('article p') ?? [])].some(
              (part) => part.textContent.includes(assistantText) && intersects(part),
            )
          );
        });
      if (mounted()) {
        throw new Error(
          'The measured prompt must uniquely identify the target chat, and be absent before its gesture.',
        );
      }
      let frame = 0;
      let scheduled = false;
      const active = (): boolean =>
        [...document.querySelectorAll<HTMLElement>('[data-slot="chat-trigger"]')]
          .find((row) => row.dataset['active'] === 'true')
          ?.querySelector('a')
          ?.textContent.trim() === activeChatName;
      const dispose = (): void => {
        observer.disconnect();
        document.removeEventListener('click', click, true);
        cancelAnimationFrame(frame);
      };
      const observed = (): void => {
        if (snapshot.startedAt === undefined || scheduled || !active() || !mounted()) {
          return;
        }
        const { startedAt } = snapshot;
        scheduled = true;
        frame = requestAnimationFrame(() => {
          frame = requestAnimationFrame(() => {
            if (!active() || !mounted()) {
              scheduled = false;
              return;
            }
            snapshot.renderedAt = performance.now();
            snapshot.duration = snapshot.renderedAt - startedAt;
            performance.mark(`projection:${id}:rendered`);
            performance.measure(`projection:${id}`, `projection:${id}:gesture`, `projection:${id}:rendered`);
            dispose();
          });
        });
      };
      const click = (event: MouseEvent): void => {
        const anchor = event.target instanceof Element ? event.target.closest('a') : undefined;
        const label = anchor?.getAttribute('aria-label') ?? anchor?.textContent.trim();
        if (label !== chatName) {
          return;
        }
        snapshot.startedAt = performance.now();
        snapshot.trusted = event.isTrusted;
        performance.mark(`projection:${id}:gesture`);
        observed();
      };
      const observer = new MutationObserver(observed);
      observer.observe(document, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['data-active'],
      });
      document.addEventListener('click', click, true);
      globals.__projectionGestureMeasurement = { snapshot, dispose };
    },
    { id, chatName, renderedText, activeChatName, assistantText },
  );
};

/** Read the browser's already captured result; polling this result does not quantize its timestamps. */
export const projectionGestureMeasurement = async (): Promise<ProjectionGestureMeasurement | undefined> =>
  target.evaluate(() => {
    const globals = globalThis as typeof globalThis & {
      __projectionGestureMeasurement?: { snapshot: ProjectionGestureMeasurement };
    };
    return globals.__projectionGestureMeasurement === undefined
      ? undefined
      : { ...globals.__projectionGestureMeasurement.snapshot };
  });

/** Export exact binary project/revision bytes; browser home workloads do not depend on a picker handle. */
export const exportProjectionProjectClosure = async (
  config: StoredProjectConfig,
  paths?: readonly string[],
): Promise<ProjectionClosure> => {
  if (config.workspaceId !== undefined || (config.backend !== 'opfs' && config.backend !== 'indexeddb')) {
    throw new Error('Comparable browser closure requires a home-root persistent provider.');
  }
  const moduleUrl = new URL('filesystem-projection-writer.ts', import.meta.url).href;
  await target.commands.uiEvaluateTarget(
    'async (moduleUrl) => { globalThis.__tauProjectionWriter = await import(moduleUrl); }',
    moduleUrl,
  );
  const databasePrefix = await readPhysicalDatabasePrefix(config.backend === 'indexeddb');
  const id = randomUuid();
  try {
    const metadata = await transferProjectionValue(
      async ({ config, databasePrefix, paths, id }) => {
        const globals = globalThis as typeof globalThis & {
          __tauProjectionWriter: {
            exportProjectionClosure(
              project: ProjectionWriterProject,
              paths?: readonly string[],
            ): Promise<ProjectionClosure>;
          };
          __tauProjectionClosures?: Record<string, ProjectionClosure>;
        };
        const closure = await globals.__tauProjectionWriter.exportProjectionClosure(
          { ...config, databasePrefix },
          paths,
        );
        (globals.__tauProjectionClosures ??= {})[id] = closure;
        return {
          closure: { ...closure, files: closure.files.map((file) => ({ ...file, base64Chunks: [] as string[] })) },
          chunkCounts: closure.files.map((file) => file.base64Chunks.length),
        };
      },
      { config: { ...config, backend: config.backend }, databasePrefix, paths, id },
    );
    for (const [index, file] of metadata.closure.files.entries()) {
      for (let chunk = 0; chunk < metadata.chunkCounts[index]!; chunk += 1) {
        file.base64Chunks.push(
          // oxlint-disable-next-line no-await-in-loop -- Each transport frame contains one independently bounded binary chunk.
          await target.evaluate(
            ({ id, index, chunk }) => {
              const closures = (
                globalThis as typeof globalThis & { __tauProjectionClosures: Record<string, ProjectionClosure> }
              ).__tauProjectionClosures;
              return closures[id]!.files[index]!.base64Chunks[chunk]!;
            },
            { id, index, chunk },
          ),
        );
      }
    }
    return metadata.closure;
  } finally {
    await target.evaluate((id) => {
      const globals = globalThis as typeof globalThis & { __tauProjectionClosures?: Record<string, ProjectionClosure> };
      if (globals.__tauProjectionClosures) {
        Reflect.deleteProperty(globals.__tauProjectionClosures, id);
        if (Object.keys(globals.__tauProjectionClosures).length === 0) {
          delete globals.__tauProjectionClosures;
        }
      }
    }, id);
  }
};

/** Restore exact bytes with bounded per-file chunk frames before production project discovery. */
export const importProjectionProjectClosure = async (closure: ProjectionClosure): Promise<ProjectionClosure> => {
  const moduleUrl = new URL('filesystem-projection-writer.ts', import.meta.url).href;
  await target.commands.uiEvaluateTarget(
    'async (moduleUrl) => { globalThis.__tauProjectionWriter = await import(moduleUrl); }',
    moduleUrl,
  );
  const id = randomUuid();
  try {
    const metadata = { ...closure, files: closure.files.map((file) => ({ ...file, base64Chunks: [] as string[] })) };
    await transferProjectionValue(
      ({ id, metadata }) => {
        const globals = globalThis as typeof globalThis & {
          __tauProjectionClosures?: Record<string, ProjectionClosure>;
        };
        (globals.__tauProjectionClosures ??= {})[id] = metadata;
      },
      { id, metadata },
    );
    for (const [index, file] of closure.files.entries()) {
      for (const [chunkIndex, chunk] of file.base64Chunks.entries()) {
        // oxlint-disable-next-line no-await-in-loop -- Preserve bounded frame size and chunk ordering for each exact binary file.
        await target.evaluate(
          ({ id, index, chunkIndex, chunk }) => {
            const file = (
              globalThis as typeof globalThis & {
                __tauProjectionClosures: Record<string, { files: Array<{ base64Chunks: string[] }> }>;
              }
            ).__tauProjectionClosures[id]!.files[index]!;
            if (file.base64Chunks.length !== chunkIndex || chunk.length > 65_536) {
              throw new Error('Projection import chunk order/size mismatch.');
            }
            file.base64Chunks.push(chunk);
          },
          { id, index, chunkIndex, chunk },
        );
      }
    }
    await target.evaluate(async (id) => {
      const globals = globalThis as typeof globalThis & {
        __tauProjectionWriter: { importProjectionClosure(closure: ProjectionClosure): Promise<ProjectionClosure> };
        __tauProjectionClosures: Record<string, ProjectionClosure>;
      };
      await globals.__tauProjectionWriter.importProjectionClosure(globals.__tauProjectionClosures[id]!);
    }, id);
    return closure;
  } finally {
    await target.evaluate((id) => {
      const globals = globalThis as typeof globalThis & { __tauProjectionClosures?: Record<string, ProjectionClosure> };
      if (globals.__tauProjectionClosures) {
        Reflect.deleteProperty(globals.__tauProjectionClosures, id);
        if (Object.keys(globals.__tauProjectionClosures).length === 0) {
          delete globals.__tauProjectionClosures;
        }
      }
    }, id);
  }
};

/** Disposable benchmark construction keeps the source template's chat identity and all its dependencies. */
export type ProjectionBenchmarkFixture = {
  readonly closure: ProjectionClosure;
  readonly chatId: string;
  readonly turns: number;
  readonly excludedChatDirectories: readonly string[];
};

/** Build one unambiguous default chat only in an immutable copy; source/provider bytes are never written. */
export const createProjectionBenchmarkFixture = async (
  source: ProjectionClosure,
  chatId: string,
  history: ProjectionHistoryFixture,
): Promise<ProjectionBenchmarkFixture> => {
  const { validateProjectionClosure } = await import('#support/filesystem-projection-writer.js');
  await validateProjectionClosure(source);
  const prefix = `.tau/chats/${chatId}/`;
  if (!source.files.some((file) => file.path === `${prefix}chat.json`)) {
    throw new Error('Benchmark chat identity is absent from the source closure.');
  }
  const events = parseEventLog(history.text);
  const ledger = foldChatLedger(emptyChatLedger, events);
  if (!ledger.historyIntact || ledger.anomalies.length > 0 || Object.keys(ledger.runs).length !== history.turns) {
    throw new Error('Benchmark history is not canonically valid.');
  }
  const chatDirectories = [
    ...new Set(
      source.files.flatMap((file) => {
        const match = /^\.tau\/chats\/([^/]+)\//u.exec(file.path);
        return match ? [`.tau/chats/${match[1]}`] : [];
      }),
    ),
  ];
  const excludedChatDirectories = chatDirectories.filter((directory) => directory !== prefix.slice(0, -1));
  // Preserve attachments/artifacts for the actual template chat and every project/revision file.
  const admitted = (path: string): boolean =>
    !excludedChatDirectories.some((directory) => path === directory || path.startsWith(`${directory}/`));
  const bytes = new TextEncoder().encode(history.text);
  const files = source.files.filter((file) => admitted(file.path) && file.path !== `${prefix}events.jsonl`);
  files.push(await encodeProjectionFile(`${prefix}events.jsonl`, bytes));
  const closure: ProjectionClosure = {
    ...source,
    directories: source.directories.filter(admitted),
    files: files.sort((left, right) => left.path.localeCompare(right.path)),
  };
  await validateProjectionClosure(closure);
  return { closure, chatId, turns: history.turns, excludedChatDirectories };
};

/* oxlint-disable no-await-in-loop -- Bound each fixture transport frame and await its rooted physical append before sending the next. */
/** Import an independently Node-proved raw directory without reconstructing its expanded JSON history. */
export const importProjectionProjectDirectory = async (
  directory: string,
  receipt: ProjectionDirectoryReceipt,
): Promise<void> => {
  const moduleUrl = new URL('filesystem-projection-writer.ts', import.meta.url).href;
  await target.commands.uiEvaluateTarget(
    'async ({ moduleUrl, receipt }) => { if (globalThis.__tauProjectionDirectoryImport) throw new Error("Projection directory import already active"); const writer = await import(moduleUrl); globalThis.__tauProjectionDirectoryImport = await writer.openProjectionDirectoryImport(receipt); }',
    { moduleUrl, receipt },
  );
  try {
    for (const file of receipt.files) {
      for (let offset = 0; offset < file.byteLength || offset === 0; offset += 65_536) {
        const chunk = await target.commands.uiReadFixtureChunk(`${directory}/rooted-project/${file.path}`, offset);
        await target.commands.uiEvaluateTarget(
          'async ({ path, offset, base64 }) => globalThis.__tauProjectionDirectoryImport.append(path, offset, base64)',
          { path: file.path, offset, base64: chunk.base64 },
        );
      }
    }
    await target.commands.uiEvaluateTarget('() => globalThis.__tauProjectionDirectoryImport.finish()');
  } finally {
    await target.commands.uiEvaluateTarget(
      '() => { globalThis.__tauProjectionDirectoryImport?.dispose(); delete globalThis.__tauProjectionDirectoryImport; }',
    );
  }
};

/* oxlint-enable no-await-in-loop */
