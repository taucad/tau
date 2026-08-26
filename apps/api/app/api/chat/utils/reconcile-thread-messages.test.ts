import { AIMessage, HumanMessage, RemoveMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { describe, expect, it, vi } from 'vitest';
import {
  findCommonVisiblePrefix,
  fingerprintVisibleMessage,
  reconcileThreadMessages,
  sameVisibleMessage,
  toVisibleProjection,
} from '#api/chat/utils/reconcile-thread-messages.js';
import type { ChatGraphStateApi } from '#api/chat/utils/reconcile-thread-messages.js';
import { createTauInternalHumanMessage } from '#api/chat/utils/tau-internal-message.js';

const human = (id: string, content: string): HumanMessage => new HumanMessage({ id, content });
const ai = (id: string, content: string): AIMessage => new AIMessage({ id, content });
const threadIdKey = 'thread_id';
const checkpointIdKey = 'checkpoint_id';

const threadConfig = (extra: Record<string, unknown> = {}) => ({
  configurable: {
    [threadIdKey]: 'chat_1',
    ...extra,
  },
});
const defaultUpdateConfig = threadConfig();

const createGraph = (messages: BaseMessage[], updateConfig = defaultUpdateConfig) =>
  ({
    getState: vi.fn().mockResolvedValue({ values: { messages } }),
    updateState: vi.fn().mockResolvedValue(updateConfig),
  }) satisfies ChatGraphStateApi;

describe('reconcileThreadMessages', () => {
  it('streams only the client tail when graph state already matches the visible prefix', async () => {
    const prefix = [human('msg_1', 'hello'), ai('msg_2', 'hi')];
    const replacement = human('msg_3', 'new question');
    const graph = createGraph(prefix);

    const result = await reconcileThreadMessages({
      graph,
      runnableConfig: threadConfig(),
      clientMessages: [...prefix, replacement],
    });

    expect(graph.updateState).not.toHaveBeenCalled();
    expect(result.commonVisiblePrefixLength).toBe(2);
    expect(result.clientVisiblePrefixLength).toBe(2);
    expect(result.removedMessageIds).toEqual([]);
    expect(result.streamInputMessages).toEqual([replacement]);
  });

  it('removes a cancelled graph-state ghost before streaming the replacement user message', async () => {
    const prefix = [human('msg_1', 'hello'), ai('msg_2', 'hi')];
    const cancelled = human('msg_cancelled', 'cancelled question');
    const replacement = human('msg_3', 'replacement question');
    const graph = createGraph([...prefix, cancelled], threadConfig({ [checkpointIdKey]: 'after' }));

    const result = await reconcileThreadMessages({
      graph,
      runnableConfig: threadConfig(),
      clientMessages: [...prefix, replacement],
    });

    expect(graph.updateState).toHaveBeenCalledTimes(1);
    const [, values] = graph.updateState.mock.calls[0] as [unknown, { messages: BaseMessage[] }];
    expect(values.messages).toHaveLength(1);
    expect(RemoveMessage.isInstance(values.messages[0])).toBe(true);
    expect(values.messages[0]?.id).toBe('msg_cancelled');
    expect(result.removedMessageIds).toEqual(['msg_cancelled']);
    expect(result.runnableConfig.configurable?.['checkpoint_id']).toBe('after');
    expect(result.streamInputMessages).toEqual([replacement]);
  });

  it('filters Tau-internal messages from the visible projection', () => {
    const visible = human('msg_1', 'hello');
    const snapshotContext = createTauInternalHumanMessage({
      id: 'tau:snapshot-context:chat_1',
      content: '<system-reminder>snapshot</system-reminder>',
      kind: 'snapshot-context',
    });

    expect(toVisibleProjection([snapshotContext, visible])).toEqual([visible]);
  });

  it('aligns compacted graph state to the retained suffix of the client full history', async () => {
    const compactedSummary = createTauInternalHumanMessage({
      id: 'tau:compaction:data_1',
      content: '[Compacted conversation history]\nold turns',
      kind: 'compaction-summary',
    });
    const retained = human('msg_retained', 'retained turn');
    const replacement = human('msg_next', 'next turn');
    const graph = createGraph([compactedSummary, retained]);

    const result = await reconcileThreadMessages({
      graph,
      runnableConfig: threadConfig(),
      clientMessages: [human('msg_old', 'old turn'), retained, replacement],
    });

    expect(graph.updateState).not.toHaveBeenCalled();
    expect(result.commonVisiblePrefixLength).toBe(1);
    expect(result.clientVisiblePrefixLength).toBe(2);
    expect(result.streamInputMessages).toEqual([replacement]);
  });

  it('drops compacted state when it cannot align to any client-visible anchor', async () => {
    const compactedSummary = createTauInternalHumanMessage({
      id: 'tau:compaction:data_1',
      content: '[Compacted conversation history]\nold turns',
      kind: 'compaction-summary',
    });
    const retained = human('msg_retained', 'retained turn');
    const replacement = human('msg_replacement', 'replacement root');
    const graph = createGraph([compactedSummary, retained]);

    const result = await reconcileThreadMessages({
      graph,
      runnableConfig: threadConfig(),
      clientMessages: [replacement],
    });

    expect(graph.updateState).toHaveBeenCalledTimes(1);
    expect(result.removedMessageIds).toEqual(['tau:compaction:data_1', 'msg_retained']);
    expect(result.streamInputMessages).toEqual([replacement]);
  });

  it('treats same-id edited content as a divergence', () => {
    const oldMessage = human('msg_edit', 'old content');
    const editedMessage = human('msg_edit', 'new content');

    expect(fingerprintVisibleMessage(oldMessage)).not.toBe(fingerprintVisibleMessage(editedMessage));
    expect(sameVisibleMessage(oldMessage, editedMessage)).toBe(false);
    expect(findCommonVisiblePrefix([oldMessage], [editedMessage])).toBe(0);
  });
});
