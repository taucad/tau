// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { workbenchRecords } from '@taucad/workbench';
import type { Evaluation } from '@taucad/runtime';
import type { ActorRefFrom } from 'xstate';
import type { cadMachine } from '#machines/cad.machine.js';
import { setLocalInstanceChoice } from '#workbench-records/local-instance.js';
import { viewTabTitle } from '#workbench-records/projection.js';
import { mock } from 'vitest-mock-extended';
import { TooltipProvider } from '@taucad/ui/components/tooltip';

const mockState = vi.hoisted(() => ({
  evaluation: undefined as Evaluation | undefined,
  record: undefined as ReturnType<typeof workbenchRecords.view.schema.parse> | undefined,
  edit: vi.fn(),
}));

vi.mock('@xstate/react', () => ({ useSelector: () => mockState.evaluation }));
vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({ viewRecords: new Map(mockState.record ? [['pane-1', mockState.record]] : []) }),
}));
vi.mock('#workbench-records/view-actions.js', () => ({
  useWorkbenchViewCommands: () => ({ edit: mockState.edit }),
}));

const { ViewerProjectionPicker } = await import('#routes/w.$workspace.$project/chat-viewer-projection-picker.js');
const { viewerPanelTitle } = await import('#routes/w.$workspace.$project/chat-viewer-dockview.js');
const renderPicker = (ui: React.ReactElement): ReturnType<typeof render> => render(ui, { wrapper: TooltipProvider });
const cadActor = mock<ActorRefFrom<typeof cadMachine>>();
const model = { id: 'model', title: '3D Model', mimeType: 'model/gltf-binary' } as const;
const drawing = {
  id: 'drawing',
  title: 'Drawing',
  mimeType: 'image/svg+xml',
  options: { schema: {}, defaults: { scale: 2 } },
} as const;

describe('viewer pane projection picker', () => {
  afterEach(() => {
    mockState.edit.mockReset();
    mockState.edit.mockResolvedValue(true);
  });

  it('adds an offered projection suffix only for duplicate-file multi-view panels', () => {
    const record = workbenchRecords.view.schema.parse({
      version: 1,
      entryPath: 'main.tsx',
      selectedKernelView: 'drawing',
    });
    const evaluation: Evaluation = {
      id: 'titles',
      success: true,
      transient: false,
      views: [model, drawing],
      exports: [],
      issues: [],
    };
    expect(viewerPanelTitle(record, 1, evaluation)).toBe(viewTabTitle(record));
    expect(viewerPanelTitle(record, 2, evaluation)).toBe(`${viewTabTitle(record)} · Drawing`);
    expect(viewerPanelTitle(record, 2, { ...evaluation, views: [model] })).toBe(viewTabTitle(record));
  });

  it('hides for a single offered view and opens for multiple titled offers', () => {
    mockState.record = undefined;
    mockState.evaluation = { id: 'e1', success: true, transient: false, views: [model], exports: [], issues: [] };
    const pane = renderPicker(<ViewerProjectionPicker viewId='pane-1' entryPath='main.tsx' cadActor={cadActor} />);
    expect(screen.queryByRole('group', { name: 'View controls' })).not.toBeInTheDocument();

    // A view's options are Kernel settings in Viewer settings, so they no longer keep the bar.
    mockState.evaluation = { ...mockState.evaluation, views: [{ ...model, options: drawing.options }] };
    pane.rerender(<ViewerProjectionPicker viewId='pane-1' entryPath='main.tsx' cadActor={cadActor} />);
    expect(screen.queryByRole('group', { name: 'View controls' })).not.toBeInTheDocument();

    mockState.evaluation = { ...mockState.evaluation, views: [model, drawing] };
    pane.rerender(<ViewerProjectionPicker viewId='pane-1' entryPath='main.tsx' cadActor={cadActor} />);
    fireEvent.keyDown(screen.getByRole('button', { name: /^View:/ }), { key: 'ArrowDown' });
    expect(screen.getByRole('menuitemradio', { name: 'Drawing' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitemradio', { name: /Default/ })).not.toBeInTheDocument();
    pane.unmount();
  });

  it('persists the chosen ID and offered defaults without changing the evaluation', () => {
    mockState.record = undefined;
    mockState.edit.mockClear();
    mockState.evaluation = {
      id: 'e2',
      success: true,
      transient: false,
      views: [model, drawing],
      exports: [],
      issues: [],
    };
    renderPicker(<ViewerProjectionPicker viewId='pane-1' entryPath='main.tsx' cadActor={cadActor} />);

    fireEvent.keyDown(screen.getByRole('button', { name: /^View:/ }), { key: 'ArrowDown' });
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Drawing' }));

    expect(mockState.edit).toHaveBeenCalledWith('pane-1', expect.any(Function));
    const update = mockState.edit.mock.lastCall?.[1] as (
      record: undefined,
    ) => ReturnType<typeof workbenchRecords.view.schema.parse>;
    const saved = update(undefined);
    expect(saved.selectedKernelView).toBe('drawing');
    expect(saved.kernelViews).toEqual([{ id: 'drawing', options: { scale: 2 } }]);
  });

  it('offers no Open beside: split view opens another pane', () => {
    mockState.record = undefined;
    mockState.evaluation = {
      id: 'e2',
      success: true,
      transient: false,
      views: [model, drawing],
      exports: [],
      issues: [],
    };
    renderPicker(<ViewerProjectionPicker viewId='pane-1' entryPath='main.tsx' cadActor={cadActor} />);

    fireEvent.keyDown(screen.getByRole('button', { name: /^View:/ }), { key: 'ArrowDown' });
    expect(screen.getByRole('menuitemradio', { name: 'Drawing' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /beside/i })).not.toBeInTheDocument();
  });

  it('shows an unavailable saved ID without retargeting it', () => {
    mockState.record = workbenchRecords.view.schema.parse({
      version: 1,
      entryPath: 'main.tsx',
      selectedKernelView: 'old',
    });
    mockState.evaluation = { id: 'e3', success: true, transient: false, views: [model], exports: [], issues: [] };
    renderPicker(<ViewerProjectionPicker viewId='pane-1' entryPath='main.tsx' cadActor={cadActor} />);

    expect(screen.getByRole('button', { name: 'View: old unavailable' })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('button', { name: /^View:/ }), { key: 'ArrowDown' });
    expect(screen.getByRole('menuitemradio', { name: 'old (unavailable)' })).toBeInTheDocument();
  });

  it('persists stable authored instances', () => {
    mockState.edit.mockClear();
    mockState.record = workbenchRecords.view.schema.parse({
      version: 1,
      entryPath: 'main.tsx',
      selectedKernelView: 'drawing',
    });
    mockState.evaluation = {
      id: 'e4',
      success: true,
      transient: false,
      exports: [],
      issues: [],
      views: [
        {
          ...drawing,
          instances: [{ id: 'sheet:Power', title: 'Power' }],
        },
      ],
    };
    renderPicker(<ViewerProjectionPicker viewId='pane-1' entryPath='main.tsx' cadActor={cadActor} />);

    fireEvent.keyDown(screen.getByRole('button', { name: 'Drawing instance: Whole view' }), { key: 'ArrowDown' });
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Power' }));
    const instanceEdit = mockState.edit.mock.lastCall?.[1] as (
      record: ReturnType<typeof workbenchRecords.view.schema.parse>,
    ) => ReturnType<typeof workbenchRecords.view.schema.parse>;
    expect(instanceEdit(mockState.record).kernelViews).toEqual([{ id: 'drawing', authoredInstance: 'sheet:Power' }]);
  });

  it('keeps a local instance only for its evaluation and marks it expired after a rebuild', () => {
    mockState.edit.mockClear();
    mockState.record = workbenchRecords.view.schema.parse({
      version: 1,
      entryPath: 'main.tsx',
      selectedKernelView: 'drawing',
    });
    mockState.evaluation = {
      id: 'e5',
      success: true,
      transient: false,
      exports: [],
      issues: [],
      views: [{ ...drawing, instances: [{ id: 'local:e5:unnamed', title: 'Unnamed (current evaluation)' }] }],
    };
    const pane = renderPicker(<ViewerProjectionPicker viewId='pane-1' entryPath='main.tsx' cadActor={cadActor} />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Drawing instance: Whole view' }), { key: 'ArrowDown' });
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Unnamed (current evaluation)' }));
    expect(mockState.edit).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Drawing instance: Unnamed (current evaluation)' })).toBeInTheDocument();

    mockState.evaluation = { ...mockState.evaluation, id: 'e6', views: [{ ...drawing, instances: [] }] };
    pane.rerender(<ViewerProjectionPicker viewId='pane-1' entryPath='main.tsx' cadActor={cadActor} />);
    const trigger = screen.getByRole('button', { name: 'Drawing instance: local:e5:unnamed (expired)' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(screen.getByRole('menuitemradio', { name: 'local:e5:unnamed (expired)' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    pane.unmount();
    setLocalInstanceChoice('pane-1', undefined);
  });
});
