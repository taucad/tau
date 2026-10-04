import '#styles/global.css';
import 'dockview-react/dist/styles/dockview.css';
import { cleanup, render, screen, within } from '@testing-library/react';
import type * as UseGraphics from '#hooks/use-graphics.js';
import { page, userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState, useSyncExternalStore } from 'react';
import type { DockviewApi, DockviewReadyEvent, IDockviewPanelProps } from 'dockview-react';
import type { Evaluation } from '@taucad/runtime';
import type { WorkbenchView } from '@taucad/workbench';
import type { CommandPaletteItem } from '#components/layout/command-palette.js';
import type { cadMachine } from '#machines/cad.machine.js';
import type { ActorRefFrom } from 'xstate';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { newViewRecord } from '#workbench-records/projection.js';

const state = vi.hoisted(() => ({
  records: new Map<string, WorkbenchView>(),
  edits: vi.fn<(viewId: string, change: (current: WorkbenchView | undefined) => WorkbenchView) => void>(),
  paletteItems: [] as CommandPaletteItem[],
  revision: 0,
  listeners: new Set<() => void>(),
  singleView: false,
}));
const evaluation: Evaluation = {
  id: 'browser-evaluation',
  success: true,
  transient: false,
  issues: [],
  exports: [],
  views: [
    { id: 'model', title: 'Model', mimeType: 'model/gltf-binary' },
    {
      id: 'drawing',
      title: 'Drawing',
      mimeType: 'image/svg+xml',
      instances: [{ id: 'sheet:power', title: 'Power' }],
      options: {
        schema: { type: 'object', properties: { labels: { type: 'boolean', title: 'Labels' } } },
        defaults: { labels: false },
      },
    },
    { id: 'pcb', title: 'PCB', mimeType: 'image/svg+xml' },
  ],
};
const actor = { getSnapshot: () => ({ context: { evaluation } }) };

vi.mock('@xstate/react', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useSelector: () => (state.singleView ? { ...evaluation, views: [evaluation.views[0]] } : evaluation),
}));
vi.mock('#hooks/use-project.js', () => ({
  useProject: () => {
    useSyncExternalStore(
      (listener) => {
        state.listeners.add(listener);
        return () => state.listeners.delete(listener);
      },
      () => state.revision,
    );
    return { geometryUnits: new Map([['main.tsx', actor]]), viewRecords: state.records };
  },
}));
// The fixture mounts the picker without the viewer's graphics provider; its options read only the display unit.
vi.mock('#hooks/use-graphics.js', async (importOriginal) => ({
  ...(await importOriginal<typeof UseGraphics>()),
  useGraphicsSelector: (select: (snapshot: unknown) => unknown) =>
    select({ context: { displayUnits: { length: { symbol: 'mm' } } } }),
}));
vi.mock('#workbench-records/view-actions.js', () => ({
  useWorkbenchViewCommands: () => ({ edit: state.edits }),
}));
vi.mock('#routes/w.$workspace.$project/project-workspace-actions.js', () => ({
  ProjectWorkspaceActions: () => <button type='button'>Workspace actions</button>,
}));
vi.mock('#components/layout/command-palette.js', () => ({
  useCommandPaletteItems: (_id: string, factory: () => CommandPaletteItem[]) => {
    state.paletteItems = factory();
  },
}));

const { Dockview } = await import('#components/panes/dockview.js');
const { ViewerRightActions, ViewerProjectionCommandItems } =
  await import('#routes/w.$workspace.$project/chat-viewer-dockview.js');
const { ViewerProjectionPicker } = await import('#routes/w.$workspace.$project/chat-viewer-projection-picker.js');

type Params = { viewId: string; entryPath: string };
function BrowserViewerPane({ params }: IDockviewPanelProps<Params>): React.JSX.Element {
  return (
    <div
      data-testid={`viewer-pane-${params.viewId}`}
      data-viewer-frame
      className='relative size-full overflow-hidden bg-background'
    >
      <div className='absolute top-2 left-2 z-20 flex max-w-[calc(100%-1rem)]'>
        <ViewerProjectionPicker
          viewId={params.viewId}
          entryPath={params.entryPath}
          cadActor={actor as ActorRefFrom<typeof cadMachine>}
        />
      </div>
      <div className='flex size-full items-center justify-center'>Viewer content</div>
    </div>
  );
}

function DockFixture({
  width,
  isSplit = false,
}: {
  readonly width: number;
  readonly isSplit?: boolean;
}): React.JSX.Element {
  const [api, setApi] = useState<DockviewApi>();
  const ready = (event: DockviewReadyEvent): void => {
    setApi(event.api);
    const first = event.api.addPanel({
      id: 'pane-0',
      component: 'viewer',
      title: 'main.tsx',
      params: { viewId: 'pane-0', entryPath: 'main.tsx' },
    });
    if (isSplit) {
      event.api.addPanel({
        id: 'pane-1',
        component: 'viewer',
        title: 'main.tsx',
        params: { viewId: 'pane-1', entryPath: 'main.tsx' },
        position: { direction: 'right', referenceGroup: first.api.group },
      });
    }
  };
  return (
    <div data-testid='frame' className='@container/viewer' style={{ width, height: 400 }}>
      <Dockview
        components={{ viewer: BrowserViewerPane }}
        rightHeaderActionsComponent={ViewerRightActions}
        onReady={ready}
      />
      {api ? (
        <ViewerProjectionCommandItems
          cadActor={actor as ActorRefFrom<typeof cadMachine>}
          viewId='pane-0'
          entryPath='main.tsx'
        />
      ) : null}
      <output data-testid='panel-count'>{api?.panels.length ?? 0}</output>
    </div>
  );
}

afterEach(() => {
  cleanup();
  state.edits.mockClear();
  state.records.clear();
  state.paletteItems = [];
  state.revision = 0;
  state.singleView = false;
});

describe('viewer pane projection picker in Chromium', () => {
  it('keeps the header free of picker controls and gives split panes independent choices', async () => {
    await page.viewport(760, 480);
    render(
      <TooltipProvider>
        <DockFixture width={720} isSplit />
      </TooltipProvider>,
    );
    const first = await screen.findByTestId('viewer-pane-pane-0');
    const second = await screen.findByTestId('viewer-pane-pane-1');
    expect(first.querySelector('button[aria-label^="View:"]')).toBeVisible();
    expect(second.querySelector('button[aria-label^="View:"]')).toBeVisible();
    expect(document.querySelector('.dv-tabs-container button[aria-label^="View:"]')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Workspace actions' })).toHaveLength(2);
    await userEvent.click(first.querySelector('button[aria-label^="View:"]')!);
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Drawing' }));
    expect(state.edits).toHaveBeenCalledWith('pane-0', expect.any(Function));
    expect(state.edits).not.toHaveBeenCalledWith('pane-1', expect.any(Function));
    const selected = state.edits.mock.lastCall?.[1](newViewRecord('main.tsx'));
    state.records.set('pane-0', selected!);
    state.revision += 1;
    for (const listener of state.listeners) {
      listener();
    }
    await vi.waitFor(() => {
      expect(first.querySelector('button[aria-label="View: Drawing"]')).toBeVisible();
      expect(second.querySelector('button[aria-label="View: Model"]')).toBeVisible();
    });
  });

  it('keeps the command palette Show action and offers no Open beside', async () => {
    await page.viewport(760, 480);
    render(
      <TooltipProvider>
        <DockFixture width={720} />
      </TooltipProvider>,
    );
    const labels = state.paletteItems.map((item) => item.label);
    expect(labels).toContain('Show PCB');
    expect(labels.filter((label) => label.includes('beside'))).toEqual([]);
    const first = await screen.findByTestId('viewer-pane-pane-0');
    await userEvent.click(first.querySelector('button[aria-label^="View:"]')!);
    expect(await screen.findByRole('menuitemradio', { name: 'PCB' })).toBeVisible();
    expect(screen.queryByRole('menuitem', { name: /beside/i })).toBeNull();
  });

  it('keeps instance and options reachable in a narrow pane without overflow', async () => {
    state.records.set('pane-0', { ...newViewRecord('main.tsx'), selectedKernelView: 'drawing' });
    await page.viewport(360, 520);
    render(
      <TooltipProvider>
        <DockFixture width={320} />
      </TooltipProvider>,
    );
    const frame = screen.getByTestId('frame');
    const pane = await screen.findByTestId('viewer-pane-pane-0');
    expect(frame.scrollWidth).toBeLessThanOrEqual(320);
    expect(pane.querySelector('button[aria-label="View: Drawing"]')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Drawing instance: Whole view' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Drawing options' }));
    const panel = await screen.findByRole('dialog', { name: 'Drawing options' });
    expect(await within(panel).findByRole('switch')).toBeVisible();
    // The panel opens into the viewer and never past its edges.
    const viewer = (pane.querySelector('[data-viewer-frame]') ?? pane).getBoundingClientRect();
    const bounds = panel.getBoundingClientRect();
    expect(bounds.left).toBeGreaterThanOrEqual(viewer.left);
    expect(bounds.right).toBeLessThanOrEqual(viewer.right);
  });

  it('opens by keyboard and returns focus on Escape', async () => {
    await page.viewport(480, 480);
    render(
      <TooltipProvider>
        <DockFixture width={440} />
      </TooltipProvider>,
    );
    const trigger = await screen.findByRole('button', { name: 'View: Model' });
    trigger.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(await screen.findByRole('menuitemradio', { name: 'PCB' })).toBeVisible();
    await userEvent.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
  });
});
