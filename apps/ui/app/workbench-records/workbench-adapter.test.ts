/**
 * The workbench adapter (A8c) hosted the way the runtime hosts it: spawned by the real `workbenchLayout` machine on a
 * Dockview's `dockReady`, speaking to the layout through the real controller shim, over a scripted editor and a
 * scripted Dockview whose operations keep one group of tabs.
 *
 * These rows pin the order the adapter's start keeps against its host's step: the layout handles the adapter's attach
 * only after the step that spawned it, so what the adapter does at start must not run ahead of the attach's apply.
 */
import type { DockviewApi } from 'dockview-react';
import type { WorkbenchLaneNode, WorkbenchLayout } from '@taucad/workbench';
import { afterEach, describe, expect, it } from 'vitest';
import { createActor, createCallbackLogic } from 'xstate';
import type { OpenFile } from '@taucad/ui-core/types/editor.types';
import { createWorkbenchLayoutControllerShim } from '#routes/w.$workspace.$project/workbench-layout-controller.shim.js';
import type { ProjectLayoutHost } from '#runtime/project-runtime.layout.js';
import type { LayoutRecordCommand, WorkbenchLayoutEvent } from '#workbench-records/workbench-layout.machine.js';
import {
  selectArrangement,
  selectIntentOutcome,
  workbenchLayoutMachine,
} from '#workbench-records/workbench-layout.machine.js';
import { selectDockAdapter } from '#workbench-records/workbench-adapter.js';
import type {
  WorkbenchAdapterEditor,
  WorkbenchAdapterPorts,
  WorkbenchDockOperations,
} from '#workbench-records/workbench-adapter.js';

type Tab = Extract<WorkbenchLaneNode, { kind: 'group' }>['tabs'][number];
type EditorEvent = Parameters<WorkbenchAdapterEditor['send']>[0];

const fileTab = (path: string): Tab => ({ kind: 'file', path });
const tabKey = (tab: Tab): string => (tab.kind === 'file' ? `file:${tab.path}` : `${tab.kind}:${JSON.stringify(tab)}`);
const recordOf = (...paths: string[]): WorkbenchLayout => ({
  version: 1,
  lanes: { chat: true, workbench: true },
  viewer: { kind: 'group', tabs: [] },
  workbench: { kind: 'group', tabs: paths.map((path) => fileTab(path)) },
});

const modelPane = { kind: 'pane', adapter: 'workbench', pane: 'model' } as const;

const stops = new Set<() => void>();
afterEach(() => {
  for (const stop of stops) {
    stop();
  }
  stops.clear();
});

/**
 * An editor that processes one event at a time, as an actor's mailbox does: what is sent while it notifies its
 * observers waits until they return. `openFile` for a file it does not hold waits for `materialise`.
 */
function scriptedEditor(initial: readonly string[], options: Readonly<{ opensAtOnce?: boolean }> = {}) {
  let openFiles: OpenFile[] = initial.map((path) => ({ path, paneId: `pane-${path}` }) as unknown as OpenFile);
  let activePaneId = openFiles.at(-1)?.paneId;
  const sent: EditorEvent[] = [];
  const materialising = new Set<string>();
  const listeners = new Set<(state: unknown) => void>();
  const queue: EditorEvent[] = [];
  let processing = false;
  const snapshot = () => ({
    context: {
      openFiles,
      activePaneId,
      fileSidebars: {},
      previousLayout: undefined,
      panelState: { desktopLayout: { workbenchOpen: true, chatOpen: true } },
      pendingOpenFile: materialising.size === 0 ? undefined : { path: [...materialising][0]! },
    },
    // Only the materialising state is read: the adapter and the shim ask for nothing else.
    matches: () => materialising.size > 0,
  });
  const notify = (): void => {
    const current = snapshot();
    for (const listener of listeners) {
      listener(current);
    }
  };
  const step = (event: EditorEvent): void => {
    if (event.type === 'closeFile') {
      const next = openFiles.filter((file) => file.path !== event.path);
      if (next.length === openFiles.length) {
        return;
      }
      openFiles = next;
      activePaneId = openFiles.some((file) => file.paneId === activePaneId) ? activePaneId : openFiles.at(-1)?.paneId;
      notify();
      return;
    }
    if (event.type === 'openFile' && !openFiles.some((file) => file.path === event.path)) {
      if (options.opensAtOnce) {
        openFiles = [...openFiles, { path: event.path, paneId: `pane-${event.path}` } as unknown as OpenFile];
        activePaneId = `pane-${event.path}`;
        notify();
        return;
      }
      materialising.add(event.path);
      notify();
    }
  };
  const run = (work: () => void): void => {
    if (processing) {
      return;
    }
    processing = true;
    try {
      work();
      while (queue.length > 0) {
        step(queue.shift()!);
      }
    } finally {
      processing = false;
    }
  };
  const editor = {
    getSnapshot: snapshot,
    subscribe: (listener: (state: unknown) => void) => {
      listeners.add(listener);
      return { unsubscribe: () => listeners.delete(listener) };
    },
    on: () => ({ unsubscribe: () => undefined }),
    send: (event: EditorEvent) => {
      sent.push(event);
      queue.push(event);
      run(() => undefined);
    },
  };
  return {
    editor,
    sent,
    openPaths: () => openFiles.map((file) => file.path),
    /** The editor finishes opening `path`: one step, whose observers run before anything they send. */
    materialise(path: string) {
      materialising.delete(path);
      run(() => {
        openFiles = [...openFiles, { path, paneId: `pane-${path}` } as unknown as OpenFile];
        activePaneId = `pane-${path}`;
        notify();
      });
    },
  };
}

/** A Dockview with one group: the adapter's operations over it, and the removals it reports. */
function scriptedDock() {
  let tabs: Tab[] = [];
  const removals = new Set<(panel: { id: string; params: unknown }) => void>();
  const remove = (gone: readonly Tab[]): void => {
    for (const tab of gone) {
      for (const listener of removals) {
        listener({ id: tabKey(tab), params: tab.kind === 'file' ? { path: tab.path } : {} });
      }
    }
  };
  const api = {
    get panels() {
      return tabs;
    },
    onDidLayoutChange: () => ({ dispose: () => undefined }),
    onDidActivePanelChange: () => ({ dispose: () => undefined }),
    onDidRemovePanel: (listener: (panel: { id: string; params: unknown }) => void) => {
      removals.add(listener);
      return { dispose: () => removals.delete(listener) };
    },
  } as unknown as DockviewApi;
  const operations: WorkbenchDockOperations = {
    reconcile: ({ openFiles }) => {
      const open = new Set(openFiles.map((file) => file.path));
      const gone = tabs.filter((tab) => tab.kind === 'file' && !open.has(tab.path));
      tabs = tabs.filter((tab) => !gone.includes(tab));
      remove(gone);
      for (const file of openFiles) {
        if (!tabs.some((tab) => tab.kind === 'file' && tab.path === file.path)) {
          tabs = [...tabs, fileTab(file.path)];
        }
      }
      return undefined;
    },
    filePathOf: (panel) => (panel.params as { path?: string }).path,
    // As the route's handler: a removed file panel closes its file, during a restore too.
    panelRemoved: ({ panel, closeFile }) => {
      const { path } = panel.params as { path?: string };
      if (path !== undefined) {
        closeFile(path);
      }
    },
    openPanel: () => undefined,
    isPanelOffered: () => true,
    drop: () => undefined,
    launcherId: () => undefined,
    shownNode: () => ({ kind: 'group', tabs: [...tabs] }),
    // `fromJSON` with reused panels: the node's tabs, and every other panel removed.
    showNode: (_api, node) => {
      const next = node.kind === 'group' ? [...node.tabs] : [];
      const keys = new Set(next.map((tab) => tabKey(tab)));
      const gone = tabs.filter((tab) => !keys.has(tabKey(tab)));
      tabs = next;
      remove(gone);
    },
  };
  return { api, operations, paths: () => tabs.map((tab) => (tab.kind === 'file' ? tab.path : tabKey(tab))) };
}

/** A ready layout over `record`, its shim, and a Dockview that hands its adapter to the layout. */
function hosted(record: WorkbenchLayout, open: readonly string[], options: Readonly<{ opensAtOnce?: boolean }> = {}) {
  let publish: ((event: WorkbenchLayoutEvent) => void) | undefined;
  const layoutRecord = createCallbackLogic<LayoutRecordCommand>(({ sendBack }) => {
    publish = sendBack;
    return () => undefined;
  });
  const layout = createActor(workbenchLayoutMachine.provide({ actors: { layoutRecord } }), {
    input: { device: 'desktop', adapters: ['workbench'], routeKey: 'route-1', workbenchOpen: true },
  });
  layout.start();
  stops.add(() => {
    layout.stop();
  });
  publish!({
    type: 'recordPublished',
    layout: record,
    digest: 'sha256:1',
    origin: 'foreign',
    refusal: undefined,
    owed: false,
  });
  const editor = scriptedEditor(open, options);
  const host = { facts: () => ({ routeKey: 'route-1', device: 'desktop' }) } as unknown as ProjectLayoutHost;
  const shim = createWorkbenchLayoutControllerShim({
    layout,
    editor: editor.editor as unknown as Parameters<typeof createWorkbenchLayoutControllerShim>[0]['editor'],
    host,
  });
  const dock = scriptedDock();
  const ports: WorkbenchAdapterPorts = {
    editor: editor.editor as unknown as WorkbenchAdapterEditor,
    projectId: 'p',
    profile: 'editor',
    isMobile: false,
    controller: shim,
    connectWorkbench: (openPanel, activateFile) =>
      shim.connectIntents({ openPanel, ...(activateFile === undefined ? {} : { activateFile }) }),
    setWorkbenchOpen: () => undefined,
    navigate: () => undefined,
    dock: dock.operations,
    connectBrowser: undefined,
  };
  const mountDock = (): void => {
    // As the Dockview's ref callback: hand the adapter over, then attach it once the layout's step is over.
    layout.send({ type: 'dockReady', adapter: 'workbench', dockId: 'dock-1', api: dock.api, ports });
    selectDockAdapter(layout, 'dock-1')?.send({ type: 'attach' });
  };
  return { layout, editor, dock, mountDock, publish: publish! };
}

describe('workbench adapter hosted by the layout (A8c)', () => {
  // D21 round 1, A1: the adapter starts inside the layout's `dockReady` step, and the layout hears its attach only after
  // that step. A reconcile run at start put every open file on the Dockview first, and the attach's apply then removed
  // the files the arrangement lacks, closing them in the editor. On main the attach applied first and the reconcile
  // then added those files.
  it('should keep an open file the arrangement lacks when a Dockview mounts on a known arrangement', () => {
    const { editor, dock, mountDock } = hosted(recordOf('a.ts'), ['a.ts', 'x.ts']);

    mountDock();

    expect(editor.sent.filter((event) => event.type === 'closeFile')).toEqual([]);
    expect(editor.openPaths()).toEqual(['a.ts', 'x.ts']);
    expect(dock.paths()).toEqual(['a.ts', 'x.ts']);
  });

  // D21 round 2: a record published while no Dockview was attached is offered at attach, and the adapter takes it
  // in a later step of the layout than the attach's seed. The reconciler must still wait for it: run first, it put
  // every open file on the Dockview, and the taken apply then removed and closed the ones the newer record lacks.
  it('should keep an open file the arrangement lacks when the newer record is offered at attach', () => {
    const { editor, dock, mountDock, publish } = hosted(recordOf('a.ts'), ['a.ts', 'x.ts']);
    publish({
      type: 'recordPublished',
      layout: {
        ...recordOf('a.ts'),
        workbench: { kind: 'group', tabs: [fileTab('a.ts'), { kind: 'pane', pane: 'model' }] },
      },
      digest: 'sha256:2',
      origin: 'foreign',
      refusal: undefined,
      owed: false,
    });

    mountDock();

    expect(editor.sent.filter((event) => event.type === 'closeFile')).toEqual([]);
    expect(editor.openPaths()).toEqual(['a.ts', 'x.ts']);
    expect(dock.paths()).toEqual(expect.arrayContaining(['a.ts', 'x.ts']));
  });

  // D21 round 1, A2: a held apply that lands inside the editor's own step drops a panel whose `closeFile` the editor
  // takes only after that step. A file intent the landing releases must not answer from the editor's snapshot before
  // that close, which would put the dropped file back on the Dockview and hand the layout a tab about to go.
  it('should not hand the layout a tab the landing apply dropped when it releases a held file intent', () => {
    const { layout, editor, dock, mountDock } = hosted(recordOf('a.ts'), ['y.ts']);
    mountDock();
    // The apply waits for `a.ts`, and the person's intent for it waits for the apply.
    expect(editor.sent).toContainEqual({ type: 'openFile', path: 'a.ts', source: 'record' });
    layout.send({ type: 'intent', intentId: 'open-a', source: 'person', target: { kind: 'file', path: 'a.ts' } });

    editor.materialise('a.ts');

    expect(editor.openPaths()).toEqual(['a.ts']);
    expect(dock.paths()).toEqual(['a.ts']);
    expect(selectArrangement(layout.getSnapshot())?.workbench).toEqual(recordOf('a.ts').workbench);
  });

  // PR review: an editor that opens a record's file at once (no materialiser) changes before the adapter observes it,
  // so the apply held at attach must land when the adapter starts observing, not at the editor's next change.
  it('should land an apply held at attach whose files opened before the adapter observed the editor', () => {
    const { layout, editor, mountDock } = hosted(recordOf('a.ts'), [], { opensAtOnce: true });

    mountDock();
    // A pane intent waits for the apply in flight: it is applied only once the apply has landed.
    layout.send({ type: 'intent', intentId: 'open-model', source: 'person', target: modelPane });

    expect(editor.openPaths()).toEqual(['a.ts']);
    expect(selectIntentOutcome(layout.getSnapshot(), 'open-model')).toEqual({ outcome: 'applied' });
  });

  // PR review: a record file the editor is materialising already is not asked for again, which would open it twice;
  // the apply lands when that materialisation does.
  it('should not ask again for a record file the editor is materialising already', () => {
    const { editor, dock, mountDock } = hosted(recordOf('a.ts'), []);
    editor.editor.send({ type: 'openFile', path: 'a.ts', source: 'user' });

    mountDock();
    editor.materialise('a.ts');

    expect(editor.sent.filter((event) => event.type === 'openFile')).toEqual([
      { type: 'openFile', path: 'a.ts', source: 'user' },
    ]);
    expect(dock.paths()).toEqual(['a.ts']);
  });
});
