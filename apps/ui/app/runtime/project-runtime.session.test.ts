/**
 * A6e: what a runtime replacement flushes, on a real session runtime (plan § 4 A6e; charter B4, I15).
 *
 * The session's `project` child calls `flush` on the superseded runtime before it builds the next and stops this one.
 * These rows build the real runtime over a stand-in session file manager and show that the flush runs the runtime's own
 * producer set, waits for every producer, reports a refusal, closes nothing, and does not wait on a store that has not
 * loaded.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { QueryClient } from '@tanstack/react-query';
import { openSessionFileManagerStandIn } from '#runtime/session-file-manager.fixture.js';
import type { SessionFileManagerStandIn } from '#runtime/session-file-manager.fixture.js';
import { trackSessionFileManager } from '#runtime/session-file-manager.js';
import { openSessionProjectRuntime, sessionProjectRuntimeOf } from '#runtime/project-runtime.session.js';
import type { SessionProjectRuntimePorts } from '#runtime/project-runtime.session.js';
import type { ProjectRuntimeLibrary } from '#runtime/project-runtime.js';
import type { SessionRuntime } from '#services/sessions-store.js';
import { selectEditorRef } from '#runtime/project-runtime.js';
import { waitFor } from 'xstate';

vi.mock('#constants/browser.constants.js', () => ({ isBrowser: true }));

const projectId = 'proj_a6e_flush';

/** A promise that never settles. */
const pending = async <T>(): Promise<T> =>
  new Promise<T>(() => {
    /* Never settles. */
  });

let opened: Array<{ files: SessionFileManagerStandIn; untrack: () => void; runtime: SessionRuntime }> = [];

const build = (configure?: (library: ReturnType<typeof mock<ProjectRuntimeLibrary>>) => void): SessionRuntime => {
  const files = openSessionFileManagerStandIn(projectId);
  const untrack = trackSessionFileManager(files);
  const library = mock<ProjectRuntimeLibrary>();
  /* The project never loads in these rows: its store is not `ready`, so it owes nothing. */
  library.touchProject.mockReturnValue(pending());
  library.getEditorState.mockReturnValue(pending());
  configure?.(library);
  const ports: SessionProjectRuntimePorts = {
    library,
    chatSessions: { noteCreatedEmpty: vi.fn() },
    queryClient: new QueryClient(),
    choices: () => ({
      computePlacement: { state: 'local' },
      computeSelectionRevision: 0,
      computeReuseMode: 'durable',
      computeReuseRevision: 0,
    }),
    awaitServices: async () => pending(),
  };
  const runtime = openSessionProjectRuntime(
    { projectId, fileManagerRef: files.fileManagerRef, request: { workspace: 'ws' } },
    ports,
  );
  opened.push({ files, untrack, runtime });
  return runtime;
};

const producersOf = (runtime: SessionRuntime) => sessionProjectRuntimeOf(runtime.runtimeRef)!.runtime.producers;

afterEach(() => {
  for (const { files, untrack, runtime } of opened) {
    runtime.close();
    untrack();
    files.close();
  }
  opened = [];
});

describe("a session runtime's replacement flush (A6e)", () => {
  it('B4: should write what its producers owe, and wait for each to settle', async () => {
    const runtime = build();
    const landed: string[] = [];
    let settle: () => void = () => undefined;
    producersOf(runtime).register(async () => {
      landed.push('layout edit');
    });
    producersOf(runtime).register(
      async () =>
        new Promise<void>((resolve) => {
          settle = () => {
            landed.push('entries');
            resolve();
          };
        }),
    );

    let done = false;
    const flushed = (async () => {
      await runtime.flush(new AbortController().signal);
      done = true;
    })();
    await Promise.resolve();
    expect(landed).toEqual(['layout edit']);
    expect(done).toBe(false);

    settle();
    await flushed;
    expect(landed).toEqual(['layout edit', 'entries']);
  });

  it('should reject with the refusal of a producer that cannot confirm its write, after the others landed', async () => {
    const runtime = build();
    const landed: string[] = [];
    producersOf(runtime).register(async () => {
      throw new Error('Pane layout is not confirmed saved.');
    });
    producersOf(runtime).register(async () => {
      landed.push('entries');
    });

    await expect(runtime.flush(new AbortController().signal)).rejects.toThrow(AggregateError);
    expect(landed).toEqual(['entries']);
  });

  it('should stop waiting on a producer that never settles once its owner is gone, without confirming the write', async () => {
    const runtime = build();
    producersOf(runtime).register(async () => pending());
    const gone = new AbortController();

    const flushed = runtime.flush(gone.signal);
    gone.abort(new Error('The runtime child stopped.'));

    await expect(flushed).rejects.toThrow('The runtime child stopped.');
  });

  it('should close nothing, so a runtime the choices came back to stays usable', async () => {
    const runtime = build();

    await runtime.flush(new AbortController().signal);

    expect(sessionProjectRuntimeOf(runtime.runtimeRef)).toBeDefined();
    expect(runtime.runtimeRef.getSnapshot().status).toBe('active');
  });

  /** A runtime whose editor store loaded, with an edit inside its debounce. */
  const withOwedEditorEdit = async (save: () => Promise<unknown>) => {
    const runtime = build((library) => {
      library.getEditorState.mockResolvedValue(undefined);
      library.updateEditorState.mockImplementation(save);
    });
    const editorRef = selectEditorRef(sessionProjectRuntimeOf(runtime.runtimeRef)!.runtime.actor.getSnapshot());
    await waitFor(editorRef, (state) => state.matches({ ready: { storing: 'idle' } }));
    editorRef.send({ type: 'setPanelState', panelState: { desktopLayout: { chatOpen: false } } });
    expect(editorRef.getSnapshot().matches({ ready: { storing: 'pending' } })).toBe(true);
    return runtime;
  };

  it('B4: should write the editor state an edit inside its debounce still owes, before it settles', async () => {
    const saved: string[] = [];
    const runtime = await withOwedEditorEdit(async () => {
      saved.push('editor state');
    });

    await runtime.flush(new AbortController().signal);

    expect(saved).toEqual(['editor state']);
  });

  it("should reject with the editor store's refusal when its write fails", async () => {
    const refusal = new Error('Editor state is not saved.');
    const runtime = await withOwedEditorEdit(async () => {
      throw refusal;
    });

    const flushed = runtime.flush(new AbortController().signal);

    await expect(flushed).rejects.toThrow(AggregateError);
    await flushed.catch((error: unknown) => {
      expect((error as AggregateError).errors).toHaveLength(1);
    });
  });
});
