// @vitest-environment jsdom
/**
 * A8d: the viewer adapter over a real layout actor (with a scripted record child), the page's controller shim and a
 * real Dockview. The phone rows are the M2 diagnosis: the phone's viewer is shown the record's arrangement only once
 * the record is read, so until then its dock is empty (`project-open-order.test.tsx` pins what it shows meanwhile).
 */
import { act, render } from '@testing-library/react';
import { DockviewReact } from 'dockview-react';
import type { DockviewApi } from 'dockview-react';
import type { ViewerNode, WorkbenchLayout, WorkbenchView } from '@taucad/workbench';
import { workbenchRecords } from '@taucad/workbench';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createActor, createCallbackLogic } from 'xstate';
import type { Actor } from 'xstate';
import { newViewRecord } from '@taucad/workbench-panes/records/view-record';
import {
  selectAppliedLayoutDigest,
  selectIntentOutcome,
  workbenchLayoutMachine,
} from '#workbench-records/workbench-layout.machine.js';
import type {
  LayoutDigest,
  LayoutRecordCommand,
  WorkbenchLayoutDevice,
  WorkbenchLayoutEvent,
  WorkbenchLayoutMachine,
} from '#workbench-records/workbench-layout.machine.js';
import { createWorkbenchLayoutControllerShim } from '#routes/w.$workspace.$project/workbench-layout-controller.shim.js';
import type { ProjectLayoutHost } from '#runtime/project-runtime.layout.js';
import type { RecordRefusal } from '#workbench-records/record-sync-policy.js';
import {
  createViewerAdapterFactsPort,
  createViewerAdapterLogic,
  isViewerPanelParameters,
  selectViewerDockAdapter,
} from '#workbench-records/viewer-adapter.js';
import type { ViewerAdapterFacts, ViewerAdapterInput } from '#workbench-records/viewer-adapter.js';

const group = (...views: string[]): ViewerNode => ({
  kind: 'group',
  tabs: views.map((view) => ({ kind: 'view', view })),
});
const layoutOf = (viewer: ViewerNode): WorkbenchLayout => ({
  version: 1,
  lanes: { chat: true, workbench: true },
  viewer,
  workbench: { kind: 'group', tabs: [{ kind: 'pane', pane: 'parameters' }] },
});
const digestOf = (layout: WorkbenchLayout): LayoutDigest =>
  `sha256:${workbenchRecords.layout.serialize(layout).length.toString(16)}-${JSON.stringify(layout.viewer).length.toString(16)}`;

const stops: Array<() => void> = [];
afterEach(() => {
  for (const stop of stops.splice(0)) {
    stop();
  }
});

/** A Dockview in the document, its api read from `onReady`. */
function mountDock(): DockviewApi {
  let api: DockviewApi | undefined;
  const rendered = render(
    <DockviewReact
      components={{ viewer: () => <div>Model</div> }}
      onReady={(event) => {
        api = event.api;
      }}
    />,
  );
  stops.push(() => {
    rendered.unmount();
  });
  api!.layout(900, 600);
  return api!;
}

/** The layout actor with a scripted record child, as the runtime spawns it for `device`. */
function mountLayout(device: WorkbenchLayoutDevice) {
  const record = { send: undefined as ((event: WorkbenchLayoutEvent) => void) | undefined };
  const commands: LayoutRecordCommand[] = [];
  const layoutRecord = createCallbackLogic<LayoutRecordCommand>(({ sendBack, receive }) => {
    record.send = sendBack;
    receive((command) => {
      commands.push(command);
    });
  });
  const layout: Actor<WorkbenchLayoutMachine> = createActor(
    workbenchLayoutMachine.provide({ actors: { layoutRecord } }),
    {
      input: { device, adapters: ['workbench', 'viewer'], routeKey: 'route-1', workbenchOpen: true },
    },
  );
  layout.start();
  stops.push(() => {
    layout.stop();
  });
  const editor = {
    getSnapshot: () => ({
      context: {
        previousLayout: undefined,
        openFiles: [],
        panelState: { desktopLayout: { workbenchOpen: true, chatOpen: true } },
      },
    }),
    subscribe: () => ({ unsubscribe: () => undefined }),
  };
  const host = { facts: () => ({ routeKey: 'route-1', device }) } as unknown as ProjectLayoutHost;
  const controller = createWorkbenchLayoutControllerShim({
    layout,
    editor: editor as unknown as Parameters<typeof createWorkbenchLayoutControllerShim>[0]['editor'],
    host,
  });
  const received: WorkbenchLayoutEvent[] = [];
  const unsubscribe = layout.subscribe({});
  stops.push(() => {
    unsubscribe.unsubscribe();
  });
  return {
    layout,
    controller,
    commands,
    received,
    publish(viewer: ViewerNode, refusal?: RecordRefusal) {
      const next = layoutOf(viewer);
      record.send!({
        type: 'recordPublished',
        layout: next,
        digest: digestOf(next),
        origin: 'foreign',
        refusal,
        owed: false,
      });
    },
  };
}

/** The project the adapter sends demand to and hears viewer requests from. */
function mountProject() {
  const sent: Array<{ type: string; viewId?: string; entryPath?: string }> = [];
  const requests = new Set<(event: { entryPath: string }) => void>();
  const project = {
    send: (event: { type: string; viewId?: string; entryPath?: string }) => {
      sent.push(event);
    },
    on: (_type: 'viewerFileRequested', handler: (event: { entryPath: string }) => void) => {
      requests.add(handler);
      return {
        unsubscribe: () => {
          requests.delete(handler);
        },
      };
    },
  } as unknown as ViewerAdapterInput['ports']['project'];
  return {
    project,
    sent,
    request(entryPath: string) {
      for (const handler of requests) {
        handler({ entryPath });
      }
    },
  };
}

function baseFacts(overrides: Partial<ViewerAdapterFacts> = {}): ViewerAdapterFacts {
  return {
    admitsDemand: false,
    mainEntryPath: 'main.ts',
    viewRecords: new Map<string, WorkbenchView>(),
    entriesRecord: undefined,
    geometryUnits: new Map(),
    viewCommands: { edit: vi.fn(async () => true), remove: vi.fn(async () => true) },
    setViewEntryPath: vi.fn(),
    createViewRecord: vi.fn(),
    ...overrides,
  };
}

function startAdapter(input: ViewerAdapterInput) {
  const adapter = createActor(createViewerAdapterLogic(), { input });
  adapter.start();
  // The dock attaches its adapter once the host's step that spawned it has returned (A8c's handover).
  adapter.send({ type: 'attach' });
  stops.unshift(() => {
    adapter.stop();
  });
  return adapter;
}

const viewIds = (api: DockviewApi): string[] => api.panels.map((panel) => panel.id).sort();

describe('viewer adapter (A8d)', () => {
  it('M2 diagnosis: should show the phone viewer nothing until the record is read, then the record arranges it', async () => {
    const harness = mountLayout('phone');
    const api = mountDock();
    const project = mountProject();
    const facts = createViewerAdapterFactsPort(baseFacts());
    await act(async () => {
      startAdapter({
        api,
        ports: { profile: 'editor', projectId: 'p', project: project.project, layout: harness.controller, facts },
      });
    });
    expect(harness.layout.getSnapshot().value).toMatchObject({ viewer: 'attached', workbench: 'detached' });
    // The record has not been read: the phone's viewer dock is empty, so Dockview shows its watermark (M2).
    expect(viewIds(api)).toEqual([]);
    expect(harness.controller.ready()).toBe(false);

    await act(async () => {
      harness.publish(group('front', 'iso'));
    });
    expect(viewIds(api)).toEqual(['front', 'iso']);
    expect(harness.controller.ready()).toBe(true);
    // The phone's workbench is attached only while its editor tab shows: until then nothing is acknowledged (rule 4).
    expect(selectAppliedLayoutDigest(harness.layout.getSnapshot())).toBeUndefined();
  });

  it("should not report an apply as the person's edit, and report the person's rearrangement once", async () => {
    const harness = mountLayout('desktop');
    const api = mountDock();
    const project = mountProject();
    const personViewerChanged = vi.spyOn(harness.controller, 'personViewerChanged');
    const facts = createViewerAdapterFactsPort(baseFacts());
    await act(async () => {
      startAdapter({
        api,
        ports: { profile: 'editor', projectId: 'p', project: project.project, layout: harness.controller, facts },
      });
      harness.publish(group('front'));
    });
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });
    expect(personViewerChanged).not.toHaveBeenCalled();

    await act(async () => {
      api.addPanel({ id: 'iso', component: 'viewer', title: 'iso', params: { viewId: 'iso', entryPath: 'main.ts' } });
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });
    expect(personViewerChanged).toHaveBeenCalledTimes(1);
  });

  it('should open a requested file through a viewer intent and settle it applied, with no edit of its own', async () => {
    const harness = mountLayout('desktop');
    const api = mountDock();
    const project = mountProject();
    const personViewerChanged = vi.spyOn(harness.controller, 'personViewerChanged');
    const createViewRecord = vi.fn();
    const facts = createViewerAdapterFactsPort(baseFacts({ createViewRecord }));
    await act(async () => {
      startAdapter({
        api,
        ports: { profile: 'editor', projectId: 'p', project: project.project, layout: harness.controller, facts },
      });
      harness.publish(group('front'));
    });
    const intentsBefore = Object.keys(harness.layout.getSnapshot().context.intents).length;
    await act(async () => {
      project.request('parts/bracket.ts');
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });
    const opened = api.panels.find(
      (panel) => isViewerPanelParameters(panel.params) && panel.params.entryPath === 'parts/bracket.ts',
    );
    expect(opened).toBeDefined();
    expect(createViewRecord).toHaveBeenCalledWith(opened!.id, 'parts/bracket.ts', undefined);
    const { intents, outcomes } = harness.layout.getSnapshot().context;
    const intentId = [...Object.keys(intents), ...Object.keys(outcomes)].find((id) => id.startsWith('person-'));
    expect(intentsBefore).toBe(0);
    expect(intentId).toBeDefined();
    expect(selectIntentOutcome(harness.layout.getSnapshot(), intentId!)).toEqual({ outcome: 'applied' });
    expect(personViewerChanged).not.toHaveBeenCalled();

    // A second request for the same file activates its viewer instead of opening another.
    await act(async () => {
      project.request('parts/bracket.ts');
    });
    expect(
      api.panels.filter((panel) => (panel.params as { entryPath?: string }).entryPath === 'parts/bracket.ts'),
    ).toHaveLength(1);
  });

  // A8d review round 1: a refused record shows only what is on disk, but a requested file still opens its viewer, as
  // it did before the request became an intent; the open is not an edit of the refused record.
  it('should open a requested file on a refused record, with no edit of its own', async () => {
    const harness = mountLayout('desktop');
    const api = mountDock();
    const project = mountProject();
    const personViewerChanged = vi.spyOn(harness.controller, 'personViewerChanged');
    const facts = createViewerAdapterFactsPort(baseFacts());
    await act(async () => {
      startAdapter({
        api,
        ports: { profile: 'editor', projectId: 'p', project: project.project, layout: harness.controller, facts },
      });
      harness.publish(group('front'), { code: 'NEWER_RECORD', message: 'newer' });
    });
    await act(async () => {
      project.request('parts/bracket.ts');
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });
    expect(
      api.panels.filter((panel) => (panel.params as { entryPath?: string }).entryPath === 'parts/bracket.ts'),
    ).toHaveLength(1);
    expect(personViewerChanged).not.toHaveBeenCalled();
  });

  // A8d review round 1: a request made while a non-viewer tab (the launcher) is active starts its view from defaults,
  // as the dock's other creation paths do, not from the last active viewer's record.
  it('should start a requested view from defaults while a non-viewer tab is active', async () => {
    const api = mountDock();
    const project = mountProject();
    const front = newViewRecord('main.ts');
    const createViewRecord = vi.fn();
    const facts = createViewerAdapterFactsPort(
      baseFacts({ viewRecords: new Map([['front', front]]), createViewRecord }),
    );
    await act(async () => {
      startAdapter({
        api,
        ports: { profile: 'shared', projectId: 'p', project: project.project, layout: undefined, facts },
      });
      api.addPanel({
        id: 'front',
        component: 'viewer',
        title: 'front',
        params: { viewId: 'front', entryPath: 'main.ts' },
      });
      api.addPanel({ id: 'launcher', component: 'viewer', title: 'New tab', params: { mode: 'launcher' } });
    });
    expect(api.activePanel?.id).toBe('launcher');
    await act(async () => {
      project.request('b.ts');
    });
    const opened = api.panels.find(
      (panel) => isViewerPanelParameters(panel.params) && panel.params.entryPath === 'b.ts',
    );
    expect(opened).toBeDefined();
    expect(createViewRecord).toHaveBeenCalledWith(opened!.id, 'b.ts', undefined);
  });

  // A8d review round 2: a dock that mounts after the record was read is handed over through the layout's `dockReady`
  // and attached once that step returns, so the record's arrangement lands first and its hidden tabs are bound too.
  it('should bind hidden tabs a record shows at attach, and activate one when its file is requested', async () => {
    const harness = mountLayout('desktop');
    await act(async () => {
      harness.publish(group('view-a', 'view-b'));
    });
    const api = mountDock();
    const project = mountProject();
    const createViewRecord = vi.fn();
    const facts = createViewerAdapterFactsPort(
      baseFacts({
        admitsDemand: true,
        viewRecords: new Map([
          ['view-a', newViewRecord('a.ts')],
          ['view-b', newViewRecord('b.ts')],
        ]),
        createViewRecord,
      }),
    );
    const dockId = 'dock-1';
    await act(async () => {
      harness.layout.send({
        type: 'dockReady',
        adapter: 'viewer',
        dockId,
        api,
        ports: { profile: 'editor', projectId: 'p', project: project.project, layout: harness.controller, facts },
      });
      selectViewerDockAdapter(harness.layout, dockId)?.send({ type: 'attach' });
    });
    const viewA = api.panels.find((panel) => panel.id === 'view-a');
    expect(viewA?.params).toMatchObject({ viewId: 'view-a', entryPath: 'a.ts' });
    expect(viewA?.title).toBe('a.ts');

    await act(async () => {
      project.request('a.ts');
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });
    expect(viewIds(api)).toEqual(['view-a', 'view-b']);
    expect(api.activePanel?.id).toBe('view-a');
    expect(createViewRecord).not.toHaveBeenCalled();
  });

  // A8d review round 4: the dock keeps a group to drop into once its last viewer goes, restored with no timer (I15).
  it('should give the dock a group back once its last viewer is removed', async () => {
    const api = mountDock();
    const project = mountProject();
    const facts = createViewerAdapterFactsPort(baseFacts());
    await act(async () => {
      startAdapter({
        api,
        ports: { profile: 'shared', projectId: 'p', project: project.project, layout: undefined, facts },
      });
      api.addPanel({
        id: 'front',
        component: 'viewer',
        title: 'front',
        params: { viewId: 'front', entryPath: 'main.ts' },
      });
    });
    await act(async () => {
      api.getPanel('front')!.api.close();
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });
    expect(api.panels).toHaveLength(0);
    expect(api.groups).toHaveLength(1);
  });

  it('should open a requested file at once on a page without a layout', async () => {
    const api = mountDock();
    const project = mountProject();
    const facts = createViewerAdapterFactsPort(baseFacts());
    await act(async () => {
      startAdapter({
        api,
        ports: { profile: 'shared', projectId: 'p', project: project.project, layout: undefined, facts },
      });
    });
    await act(async () => {
      project.request('main.ts');
    });
    expect(api.panels.map((panel) => (panel.params as { entryPath?: string }).entryPath)).toEqual(['main.ts']);
  });

  it('should admit demand only once the model may be shown, and give it up when a panel goes and when the dock goes', async () => {
    const api = mountDock();
    const project = mountProject();
    const records = new Map([['front', newViewRecord('main.ts')]]);
    const facts = createViewerAdapterFactsPort(baseFacts({ viewRecords: records }));
    const adapter = await act(async () => {
      api.addPanel({
        id: 'front',
        component: 'viewer',
        title: 'front',
        params: { viewId: 'front', entryPath: undefined },
      });
      return startAdapter({
        api,
        ports: { profile: 'editor', projectId: 'p', project: project.project, layout: undefined, facts },
      });
    });
    expect(project.sent).toEqual([]);

    await act(async () => {
      facts.set({ ...facts.get(), admitsDemand: true });
    });
    expect(project.sent.map((event) => [event.type, event.viewId ?? event.entryPath, event.entryPath])).toEqual([
      ['createViewGraphics', 'front', undefined],
      ['createGeometryUnit', 'main.ts', 'main.ts'],
      ['setViewerGeometryDemand', 'front', 'main.ts'],
    ]);

    // The same facts again admit nothing twice.
    project.sent.length = 0;
    await act(async () => {
      facts.set({ ...facts.get() });
    });
    expect(project.sent).toEqual([]);

    await act(async () => {
      api.addPanel({ id: 'iso', component: 'viewer', title: 'iso', params: { viewId: 'iso', entryPath: 'main.ts' } });
    });
    project.sent.length = 0;
    await act(async () => {
      api.getPanel('iso')!.api.close();
    });
    expect(project.sent).toContainEqual({ type: 'destroyViewGraphics', viewId: 'iso' });
    expect(project.sent).toContainEqual({ type: 'setViewerGeometryDemand', viewId: 'iso' });
    expect(facts.get().viewCommands.remove).toHaveBeenCalledWith('iso');

    project.sent.length = 0;
    await act(async () => {
      adapter.stop();
    });
    expect(project.sent).toEqual([{ type: 'setViewerGeometryDemand', viewId: 'front' }]);
  });

  it('should delete the record of a view an apply removes once, not again as a person removal', async () => {
    const harness = mountLayout('desktop');
    const api = mountDock();
    const project = mountProject();
    const facts = createViewerAdapterFactsPort(baseFacts());
    await act(async () => {
      startAdapter({
        api,
        ports: { profile: 'editor', projectId: 'p', project: project.project, layout: harness.controller, facts },
      });
      harness.publish(group('front', 'iso'));
    });
    await act(async () => {
      harness.publish(group('front'));
    });
    expect(viewIds(api)).toEqual(['front']);
    expect(facts.get().viewCommands.remove).toHaveBeenCalledTimes(1);
    expect(facts.get().viewCommands.remove).toHaveBeenCalledWith('iso');
  });
});
