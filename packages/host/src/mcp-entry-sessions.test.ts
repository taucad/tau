import { describe, expect, it, vi } from 'vitest';

import type { KernelIssue } from '@taucad/runtime/types';

import { createMcpEntrySessions, entrySessionKey, tauViewerIssuesOf } from '#mcp-entry-sessions.js';
import type { EntrySessionEvent } from '#mcp-entry-sessions.js';
import { markedGlb, scriptedRuntime } from '#mcp-entry-sessions.fixture.js';

const settle = async (): Promise<void> => {
  for (let index = 0; index < 5; index += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each turn lets the scripted document run one step.
    await Promise.resolve();
  }
};

describe('createMcpEntrySessions', () => {
  it('should open one watched document per source with its topology, and render it in memory', async () => {
    const runtime = scriptedRuntime();
    const events: EntrySessionEvent[] = [];
    const sessions = createMcpEntrySessions({
      runtimeFor: async () => runtime,
      onEvent: (_session, event) => events.push(event),
    });

    const [first, second] = await Promise.all([
      sessions.acquire({ root: '/project', entryPath: 'main.ts' }),
      sessions.acquire({ root: '/project', entryPath: 'main.ts' }),
    ]);
    const render = await first.settled();

    expect(second).toBe(first);
    expect(runtime.documents).toHaveLength(1);
    expect(runtime.documents[0]).toMatchObject({ entryPath: 'main.ts', watch: true, updates: [] });
    expect(runtime.documents[0]?.viewRequests).toEqual([
      { id: 'model', request: { content: { includeTopology: true } } },
    ]);
    expect(render).toMatchObject({ mimeType: 'model/gltf-binary', bytes: markedGlb(1), issues: [] });
    expect(first.status()).toEqual({
      building: false,
      sourceRevision: { entry: 'main.ts', files: { 'main.ts': 'sha256:1' } },
      issues: [],
    });
    expect(events.filter((event) => event.type === 'rendered')).toHaveLength(1);
    expect(events.some((event) => event.type === 'status' && event.status.building)).toBe(true);
    sessions.close();
    expect(runtime.documents[0]?.isClosed()).toBe(true);
  });

  it('should ask for no content a kernel does not advertise, and key sessions by project and entry', async () => {
    const runtime = scriptedRuntime({ topology: false });
    const sessions = createMcpEntrySessions({ runtimeFor: async () => runtime, onEvent: vi.fn() });

    const plain = await sessions.acquire({ root: '/project', entryPath: 'main.ts' });
    await plain.settled();
    const again = await sessions.acquire({ root: '/project', entryPath: 'main.ts' });
    const other = await sessions.acquire({ root: '/other', entryPath: 'main.ts' });

    expect(runtime.documents[0]?.viewRequests).toEqual([{ id: 'model', request: undefined }]);
    expect(again).toBe(plain);
    expect(other.key).not.toBe(plain.key);
    expect(plain.key).toBe(entrySessionKey({ root: '/project', entryPath: 'main.ts' }));
    sessions.close();
  });

  it('should render a drag preview transiently without building, and restore the committed values', async () => {
    const runtime = scriptedRuntime();
    const events: EntrySessionEvent[] = [];
    const sessions = createMcpEntrySessions({
      runtimeFor: async () => runtime,
      onEvent: (_session, event) => events.push(event),
    });
    const session = await sessions.acquire({ root: '/project', entryPath: 'main.ts' });
    await session.settled();
    events.length = 0;

    expect(await session.preview({ faceWidth: 16 })).toEqual({ accepted: true });
    await settle();
    expect(runtime.documents[0]?.updates).toEqual([{ parameters: { faceWidth: 16 }, transient: true }]);
    /* The page sees the dragged model, but no "Building" for it. */
    expect(events.filter((event) => event.type === 'rendered')).toHaveLength(1);
    expect(events.some((event) => event.type === 'status' && event.status.building)).toBe(false);
    expect(session.current()?.bytes).toEqual(markedGlb(2));

    expect(await session.preview(undefined)).toEqual({ accepted: true });
    await settle();
    expect(runtime.documents[0]?.updates.at(-1)).toEqual({});
    /* Restoring renders the committed values again, which is a build like any committed change. */
    expect(events.some((event) => event.type === 'status' && event.status.building)).toBe(true);
    expect(session.status().building).toBe(false);
    sessions.close();
    expect(await session.preview({ faceWidth: 12 })).toEqual({ accepted: false });
  });

  it('should render a file change, keep the newest two renders, and touch the project runtime on each', async () => {
    const runtime = scriptedRuntime();
    const runtimeFor = vi.fn(async () => runtime);
    const rendered: string[] = [];
    const sessions = createMcpEntrySessions({
      runtimeFor,
      onEvent: (_session, event) => {
        if (event.type === 'rendered') {
          rendered.push(event.render.id);
        }
      },
    });
    const session = await sessions.acquire({ root: '/project', entryPath: 'main.ts' });
    await session.settled();

    await runtime.edit('main.ts');
    await runtime.edit('main.ts');
    await settle();

    expect(rendered).toHaveLength(3);
    expect(new Set(rendered).size).toBe(3);
    expect(session.current()?.id).toBe(rendered[2]);
    expect(session.bytesOf(rendered[1]!)).toBeDefined();
    expect(session.bytesOf(rendered[0]!)).toBeUndefined();
    expect(session.status().sourceRevision).toEqual({ entry: 'main.ts', files: { 'main.ts': 'sha256:3' } });
    /* Once to open, once per render. */
    expect(runtimeFor).toHaveBeenCalledTimes(4);
    sessions.close();
  });

  it('should answer why a source has no render, with the issues in its status', async () => {
    const issue: KernelIssue = {
      message: 'Unexpected token',
      code: 'BUNDLER_FAILED',
      severity: 'error',
      type: 'compilation',
      location: { fileName: 'main.ts', startLineNumber: 3, startColumn: 1 },
      stack: 'SyntaxError: Unexpected token\n    at main.ts:3:1',
      stackFrames: [{ fileName: 'main.ts', lineNumber: 3, columnNumber: 1, context: 'user', source: 'x' }],
    };
    const runtime = scriptedRuntime({ render: () => ({ issues: [issue] }) });
    const sessions = createMcpEntrySessions({ runtimeFor: async () => runtime, onEvent: vi.fn() });
    const session = await sessions.acquire({ root: '/project', entryPath: 'main.ts' });

    expect(await session.settled()).toEqual({
      errorCode: 'RENDER_FAILED',
      message: 'main.ts could not be rendered: Unexpected token',
    });
    expect(session.current()).toBeUndefined();
    expect(session.status().issues).toEqual([
      {
        message: 'Unexpected token',
        code: 'BUNDLER_FAILED',
        severity: 'error',
        type: 'compilation',
        location: { fileName: 'main.ts', startLineNumber: 3, startColumn: 1 },
        stackFrames: [{ fileName: 'main.ts', lineNumber: 3, columnNumber: 1, context: 'user', source: 'x' }],
      },
    ]);
    sessions.close();
  });

  it("should end a session with its project's thread, and open a new one on the next show", async () => {
    let runtime = scriptedRuntime();
    const sessions = createMcpEntrySessions({ runtimeFor: async () => runtime, onEvent: vi.fn() });
    const session = await sessions.acquire({ root: '/project', entryPath: 'main.ts' });
    await session.settled();

    runtime.terminate();
    expect(sessions.get(session.key)).toBeUndefined();
    expect(await session.settled()).toMatchObject({ errorCode: 'SESSION_CLOSED' });

    runtime = scriptedRuntime();
    const reopened = await sessions.acquire({ root: '/project', entryPath: 'main.ts' });
    expect(reopened).not.toBe(session);
    expect(await reopened.settled()).toMatchObject({ mimeType: 'model/gltf-binary' });
    sessions.close();
  });

  it('should close the session acquired longest ago past its limit', async () => {
    const runtime = scriptedRuntime();
    const sessions = createMcpEntrySessions({ runtimeFor: async () => runtime, onEvent: vi.fn(), limit: 2 });
    const first = await sessions.acquire({ root: '/project', entryPath: 'a.ts' });
    await sessions.acquire({ root: '/project', entryPath: 'b.ts' });
    await sessions.acquire({ root: '/project', entryPath: 'a.ts' });
    const third = await sessions.acquire({ root: '/project', entryPath: 'c.ts' });

    expect(sessions.get(first.key)).toBe(first);
    expect(sessions.get(third.key)).toBe(third);
    expect(runtime.documents.map((opened) => [opened.entryPath, opened.isClosed()])).toEqual([
      ['a.ts', false],
      ['b.ts', true],
      ['c.ts', false],
    ]);
    sessions.close();
  });
});

describe('tauViewerIssuesOf', () => {
  it("should keep an issue's details, drop its raw stack, cap its frames and put errors first", () => {
    const frames = Array.from({ length: 70 }, (_, index) => ({ fileName: 'main.ts', lineNumber: index }));
    const issues = tauViewerIssuesOf([
      { message: 'Slow.', code: 'RESOURCE_LIMIT', severity: 'warning' },
      {
        message: 'Prepare it.',
        code: 'KERNEL_NOT_PREPARED',
        severity: 'error',
        details: { kernel: 'picogk' },
        stack: 'at x',
        stackFrames: frames,
      },
    ]);

    expect(issues.map((issue) => issue.code)).toEqual(['KERNEL_NOT_PREPARED', 'RESOURCE_LIMIT']);
    expect(issues[0]).toMatchObject({ details: { kernel: 'picogk' } });
    expect(issues[0]).not.toHaveProperty('stack');
    expect(issues[0]?.stackFrames).toHaveLength(64);
  });
});
