// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { SourceMapGenerator } from 'source-map-js';
import { runOcMain } from '#oc-run-main.js';
import type { OcExceptionInstance } from '#oc-exceptions.js';

const emptyOcInstance = {} as unknown as OcExceptionInstance;

describe('runOcMain', () => {
  it('returns success with undefined when the module has no main/default export', async () => {
    const module = {};
    const result = await runOcMain({
      module,
      parameters: {},
      ocInstance: emptyOcInstance,
      errorContext: {},
      firstArg: 'unused',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toBeUndefined();
    }
  });

  it('passes parameters as the only arg when arity < 2', async () => {
    const main = vi.fn().mockReturnValue('only-params');
    const module = { default: main };

    const result = await runOcMain({
      module,
      parameters: { width: 10 },
      ocInstance: emptyOcInstance,
      errorContext: {},
      firstArg: 'should-not-be-used',
    });

    expect(result.success).toBe(true);
    expect(main).toHaveBeenCalledWith({ width: 10 });
    expect(main).not.toHaveBeenCalledWith('should-not-be-used', expect.anything());
  });

  it('passes firstArg as the first positional arg when arity >= 2', async () => {
    const main = vi.fn((kernelArgument: unknown, parameters: unknown) => ({ kernelArgument, parameters }));
    const module = { default: main };

    const result = await runOcMain({
      module,
      parameters: { size: 5 },
      ocInstance: emptyOcInstance,
      errorContext: {},
      firstArg: { ocSentinel: true },
    });

    expect(result.success).toBe(true);
    expect(main).toHaveBeenCalledWith({ ocSentinel: true }, { size: 5 });
  });

  it('captures thrown errors into source-mapped issues', async () => {
    const blobUrl = 'blob:http://localhost:3000/run-main';
    const generator = new SourceMapGenerator({ file: blobUrl });
    generator.addMapping({
      generated: { line: 3, column: 0 },
      original: { line: 4, column: 2 },
      source: 'main.ts',
      name: 'main',
    });
    const sourceMap = generator.toString();

    const main = (): never => {
      const error = new Error('runOcMain-boom');
      error.stack = ['Error: runOcMain-boom', `    at main (${blobUrl}:3:1)`].join('\n');
      throw error;
    };
    const module = { default: main };

    const result = await runOcMain({
      module,
      parameters: {},
      ocInstance: emptyOcInstance,
      errorContext: { bundleSourceMap: sourceMap, entryUrl: blobUrl },
      firstArg: undefined,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues).toHaveLength(1);
      const issue = result.issues[0]!;
      expect(issue.message).toContain('runOcMain-boom');
      const userFrame = issue.stackFrames!.find((f) => f.context === 'user');
      expect(userFrame).toBeDefined();
      expect(userFrame!.fileName).toMatch(/main\.ts$/);
      expect(userFrame!.fileName).not.toMatch(/^blob:/);
    }
  });

  it('treats a missing main as a no-op even when default is non-callable', async () => {
    const module = { default: 42 };
    const result = await runOcMain({
      module,
      parameters: {},
      ocInstance: emptyOcInstance,
      errorContext: {},
      firstArg: undefined,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toBeUndefined();
    }
  });
});
