// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
    it('should show the field of view as the last viewport row for 3D geometry', async () => {
      const user = userEvent.setup();
      await openViewerSettings(user);

      const input = screen.getByRole('spinbutton', { name: fieldOfViewName });
      expect(input).toHaveValue('42');
      expect(screen.getByText('Field of view')).toBeVisible();
      expect(screen.getByText('Up Direction').compareDocumentPosition(input)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(input.compareDocumentPosition(screen.getByText('Rendering'))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
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

  describe('where each leaf comes from (T5.3, V5)', () => {
    const marked = (
      sources: Partial<Record<ViewerViewFieldPath, ViewerViewFieldSource>>,
      person: readonly ViewerViewFieldPath[] = [],
    ) => {
      const reset = vi.fn();
      const resetView = vi.fn();
      const viewFields: ViewerViewFields = {
        set: vi.fn(),
        reset,
        sourceOf: (leaf) => sources[leaf] ?? 'tau',
        inheritsFrom: (leaf) => (person.includes(leaf) ? 'person' : 'tau'),
        resetView,
      };
      return { viewFields, reset, resetView };
    };

    it('shows no labels, no dots and no Reset view without the host’s sources (flag off)', async () => {
      const user = userEvent.setup();
      await openViewerSettings(user, { set: vi.fn(), reset: vi.fn(), resetView: vi.fn() });
      expect(screen.queryByText('From my defaults')).not.toBeInTheDocument();
      expect(screen.queryByText('Set in this view')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Reset to/u })).not.toBeInTheDocument();
      expect(screen.queryByRole('menuitem', { name: /Reset view/u })).not.toBeInTheDocument();
    });

    it('shows no marks for a leaf no level sets, and Reset view is disabled', async () => {
      const user = userEvent.setup();
      await openViewerSettings(user, marked({}).viewFields);
      expect(screen.queryByText('From my defaults')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Reset to/u })).not.toBeInTheDocument();
      const resetView = screen.getByRole('menuitem', { name: /Reset view/u });
      expect(resetView).toHaveAttribute('aria-disabled', 'true');
      expect(resetView).toHaveTextContent('Follows the defaults');
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

    it('counts the leaves the view sets in Reset view and clears them', async () => {
      const user = userEvent.setup();
      const { viewFields, resetView } = marked({
        'display.grid': 'view',
        'grid.unit': 'view',
        'display.axes': 'person',
      });
      await openViewerSettings(user, viewFields);
      const item = screen.getByRole('menuitem', { name: /Reset view/u });
      expect(item).toHaveTextContent('2 changed in this view');
      await user.click(item);
      expect(resetView).toHaveBeenCalledOnce();
    });

    it('says “1 changed in this view” for a single leaf', async () => {
      const user = userEvent.setup();
      await openViewerSettings(user, marked({ fieldOfView: 'view' }).viewFields);
      expect(screen.getByRole('menuitem', { name: /Reset view/u })).toHaveTextContent('1 changed in this view');
      expect(screen.getByText('Set in this view')).toBeInTheDocument();
    });
  });
});
