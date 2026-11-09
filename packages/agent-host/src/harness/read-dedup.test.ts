import { describe, expect, it, vi } from 'vitest';

import type { JsonObject, ProviderMessage } from '#log/event-types.js';
import type { HostToolInvocation, HostToolResult, ToolRegistry } from '#waist/ports.js';
import { readUnchangedMarker, withReadDedup } from '#harness/read-dedup.js';

/* Regression review R5: re-reading an unchanged file returns a pointer to the earlier result, not the file again. */

const body = (content: string) => ({ content, size: content.length, contentKind: 'text', totalLines: 1 });

const priorRead = (toolCallId: string, input: JsonObject, content: string): ProviderMessage[] => [
  { id: `in-${toolCallId}`, role: 'tool-input', toolCallId, toolName: 'read_file', content: input },
  {
    id: `out-${toolCallId}`,
    role: 'tool-output',
    toolCallId,
    toolName: 'read_file',
    isError: false,
    content: body(content),
  },
];

const registryReturning = (result: HostToolResult): ToolRegistry & { invoke: ReturnType<typeof vi.fn> } => ({
  list: () => [],
  invoke: vi.fn(async () => result),
});

const call = (input: JsonObject, toolName = 'read_file'): HostToolInvocation => ({
  toolCallId: 'call-now',
  toolName,
  input,
  signal: new AbortController().signal,
});

describe('withReadDedup', () => {
  it('should replace an identical re-read with the unchanged marker naming the earlier call', async () => {
    const registry = withReadDedup(
      registryReturning({ content: body('export const a = 1;'), isError: false }),
      async () => priorRead('call-first', { targetFile: 'main.ts' }, 'export const a = 1;'),
    );

    const result = await registry.invoke(call({ targetFile: 'main.ts' }));

    expect(result).toEqual({
      content: { ...body('export const a = 1;'), content: readUnchangedMarker('call-first') },
      isError: false,
    });
    expect(readUnchangedMarker('call-first')).toMatch(/^\[File unchanged since last read in tool_call call-first\./u);
  });

  it('should return the new content when the file changed', async () => {
    const registry = withReadDedup(
      registryReturning({ content: body('export const a = 2;'), isError: false }),
      async () => priorRead('call-first', { targetFile: 'main.ts' }, 'export const a = 1;'),
    );

    const result = await registry.invoke(call({ targetFile: 'main.ts' }));

    expect(result.content).toEqual(body('export const a = 2;'));
  });

  it('should not dedup a different page of the same file', async () => {
    const registry = withReadDedup(registryReturning({ content: body('same'), isError: false }), async () =>
      priorRead('call-first', { targetFile: 'main.ts', offset: 1 }, 'same'),
    );

    const result = await registry.invoke(call({ targetFile: 'main.ts', offset: 2001 }));

    expect(result.content).toEqual(body('same'));
  });

  it('should not point at an earlier read whose body compaction already cleared', async () => {
    const cleared = priorRead('call-first', { targetFile: 'main.ts' }, 'export const a = 1;');
    const registry = withReadDedup(
      registryReturning({ content: body('export const a = 1;'), isError: false }),
      async () =>
        cleared.map((message) =>
          message.role === 'tool-output' ? { ...message, content: '[Old tool result content cleared]' } : message,
        ),
    );

    const result = await registry.invoke(call({ targetFile: 'main.ts' }));

    expect(result.content).toEqual(body('export const a = 1;'));
  });

  it('should leave other tools and errors untouched', async () => {
    const inner = registryReturning({ content: { errorCode: 'ENOENT', message: 'missing' }, isError: true });
    const registry = withReadDedup(inner, async () => priorRead('call-first', { targetFile: 'main.ts' }, 'x'));

    await expect(registry.invoke(call({ targetFile: 'main.ts' }))).resolves.toMatchObject({ isError: true });
    await expect(registry.invoke(call({ path: 'x' }, 'grep'))).resolves.toMatchObject({ isError: true });
  });
});
