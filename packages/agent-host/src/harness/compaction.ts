import {
  compact as compactWithPi,
  estimateContextTokens,
  estimateTokens,
  findCutPoint,
  findTurnStartIndex,
  prepareCompaction,
  shouldCompact,
} from '@earendil-works/pi-agent-core';
import type {
  Agent,
  AgentContext,
  AgentMessage,
  CompactionSettings,
  Entry,
  StreamFn,
} from '@earendil-works/pi-agent-core';
import { createAssistantMessageEventStream, isContextOverflow } from '@earendil-works/pi-ai';
import type { Api, AssistantMessage, Model, Models, Usage, UserMessage } from '@earendil-works/pi-ai';
import { createTransportFailureDiagnostic, piMessageToProvider } from '#harness/session-record.js';
import type { SessionRecord } from '#harness/session-record.js';
import type { CompactionTrace } from '#log/event-types.js';

const clearedToolResultContent = '[Old tool result content cleared]';
const oversizedToolResultContent =
  '[Tool result exceeded the context window and was cleared; re-run with a narrower request]';
const recentToolResultsToKeep = 5;
const compactableTools = new Set([
  'read_file',
  'grep',
  'glob_search',
  'list_directory',
  'web_search',
  'web_browser',
  'use_skill',
  'get_kernel_result',
]);

/** Typed failure used when compaction cannot restore provider headroom. @public */
export class HostCompactionError extends Error {
  public readonly code: 'SUMMARY_REQUIRED' | 'NO_EVICTABLE_HISTORY' | 'SESSION_LOG_INTEGRITY' | 'CIRCUIT_BREAKER_OPEN';
  public readonly details?: CompactionTrace | undefined;

  public constructor(
    code: 'SUMMARY_REQUIRED' | 'NO_EVICTABLE_HISTORY' | 'SESSION_LOG_INTEGRITY' | 'CIRCUIT_BREAKER_OPEN',
    message: string,
    details?: CompactionTrace,
  ) {
    super(message);
    this.name = 'HostCompactionError';
    this.code = code;
    this.details = details;
  }
}

/** Observable result of one compaction attempt. @public */
export type CompactionOutcome = {
  readonly messages: AgentMessage[];
  readonly tier?: 'tool_result_clearing' | 'summarization' | undefined;
  readonly cleared: number;
  readonly evicted: number;
  readonly details?: CompactionTrace | undefined;
};

/** Host callback that summarizes an evicted provider-history prefix. @public */
export type CompactionSummarizer = (input: {
  readonly messages: readonly AgentMessage[];
  readonly query: string;
  readonly keepContextTags: readonly string[];
  readonly previousSummary?: string | undefined;
  readonly signal?: AbortSignal | undefined;
}) => Promise<string>;

type CreateCompactionOptions = {
  readonly agent: Agent;
  readonly record: SessionRecord;
  readonly projectHistory: () => Promise<AgentMessage[]>;
  readonly contextWindow: number;
  readonly summarize?: CompactionSummarizer | undefined;
  readonly models?: Models | undefined;
  readonly onCompaction?: ((outcome: CompactionOutcome) => void) | undefined;
  readonly onSummary?: (() => void) | undefined;
  readonly settleDiscardedToolCalls?: (() => Promise<void>) | undefined;
  readonly now?: (() => number) | undefined;
};

type ClearedToolResult = {
  readonly original: Extract<AgentMessage, { readonly role: 'toolResult' }>;
  readonly replacement: Extract<AgentMessage, { readonly role: 'toolResult' }>;
};

const failureStream = (model: Model<Api>, error: HostCompactionError, timestamp: number) => {
  const output = createAssistantMessageEventStream();
  const diagnostic = createTransportFailureDiagnostic(error, timestamp);
  const message: AssistantMessage = {
    role: 'assistant',
    content: [{ type: 'text', text: `Compaction failed: ${error.message}` }],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: 'error',
    errorMessage: error.message,
    // Without the diagnostic the terminal record keeps only the prose, and the
    // surfaces that route on a failure code see an uncoded host failure.
    ...(diagnostic ? { diagnostics: [diagnostic] } : {}),
    timestamp,
  };
  output.push({ type: 'start', partial: message });
  output.push({ type: 'error', reason: 'error', error: message });
  return output;
};

const clearOldToolResults = (
  messages: readonly AgentMessage[],
  forced: ReadonlySet<AgentMessage>,
): {
  readonly messages: AgentMessage[];
  readonly cleared: readonly ClearedToolResult[];
} => {
  const candidates = messages.flatMap((message, index) =>
    message.role === 'toolResult' &&
    !(
      message.content.length === 1 &&
      message.content[0]?.type === 'text' &&
      (message.content[0].text === clearedToolResultContent || message.content[0].text === oversizedToolResultContent)
    ) &&
    (forced.has(message) ||
      (compactableTools.has(message.toolName) && message.content.every((block) => block.type !== 'image')))
      ? [{ index, message, forced: forced.has(message) }]
      : [],
  );
  const ordinary = candidates.filter((candidate) => !candidate.forced);
  const selected = [
    ...ordinary.slice(0, Math.max(0, ordinary.length - recentToolResultsToKeep)),
    ...candidates.filter((candidate) => candidate.forced),
  ];
  if (selected.length === 0) {
    return { messages: [...messages], cleared: [] };
  }
  const byIndex = new Map(selected.map(({ index, message }) => [index, message]));
  const cleared: ClearedToolResult[] = [];
  const next = messages.map((message, index) => {
    const original = byIndex.get(index);
    if (!original) {
      return message;
    }
    const replacement = clearedToolResult(original, forced.has(original));
    cleared.push({ original, replacement });
    return replacement;
  });
  return { messages: next, cleared };
};

const compactionSettings = (contextWindow: number): CompactionSettings => ({
  enabled: true,
  reserveTokens: Math.max(64, Math.floor(contextWindow * 0.2)),
  keepRecentTokens: Math.max(32, Math.floor(contextWindow * 0.1)),
});

const messageTokens = (messages: readonly AgentMessage[]): number =>
  messages.reduce((total, message) => total + estimateTokens(message), 0);

const clearedToolResult = (message: Extract<AgentMessage, { role: 'toolResult' }>, forced = false): typeof message => ({
  ...message,
  content: [{ type: 'text', text: forced ? oversizedToolResultContent : clearedToolResultContent }],
  details: {
    content: forced ? oversizedToolResultContent : clearedToolResultContent,
    isError: message.isError,
    substituted: false,
  },
});

const combineUsage = (left: CompactionTrace['summarizerUsage'], right: Usage): Usage => ({
  input: (left?.input ?? 0) + right.input,
  output: (left?.output ?? 0) + right.output,
  cacheRead: (left?.cacheRead ?? 0) + right.cacheRead,
  cacheWrite: (left?.cacheWrite ?? 0) + right.cacheWrite,
  ...((left?.cacheWrite1h ?? right.cacheWrite1h) === undefined
    ? {}
    : { cacheWrite1h: (left?.cacheWrite1h ?? 0) + (right.cacheWrite1h ?? 0) }),
  ...((left?.reasoning ?? right.reasoning) === undefined
    ? {}
    : { reasoning: (left?.reasoning ?? 0) + (right.reasoning ?? 0) }),
  totalTokens: (left?.totalTokens ?? 0) + right.totalTokens,
  cost: {
    input: (left?.cost.input ?? 0) + right.cost.input,
    output: (left?.cost.output ?? 0) + right.cost.output,
    cacheRead: (left?.cost.cacheRead ?? 0) + right.cost.cacheRead,
    cacheWrite: (left?.cost.cacheWrite ?? 0) + right.cost.cacheWrite,
    total: (left?.cost.total ?? 0) + right.cost.total,
  },
});

const summaryText = (message: AgentMessage): string | undefined => {
  const text = userText(message);
  const match = /^<summary>\n([\s\S]*)\n<\/summary>$/u.exec(text);
  return match?.[1];
};

const summaryFiles = (summary: string, tag: 'read-files' | 'modified-files'): string[] => {
  const match = new RegExp(`<${tag}>\\n([\\s\\S]*?)\\n</${tag}>`, 'u').exec(summary);
  return match?.[1]?.split('\n').filter(Boolean) ?? [];
};

const piFileOperationNames: ReadonlyMap<string, 'read' | 'write' | 'edit'> = new Map([
  ['read_file', 'read'],
  ['create_file', 'write'],
  ['edit_file', 'edit'],
  ['delete_file', 'edit'],
]);

const piFileOperationMessage = (message: AgentMessage): AgentMessage => {
  if (message.role !== 'assistant') {
    return message;
  }
  const content = message.content.map((block) => {
    if (block.type !== 'toolCall') {
      return block;
    }
    const piName = piFileOperationNames.get(block.name);
    const arguments_ = block.arguments as Record<string, unknown>;
    const path = arguments_['targetFile'];
    if (!piName || typeof path !== 'string') {
      return block;
    }
    return { ...block, name: piName, arguments: { ...arguments_, path } };
  });
  return { ...message, content };
};

const compactionEntries = (messages: readonly AgentMessage[]): Entry[] =>
  messages.map((message, index) => {
    const summary = summaryText(message);
    const base = {
      id: `tau-compaction-${index}`,
      parentId: index === 0 ? null : `tau-compaction-${index - 1}`,
      seq: index,
      timestamp: message.timestamp,
    };
    return summary === undefined
      ? { ...base, type: 'message', message: piFileOperationMessage(message) }
      : {
          ...base,
          type: 'compaction',
          summary,
          retainedTail: [],
          tokensBefore: 0,
          details: {
            readFiles: summaryFiles(summary, 'read-files'),
            modifiedFiles: summaryFiles(summary, 'modified-files'),
          },
        };
  });

const isValidCutPoint = (message: AgentMessage): boolean => message.role !== 'toolResult';

const laterCutoff = (messages: readonly AgentMessage[], after: number): number | undefined => {
  for (let index = after + 1; index < messages.length; index++) {
    if (isValidCutPoint(messages[index]!)) {
      return index;
    }
  }
  return after < messages.length && messages.at(-1)?.role !== 'user' ? messages.length : undefined;
};

const tokenBudgetCutoff = (messages: readonly AgentMessage[], keepRecentTokens: number): number => {
  const entries = compactionEntries(messages);
  const cut = findCutPoint(entries, 0, entries.length, keepRecentTokens);
  let cutoff = cut.firstKeptEntryIndex;
  if (cutoff === 0 && messages.length > 1) {
    for (let index = messages.length - 1; index > 0; index--) {
      if (isValidCutPoint(messages[index]!)) {
        cutoff = index;
        break;
      }
    }
  }
  if (cut.isSplitTurn) {
    const turnStart = findTurnStartIndex(entries, cutoff, 0);
    /*
     * A chat whose whole history is one oversized turn starts that turn at index
     * 0, so rolling the cut back to the turn start leaves nothing to evict and
     * the turn is refused for good. Cut inside the turn instead and summarise its
     * head, the way pi's own `prepareCompaction` handles a split turn. pi never
     * offers a tool result as a cut point, so the retained tail still opens on the
     * assistant message that made the call.
     */
    cutoff = turnStart > 0 ? turnStart : cutoff;
  }
  while (messageTokens(messages.slice(cutoff)) > keepRecentTokens) {
    const later = laterCutoff(messages, cutoff);
    if (later === undefined) {
      break;
    }
    cutoff = later;
  }
  return cutoff;
};

const userText = (message: AgentMessage): string => {
  if (message.role !== 'user') {
    return '';
  }
  return typeof message.content === 'string'
    ? message.content
    : message.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
};

const lastUserText = (messages: readonly AgentMessage[]): string => {
  for (let index = messages.length - 1; index >= 0; index--) {
    const text = userText(messages[index]!);
    if (text) {
      return text;
    }
  }
  return '';
};

const keepContext = (
  messages: readonly AgentMessage[],
  identities: SessionRecord['messages'],
): { readonly tags: string[]; readonly messages: ReadonlySet<AgentMessage> } => {
  const newestByTag = new Map<string, AgentMessage>();
  const safety = new Set<AgentMessage>();
  let newestUser: AgentMessage | undefined;
  for (const message of messages) {
    const text = userText(message);
    const tags = text.match(/<[a-z][\w:-]*(?:\s[^>]*)?>/giu) ?? [];
    for (const tag of tags) {
      if (tag.toLowerCase().includes('safety')) {
        safety.add(message);
        newestByTag.set(tag, message);
      } else if (tag.toLowerCase().includes('system-reminder')) {
        newestByTag.set(tag, message);
      }
    }
    if (
      message.role === 'user' &&
      summaryText(message) === undefined &&
      identities.metadata(message)?.tauInternal === undefined &&
      !tags.some((tag) => tag.toLowerCase().includes('system-reminder'))
    ) {
      newestUser = message;
    }
  }
  return {
    tags: [...newestByTag.keys()],
    messages: new Set([...safety, ...newestByTag.values(), ...(newestUser ? [newestUser] : [])]),
  };
};

const preserveDuringCompaction = (message: AgentMessage, pinned: ReadonlySet<AgentMessage>): boolean =>
  summaryText(message) === undefined && pinned.has(message);

const placeholderSummary = (messages: readonly AgentMessage[]): string => {
  const turns = Math.max(
    1,
    messages.filter((message) => message.role === 'user' && summaryText(message) === undefined).length,
  );
  return `Compaction could not summarize ${messages.length} message${messages.length === 1 ? '' : 's'} spanning ${turns} turn${turns === 1 ? '' : 's'}. The project files are the source of truth for the current work.`;
};

/** Install two-tier compaction on pi's durable turn and overflow seams. @public */
export const installCompaction = (
  options: CreateCompactionOptions,
): {
  readonly prepareTurn: (signal?: AbortSignal) => Promise<AgentMessage[]>;
  readonly wrapStreamFn: (base: StreamFn) => StreamFn;
} => {
  const { agent } = options;
  const priorPrepare = agent.prepareNextTurn;
  const now = options.now ?? Date.now;
  let strikes = 0;
  let anchorOverhead: { readonly anchor: string | AgentMessage; readonly tokens: number } | undefined;
  let pendingFailure: HostCompactionError | undefined;

  /*
   * Estimate what the next request will cost the provider.
   *
   * pi anchors its estimate on the usage the last retained assistant reported,
   * because most of a real request is fixed per-call overhead — system prompt,
   * tool schemas, injected skills — that no message estimate can see (about
   * 90 %, per `docs/research/chat-compaction-cascade-fixed-overhead.md`).
   * Eviction cannot move a number the provider already reported, though, so
   * reusing that anchor after a compaction reports a context that no longer
   * exists: tier one could never report success, and the post-summary strike
   * landed on 2 so the same turn's next attempt opened the circuit breaker.
   *
   * Split the anchor instead, the first time it is seen, into the overhead it
   * implies and the messages it measured, then project every later candidate as
   * that overhead plus the candidate's own message estimate. On the array the
   * anchor measured this is pi's own number, eviction and tool-result clearing
   * move it by exactly what they removed, a fresh assistant re-measures the
   * overhead by itself, and nothing is counted twice.
   *
   * A session reloaded from the durable log replays assistants whose usage
   * predates its summary and whose overhead this process never measured. pi
   * treats such pre-summary usage as no anchor at all (`_checkCompaction` in
   * its coding agent); so does this, falling back to the message estimate until
   * the next model call re-anchors it.
   */
  const contextTokens = (
    messages: readonly AgentMessage[],
  ): { readonly tokens: number; readonly anchored: boolean } => {
    const estimate = estimateContextTokens([...messages]);
    if (estimate.lastUsageIndex === null) {
      return { tokens: estimate.tokens, anchored: false };
    }
    const anchor = messages[estimate.lastUsageIndex]!;
    // The durable id survives the per-turn rehydration that gives every message
    // a new object identity; a message the log has never seen has only itself.
    const key = options.record.messages.get(anchor) ?? anchor;
    if (anchorOverhead?.anchor !== key) {
      if (messages.some((message) => summaryText(message) !== undefined && message.timestamp >= anchor.timestamp)) {
        return { tokens: messageTokens(messages), anchored: false };
      }
      anchorOverhead = {
        anchor: key,
        tokens: Math.max(0, estimate.usageTokens - messageTokens(messages.slice(0, estimate.lastUsageIndex + 1))),
      };
    }
    return { tokens: anchorOverhead.tokens + messageTokens(messages), anchored: true };
  };

  const projectionId = (message: AgentMessage): string => {
    const id = options.record.messages.get(message);
    if (!id) {
      throw new Error('Compaction received a message outside its durable projection.');
    }
    return id;
  };

  const prepareClearings = (cleared: readonly ClearedToolResult[]) =>
    cleared.map(({ original, replacement }) => {
      options.record.messages.transfer(original, replacement);
      return {
        messageId: projectionId(replacement),
        replacement: piMessageToProvider(replacement, options.record.messages),
      };
    });

  const persistClearings = async (
    replacements: ReturnType<typeof prepareClearings>,
    details?: CompactionTrace,
  ): Promise<void> => {
    for (const [index, { messageId, replacement }] of replacements.entries()) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Event-log cursor writes must remain ordered.
      await options.record.append({
        type: 'message.envelope-replaced',
        messageId,
        replacement,
        ...(index === 0 && details ? { details } : {}),
      });
    }
  };

  const compact = async ({
    input,
    lane,
    signal,
    force = false,
    discardedOverflowError,
  }: {
    readonly input: readonly AgentMessage[];
    readonly lane: CompactionTrace['lane'];
    readonly signal?: AbortSignal | undefined;
    readonly force?: boolean | undefined;
    readonly discardedOverflowError?: string | undefined;
  }): Promise<CompactionOutcome> => {
    /*
     * Measure the anchor against the untouched input, even when the overflow
     * lane forces the pass: tier one's candidate has already had tool-result
     * text removed, and measuring there would credit that text to the fixed
     * per-call overhead the provider reported.
     */
    const settings = compactionSettings(options.contextWindow);
    const trigger = contextTokens(input);
    const fixedOverhead = Math.max(0, trigger.tokens - messageTokens(input));
    let summarizerAttempts = 0;
    let summarizerUsage: CompactionTrace['summarizerUsage'] = null;
    let summarizerError: string | undefined;
    let evictedCount = 0;
    let tokensAfter = trigger.tokens;
    let summaryKind: CompactionTrace['summary'];
    let overBudget = false;
    const trace = (tier: CompactionTrace['tier'], cleared: number): CompactionTrace => ({
      lane,
      tier,
      tokensBefore: trigger.tokens,
      tokensAfter,
      cleared,
      evicted: evictedCount,
      summarizerAttempts,
      summarizerUsage,
      ...(summarizerError === undefined ? {} : { summarizerError }),
      ...(summaryKind === undefined ? {} : { summary: summaryKind }),
      ...(overBudget ? { overBudget: true } : {}),
      ...(discardedOverflowError === undefined ? {} : { discardedOverflowError }),
    });
    const refuse = ({
      code,
      message,
      tier,
      cleared = 0,
    }: {
      readonly code: HostCompactionError['code'];
      readonly message: string;
      readonly tier: CompactionTrace['tier'];
      readonly cleared?: number | undefined;
    }): never => {
      strikes = 0;
      throw new HostCompactionError(code, message, trace(tier, cleared));
    };
    const oversized = (force && !trigger.anchored) || shouldCompact(trigger.tokens, options.contextWindow, settings);
    if (!force && !oversized) {
      return { messages: [...input], cleared: 0, evicted: 0 };
    }
    const messageBudget = Math.max(
      32,
      options.contextWindow - settings.reserveTokens - settings.keepRecentTokens - fixedOverhead,
    );
    const forcedClearingThreshold = Math.max(messageBudget, settings.keepRecentTokens);
    const emergencyClearings = new Set(
      input.filter((message) => message.role === 'toolResult' && estimateTokens(message) > forcedClearingThreshold),
    );
    const tierOne = clearOldToolResults(input, emergencyClearings);
    const tierOneTokens = fixedOverhead + messageTokens(tierOne.messages);
    if (
      tierOne.cleared.length > 0 &&
      (emergencyClearings.size > 0 ||
        ((!force || trigger.anchored) &&
          tierOneTokens <= options.contextWindow - settings.reserveTokens - settings.keepRecentTokens))
    ) {
      tokensAfter = tierOneTokens;
      const details = trace('tool_result_clearing', tierOne.cleared.length);
      try {
        await persistClearings(prepareClearings(tierOne.cleared), details);
      } catch (error) {
        if (signal?.aborted) {
          throw error;
        }
        strikes = 0;
        throw new HostCompactionError(
          'SESSION_LOG_INTEGRITY',
          error instanceof Error ? error.message : String(error),
          details,
        );
      }
      strikes = 0;
      const outcome: CompactionOutcome = {
        messages: tierOne.messages,
        tier: 'tool_result_clearing',
        cleared: tierOne.cleared.length,
        evicted: 0,
        details,
      };
      options.onCompaction?.(outcome);
      return outcome;
    }

    const tierTwoMessages = input;
    const keep = keepContext(tierTwoMessages, options.record.messages);
    if (tierTwoMessages.length <= 1) {
      refuse({
        code: 'NO_EVICTABLE_HISTORY',
        message: 'Context is oversized but has no safe history to evict.',
        tier: 'summarization',
      });
    }
    let cutoff = tokenBudgetCutoff(tierTwoMessages, messageBudget);
    let evicted: AgentMessage[] = [];
    let summary: UserMessage;
    let messages: AgentMessage[];
    let placeholder = !options.summarize && !options.models;
    for (;;) {
      const prefix = tierTwoMessages.slice(0, cutoff);
      evicted = prefix.filter((message) => !preserveDuringCompaction(message, keep.messages));
      evictedCount = evicted.length;
      if (evicted.length === 0) {
        const later = laterCutoff(tierTwoMessages, cutoff);
        if (later !== undefined) {
          cutoff = later;
          continue;
        }
        refuse({
          code: 'NO_EVICTABLE_HISTORY',
          message: 'Context is oversized but has no safe history to evict or clear.',
          tier: 'summarization',
        });
      }
      const previousSummary = evicted.findLast((message) => summaryText(message) !== undefined);
      const previousSummaryText = previousSummary ? summaryText(previousSummary) : undefined;
      const messagesToSummarize = evicted.filter((message) => message !== previousSummary);
      if (messagesToSummarize.length === 0) {
        const later = laterCutoff(tierTwoMessages, cutoff);
        if (later !== undefined) {
          cutoff = later;
          continue;
        }
        refuse({
          code: 'NO_EVICTABLE_HISTORY',
          message: 'Context is oversized but has no safe history to evict or clear.',
          tier: 'summarization',
        });
      }
      let compactedSummary = '';
      if (!placeholder) {
        summarizerAttempts++;
        try {
          if (options.summarize) {
            // oxlint-disable-next-line eslint/no-await-in-loop -- An over-budget result must widen and summarize the new cut in the same pass.
            compactedSummary = await options.summarize({
              messages: messagesToSummarize,
              query: lastUserText(tierTwoMessages.slice(cutoff)),
              keepContextTags: keep.tags,
              previousSummary: previousSummaryText,
              signal,
            });
          } else {
            const sentinel: UserMessage = { role: 'user', content: 'keep', timestamp: now() };
            const prepared = prepareCompaction(compactionEntries([...evicted, sentinel]), {
              ...settings,
              keepRecentTokens: 1,
            });
            if (prepared.ok && prepared.value) {
              // oxlint-disable-next-line eslint/no-await-in-loop -- An over-budget result must widen and summarize the new cut in the same pass.
              const result = await compactWithPi(
                {
                  ...prepared.value,
                  retainedTail: [],
                  tokensBefore: estimateContextTokens([...tierTwoMessages]).tokens,
                  settings,
                },
                options.models!,
                agent.state.model as Model<Api>,
                undefined,
                signal,
              );
              if (result.ok) {
                compactedSummary = result.value.summary;
                if (result.value.usage) {
                  summarizerUsage = combineUsage(summarizerUsage, result.value.usage);
                }
              } else {
                summarizerError = result.error instanceof Error ? result.error.message : String(result.error);
              }
            }
          }
        } catch (error) {
          if (signal?.aborted) {
            throw error;
          }
          summarizerError = error instanceof Error ? error.message : String(error);
        }
        if (signal?.aborted) {
          throw new DOMException('Compaction aborted', 'AbortError');
        }
        placeholder = compactedSummary === '';
      }
      summaryKind = placeholder ? 'placeholder' : 'generated';
      compactedSummary = placeholder ? placeholderSummary(evicted) : compactedSummary;
      let latestInputTimestamp = 0;
      for (const message of evicted) {
        latestInputTimestamp = Math.max(latestInputTimestamp, message.timestamp);
      }
      summary = {
        role: 'user',
        content: [{ type: 'text', text: `<summary>\n${compactedSummary}\n</summary>` }],
        timestamp: Math.max(now(), latestInputTimestamp + 1),
      };
      const evictedSet = new Set(evicted);
      const firstIndex = tierTwoMessages.findIndex((message) => evictedSet.has(message));
      messages = tierTwoMessages.filter((message) => !evictedSet.has(message));
      messages.splice(firstIndex, 0, summary);
      tokensAfter = fixedOverhead + messageTokens(messages);
      if (messageTokens(messages) <= messageBudget) {
        break;
      }
      const later = laterCutoff(tierTwoMessages, cutoff);
      if (later === undefined) {
        overBudget = true;
        strikes = placeholder ? 0 : strikes + 1;
        if (strikes >= 3) {
          throw new HostCompactionError(
            'CIRCUIT_BREAKER_OPEN',
            'Repeated compaction could not restore provider headroom; start a new thread.',
            trace('summarization', 0),
          );
        }
        break;
      }
      cutoff = later;
    }

    const details = trace('summarization', 0);
    try {
      const piIds = evicted.map((message) => projectionId(message));
      const piIdSet = new Set(piIds);
      const toolCallIds = new Set(
        evicted.flatMap((message) => {
          if (message.role === 'toolResult') {
            return [message.toolCallId];
          }
          return message.role === 'assistant'
            ? message.content.flatMap((block) => (block.type === 'toolCall' ? [block.id] : []))
            : [];
        }),
      );
      const history = await options.record.history();
      const durableIds = history
        .filter(
          (message) =>
            piIdSet.has(message.id) || (message.role === 'tool-input' && toolCallIds.has(message.toolCallId)),
        )
        .map((message) => message.id);
      const projectedDurableIds = history
        .filter((message) => message.role !== 'tool-input' && durableIds.includes(message.id))
        .map((message) => message.id);
      if (
        piIdSet.size !== projectedDurableIds.length ||
        projectedDurableIds.some((id) => !piIdSet.has(id)) ||
        piIds.some((id) => !projectedDurableIds.includes(id))
      ) {
        throw new Error('Compaction projection diverged from durable history.');
      }
      const durableSummary = piMessageToProvider(summary, options.record.messages);
      if (signal?.aborted) {
        throw new DOMException('Compaction aborted', 'AbortError');
      }
      await options.record.append({
        type: 'history.compacted',
        evictedMessageIds: durableIds,
        summary: durableSummary,
        details,
      });
    } catch (error) {
      if (signal?.aborted) {
        throw error;
      }
      strikes = 0;
      throw new HostCompactionError(
        'SESSION_LOG_INTEGRITY',
        error instanceof Error ? error.message : String(error),
        details,
      );
    }
    if (!overBudget) {
      strikes = 0;
    }
    options.onSummary?.();
    const outcome: CompactionOutcome = {
      messages,
      tier: 'summarization',
      cleared: 0,
      evicted: evicted.length,
      details,
    };
    options.onCompaction?.(outcome);
    return outcome;
  };

  const compactionFailure = ({
    error,
    lane,
    input,
    signal,
    discardedOverflowError,
  }: {
    readonly error: unknown;
    readonly lane: CompactionTrace['lane'];
    readonly input: readonly AgentMessage[];
    readonly signal?: AbortSignal | undefined;
    readonly discardedOverflowError?: string | undefined;
  }): HostCompactionError => {
    if (signal?.aborted) {
      throw error;
    }
    if (error instanceof HostCompactionError) {
      return error;
    }
    strikes = 0;
    const { tokens } = contextTokens(input);
    return new HostCompactionError('SESSION_LOG_INTEGRITY', error instanceof Error ? error.message : String(error), {
      lane,
      tier: 'summarization',
      tokensBefore: tokens,
      tokensAfter: tokens,
      cleared: 0,
      evicted: 0,
      summarizerAttempts: 0,
      summarizerUsage: null,
      ...(discardedOverflowError === undefined ? {} : { discardedOverflowError }),
    });
  };

  const prepareTurn = async (signal?: AbortSignal): Promise<AgentMessage[]> => {
    let messages = [...agent.state.messages];
    try {
      messages = await options.projectHistory();
      agent.state.messages = messages;
      const outcome = await compact({ input: messages, lane: 'start_of_turn', signal });
      pendingFailure = undefined;
      agent.state.messages = outcome.messages;
      return outcome.messages;
    } catch (error) {
      /*
       * Fail the turn, not the chat. Escaping here left the run stranded on
       * `admitted` with nothing committed, so a chat whose history cannot be
       * compacted could never take another turn. The failure rides the same
       * seam the between-turn leg uses: the stream wrapper turns
       * it into this turn's coded error message.
       */
      pendingFailure = compactionFailure({ error, lane: 'start_of_turn', input: messages, signal });
      return messages;
    }
  };

  agent.prepareNextTurn = async (signal) => {
    const prior = await priorPrepare?.(signal);
    const priorContext: AgentContext = prior?.context ?? {
      systemPrompt: agent.state.systemPrompt,
      messages: agent.state.messages,
      tools: agent.state.tools,
    };
    let projected = [...agent.state.messages];
    try {
      projected = await options.projectHistory();
      agent.state.messages = projected;
      const outcome = await compact({ input: projected, lane: 'between_turn', signal });
      pendingFailure = undefined;
      agent.state.messages = outcome.messages;
      return { ...prior, context: { ...priorContext, messages: outcome.messages } };
    } catch (error) {
      pendingFailure = compactionFailure({ error, lane: 'between_turn', input: projected, signal });
      return { ...prior, context: { ...priorContext, messages: projected } };
    }
  };

  const wrapStreamFunction =
    (base: StreamFn): StreamFn =>
    async (model, context, streamOptions) => {
      if (pendingFailure) {
        const failure = pendingFailure;
        pendingFailure = undefined;
        return failureStream(model, failure, now());
      }
      const first = await base(model, context, streamOptions);
      const message = await first.result();
      if (!isContextOverflow(message, options.contextWindow)) {
        return first;
      }
      const discardedOverflowError = message.errorMessage;
      let projected = [...options.agent.state.messages];
      try {
        await options.settleDiscardedToolCalls?.();
        projected = await options.projectHistory();
        const emergency = await compact({
          input: projected,
          lane: 'overflow',
          signal: streamOptions?.signal,
          force: true,
          discardedOverflowError,
        });
        options.agent.state.messages = emergency.messages;
        // Pi already applied convertToLlm/transformContext before this wrapper.
        // The durable projection is hydrated AgentMessage history, so only the
        // inner request-shaping middleware must run again for the bounded retry.
        return await base(
          model,
          { ...context, messages: emergency.messages as typeof context.messages },
          streamOptions,
        );
      } catch (error) {
        return failureStream(
          model,
          compactionFailure({
            error,
            lane: 'overflow',
            input: projected,
            signal: streamOptions?.signal,
            discardedOverflowError,
          }),
          now(),
        );
      }
    };

  return { prepareTurn, wrapStreamFn: wrapStreamFunction };
};
