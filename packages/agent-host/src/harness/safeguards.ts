import type { AgentMessage, StreamFn } from '@earendil-works/pi-agent-core';
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai';
import type { AssistantMessage, ToolResultMessage } from '@earendil-works/pi-ai';
import { util as zodUtil } from 'zod';

/** Stable safeguard pattern identifiers shared with the transitional agent. @public */
export const anomalyPattern = {
  identicalError: 'identical_error',
  identicalCall: 'identical_call',
  perTargetEdit: 'per_target_edit',
  pingPong: 'ping_pong',
  emptyResult: 'empty_result',
  sameErrorDifferentArgs: 'same_error_different_args',
} as const;

/** Stable identifier for one safeguard detector family. @public */
export type AnomalyPattern = (typeof anomalyPattern)[keyof typeof anomalyPattern];

/** Normalized tool execution consumed by safeguard detectors. @public */
export type ToolEventSummary = {
  readonly index: number;
  readonly toolName: string;
  readonly argsKnown: boolean;
  readonly argsHash?: string | undefined;
  readonly argsPreview?: string | undefined;
  readonly errorCode?: string | undefined;
  readonly errorHash?: string | undefined;
  readonly errorPreview?: string | undefined;
  readonly isError: boolean;
  readonly isEmptyResult: boolean;
  readonly isMutation: boolean;
  readonly targetFile?: string | undefined;
  readonly verification?: {
    readonly outcome: 'passed' | 'failed';
    readonly files: readonly string[];
    readonly coversAll: boolean;
  };
};

/** Decision returned by one safeguard detector. @public */
export type SafeguardDetection =
  | { readonly kind: 'clear' }
  | {
      readonly kind: 'nudge';
      readonly pattern: AnomalyPattern;
      readonly reminder: string;
      readonly signature: string;
      readonly eventIndexes: readonly number[];
    }
  | {
      readonly kind: 'terminate';
      readonly pattern: AnomalyPattern;
      readonly reason: string;
      readonly signature: string;
      readonly eventIndexes: readonly number[];
    };

/** Pure safeguard detector over normalized tool executions. @public */
export type SafeguardDetector = (events: readonly ToolEventSummary[]) => SafeguardDetection;

/** Tunable safeguard trigger counts. @public */
export type SafeguardThresholds = {
  readonly identicalErrorNudge: number;
  readonly identicalErrorTerminate: number;
  readonly identicalCall: number;
  readonly perTargetEdit: number;
  readonly pingPongCycles: number;
  readonly emptyResult: number;
  readonly sameErrorDifferentArgsCount: number;
  readonly sameErrorDifferentArgsWindow: number;
  readonly sameErrorDifferentArgsDistinctArgs: number;
};

/** Default trigger counts matching Tau's transitional agent. @public */
export const defaultSafeguardThresholds: SafeguardThresholds = {
  identicalErrorNudge: 3,
  identicalErrorTerminate: 6,
  identicalCall: 5,
  perTargetEdit: 5,
  pingPongCycles: 2,
  emptyResult: 3,
  sameErrorDifferentArgsCount: 5,
  sameErrorDifferentArgsWindow: 8,
  sameErrorDifferentArgsDistinctArgs: 2,
};

/** Stable recursive JSON used by every safeguard signature. @public */
export const canonicalJson = (value: unknown): string => {
  const seen = new WeakSet<Record<string, unknown> | unknown[]>();
  const visit = (input: unknown): unknown => {
    if (input === null || typeof input !== 'object') {
      return input;
    }
    const container = input as Record<string, unknown> | unknown[];
    if (seen.has(container)) {
      return '[Circular]';
    }
    seen.add(container);
    if (Array.isArray(input)) {
      return input.map((item) => visit(item));
    }
    return Object.fromEntries(
      Object.keys(input)
        .sort()
        .map((key) => [key, visit((input as Record<string, unknown>)[key])]),
    );
  };
  const visited = visit(value);
  return visited === undefined ? 'null' : JSON.stringify(visited);
};

const browserHash = async (input: string): Promise<string> => {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
};

const oneLine = (input: string, max: number): string => {
  const collapsed = input.replaceAll(/\s+/g, ' ').trim();
  return collapsed.length > max ? `${collapsed.slice(0, max - 1)}…` : collapsed;
};

const toolResultValue = (message: ToolResultMessage<unknown>): unknown => {
  const { details } = message;
  if (zodUtil.isObject(details) && 'content' in details) {
    return details['content'];
  }
  const text = message.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
};

const extractTargetFile = (args: unknown): string | undefined => {
  if (!zodUtil.isObject(args)) {
    return undefined;
  }
  const candidate =
    args['targetFile'] ?? args['path'] ?? args['filePath'] ?? args['filepath'] ?? args['file'] ?? args['target'];
  if (typeof candidate === 'string') {
    return candidate;
  }
  return Array.isArray(args['files']) && typeof args['files'][0] === 'string' ? args['files'][0] : undefined;
};

const emptyResult = (toolName: string, value: unknown): boolean => {
  if (toolName === 'web_search') {
    return Array.isArray(value) && value.length === 0;
  }
  if (!zodUtil.isObject(value)) {
    return false;
  }
  return (
    (toolName === 'grep' && value['totalMatches'] === 0) || (toolName === 'glob_search' && value['totalFiles'] === 0)
  );
};

const verification = ({
  toolName,
  args,
  value,
  isError,
}: {
  readonly toolName: string;
  readonly args: unknown;
  readonly value: unknown;
  readonly isError: boolean;
}): ToolEventSummary['verification'] => {
  if (toolName !== 'test_model' || isError || !zodUtil.isObject(args) || !zodUtil.isObject(value)) {
    return undefined;
  }
  const failures = Array.isArray(value['failures']) ? value['failures'] : undefined;
  const passed = typeof value['passed'] === 'number' ? value['passed'] : undefined;
  const total = typeof value['total'] === 'number' ? value['total'] : undefined;
  const explicit = typeof value['success'] === 'boolean' ? value['success'] : undefined;
  const failed =
    explicit === false ||
    (failures?.length ?? 0) > 0 ||
    (passed !== undefined && total !== undefined && passed < total);
  const succeeded =
    explicit === true ||
    (passed !== undefined && total !== undefined && total > 0 && passed === total && failures?.length === 0);
  if (!failed && !succeeded) {
    return undefined;
  }
  const files = [
    ...(Array.isArray(args['files']) ? args['files'].filter((file): file is string => typeof file === 'string') : []),
    ...(Array.isArray(value['files']) ? value['files'].filter((file): file is string => typeof file === 'string') : []),
    ...(typeof args['targetFile'] === 'string' ? [args['targetFile']] : []),
  ];
  const unique = [...new Set(files)];
  return { outcome: failed ? 'failed' : 'passed', files: unique, coversAll: unique.length === 0 };
};

/** Project pi's first-class tool messages into the detector input used by Tau. @public */
export const summarizeToolEvents = async (
  messages: readonly AgentMessage[],
  hash: (input: string) => Promise<string> = browserHash,
): Promise<ToolEventSummary[]> => {
  const pending: Array<{
    readonly index: number;
    readonly message: ToolResultMessage<unknown>;
    readonly call?: { readonly name: string; readonly args: unknown } | undefined;
    readonly value: unknown;
    readonly content: string;
    readonly errorCode?: string | undefined;
    readonly errorMessage?: string | undefined;
  }> = [];
  let calls = new Map<string, { readonly name: string; readonly args: unknown }>();
  for (const [index, message] of messages.entries()) {
    if (message.role === 'assistant') {
      calls = new Map();
      for (const block of message.content) {
        if (block.type === 'toolCall') {
          calls.set(block.id, { name: block.name, args: block.arguments });
        }
      }
      continue;
    }
    if (message.role !== 'toolResult') {
      calls = new Map();
      continue;
    }

    const call = calls.get(message.toolCallId);
    const value = toolResultValue(message);
    const content = typeof value === 'string' ? value : canonicalJson(value);
    const parsedError = zodUtil.isObject(value) && typeof value['errorCode'] === 'string' ? value : undefined;
    const parsedErrorCode = parsedError?.['errorCode'];
    const parsedMessage = parsedError?.['message'];
    pending.push({
      index,
      message,
      call,
      value,
      content,
      ...(message.isError
        ? {
            errorCode: typeof parsedErrorCode === 'string' ? parsedErrorCode : 'UNKNOWN_ERROR',
            errorMessage: typeof parsedMessage === 'string' ? parsedMessage : content,
          }
        : {}),
    });
    calls.delete(message.toolCallId);
  }
  return Promise.all(
    pending.map(async ({ index, message, call, value, content, errorCode, errorMessage }) => {
      const [argsHash, errorHash] = await Promise.all([
        call ? hash(canonicalJson(call.args ?? null)) : Promise.resolve(undefined),
        errorCode ? hash(`${errorCode}:${errorMessage}`) : Promise.resolve(undefined),
      ]);
      return {
        index,
        toolName: message.toolName,
        argsKnown: call !== undefined,
        ...(call ? { argsHash, argsPreview: oneLine(canonicalJson(call.args ?? null), 80) } : {}),
        ...(errorCode ? { errorCode, errorHash, errorPreview: oneLine(errorMessage ?? content, 120) } : {}),
        isError: message.isError,
        isEmptyResult: !message.isError && emptyResult(message.toolName, value),
        isMutation: ['edit_file', 'create_file', 'delete_file'].includes(message.toolName),
        ...([
          'edit_file',
          'create_file',
          'delete_file',
          'read_file',
          'get_kernel_result',
          'export_geometry',
          'screenshot',
          'test_model',
        ].includes(message.toolName)
          ? { targetFile: extractTargetFile(call?.args) }
          : {}),
        ...(call
          ? {
              verification: verification({
                toolName: message.toolName,
                args: call.args,
                value,
                isError: message.isError,
              }),
            }
          : {}),
      };
    }),
  );
};

const callSignature = (event: ToolEventSummary): string | undefined =>
  event.argsHash ? `${event.toolName}:${event.argsHash}` : undefined;
const errorSignature = (event: ToolEventSummary): string | undefined =>
  event.argsHash ? `${event.toolName}:${event.argsHash}:${event.errorHash ?? '-'}` : undefined;
const indexes = (events: readonly ToolEventSummary[]): number[] => events.map((event) => event.index);

const identicalErrorReminder = (event: ToolEventSummary, count: number): string =>
  `You called \`${event.toolName}\` with the same arguments and received the same error ${count} times in a row:

  Arguments: ${event.argsPreview ?? '<unknown>'}
${event.errorPreview ? `  Error: ${event.errorPreview}\n` : ''}
Identical retries will not change the result. Stop and choose ONE of:
  1. Read the source file or test fixture to understand why this is failing.
  2. Try a structurally different approach (different tool, different arguments).
  3. Report the failure to the user with what you tried and what you observed.

Do NOT call \`${event.toolName}\` with these arguments again.`;

const buildDetectors = (thresholds: SafeguardThresholds): SafeguardDetector[] => [
  (events) => {
    const tail = events.at(-1);
    const signature = tail?.isError ? errorSignature(tail) : undefined;
    if (!tail || !signature) {
      return { kind: 'clear' };
    }
    let count = 0;
    for (let index = events.length - 1; index >= 0 && errorSignature(events[index]!) === signature; index--) {
      count++;
    }
    if (count >= thresholds.identicalErrorTerminate) {
      return {
        kind: 'terminate',
        pattern: anomalyPattern.identicalError,
        reason: `\`${tail.toolName}\` failed identically ${count} times in a row.`,
        signature,
        eventIndexes: indexes(events.slice(-count)),
      };
    }
    return count >= thresholds.identicalErrorNudge
      ? {
          kind: 'nudge',
          pattern: anomalyPattern.identicalError,
          reminder: identicalErrorReminder(tail, count),
          signature,
          eventIndexes: indexes(events.slice(-count)),
        }
      : { kind: 'clear' };
  },
  (events) => {
    const tail = events.at(-1);
    const signature = tail ? callSignature(tail) : undefined;
    if (!tail || !signature) {
      return { kind: 'clear' };
    }
    let count = 0;
    for (let index = events.length - 1; index >= 0 && callSignature(events[index]!) === signature; index--) {
      count++;
    }
    return count >= thresholds.identicalCall
      ? {
          kind: 'nudge',
          pattern: anomalyPattern.identicalCall,
          reminder: `You called \`${tail.toolName}\` with identical arguments ${count} times. The result will not change between calls.

  Arguments: ${tail.argsPreview ?? '<unknown>'}

If you need fresh data, change the arguments. If you already have the result, use it from the prior call instead of re-invoking the tool.`,
          signature: `${signature}:any-result`,
          eventIndexes: indexes(events.slice(-count)),
        }
      : { kind: 'clear' };
  },
  (events) => {
    const tail = events.at(-1);
    if (!tail?.isMutation || !tail.targetFile) {
      return { kind: 'clear' };
    }
    let edits = 0;
    for (let index = events.length - 1; index >= 0; index--) {
      const event = events[index]!;
      if (
        edits > 0 &&
        ((event.toolName === 'get_kernel_result' && event.targetFile === tail.targetFile && !event.isError) ||
          (event.toolName === 'test_model' &&
            event.verification?.outcome === 'passed' &&
            (event.verification.coversAll || event.verification.files.includes(tail.targetFile))))
      ) {
        return { kind: 'clear' };
      }
      if (event.isMutation && event.targetFile === tail.targetFile) {
        edits++;
      }
    }
    return edits >= thresholds.perTargetEdit
      ? {
          kind: 'nudge',
          pattern: anomalyPattern.perTargetEdit,
          reminder: `You have edited \`${tail.targetFile}\` ${edits} times without verifying the kernel output between attempts.

After each edit, call \`get_kernel_result\` for that file before editing again. Repeated edits without checking the kernel result usually mean the previous diff did not produce the change you intended — re-read the file or inspect the kernel error before continuing.`,
          signature: `per_target_edit:${tail.targetFile}:${edits}`,
          eventIndexes: indexes(events.slice(-edits)),
        }
      : { kind: 'clear' };
  },
  (events) => {
    const required = thresholds.pingPongCycles * 2;
    const tail = events.slice(-required);
    if (tail.length < required) {
      return { kind: 'clear' };
    }
    const a = callSignature(tail[0]!);
    const b = callSignature(tail[1]!);
    if (!a || !b || a === b || tail.some((event, index) => callSignature(event) !== (index % 2 === 0 ? a : b))) {
      return { kind: 'clear' };
    }
    return {
      kind: 'nudge',
      pattern: anomalyPattern.pingPong,
      reminder: `You have alternated between \`${tail[0]!.toolName}\` and \`${tail[1]!.toolName}\` with the same arguments. This indicates you are stuck in a 2-step loop.

Step back and decide: do you actually need both tools, or is one of them giving you stale information you keep refreshing? Pick a different approach (a different tool, a different file, asking the user for clarification) instead of toggling between these two.`,
      signature: `ping_pong:${a}:${b}`,
      eventIndexes: indexes(tail),
    };
  },
  (events) => {
    const tail = events.at(-1);
    const signature = tail?.isEmptyResult ? callSignature(tail) : undefined;
    if (!tail || !signature) {
      return { kind: 'clear' };
    }
    let count = 0;
    for (
      let index = events.length - 1;
      index >= 0 && events[index]!.isEmptyResult && callSignature(events[index]!) === signature;
      index--
    ) {
      count++;
    }
    return count >= thresholds.emptyResult
      ? {
          kind: 'nudge',
          pattern: anomalyPattern.emptyResult,
          reminder: `\`${tail.toolName}\` returned no results ${count} times in a row.

  Arguments: ${tail.argsPreview ?? '<unknown>'}

The query is unlikely to find anything no matter how many times you retry it. Broaden the pattern, search a different path, or use a different tool (e.g. \`list_directory\` to discover what actually exists).`,
          signature: `empty_result:${signature}`,
          eventIndexes: indexes(events.slice(-count)),
        }
      : { kind: 'clear' };
  },
  (events) => {
    const tail = events.at(-1);
    if (!tail?.isError || !tail.errorCode || !tail.argsHash) {
      return { kind: 'clear' };
    }
    const matching = events
      .slice(-thresholds.sameErrorDifferentArgsWindow)
      .filter(
        (event) =>
          event.isError && event.argsHash && event.toolName === tail.toolName && event.errorCode === tail.errorCode,
      );
    if (
      matching.length < thresholds.sameErrorDifferentArgsCount ||
      new Set(matching.map((event) => event.argsHash)).size < thresholds.sameErrorDifferentArgsDistinctArgs
    ) {
      return { kind: 'clear' };
    }
    return {
      kind: 'nudge',
      pattern: anomalyPattern.sameErrorDifferentArgs,
      reminder: `\`${tail.toolName}\` has failed ${matching.length} times with the same error code (\`${tail.errorCode}\`) across different arguments.${tail.errorPreview ? `\n\n  Last error: ${tail.errorPreview}` : ''}

The shape of the input is not the problem — something about the tool, the environment, or the underlying file/state is. Stop varying the arguments and either inspect the surrounding code/state or report the issue to the user.`,
      signature: `same_error_different_args:${tail.toolName}:${tail.errorCode}`,
      eventIndexes: indexes(matching),
    };
  },
];

const lastAssistantMatchesSignature = async (
  messages: readonly AgentMessage[],
  signature: string,
  hash: (input: string) => Promise<string>,
): Promise<boolean> => {
  const message = messages.findLast(
    (candidate): candidate is Extract<AgentMessage, { role: 'assistant' }> => candidate.role === 'assistant',
  );
  if (!message) {
    return false;
  }
  const calls = await Promise.all(
    message.content
      .filter((block) => block.type === 'toolCall')
      .map(async (block) => `${block.name}:${await hash(canonicalJson(block.arguments))}`),
  );
  return calls.some((call) => signature === call || signature.startsWith(`${call}:`));
};

const zeroUsage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

/** Durable audit payload emitted when a safeguard fires. @public */
export type SafeguardRecord = Exclude<SafeguardDetection, { readonly kind: 'clear' }>;

/** Follow-up observation for the most recent safeguard nudge. @public */
export type SafeguardOutcome = {
  readonly pattern: AnomalyPattern;
  readonly signature: string;
  readonly helped: boolean;
};

type CreateSafeguardsOptions = {
  readonly thresholds?: Partial<SafeguardThresholds> | undefined;
  readonly detectors?: readonly SafeguardDetector[] | undefined;
  readonly firedSignatures?: Iterable<string> | undefined;
  readonly record: (decision: SafeguardRecord, reminder?: AgentMessage) => Promise<void>;
  readonly recordOutcome?: ((outcome: SafeguardOutcome) => Promise<void>) | undefined;
  readonly hash?: ((input: string) => Promise<string>) | undefined;
};

/** Port safeguard detection onto pi's ephemeral context and short-circuit stream seams. @public */
export const createAgentSafeguards = (
  options: CreateSafeguardsOptions,
): {
  readonly transformContext: (messages: AgentMessage[]) => Promise<AgentMessage[]>;
  readonly wrapStreamFn: (base: StreamFn) => StreamFn;
  readonly firedSignatures: ReadonlySet<string>;
} => {
  const thresholds = { ...defaultSafeguardThresholds, ...options.thresholds };
  const detectors = options.detectors ?? buildDetectors(thresholds);
  const fired = new Set(options.firedSignatures);
  const hash = options.hash ?? browserHash;
  let lastNudge: { readonly pattern: AnomalyPattern; readonly signature: string } | undefined;
  let terminate: Extract<SafeguardDetection, { readonly kind: 'terminate' }> | undefined;

  const transformContext = async (messages: AgentMessage[]): Promise<AgentMessage[]> => {
    if (lastNudge) {
      const pending = lastNudge;
      lastNudge = undefined;
      await options.recordOutcome?.({
        ...pending,
        helped: !(await lastAssistantMatchesSignature(messages, pending.signature, hash)),
      });
    }

    const events = await summarizeToolEvents(messages, hash);
    let selected: SafeguardRecord | undefined;
    for (const detector of detectors) {
      const detection = detector(events);
      if (detection.kind === 'clear' || (detection.kind === 'nudge' && fired.has(detection.signature))) {
        continue;
      }
      selected = detection;
      break;
    }
    if (!selected) {
      return messages;
    }
    if (selected.kind === 'terminate') {
      await options.record(selected);
      terminate = selected;
      return messages;
    }
    const reminder: AgentMessage = {
      role: 'user',
      content: [{ type: 'text', text: `<system-reminder>\n${selected.reminder}\n</system-reminder>` }],
      timestamp: 0,
    };
    await options.record(selected, reminder);
    fired.add(selected.signature);
    lastNudge = { pattern: selected.pattern, signature: selected.signature };
    return [...messages, reminder];
  };

  const wrapStreamFunction =
    (base: StreamFn): StreamFn =>
    async (model, context, streamOptions) => {
      const pending = terminate;
      if (!pending) {
        return base(model, context, streamOptions);
      }
      terminate = undefined;
      const stream = createAssistantMessageEventStream();
      const message: AssistantMessage = {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: `I'm stopping this run early to prevent a runaway loop. Detector: \`${pending.pattern}\`.

${pending.reason}

Please review what was attempted, and either rephrase the request or correct the underlying issue (file content, test expectations, environment) before asking me to retry.`,
          },
        ],
        api: model.api,
        provider: model.provider,
        model: model.id,
        usage: zeroUsage,
        stopReason: 'stop',
        timestamp: Date.now(),
      };
      stream.push({ type: 'start', partial: message });
      stream.push({ type: 'done', reason: 'stop', message });
      return stream;
    };

  return { transformContext, wrapStreamFn: wrapStreamFunction, firedSignatures: fired };
};
