import { createHash } from 'node:crypto';
import { createMiddleware } from 'langchain';
import type { AgentMiddleware } from 'langchain';
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { toolName } from '@taucad/chat/constants';
import { AttributeKey, GenAiSafeguardAction, GenAiSafeguardHelped } from '@taucad/telemetry';
import type { ChatRpcService } from '#api/chat/chat-rpc.service.js';
import type { ModelService } from '#api/models/model.service.js';
import type { MetricsService } from '#telemetry/metrics.js';
import { appendTranscriptLine } from '#api/chat/middleware/transcript.middleware.js';

// =============================================================================
// Public types
// =============================================================================

/**
 * Anti-pattern identifiers, one per detector. These appear as the
 * `gen_ai.agent.safeguard.pattern` attribute on the
 * `gen_ai.agent.safeguard.interventions` counter and as the `pattern`
 * field on safeguard transcript lines.
 */
export const anomalyPattern = {
  identicalError: 'identical_error',
  identicalCall: 'identical_call',
  perTargetEdit: 'per_target_edit',
  pingPong: 'ping_pong',
  emptyResult: 'empty_result',
  noForwardProgress: 'no_forward_progress',
  sameErrorDifferentArgs: 'same_error_different_args',
} as const;

export type AnomalyPattern = (typeof anomalyPattern)[keyof typeof anomalyPattern];

/**
 * Compact summary of one tool round-trip (`AIMessage(tool_call)` paired with
 * its `ToolMessage` result). Detectors operate exclusively on these summaries
 * so they remain pure and trivially unit-testable.
 */
export type ToolEventSummary = {
  /** Position of the `ToolMessage` in `state.messages`. */
  index: number;
  toolName: string;
  /** First 16 hex chars of `sha256(canonicalJson(args))`. */
  argsHash: string;
  /** Stable preview of args (≤80 chars, single line) for reminder text. */
  argsPreview: string;
  /** Set when the tool returned a structured `ToolExecutionError`. */
  errorCode?: string;
  /** First 16 hex chars of `sha256(errorCode + ':' + message)`. */
  errorHash?: string;
  /** Stable preview of the error message (≤120 chars, single line). */
  errorPreview?: string;
  /** True when `ToolMessage.status === 'error'` OR a structured tool error was decoded. */
  isError: boolean;
  /** True when this tool call returned a recognised "no results" success shape (AP5). */
  isEmptyResult: boolean;
  /** True for tools that mutate the user's filesystem (`edit_file` / `create_file` / `delete_file`). */
  isMutation: boolean;
  /**
   * Optional `targetFile` extracted from args when the tool operates on a single
   * file (used by AP3 to track per-file thrash without an intervening kernel flip).
   */
  targetFile?: string;
};

/**
 * Detector decision for a single evaluation round.
 *
 * - `clear` — no anomaly detected, advance to the next detector.
 * - `nudge` — append a `<system-reminder>` HumanMessage to state.messages so
 *   the model sees the reminder on the next iteration. Cache-prefix safe.
 * - `terminate` — short-circuit the model call with a synthetic AIMessage
 *   (no `tool_calls`), ending the agent loop.
 */
export type Detection =
  | { kind: 'clear' }
  | {
      kind: 'nudge';
      pattern: AnomalyPattern;
      reminder: string;
      signature: string;
    }
  | {
      kind: 'terminate';
      pattern: AnomalyPattern;
      reason: string;
      signature: string;
    };

/**
 * Per-detector evaluator. Pure function over the summarised tool tail and the
 * cumulative middleware state. Implementations must NEVER mutate inputs and
 * MUST produce byte-identical reminder text for byte-identical inputs
 * (deterministic reminder bodies for cache hits).
 */
export type Detector = {
  pattern: AnomalyPattern;
  evaluate(events: ToolEventSummary[], state: SafeguardsState): Detection;
};

export type ThresholdConfig = {
  identicalErrorNudge: number;
  identicalErrorTerminate: number;
  identicalCall: number;
  perTargetEdit: number;
  pingPongCycles: number;
  emptyResult: number;
  noForwardProgress: number;
  sameErrorDifferentArgsCount: number;
  sameErrorDifferentArgsWindow: number;
  sameErrorDifferentArgsDistinctArgs: number;
};

/**
 * Default detector thresholds tuned to catch doom-loops (repeated identical
 * errors, runaway identical tool calls, ping-pong patterns). Per-detector
 * overrides can be supplied to {@link createAgentSafeguardsMiddleware} for tests.
 */
export const defaultThresholds: ThresholdConfig = {
  identicalErrorNudge: 3,
  identicalErrorTerminate: 6,
  identicalCall: 5,
  perTargetEdit: 5,
  pingPongCycles: 2,
  emptyResult: 3,
  noForwardProgress: 8,
  sameErrorDifferentArgsCount: 5,
  sameErrorDifferentArgsWindow: 8,
  sameErrorDifferentArgsDistinctArgs: 2,
};

// =============================================================================
// Hash + canonicalisation utilities
// =============================================================================

/**
 * Stable JSON serialisation: keys are sorted recursively so that
 * `{a:1, b:2}` and `{b:2, a:1}` hash identically. Cycles are detected and
 * replaced with the literal string `"[Circular]"` to avoid throwing.
 */
export function canonicalJson(value: unknown): string {
  const seen = new WeakSet<Record<string, unknown>>();

  const visit = (input: unknown): unknown => {
    if (input === null || typeof input !== 'object') {
      return input;
    }

    const record = input as Record<string, unknown>;
    if (seen.has(record)) {
      return '[Circular]';
    }
    seen.add(record);

    if (Array.isArray(input)) {
      return input.map((item) => visit(item));
    }

    const sortedKeys = Object.keys(record).sort();
    const result: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      result[key] = visit(record[key]);
    }
    return result;
  };

  return JSON.stringify(visit(value));
}

const sha256Short = (input: string): string => createHash('sha256').update(input).digest('hex').slice(0, 16);

/** First 16 hex chars of `sha256(canonicalJson(args))`. */
export const canonicalArgsHash = (args: unknown): string => sha256Short(canonicalJson(args ?? null));

/** First 16 hex chars of `sha256(errorCode + ':' + message)`. */
export const errorHash = (message: string, errorCode?: string): string => sha256Short(`${errorCode ?? ''}:${message}`);

// =============================================================================
// Message → ToolEventSummary projection
// =============================================================================

const mutationToolNames = new Set<string>([toolName.editFile, toolName.createFile, toolName.deleteFile]);

const targetFileTools = new Set<string>([
  toolName.editFile,
  toolName.createFile,
  toolName.deleteFile,
  toolName.readFile,
  toolName.getKernelResult,
  toolName.exportGeometry,
  toolName.screenshot,
  toolName.testModel,
]);

const oneLine = (input: string, max: number): string => {
  const collapsed = input.replaceAll(/\s+/g, ' ').trim();
  return collapsed.length > max ? `${collapsed.slice(0, max - 1)}…` : collapsed;
};

const messageContent = (message: BaseMessage): string =>
  typeof message.content === 'string' ? message.content : JSON.stringify(message.content);

type ParsedToolError = { errorCode?: string; message?: string };

const parseToolError = (content: string): ParsedToolError | undefined => {
  try {
    const parsed: unknown = JSON.parse(content);
    if (parsed !== null && typeof parsed === 'object' && 'errorCode' in parsed) {
      const record = parsed as Record<string, unknown>;
      const errorCode = typeof record['errorCode'] === 'string' ? record['errorCode'] : undefined;
      const message = typeof record['message'] === 'string' ? record['message'] : undefined;
      return { errorCode, message };
    }
  } catch {
    // Not JSON; treated as opaque error text below.
  }
  return undefined;
};

const isEmptyResultPayload = (toolNameValue: string, content: string): boolean => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return false;
  }

  if (parsed === null || typeof parsed !== 'object') {
    return false;
  }

  const record = parsed as Record<string, unknown>;

  if (toolNameValue === toolName.grep) {
    const total = record['totalMatches'];
    return typeof total === 'number' && total === 0;
  }

  if (toolNameValue === toolName.globSearch) {
    const total = record['totalFiles'];
    return typeof total === 'number' && total === 0;
  }

  if (toolNameValue === toolName.webSearch) {
    return Array.isArray(parsed) && parsed.length === 0;
  }

  return false;
};

const extractTargetFile = (args: Record<string, unknown> | undefined): string | undefined => {
  if (!args) {
    return undefined;
  }
  const candidate =
    args['targetFile'] ?? args['path'] ?? args['filePath'] ?? args['filepath'] ?? args['file'] ?? args['target'];
  return typeof candidate === 'string' ? candidate : undefined;
};

type ToolCallInfo = { name: string; args: Record<string, unknown> | undefined };

const indexToolCalls = (messages: BaseMessage[]): Map<string, ToolCallInfo> => {
  const toolCallById = new Map<string, ToolCallInfo>();
  for (const message of messages) {
    if (!(message instanceof AIMessage) || !message.tool_calls) {
      continue;
    }
    for (const call of message.tool_calls) {
      if (call.id) {
        toolCallById.set(call.id, { name: call.name, args: call.args });
      }
    }
  }
  return toolCallById;
};

type ErrorFields = {
  errorCode?: string;
  errorHash?: string;
  errorPreview?: string;
};

const deriveErrorFields = (isStatusError: boolean, content: string): ErrorFields => {
  if (!isStatusError) {
    return {};
  }
  const parsedError = parseToolError(content);
  const errorCode = parsedError?.errorCode ?? 'UNKNOWN_ERROR';
  const errorMessageText = parsedError?.message ?? content;
  return {
    errorCode,
    errorHash: errorHash(errorMessageText, errorCode),
    errorPreview: oneLine(errorMessageText, 120),
  };
};

const summarizeOne = (input: {
  index: number;
  message: BaseMessage;
  callInfo: ToolCallInfo | undefined;
}): ToolEventSummary | undefined => {
  const { index, message, callInfo } = input;
  if (!(message instanceof ToolMessage)) {
    return undefined;
  }
  const toolNameValue = message.name ?? callInfo?.name;
  if (!toolNameValue) {
    return undefined;
  }

  const args = callInfo?.args;
  const content = messageContent(message);
  const isStatusError = message.status === 'error';
  const errorFields = deriveErrorFields(isStatusError, content);
  const targetFile = targetFileTools.has(toolNameValue) ? extractTargetFile(args) : undefined;

  return {
    index,
    toolName: toolNameValue,
    argsHash: canonicalArgsHash(args),
    argsPreview: oneLine(canonicalJson(args ?? null), 80),
    ...errorFields,
    isError: isStatusError,
    isEmptyResult: !isStatusError && isEmptyResultPayload(toolNameValue, content),
    isMutation: mutationToolNames.has(toolNameValue),
    ...(targetFile ? { targetFile } : {}),
  };
};

/**
 * Projects `state.messages` onto a list of {@link ToolEventSummary}. Each
 * `ToolMessage` is paired with its preceding `AIMessage(tool_calls)` to recover
 * the tool name and arguments. Messages that don't form a complete pair (e.g.
 * an in-flight `AIMessage(tool_calls)` whose `ToolMessage` hasn't arrived yet)
 * are skipped.
 */
export function summarizeMessages(messages: BaseMessage[]): ToolEventSummary[] {
  const toolCallById = indexToolCalls(messages);
  const events: ToolEventSummary[] = [];
  for (const [index, message] of messages.entries()) {
    if (!(message instanceof ToolMessage)) {
      continue;
    }
    const callInfo = toolCallById.get(message.tool_call_id);
    const event = summarizeOne({ index, message, callInfo });
    if (event) {
      events.push(event);
    }
  }
  return events;
}

// =============================================================================
// State + context schemas
// =============================================================================

const safeguardsContextSchema = z.object({
  modelId: z.string().optional(),
  modelService: z.custom<ModelService>().optional(),
  chatId: z.string(),
});

const safeguardsStateSchema = z.object({
  /** Signatures that have already triggered a nudge in this run. De-duped. */
  _safeguardSignaturesFired: z.array(z.string()).default([]),
  /** Signature of the most recent intervention; cleared after `helped` resolves. */
  _safeguardLastSignature: z.string().optional(),
  /** Pattern of the most recent intervention; cleared after `helped` resolves. */
  _safeguardLastPattern: z.string().optional(),
  /** Set by `beforeModel` when a `terminate` decision is taken; consumed by `wrapModelCall`. */
  _safeguardTerminate: z
    .object({
      pattern: z.string(),
      reason: z.string(),
      signature: z.string(),
    })
    .optional(),
});

export type SafeguardsState = z.infer<typeof safeguardsStateSchema>;

// =============================================================================
// Reminder templates (deterministic, no Date.now / UUID / counters)
// =============================================================================

/**
 * Builds the canonical "doom-loop" reminder message used by AP1 / AP2.
 * The same inputs MUST always produce the same output — there are no
 * timestamps, UUIDs, or run identifiers in the body.
 */
export function identicalErrorReminder(input: {
  toolName: string;
  argsPreview: string;
  errorPreview?: string;
  count: number;
}): string {
  const { toolName: name, argsPreview, errorPreview, count } = input;
  const errorLine = errorPreview ? `  Error: ${errorPreview}\n` : '';
  return `You called \`${name}\` with the same arguments and received the same error ${count} times in a row:

  Arguments: ${argsPreview}
${errorLine}
Identical retries will not change the result. Stop and choose ONE of:
  1. Read the source file or test fixture to understand why this is failing.
  2. Try a structurally different approach (different tool, different arguments).
  3. Report the failure to the user with what you tried and what you observed.

Do NOT call \`${name}\` with these arguments again.`;
}

export function identicalCallReminder(input: { toolName: string; argsPreview: string; count: number }): string {
  const { toolName: name, argsPreview, count } = input;
  return `You called \`${name}\` with identical arguments ${count} times. The result will not change between calls.

  Arguments: ${argsPreview}

If you need fresh data, change the arguments. If you already have the result, use it from the prior call instead of re-invoking the tool.`;
}

export function perTargetEditReminder(input: { targetFile: string; count: number }): string {
  const { targetFile, count } = input;
  return `You have edited \`${targetFile}\` ${count} times without verifying the kernel output between attempts.

After each edit, call \`get_kernel_result\` for that file before editing again. Repeated edits without checking the kernel result usually mean the previous diff did not produce the change you intended — re-read the file or inspect the kernel error before continuing.`;
}

export function pingPongReminder(input: { toolA: string; toolB: string }): string {
  const { toolA, toolB } = input;
  return `You have alternated between \`${toolA}\` and \`${toolB}\` with the same arguments. This indicates you are stuck in a 2-step loop.

Step back and decide: do you actually need both tools, or is one of them giving you stale information you keep refreshing? Pick a different approach (a different tool, a different file, asking the user for clarification) instead of toggling between these two.`;
}

export function emptyResultReminder(input: { toolName: string; argsPreview: string; count: number }): string {
  const { toolName: name, argsPreview, count } = input;
  return `\`${name}\` returned no results ${count} times in a row.

  Arguments: ${argsPreview}

The query is unlikely to find anything no matter how many times you retry it. Broaden the pattern, search a different path, or use a different tool (e.g. \`list_directory\` to discover what actually exists).`;
}

export function noForwardProgressReminder(input: { count: number }): string {
  const { count } = input;
  return `You have made ${count} consecutive read-only tool calls without editing any file.

If you are gathering context, summarise what you have learned and either propose a concrete code change (\`edit_file\` / \`create_file\`) or report your findings to the user. Continuing to read without acting is not making progress on the task.`;
}

export function sameErrorDifferentArgsReminder(input: {
  toolName: string;
  errorCode: string;
  count: number;
  errorPreview?: string;
}): string {
  const { toolName: name, errorCode, count, errorPreview } = input;
  const errorLine = errorPreview ? `\n  Last error: ${errorPreview}` : '';
  return `\`${name}\` has failed ${count} times with the same error code (\`${errorCode}\`) across different arguments.${errorLine}

The shape of the input is not the problem — something about the tool, the environment, or the underlying file/state is. Stop varying the arguments and either inspect the surrounding code/state or report the issue to the user.`;
}

export function terminationReminder(input: { pattern: AnomalyPattern; reason: string }): string {
  return `I'm stopping this run early to prevent a runaway loop. Detector: \`${input.pattern}\`.

${input.reason}

Please review what was attempted, and either rephrase the request or correct the underlying issue (file content, test expectations, environment) before asking me to retry.`;
}

// =============================================================================
// Detector implementations
// =============================================================================

const lastSignature = (event: ToolEventSummary): string =>
  `${event.toolName}:${event.argsHash}:${event.errorHash ?? '-'}`;

const callSignature = (event: ToolEventSummary): string => `${event.toolName}:${event.argsHash}`;

const identicalErrorDetector = (thresholds: ThresholdConfig): Detector => ({
  pattern: anomalyPattern.identicalError,

  evaluate(events) {
    if (events.length < thresholds.identicalErrorNudge) {
      return { kind: 'clear' };
    }

    const tail = events.at(-1);
    if (!tail || !tail.isError) {
      return { kind: 'clear' };
    }

    const signature = lastSignature(tail);
    let consecutive = 0;
    for (let index = events.length - 1; index >= 0; index--) {
      const event = events[index];
      if (!event) {
        break;
      }
      if (event.isError && lastSignature(event) === signature) {
        consecutive += 1;
        continue;
      }
      break;
    }

    if (consecutive >= thresholds.identicalErrorTerminate) {
      return {
        kind: 'terminate',
        pattern: anomalyPattern.identicalError,
        reason: `\`${tail.toolName}\` failed identically ${consecutive} times in a row.`,
        signature,
      };
    }

    if (consecutive >= thresholds.identicalErrorNudge) {
      return {
        kind: 'nudge',
        pattern: anomalyPattern.identicalError,
        reminder: identicalErrorReminder({
          toolName: tail.toolName,
          argsPreview: tail.argsPreview,
          errorPreview: tail.errorPreview,
          count: consecutive,
        }),
        signature,
      };
    }

    return { kind: 'clear' };
  },
});

const identicalCallDetector = (thresholds: ThresholdConfig): Detector => ({
  pattern: anomalyPattern.identicalCall,

  evaluate(events) {
    if (events.length < thresholds.identicalCall) {
      return { kind: 'clear' };
    }

    const tail = events.at(-1);
    if (!tail) {
      return { kind: 'clear' };
    }

    const signature = callSignature(tail);
    let consecutive = 0;
    for (let index = events.length - 1; index >= 0; index--) {
      const event = events[index];
      if (event && callSignature(event) === signature) {
        consecutive += 1;
        continue;
      }
      break;
    }

    if (consecutive < thresholds.identicalCall) {
      return { kind: 'clear' };
    }

    return {
      kind: 'nudge',
      pattern: anomalyPattern.identicalCall,
      reminder: identicalCallReminder({
        toolName: tail.toolName,
        argsPreview: tail.argsPreview,
        count: consecutive,
      }),
      signature: `${signature}:any-result`,
    };
  },
});

const perTargetEditDetector = (thresholds: ThresholdConfig): Detector => ({
  pattern: anomalyPattern.perTargetEdit,

  evaluate(events) {
    const tail = events.at(-1);
    if (!tail || !tail.isMutation || !tail.targetFile) {
      return { kind: 'clear' };
    }

    const { targetFile } = tail;
    let edits = 0;
    for (let index = events.length - 1; index >= 0; index--) {
      const event = events[index];
      if (!event) {
        break;
      }

      if (
        event.toolName === toolName.getKernelResult &&
        event.targetFile === targetFile &&
        !event.isError &&
        edits > 0
      ) {
        return { kind: 'clear' };
      }

      if (event.isMutation && event.targetFile === targetFile) {
        edits += 1;
      }
    }

    if (edits < thresholds.perTargetEdit) {
      return { kind: 'clear' };
    }

    return {
      kind: 'nudge',
      pattern: anomalyPattern.perTargetEdit,
      reminder: perTargetEditReminder({ targetFile, count: edits }),
      signature: `per_target_edit:${targetFile}:${edits}`,
    };
  },
});

const pingPongDetector = (thresholds: ThresholdConfig): Detector => ({
  pattern: anomalyPattern.pingPong,

  evaluate(events) {
    const required = thresholds.pingPongCycles * 2;
    if (events.length < required) {
      return { kind: 'clear' };
    }

    const tail = events.slice(-required);
    const first = tail[0];
    const second = tail[1];
    if (!first || !second) {
      return { kind: 'clear' };
    }

    const sigA = callSignature(first);
    const sigB = callSignature(second);
    if (sigA === sigB) {
      return { kind: 'clear' };
    }

    for (const [index, event] of tail.entries()) {
      const expected = index % 2 === 0 ? sigA : sigB;
      if (callSignature(event) !== expected) {
        return { kind: 'clear' };
      }
    }

    return {
      kind: 'nudge',
      pattern: anomalyPattern.pingPong,
      reminder: pingPongReminder({ toolA: first.toolName, toolB: second.toolName }),
      signature: `ping_pong:${sigA}:${sigB}`,
    };
  },
});

const emptyResultDetector = (thresholds: ThresholdConfig): Detector => ({
  pattern: anomalyPattern.emptyResult,

  evaluate(events) {
    if (events.length < thresholds.emptyResult) {
      return { kind: 'clear' };
    }

    const tail = events.at(-1);
    if (!tail || !tail.isEmptyResult) {
      return { kind: 'clear' };
    }

    const signature = callSignature(tail);
    let consecutive = 0;
    for (let index = events.length - 1; index >= 0; index--) {
      const event = events[index];
      if (event?.isEmptyResult && callSignature(event) === signature) {
        consecutive += 1;
        continue;
      }
      break;
    }

    if (consecutive < thresholds.emptyResult) {
      return { kind: 'clear' };
    }

    return {
      kind: 'nudge',
      pattern: anomalyPattern.emptyResult,
      reminder: emptyResultReminder({
        toolName: tail.toolName,
        argsPreview: tail.argsPreview,
        count: consecutive,
      }),
      signature: `empty_result:${signature}`,
    };
  },
});

const noForwardProgressDetector = (thresholds: ThresholdConfig): Detector => ({
  pattern: anomalyPattern.noForwardProgress,

  evaluate(events) {
    if (events.length < thresholds.noForwardProgress) {
      return { kind: 'clear' };
    }

    const tail = events.slice(-thresholds.noForwardProgress);
    if (tail.some((event) => event.isMutation)) {
      return { kind: 'clear' };
    }

    const tailLast = tail.at(-1);
    if (!tailLast) {
      return { kind: 'clear' };
    }

    return {
      kind: 'nudge',
      pattern: anomalyPattern.noForwardProgress,
      reminder: noForwardProgressReminder({ count: tail.length }),
      signature: `no_forward_progress:${tailLast.index}`,
    };
  },
});

const sameErrorDifferentArgsDetector = (thresholds: ThresholdConfig): Detector => ({
  pattern: anomalyPattern.sameErrorDifferentArgs,

  evaluate(events) {
    if (events.length < thresholds.sameErrorDifferentArgsCount) {
      return { kind: 'clear' };
    }

    const tail = events.at(-1);
    if (!tail || !tail.isError || !tail.errorCode) {
      return { kind: 'clear' };
    }

    const window = events.slice(-thresholds.sameErrorDifferentArgsWindow);
    const matching = window.filter(
      (event) => event.isError && event.toolName === tail.toolName && event.errorCode === tail.errorCode,
    );
    if (matching.length < thresholds.sameErrorDifferentArgsCount) {
      return { kind: 'clear' };
    }

    const distinctArgs = new Set(matching.map((event) => event.argsHash));
    if (distinctArgs.size < thresholds.sameErrorDifferentArgsDistinctArgs) {
      return { kind: 'clear' };
    }

    return {
      kind: 'nudge',
      pattern: anomalyPattern.sameErrorDifferentArgs,
      reminder: sameErrorDifferentArgsReminder({
        toolName: tail.toolName,
        errorCode: tail.errorCode,
        count: matching.length,
        errorPreview: tail.errorPreview,
      }),
      signature: `same_error_different_args:${tail.toolName}:${tail.errorCode}`,
    };
  },
});

/**
 * Default detector chain. Order matters: the first detector to return
 * `nudge` / `terminate` short-circuits the chain (single intervention per
 * turn). Most-specific detectors (`identicalError` / `identicalCall`) run
 * before broader pattern detectors (`noForwardProgress`).
 */
export const buildDefaultDetectors = (thresholds: ThresholdConfig = defaultThresholds): Detector[] => [
  identicalErrorDetector(thresholds),
  identicalCallDetector(thresholds),
  perTargetEditDetector(thresholds),
  pingPongDetector(thresholds),
  emptyResultDetector(thresholds),
  sameErrorDifferentArgsDetector(thresholds),
  noForwardProgressDetector(thresholds),
];

// =============================================================================
// Middleware
// =============================================================================

type CreateOptions = {
  thresholds?: Partial<ThresholdConfig>;
  detectors?: Detector[];
};

/**
 * Builds metric attributes for a single safeguard intervention. Centralised so
 * the `helped` follow-up emission (recorded on the *next* turn) shares a
 * single source of truth with the original `nudge`/`terminate` recording.
 */
function safeguardAttributes(input: {
  pattern: string;
  action: 'nudge' | 'terminate';
  helped?: boolean;
  modelId?: string;
  modelService?: ModelService;
}): Record<string, string> {
  const { pattern, action, helped, modelId, modelService } = input;
  const attributes: Record<string, string> = {
    [AttributeKey.GEN_AI_SAFEGUARD_PATTERN]: pattern,
    [AttributeKey.GEN_AI_SAFEGUARD_ACTION]: action,
  };
  if (modelId) {
    attributes[AttributeKey.GEN_AI_REQUEST_MODEL] = modelId;
    const otelProviderName = modelService?.getOtelProviderName(modelId);
    if (otelProviderName) {
      attributes[AttributeKey.GEN_AI_PROVIDER_NAME] = otelProviderName;
    }
  }
  if (helped !== undefined) {
    attributes[AttributeKey.GEN_AI_SAFEGUARD_HELPED] = helped ? GenAiSafeguardHelped.TRUE : GenAiSafeguardHelped.FALSE;
  }
  return attributes;
}

const lastAiMessage = (messages: BaseMessage[]): AIMessage | undefined => {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message instanceof AIMessage) {
      return message;
    }
  }
  return undefined;
};

const matchesSignature = (aiMessage: AIMessage | undefined, signature: string): boolean => {
  if (!aiMessage?.tool_calls || aiMessage.tool_calls.length === 0) {
    return false;
  }
  return aiMessage.tool_calls.some((call) => {
    const sig = `${call.name}:${canonicalArgsHash(call.args)}`;
    return signature === sig || signature.startsWith(`${sig}:`);
  });
};

/**
 * Creates the agent loop safeguards middleware (doom-loop detection: nudges,
 * terminations, transcript audit lines).
 *
 * Cache-safety (prompt prefix stability):
 * - Nudges are emitted via {@link AgentMiddleware.beforeModel} as a state
 *   update `{ messages: [HumanMessage('<system-reminder>...</system-reminder>')] }`
 *   so they are persisted into the canonical message history. The downstream
 *   `promptCachingMiddleware` then anchors its single ephemeral breakpoint on
 *   the new last message and the prefix stays cache-stable.
 * - Terminations are surfaced via `_safeguardTerminate` and short-circuited
 *   inside `wrapModelCall` with a synthetic `AIMessage` (no `tool_calls`) so
 *   the model call is bypassed entirely.
 * - Reminder text is byte-deterministic for byte-identical inputs (no
 *   timestamps, UUIDs, or run identifiers).
 */
export const createAgentSafeguardsMiddleware = (
  metricsService: MetricsService,
  chatRpcService: ChatRpcService,
  options: CreateOptions = {},
): AgentMiddleware => {
  const thresholds: ThresholdConfig = { ...defaultThresholds, ...options.thresholds };
  const detectors = options.detectors ?? buildDefaultDetectors(thresholds);

  return createMiddleware({
    name: 'AgentSafeguards',
    contextSchema: safeguardsContextSchema,
    stateSchema: safeguardsStateSchema,

    beforeModel(state, runtime) {
      const { messages } = state;
      const { chatId, modelId, modelService } = runtime.context;

      const helpedUpdate = resolveHelpedTelemetry({
        state,
        messages,
        metricsService,
        modelId,
        modelService,
      });

      const events = summarizeMessages(messages);
      const alreadyFired = new Set(state._safeguardSignaturesFired);

      for (const detector of detectors) {
        const detection = detector.evaluate(events, state);
        if (detection.kind === 'clear') {
          continue;
        }

        if (detection.kind === 'nudge' && alreadyFired.has(detection.signature)) {
          continue;
        }

        const action = detection.kind === 'nudge' ? GenAiSafeguardAction.NUDGE : GenAiSafeguardAction.TERMINATE;
        metricsService.genAiAgentSafeguardInterventions.add(
          1,
          safeguardAttributes({
            pattern: detection.pattern,
            action,
            modelId,
            modelService,
          }),
        );

        void appendTranscriptLine(chatRpcService, chatId, {
          role: 'safeguard',
          pattern: detection.pattern,
          action,
          signature: detection.signature,
          timestamp: new Date().toISOString(),
        });

        if (detection.kind === 'terminate') {
          return {
            ...helpedUpdate,
            _safeguardTerminate: {
              pattern: detection.pattern,
              reason: detection.reason,
              signature: detection.signature,
            },
          };
        }

        const nudge = new HumanMessage({
          content: `<system-reminder>\n${detection.reminder}\n</system-reminder>`,
        });

        return {
          ...helpedUpdate,
          messages: [nudge],
          _safeguardSignaturesFired: [...state._safeguardSignaturesFired, detection.signature],
          _safeguardLastSignature: detection.signature,
          _safeguardLastPattern: detection.pattern,
        };
      }

      return helpedUpdate;
    },

    async wrapModelCall(request, handler) {
      const term = (request.state as SafeguardsState)._safeguardTerminate;
      if (term) {
        return new AIMessage({
          content: terminationReminder({
            pattern: term.pattern as AnomalyPattern,
            reason: term.reason,
          }),
        });
      }
      return handler(request);
    },
  });
};

type HelpedUpdate =
  | { _safeguardLastSignature?: undefined; _safeguardLastPattern?: undefined }
  // oxlint-disable-next-line typescript/no-redundant-type-constituents -- intent is "no update" vs "clear"
  | Record<string, never>;

function resolveHelpedTelemetry(input: {
  state: SafeguardsState;
  messages: BaseMessage[];
  metricsService: MetricsService;
  modelId?: string;
  modelService?: ModelService;
}): HelpedUpdate {
  const { state, messages, metricsService, modelId, modelService } = input;
  const { _safeguardLastSignature: lastSig, _safeguardLastPattern: lastPattern } = state;
  if (!lastSig || !lastPattern) {
    return {};
  }

  const aiMessage = lastAiMessage(messages);
  const helped = !matchesSignature(aiMessage, lastSig);

  metricsService.genAiAgentSafeguardInterventions.add(
    1,
    safeguardAttributes({
      pattern: lastPattern,
      action: GenAiSafeguardAction.NUDGE,
      helped,
      modelId,
      modelService,
    }),
  );

  return { _safeguardLastSignature: undefined, _safeguardLastPattern: undefined };
}
