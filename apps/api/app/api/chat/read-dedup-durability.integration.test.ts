// @vitest-environment node
/* eslint-disable @typescript-eslint/naming-convention, @typescript-eslint/explicit-member-accessibility -- LangChain's BaseChatModel API mandates snake_case fields/methods (`_generate`, `_combineLLMOutput`, `_llmType`) and protected member shorthand. */
/* oxlint-disable @typescript-eslint/class-literal-property-style -- LangChain BaseChatModel pattern. */
/**
 * Durability contract for the `read_file` dedup pointer in the LangGraph
 * auxiliary store.
 *
 * The audit (docs/research/content-replacement-state-durability-audit.md)
 * called out a smoking-gun durability gap: the prior in-process
 * `ContentReplacementStateRegistry` lost the `read_file` dedup pointer on
 * every Fly auto-stop, redeploy, cross-instance hop, and >1 week revisit.
 * The current architecture stores the pointer in a LangGraph `BaseStore`
 * (production: Redis-backed `RedisReadDedupStore`; tests: `InMemoryStore`)
 * so the dedup signal survives the same boundaries as the checkpointer.
 *
 * This integration test pins the durability contract end-to-end:
 *
 * 1. Build agent A with `MemorySaver` + `InMemoryStore` + the real
 *    `readFileTool`. Drive turn 1 with a fake LLM that emits one
 *    `read_file` tool call. Assert the store now contains the dedup entry
 *    keyed by `(recent_reads, threadId, fingerprint)`.
 * 2. Throw away agent A. Build agent B from scratch reusing the SAME
 *    `MemorySaver` AND `InMemoryStore` (mirroring how Postgres + Redis
 *    persist across instance hops). Drive turn 2 with the same RPC
 *    `modifiedAt`. Assert the resulting `ToolMessage` carries the
 *    `fileUnchangedMarker` referencing the original `tool_call_id`.
 */
import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import type { ChatResult } from '@langchain/core/outputs';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import { createAgent } from 'langchain';
import { MemorySaver, InMemoryStore } from '@langchain/langgraph';
import { fileUnchangedMarker, toolName } from '@taucad/chat/constants';
import { readFileTool } from '#api/tools/tools/tool-read-file.js';
import type { ChatRpcConfigurable } from '#api/tools/tool.types.js';
import { buildReadFingerprint } from '#api/tools/tools/read-file-fingerprint.js';
import { recentReadsRootNamespace } from '#api/chat/recent-reads-namespace.js';

class ScriptedToolModel extends BaseChatModel {
  callCount = 0;

  constructor(private readonly toolCallId: string) {
    super({});
  }

  override _llmType(): string {
    return 'scripted-tool-model';
  }

  override _combineLLMOutput(): Record<string, unknown> {
    return {};
  }

  override bindTools(): this {
    return this;
  }

  override async _generate(
    _messages: BaseMessage[],
    _options: this['ParsedCallOptions'],
    _runManager?: CallbackManagerForLLMRun,
  ): Promise<ChatResult> {
    this.callCount += 1;
    if (this.callCount === 1) {
      const message = new AIMessage({
        content: '',
        tool_calls: [
          {
            id: this.toolCallId,
            name: toolName.readFile,
            args: { targetFile: 'shared/index.ts' },
            type: 'tool_call',
          },
        ],
      });
      return { generations: [{ text: '', message }] };
    }

    const message = new AIMessage({ content: 'done' });
    return { generations: [{ text: 'done', message }] };
  }
}

const buildChatRpcService = (modifiedAt: string): ChatRpcConfigurable['chatRpcService'] => {
  const chatRpcService = mock<ChatRpcConfigurable['chatRpcService']>();
  chatRpcService.sendRpcRequest.mockResolvedValue({
    success: true,
    content: 'export const value = 1;',
    totalLines: 1,
    startLine: 1,
    modifiedAt,
  });
  return chatRpcService;
};

const findReadFileToolMessage = (messages: BaseMessage[]): ToolMessage => {
  for (const message of messages) {
    if (message instanceof ToolMessage && message.name === toolName.readFile) {
      return message as ToolMessage;
    }
  }
  throw new Error(
    `No read_file ToolMessage in agent state (saw: ${messages.map((m) => m.constructor.name).join(', ')})`,
  );
};

type AgentSnapshot = { messages: BaseMessage[] };

const snapshotValues = async (
  agent: ReturnType<typeof createAgent>,
  config: { configurable: { thread_id: string } },
): Promise<AgentSnapshot> => {
  const state = await (agent as unknown as { getState(config: unknown): Promise<{ values: unknown }> }).getState(
    config,
  );
  return state.values as AgentSnapshot;
};

const parseToolMessage = (message: ToolMessage): { content: string; modifiedAt?: string } => {
  const raw = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
  return JSON.parse(raw) as { content: string; modifiedAt?: string };
};

describe('read_file dedup durability via LangGraph BaseStore', () => {
  it('hydrates the dedup pointer from the store across a simulated process restart', async () => {
    const checkpointer = new MemorySaver();
    const store = new InMemoryStore();
    const threadId = 'durability-thread-1';
    const modifiedAt = '2026-05-13T12:00:00.000Z';
    const fingerprint = buildReadFingerprint({ targetFile: 'shared/index.ts' });
    const namespace = [...recentReadsRootNamespace, threadId];
    const config = { configurable: { thread_id: threadId } };

    // -------- Agent A (turn 1) --------
    const turn1RpcService = buildChatRpcService(modifiedAt);

    const agentA = createAgent({
      model: new ScriptedToolModel('tc-turn1'),
      tools: [readFileTool],
      checkpointer,
      store,
    });

    await agentA.invoke(
      { messages: [new HumanMessage('Read shared/index.ts please.')] },
      {
        ...config,
        configurable: {
          ...config.configurable,
          chatRpcService: turn1RpcService,
        },
        recursionLimit: 5,
      },
    );

    const turn1Snapshot = await snapshotValues(agentA, config);
    const turn1Pointer = await store.get(namespace, fingerprint);
    expect(turn1Pointer, `expected dedup pointer for ${fingerprint} after turn 1`).not.toBeNull();
    expect(turn1Pointer?.value).toEqual({ priorToolCallId: 'tc-turn1', modifiedAt });

    expect(turn1RpcService.sendRpcRequest).toHaveBeenCalledTimes(1);

    const turn1ToolMessage = findReadFileToolMessage(turn1Snapshot.messages);
    const turn1Parsed = parseToolMessage(turn1ToolMessage);
    expect(
      turn1Parsed.content.startsWith('   1\t'),
      'turn 1 must surface the gutter-formatted file body (cache miss)',
    ).toBe(true);
    expect(fileUnchangedMarker.matches(turn1Parsed.content)).toBe(false);

    // -------- Simulated process restart (drop agent A entirely) --------
    // Rebuild from scratch — different middleware instance, different tool
    // runtime closures, different model — but reuse the SAME MemorySaver +
    // InMemoryStore to mirror Postgres + Redis cross-instance hydration.
    const turn2RpcService = buildChatRpcService(modifiedAt);

    const agentB = createAgent({
      model: new ScriptedToolModel('tc-turn2'),
      tools: [readFileTool],
      checkpointer,
      store,
    });

    await agentB.invoke(
      { messages: [new HumanMessage('Read shared/index.ts again.')] },
      {
        ...config,
        configurable: {
          ...config.configurable,
          chatRpcService: turn2RpcService,
        },
        recursionLimit: 5,
      },
    );

    const turn2Snapshot = await snapshotValues(agentB, config);
    const turn2Messages = turn2Snapshot.messages;

    const turn2ToolMessage = [...turn2Messages]
      .reverse()
      .find((message) => message instanceof ToolMessage && message.name === toolName.readFile);
    expect(turn2ToolMessage, 'turn 2 must produce a fresh read_file ToolMessage').toBeInstanceOf(ToolMessage);
    const turn2Parsed = parseToolMessage(turn2ToolMessage as ToolMessage);
    expect(
      fileUnchangedMarker.matches(turn2Parsed.content),
      'turn 2 must short-circuit via fileUnchangedMarker because the dedup pointer survived the restart',
    ).toBe(true);
    expect(turn2Parsed.content).toContain('tc-turn1');

    expect(turn2RpcService.sendRpcRequest).toHaveBeenCalledTimes(1);
  });

  it('forces a fresh read when modifiedAt drifts between turns (mtime invalidation)', async () => {
    const checkpointer = new MemorySaver();
    const store = new InMemoryStore();
    const threadId = 'durability-thread-mtime';
    const fingerprint = buildReadFingerprint({ targetFile: 'shared/index.ts' });
    const namespace = [...recentReadsRootNamespace, threadId];
    const config = { configurable: { thread_id: threadId } };

    const agentA = createAgent({
      model: new ScriptedToolModel('tc-original'),
      tools: [readFileTool],
      checkpointer,
      store,
    });

    const turn1RpcService = buildChatRpcService('2026-05-13T12:00:00.000Z');
    await agentA.invoke(
      { messages: [new HumanMessage('first read')] },
      { ...config, configurable: { ...config.configurable, chatRpcService: turn1RpcService }, recursionLimit: 5 },
    );

    const turn1Pointer = await store.get(namespace, fingerprint);
    expect((turn1Pointer?.value as { modifiedAt?: string } | undefined)?.modifiedAt).toBe('2026-05-13T12:00:00.000Z');

    // Simulated restart + the file moved underneath us (mtime drift).
    const agentB = createAgent({
      model: new ScriptedToolModel('tc-after-drift'),
      tools: [readFileTool],
      checkpointer,
      store,
    });

    const turn2RpcService = buildChatRpcService('2026-05-13T13:00:00.000Z');
    await agentB.invoke(
      { messages: [new HumanMessage('re-read after drift')] },
      { ...config, configurable: { ...config.configurable, chatRpcService: turn2RpcService }, recursionLimit: 5 },
    );

    const turn2Pointer = await store.get(namespace, fingerprint);
    expect(turn2Pointer?.value).toEqual({
      priorToolCallId: 'tc-after-drift',
      modifiedAt: '2026-05-13T13:00:00.000Z',
    });

    const turn2Snapshot = await snapshotValues(agentB, config);
    const turn2ToolMessage = [...turn2Snapshot.messages]
      .reverse()
      .find((message) => message instanceof ToolMessage && message.name === toolName.readFile) as ToolMessage;
    const turn2Parsed = parseToolMessage(turn2ToolMessage);
    expect(
      fileUnchangedMarker.matches(turn2Parsed.content),
      'turn 2 must NOT short-circuit when modifiedAt drifted',
    ).toBe(false);

    // Both turns hit the RPC (no cache hit on either run).
    vi.clearAllMocks();
  });
});
