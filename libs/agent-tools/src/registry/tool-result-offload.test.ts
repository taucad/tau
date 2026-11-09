import { describe, expect, it, vi } from 'vitest';
import type { RpcFileSystem } from '@taucad/chat/rpc';

import type { HostToolInvocation, HostToolResult, HostToolResultBudget, JsonValue } from '@taucad/agent-host';
import { createChatToolRegistry } from '#registry/tool-registry.js';
import { retainedResultPath, toolResultLimit, withToolResultOffload } from '#registry/tool-result-offload.js';

/*
 * Regression review R4: successors to the LangChain plane's `tool-offloading.middleware.test.ts` and
 * `tool-result-budget.middleware.test.ts`. A result too large for context is written whole where `read_file` can page
 * it, and the model gets a preview that keeps the result's shape and names the file.
 */

type Written = { path: string; text: string };

const fileSystemRecording = (options: { fail?: boolean } = {}) => {
  const written: Written[] = [];
  const fileSystem = {
    writeBinaryFile: vi.fn(async (path: string, data: Uint8Array<ArrayBuffer>) => {
      if (options.fail) {
        throw new Error('disk full');
      }
      written.push({ path, text: new TextDecoder().decode(data) });
    }),
  } as unknown as RpcFileSystem;
  return { written, fileSystem };
};

const invocation = (toolName: string, extra: Partial<HostToolInvocation> = {}): HostToolInvocation => ({
  toolCallId: 'call-1',
  toolName,
  input: {},
  signal: new AbortController().signal,
  ...extra,
});

const offloading = (result: HostToolResult, options: { fail?: boolean } = {}) => {
  const recorded = fileSystemRecording(options);
  const invoke = withToolResultOffload(async () => result, { fileSystemFor: () => recorded.fileSystem });
  return { invoke, ...recorded };
};

const lines = (count: number, width = 60): string =>
  Array.from({ length: count }, (_, index) => `${String(index + 1).padStart(6)}  ${'x'.repeat(width)}`).join('\n');

const readFileResult = (content: string): HostToolResult => ({
  content: { content, size: content.length, contentKind: 'text', totalLines: content.split('\n').length, startLine: 1 },
  isError: false,
});

const serialized = (value: JsonValue): number => JSON.stringify(value).length;

describe('withToolResultOffload', () => {
  it('should return a result under its limit untouched and write nothing', async () => {
    const result = readFileResult(lines(10));
    const { invoke, fileSystem } = offloading(result);

    await expect(invoke(invocation('read_file'))).resolves.toBe(result);
    expect(fileSystem.writeBinaryFile).not.toHaveBeenCalled();
  });

  it('should keep read_file results up to 80,000 characters, as the LangChain plane did', async () => {
    const result = readFileResult(lines(500));
    expect(serialized(result.content)).toBeGreaterThan(toolResultLimit('grep'));
    expect(serialized(result.content)).toBeLessThan(toolResultLimit('read_file'));
    const { invoke } = offloading(result);

    await expect(invoke(invocation('read_file'))).resolves.toBe(result);
  });

  it('should retain an oversized read_file result whole and return a preview naming the file', async () => {
    const text = lines(2000);
    const { invoke, written } = offloading(readFileResult(text));

    const result = await invoke(invocation('read_file'));

    const path = retainedResultPath('call-1');
    expect(written.map((file) => file.path)).toEqual([path]);
    expect(written[0]!.text).toContain(text);
    const content = result.content as Record<string, JsonValue>;
    expect(result.isError).toBe(false);
    expect(content['totalLines']).toBe(2000);
    expect(content['contentKind']).toBe('text');
    expect(content['offloadedTo']).toEqual({ path, characters: serialized(readFileResult(text).content) });
    const preview = content['content'] as string;
    expect(preview.startsWith(text.slice(0, 1000))).toBe(true);
    expect(preview).toContain(path);
    expect(serialized(result.content)).toBeLessThan(10_000);
  });

  it('should cut a long text preview at a line boundary', async () => {
    const { invoke } = offloading(readFileResult(lines(2000)));

    const result = await invoke(invocation('read_file'));
    const preview = (result.content as Record<string, string>)['content']!;
    const shown = preview.slice(0, preview.indexOf('\n\n['));

    expect(shown.split('\n').every((line) => line.length === 68)).toBe(true);
  });

  it('should write long text as lines, not one escaped JSON string, so read_file can page it', async () => {
    const text = lines(2000);
    const { invoke, written } = offloading(readFileResult(text));

    await invoke(invocation('read_file'));

    expect(written[0]!.text.split('\n').length).toBeGreaterThan(2000);
    expect(written[0]!.text).not.toContain(String.raw`\n`);
  });

  it('should shorten a grep match list over 20,000 characters and keep its totals', async () => {
    const matches = Array.from({ length: 800 }, (_, index) => ({
      file: `src/file-${index}.ts`,
      line: index + 1,
      content: `const value${index} = compute(${index});`,
    }));
    const original: HostToolResult = { content: { matches, totalMatches: 800, truncated: false }, isError: false };
    const { invoke, written } = offloading(original);

    const result = await invoke(invocation('grep'));

    const content = result.content as Record<string, JsonValue>;
    expect(content['totalMatches']).toBe(800);
    expect((content['matches'] as JsonValue[]).length).toBeGreaterThan(0);
    expect((content['matches'] as JsonValue[]).length).toBeLessThan(800);
    expect(content['matches']).toEqual(matches.slice(0, (content['matches'] as JsonValue[]).length));
    expect(content['offloadedTo']).toMatchObject({ path: retainedResultPath('call-1') });
    expect(written[0]!.text).toContain('src/file-799.ts');
  });

  it('should apply the 20,000-character default to tools without their own limit', async () => {
    const original: HostToolResult = {
      content: { status: 'completed', exitCode: 0, output: lines(400) },
      isError: false,
    };
    const { invoke, written } = offloading(original);

    const result = await invoke(invocation('shell'));

    expect(written).toHaveLength(1);
    expect(result.content).toMatchObject({ status: 'completed', exitCode: 0 });
    expect(((result.content as Record<string, string>)['output'] ?? '').length).toBeLessThan(5000);
  });

  it.each(['edit_file', 'create_file', 'delete_file', 'use_skill', 'test_model', 'screenshot', 'update_todos'])(
    'should never offload %s',
    async (toolName) => {
      const original: HostToolResult = { content: { text: lines(2000) }, isError: false };
      const { invoke, fileSystem } = offloading(original);

      await expect(invoke(invocation(toolName))).resolves.toBe(original);
      expect(fileSystem.writeBinaryFile).not.toHaveBeenCalled();
    },
  );

  it('should leave a result that carries images for the image trimmer', async () => {
    const original: HostToolResult = {
      content: { images: [{ dataUrl: `data:image/png;base64,${'A'.repeat(200_000)}` }] },
      isError: false,
    };
    const { invoke, fileSystem } = offloading(original);

    await expect(invoke(invocation('evaluate_model'))).resolves.toBe(original);
    expect(fileSystem.writeBinaryFile).not.toHaveBeenCalled();
  });

  it('should leave an error result untouched', async () => {
    const original: HostToolResult = { content: { errorCode: 'X', message: lines(2000) }, isError: true };
    const { invoke } = offloading(original);

    await expect(invoke(invocation('grep'))).resolves.toBe(original);
  });

  it('should return the full result when the file cannot be written', async () => {
    const original = readFileResult(lines(2000));
    const { invoke } = offloading(original, { fail: true });

    await expect(invoke(invocation('read_file'))).resolves.toBe(original);
  });

  it('should preview a plain-text result with a note naming the file', async () => {
    const text = lines(2000);
    const { invoke } = offloading({ content: text, isError: false });

    const result = await invoke(invocation('custom_tool'));

    expect(typeof result.content).toBe('string');
    expect(result.content as string).toContain(retainedResultPath('call-1'));
    expect((result.content as string).length).toBeLessThan(6000);
  });

  it('should keep every page of a web_browser result and cut each long page with a note naming the file', async () => {
    const pages = [
      { url: 'https://a.example', content: lines(400) },
      { url: 'https://b.example', content: lines(400) },
    ];
    const { invoke } = offloading({ content: pages, isError: false });

    const result = await invoke(invocation('web_browser'));

    const preview = result.content as Array<{ url: string; content: string }>;
    expect(preview.map((page) => page.url)).toEqual(['https://a.example', 'https://b.example']);
    for (const page of preview) {
      expect(page.content).toContain(retainedResultPath('call-1'));
      expect(page.content.length).toBeLessThan(5000);
    }
  });

  it('should name a path inside the read-only artifacts record and slug a provider id', () => {
    expect(retainedResultPath('call_1|fc_2')).toBe('.tau/artifacts/call_1_fc_2__tool-result-txt/result.txt');
  });

  describe('aggregate batch budget', () => {
    const budget = (fits: boolean): HostToolResultBudget & { admit: ReturnType<typeof vi.fn> } => ({
      admit: vi.fn(() => fits),
      charge: vi.fn(),
    });

    it('should ask the batch budget for a result under its own limit and keep it when it fits', async () => {
      const original = readFileResult(lines(100));
      const resultBudget = budget(true);
      const { invoke } = offloading(original);

      await expect(invoke(invocation('read_file', { resultBudget }))).resolves.toBe(original);
      expect(resultBudget.admit).toHaveBeenCalledWith(serialized(original.content));
      expect(resultBudget.charge).not.toHaveBeenCalled();
    });

    it('should retain a result the batch budget refuses and charge only its preview', async () => {
      const original = readFileResult(lines(300));
      const resultBudget = budget(false);
      const { invoke, written } = offloading(original);

      const result = await invoke(invocation('read_file', { resultBudget }));

      expect(written).toHaveLength(1);
      expect(result.content).toMatchObject({ offloadedTo: { path: retainedResultPath('call-1') } });
      expect(resultBudget.charge).toHaveBeenCalledWith(serialized(result.content));
    });

    it('should charge the preview of a result retained for its own size without asking the budget', async () => {
      const resultBudget = budget(true);
      const { invoke } = offloading(readFileResult(lines(2000)));

      const result = await invoke(invocation('read_file', { resultBudget }));

      expect(resultBudget.admit).not.toHaveBeenCalled();
      expect(resultBudget.charge).toHaveBeenCalledWith(serialized(result.content));
    });

    it('should charge an exempt or error result without retaining it', async () => {
      const resultBudget = budget(false);
      const original: HostToolResult = { content: { text: lines(300) }, isError: false };
      const { invoke } = offloading(original);

      await expect(invoke(invocation('use_skill', { resultBudget }))).resolves.toBe(original);
      expect(resultBudget.charge).toHaveBeenCalledWith(serialized(original.content));
    });
  });
});

describe('createChatToolRegistry offloading', () => {
  it('should retain an oversized result through the record filesystem', async () => {
    const project = fileSystemRecording();
    const records = fileSystemRecording();
    const registry = createChatToolRegistry({
      fileSystemFor: () => project.fileSystem,
      recordFileSystemFor: () => records.fileSystem,
      testingEnabled: false,
      web: {
        search: async () => [],
        browse: async ({ urls }) => urls.map((url) => ({ url, content: lines(600) })),
      },
    });

    const result = await registry.invoke(invocation('web_browser', { input: { urls: ['https://a.example'] } }));

    expect(project.written).toEqual([]);
    expect(records.written.map((file) => file.path)).toEqual([retainedResultPath('call-1')]);
    expect((result.content as Array<{ content: string }>)[0]!.content).toContain(retainedResultPath('call-1'));
  });
});
