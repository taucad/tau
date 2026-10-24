import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExperimentalSettings } from '#components/settings/experimental-settings.js';
import { featureFlagDefaults } from '#flags/flag.constants.js';
import type { FeatureFlags } from '#flags/flag.constants.js';

const mockState = vi.hoisted(() => ({
  flags: undefined as FeatureFlags | undefined,
  setFlag: vi.fn(),
}));

vi.mock('#flags/use-feature.js', () => ({
  useFeatureFlags: () => mockState.flags,
  useSetFeatureFlag: () => mockState.setFlag,
}));

describe('ExperimentalSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.flags = featureFlagDefaults;
  });

  it('should render only the exposed feature flags from the registry', () => {
    render(<ExperimentalSettings />);

    expect(screen.getByText('Tau Debug')).toBeInTheDocument();
    for (const hidden of [
      'Marketing Landing',
      'Machines',
      'Parts warehouse',
      'WebGPU rendering',
      'WebGPU shader stacks',
      'WebGPU inspector',
      'Plugins Store',
    ]) {
      expect(screen.queryByText(hidden)).not.toBeInTheDocument();
    }
  });

  it('should toggle a flag when its row text is tapped', async () => {
    render(<ExperimentalSettings />);

    await userEvent.click(screen.getByText('Tau Debug'));

    expect(mockState.setFlag).toHaveBeenCalledTimes(1);
    expect(mockState.setFlag).toHaveBeenCalledWith('tauDebug', !featureFlagDefaults.tauDebug);
  });

  it('should toggle a flag once when the switch itself is tapped inside its row', async () => {
    render(<ExperimentalSettings />);

    await userEvent.click(screen.getByRole('switch', { name: 'Tau Debug' }));

    expect(mockState.setFlag).toHaveBeenCalledTimes(1);
    expect(mockState.setFlag).toHaveBeenCalledWith('tauDebug', !featureFlagDefaults.tauDebug);
  });
});
