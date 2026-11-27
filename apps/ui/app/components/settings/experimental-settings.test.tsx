import { guardActors } from '@taucad/xstate-testing/inspect';
import type { CanvasHostCommand } from '@taucad/viewer/machines/canvas.machine';
import { createActor, createAsyncLogic, createCallbackLogic } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import { graphicsMachine } from '@taucad/viewer/machines/graphics.machine';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExperimentalSettings } from '#components/settings/experimental-settings.js';
import { DeploymentSettingsProvider } from '#components/settings/deployment-settings-provider.js';
import { featureFlagDefaults } from '#flags/flag.constants.js';
import type { FeatureFlags } from '#flags/flag.constants.js';
import { hardwareRenderTier } from '@taucad/viewer/graphics/three/render-tier';

const mockState = vi.hoisted(() => ({
  flags: undefined as FeatureFlags | undefined,
  setFlag: vi.fn(),
  graphics: undefined as ActorRefFrom<typeof graphicsMachine> | undefined,
}));

vi.mock('#flags/use-feature.js', () => ({
  useFeatureFlags: () => mockState.flags,
  useSetFeatureFlag: () => mockState.setFlag,
}));

/* A11: Settings reads the focused session's runtime (focus and the registry), not provider ancestry. */
const noSubscription = { unsubscribe: () => undefined };
const focusedRuntime = (graphics: ActorRefFrom<typeof graphicsMachine>): unknown => {
  const projectSnapshot = { context: { mainEntryPath: 'main.py', viewGraphics: new Map([['view', graphics]]) } };
  const projectRef = { getSnapshot: () => projectSnapshot, subscribe: () => noSubscription };
  const actorSnapshot = { context: { projectRef } };
  const viewRecords = { viewEntryPaths: new Map([['view', 'main.py']]) };
  return {
    runtime: {
      actor: { getSnapshot: () => actorSnapshot, subscribe: () => noSubscription },
    },
    viewRecords: { subscribe: () => () => undefined, getSnapshot: () => viewRecords },
  };
};
const runtimes = new WeakMap<WeakKey, unknown>();
vi.mock('#runtime/project-runtime.js', () => ({
  selectProjectRef: (snapshot: { context: { projectRef: unknown } }) => snapshot.context.projectRef,
}));
vi.mock('#routes/w.$workspace.$project/focused-project-view.session.js', () => ({
  useFocusedProjectSession: () => {
    const { graphics } = mockState;
    if (graphics === undefined) {
      return undefined;
    }
    if (!runtimes.has(graphics)) {
      runtimes.set(graphics, focusedRuntime(graphics));
    }
    return { projectId: 'project-a', fileManagerRef: undefined, runtime: runtimes.get(graphics) };
  },
}));

describe('ExperimentalSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.flags = featureFlagDefaults;
    mockState.graphics = undefined;
  });

  it('should render only the exposed feature flags from the registry', () => {
    render(<ExperimentalSettings />, { wrapper: DeploymentSettingsProvider });

    expect(screen.getByRole('switch', { name: 'Prefer WebGPU' })).toBeChecked();
    expect(screen.getByText('Falls back to WebGL2 when WebGPU is unavailable')).toBeInTheDocument();
    expect(screen.getByText('Debug tools')).toBeInTheDocument();
    for (const hidden of [
      'Marketing Landing',
      'Machines',
      'Parts warehouse',
      'WebGPU shader stacks',
      'WebGPU inspector',
      'Plugin store',
    ]) {
      expect(screen.queryByText(hidden)).not.toBeInTheDocument();
    }
  });

  it('should report no active viewer without a project', () => {
    render(<ExperimentalSettings />, { wrapper: DeploymentSettingsProvider });
    expect(screen.getByText('No active 3D viewer.')).toBeInTheDocument();
  });

  it('should follow the initialized backend through fallback and teardown', () => {
    const guard = guardActors();
    const actor = createActor(
      graphicsMachine.provide({
        actors: {
          probeWebGpu: createAsyncLogic({ run: async () => true }),
        },
      }),
      { input: {}, inspect: guard.inspect },
    );
    actor.start();
    mockState.graphics = actor;
    const view = render(<ExperimentalSettings />, { wrapper: DeploymentSettingsProvider });
    try {
      expect(screen.getByText('No active 3D viewer.')).toBeInTheDocument();
      const host = (canvasId: string, backend: 'webgl' | 'webgpu'): void => {
        actor.send({ type: 'canvasAttached', canvasId, kind: 'canvas' });
        actor.getSnapshot().context.canvas?.ref.send({
          type: 'hostCreated',
          backend,
          tier: hardwareRenderTier(backend),
          surface: { width: 800, height: 600, pixelRatio: 1 },
          domElement: document.createElement('canvas'),
          host: createCallbackLogic<CanvasHostCommand, undefined>(() => undefined),
        });
      };
      act(() => {
        host('a', 'webgpu');
      });
      expect(screen.getByText('Using WebGPU.')).toBeInTheDocument();
      // A replacement canvas (the WebGL fallback) takes the slot.
      act(() => {
        host('b', 'webgl');
      });
      expect(screen.getByText('Using WebGL2 fallback.')).toBeInTheDocument();
      mockState.flags = { ...featureFlagDefaults, webGpu: false };
      view.rerender(<ExperimentalSettings />);
      expect(screen.getByText('Using WebGL2.')).toBeInTheDocument();
      // The replaced canvas leaving the document does not clear its replacement.
      act(() => {
        actor.send({ type: 'canvasDetached', canvasId: 'a' });
      });
      expect(screen.getByText('Using WebGL2.')).toBeInTheDocument();
      act(() => {
        actor.send({ type: 'canvasDetached', canvasId: 'b' });
      });
      expect(screen.getByText('No active 3D viewer.')).toBeInTheDocument();
    } finally {
      view.unmount();
      actor.stop();
    }
  });

  it('should let the user prefer WebGL without disabling the viewer', () => {
    render(<ExperimentalSettings />, { wrapper: DeploymentSettingsProvider });
    fireEvent.click(screen.getByRole('switch', { name: 'Prefer WebGPU' }));
    expect(mockState.setFlag).toHaveBeenCalledExactlyOnceWith('webGpu', false);
  });

  it('should toggle a flag when its row text is tapped', async () => {
    render(<ExperimentalSettings />, { wrapper: DeploymentSettingsProvider });

    await userEvent.click(screen.getByText('Debug tools'));

    expect(mockState.setFlag).toHaveBeenCalledTimes(1);
    expect(mockState.setFlag).toHaveBeenCalledWith('tauDebug', !featureFlagDefaults.tauDebug);
  });

  it('should toggle a flag once when the switch itself is tapped inside its row', async () => {
    render(<ExperimentalSettings />, { wrapper: DeploymentSettingsProvider });

    await userEvent.click(screen.getByRole('switch', { name: 'Debug tools' }));

    expect(mockState.setFlag).toHaveBeenCalledTimes(1);
    expect(mockState.setFlag).toHaveBeenCalledWith('tauDebug', !featureFlagDefaults.tauDebug);
  });
});
