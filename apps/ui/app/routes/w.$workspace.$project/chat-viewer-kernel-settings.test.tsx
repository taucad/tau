// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { workbenchRecords } from '@taucad/workbench';
import type { Evaluation } from '@taucad/runtime';
import type { ActorRefFrom } from 'xstate';
import { mock } from 'vitest-mock-extended';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@taucad/ui/components/dropdown-menu';
import type { cadMachine } from '#machines/cad.machine.js';
import { getLiveViewOptions, setLiveViewOptions } from '#workbench-records/live-view-options.js';

type ViewRecord = ReturnType<typeof workbenchRecords.view.schema.parse>;

const mockState = vi.hoisted(() => ({
  evaluation: undefined as Evaluation | undefined,
  record: undefined as ViewRecord | undefined,
  edit: vi.fn(),
}));

vi.mock('@xstate/react', () => ({ useSelector: () => mockState.evaluation }));
vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({ viewRecords: new Map(mockState.record ? [['pane-1', mockState.record]] : []) }),
}));
vi.mock('#workbench-records/view-actions.js', () => ({
  useWorkbenchViewCommands: () => ({ edit: mockState.edit }),
}));

const { ViewerKernelSettings, viewOptionsSaveDelay } =
  await import('#routes/w.$workspace.$project/chat-viewer-kernel-settings.js');

type ViewOffer = Extract<Evaluation, { success: true }>['views'][number];

/** The unit annotation `quantity()` adds, which JSON Schema's own type does not declare. */
const unit = (symbol: string): Record<string, unknown> => ({ 'x-tau-unit': symbol });

/** The JSON Schema the runtime derives from `occtRenderOptionSchema`. */
const tessellation: NonNullable<ViewOffer['options']> = {
  schema: {
    type: 'object',
    properties: {
      tessellation: {
        type: 'object',
        default: { linearTolerance: 0.02, angularTolerance: 20 },
        properties: {
          linearTolerance: { type: 'number', default: 0.02, exclusiveMinimum: 0, ...unit('mm') },
          angularTolerance: { type: 'number', default: 20, exclusiveMinimum: 0, ...unit('deg') },
        },
      },
    },
  },
  defaults: { tessellation: { linearTolerance: 0.02, angularTolerance: 20 } },
};
const model: ViewOffer = { id: 'model', title: 'Model', mimeType: 'model/gltf-binary', options: tessellation };
const cadActor = mock<ActorRefFrom<typeof cadMachine>>();

const offer = (views: readonly ViewOffer[]): void => {
  mockState.evaluation = { id: 'e1', success: true, transient: false, views, exports: [], issues: [] };
};

/** The settings inside an open viewer settings menu; `isOpen` false unmounts them as closing the menu does. */
const SettingsMenu = ({ isOpen = true }: { readonly isOpen?: boolean }): React.JSX.Element => (
  <DropdownMenu open={isOpen}>
    <DropdownMenuTrigger>Viewer settings</DropdownMenuTrigger>
    <DropdownMenuContent>
      <ViewerKernelSettings viewId='pane-1' entryPath='main.ts' cadActor={cadActor} />
    </DropdownMenuContent>
  </DropdownMenu>
);

const savedRecord = (): ViewRecord => {
  const edit = mockState.edit.mock.lastCall?.[1] as (record: ViewRecord | undefined) => ViewRecord;
  return edit(mockState.record);
};

describe('viewer kernel settings', () => {
  afterEach(() => {
    vi.useRealTimers();
    setLiveViewOptions('pane-1', undefined);
    mockState.record = undefined;
    mockState.edit.mockReset();
    mockState.edit.mockResolvedValue(true);
  });

  it('offers no Kernel settings for a view without options', () => {
    offer([{ id: 'model', title: 'Model', mimeType: 'model/gltf-binary' }]);
    render(<SettingsMenu />);
    expect(screen.queryByRole('menuitem', { name: /Kernel settings/ })).not.toBeInTheDocument();
  });

  it('starts closed and shows the view options as slider rows once opened', () => {
    offer([model]);
    render(<SettingsMenu />);
    const disclosure = screen.getByRole('menuitem', { name: /Kernel settings/ });
    expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    expect(disclosure).toHaveTextContent('Using kernel defaults');
    expect(screen.queryByRole('menuitem', { name: /Linear tolerance/ })).not.toBeInTheDocument();

    fireEvent.click(disclosure);

    expect(disclosure).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('group', { name: 'Tessellation' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Linear tolerance, 0.02mm' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Angular tolerance, 20°' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Reset to defaults' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('re-renders each step through the live draft and saves the whole options once edits rest', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    offer([model]);
    render(<SettingsMenu />);
    fireEvent.click(screen.getByRole('menuitem', { name: /Kernel settings/ }));

    fireEvent.keyDown(screen.getByRole('menuitem', { name: /^Angular tolerance/ }), { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByRole('menuitem', { name: /^Angular tolerance/ }), { key: 'ArrowRight' });

    // The viewer has every step at once; the record waits for the edits to rest.
    expect(getLiveViewOptions('pane-1')).toEqual({
      viewId: 'model',
      options: { tessellation: { linearTolerance: 0.02, angularTolerance: 22 } },
    });
    expect(screen.getByRole('menuitem', { name: /Kernel settings/ })).toHaveTextContent('1 changed from its default');
    act(() => {
      vi.advanceTimersByTime(viewOptionsSaveDelay - 1);
    });
    expect(mockState.edit).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(mockState.edit).toHaveBeenCalledTimes(1);
    expect(savedRecord().kernelViews).toEqual([
      { id: 'model', options: { tessellation: { linearTolerance: 0.02, angularTolerance: 22 } } },
    ]);
    vi.useRealTimers();
    await vi.waitFor(() => {
      expect(getLiveViewOptions('pane-1')).toBeUndefined();
    });
  });

  it('writes a resting edit when the menu closes', () => {
    offer([model]);
    const menu = render(<SettingsMenu />);
    fireEvent.click(screen.getByRole('menuitem', { name: /Kernel settings/ }));
    fireEvent.keyDown(screen.getByRole('menuitem', { name: /^Linear tolerance/ }), { key: 'ArrowLeft' });
    expect(mockState.edit).not.toHaveBeenCalled();

    menu.rerender(<SettingsMenu isOpen={false} />);

    expect(mockState.edit).toHaveBeenCalledTimes(1);
    expect(savedRecord().kernelViews).toEqual([
      { id: 'model', options: { tessellation: { linearTolerance: 0.019, angularTolerance: 20 } } },
    ]);
  });

  it('counts a saved change and resets to the kernel defaults at once', () => {
    mockState.record = workbenchRecords.view.schema.parse({
      version: 1,
      entryPath: 'main.ts',
      kernelViews: [{ id: 'model', options: { tessellation: { linearTolerance: 5, angularTolerance: 20 } } }],
    });
    offer([model]);
    render(<SettingsMenu />);
    const disclosure = screen.getByRole('menuitem', { name: /Kernel settings/ });
    expect(disclosure).toHaveTextContent('1 changed from its default');
    fireEvent.click(disclosure);
    // A saved value past the drag window still shows as it is.
    expect(screen.getByRole('menuitem', { name: 'Linear tolerance, 5mm' })).toBeInTheDocument();

    // Changing the other setting keeps a value past the drag window as it is.
    fireEvent.keyDown(screen.getByRole('menuitem', { name: /^Angular tolerance/ }), { key: 'ArrowRight' });
    expect(getLiveViewOptions('pane-1')?.options).toEqual({
      tessellation: { linearTolerance: 5, angularTolerance: 21 },
    });
    // A step from there moves one step, not to the drag window's end (0.04 mm).
    fireEvent.keyDown(screen.getByRole('menuitem', { name: /^Linear tolerance/ }), { key: 'ArrowLeft' });
    expect(getLiveViewOptions('pane-1')?.options).toEqual({
      tessellation: { linearTolerance: 4.999, angularTolerance: 21 },
    });

    fireEvent.click(screen.getByRole('menuitem', { name: 'Reset to defaults' }));

    expect(mockState.edit).toHaveBeenCalledTimes(1);
    expect(savedRecord().kernelViews).toEqual([{ id: 'model', options: tessellation.defaults }]);
  });
});
