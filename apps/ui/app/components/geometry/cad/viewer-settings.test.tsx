// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
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
    readonly environmentPreset: 'studio' | 'performance';
    readonly graphicsBackendPreference: 'webgl' | 'webgpu';
    readonly webGpuAvailable: boolean;
    readonly upDirection: 'x' | 'y' | 'z';
    readonly geometry: { readonly format: 'gltf' };
  };
};

type CadState = {
  readonly context: {
    readonly renderTimeout: number;
  };
};

const mocks = vi.hoisted(() => ({
  graphicsSend: vi.fn(),
  cadSend: vi.fn(),
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
        environmentPreset: 'performance',
        graphicsBackendPreference: 'webgpu',
        webGpuAvailable: true,
        upDirection: 'z',
        geometry: { format: 'gltf' },
      },
    }),
}));

vi.mock('#hooks/use-cad.js', () => ({
  useCad: () => ({ send: mocks.cadSend }),
  useCadSelector: <T,>(selector: (state: CadState) => T): T => selector({ context: { renderTimeout: 60_000 } }),
}));

describe('ViewerSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should omit graphics backend controls from 3D viewer settings', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <ViewerSettings />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole('button'));

    expect(await screen.findByText('Timeout')).toBeVisible();
    expect(screen.queryByText('Backend')).not.toBeInTheDocument();
    expect(screen.queryByText('Graphics backend')).not.toBeInTheDocument();
    expect(screen.queryByText('WebGPU')).not.toBeInTheDocument();
  });
});
