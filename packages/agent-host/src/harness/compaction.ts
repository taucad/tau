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
import type { Api, AssistantMessage, Model, Models, UserMessage } from '@earendil-works/pi-ai';
import { createTransportFailureDiagnostic, piMessageToProvider } from '#harness/session-record.js';
import type { SessionRecord } from '#harness/session-record.js';

const clearedToolResultContent = '[Old tool result content cleared]';
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

  public constructor(
    code: 'SUMMARY_REQUIRED' | 'NO_EVICTABLE_HISTORY' | 'SESSION_LOG_INTEGRITY' | 'CIRCUIT_BREAKER_OPEN',
    message: string,
  ) {
    super(message);
    this.name = 'HostCompactionError';
    this.code = code;
  }
}

/** Observable result of one compaction attempt. @public */
export type CompactionOutcome = {
  readonly messages: AgentMessage[];
  readonly tier?: 'tool_result_clearing' | 'summarization' | undefined;
  readonly cleared: number;
  readonly evicted: number;
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
): {
  readonly messages: AgentMessage[];
  readonly cleared: readonly ClearedToolResult[];
} => {
  const candidates = messages.flatMap((message, index) =>
    message.role === 'toolResult' &&
    compactableTools.has(message.toolName) &&
    message.content.every((block) => block.type !== 'image') &&
    !(
      message.content.length === 1 &&
      message.content[0]?.type === 'text' &&
      message.content[0].text === clearedToolResultContent
    )
      ? [{ index, message }]
      : [],
  );
  const selected = candidates.slice(0, Math.max(0, candidates.length - recentToolResultsToKeep));
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
    const replacement: typeof original = {
      ...original,
      content: [{ type: 'text', text: clearedToolResultContent }],
      details: {
        content: clearedToolResultContent,
        isError: original.isError,
        substituted: false,
      },
    };
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
  return undefined;
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

const keepContextTags = (messages: readonly AgentMessage[]): string[] => {
  const tags = new Set<string>();
  for (const message of messages) {
    const text = userText(message);
    for (const tag of text.match(/<[a-z][\w:-]*(?:\s[^>]*)?>/giu) ?? []) {
      if (tag.toLowerCase().includes('safety') || tag.toLowerCase().includes('system-reminder')) {
        tags.add(tag);
      }
    }
  }
  return [...tags];
};

const preserveDuringCompaction = (message: AgentMessage, tags: readonly string[]): boolean => {
  if (summaryText(message) !== undefined) {
    return false;
  }
  const text = userText(message);
  return tags.some((tag) => text.includes(tag));
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

  const persistClearings = async (replacements: ReturnType<typeof prepareClearings>): Promise<void> => {
    for (const { messageId, replacement } of replacements) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Event-log cursor writes must remain ordered.
      await options.record.append({
        type: 'message.envelope-replaced',
        messageId,
        replacement,
      });
    }
  };

  const compact = async ({
    input,
    signal,
    force = false,
  }: {
    readonly input: readonly AgentMessage[];
    readonly signal?: AbortSignal | undefined;
    readonly force?: boolean | undefined;
  }): Promise<CompactionOutcome> => {
    /*
     * Measure the anchor against the untouched input, even when the overflow
     * lane forces the pass: tier one's candidate has already had tool-result
     * text removed, and measuring there would credit that text to the fixed
     * per-call overhead the provider reported.
     */
    const settings = compactionSettings(options.contextWindow);
    const trigger = contextTokens(input);
    const oversized = (force && !trigger.anchored) || shouldCompact(trigger.tokens, options.contextWindow, settings);
    if (!force && !oversized) {
      return { messages: [...input], cleared: 0, evicted: 0 };
    }
    const messageBudget = Math.max(
      32,
      options.contextWindow - settings.reserveTokens - Math.max(0, trigger.tokens - messageTokens(input)),
    );
    const tierOne = clearOldToolResults(input);
    if (
      tierOne.cleared.length > 0 &&
      (!force || trigger.anchored) &&
      messageTokens(tierOne.messages) <= messageBudget
    ) {
      await persistClearings(prepareClearings(tierOne.cleared));
      strikes = 0;
      const outcome: CompactionOutcome = {
        messages: tierOne.messages,
        tier: 'tool_result_clearing',
        cleared: tierOne.cleared.length,
        evicted: 0,
      };
      options.onCompaction?.(outcome);
      return outcome;
    }

    strikes++;
    if (strikes >= 3) {
      throw new HostCompactionError(
        'CIRCUIT_BREAKER_OPEN',
        'Repeated compaction could not restore provider headroom; start a new thread.',
      );
    }
    if (!options.summarize && !options.models) {
      throw new HostCompactionError('SUMMARY_REQUIRED', 'Tier-two compaction requires the session model summarizer.');
    }

    const tags = keepContextTags(tierOne.messages);
    if (tierOne.messages.length <= 1) {
      throw new HostCompactionError('NO_EVICTABLE_HISTORY', 'Context is oversized but has no safe history to evict.');
    }
    let cutoff = tokenBudgetCutoff(tierOne.messages, messageBudget);
    let evicted: AgentMessage[] = [];
    let summary: UserMessage;
    let messages: AgentMessage[];
    for (;;) {
      const prefix = tierOne.messages.slice(0, cutoff);
      evicted = prefix.filter((message) => !preserveDuringCompaction(message, tags));
      if (evicted.length === 0) {
        const later = laterCutoff(tierOne.messages, cutoff);
        if (later !== undefined) {
          cutoff = later;
          continue;
        }
        throw new HostCompactionError('SUMMARY_REQUIRED', 'Pinned context leaves no history available to summarize.');
      }
      const previousSummary = evicted.findLast((message) => summaryText(message) !== undefined);
      const previousSummaryText = previousSummary ? summaryText(previousSummary) : undefined;
      const messagesToSummarize = evicted.filter((message) => message !== previousSummary);
      let compactedSummary: string;
      if (options.summarize) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- An over-budget result must widen and summarize the new cut in the same pass.
        compactedSummary = await options.summarize({
          messages: messagesToSummarize,
          query: lastUserText(tierOne.messages.slice(cutoff)),
          keepContextTags: tags,
          previousSummary: previousSummaryText,
          signal,
        });
      } else {
        const sentinel: UserMessage = { role: 'user', content: 'keep', timestamp: now() };
        const prepared = prepareCompaction(compactionEntries([...evicted, sentinel]), {
          ...settings,
          keepRecentTokens: 1,
        });
        if (!prepared.ok || !prepared.value) {
          throw new HostCompactionError(
            'SUMMARY_REQUIRED',
            prepared.ok ? 'Pi could not prepare tier-two compaction.' : prepared.error.message,
          );
        }
        // oxlint-disable-next-line eslint/no-await-in-loop -- An over-budget result must widen and summarize the new cut in the same pass.
        const result = await compactWithPi(
          {
            ...prepared.value,
            retainedTail: [],
            tokensBefore: estimateContextTokens(tierOne.messages).tokens,
            settings,
          },
          options.models!,
          agent.state.model as Model<Api>,
          undefined,
          signal,
        );
        if (!result.ok) {
          throw new HostCompactionError('SUMMARY_REQUIRED', result.error.message);
        }
        compactedSummary = result.value.summary;
      }
      if (compactedSummary === '') {
        throw new HostCompactionError('SUMMARY_REQUIRED', 'Compaction produced an empty summary.');
      }
      summary = {
        role: 'user',
        content: [{ type: 'text', text: `<summary>\n${compactedSummary}\n</summary>` }],
        timestamp: now(),
      };
      const evictedSet = new Set(evicted);
      const firstIndex = tierOne.messages.findIndex((message) => evictedSet.has(message));
      messages = tierOne.messages.filter((message) => !evictedSet.has(message));
      messages.splice(firstIndex, 0, summary);
      if (messageTokens(messages) <= messageBudget) {
        break;
      }
      const later = laterCutoff(tierOne.messages, cutoff);
      if (later === undefined) {
        throw new HostCompactionError('SUMMARY_REQUIRED', 'Compaction summary could not restore provider headroom.');
      }
      cutoff = later;
    }

    const evictedSet = new Set(evicted);
    for (const { original, replacement } of tierOne.cleared) {
      options.record.messages.transfer(original, replacement);
    }
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
        (message) => piIdSet.has(message.id) || (message.role === 'tool-input' && toolCallIds.has(message.toolCallId)),
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
    const retainedClearings = tierOne.cleared.filter(({ replacement }) => !evictedSet.has(replacement));
    const durableSummary = piMessageToProvider(summary, options.record.messages);
    const clearingEvents = prepareClearings(retainedClearings);
    await options.record.append({
      type: 'history.compacted',
      evictedMessageIds: durableIds,
      summary: durableSummary,
    });
    await persistClearings(clearingEvents);
    strikes = 0;
    options.onSummary?.();
    const outcome: CompactionOutcome = {
      messages,
      tier: 'summarization',
      cleared: tierOne.cleared.length,
      evicted: evicted.length,
    };
    options.onCompaction?.(outcome);
    return outcome;
  };

  const prepareTurn = async (signal?: AbortSignal): Promise<AgentMessage[]> => {
    const messages = await options.projectHistory();
    agent.state.messages = messages;
    try {
      const outcome = await compact({ input: messages, signal });
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
      if (!(error instanceof HostCompactionError)) {
        throw error;
      }
      pendingFailure = error;
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
    const projected = await options.projectHistory();
    agent.state.messages = projected;
    try {
      const outcome = await compact({ input: projected, signal });
      pendingFailure = undefined;
      agent.state.messages = outcome.messages;
      return { ...prior, context: { ...priorContext, messages: outcome.messages } };
    } catch (error) {
      if (!(error instanceof HostCompactionError)) {
        throw error;
      }
      pendingFailure = error;
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
      try {
        const projected = await options.projectHistory();
        const emergency = await compact({
          input: projected,
          signal: streamOptions?.signal,
          force: true,
        });
        options.agent.state.messages = emergency.messages;
        return await base(
          model,
          { ...context, messages: emergency.messages as typeof context.messages },
          streamOptions,
        );
      } catch (error) {
        if (!(error instanceof HostCompactionError)) {
          throw error;
        }
        return failureStream(model, error, now());
      }
    };

  return { prepareTurn, wrapStreamFn: wrapStreamFunction };
};
