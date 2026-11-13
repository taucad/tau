// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { ViewerSettings } from '#cad/viewer-settings.jsx';
import { ViewerViewFieldsProvider } from '#cad/viewer-view-fields.jsx';
import type { ViewerViewFieldPath, ViewerViewFieldSource, ViewerViewFields } from '#cad/viewer-view-fields.jsx';

type GraphicsState = {
  readonly context: {
    readonly enableSurfaces: boolean;
    readonly enableLines: boolean;
    readonly enableGizmo: boolean;
    readonly enableGrid: boolean;
    readonly enableAxes: boolean;
    readonly enableMatcap: boolean;
    readonly enablePostProcessing: boolean;
    readonly graphicsBackendPreference: 'webgl' | 'webgpu';
    readonly webGpuAvailable: boolean;
    readonly upDirection: 'x' | 'y' | 'z';
    readonly gridSizes: { readonly smallSize: number };
    readonly isGridSizeLocked: boolean;
    readonly displayUnits: { readonly length: { readonly metersPerUnit: number; readonly symbol: string } };
    /** The presented artifact; an SVG drawing is 2D. */
    readonly artifact: { readonly mimeType: string };
  };
};

type CameraState = {
  readonly context: {
    readonly view: { readonly requestedVerticalFieldOfView: number };
  };
};

const mocks = vi.hoisted(() => ({
  graphicsSend: vi.fn(),
  setOperationTimeout: vi.fn(),
  cameraSend: vi.fn(),
  geometryFormat: 'gltf' as 'gltf' | 'svg',
  fieldOfView: 42,
  smallSize: 0.001,
  isGridSizeLocked: false,
}));

vi.mock('#hooks/use-graphics.jsx', () => ({
  useGraphics: () => ({ send: mocks.graphicsSend }),
  useGraphicsSelector: <T,>(selector: (state: GraphicsState) => T): T =>
    selector({
      context: {
        enableSurfaces: true,
        enableLines: true,
        enableGizmo: true,
        enableGrid: true,
        enableAxes: true,
        enableMatcap: false,
        enablePostProcessing: false,
        graphicsBackendPreference: 'webgpu',
        webGpuAvailable: true,
        upDirection: 'z',
        gridSizes: { smallSize: mocks.smallSize },
        isGridSizeLocked: mocks.isGridSizeLocked,
        displayUnits: { length: { metersPerUnit: 0.001, symbol: 'mm' } },
        artifact: {
          mimeType: mocks.geometryFormat === 'svg' ? 'image/svg+xml' : 'model/gltf-binary',
        },
      },
    }),
  useCameraRig: () => ({ actorRef: { send: mocks.cameraSend } }),
  useCameraSelector: <T,>(selector: (state: CameraState) => T): T =>
    selector({
      context: { view: { requestedVerticalFieldOfView: mocks.fieldOfView } },
    }),
}));

const fieldOfViewName = 'Field of view, 0° is orthographic';

/** Waits one task: a menu starts listening for presses outside, and returns focus, a task after it opens or closes. */
const nextTask = async (): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });
};

const renderViewerSettings = (viewFields?: ViewerViewFields): void => {
  render(
    <TooltipProvider>
      <ViewerViewFieldsProvider value={viewFields}>
        <ViewerSettings
          operationTimeout={{
            value: 60_000,
            defaultValue: 180_000,
            onChange: mocks.setOperationTimeout,
          }}
        />
      </ViewerViewFieldsProvider>
    </TooltipProvider>,
  );
};

const openViewerSettings = async (
  user: ReturnType<typeof userEvent.setup>,
  viewFields?: ViewerViewFields,
): Promise<void> => {
  renderViewerSettings(viewFields);
  await user.click(screen.getByRole('button', { name: 'Viewer settings' }));
};

const setFieldOfView = (verticalFieldOfView: number): { type: string; verticalFieldOfView: number } => ({
  type: 'setVerticalFieldOfView',
  verticalFieldOfView,
});

describe('ViewerSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.geometryFormat = 'gltf';
    mocks.fieldOfView = 42;
    mocks.smallSize = 0.001;
    mocks.isGridSizeLocked = false;
  });

  it('should omit the always-on post-processing switch and removed viewer controls', async () => {
    const user = userEvent.setup();
    await openViewerSettings(user);

    expect(screen.queryByText('Post-processing')).not.toBeInTheDocument();
    expect(await screen.findByText('Timeout')).toBeVisible();
    expect(screen.queryByText('Environment')).not.toBeInTheDocument();
    expect(screen.queryByText('Studio')).not.toBeInTheDocument();
    expect(screen.queryByText('Performance')).not.toBeInTheDocument();
    expect(screen.queryByText('Backend')).not.toBeInTheDocument();
    expect(screen.queryByText('Graphics backend')).not.toBeInTheDocument();
    expect(screen.queryByText('WebGPU')).not.toBeInTheDocument();
  });

  it('should label the edge visibility switch Edges and toggle edge rendering', async () => {
    const user = userEvent.setup();
    await openViewerSettings(user);

    expect(screen.queryByText('Lines')).not.toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'Edges' }));

    expect(mocks.graphicsSend).toHaveBeenCalledWith({ type: 'setLinesVisibility', payload: false });
  });

  describe('with the host view commands (T3.5)', () => {
    it('should set each toggle, the up direction and the field of view in the view and send nothing live', async () => {
      const user = userEvent.setup();
      const set = vi.fn();
      await openViewerSettings(user, { set, reset: vi.fn() });

      await user.click(screen.getByRole('switch', { name: 'Edges' }));
      await user.click(screen.getByRole('switch', { name: 'Surfaces' }));
      await user.click(screen.getByRole('switch', { name: /Matcap/u }));
      await user.click(screen.getByRole('switch', { name: 'Gizmo' }));
      await user.click(screen.getByRole('switch', { name: 'Grid' }));
      await user.click(screen.getByRole('switch', { name: 'Axes' }));
      await user.click(screen.getByRole('radio', { name: 'Y-up' }));
      act(() => {
        screen.getByRole('menuitem', { name: `${fieldOfViewName}, 42°` }).focus();
      });
      await user.keyboard('{ArrowRight}');

      // A press on the switch itself also selects its row, so a toggle may be issued twice with one value.
      const issued = [...new Set(set.mock.calls.map((call) => JSON.stringify(call)))].map(
        (call) => JSON.parse(call) as unknown,
      );
      expect(issued).toEqual([
        ['display.lines', false],
        ['display.surfaces', false],
        ['display.matcap', true],
        ['display.gizmo', false],
        ['display.grid', false],
        ['display.axes', false],
        ['upDirection', 'y'],
        ['fieldOfView', 43],
      ]);
      expect(mocks.graphicsSend).not.toHaveBeenCalled();
      expect(mocks.cameraSend).not.toHaveBeenCalled();
    });
    it('should step the field of view from the angle still being written, and from the camera once it is refused', async () => {
      const user = userEvent.setup();
      const writes: Array<PromiseWithResolvers<boolean>> = [];
      const set = vi.fn(async (_leaf: string, _value: unknown) => {
        const write = Promise.withResolvers<boolean>();
        writes.push(write);
        return write.promise;
      });
      await openViewerSettings(user, { set, reset: vi.fn() });
      act(() => {
        screen.getByRole('menuitem', { name: `${fieldOfViewName}, 42°` }).focus();
      });

      // The camera still shows 42° while both writes are in flight.
      await user.keyboard('{ArrowRight}{ArrowRight}');
      expect(set.mock.calls).toEqual([
        ['fieldOfView', 43],
        ['fieldOfView', 44],
      ]);

      // The newer write is refused: the next step counts from what the camera shows again.
      await act(async () => {
        writes.at(-1)!.resolve(false);
        await writes.at(-1)!.promise;
      });
      await user.keyboard('{ArrowRight}');
      expect(set).toHaveBeenLastCalledWith('fieldOfView', 43);
    });
  });

  describe('closing', () => {
    it('should return focus to the trigger when Escape closes the menu', async () => {
      const user = userEvent.setup();
      renderViewerSettings();
      const trigger = screen.getByRole('button', { name: 'Viewer settings' });
      act(() => {
        trigger.focus();
      });

      await user.keyboard('{Enter}');
      expect(screen.getByRole('menu')).toBeInTheDocument();
      await user.keyboard('{Escape}');

      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });

    it('should leave focus with the pointer when a press outside closes the menu', async () => {
      const user = userEvent.setup();
      await openViewerSettings(user);
      await nextTask();

      fireEvent.pointerDown(document.body);
      await nextTask();

      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Viewer settings' })).not.toHaveFocus();
    });
  });

  describe('field of view', () => {
    it('should show the field of view after Up Direction and before Grid & units for 3D geometry', async () => {
      const user = userEvent.setup();
      await openViewerSettings(user);

      const input = screen.getByRole('spinbutton', { name: fieldOfViewName });
      expect(input).toHaveValue('42');
      expect(screen.getByText('Field of view')).toBeVisible();
      expect(screen.getByText('Up Direction').compareDocumentPosition(input)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      const grid = screen.getByRole('menuitem', { name: 'Grid & units, 1 mm' });
      expect(input.compareDocumentPosition(grid)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(grid.compareDocumentPosition(screen.getByText('Rendering'))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });

    it('should omit the field of view for 2D geometry', async () => {
      mocks.geometryFormat = 'svg';
      const user = userEvent.setup();
      await openViewerSettings(user);

      expect(screen.getByText('Viewport')).toBeVisible();
      expect(screen.queryByRole('spinbutton', { name: fieldOfViewName })).not.toBeInTheDocument();
    });

    it('should read Orthographic at 0°', async () => {
      mocks.fieldOfView = 0;
      const user = userEvent.setup();
      await openViewerSettings(user);

      expect(screen.getByRole('spinbutton', { name: fieldOfViewName })).toHaveValue('0');
      expect(screen.getByText('Orthographic')).toBeVisible();
      expect(screen.queryByText('Field of view')).not.toBeInTheDocument();
    });

    it('should step 1° with the arrow keys and 5° while Shift is held', async () => {
      const user = userEvent.setup();
      await openViewerSettings(user);
      await user.click(screen.getByRole('spinbutton', { name: fieldOfViewName }));

      await user.keyboard('{ArrowUp}');
      expect(mocks.cameraSend).toHaveBeenLastCalledWith(setFieldOfView(43));

      await user.keyboard('{Shift>}{ArrowUp}{/Shift}');
      expect(mocks.cameraSend).toHaveBeenLastCalledWith(setFieldOfView(47));

      await user.keyboard('{Shift>}{ArrowDown}{/Shift}');
      expect(mocks.cameraSend).toHaveBeenLastCalledWith(setFieldOfView(37));
    });

    it('should round and clamp stepped and typed angles to 0–90°', async () => {
      mocks.fieldOfView = 88;
      const user = userEvent.setup();
      await openViewerSettings(user);
      const input = screen.getByRole('spinbutton', { name: fieldOfViewName });
      await user.click(input);

      await user.keyboard('{Shift>}{ArrowUp}{/Shift}');
      expect(mocks.cameraSend).toHaveBeenLastCalledWith(setFieldOfView(90));

      await user.clear(input);
      await user.type(input, '30.6');
      await user.keyboard('{Enter}');
      expect(mocks.cameraSend).toHaveBeenLastCalledWith(setFieldOfView(31));

      await user.clear(input);
      await user.type(input, '120');
      await user.keyboard('{Enter}');
      expect(mocks.cameraSend).toHaveBeenLastCalledWith(setFieldOfView(90));
    });

    it('should explain the row in a tooltip when the pointer moves over it', async () => {
      const user = userEvent.setup();
      await openViewerSettings(user);

      await user.hover(screen.getByRole('spinbutton', { name: fieldOfViewName }));

      const tooltip = await screen.findByRole('tooltip', {
        name: /Drag for field of view/,
      });
      expect(tooltip).toHaveTextContent('Drag for field of view · 0° is orthographic');
      expect(tooltip).toHaveTextContent('Click or Enter to type · ←→ step 1° · Shift 5° · P toggles orthographic');
    });

    it('should reach the row from the keyboard, explain it, and step it with ArrowRight', async () => {
      const user = userEvent.setup();
      await openViewerSettings(user);
      act(() => {
        screen.getByRole('menuitem', { name: 'Axes' }).focus();
      });

      await user.keyboard('{ArrowDown}');
      expect(screen.getByRole('menuitem', { name: `${fieldOfViewName}, 42°` })).toHaveFocus();
      expect(await screen.findByRole('tooltip', { name: /Drag for field of view/ })).toBeInTheDocument();

      await user.keyboard('{ArrowRight}');
      expect(mocks.cameraSend).toHaveBeenLastCalledWith(setFieldOfView(43));
      await user.keyboard('{Shift>}{ArrowRight}{/Shift}');
      expect(mocks.cameraSend).toHaveBeenLastCalledWith(setFieldOfView(47));
    });
  });

  describe('Grid & units', () => {
    const openGridUnits = async (user: ReturnType<typeof userEvent.setup>, viewFields?: ViewerViewFields) => {
      await openViewerSettings(user, viewFields);
      await user.click(screen.getByRole('menuitem', { name: /^Grid & units/u }));
      return screen.getByRole('group', { name: 'Grid & units' });
    };

    it('should read the grid size beside its chevron, and the lock when the size is locked', async () => {
      mocks.smallSize = 0.05;
      mocks.isGridSizeLocked = true;
      const user = userEvent.setup();
      await openViewerSettings(user);

      const row = screen.getByRole('menuitem', { name: 'Grid & units, 50 mm, locked' });
      expect(row).toHaveTextContent(/Grid & units50 mm$/u);
      expect(row.querySelector('.lucide-lock')).not.toBeNull();
    });

    it('should open the units under a Back row and a heading, and stay open on a unit and the lock', async () => {
      const user = userEvent.setup();
      const view = await openGridUnits(user);

      expect(within(view).getByRole('menuitem', { name: 'Back to Options' })).toHaveTextContent(/^Back$/u);
      expect(within(view).getByText('Unit')).toBeVisible();
      const units = within(view).getByRole('group', { name: 'Unit' });
      expect(
        within(units)
          .getAllByRole('menuitemradio')
          .map((row) => row.textContent),
      ).toEqual(['Millimetermm', 'Centimetercm', 'Meterm', 'Inchin', 'Footft', 'Yardyd']);
      expect(within(units).getByRole('menuitemradio', { name: /Millimeter/u })).toHaveAttribute('aria-checked', 'true');

      await user.click(within(units).getByRole('menuitemradio', { name: /Inch/u }));
      expect(mocks.graphicsSend).toHaveBeenCalledWith({ type: 'setGridUnit', payload: { unit: 'in' } });
      expect(screen.getByRole('group', { name: 'Grid & units' })).toBeVisible();

      await user.click(within(view).getByRole('switch', { name: 'Lock grid size (1 mm)' }));
      expect(mocks.graphicsSend).toHaveBeenCalledWith({ type: 'setGridSizeLocked', payload: true });
      expect(screen.getByRole('group', { name: 'Grid & units' })).toBeVisible();
      expect(within(view).getByText('Adjust grid size by changing zoom level')).toBeVisible();
    });

    it('should set the unit in the view with the host view commands', async () => {
      const user = userEvent.setup();
      const set = vi.fn();
      const view = await openGridUnits(user, { set, reset: vi.fn() });

      await user.click(within(view).getByRole('menuitemradio', { name: /Centimeter/u }));
      expect(set).toHaveBeenCalledWith('grid.unit', 'cm');
      expect(mocks.graphicsSend).not.toHaveBeenCalled();
    });

    it('should return to the row on Back', async () => {
      const user = userEvent.setup();
      const view = await openGridUnits(user);

      await user.click(within(view).getByRole('menuitem', { name: 'Back to Options' }));
      expect(screen.queryByRole('group', { name: 'Grid & units' })).not.toBeInTheDocument();
      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: 'Grid & units, 1 mm' })).toHaveFocus();
      });
    });

    it('should offer no row until the grid has a size', async () => {
      mocks.smallSize = 0;
      const user = userEvent.setup();
      await openViewerSettings(user);
      expect(screen.queryByRole('menuitem', { name: /^Grid & units/u })).not.toBeInTheDocument();
    });
  });

  describe('Timeout', () => {
    it('should read the timeout beside its chevron and open its options under Back and a heading', async () => {
      const user = userEvent.setup();
      await openViewerSettings(user);
      const row = screen.getByRole('menuitem', { name: 'Timeout, 1 min' });
      expect(row).toHaveTextContent(/1 min$/u);

      await user.click(row);
      const view = screen.getByRole('group', { name: 'Timeout' });
      expect(within(view).getByRole('menuitem', { name: 'Back to Options' })).toHaveTextContent(/^Back$/u);
      expect(within(view).getByText('Timeout')).toBeVisible();
      expect(within(view).getByRole('menuitemradio', { name: '1 min' })).toHaveAttribute('aria-checked', 'true');
    });

    it('should step back to the menu on a choice', async () => {
      const user = userEvent.setup();
      await openViewerSettings(user);
      await user.click(screen.getByRole('menuitem', { name: 'Timeout, 1 min' }));

      await user.click(screen.getByRole('menuitemradio', { name: '5 min' }));
      expect(mocks.setOperationTimeout).toHaveBeenCalledWith(300_000);
      expect(screen.queryByRole('group', { name: 'Timeout' })).not.toBeInTheDocument();
      expect(screen.getByRole('menu')).toBeInTheDocument();
    });
  });

  describe('placement', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    const box = (x: number, y: number, size: Readonly<{ width: number; height: number }>): DOMRect =>
      DOMRect.fromRect({ x, y, ...size });

    it('should open beside the bar when the pane has room, measured as it opens', async () => {
      const user = userEvent.setup();
      render(
        <TooltipProvider>
          <div data-viewer-frame>
            <div data-slot='viewer-controls'>
              <ViewerSettings side='top' align='end' />
            </div>
          </div>
        </TooltipProvider>,
      );
      const trigger = screen.getByRole('button', { name: 'Viewer settings' });
      const bar = trigger.closest<HTMLElement>('[data-slot=viewer-controls]')!;
      const frame = bar.closest<HTMLElement>('[data-viewer-frame]')!;
      vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue(box(0, 0, { width: 1000, height: 800 }));
      // 600 + 8 + 288 + 8 = 904 fits the 1000 px pane.
      vi.spyOn(bar, 'getBoundingClientRect').mockReturnValue(box(200, 740, { width: 400, height: 38 }));
      vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(box(567, 745, { width: 28, height: 28 }));
      // The test document lays out nothing: the viewport Radix keeps the menu inside is given a size too.
      vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1000);
      vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(800);

      await user.click(trigger);
      const menu = screen.getByRole('menu');
      expect(menu).toHaveAttribute('data-side', 'right');
      expect(menu).toHaveAttribute('data-align', 'end');
    });

    it('should open above the gear outside a viewer bar', async () => {
      const user = userEvent.setup();
      render(
        <TooltipProvider>
          <ViewerSettings side='top' align='end' />
        </TooltipProvider>,
      );
      await user.click(screen.getByRole('button', { name: 'Viewer settings' }));
      expect(screen.getByRole('menu')).toHaveAttribute('data-side', 'top');
    });
  });

  describe('where each leaf comes from (T5.3, V5)', () => {
    const marked = (
      sources: Partial<Record<ViewerViewFieldPath, ViewerViewFieldSource>>,
      person: readonly ViewerViewFieldPath[] = [],
    ) => {
      const reset = vi.fn();
      const viewFields: ViewerViewFields = {
        set: vi.fn(),
        reset,
        sourceOf: (leaf) => sources[leaf] ?? 'tau',
        inheritsFrom: (leaf) => (person.includes(leaf) ? 'person' : 'tau'),
      };
      return { viewFields, reset };
    };

    it('shows no labels and no dots without the host’s sources (flag off)', async () => {
      const user = userEvent.setup();
      await openViewerSettings(user, { set: vi.fn(), reset: vi.fn() });
      expect(screen.queryByText('From my defaults')).not.toBeInTheDocument();
      expect(screen.queryByText('Set in this view')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Reset to/u })).not.toBeInTheDocument();
    });

    it('shows no marks for a leaf no level sets, and offers no Reset view', async () => {
      const user = userEvent.setup();
      await openViewerSettings(user, marked({}).viewFields);
      expect(screen.queryByText('From my defaults')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Reset to/u })).not.toBeInTheDocument();
      expect(screen.queryByRole('menuitem', { name: /Reset view/u })).not.toBeInTheDocument();
    });

    it('labels a leaf the person sets and the view does not “From my defaults”', async () => {
      const user = userEvent.setup();
      await openViewerSettings(user, marked({ 'display.grid': 'person', fieldOfView: 'person' }).viewFields);
      expect(screen.getByRole('switch', { name: 'Grid' })).toHaveAccessibleDescription('From my defaults');
      expect(screen.getByRole('switch', { name: 'Axes' })).not.toHaveAccessibleDescription();
      expect(screen.getAllByText('From my defaults')).toHaveLength(2);
    });

    it('shows the dot on a leaf the view sets, naming what Reset returns to, and resets it', async () => {
      const user = userEvent.setup();
      const { viewFields, reset } = marked({ 'display.grid': 'view', 'display.axes': 'view', upDirection: 'view' }, [
        'display.grid',
      ]);
      await openViewerSettings(user, viewFields);
      expect(screen.getByRole('switch', { name: 'Grid' })).toHaveAccessibleDescription(/Set in this view/u);
      expect(screen.getByRole('button', { name: 'Reset to my default' })).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: 'Reset to Tau default' })).toHaveLength(2);
      await user.click(screen.getByRole('button', { name: 'Reset to my default' }));
      expect(reset).toHaveBeenCalledWith('display.grid');
      // The press resets the leaf and does not toggle its switch.
      expect(viewFields.set).not.toHaveBeenCalled();
    });

    it('resets a grid unit the view sets from its dot on the Grid & units row, with no Reset view', async () => {
      const user = userEvent.setup();
      const { viewFields, reset } = marked({ 'display.grid': 'view', 'grid.unit': 'view' });
      await openViewerSettings(user, viewFields);
      expect(screen.queryByRole('menuitem', { name: /Reset view/u })).not.toBeInTheDocument();
      const row = screen.getByRole('menuitem', { name: 'Grid & units, 1 mm' });
      await user.click(within(row).getByRole('button', { name: 'Reset to Tau default' }));
      expect(reset).toHaveBeenCalledWith('grid.unit');
      // The press resets the unit and does not open the sub-view.
      expect(screen.queryByRole('group', { name: 'Grid & units' })).not.toBeInTheDocument();
    });
  });
});
