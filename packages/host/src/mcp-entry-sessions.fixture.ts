/**
 * Test fixture: a scripted project runtime for watched viewer sessions. Each opened document evaluates to one GLB view
 * and renders the bytes `render` gives it; `edit` stands in for a file change the watch sees, re-evaluating and
 * rendering every open document of that entry again. Tests only.
 */

import type { Evaluation, Rendering } from '@taucad/runtime/client';
import type { KernelIssue, SourceRevision } from '@taucad/runtime/types';

import type { EntryDocument, EntrySessionRuntime, EntryView } from '#mcp-entry-sessions.js';

/** What a scripted render answers: GLB bytes, or a failure with its issues. */
export type ScriptedRender = Readonly<{ bytes: Uint8Array<ArrayBuffer> } | { issues: readonly KernelIssue[] }>;

/** One opened document, as the fixture recorded it. */
export type ScriptedDocument = Readonly<{
  entryPath: string;
  watch: boolean;
  /** The updates asked of it, in order: a drag's transient values, or `{}` to restore the committed ones. */
  updates: ReadonlyArray<Readonly<Record<string, unknown>>>;
  /** The view requests made of it, in order. */
  viewRequests: ReadonlyArray<Readonly<{ id: string; request: unknown }>>;
  isClosed(): boolean;
}>;

/** The scripted runtime, with what it recorded. */
export type ScriptedRuntime = EntrySessionRuntime &
  Readonly<{
    documents: readonly ScriptedDocument[];
    /** A file change: every open document of `entryPath` evaluates and renders again. */
    edit(entryPath: string): Promise<void>;
    /** The server released the thread: every document ends. */
    terminate(): void;
  }>;

type Handler = (value: never) => void;

/**
 * A GLB of `size` bytes whose header is valid and whose last byte is `mark`, so each render has its own digest.
 *
 * @param mark - Distinguishes one render's bytes from another's.
 * @param size - Total bytes, a multiple of 4 and at least 12.
 * @returns The bytes.
 */
export const markedGlb = (mark: number, size = 16): Uint8Array<ArrayBuffer> => {
  const content = new Uint8Array(size);
  const header = new DataView(content.buffer);
  header.setUint32(0, 0x46_54_6c_67, true);
  header.setUint32(4, 2, true);
  header.setUint32(8, content.byteLength, true);
  content[size - 1] = mark;
  return content;
};

/**
 * Create the scripted runtime.
 *
 * @param options - The kernel the entries describe as, whether its render takes topology, and each render's outcome.
 * @returns The runtime.
 */
export const scriptedRuntime = (
  options: Readonly<{
    kernelId?: string;
    topology?: boolean;
    render?: (entryPath: string, count: number) => ScriptedRender;
  }> = {},
): ScriptedRuntime => {
  const kernelId = options.kernelId ?? 'replicad';
  const renderOf = options.render ?? ((_entryPath: string, count: number) => ({ bytes: markedGlb(count) }));
  let lifecycleState: EntrySessionRuntime['lifecycleState'] = 'connected';
  const documents: Array<ScriptedDocument & { run: () => Promise<void>; end: () => void }> = [];
  let renders = 0;

  const open: EntrySessionRuntime['open'] = (input) => {
    const handlers = new Map<string, Set<Handler>>();
    const viewHandlers = new Map<string, Set<Handler>>();
    const emit = (map: Map<string, Set<Handler>>, event: string, value: unknown): void => {
      for (const handler of map.get(event) ?? []) {
        (handler as (value: unknown) => void)(value);
      }
    };
    const on =
      (map: Map<string, Set<Handler>>) =>
      (event: string, handler: Handler): (() => void) => {
        const set = map.get(event) ?? new Set<Handler>();
        set.add(handler);
        map.set(event, set);
        return () => set.delete(handler);
      };
    const viewRequests: Array<{ id: string; request: unknown }> = [];
    let closed = false;
    let evaluation: Evaluation | undefined;
    let rendering: Rendering | undefined;
    let evaluated = Promise.withResolvers<void>();
    let rendered = Promise.withResolvers<void>();
    let view: EntryView | undefined;
    let evaluations = 0;

    const updates: Array<Readonly<Record<string, unknown>>> = [];
    let isTransient = false;

    const renderNow = (): void => {
      renders += 1;
      const outcome = renderOf(input.source.path, renders);
      const base = {
        requestId: `render-${String(renders)}`,
        evaluationId: evaluation?.id ?? '',
        transient: isTransient,
        sourceRevision: {
          entry: input.source.path,
          files: { [input.source.path]: `sha256:${String(renders)}` as SourceRevision['files'][string] },
        },
      };
      rendering =
        'bytes' in outcome
          ? {
              ...base,
              success: true,
              view: 'model',
              artifact: { mimeType: 'model/gltf-binary', content: outcome.bytes },
              hash: String(renders),
              issues: [],
            }
          : { ...base, success: false, issues: outcome.issues };
      emit(viewHandlers, 'status', 'rendering');
      emit(viewHandlers, 'rendered', rendering);
      emit(viewHandlers, 'status', 'ready');
      rendered.resolve();
    };

    const run = async (transient = false): Promise<void> => {
      isTransient = transient;
      evaluated = Promise.withResolvers<void>();
      rendered = Promise.withResolvers<void>();
      await Promise.resolve();
      if (closed) {
        return;
      }
      evaluations += 1;
      emit(handlers, 'status', 'evaluating');
      emit(handlers, 'described', { success: true, kernelId, issues: [], parameters: {} });
      evaluation = {
        id: `evaluation-${String(evaluations)}`,
        success: true,
        views: [{ id: 'model', title: 'Model', mimeType: 'model/gltf-binary' }],
        exports: [],
        transient,
        issues: [],
      };
      emit(handlers, 'evaluated', evaluation);
      emit(handlers, 'status', 'ready');
      /* A view opened by the evaluation handler renders as it opens; one opened before renders again now. */
      evaluated.resolve();
      if (view !== undefined && evaluations > 1) {
        renderNow();
      }
    };

    const document: EntryDocument = {
      on: on(handlers) as EntryDocument['on'],
      evaluation: async () => {
        await evaluated.promise;
        return { superseded: false, evaluation: evaluation! };
      },
      update: async (request) => {
        updates.push(request);
        await run(request.transient === true);
        return { superseded: false, evaluation: evaluation! };
      },
      view(id, request) {
        viewRequests.push({ id, request });
        const opened: EntryView = {
          on: on(viewHandlers) as EntryView['on'],
          rendering: async () => {
            await rendered.promise;
            return { superseded: false, rendering: rendering! };
          },
          close: () => undefined,
        };
        view = opened;
        /* A view renders after it is returned, as the runtime's does, so its listeners hear the first render. */
        queueMicrotask(renderNow);
        return opened;
      },
      close() {
        closed = true;
      },
    };
    const end = (): void => {
      closed = true;
      emit(handlers, 'status', 'error');
    };
    documents.push({
      entryPath: input.source.path,
      watch: input.watch,
      updates,
      viewRequests,
      isClosed: () => closed,
      run,
      end,
    });
    void run();
    return document;
  };

  return {
    get lifecycleState() {
      return lifecycleState;
    },
    capabilities: {
      renderCapabilities: {
        [kernelId]:
          options.topology === false
            ? {}
            : { content: { schema: { type: 'object', properties: { includeTopology: { type: 'boolean' } } } } },
      },
    },
    open,
    documents,
    async edit(entryPath) {
      await Promise.all(
        documents
          .filter((opened) => opened.entryPath === entryPath && !opened.isClosed())
          .map(async (opened) => opened.run()),
      );
    },
    terminate() {
      lifecycleState = 'terminated';
      for (const opened of documents) {
        opened.end();
      }
    },
  };
};
