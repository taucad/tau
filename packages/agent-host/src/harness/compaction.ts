import {
  compact as compactWithPi,
  estimateContextTokens,
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
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { piMessageToProvider } from '#harness/session-record.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
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
  public readonly code: 'SUMMARY_REQUIRED' | 'NO_EVICTABLE_HISTORY' | 'CIRCUIT_BREAKER_OPEN';

  public constructor(code: 'SUMMARY_REQUIRED' | 'NO_EVICTABLE_HISTORY' | 'CIRCUIT_BREAKER_OPEN', message: string) {
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

type CompactionRun = CompactionOutcome & { readonly persist: () => Promise<void> };

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

const needsCompaction = (messages: readonly AgentMessage[], contextWindow: number): boolean => {
  const { tokens } = estimateContextTokens([...messages]);
  return shouldCompact(tokens, contextWindow, compactionSettings(contextWindow));
};

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

const tokenBudgetCutoff = (messages: readonly AgentMessage[], settings: CompactionSettings): number => {
  const entries = compactionEntries(messages);
  const cut = findCutPoint(entries, 0, entries.length, settings.keepRecentTokens);
  if (!cut.isSplitTurn) {
    return cut.firstKeptEntryIndex;
  }
  const turnStart = findTurnStartIndex(entries, cut.firstKeptEntryIndex, 0);
  return turnStart < 0 ? cut.firstKeptEntryIndex : turnStart;
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

/** Install two-tier compaction on pi's durable, ephemeral, and overflow seams. @public */
export const installCompaction = (
  options: CreateCompactionOptions,
): {
  readonly prepareTurn: (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]>;
  readonly transformContext: (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]>;
  readonly wrapStreamFn: (base: StreamFn) => StreamFn;
} => {
  const { agent } = options;
  const priorPrepare = agent.prepareNextTurn;
  const now = options.now ?? Date.now;
  let strikes = 0;
  let memo:
    | { readonly fromLength: number; readonly sourceFingerprint: string; readonly run: CompactionRun }
    | undefined;
  let pendingFailure: HostCompactionError | undefined;

  const fingerprint = (messages: readonly AgentMessage[]): string =>
    JSON.stringify(messages.map((message) => options.record.messages.id(message)));

  const memoMatches = (messages: readonly AgentMessage[]): boolean =>
    memo !== undefined &&
    memo.fromLength <= messages.length &&
    memo.sourceFingerprint === fingerprint(messages.slice(0, memo.fromLength));

  const applyMemo = (messages: readonly AgentMessage[]): AgentMessage[] => [
    ...memo!.run.messages,
    ...messages.slice(memo!.fromLength),
  ];

  const persistCleared = async (cleared: readonly ClearedToolResult[]): Promise<void> => {
    const replacements = cleared.map(({ original, replacement }) => {
      options.record.messages.transfer(original, replacement);
      const messageId = options.record.messages.get(replacement);
      if (!messageId) {
        throw new HostCompactionError('NO_EVICTABLE_HISTORY', 'A durable tool result has no session-log identity.');
      }
      return { messageId, replacement };
    });
    for (const { messageId, replacement } of replacements) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Event-log cursor writes must remain ordered.
      await options.record.append({
        type: 'message.envelope-replaced',
        messageId,
        replacement: piMessageToProvider(replacement, options.record.messages),
      });
    }
  };

  const compact = async ({
    input,
    durable,
    signal,
    force = false,
  }: {
    readonly input: readonly AgentMessage[];
    readonly durable: boolean;
    readonly signal?: AbortSignal | undefined;
    readonly force?: boolean | undefined;
  }): Promise<CompactionRun> => {
    if (!force && !needsCompaction(input, options.contextWindow)) {
      return { messages: [...input], cleared: 0, evicted: 0, persist: async () => undefined };
    }
    const tierOne = clearOldToolResults(input);
    if (tierOne.cleared.length > 0 && !needsCompaction(tierOne.messages, options.contextWindow)) {
      let persisted: Promise<void> | undefined;
      const persist = async (): Promise<void> => {
        persisted ??= persistCleared(tierOne.cleared);
        await persisted;
      };
      if (durable) {
        await persist();
      }
      strikes = 0;
      const outcome: CompactionOutcome = {
        messages: tierOne.messages,
        tier: 'tool_result_clearing',
        cleared: tierOne.cleared.length,
        evicted: 0,
      };
      options.onCompaction?.(outcome);
      return { ...outcome, persist };
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

    const settings = compactionSettings(options.contextWindow);
    const cutoff = tokenBudgetCutoff(tierOne.messages, settings);
    const tags = keepContextTags(tierOne.messages);
    const prefix = tierOne.messages.slice(0, cutoff);
    const evicted = prefix.filter((message) => !preserveDuringCompaction(message, tags));
    if (evicted.length === 0) {
      throw new HostCompactionError('NO_EVICTABLE_HISTORY', 'Context is oversized but has no safe history to evict.');
    }
    const previousSummary = evicted.findLast((message) => summaryText(message) !== undefined);
    const previousSummaryText = previousSummary ? summaryText(previousSummary) : undefined;
    const messagesToSummarize = evicted.filter((message) => message !== previousSummary);
    let compactedSummary: string;
    if (options.summarize) {
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
      const result = await compactWithPi(
        { ...prepared.value, retainedTail: [], tokensBefore: estimateContextTokens(tierOne.messages).tokens, settings },
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
    const summary: UserMessage = {
      role: 'user',
      content: [{ type: 'text', text: `<summary>\n${compactedSummary}\n</summary>` }],
      timestamp: now(),
    };
    const evictedSet = new Set(evicted);
    const firstIndex = tierOne.messages.findIndex((message) => evictedSet.has(message));
    const messages = tierOne.messages.filter((message) => !evictedSet.has(message));
    messages.splice(firstIndex, 0, summary);

    let persisted: Promise<void> | undefined;
    const persist = async (): Promise<void> => {
      persisted ??= (async () => {
        await persistCleared(tierOne.cleared.filter(({ original }) => !evictedSet.has(original)));
        const piIds = evicted.map((message) => options.record.messages.get(message));
        if (piIds.some((id) => id === undefined)) {
          throw new HostCompactionError(
            'NO_EVICTABLE_HISTORY',
            'Durable compacted history has missing session-log ids.',
          );
        }
        const evictedIds = new Set(piIds as string[]);
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
              evictedIds.has(message.id) ||
              ((message.role === 'tool-input' || message.role === 'tool-output') &&
                toolCallIds.has(message.toolCallId)),
          )
          .map((message) => message.id);
        if (history.length > 0 && piIds.some((id) => !durableIds.includes(id!))) {
          throw new HostCompactionError('NO_EVICTABLE_HISTORY', 'Durable compacted history diverged from pi history.');
        }
        await options.record.append({
          type: 'history.compacted',
          evictedMessageIds: history.length > 0 ? durableIds : (piIds as string[]),
          summary: piMessageToProvider(summary, options.record.messages),
        });
      })();
      await persisted;
    };
    if (durable) {
      await persist();
    }
    strikes = needsCompaction(messages, options.contextWindow) ? 2 : 0;
    options.onSummary?.();
    const outcome: CompactionOutcome = {
      messages,
      tier: 'summarization',
      cleared: tierOne.cleared.length,
      evicted: evicted.length,
    };
    options.onCompaction?.(outcome);
    return { ...outcome, persist };
  };

  const transformContext = async (messages: AgentMessage[], signal?: AbortSignal): Promise<AgentMessage[]> => {
    try {
      if (!needsCompaction(messages, options.contextWindow)) {
        return messages;
      }
      if (memoMatches(messages)) {
        return applyMemo(messages);
      }
      const outcome = await compact({ input: messages, durable: false, signal });
      memo = { fromLength: messages.length, sourceFingerprint: fingerprint(messages), run: outcome };
      return outcome.messages;
    } catch (error) {
      if (!(error instanceof HostCompactionError)) {
        throw error;
      }
      pendingFailure = error;
      memo = undefined;
      return messages;
    }
  };

  const prepareTurn = async (messages: AgentMessage[], signal?: AbortSignal): Promise<AgentMessage[]> => {
    memo = undefined;
    const outcome = await compact({ input: messages, durable: true, signal });
    pendingFailure = undefined;
    if (outcome.tier) {
      agent.state.messages = outcome.messages;
    }
    return outcome.messages;
  };

  agent.prepareNextTurn = async (signal) => {
    const prior = await priorPrepare?.(signal);
    const priorContext: AgentContext = prior?.context ?? {
      systemPrompt: agent.state.systemPrompt,
      messages: agent.state.messages,
      tools: agent.state.tools,
    };
    try {
      const pending = memo;
      if (pending && memoMatches(priorContext.messages)) {
        await pending.run.persist();
        const messages = applyMemo(priorContext.messages);
        memo = undefined;
        pendingFailure = undefined;
        agent.state.messages = messages;
        return { ...prior, context: { ...priorContext, messages } };
      }
      memo = undefined;
      const outcome = await compact({ input: priorContext.messages, durable: true, signal });
      if (!outcome.tier) {
        return prior;
      }
      pendingFailure = undefined;
      agent.state.messages = outcome.messages;
      return { ...prior, context: { ...priorContext, messages: outcome.messages } };
    } catch (error) {
      if (!(error instanceof HostCompactionError)) {
        throw error;
      }
      pendingFailure = error;
      memo = undefined;
      return prior;
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
        const emergency = await compact({
          input: context.messages as AgentMessage[],
          durable: false,
          signal: streamOptions?.signal,
          force: true,
        });
        await emergency.persist();
        options.agent.state.messages = emergency.messages;
        memo = {
          fromLength: emergency.messages.length,
          sourceFingerprint: fingerprint(emergency.messages),
          run: emergency,
        };
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

  return { prepareTurn, transformContext, wrapStreamFn: wrapStreamFunction };
};
