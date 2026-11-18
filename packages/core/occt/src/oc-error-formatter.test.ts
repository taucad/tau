// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { SourceMapGenerator } from 'source-map-js';
import { formatOcRuntimeError } from '#oc-error-formatter.js';
import type { OcExceptionInstance } from '#oc-exceptions.js';
import type { KernelStackFrame } from '@taucad/runtime/types';

const emptyOcInstance = {} as unknown as OcExceptionInstance;

function buildSourceMap(generatedFile: string, originalSource: string): string {
  const generator = new SourceMapGenerator({ file: generatedFile });
  generator.addMapping({
    generated: { line: 10, column: 4 },
    original: { line: 5, column: 12 },
    source: originalSource,
    name: 'main',
  });
  return generator.toString();
}

// The runtime's cooperative-abort error is internal; this stand-in has the name/code shape the
// runtime recognises across realms.
class RenderAbortedError extends Error {
  public constructor() {
    super('Render aborted by a superseding document operation');
    this.name = 'RenderAbortedError';
  }

  public get code(): 'RUNTIME_RENDER_ABORTED' {
    return 'RUNTIME_RENDER_ABORTED';
  }
}

function buildErrorWithStack(blobUrl: string): Error {
  const error = new Error('synthetic-boom');
  error.stack = ['Error: synthetic-boom', `    at main (${blobUrl}:10:5)`, `    at runOcMain (${blobUrl}:1:1)`].join(
    '\n',
  );
  return error;
}

describe('formatOcRuntimeError', () => {
  it('rewrites blob: stack frames to user source paths via the bundle source map', () => {
    const blobUrl = 'blob:http://localhost:3000/abcdef-1234';
    const error = buildErrorWithStack(blobUrl);
    const sourceMap = buildSourceMap(blobUrl, 'main.ts');

    const issue = formatOcRuntimeError(error, emptyOcInstance, {
      bundleSourceMap: sourceMap,
      entryUrl: blobUrl,
    });

    expect(issue.type).toBe('runtime');
    expect(issue.severity).toBe('error');
    expect(issue.message).toContain('synthetic-boom');
    const userFrame = issue.stackFrames!.find((f) => f.context === 'user');
    expect(userFrame, 'expected at least one source-mapped user frame').toBeDefined();
    expect(userFrame!.fileName).not.toMatch(/^blob:/);
    expect(userFrame!.fileName).toMatch(/main\.ts$/);
    expect(userFrame!.lineNumber).toBe(5);
    expect(issue.location?.fileName).toMatch(/main\.ts$/);
    expect(issue.location?.startLineNumber).toBe(5);
  });

  it('leaves blob: frames untouched when no bundle source map is supplied', () => {
    const blobUrl = 'blob:http://localhost:3000/no-map';
    const error = buildErrorWithStack(blobUrl);

    const issue = formatOcRuntimeError(error, emptyOcInstance, {});

    expect(issue.message).toContain('synthetic-boom');
    const blobFrame = issue.stackFrames!.find((f) => f.fileName?.startsWith('blob:'));
    expect(blobFrame, 'frames remain blob: when no map is supplied').toBeDefined();
  });

  it('invokes applySecondarySourceMaps after primary source map remapping', () => {
    const blobUrl = 'blob:http://localhost:3000/secondary';
    const error = buildErrorWithStack(blobUrl);
    const sourceMap = buildSourceMap(blobUrl, 'main.ts');

    let received: KernelStackFrame[] | undefined;
    const issue = formatOcRuntimeError(error, emptyOcInstance, {
      bundleSourceMap: sourceMap,
      entryUrl: blobUrl,
      applySecondarySourceMaps: (frames) => {
        received = frames;
        return frames.map((f) => ({ ...f, functionName: `tagged:${f.functionName ?? 'anon'}` }));
      },
    });

    expect(received, 'secondary hook should fire on remapped frames').toBeDefined();
    const taggedUser = issue.stackFrames!.find((f) => f.functionName?.startsWith('tagged:'));
    expect(taggedUser).toBeDefined();
  });

  it('reports a superseded run without parsing its stack or reading source maps', () => {
    const blobUrl = 'blob:http://localhost:3000/superseded';
    const error = new RenderAbortedError();
    error.stack = buildErrorWithStack(blobUrl).stack;
    const applySecondarySourceMaps = vi.fn((frames: KernelStackFrame[]) => frames);

    const issue = formatOcRuntimeError(error, emptyOcInstance, {
      bundleSourceMap: buildSourceMap(blobUrl, 'main.ts'),
      entryUrl: blobUrl,
      applySecondarySourceMaps,
    });

    expect(applySecondarySourceMaps).not.toHaveBeenCalled();
    expect(issue).toEqual({
      message: 'Render aborted by a superseding document operation',
      code: 'RUNTIME',
      type: 'runtime',
      severity: 'error',
      stackFrames: [],
    });
  });
});
