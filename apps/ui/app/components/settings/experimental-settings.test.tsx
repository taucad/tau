import { guardActors } from '@taucad/xstate-testing/inspect';
import { createActor, createAsyncLogic } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import { graphicsMachine } from '@taucad/viewer/machines/graphics.machine';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExperimentalSettings } from '#components/settings/experimental-settings.js';
import { featureFlagDefaults } from '#flags/flag.constants.js';
import type { FeatureFlags } from '#flags/flag.constants.js';

const mockState = vi.hoisted(() => ({
  flags: undefined as FeatureFlags | undefined,
  setFlag: vi.fn(),
  graphics: undefined as ActorRefFrom<typeof graphicsMachine> | undefined,
}));

vi.mock('#flags/use-feature.js', () => ({
  useFeatureFlags: () => mockState.flags,
  useSetFeatureFlag: () => mockState.setFlag,
}));

vi.mock('#hooks/use-project.js', () => ({
  useProject: () =>
    mockState.graphics
      ? {
          mainEntryPath: 'main.py',
          viewGraphics: new Map([['view', mockState.graphics]]),
          viewEntryPaths: new Map([['view', 'main.py']]),
        }
      : undefined,
}));

describe('ExperimentalSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.flags = featureFlagDefaults;
    mockState.graphics = undefined;
  });

  it('should render only the exposed feature flags from the registry', () => {
    render(<ExperimentalSettings />);

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
    render(<ExperimentalSettings />);
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
    const view = render(<ExperimentalSettings />);
    try {
      expect(screen.getByText('No active 3D viewer.')).toBeInTheDocument();
      act(() => {
        actor.send({
          type: 'rendererInitialized',
          payload: { canvasId: 'a', backend: 'webgpu' },
        });
      });
      expect(screen.getByText('Using WebGPU.')).toBeInTheDocument();
      act(() => {
        actor.send({
          type: 'rendererInitialized',
          payload: { canvasId: 'b', backend: 'webgl' },
        });
      });
      expect(screen.getByText('Using WebGL2 fallback.')).toBeInTheDocument();
      mockState.flags = { ...featureFlagDefaults, webGpu: false };
      view.rerender(<ExperimentalSettings />);
      expect(screen.getByText('Using WebGL2.')).toBeInTheDocument();
      act(() => {
        actor.send({ type: 'rendererRemoved', canvasId: 'a' });
      });
      expect(screen.getByText('Using WebGL2.')).toBeInTheDocument();
      act(() => {
        actor.send({ type: 'rendererRemoved', canvasId: 'b' });
      });
      expect(screen.getByText('No active 3D viewer.')).toBeInTheDocument();
    } finally {
      view.unmount();
      actor.stop();
    }
  });

  it('should let the user prefer WebGL without disabling the viewer', () => {
    render(<ExperimentalSettings />);
    fireEvent.click(screen.getByRole('switch', { name: 'Prefer WebGPU' }));
    expect(mockState.setFlag).toHaveBeenCalledExactlyOnceWith('webGpu', false);
  });

  it('should toggle a flag when its row text is tapped', async () => {
    render(<ExperimentalSettings />);

    await userEvent.click(screen.getByText('Debug tools'));

    expect(mockState.setFlag).toHaveBeenCalledTimes(1);
    expect(mockState.setFlag).toHaveBeenCalledWith('tauDebug', !featureFlagDefaults.tauDebug);
  });

  it('should toggle a flag once when the switch itself is tapped inside its row', async () => {
    render(<ExperimentalSettings />);

    await userEvent.click(screen.getByRole('switch', { name: 'Debug tools' }));

    expect(mockState.setFlag).toHaveBeenCalledTimes(1);
    expect(mockState.setFlag).toHaveBeenCalledWith('tauDebug', !featureFlagDefaults.tauDebug);
  });
});
