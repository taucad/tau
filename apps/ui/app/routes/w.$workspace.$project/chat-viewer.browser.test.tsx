import '#styles/global.css';
import 'dockview-react/dist/styles/dockview.css';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import type { DockviewApi, DockviewReadyEvent } from 'dockview-react';
import type { Evaluation } from '@taucad/runtime';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { newViewRecord } from '#workbench-records/projection.js';

const state = vi.hoisted(() => ({ records: new Map(), edits: vi.fn() }));
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
  useSelector: () => evaluation,
}));
vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({ geometryUnits: new Map([['main.tsx', actor]]), viewRecords: state.records }),
}));
vi.mock('#workbench-records/view-actions.js', () => ({
  useWorkbenchViewCommands: () => ({ edit: state.edits }),
}));
vi.mock('#routes/w.$workspace.$project/project-workspace-actions.js', () => ({ ProjectWorkspaceActions: () => null }));

const { Dockview } = await import('#components/panes/dockview.js');
const { ViewerRightActions } = await import('#routes/w.$workspace.$project/chat-viewer-dockview.js');

function DockFixture({ width, tabs }: { readonly width: number; readonly tabs: number }): React.JSX.Element {
  const [api, setApi] = useState<DockviewApi>();
  const ready = (event: DockviewReadyEvent): void => {
    setApi(event.api);
    for (let index = 0; index < tabs; index += 1) {
      event.api.addPanel({
        id: `pane-${String(index)}`,
        component: 'viewer',
        title: `main.tsx ${String(index)}`,
        params: { viewId: `pane-${String(index)}`, entryPath: 'main.tsx' },
      });
    }
  };
  return (
    <div data-testid='frame' className='@container/viewer' style={{ width, height: 400 }}>
      <Dockview
        components={{ viewer: () => <div>Viewer content</div> }}
        rightHeaderActionsComponent={ViewerRightActions}
        onReady={ready}
      />
      <output data-testid='panel-count'>{api?.panels.length ?? 0}</output>
    </div>
  );
}

afterEach(() => {
  cleanup();
  state.edits.mockClear();
  state.records.clear();
});

describe('viewer Dockview header in Chromium', () => {
  it('opens another real Dockview panel for the chosen projection', async () => {
    await page.viewport(760, 480);
    render(
      <TooltipProvider>
        <DockFixture width={720} tabs={1} />
      </TooltipProvider>,
    );
    fireEvent.change(await screen.findByRole('combobox', { name: 'Open projection beside' }), {
      target: { value: 'drawing' },
    });
    await vi.waitFor(() => {
      expect(document.querySelectorAll('.dv-tab')).toHaveLength(2);
    });
    expect(state.edits).toHaveBeenCalledOnce();
  });

  it('shows the saved instance and options for the selected projection', async () => {
    state.records.set('pane-0', { ...newViewRecord('main.tsx'), selectedKernelView: 'drawing' });
    await page.viewport(760, 480);
    render(
      <TooltipProvider>
        <DockFixture width={720} tabs={1} />
      </TooltipProvider>,
    );
    expect(await screen.findByRole('combobox', { name: 'Drawing instance' })).toBeVisible();
    expect(screen.getByRole('option', { name: 'Power' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Drawing options' }));
    expect(screen.getByRole('checkbox', { name: 'Labels' })).toBeVisible();
  });

  for (const width of [480, 720, 1024]) {
    for (const tabs of [1, 3, 6]) {
      it(`keeps the projection controls visible at ${String(width)}px with ${String(tabs)} tabs`, async () => {
        await page.viewport(width + 40, 480);
        render(
          <TooltipProvider>
            <DockFixture width={width} tabs={tabs} />
          </TooltipProvider>,
        );
        expect(await screen.findByRole('group', { name: 'Projection controls' })).toBeVisible();
        const frame = screen.getByTestId('frame');
        expect(frame.scrollWidth).toBeLessThanOrEqual(width);
        expect(screen.getByTestId('panel-count')).toHaveTextContent(String(tabs));
        if (width === 480) {
          expect(screen.getByRole('combobox', { name: 'Projection view' })).toBeVisible();
        } else {
          expect(screen.getByRole('group', { name: 'Views' })).toBeVisible();
        }
        if (tabs === 6) {
          const screenshot = await page.screenshot({
            element: frame,
            path: `../../../../../out/tscircuit-closeout/viewer-header-${String(width)}-${String(tabs)}.png`,
          });
          expect(screenshot).toContain(`viewer-header-${String(width)}-${String(tabs)}.png`);
        }
      });
    }
  }
});
