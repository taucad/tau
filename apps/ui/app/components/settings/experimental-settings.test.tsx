import { render, screen } from '@testing-library/react';
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
});
