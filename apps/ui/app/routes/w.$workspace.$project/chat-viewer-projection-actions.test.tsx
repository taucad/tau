// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { workbenchRecords } from '@taucad/workbench';
import type { Evaluation } from '@taucad/runtime';
import type { ActorRefFrom } from 'xstate';
import type { cadMachine } from '#machines/cad.machine.js';
import { setLocalInstanceChoice } from '#workbench-records/local-instance.js';
import { viewTabTitle } from '#workbench-records/projection.js';
import { mock } from 'vitest-mock-extended';

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

const { ViewerProjectionPicker, viewerPanelTitle } =
  await import('#routes/w.$workspace.$project/chat-viewer-dockview.js');
const cadActor = mock<ActorRefFrom<typeof cadMachine>>();
const model = { id: 'model', title: '3D Model', mimeType: 'model/gltf-binary' } as const;
const drawing = {
  id: 'drawing',
  title: 'Drawing',
  mimeType: 'image/svg+xml',
  options: { schema: {}, defaults: { scale: 2 } },
} as const;

describe('viewer header projection picker', () => {
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
    const pane = render(<ViewerProjectionPicker viewId='pane-1' entryPath='main.tsx' cadActor={cadActor} />);
    expect(screen.queryByRole('combobox', { name: 'Projection view' })).not.toBeInTheDocument();

    mockState.evaluation = { ...mockState.evaluation, views: [model, drawing] };
    pane.rerender(<ViewerProjectionPicker viewId='pane-1' entryPath='main.tsx' cadActor={cadActor} />);
    expect(screen.getByRole('option', { name: 'Drawing' })).toBeInTheDocument();
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
    render(<ViewerProjectionPicker viewId='pane-1' entryPath='main.tsx' cadActor={cadActor} />);

    fireEvent.change(screen.getByRole('combobox', { name: 'Projection view' }), { target: { value: 'drawing' } });

    expect(mockState.edit).toHaveBeenCalledWith('pane-1', expect.any(Function));
    const update = mockState.edit.mock.lastCall?.[1] as (
      record: undefined,
    ) => ReturnType<typeof workbenchRecords.view.schema.parse>;
    const saved = update(undefined);
    expect(saved.selectedKernelView).toBe('drawing');
    expect(saved.kernelViews).toEqual([{ id: 'drawing', options: { scale: 2 } }]);
  });

  it('offers each build projection as a distinct pane action', () => {
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
    const openBeside = vi.fn();
    render(
      <ViewerProjectionPicker viewId='pane-1' entryPath='main.tsx' cadActor={cadActor} onOpenBeside={openBeside} />,
    );

    fireEvent.change(screen.getByRole('combobox', { name: 'Open projection beside' }), {
      target: { value: 'drawing' },
    });
    expect(openBeside).toHaveBeenCalledExactlyOnceWith('drawing');
    expect(mockState.edit).not.toHaveBeenCalled();
  });

  it('shows an unavailable saved ID without retargeting it', () => {
    mockState.record = workbenchRecords.view.schema.parse({
      version: 1,
      entryPath: 'main.tsx',
      selectedKernelView: 'old',
    });
    mockState.evaluation = { id: 'e3', success: true, transient: false, views: [model], exports: [], issues: [] };
    render(<ViewerProjectionPicker viewId='pane-1' entryPath='main.tsx' cadActor={cadActor} />);

    expect(screen.getByRole('combobox', { name: 'Projection view' })).toHaveValue('old');
    expect(screen.getByRole('combobox', { name: 'Projection view' })).not.toHaveClass('@min-[520px]/viewer:hidden');
    expect(screen.getByRole('option', { name: 'old (unavailable)' })).toBeInTheDocument();
  });

  it('persists declared boolean options and stable authored instances', () => {
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
    render(<ViewerProjectionPicker viewId='pane-1' entryPath='main.tsx' cadActor={cadActor} />);

    fireEvent.change(screen.getByRole('combobox', { name: 'Drawing instance' }), { target: { value: 'sheet:Power' } });
    const instanceEdit = mockState.edit.mock.lastCall?.[1] as (
      record: ReturnType<typeof workbenchRecords.view.schema.parse>,
    ) => ReturnType<typeof workbenchRecords.view.schema.parse>;
    expect(instanceEdit(mockState.record).kernelViews).toEqual([{ id: 'drawing', authoredInstance: 'sheet:Power' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Drawing options' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Pin numbers' }));
    const optionsEdit = mockState.edit.mock.lastCall?.[1] as (
      record: ReturnType<typeof workbenchRecords.view.schema.parse>,
    ) => ReturnType<typeof workbenchRecords.view.schema.parse>;
    expect(optionsEdit(mockState.record).kernelViews).toEqual([{ id: 'drawing', options: { pinNumbers: true } }]);
  });

  it('keeps a saved invalid choice visible until the person restores declared defaults', () => {
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
    render(<ViewerProjectionPicker viewId='pane-1' entryPath='main.tsx' cadActor={cadActor} />);

    fireEvent.click(screen.getByRole('button', { name: 'Drawing options' }));
    expect(screen.getByRole('spinbutton', { name: 'Scale' })).toHaveValue(-1);
    expect(mockState.edit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Restore view defaults' }));
    const update = mockState.edit.mock.lastCall?.[1] as (
      record: ReturnType<typeof workbenchRecords.view.schema.parse>,
    ) => ReturnType<typeof workbenchRecords.view.schema.parse>;
    expect(update(mockState.record).kernelViews).toEqual([{ id: 'drawing', options: { scale: 2 } }]);
  });

  it('edits nested view options as JSON values and retains the saved value on invalid JSON', () => {
    mockState.edit.mockClear();
    mockState.record = workbenchRecords.view.schema.parse({
      version: 1,
      entryPath: 'main.tsx',
      selectedKernelView: 'drawing',
      kernelViews: [{ id: 'drawing', options: { tessellation: { tolerance: 0.1 } } }],
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
            schema: { type: 'object', properties: { tessellation: { type: 'object', title: 'Tessellation' } } },
            defaults: { tessellation: { tolerance: 0.1 } },
          },
        },
      ],
    };
    render(<ViewerProjectionPicker viewId='pane-1' entryPath='main.tsx' cadActor={cadActor} />);
    fireEvent.click(screen.getByRole('button', { name: 'Drawing options' }));
    const field = screen.getByRole('textbox', { name: 'Tessellation (JSON)' });
    fireEvent.change(field, { target: { value: '{broken' } });
    fireEvent.blur(field);
    expect(screen.getByRole('alert')).toHaveTextContent('Tessellation must be valid JSON');
    expect(mockState.edit).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: '{"tolerance":0.2}' } });
    fireEvent.blur(field);
    const update = mockState.edit.mock.lastCall?.[1] as (
      record: ReturnType<typeof workbenchRecords.view.schema.parse>,
    ) => ReturnType<typeof workbenchRecords.view.schema.parse>;
    expect(update(mockState.record).kernelViews).toEqual([
      { id: 'drawing', options: { tessellation: { tolerance: 0.2 } } },
    ]);
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
    const pane = render(<ViewerProjectionPicker viewId='pane-1' entryPath='main.tsx' cadActor={cadActor} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Drawing instance' }), {
      target: { value: 'local:e5:unnamed' },
    });
    expect(mockState.edit).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox', { name: 'Drawing instance' })).toHaveValue('local:e5:unnamed');

    mockState.evaluation = { ...mockState.evaluation, id: 'e6', views: [{ ...drawing, instances: [] }] };
    pane.rerender(<ViewerProjectionPicker viewId='pane-1' entryPath='main.tsx' cadActor={cadActor} />);
    expect(screen.getByRole('option', { name: 'local:e5:unnamed (expired)' })).toBeInTheDocument();
    pane.unmount();
    setLocalInstanceChoice('pane-1', undefined);
  });
});
