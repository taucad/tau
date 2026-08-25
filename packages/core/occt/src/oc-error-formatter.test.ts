// @vitest-environment node
import { describe, it, expect } from 'vitest';
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
});
