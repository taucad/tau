// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { ViewerSettings } from '#components/geometry/cad/viewer-settings.js';

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
    readonly geometry: { readonly format: 'gltf' | 'svg' };
  };
};

type CadState = {
  readonly context: {
    readonly renderTimeout: number;
  };
};

type CameraState = {
  readonly context: {
    readonly view: { readonly requestedVerticalFieldOfView: number };
  };
};

const mocks = vi.hoisted(() => ({
  graphicsSend: vi.fn(),
  cadSend: vi.fn(),
  cameraSend: vi.fn(),
  geometryFormat: 'gltf' as 'gltf' | 'svg',
  fieldOfView: 42,
}));

vi.mock('#hooks/use-graphics.js', () => ({
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
        geometry: { format: mocks.geometryFormat },
      },
    }),
  useCameraRig: () => ({ actorRef: { send: mocks.cameraSend } }),
  useCameraSelector: <T,>(selector: (state: CameraState) => T): T =>
    selector({ context: { view: { requestedVerticalFieldOfView: mocks.fieldOfView } } }),
}));

vi.mock('#hooks/use-cad.js', () => ({
  useCad: () => ({ send: mocks.cadSend }),
  useCadSelector: <T,>(selector: (state: CadState) => T): T => selector({ context: { renderTimeout: 60_000 } }),
}));

const fieldOfViewName = 'Field of view, 0° is orthographic';

const openViewerSettings = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
  render(
    <TooltipProvider>
      <ViewerSettings />
    </TooltipProvider>,
  );
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

  it('should retain post-processing while omitting removed viewer controls', async () => {
    const user = userEvent.setup();
    await openViewerSettings(user);

    expect(await screen.findByText('Post-processing')).toBeVisible();
    expect(await screen.findByText('Timeout')).toBeVisible();
    expect(screen.queryByText('Environment')).not.toBeInTheDocument();
    expect(screen.queryByText('Studio')).not.toBeInTheDocument();
    expect(screen.queryByText('Performance')).not.toBeInTheDocument();
    expect(screen.queryByText('Backend')).not.toBeInTheDocument();
    expect(screen.queryByText('Graphics backend')).not.toBeInTheDocument();
    expect(screen.queryByText('WebGPU')).not.toBeInTheDocument();
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

      const tooltip = await screen.findByRole('tooltip', { name: /Drag for field of view/ });
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
      expect(screen.getByRole('menuitem', { name: fieldOfViewName })).toHaveFocus();
      expect(await screen.findByRole('tooltip', { name: /Drag for field of view/ })).toBeInTheDocument();

      await user.keyboard('{ArrowRight}');
      expect(mocks.cameraSend).toHaveBeenLastCalledWith(setFieldOfView(43));
      await user.keyboard('{Shift>}{ArrowRight}{/Shift}');
      expect(mocks.cameraSend).toHaveBeenLastCalledWith(setFieldOfView(47));
    });
  });
});
