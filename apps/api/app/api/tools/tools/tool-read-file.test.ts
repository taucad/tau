// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { ToolRuntime } from '@langchain/core/tools';
import { InMemoryStore } from '@langchain/langgraph';
import { fileUnchangedMarker, rpcName } from '@taucad/chat/constants';
import type { ChatRpcConfigurable } from '#api/tools/tool.types.js';
import { readFileToolDefinition, readFileTool } from '#api/tools/tools/tool-read-file.js';
import { buildReadFingerprint } from '#api/tools/tools/read-file-fingerprint.js';
import { recentReadsRootNamespace } from '#api/chat/recent-reads-namespace.js';

describe('readFileToolDefinition', () => {
  describe('tool description', () => {
    it('should advertise the cat -n gutter output format', () => {
      expect(readFileToolDefinition.description).toMatch(/cat -n gutter/);
    });

    it('should direct the agent to provide offset/limit for files >2000 lines', () => {
      expect(readFileToolDefinition.description).toMatch(/Files >2000 lines/);
      expect(readFileToolDefinition.description).toMatch(/`offset`/);
      expect(readFileToolDefinition.description).toMatch(/`limit`/);
    });
  });
});

type ToolInvoke = {
  invoke(input: { targetFile: string; offset?: number; limit?: number }, runtime: ToolRuntime): Promise<unknown>;
};

const chatId = 'chat-invocation-test';

const buildRuntime = (
  toolCallId: string,
  chatRpcService: ChatRpcConfigurable['chatRpcService'],
  store: InMemoryStore | undefined = new InMemoryStore(),
): ToolRuntime =>
  ({
    toolCallId,
    store,
    configurable: {
      chatRpcService,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- ChatRpcConfigurable uses LangGraph thread_id
      thread_id: chatId,
    },
  }) as unknown as ToolRuntime;

type ReadFileResult = { content: string; totalLines: number; modifiedAt?: string };

const namespace = [...recentReadsRootNamespace, chatId];

describe('readFileTool — gutter wrap and dedup', () => {
  it('returns the cat -n gutter and persists the dedup pointer to the store on a fresh read', async () => {
    const chatRpcService = mock<ChatRpcConfigurable['chatRpcService']>();
    chatRpcService.sendRpcRequest.mockResolvedValue({
      success: true,
      content: 'line1\nline2',
      totalLines: 3,
      startLine: 1,
      modifiedAt: '2026-05-13T12:00:00.000Z',
    });

    const store = new InMemoryStore();
    const runtime = buildRuntime('tc-wrap', chatRpcService, store);
    const tool = readFileTool as unknown as ToolInvoke;

    const result = (await tool.invoke({ targetFile: 'f.ts' }, runtime)) as ReadFileResult;

    expect(result.content).toBe('   1\tline1\n   2\tline2');
    expect(result.totalLines).toBe(3);
    expect(result.modifiedAt).toBe('2026-05-13T12:00:00.000Z');

    const fingerprint = buildReadFingerprint({ targetFile: 'f.ts' });
    const stored = await store.get(namespace, fingerprint);
    expect(stored).not.toBeNull();
    expect(stored?.value).toEqual({ priorToolCallId: 'tc-wrap', modifiedAt: '2026-05-13T12:00:00.000Z' });
  });

  it('aligns the gutter with startLine when an offset slice is returned', async () => {
    const chatRpcService = mock<ChatRpcConfigurable['chatRpcService']>();
    chatRpcService.sendRpcRequest.mockResolvedValue({
      success: true,
      content: 'gamma\ndelta',
      totalLines: 10,
      startLine: 3,
      modifiedAt: '2026-05-13T12:00:00.000Z',
    });

    const runtime = buildRuntime('tc-offset', chatRpcService);
    const tool = readFileTool as unknown as ToolInvoke;
    const result = (await tool.invoke({ targetFile: 'f.ts', offset: 3, limit: 2 }, runtime)) as ReadFileResult;

    expect(result.content).toBe('   3\tgamma\n   4\tdelta');
  });

  it('returns the fileUnchangedMarker when the store reports an unchanged read', async () => {
    const chatRpcService = mock<ChatRpcConfigurable['chatRpcService']>();
    const modifiedAt = '2026-05-13T12:00:00.000Z';
    chatRpcService.sendRpcRequest.mockResolvedValue({
      success: true,
      content: 'only',
      totalLines: 1,
      startLine: 1,
      modifiedAt,
    });

    const store = new InMemoryStore();
    const fingerprint = buildReadFingerprint({ targetFile: 'same.ts' });
    await store.put(namespace, fingerprint, { priorToolCallId: 'tc-first', modifiedAt });

    const runtime = buildRuntime('tc-second', chatRpcService, store);
    const tool = readFileTool as unknown as ToolInvoke;
    const result = (await tool.invoke({ targetFile: 'same.ts' }, runtime)) as ReadFileResult;

    expect(result.content).toBe(fileUnchangedMarker.build('tc-first'));
    expect(fileUnchangedMarker.matches(result.content)).toBe(true);
    expect(result.totalLines).toBe(1);
    expect(result.modifiedAt).toBe(modifiedAt);

    const persistedAfter = await store.get(namespace, fingerprint);
    expect(persistedAfter?.value).toEqual({ priorToolCallId: 'tc-first', modifiedAt });

    expect(chatRpcService.sendRpcRequest).toHaveBeenCalledWith(expect.objectContaining({ rpcName: rpcName.readFile }));
  });

  it('does not persist a dedup pointer when the RPC response has no modifiedAt', async () => {
    const chatRpcService = mock<ChatRpcConfigurable['chatRpcService']>();
    chatRpcService.sendRpcRequest.mockResolvedValue({
      success: true,
      content: 'no-mtime',
      totalLines: 1,
      startLine: 1,
    });

    const store = new InMemoryStore();
    const runtime = buildRuntime('tc-no-mtime', chatRpcService, store);
    const tool = readFileTool as unknown as ToolInvoke;
    const result = (await tool.invoke({ targetFile: 'no-mtime.ts' }, runtime)) as ReadFileResult;

    expect(result.content).toBe('   1\tno-mtime');
    expect(result.modifiedAt).toBeUndefined();

    const fingerprint = buildReadFingerprint({ targetFile: 'no-mtime.ts' });
    const stored = await store.get(namespace, fingerprint);
    expect(stored).toBeNull();
  });

  it('treats a stale dedup pointer (mtime drift) as a miss and rewrites the pointer', async () => {
    const chatRpcService = mock<ChatRpcConfigurable['chatRpcService']>();
    chatRpcService.sendRpcRequest.mockResolvedValue({
      success: true,
      content: 'drifted',
      totalLines: 1,
      startLine: 1,
      modifiedAt: '2026-05-13T13:00:00.000Z',
    });

    const store = new InMemoryStore();
    const fingerprint = buildReadFingerprint({ targetFile: 'drift.ts' });
    await store.put(namespace, fingerprint, {
      priorToolCallId: 'tc-prev',
      modifiedAt: '2026-05-13T12:00:00.000Z',
    });

    const runtime = buildRuntime('tc-drift', chatRpcService, store);
    const tool = readFileTool as unknown as ToolInvoke;
    const result = (await tool.invoke({ targetFile: 'drift.ts' }, runtime)) as ReadFileResult;

    expect(result.content).toBe('   1\tdrifted');

    const persisted = await store.get(namespace, fingerprint);
    expect(persisted?.value).toEqual({ priorToolCallId: 'tc-drift', modifiedAt: '2026-05-13T13:00:00.000Z' });
  });

  it('falls back to plain output when no store is wired (defensive)', async () => {
    const chatRpcService = mock<ChatRpcConfigurable['chatRpcService']>();
    chatRpcService.sendRpcRequest.mockResolvedValue({
      success: true,
      content: 'no-store',
      totalLines: 1,
      startLine: 1,
      modifiedAt: '2026-05-13T12:00:00.000Z',
    });

    const runtime = buildRuntime('tc-no-store', chatRpcService, undefined);
    const tool = readFileTool as unknown as ToolInvoke;
    const result = (await tool.invoke({ targetFile: 'f.ts' }, runtime)) as ReadFileResult;

    expect(result.content).toBe('   1\tno-store');
  });
});
