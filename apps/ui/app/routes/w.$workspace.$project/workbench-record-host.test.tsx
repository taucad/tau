/* oxlint-disable typescript/no-restricted-types -- Checked filesystem absence uses null. */
/* oxlint-disable typescript/no-confusing-void-expression -- Testing Library and adapter callbacks assert observable state. */
// @vitest-environment jsdom
/*
 * The layout record's rows over the project runtime's layout (A8b). Until A8b the record host owned the layout store
 * and these rows mounted it; the record session, its watch, its issue and its producer are the runtime's
 * `workbenchLayout` child now, and the page reaches it through the controller shim. Each row mounts that child with the
 * runtime's own host and bridge, the shim over it, and the record host's live region.
 *
 * Old row → new row (A8b):
 * - "keeps the live layout after code switches to a checkout and adopts a live-root edit" → "keeps the record at the
 *   live root and adopts a live-root edit": the runtime's record is the live root's; a checkout no longer reaches it.
 * - "merges explicit pre-read pane requests onto the authored layout after the first read" → "applies pane intents
 *   sent before the first read on top of the authored layout": a pre-read pane request is a pane intent now (D14).
 * - "retries an initial IO failure when the service arrives before applying an explicit pane request" and "hands a
 *   pane request back when the first read fails" → "keeps a pane intent queued while the first read fails and applies
 *   it after a read succeeds": the layout keeps the intent; there is no hand-back.
 * - "carries a pre-read pane request when the old read rejects %s the new read" → "keeps a pane intent queued when the
 *   file host is replaced and the old read rejects %s the new read".
 * - "keeps rapid pre-adapter pane requests in the intended layout until the adapter mounts" and "seeds a workbench
 *   adapter that mounts before a pending pane request is written with that request" → "applies rapid pane intents in
 *   order once the workbench attaches, and acknowledges the written arrangement".
 * - "shows a pane asked for before the first read on a workbench that mounted before the read" → same name, as an
 *   intent.
 * - "shows a pane requested before the read together with the read, so the read cannot replace it" → "applies a pane
 *   intent sent before the read after the read, so the read cannot replace it".
 * - "hands a pane request back and shows only the stored arrangement while the record is refused" → "shows only the
 *   stored arrangement while the record is refused".
 * - "should keep one producer under StrictMode whose flush settles a layout write in flight" → same name; the runtime
 *   registers the producer once, and a StrictMode host registers none.
 * - `it.fails` "I10: …" and "I13: …" → asserting rows of the same names.
 * Every other row keeps its name.
 */
import type { WatchEvent } from '@taucad/filesystem';
import { act, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { createActor } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { workbenchRecords, workbenchPaths } from '@taucad/workbench';
import type { WorkbenchLaneNode, WorkbenchLayout, WorkbenchView } from '@taucad/workbench';
import type { PreviousWorkbenchLayout } from '@taucad/ui-core/types/editor.types';
import type { CheckedFileWriteResult } from '@taucad/types';
import type { editorMachine } from '#machines/editor.machine.js';
import { WorkbenchRecordHost } from '#routes/w.$workspace.$project/workbench-record-host.js';
import { createWorkbenchLayoutControllerShim } from '#routes/w.$workspace.$project/workbench-layout-controller.shim.js';
import type { WorkbenchLayoutControllerShim } from '#routes/w.$workspace.$project/workbench-layout-controller.shim.js';
import type { WorkbenchPanelId } from '#routes/w.$workspace.$project/project-workspace-context.panels.js';
import {
  createLayoutBridgeLogic,
  createProjectLayoutHost,
  createProjectShellPort,
  sendPaneIntent,
} from '#runtime/project-runtime.layout.js';
import { confirmFlush } from '#workbench-records/record-health.js';
import { readRecordIssues } from '#workbench-records/record-issues.js';
import { createViewRecordPorts } from '#workbench-records/view-record-session.js';
import { intentOf } from '#workbench-records/pane-intents.js';
import {
  flushWorkbenchLayout,
  selectAppliedLayoutDigest,
  selectIntentOutcome,
} from '#workbench-records/workbench-layout.machine.js';

let fileManager: unknown;
let project: unknown;
let controller: WorkbenchLayoutControllerShim | undefined;
vi.mock('#hooks/use-file-manager.js', () => ({ useFileManager: () => fileManager }));
vi.mock('#hooks/use-project.js', () => ({ useProject: () => project }));
vi.mock('./project-workspace-context.js', () => ({ useWorkbenchLayoutController: () => controller }));
vi.mock('#flags/feature-flags.js', () => ({ isFeatureEnabled: () => false }));
vi.mock('#flags/use-feature.js', () => ({ subscribeFeatureFlags: () => () => undefined }));

type EditorRef = ActorRefFrom<typeof editorMachine>;
/* An apply lands with what the workbench shows once its files open: what it was handed, or less (a tab whose file did
 * not open). */
type Apply = (node: WorkbenchLaneNode, applied: (shown?: WorkbenchLaneNode) => void) => void;

const encoder = new TextEncoder();
const first = (): WorkbenchLayout => ({
  version: 1,
  lanes: { chat: true, workbench: true },
  viewer: { kind: 'group', tabs: [{ kind: 'view', view: 'v-abcd1234' }] },
  workbench: { kind: 'group', tabs: [{ kind: 'pane', pane: 'parameters' }] },
});
const second = (): WorkbenchLayout => ({
  ...first(),
  lanes: { chat: false, workbench: true },
  workbench: { kind: 'group', tabs: [{ kind: 'pane', pane: 'kernel' }] },
});

const viewSeed = (): WorkbenchView =>
  workbenchRecords.view.schema.parse({
    version: 1,
    entryPath: 'models/other.ts',
    name: 'Other',
  });

/** What a Dockview shows before anything is applied to it. */
const emptyGroup = (): WorkbenchLaneNode => ({ kind: 'group', tabs: [] });

/** The group a Dockview shows after opening `pane` (the workbench's opener, as Dockview answers it). */
const withPane = (node: WorkbenchLaneNode, pane: WorkbenchPanelId): WorkbenchLaneNode =>
  // The Files pane is no record tab (the record's pane ids exclude it): Dockview's report leaves the node as it was.
  node.kind === 'group' && pane !== 'files' ? { ...node, tabs: [...node.tabs, { kind: 'pane', pane }] } : node;

const mounted = new Set<() => void>();
afterEach(() => {
  for (const stop of mounted) {
    stop();
  }
  mounted.clear();
});

function mount(
  options: {
    layout?: WorkbenchLayout;
    previous?: PreviousWorkbenchLayout;
    viewExists?: boolean;
    initialRead?: Promise<void>;
    pendingFirstRead?: Promise<void>;
    failInitialRead?: boolean;
    pendingLayoutAck?: Promise<void>;
    onLayoutWriteStarted?: () => void;
    strict?: boolean;
    lanes?: WorkbenchLayout['lanes'];
    /** The project has no layout record yet. */
    missing?: boolean;
    /** Every read of the layout record fails, so its first read stops retrying. */
    failAllReads?: boolean;
    /** The layout record's watch cannot be opened. */
    failLayoutWatch?: boolean;
    /** The files the editor holds open. */
    openFiles?: readonly string[];
  } = {},
) {
  let bytes: Uint8Array<ArrayBuffer> | undefined = options.missing
    ? undefined
    : encoder.encode(workbenchRecords.layout.serialize(options.layout ?? first()));
  let viewBytes: Uint8Array<ArrayBuffer> | undefined =
    options.viewExists === false ? undefined : encoder.encode(workbenchRecords.view.serialize(viewSeed()));
  const liveWatches = new Set<() => void>();
  let failNextRead = options.failInitialRead ?? false;
  let firstFileRead = true;
  const firstReadStarted = Promise.withResolvers<void>();
  let previousLayout = options.previous;
  const editorListeners = new Set<() => void>();
  let desktopLayout: { chatOpen: boolean; workbenchOpen: boolean; compactAuxiliary?: string } = {
    chatOpen: options.lanes?.chat ?? true,
    workbenchOpen: options.lanes?.workbench ?? true,
  };
  let { pendingLayoutAck } = options;
  let watchesOpened = 0;
  /* While set, the editor takes a lane change but does not show it yet. */
  let heldLanes: typeof desktopLayout | undefined;
  let holdingLanes = false;
  const writes = vi.fn(
    async ({
      path,
      data,
      preconditions,
    }: {
      path: string;
      data: string;
      preconditions: ReadonlyArray<{
        expected: Uint8Array<ArrayBuffer> | null;
      }>;
    }): Promise<CheckedFileWriteResult> => {
      const current = path.endsWith(workbenchPaths.layout) ? bytes : viewBytes;
      const expected = preconditions[0]?.expected;
      if (
        expected !== null &&
        expected !== undefined &&
        current &&
        (expected.length !== current.length || !expected.every((v, i) => v === current[i]))
      ) {
        return { status: 'conflict', conflicts: [{ path, actual: current }] };
      }
      const next = encoder.encode(data);
      if (path.endsWith(workbenchPaths.layout)) {
        bytes = next;
        const gate = pendingLayoutAck;
        pendingLayoutAck = undefined;
        if (gate) {
          options.onLayoutWriteStarted?.();
          await gate;
        }
      } else {
        viewBytes = next;
      }
      return { status: 'applied', content: next };
    },
  );
  const files = {
    exists: async (path: string) => {
      if (path.endsWith(workbenchPaths.layout)) {
        await options.initialRead;
      }
      return path.endsWith(workbenchPaths.layout) ? bytes !== undefined : viewBytes !== undefined;
    },
    readFile: async (path: string) => {
      if (firstFileRead && options.pendingFirstRead) {
        firstFileRead = false;
        firstReadStarted.resolve();
        await options.pendingFirstRead;
        throw new Error('old worker closed');
      }
      if (failNextRead) {
        failNextRead = false;
        throw new Error('offline');
      }
      if (options.failAllReads && path.endsWith(workbenchPaths.layout)) {
        throw Object.assign(new Error('denied'), { code: 'EACCES' });
      }
      return path.endsWith(workbenchPaths.layout) ? bytes! : viewBytes!;
    },
    writeFileChecked: writes,
  };
  const watch = (path: string, listener: (event: WatchEvent) => void) => {
    watchesOpened += 1;
    const notify = () => listener({ type: 'change', path });
    liveWatches.add(notify);
    return {
      ready:
        options.failLayoutWatch && path.endsWith(workbenchPaths.layout)
          ? Promise.reject(new Error('watch denied'))
          : Promise.resolve(),
      closed: new Promise<void>(() => {
        /* This watch stays open until it is disposed. */
      }),
      dispose: () => {
        liveWatches.delete(notify);
      },
    };
  };
  const ports = createViewRecordPorts({
    projectId: 'p',
    root: '/projects/p',
    host: { files, watch },
    setViewRecord: () => undefined,
    setViewEntryPath: () => undefined,
    setAppliedWorkbenchRevision: () => undefined,
  });
  const layoutHost = createProjectLayoutHost({ projectId: 'p', ports });
  if (options.viewExists !== false) {
    // A view session read the view's record: the rollback a foreign change saves keeps it.
    layoutHost.viewRecordPorts.setViewRecord('v-abcd1234', viewSeed());
  }
  const send = vi.fn((event: { type: string; layout?: PreviousWorkbenchLayout; panelState?: unknown }) => {
    if (event.type === 'setPreviousLayout') {
      previousLayout = event.layout;
    }
    if (
      event.type === 'setPanelState' &&
      event.panelState &&
      typeof event.panelState === 'object' &&
      'desktopLayout' in event.panelState
    ) {
      const next = { ...desktopLayout, ...(event.panelState.desktopLayout as typeof desktopLayout) };
      if (holdingLanes) {
        heldLanes = next;
        return;
      }
      desktopLayout = next;
    }
    for (const listener of editorListeners) {
      listener();
    }
  });
  const editorSnapshot = () => ({
    context: {
      previousLayout,
      panelState: { desktopLayout },
      openFiles: (options.openFiles ?? []).map((path) => ({ path })),
    },
    // The editor has loaded its lanes: the bridge seeds the layout with them at once.
    matches: (state: string) => state === 'ready',
  });
  const editor = {
    subscribe: (listener: (state: unknown) => void) => {
      const notify = () => listener(editorSnapshot());
      editorListeners.add(notify);
      return { unsubscribe: () => editorListeners.delete(notify) };
    },
    on: () => ({ unsubscribe: () => undefined }),
    send,
    getSnapshot: editorSnapshot,
  } as unknown as EditorRef;
  /* What the layout hears, in order: the adapter protocol the shim speaks for the Dockview. */
  const received: Array<{ type: string; node?: WorkbenchLaneNode }> = [];
  const layout = createActor(layoutHost.logic, {
    // As the runtime spawns it: before the editor's lanes are known, which the bridge seeds once the editor is ready.
    input: {
      ...layoutHost.input,
      workbenchOpen: desktopLayout.workbenchOpen,
      lanes: { chat: desktopLayout.chatOpen, workbench: desktopLayout.workbenchOpen },
      awaitsLanes: true,
    },
    inspect: (event) => {
      if (event.type === '@xstate.transition' && event.actorRef === layout) {
        received.push(event.event as { type: string; node?: WorkbenchLaneNode });
      }
    },
  });
  const shell = createProjectShellPort();
  const bridge = createActor(createLayoutBridgeLogic({ shell, host: layoutHost }), { input: { editor, layout } });
  layout.start();
  bridge.start();
  const stop = (): void => {
    bridge.stop();
    layout.stop();
  };
  mounted.add(stop);
  /* The producer the runtime registers for its layout child, once per runtime (A8b). */
  const producer = async (): Promise<void> =>
    confirmFlush(async () => flushWorkbenchLayout(layout), 'Pane layout is not confirmed saved.');
  const shim = createWorkbenchLayoutControllerShim({ layout, editor, host: layoutHost });
  controller = shim;
  fileManager = { parameterFiles: files, workbenchFiles: { ...files, deleteFileChecked: vi.fn() } };
  project = {
    projectId: 'p',
    projectRuntime: {
      layout: layoutHost,
      shell,
      actor: { getSnapshot: () => ({ context: { layoutRef: layout } }) },
    },
  };
  const rendered = render(<WorkbenchRecordHost />, options.strict ? { wrapper: StrictMode } : undefined);
  const notifyWatches = async (): Promise<void> => {
    await act(async () => {
      for (const notify of liveWatches) {
        notify();
      }
    });
  };
  /* The workbench's Dockview: it shows what it is handed, and its opener opens a pane in what it shows. As Dockview's
   * `onDidLayoutChange` (an `AsapEvent`), it reports the change in a microtask, not while the opener runs. */
  let workbenchShows: WorkbenchLaneNode | undefined;
  let reportQueued = false;
  const reportLayoutChange = (): void => {
    if (reportQueued) {
      return;
    }
    reportQueued = true;
    queueMicrotask(() => {
      reportQueued = false;
      if (workbenchShows !== undefined) {
        shim.personWorkbenchChanged(workbenchShows);
      }
    });
  };
  const dockview = {
    attach: (apply?: Apply) => {
      const detach = shim.registerWorkbench((node, applied) => {
        // Dockview shows what it is handed once the apply lands, in place of whatever it showed before.
        (apply ?? ((_node, landed) => landed()))(node, (shown) => {
          workbenchShows = shown ?? node;
          applied(shown);
        });
      });
      const disconnect = shim.connectIntents({
        openPanel: (panel: WorkbenchPanelId) => {
          // Before anything is applied, Dockview shows its starting group.
          const showing = workbenchShows ?? emptyGroup();
          // Dockview's model changes at once: the opener answers with it, and the layout report follows.
          workbenchShows = withPane(showing, panel);
          reportLayoutChange();
          return workbenchShows;
        },
        activateFile: (path: string) => {
          const showing = workbenchShows ?? emptyGroup();
          workbenchShows =
            showing.kind === 'group' ? { ...showing, tabs: [...showing.tabs, { kind: 'file', path }] } : showing;
          reportLayoutChange();
          return workbenchShows;
        },
      });
      return () => {
        disconnect();
        detach();
      };
    },
    get shows() {
      return workbenchShows;
    },
  };
  return {
    ...rendered,
    layout,
    controller: shim,
    dockview,
    producer,
    get appliedDigest() {
      return selectAppliedLayoutDigest(layout.getSnapshot());
    },
    get bytes() {
      return bytes;
    },
    get viewBytes() {
      return viewBytes;
    },
    get openWatches() {
      return liveWatches.size;
    },
    firstReadStarted: firstReadStarted.promise,
    get watchesOpened() {
      return watchesOpened;
    },
    fileIntent: (path: string) =>
      sendPaneIntent(layout, layoutHost.facts(), { source: 'person', target: { kind: 'file', path } }),
    intent: (pane: WorkbenchPanelId) =>
      sendPaneIntent(layout, layoutHost.facts(), {
        source: 'person',
        target: { kind: 'pane', adapter: 'workbench', pane },
      }),
    /** The shell moves to another route, as the provider reports it: a plain value the layout hears with the next
     * intent or delivery. */
    setRoute: (routeKey: string) => {
      layoutHost.setFacts({ ...layoutHost.facts(), routeKey });
    },
    set: async (next: Uint8Array<ArrayBuffer>) => {
      bytes = next;
      await notifyWatches();
    },
    setLive: async (next: Uint8Array<ArrayBuffer>) => {
      bytes = next;
      await notifyWatches();
    },
    failRead: async () => {
      failNextRead = true;
      await notifyWatches();
    },
    replaceHost: () => {
      act(() => {
        // New connections to the same files: the session reopens its watch on them.
        ports.replaceHost({ files: { ...files }, watch: (path, listener) => watch(path, listener) });
      });
    },
    deleteView: () => {
      viewBytes = undefined;
    },
    get previous() {
      return previousLayout;
    },
    changePrevious: (next: PreviousWorkbenchLayout | undefined) => {
      previousLayout = next;
      for (const listener of editorListeners) {
        listener();
      }
    },
    holdLanes: () => {
      holdingLanes = true;
    },
    showHeldLanes: () => {
      holdingLanes = false;
      if (heldLanes !== undefined) {
        desktopLayout = heldLanes;
        heldLanes = undefined;
        for (const listener of editorListeners) {
          listener();
        }
      }
    },
    get lanesHeld() {
      return heldLanes;
    },
    remount: () => {
      rendered.unmount();
      return render(<WorkbenchRecordHost />, options.strict ? { wrapper: StrictMode } : undefined);
    },
    writes,
    send,
    stop,
    received,
  };
}

const landAtOnce = () => vi.fn((_node: unknown, applied: () => void) => applied());

describe('live workbench record host', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should refresh restore availability without changing the layout digest and reject a stale target', async () => {
    const host = mount();
    await waitFor(() => expect(host.controller.snapshot()).toBeDefined());
    const before = host.controller.snapshot()!;
    expect(before.restoreUnavailable).toBe('No previous layout is saved.');
    const changed = vi.fn();
    const unsubscribe = host.controller.subscribe(changed);
    act(() => host.changePrevious({ layout: second(), views: { 'v-abcd1234': viewSeed() } }));
    const ready = host.controller.snapshot()!;
    expect(ready.layoutDigest).toBe(before.layoutDigest);
    expect(ready.restoreUnavailable).toBeUndefined();
    expect(changed).toHaveBeenCalled();
    act(() => host.changePrevious({ layout: first(), views: {} }));
    expect(host.controller.snapshot()?.restoreUnavailable).toContain('has no saved record');
    expect(
      await act(async () =>
        host.controller.restorePreviousArrangement({
          layoutDigest: ready.layoutDigest,
          target: ready.restoreTarget!,
          eligible: () => true,
        }),
      ),
    ).toBe(false);
    expect(host.writes).not.toHaveBeenCalled();
    unsubscribe();
    host.unmount();
  });

  it('should admit one restore across callers and retain existing view settings', async () => {
    const gate = Promise.withResolvers<void>();
    const started = Promise.withResolvers<void>();
    const host = mount({
      layout: second(),
      previous: { layout: first(), views: { 'v-abcd1234': { ...viewSeed(), name: 'Old' } } },
      pendingLayoutAck: gate.promise,
      onLayoutWriteStarted: () => started.resolve(),
    });
    await waitFor(() => expect(host.controller.snapshot()).toBeDefined());
    const expected = {
      layoutDigest: host.controller.snapshot()!.layoutDigest,
      target: host.controller.snapshot()!.restoreTarget!,
      eligible: () => true,
    };
    let saving: Promise<boolean>;
    await act(async () => {
      saving = host.controller.restorePreviousArrangement(expected);
      await started.promise;
    });
    expect(host.controller.snapshot()?.restoring).toBe(true);
    expect(await host.controller.restorePreviousArrangement(expected)).toBe(false);
    await act(async () => {
      gate.resolve();
      expect(await saving!).toBe(true);
    });
    expect(host.writes).toHaveBeenCalledOnce();
    expect(workbenchRecords.view.read(host.viewBytes!)).toMatchObject({ status: 'current', record: viewSeed() });
    expect(screen.getByRole('status')).toHaveTextContent('Restore written.');
    host.unmount();
  });

  it('keeps the record at the live root and adopts a live-root edit', async () => {
    const host = mount();
    await waitFor(() => {
      expect(host.controller.snapshot()?.layout).toEqual(first());
    });
    await host.setLive(encoder.encode(workbenchRecords.layout.serialize(second())));
    await waitFor(() => {
      expect(host.controller.snapshot()?.layout).toEqual(second());
    });
    expect(host.writes).not.toHaveBeenCalled();
    act(() => {
      host.dockview.attach();
      host.controller.registerViewer((_node, applied) => applied());
    });
    act(() => {
      host.controller.personWorkbenchChanged(withPane(second().workbench, 'revisions'));
    });
    await waitFor(
      () => {
        expect(host.writes).toHaveBeenCalledWith(
          expect.objectContaining({
            path: '/projects/p/.tau/workbench/layout.json',
          }),
        );
      },
      { timeout: 1600 },
    );
    host.unmount();
  });

  it('does not overwrite an authored layout when a widget emits before its first record read', async () => {
    const gate = Promise.withResolvers<void>();
    const authored = second();
    const host = mount({ layout: authored, initialRead: gate.promise });
    act(() => {
      host.controller.personViewerChanged({ kind: 'group', tabs: [] });
    });
    gate.resolve();
    await waitFor(() => {
      expect(host.controller.snapshot()?.layout).toEqual(authored);
    });
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 650);
      });
    });
    expect(host.writes).not.toHaveBeenCalled();
    expect(workbenchRecords.layout.read(host.bytes!)).toMatchObject({
      status: 'current',
      record: authored,
    });
    host.unmount();
  });

  it('applies pane intents sent before the first read on top of the authored layout', async () => {
    const gate = Promise.withResolvers<void>();
    const authored = second();
    const host = mount({ layout: authored, initialRead: gate.promise });
    act(() => {
      host.intent('revisions');
      host.intent('details');
      host.dockview.attach();
      host.controller.registerViewer((_node, applied) => applied());
    });
    gate.resolve();
    await waitFor(
      () => {
        expect(host.controller.snapshot()?.layout.workbench).toEqual({
          kind: 'group',
          tabs: [
            { kind: 'pane', pane: 'kernel' },
            { kind: 'pane', pane: 'revisions' },
            { kind: 'pane', pane: 'details' },
          ],
        });
      },
      { timeout: 1600 },
    );
    expect(host.controller.snapshot()?.layout.viewer).toEqual(authored.viewer);
    host.unmount();
  });

  it('keeps a pane intent queued while the first read fails and applies it after a read succeeds', async () => {
    const authored = second();
    const host = mount({ layout: authored, failInitialRead: true });
    act(() => {
      host.dockview.attach();
      host.controller.registerViewer((_node, applied) => applied());
      host.intent('revisions');
    });
    await act(async () => undefined);
    expect(host.dockview.shows).toBeUndefined();
    await host.set(host.bytes!);
    await waitFor(
      () => {
        expect(host.controller.snapshot()?.layout.workbench).toEqual({
          kind: 'group',
          tabs: [
            { kind: 'pane', pane: 'kernel' },
            { kind: 'pane', pane: 'revisions' },
          ],
        });
      },
      { timeout: 1600 },
    );
    expect(host.controller.snapshot()?.layout.viewer).toEqual(authored.viewer);
    host.unmount();
  });

  it.each(['before', 'after'] as const)(
    'keeps a pane intent queued when the file host is replaced and the old read rejects %s the new read',
    async (order) => {
      const gate = Promise.withResolvers<void>();
      const authored = second();
      const host = mount({ layout: authored, pendingFirstRead: gate.promise });
      act(() => {
        host.dockview.attach();
        host.controller.registerViewer((_node, applied) => applied());
        host.intent('revisions');
      });
      // The old connections' read has started and hangs; then the file host is replaced.
      await host.firstReadStarted;
      host.replaceHost();
      if (order === 'after') {
        await waitFor(() => {
          expect(host.controller.snapshot()?.layout).toBeDefined();
        });
      }
      gate.resolve();
      await waitFor(
        () => {
          expect(host.controller.snapshot()?.layout.workbench).toEqual({
            kind: 'group',
            tabs: [
              { kind: 'pane', pane: 'kernel' },
              { kind: 'pane', pane: 'revisions' },
            ],
          });
        },
        { timeout: 1600 },
      );
      expect(host.controller.snapshot()?.layout.viewer).toEqual(authored.viewer);
      host.unmount();
    },
  );

  it('reapplies identical layout bytes after an IO error without writing a watcher echo', async () => {
    const host = mount();
    await waitFor(() => {
      expect(host.controller.snapshot()?.layout).toEqual(first());
    });
    const apply = vi.fn((_node, applied: () => void) => {
      applied();
    });
    act(() => {
      host.controller.registerViewer(apply);
      host.controller.registerWorkbench(apply);
    });
    expect(host.appliedDigest).toBeDefined();
    await host.failRead();
    await waitFor(() => {
      expect(readRecordIssues('p')).toEqual([]);
    });
    await host.set(host.bytes!);
    await waitFor(() => {
      expect(host.appliedDigest).toBe(host.controller.snapshot()?.layoutDigest);
    });
    await waitFor(() => {
      expect(readRecordIssues('p')).toEqual([]);
    });
    expect(host.writes).not.toHaveBeenCalled();
    host.unmount();
  });

  it('applies rapid pane intents in order once the workbench attaches, and acknowledges the written arrangement', async () => {
    const host = mount();
    await waitFor(() => {
      expect(host.controller.snapshot()?.layout).toEqual(first());
    });
    act(() => {
      host.intent('revisions');
      host.intent('details');
    });
    expect(host.writes).not.toHaveBeenCalled();
    const apply = landAtOnce();
    act(() => {
      host.controller.registerViewer((_node, applied) => applied());
      host.dockview.attach(apply);
    });
    const requested = {
      kind: 'group',
      tabs: [
        { kind: 'pane', pane: 'parameters' },
        { kind: 'pane', pane: 'revisions' },
        { kind: 'pane', pane: 'details' },
      ],
    };
    // The workbench is shown the stored arrangement, which is acknowledged, and opens the panes on it.
    const stored = host.controller.snapshot()?.layoutDigest;
    expect(apply).toHaveBeenCalledExactlyOnceWith(first().workbench, expect.any(Function));
    expect(host.dockview.shows).toEqual(requested);
    expect(host.appliedDigest).toBe(stored);
    await waitFor(
      () => {
        expect(host.controller.snapshot()?.layout.workbench).toEqual(requested);
      },
      { timeout: 1600 },
    );
    // The written arrangement is acknowledged once its own publication is on screen.
    await waitFor(() => {
      expect(host.appliedDigest).toBe(host.controller.snapshot()?.layoutDigest);
    });
    expect(host.appliedDigest).not.toBe(stored);
    expect(host.writes).toHaveBeenCalledOnce();
    host.unmount();
  });

  it('shows a pane asked for before the first read on a workbench that mounted before the read', async () => {
    const gate = Promise.withResolvers<void>();
    const host = mount({ initialRead: gate.promise });
    act(() => {
      host.controller.registerViewer((_node, applied) => applied());
      host.dockview.attach();
      host.intent('share');
    });
    gate.resolve();
    await waitFor(() => {
      expect(host.dockview.shows).toEqual(withPane(first().workbench, 'share'));
    });
    // The mounted workbench reports what it shows on its next change (here another pane) before the debounced edit
    // is written: what it shows already holds the pane.
    act(() => {
      host.controller.personWorkbenchChanged(withPane(host.dockview.shows!, 'details'));
    });
    await waitFor(
      () => {
        expect(host.controller.snapshot()?.layout.workbench).toEqual({
          kind: 'group',
          tabs: [
            { kind: 'pane', pane: 'parameters' },
            { kind: 'pane', pane: 'share' },
            { kind: 'pane', pane: 'details' },
          ],
        });
      },
      { timeout: 1600 },
    );
    host.unmount();
  });

  it('applies a pane intent sent before the read after the read, so the read cannot replace it', async () => {
    const gate = Promise.withResolvers<void>();
    const host = mount({ initialRead: gate.promise });
    const shown: unknown[] = [];
    act(() => {
      host.controller.registerViewer((_node, applied) => applied());
      host.dockview.attach((node, applied) => {
        shown.push(node);
        applied();
      });
      host.intent('share');
    });
    gate.resolve();
    const requested = {
      kind: 'group',
      tabs: [
        { kind: 'pane', pane: 'parameters' },
        { kind: 'pane', pane: 'share' },
      ],
    };
    await waitFor(
      () => {
        expect(workbenchRecords.layout.read(host.bytes!)).toMatchObject({ record: { workbench: requested } });
      },
      { timeout: 1600 },
    );
    // The read is shown first and the pane opens on it; nothing the read brings later replaces it.
    expect(shown).toEqual([first().workbench]);
    expect(host.dockview.shows).toEqual(requested);
    host.unmount();
  });

  it('shows only the stored arrangement while the record is refused', async () => {
    const host = mount();
    await waitFor(() => {
      expect(host.controller.snapshot()?.layout).toEqual(first());
    });
    await host.set(encoder.encode('{"version":2}'));
    await waitFor(() => {
      expect(host.controller.snapshot()).toBeUndefined();
    });
    act(() => {
      host.controller.personWorkbenchChanged({ kind: 'group', tabs: [{ kind: 'pane', pane: 'details' }] });
    });
    const apply = landAtOnce();
    act(() => {
      host.controller.registerWorkbench(apply);
    });
    expect(apply).toHaveBeenCalledExactlyOnceWith(first().workbench, expect.any(Function));
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 650);
      });
    });
    expect(host.writes).not.toHaveBeenCalled();
    host.unmount();
  });

  /* A8b review: Dockview reports an opened pane in a microtask (`onDidLayoutChange` is an `AsapEvent`), after the
   * opener returns, but its model has the pane at once. The opener answers with it, so the pane is the intent's applied
   * arrangement, and the deferred report that follows is not a person's edit. */
  it("answers a delivered pane intent with what the opener shows, and its deferred report is not a person's edit", async () => {
    const host = mount();
    await waitFor(() => {
      expect(host.controller.snapshot()?.layout).toEqual(first());
    });
    act(() => {
      host.controller.registerViewer((_node, applied) => applied());
      host.dockview.attach(landAtOnce());
    });
    await act(async () => {
      host.intent('details');
    });
    const opened = withPane(first().workbench, 'details');
    expect(host.received.filter((event) => event.type === 'intentApplied')).toEqual([
      expect.objectContaining({ type: 'intentApplied', node: opened }),
    ]);
    expect(host.received.filter((event) => event.type === 'personEdited')).toEqual([]);
    expect(host.layout.getSnapshot().context.arrangement?.workbench).toEqual(opened);
    host.unmount();
  });

  /* A8b review: Dockview may hold an apply (a file it shows opens first). A pane an intent opened meanwhile would be
   * replaced when the apply lands, so the delivery waits for it. */
  it('opens a delivered pane intent only once the workbench has landed what it was shown', async () => {
    const host = mount();
    await waitFor(() => {
      expect(host.controller.snapshot()?.layout).toEqual(first());
    });
    let land: (() => void) | undefined;
    act(() => {
      host.controller.registerViewer((_node, applied) => applied());
      host.dockview.attach((_node, applied) => {
        land = applied;
      });
    });
    await act(async () => {
      host.intent('details');
    });
    // The apply lands, and shows what it was handed in place of anything opened before it.
    await act(async () => {
      land?.();
    });
    const opened = withPane(first().workbench, 'details');
    expect(host.dockview.shows).toEqual(opened);
    expect(host.layout.getSnapshot().context.arrangement?.workbench).toEqual(opened);
    host.unmount();
  });

  /* A8b review: a delivery held behind an apply can be dropped before the apply lands, here by a route the shell left
   * (rule 6). It opens nothing when the apply lands, and its late answer retires it. */
  it('opens nothing for a held delivery that a route change dropped before the apply landed', async () => {
    const host = mount();
    await waitFor(() => {
      expect(host.controller.snapshot()?.layout).toEqual(first());
    });
    let land: (() => void) | undefined;
    act(() => {
      host.controller.registerViewer((_node, applied) => applied());
      host.dockview.attach((_node, applied) => {
        land = applied;
      });
    });
    let left = '';
    await act(async () => {
      left = host.intent('details');
    });
    // The shell moves to another route, and an intent sent there tells the layout so, which drops the held one.
    host.setRoute('r2');
    await act(async () => {
      host.intent('kernel');
    });
    expect(selectIntentOutcome(host.layout.getSnapshot(), left)).toEqual({
      outcome: 'dropped',
      reason: 'routeChanged',
    });
    await act(async () => {
      land?.();
    });
    expect(host.dockview.shows).toEqual(withPane(first().workbench, 'kernel'));
    expect(intentOf(host.layout.getSnapshot().context.intents, left)).toBeUndefined();
    expect(host.layout.getSnapshot().context.arrangement?.workbench).toEqual(withPane(first().workbench, 'kernel'));
    host.unmount();
  });

  /* A8b review: a foreign arrangement that closes the workbench lane is shown in one step: its lanes reach the editor
   * first, whose close the layout hears only after that step, and its workbench apply lands at once, which releases a
   * held file intent inside the same step. The lane close drops that intent (rule 7), so it opens nothing and is not
   * counted as an edit. */
  it('opens nothing for a held file intent released by an apply whose arrangement closes the workbench lane', async () => {
    const host = mount({ openFiles: ['a.ts'] });
    await waitFor(() => {
      expect(host.controller.snapshot()?.layout).toEqual(first());
    });
    let holding = true;
    act(() => {
      host.controller.registerViewer((_node, applied) => applied());
      host.dockview.attach((_node, applied) => {
        // The first apply waits, as one whose file must open first; later ones land at once.
        if (holding) {
          holding = false;
          return;
        }
        applied();
      });
    });
    let intentId = '';
    await act(async () => {
      intentId = host.fileIntent('a.ts');
    });
    const closing: WorkbenchLayout = { ...second(), lanes: { chat: true, workbench: false } };
    await host.set(encoder.encode(workbenchRecords.layout.serialize(closing)));
    await waitFor(() => {
      expect(host.layout.getSnapshot().context.arrangement).toEqual(closing);
    });
    expect(selectIntentOutcome(host.layout.getSnapshot(), intentId)).toEqual({
      outcome: 'dropped',
      reason: 'workbenchClosed',
    });
    expect(host.dockview.shows).toEqual(closing.workbench);
    expect(intentOf(host.layout.getSnapshot().context.intents, intentId)).toBeUndefined();
    await act(async () => {
      await host.producer();
    });
    expect(host.writes).not.toHaveBeenCalled();
    host.unmount();
  });

  /* A8b review: an apply can land with less than it was handed (a tab whose file did not open). What it shows is the
   * arrangement now, an edit, and the revision it was handed is not acknowledged until the edit is written back. */
  it('reports an apply that lands with less than it was handed as an edit, and does not acknowledge the revision', async () => {
    const host = mount();
    await waitFor(() => {
      expect(host.controller.snapshot()?.layout).toEqual(first());
    });
    act(() => {
      host.controller.registerViewer((_node, applied) => applied());
      host.dockview.attach((_node, applied) => applied(emptyGroup()));
    });
    await waitFor(() => {
      expect(host.received.filter((event) => event.type === 'personEdited')).toEqual([
        { type: 'personEdited', adapter: 'workbench', node: emptyGroup() },
      ]);
    });
    expect(host.dockview.shows).toEqual(emptyGroup());
    expect(host.appliedDigest).not.toBe(host.controller.snapshot()?.layoutDigest);
    await act(async () => {
      await host.producer();
    });
    expect(workbenchRecords.layout.read(host.bytes!)).toMatchObject({ record: { workbench: emptyGroup() } });
    host.unmount();
  });

  /* A8b review: a person's edit made while an apply is held is the arrangement. The held apply still lands over it on
   * screen (the I10 gap), but what it lands is not counted as an edit too, which would write it over the person's. */
  it("does not count a held apply that lands with less as an edit over a person's edit made while it was held", async () => {
    const host = mount();
    await waitFor(() => {
      expect(host.controller.snapshot()?.layout).toEqual(first());
    });
    let land: ((shown?: WorkbenchLaneNode) => void) | undefined;
    act(() => {
      host.controller.registerViewer((_node, applied) => applied());
      host.dockview.attach((_node, applied) => {
        land = applied;
      });
    });
    const person = withPane(emptyGroup(), 'details');
    act(() => {
      host.controller.personWorkbenchChanged(person);
    });
    await act(async () => {
      land?.(emptyGroup());
    });
    expect(host.received.filter((event) => event.type === 'personEdited')).toEqual([
      { type: 'personEdited', adapter: 'workbench', node: person },
    ]);
    expect(host.layout.getSnapshot().context.arrangement?.workbench).toEqual(person);
    host.unmount();
  });

  /* A8b review: while the record is refused the workbench shows only what is on disk, as the record host did. A pane
   * intent opens nothing, is unavailable and owes no edit, so a flush settles; and when the record comes back with the
   * same bytes, the revision acknowledged is the one on screen (I12). */
  it('opens nothing for a pane intent on a refused record, and acknowledges the record once it is back', async () => {
    const host = mount();
    await waitFor(() => {
      expect(host.controller.snapshot()?.layout).toEqual(first());
    });
    act(() => {
      host.controller.registerViewer((_node, applied) => applied());
      host.dockview.attach(landAtOnce());
    });
    await host.set(encoder.encode('{"version":2}'));
    await waitFor(() => {
      expect(host.controller.snapshot()).toBeUndefined();
    });
    let intentId = '';
    await act(async () => {
      intentId = host.intent('details');
    });
    expect(host.dockview.shows).toEqual(first().workbench);
    expect(selectIntentOutcome(host.layout.getSnapshot(), intentId)).toEqual({
      outcome: 'dropped',
      reason: 'unavailable',
    });
    expect(host.received.filter((event) => event.type === 'personEdited')).toEqual([]);
    await expect(host.producer()).resolves.toBeUndefined();
    expect(host.writes).not.toHaveBeenCalled();
    await host.set(encoder.encode(workbenchRecords.layout.serialize(first())));
    await waitFor(() => {
      expect(host.appliedDigest).toBe(host.controller.snapshot()?.layoutDigest);
    });
    expect(host.dockview.shows).toEqual(first().workbench);
    host.unmount();
  });

  /* A8b review: a project with no layout record yet is not refused. A pane intent opens on what the Dockview shows and
   * starts the record's arrangement, which is written. */
  it('opens a pane intent on a project with no layout record and writes it', async () => {
    const host = mount({ missing: true });
    await waitFor(() => {
      expect(host.layout.getSnapshot().value).toMatchObject({ record: 'ready' });
    });
    act(() => {
      host.controller.registerViewer((_node, applied) => applied());
      host.dockview.attach(landAtOnce());
    });
    let intentId = '';
    await act(async () => {
      intentId = host.intent('details');
    });
    const opened = withPane(emptyGroup(), 'details');
    expect(host.dockview.shows).toEqual(opened);
    expect(selectIntentOutcome(host.layout.getSnapshot(), intentId)).toEqual({ outcome: 'applied' });
    await act(async () => {
      await host.producer();
    });
    expect(workbenchRecords.layout.read(host.bytes!)).toMatchObject({ record: { workbench: opened } });
    host.unmount();
  });

  /* A8b review: on a project with no layout record the arrangement starts with an intent, not a read. A foreign
   * arrangement applied later is a lane change like any other, not the record's baseline: a lane it closes is
   * reported closed (rule 7). */
  it('reports a lane a later foreign arrangement closes on a project that started with no layout record', async () => {
    const host = mount({ missing: true });
    await waitFor(() => {
      expect(host.layout.getSnapshot().value).toMatchObject({ record: 'ready' });
    });
    act(() => {
      host.controller.registerViewer((_node, applied) => applied());
      host.dockview.attach(landAtOnce());
    });
    await act(async () => {
      host.intent('details');
    });
    await act(async () => {
      await host.producer();
    });
    await host.set(
      encoder.encode(workbenchRecords.layout.serialize({ ...first(), lanes: { chat: true, workbench: false } })),
    );
    await waitFor(() => {
      expect(host.layout.getSnapshot().context.arrangement?.lanes.workbench).toBe(false);
    });
    expect(host.received).toContainEqual({ type: 'workbenchLaneChanged', open: false });
    expect(host.layout.getSnapshot().context.workbenchOpen).toBe(false);
    host.unmount();
  });

  /* A8b review: a record whose first read fails for good has nothing to wait for. A pane intent opens straight into the
   * workbench, as the record host did, without becoming an edit of a record that cannot be read. */
  it('opens a pane intent once the first read has stopped retrying, without an edit', async () => {
    const host = mount({ failAllReads: true });
    act(() => {
      host.controller.registerViewer((_node, applied) => applied());
      host.dockview.attach(landAtOnce());
    });
    await waitFor(() => {
      expect(host.layout.getSnapshot().context.health?.read).toBe('unavailable');
    });
    let intentId = '';
    await act(async () => {
      intentId = host.intent('details');
    });
    expect(host.layout.getSnapshot().value).toMatchObject({ record: 'reading' });
    expect(host.dockview.shows).toEqual(withPane(emptyGroup(), 'details'));
    expect(selectIntentOutcome(host.layout.getSnapshot(), intentId)).toEqual({
      outcome: 'dropped',
      reason: 'unavailable',
    });
    expect(host.received.filter((event) => event.type === 'personEdited')).toEqual([]);
    expect(host.appliedDigest).toBeUndefined();
    host.unmount();
  });

  /* A8b review: a watch that fails before the first read means that read never comes. The record is unavailable, as the
   * record host combined the watch's error into its health, so a pane intent opens instead of waiting for it. */
  it('opens a pane intent when the watch fails before the first read, without an edit', async () => {
    const host = mount({
      failLayoutWatch: true,
      initialRead: new Promise<void>(() => {
        /* The first read never finishes. */
      }),
    });
    act(() => {
      host.controller.registerViewer((_node, applied) => applied());
      host.dockview.attach(landAtOnce());
    });
    await waitFor(() => {
      expect(host.layout.getSnapshot().context.health?.read).toBe('unavailable');
    });
    let intentId = '';
    await act(async () => {
      intentId = host.intent('details');
    });
    expect(host.dockview.shows).toEqual(withPane(emptyGroup(), 'details'));
    expect(selectIntentOutcome(host.layout.getSnapshot(), intentId)).toEqual({
      outcome: 'dropped',
      reason: 'unavailable',
    });
    expect(host.received.filter((event) => event.type === 'personEdited')).toEqual([]);
    host.unmount();
  });

  /* A8b review: Dockview holds an apply until its files open. A newer show of what is already on screen replaces the
   * held one, so it never lands later over the newer arrangement, and intents are not held behind it. */
  it('replaces a held apply with a newer show of what is on screen', async () => {
    const host = mount();
    await waitFor(() => {
      expect(host.controller.snapshot()?.layout).toEqual(first());
    });
    let land: (() => void) | undefined;
    act(() => {
      host.controller.registerViewer((_node, applied) => applied());
      host.dockview.attach((node, applied) => {
        // An arrangement with the kernel pane waits, as one whose file must open first.
        if (node.kind === 'group' && node.tabs.some((tab) => tab.kind === 'pane' && tab.pane === 'kernel')) {
          land = applied;
          return;
        }
        applied();
      });
    });
    await host.set(encoder.encode(workbenchRecords.layout.serialize(second())));
    await waitFor(() => expect(host.controller.snapshot()?.layout).toEqual(second()));
    await host.set(encoder.encode(workbenchRecords.layout.serialize(first())));
    await waitFor(() => {
      expect(host.appliedDigest).toBe(host.controller.snapshot()?.layoutDigest);
    });
    expect(land).toBeTypeOf('function');
    // The held apply was replaced, as Dockview replaces a held node, so it never lands; the intent is not held behind it.
    await act(async () => {
      host.intent('details');
    });
    const opened = withPane(first().workbench, 'details');
    expect(host.dockview.shows).toEqual(opened);
    expect(host.layout.getSnapshot().context.arrangement?.workbench).toEqual(opened);
    host.unmount();
  });

  /* A8b review: an intent the workbench cannot show is unavailable, not applied: a pane its opener refuses, and a file
   * the editor closed before the intent was delivered. */
  it('reports a refused pane and a closed file unavailable instead of applied', async () => {
    const host = mount();
    await waitFor(() => {
      expect(host.controller.snapshot()?.layout).toEqual(first());
    });
    const activateFile = vi.fn();
    act(() => {
      host.controller.registerViewer((_node, applied) => applied());
      host.controller.registerWorkbench(landAtOnce());
      host.controller.connectIntents({ openPanel: () => false, activateFile });
    });
    let pane = '';
    let file = '';
    await act(async () => {
      pane = host.intent('kernel');
      file = sendPaneIntent(
        host.layout,
        { routeKey: '', device: 'desktop' },
        {
          source: 'person',
          target: { kind: 'file', path: 'closed.ts' },
        },
      );
    });
    expect(activateFile).not.toHaveBeenCalled();
    for (const intentId of [pane, file]) {
      expect(selectIntentOutcome(host.layout.getSnapshot(), intentId)).toEqual({
        outcome: 'dropped',
        reason: 'unavailable',
      });
    }
    host.unmount();
  });

  it('re-announces each distinct foreign adoption exactly once and ignores a byte-equal echo', async () => {
    const host = mount();
    await waitFor(() => {
      expect(host.controller.snapshot()?.layout).toEqual(first());
    });
    const initial = screen.getByRole('status').firstChild;
    await host.set(encoder.encode(workbenchRecords.layout.serialize(second())));
    await waitFor(() => {
      expect(host.controller.snapshot()?.layout).toEqual(second());
    });
    const secondAnnouncement = screen.getByRole('status').firstChild;
    expect(secondAnnouncement).not.toBe(initial);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    await host.set(encoder.encode(workbenchRecords.layout.serialize(first())));
    await waitFor(() => {
      expect(host.controller.snapshot()?.layout).toEqual(first());
    });
    const thirdAnnouncement = screen.getByRole('status').firstChild;
    expect(thirdAnnouncement).not.toBe(secondAnnouncement);
    await host.set(encoder.encode(workbenchRecords.layout.serialize(first())));
    expect(screen.getByRole('status').firstChild).toBe(thirdAnnouncement);
    host.unmount();
  });

  it('should leave the viewer adapter untouched when only the workbench lane changes', async () => {
    const host = mount();
    await waitFor(() => expect(host.controller.snapshot()?.layout).toEqual(first()));
    const viewer = landAtOnce();
    const workbench = landAtOnce();
    act(() => {
      host.controller.registerViewer(viewer);
      host.controller.registerWorkbench(workbench);
    });
    viewer.mockClear();
    workbench.mockClear();
    await host.set(encoder.encode(workbenchRecords.layout.serialize(second())));
    await waitFor(() => expect(host.controller.snapshot()?.layout).toEqual(second()));
    expect(viewer).not.toHaveBeenCalled();
    expect(workbench).toHaveBeenCalledOnce();
    await waitFor(() => expect(host.appliedDigest).toBe(host.controller.snapshot()?.layoutDigest));
    host.unmount();
  });

  it('should not replay a watched local layout write over a newer live pane edit before acknowledgement', async () => {
    const started = Promise.withResolvers<void>();
    const ack = Promise.withResolvers<void>();
    const host = mount({
      pendingLayoutAck: ack.promise,
      onLayoutWriteStarted: started.resolve,
    });
    try {
      await waitFor(() => expect(host.controller.snapshot()?.layout).toEqual(first()));
      const apply = landAtOnce();
      act(() => {
        host.controller.registerViewer(apply);
        host.controller.registerWorkbench(apply);
      });
      const a: WorkbenchLayout['workbench'] = {
        kind: 'group',
        tabs: [{ kind: 'pane', pane: 'revisions' }],
      };
      const b: WorkbenchLayout['workbench'] = {
        kind: 'group',
        tabs: [{ kind: 'pane', pane: 'details' }],
      };
      act(() => host.controller.personWorkbenchChanged(a));
      await started.promise;
      act(() => host.controller.personWorkbenchChanged(b));
      apply.mockClear();
      await host.setLive(host.bytes!);
      await waitFor(() => expect(host.controller.snapshot()?.layout.workbench).toEqual(a));
      expect(apply).not.toHaveBeenCalledWith(a, expect.any(Function));
    } finally {
      ack.resolve();
      host.unmount();
    }
  });

  it('should keep a newer live viewer edit when a foreign lane change retains the old viewer tree', async () => {
    const host = mount();
    await waitFor(() => {
      expect(host.controller.snapshot()?.layout).toEqual(first());
    });
    const viewer = landAtOnce();
    const workbench = landAtOnce();
    act(() => {
      host.controller.registerViewer(viewer);
      host.controller.registerWorkbench(workbench);
    });
    const edited: WorkbenchLayout['viewer'] = { kind: 'group', tabs: [] };
    act(() => {
      host.controller.personViewerChanged(edited);
    });
    viewer.mockClear();
    await host.setLive(
      encoder.encode(
        workbenchRecords.layout.serialize({
          ...first(),
          lanes: { chat: false, workbench: true },
        }),
      ),
    );
    await waitFor(() => {
      expect(host.controller.snapshot()?.layout.lanes.chat).toBe(false);
    });
    // The foreign change is fenced while the viewer edit is owed; the edit's write keeps the foreign lanes, and its
    // publication brings them to the editor.
    await waitFor(
      () => {
        expect(host.send).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'setPanelState',
            panelState: { desktopLayout: { chatOpen: false, workbenchOpen: true } },
          }),
        );
      },
      { timeout: 1600 },
    );
    expect(viewer).not.toHaveBeenCalled();
    expect(workbenchRecords.layout.read(host.bytes!)).toMatchObject({ record: { viewer: edited } });
    host.unmount();
  });

  it('acknowledges layout bytes only after both adapters apply and rejects stale callbacks', async () => {
    const host = mount();
    await waitFor(() => {
      expect(host.controller.snapshot()?.layout).toEqual(first());
    });
    const viewerCallbacks: Array<() => void> = [];
    const workbenchCallbacks: Array<() => void> = [];
    act(() => {
      host.controller.registerViewer((_node, applied) => {
        viewerCallbacks.push(applied);
      });
    });
    expect(host.appliedDigest).toBeUndefined(); // Mobile editor drawer may not be mounted yet.
    act(() => {
      host.controller.registerWorkbench((_node, applied) => {
        workbenchCallbacks.push(applied);
      });
    });
    act(() => viewerCallbacks.at(-1)?.());
    expect(host.appliedDigest).toBeUndefined();
    act(() => workbenchCallbacks.at(-1)?.());
    expect(host.appliedDigest).toBe(host.controller.snapshot()?.layoutDigest);
    const staleWorkbench = workbenchCallbacks.at(-1)!;
    await host.set(encoder.encode(workbenchRecords.layout.serialize(second())));
    await waitFor(() => {
      expect(host.controller.snapshot()?.layout).toEqual(second());
    });
    expect(host.appliedDigest).toBeUndefined();
    act(() => {
      viewerCallbacks.at(-1)?.();
      staleWorkbench();
    });
    expect(host.appliedDigest).toBeUndefined();
    act(() => workbenchCallbacks.at(-1)?.());
    await waitFor(() => expect(host.appliedDigest).toBe(host.controller.snapshot()?.layoutDigest));
    const staleViewer = viewerCallbacks.at(-1)!;
    await host.set(encoder.encode('{bad'));
    await waitFor(() => {
      expect(host.controller.snapshot()).toBeUndefined();
    });
    expect(host.appliedDigest).toBeUndefined();
    act(() => staleViewer());
    expect(host.appliedDigest).toBeUndefined();
    host.unmount();
  });

  it('adopts one arrangement without stealing focus, reports refused debug panes, and restores prior bytes', async () => {
    const host = mount();
    const editor = document.createElement('button');
    document.body.append(editor);
    editor.focus();
    await waitFor(() => {
      expect(host.controller.snapshot()?.layout).toEqual(first());
    });
    const adoptViewer = vi.fn();
    const adoptWorkbench = vi.fn();
    let unsubViewer = (): void => undefined;
    let unsubWorkbench = (): void => undefined;
    act(() => {
      unsubViewer = host.controller.registerViewer(adoptViewer);
      unsubWorkbench = host.controller.registerWorkbench(adoptWorkbench);
    });
    const changed = vi.fn();
    const unsubscribe = host.controller.subscribe(changed);
    await host.set(encoder.encode(JSON.stringify(second(), null, 2)));
    await waitFor(() => {
      expect(host.controller.snapshot()?.layout).toEqual(second());
    });
    expect(host.controller.snapshot()?.refused).toEqual([
      { tab: { kind: 'pane', pane: 'kernel' }, reason: 'debug-only' },
    ]);
    expect(host.controller.snapshot()?.layoutDigest).toMatch(/^sha256:/u);
    expect(adoptViewer).toHaveBeenCalledWith(second().viewer, expect.any(Function));
    expect(adoptWorkbench).toHaveBeenCalledWith(second().workbench, expect.any(Function));
    expect(document.activeElement).toBe(editor);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status').textContent).toBe('Workbench arrangement updated.');
    expect(changed).toHaveBeenCalled();
    expect(host.send).toHaveBeenCalledWith({
      type: 'setPreviousLayout',
      layout: { layout: first(), views: { 'v-abcd1234': viewSeed() } },
    });
    expect(
      await act(async () =>
        host.controller.restorePreviousArrangement({
          layoutDigest: host.controller.snapshot()!.layoutDigest,
          target: host.controller.snapshot()!.restoreTarget!,
          eligible: () => true,
        }),
      ),
    ).toBe(true);
    expect(workbenchRecords.layout.read(host.bytes!)).toMatchObject({
      status: 'current',
      record: first(),
    });
    expect(host.writes).toHaveBeenCalledTimes(1);
    unsubscribe();
    act(() => {
      unsubViewer();
      unsubWorkbench();
    });
    editor.remove();
    host.unmount();
  });

  it('clears the reactive snapshot for invalid/newer bytes and offers Reset only for invalid bytes', async () => {
    // Offered through the settings trigger: the layout publishes the issue and the page renders no text.
    const host = mount();
    await waitFor(() => {
      expect(host.controller.snapshot()?.layout).toEqual(first());
    });
    const changed = vi.fn();
    host.controller.subscribe(changed);
    await host.set(encoder.encode('{broken'));
    await waitFor(() => {
      expect(host.controller.snapshot()).toBeUndefined();
    });
    expect(changed).toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
    await waitFor(() => {
      expect(readRecordIssues('p')).toMatchObject([{ kind: 'layout', state: 'invalid' }]);
    });
    await host.set(encoder.encode('{"version":2}'));
    await waitFor(() => {
      expect(host.controller.snapshot()).toBeUndefined();
    });
    await waitFor(() => {
      expect(readRecordIssues('p')).toMatchObject([{ kind: 'layout', state: 'newer' }]);
    });
    expect(host.writes).not.toHaveBeenCalled();
    host.unmount();
  });

  it('recreates the closed non-main view from its device rollback seed before Restore', async () => {
    const host = mount();
    await waitFor(() => {
      expect(host.controller.snapshot()?.layout).toEqual(first());
    });
    // The page shows the arrangement: the closing change is applied, and the restore is asked over it.
    act(() => {
      host.controller.registerViewer(landAtOnce());
      host.controller.registerWorkbench(landAtOnce());
    });
    host.deleteView();
    const closed: WorkbenchLayout = {
      ...first(),
      viewer: { kind: 'group', tabs: [] },
    };
    await host.set(encoder.encode(workbenchRecords.layout.serialize(closed)));
    await waitFor(() => {
      expect(host.previous?.layout).toEqual(first());
    });
    expect(host.viewBytes).toBeUndefined();
    expect(host.writes).not.toHaveBeenCalled();
    expect(host.previous?.views['v-abcd1234']?.entryPath).toBe('models/other.ts');
    expect(
      await act(async () =>
        host.controller.restorePreviousArrangement({
          layoutDigest: host.controller.snapshot()!.layoutDigest,
          target: host.controller.snapshot()!.restoreTarget!,
          eligible: () => true,
        }),
      ),
    ).toBe(true);
    expect(workbenchRecords.view.read(host.viewBytes!)).toMatchObject({
      status: 'current',
      record: { entryPath: 'models/other.ts' },
    });
    expect(host.controller.snapshot()?.layout).toEqual(first());
    host.unmount();
  });

  it('restores a prior non-main view after device-row reload without choosing another entry', async () => {
    const closed: WorkbenchLayout = {
      ...first(),
      viewer: { kind: 'group', tabs: [] },
    };
    const host = mount({
      layout: closed,
      previous: { layout: first(), views: { 'v-abcd1234': viewSeed() } },
      viewExists: false,
    });
    await waitFor(() => {
      expect(host.controller.snapshot()?.layout).toEqual(closed);
    });
    expect(
      await act(async () =>
        host.controller.restorePreviousArrangement({
          layoutDigest: host.controller.snapshot()!.layoutDigest,
          target: host.controller.snapshot()!.restoreTarget!,
          eligible: () => true,
        }),
      ),
    ).toBe(true);
    expect(workbenchRecords.view.read(host.viewBytes!)).toMatchObject({
      status: 'current',
      record: { entryPath: 'models/other.ts' },
    });
    expect(host.controller.snapshot()?.layout).toEqual(first());
    host.unmount();
  });
});

describe('layout host rows (A0.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const restoreCommand = (host: ReturnType<typeof mount>) => ({
    layoutDigest: host.controller.snapshot()!.layoutDigest,
    target: host.controller.snapshot()!.restoreTarget!,
    eligible: () => true,
  });

  // A0.3 row 2, Y3/I12: while no adapter is attached the applied revision reads as unknown, a publication is not
  // acknowledged, and the adapter that attaches next is shown that publication and only then acknowledges it.
  it('should read the applied revision as unknown while detached and acknowledge a detached publication on attach', async () => {
    const host = mount();
    await waitFor(() => expect(host.controller.snapshot()?.layout).toEqual(first()));
    const viewer = landAtOnce();
    const workbench = landAtOnce();
    let detachViewer = (): void => undefined;
    let detachWorkbench = (): void => undefined;
    act(() => {
      detachViewer = host.controller.registerViewer(viewer);
      detachWorkbench = host.controller.registerWorkbench(workbench);
    });
    expect(host.appliedDigest).toBe(host.controller.snapshot()?.layoutDigest);
    act(() => {
      detachWorkbench();
    });
    expect(host.appliedDigest).toBeUndefined();
    act(() => {
      detachViewer();
    });
    await host.set(encoder.encode(workbenchRecords.layout.serialize(second())));
    await waitFor(() => expect(host.controller.snapshot()?.layout).toEqual(second()));
    expect(host.appliedDigest).toBeUndefined();
    viewer.mockClear();
    workbench.mockClear();
    act(() => {
      host.controller.registerViewer(viewer);
      host.controller.registerWorkbench(workbench);
    });
    expect(viewer).toHaveBeenCalledExactlyOnceWith(second().viewer, expect.any(Function));
    expect(workbench).toHaveBeenCalledExactlyOnceWith(second().workbench, expect.any(Function));
    await waitFor(() => expect(host.appliedDigest).toBe(host.controller.snapshot()?.layoutDigest));
    host.unmount();
  });

  // A0.3 row 3, Y2/I10: a foreign publication lands while the person's pane edit is not yet written. The person's
  // arrangement wins: the workbench is never handed an arrangement without the person's edit.
  it('I10: should not show a foreign arrangement over an unwritten person edit', async () => {
    const host = mount();
    await waitFor(() => expect(host.controller.snapshot()?.layout).toEqual(first()));
    const shown: WorkbenchLaneNode[] = [];
    act(() => {
      host.controller.registerViewer(landAtOnce());
      host.controller.registerWorkbench((node, applied) => {
        shown.push(node);
        applied();
      });
    });
    const edited: WorkbenchLaneNode = { kind: 'group', tabs: [{ kind: 'pane', pane: 'revisions' }] };
    act(() => {
      host.controller.personWorkbenchChanged(edited);
    });
    shown.length = 0;
    await host.set(encoder.encode(workbenchRecords.layout.serialize(second())));
    await waitFor(() => expect(host.controller.snapshot()?.layout.lanes).toEqual(second().lanes));
    // A merged arrangement that keeps the person's tree is fine; showing the foreign tree is not.
    expect(shown).not.toContainEqual(second().workbench);
    host.unmount();
  });

  // A0.3 row 4, Y1/I14: a restore from the arrange-workbench card is written and shown on the attached adapters,
  // then acknowledged.
  it('should write a restore, show it on the attached adapters, and acknowledge it', async () => {
    const host = mount({ layout: second(), previous: { layout: first(), views: { 'v-abcd1234': viewSeed() } } });
    await waitFor(() => expect(host.controller.snapshot()?.layout).toEqual(second()));
    const viewer = landAtOnce();
    const workbench = landAtOnce();
    act(() => {
      host.controller.registerViewer(viewer);
      host.controller.registerWorkbench(workbench);
    });
    workbench.mockClear();
    expect(await act(async () => host.controller.restorePreviousArrangement(restoreCommand(host)))).toBe(true);
    expect(workbenchRecords.layout.read(host.bytes!)).toMatchObject({ status: 'current', record: first() });
    await waitFor(() => expect(host.controller.snapshot()?.layout).toEqual(first()));
    expect(workbench).toHaveBeenLastCalledWith(first().workbench, expect.any(Function));
    await waitFor(() => expect(host.appliedDigest).toBe(host.controller.snapshot()?.layoutDigest));
    host.unmount();
  });

  // A0.3 row 4, Y1/I14: restore is a repeatable command. The same command again is refused and changes nothing; the
  // card's refreshed command restores the arrangement the first restore replaced.
  it('should refuse a repeated restore command and apply the refreshed one', async () => {
    const host = mount({ layout: second(), previous: { layout: first(), views: { 'v-abcd1234': viewSeed() } } });
    await waitFor(() => expect(host.controller.snapshot()?.layout).toEqual(second()));
    const command = restoreCommand(host);
    expect(await act(async () => host.controller.restorePreviousArrangement(command))).toBe(true);
    await waitFor(() => expect(host.controller.snapshot()?.layout).toEqual(first()));
    const restored = host.bytes;
    expect(await act(async () => host.controller.restorePreviousArrangement(command))).toBe(false);
    expect(host.bytes).toBe(restored);
    expect(host.writes).toHaveBeenCalledOnce();
    expect(host.previous?.layout).toEqual(second());
    expect(await act(async () => host.controller.restorePreviousArrangement(restoreCommand(host)))).toBe(true);
    expect(workbenchRecords.layout.read(host.bytes!)).toMatchObject({ status: 'current', record: second() });
    expect(host.writes).toHaveBeenCalledTimes(2);
    host.unmount();
  });

  // A0.3 row 4, Y1/I14: when the arrangement moved after the card read its command, the restore is refused and the
  // arrangement is unchanged, whether the person's edit is still owed or already written.
  it.each(['owed', 'written'] as const)(
    'should refuse a restore when the arrangement moved and leave it unchanged (edit %s)',
    async (edit) => {
      const host = mount({ layout: second(), previous: { layout: first(), views: { 'v-abcd1234': viewSeed() } } });
      await waitFor(() => expect(host.controller.snapshot()?.layout).toEqual(second()));
      act(() => {
        host.controller.registerViewer(landAtOnce());
        host.controller.registerWorkbench(landAtOnce());
      });
      const command = restoreCommand(host);
      const moved: WorkbenchLaneNode = { kind: 'group', tabs: [{ kind: 'pane', pane: 'details' }] };
      act(() => {
        host.controller.personWorkbenchChanged(moved);
      });
      if (edit === 'written') {
        await waitFor(() => expect(host.controller.snapshot()?.layout.workbench).toEqual(moved), { timeout: 1600 });
      }
      expect(await act(async () => host.controller.restorePreviousArrangement(command))).toBe(false);
      await waitFor(() => expect(host.controller.snapshot()?.layout.workbench).toEqual(moved), { timeout: 1600 });
      expect(workbenchRecords.layout.read(host.bytes!)).toMatchObject({
        status: 'current',
        record: { ...second(), workbench: moved },
      });
      expect(host.writes).toHaveBeenCalledOnce();
      host.unmount();
    },
  );

  // A0.3 row 5, Y3/S25: the runtime registers the layout's producer once, a StrictMode host registers none, and the
  // producer's flush settles a layout write in flight, which lands once.
  it('should keep one producer under StrictMode whose flush settles a layout write in flight', async () => {
    const started = Promise.withResolvers<void>();
    const ack = Promise.withResolvers<void>();
    const host = mount({
      strict: true,
      pendingLayoutAck: ack.promise,
      onLayoutWriteStarted: started.resolve,
    });
    try {
      await waitFor(() => expect(host.controller.snapshot()?.layout).toEqual(first()));
      act(() => {
        host.controller.registerViewer(landAtOnce());
        host.controller.registerWorkbench(landAtOnce());
      });
      const edited: WorkbenchLaneNode = { kind: 'group', tabs: [{ kind: 'pane', pane: 'details' }] };
      await act(async () => {
        host.controller.personWorkbenchChanged(edited);
        await started.promise;
      });
      let settled = false;
      const flushing = (async () => {
        await host.producer();
        settled = true;
      })();
      await act(async () => undefined);
      expect(settled).toBe(false);
      await act(async () => {
        ack.resolve();
        await flushing;
      });
      expect(host.writes).toHaveBeenCalledOnce();
      expect(workbenchRecords.layout.read(host.bytes!)).toMatchObject({
        status: 'current',
        record: { ...first(), workbench: edited },
      });
    } finally {
      ack.resolve();
      host.unmount();
    }
  });

  // A0.3 row 5, Y3/I13: one record session per record file. The session is the runtime's child, so a StrictMode
  // double mount of the page's host opens no second one.
  it('I13: should hold one live layout record session under a StrictMode double mount', async () => {
    const host = mount({ strict: true });
    await waitFor(() => expect(host.controller.snapshot()?.layout).toEqual(first()));
    await act(async () => undefined);
    expect(host.watchesOpened).toBe(1);
    expect(host.openWatches).toBe(1);
    host.unmount();
  });
});

describe('the layout across a host remount (A8b)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // §11 (A8b): a write still in flight when the host remounts lands once, and nothing writes it again.
  it('should land a layout write in flight during a remount once', async () => {
    const started = Promise.withResolvers<void>();
    const ack = Promise.withResolvers<void>();
    const host = mount({ pendingLayoutAck: ack.promise, onLayoutWriteStarted: started.resolve });
    try {
      await waitFor(() => expect(host.controller.snapshot()?.layout).toEqual(first()));
      let detachViewer = (): void => undefined;
      let detachWorkbench = (): void => undefined;
      act(() => {
        detachViewer = host.controller.registerViewer(landAtOnce());
        detachWorkbench = host.controller.registerWorkbench(landAtOnce());
      });
      const edited: WorkbenchLaneNode = { kind: 'group', tabs: [{ kind: 'pane', pane: 'details' }] };
      await act(async () => {
        host.controller.personWorkbenchChanged(edited);
        await started.promise;
      });
      act(() => {
        detachWorkbench();
        detachViewer();
      });
      const remounted = host.remount();
      act(() => {
        host.controller.registerViewer(landAtOnce());
        host.controller.registerWorkbench(landAtOnce());
      });
      await act(async () => {
        ack.resolve();
      });
      await waitFor(() => expect(host.controller.snapshot()?.layout.workbench).toEqual(edited));
      expect(host.writes).toHaveBeenCalledOnce();
      expect(workbenchRecords.layout.read(host.bytes!)).toMatchObject({
        status: 'current',
        record: { ...first(), workbench: edited },
      });
      remounted.unmount();
    } finally {
      ack.resolve();
    }
  });

  // §11 (A8b): a person's edit still in its debounce when the host remounts is written, not dropped with the host.
  it('should write a debounced edit when the host remounts within the debounce', async () => {
    const host = mount();
    await waitFor(() => expect(host.controller.snapshot()?.layout).toEqual(first()));
    let detachViewer = (): void => undefined;
    let detachWorkbench = (): void => undefined;
    act(() => {
      detachViewer = host.controller.registerViewer(landAtOnce());
      detachWorkbench = host.controller.registerWorkbench(landAtOnce());
    });
    const edited: WorkbenchLaneNode = { kind: 'group', tabs: [{ kind: 'pane', pane: 'details' }] };
    act(() => {
      host.controller.personWorkbenchChanged(edited);
    });
    act(() => {
      detachWorkbench();
      detachViewer();
    });
    const remounted = host.remount();
    await waitFor(
      () => {
        expect(workbenchRecords.layout.read(host.bytes!)).toMatchObject({
          status: 'current',
          record: { ...first(), workbench: edited },
        });
      },
      { timeout: 1600 },
    );
    expect(host.writes).toHaveBeenCalledOnce();
    remounted.unmount();
  });

  // B1: a foreign change reaches a live project whose workbench has never mounted, and is applied when it attaches.
  it('should apply a foreign change made while no workbench was mounted when the workbench attaches', async () => {
    const host = mount();
    await waitFor(() => expect(host.controller.snapshot()?.layout).toEqual(first()));
    await host.set(encoder.encode(workbenchRecords.layout.serialize(second())));
    await waitFor(() => expect(host.controller.snapshot()?.layout).toEqual(second()));
    expect(host.appliedDigest).toBeUndefined();
    const viewer = landAtOnce();
    const workbench = landAtOnce();
    act(() => {
      host.controller.registerViewer(viewer);
      host.controller.registerWorkbench(workbench);
    });
    expect(workbench).toHaveBeenCalledExactlyOnceWith(second().workbench, expect.any(Function));
    await waitFor(() => expect(host.appliedDigest).toBe(host.controller.snapshot()?.layoutDigest));
    host.unmount();
  });

  // D14, rule 4: the acknowledgement waits for the editor's lanes to show the record's lanes as well as both adapters.
  it('should acknowledge a publication only once the editor shows its lanes', async () => {
    const host = mount({ lanes: { chat: true, workbench: true } });
    await waitFor(() => expect(host.controller.snapshot()?.layout).toEqual(first()));
    act(() => {
      host.controller.registerViewer(landAtOnce());
      host.controller.registerWorkbench(landAtOnce());
    });
    await waitFor(() => expect(host.appliedDigest).toBe(host.controller.snapshot()?.layoutDigest));
    // A foreign change closes the chat lane: the adapters show its trees at once, the lanes only once the editor has.
    host.holdLanes();
    await host.set(
      encoder.encode(workbenchRecords.layout.serialize({ ...first(), lanes: { chat: false, workbench: true } })),
    );
    await waitFor(() => expect(host.lanesHeld).toEqual({ chatOpen: false, workbenchOpen: true }));
    expect(host.controller.snapshot()?.layout.lanes.chat).toBe(false);
    expect(host.appliedDigest).toBeUndefined();
    // The editor shows the lanes: the publication is acknowledged.
    act(() => {
      host.showHeldLanes();
    });
    await waitFor(() => expect(host.appliedDigest).toBe(host.controller.snapshot()?.layoutDigest));
    host.unmount();
  });
});
