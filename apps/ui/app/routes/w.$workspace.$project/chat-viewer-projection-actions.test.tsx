// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { workbenchRecords } from '@taucad/workbench';
import type { Evaluation } from '@taucad/runtime';
import type { ActorRefFrom } from 'xstate';
import type { cadMachine } from '#machines/cad.machine.js';
import { setLocalInstanceChoice } from '#workbench-records/local-instance.js';
import { getLiveViewOptions, setLiveViewOptions } from '#workbench-records/live-view-options.js';
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
vi.mock('#hooks/use-graphics.js', () => ({
  useGraphicsSelector: (select: (snapshot: unknown) => unknown) =>
    select({ context: { displayUnits: { length: { symbol: 'mm' } } } }),
}));
vi.mock('#workbench-records/view-actions.js', () => ({
  useWorkbenchViewCommands: () => ({ edit: mockState.edit }),
}));

const { ViewerProjectionPicker, viewOptionsSaveDelay } =
  await import('#routes/w.$workspace.$project/chat-viewer-projection-picker.js');
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
    vi.useRealTimers();
    setLiveViewOptions('pane-1', undefined);
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

    mockState.evaluation = { ...mockState.evaluation, views: [{ ...model, options: drawing.options }] };
    pane.rerender(<ViewerProjectionPicker viewId='pane-1' entryPath='main.tsx' cadActor={cadActor} />);
    expect(screen.queryByRole('button', { name: /^View:/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '3D Model options' })).toBeInTheDocument();

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

  it('persists declared boolean options and stable authored instances', async () => {
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
          options: {
            schema: { type: 'object', properties: { pinNumbers: { type: 'boolean', title: 'Pin numbers' } } },
            defaults: { pinNumbers: false },
          },
        },
      ],
    };
    renderPicker(<ViewerProjectionPicker viewId='pane-1' entryPath='main.tsx' cadActor={cadActor} />);

    fireEvent.click(screen.getByRole('button', { name: 'Drawing options' }));
    const panel = await screen.findByRole('dialog', { name: 'Drawing options' });
    fireEvent.click(await within(panel).findByRole('switch'));
    // The viewer has the change at once; the record is written when the panel closes.
    expect(getLiveViewOptions('pane-1')).toEqual({ viewId: 'drawing', options: { pinNumbers: true } });
    expect(mockState.edit).not.toHaveBeenCalled();
    fireEvent.keyDown(panel, { key: 'Escape' });
    const optionsEdit = mockState.edit.mock.lastCall?.[1] as (
      record: ReturnType<typeof workbenchRecords.view.schema.parse>,
    ) => ReturnType<typeof workbenchRecords.view.schema.parse>;
    expect(optionsEdit(mockState.record).kernelViews).toEqual([{ id: 'drawing', options: { pinNumbers: true } }]);
    await vi.waitFor(() => {
      expect(getLiveViewOptions('pane-1')).toBeUndefined();
    });
    mockState.edit.mockClear();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Drawing instance: Whole view' }), { key: 'ArrowDown' });
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Power' }));
    const instanceEdit = mockState.edit.mock.lastCall?.[1] as (
      record: ReturnType<typeof workbenchRecords.view.schema.parse>,
    ) => ReturnType<typeof workbenchRecords.view.schema.parse>;
    expect(instanceEdit(mockState.record).kernelViews).toEqual([{ id: 'drawing', authoredInstance: 'sheet:Power' }]);
  });

  it('keeps a saved invalid choice visible until the person resets the declared defaults', async () => {
    mockState.edit.mockClear();
    mockState.record = workbenchRecords.view.schema.parse({
      version: 1,
      entryPath: 'main.tsx',
      selectedKernelView: 'drawing',
      kernelViews: [{ id: 'drawing', options: { scale: -1 } }],
    });
    mockState.evaluation = {
      id: 'e4',
      success: true,
      transient: false,
      exports: [],
      issues: [],
      views: [
        model,
        {
          ...drawing,
          options: {
            schema: {
              type: 'object',
              required: ['scale'],
              properties: { scale: { type: 'number', title: 'Scale', minimum: 1 } },
            },
            defaults: { scale: 2 },
          },
        },
      ],
    };
    renderPicker(<ViewerProjectionPicker viewId='pane-1' entryPath='main.tsx' cadActor={cadActor} />);

    fireEvent.click(screen.getByRole('button', { name: 'Drawing options (changed)' }));
    const panel = await screen.findByRole('dialog', { name: 'Drawing options' });
    expect(await within(panel).findByDisplayValue('-1')).toBeInTheDocument();
    expect(mockState.edit).not.toHaveBeenCalled();
    fireEvent.click(within(panel).getByRole('button', { name: 'Reset' }));
    const update = mockState.edit.mock.lastCall?.[1] as (
      record: ReturnType<typeof workbenchRecords.view.schema.parse>,
    ) => ReturnType<typeof workbenchRecords.view.schema.parse>;
    expect(update(mockState.record).kernelViews).toEqual([{ id: 'drawing', options: { scale: 2 } }]);
  });

  it('renders nested view options as form fields, not JSON, and keeps Reset off at the defaults', async () => {
    mockState.edit.mockClear();
    mockState.record = undefined;
    mockState.evaluation = {
      id: 'e4',
      success: true,
      transient: false,
      exports: [],
      issues: [],
      views: [
        {
          ...model,
          options: {
            schema: {
              type: 'object',
              properties: {
                tessellation: {
                  type: 'object',
                  title: 'Tessellation',
                  properties: {
                    linearTolerance: { type: 'number', title: 'Linear tolerance', exclusiveMinimum: 0 },
                    angularTolerance: { type: 'number', title: 'Angular tolerance', exclusiveMinimum: 0 },
                  },
                },
              },
            },
            defaults: { tessellation: { linearTolerance: 0.02, angularTolerance: 20 } },
          },
        },
      ],
    };
    renderPicker(<ViewerProjectionPicker viewId='pane-1' entryPath='main.tsx' cadActor={cadActor} />);
    fireEvent.click(screen.getByRole('button', { name: '3D Model options' }));
    const panel = await screen.findByRole('dialog', { name: '3D Model options' });
    expect(await within(panel).findByRole('spinbutton', { name: 'Input for Linear Tolerance' })).toHaveValue('0.02');
    expect(within(panel).getByRole('spinbutton', { name: 'Input for Angular Tolerance' })).toHaveValue('20');
    expect(within(panel).queryByRole('textbox', { name: /JSON/ })).not.toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Reset' })).toBeDisabled();
  });

  it('re-renders edits through the live draft and saves the record once they rest', async () => {
    mockState.record = undefined;
    mockState.evaluation = {
      id: 'e7',
      success: true,
      transient: false,
      exports: [],
      issues: [],
      views: [
        {
          ...model,
          options: {
            schema: {
              type: 'object',
              properties: { tessellation: { type: 'object', properties: { angularTolerance: { type: 'number' } } } },
            },
            defaults: { tessellation: { angularTolerance: 20 } },
          },
        },
      ],
    };
    renderPicker(<ViewerProjectionPicker viewId='pane-1' entryPath='main.tsx' cadActor={cadActor} />);
    fireEvent.click(screen.getByRole('button', { name: '3D Model options' }));
    const panel = await screen.findByRole('dialog', { name: '3D Model options' });
    const field = await within(panel).findByRole('spinbutton', { name: 'Input for Angular Tolerance' });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    for (const value of ['40', '60']) {
      fireEvent.change(field, { target: { value } });
      fireEvent.keyDown(field, { key: 'Enter' });
    }
    // Each edit is live for the viewer at once; nothing is written yet.
    expect(getLiveViewOptions('pane-1')).toEqual({
      viewId: 'model',
      options: { tessellation: { angularTolerance: 60 } },
    });
    expect(screen.getByRole('button', { name: '3D Model options (changed)' })).toBeInTheDocument();
    vi.advanceTimersByTime(viewOptionsSaveDelay - 1);
    expect(mockState.edit).not.toHaveBeenCalled();

    // Once edits rest, one write carries the latest values, and the draft yields to the record.
    vi.advanceTimersByTime(1);
    expect(mockState.edit).toHaveBeenCalledOnce();
    const update = mockState.edit.mock.lastCall?.[1] as (
      record: undefined,
    ) => ReturnType<typeof workbenchRecords.view.schema.parse>;
    expect(update(undefined).kernelViews).toEqual([
      { id: 'model', options: { tessellation: { angularTolerance: 60 } } },
    ]);
    vi.useRealTimers();
    await vi.waitFor(() => {
      expect(getLiveViewOptions('pane-1')).toBeUndefined();
    });
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
