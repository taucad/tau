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

  it('should render the Plugins Store feature flag from the registry', () => {
    render(<ExperimentalSettings />);

    expect(screen.getByText('Plugins Store')).toBeInTheDocument();
    expect(screen.getByText('Expose the plugin and skill store while it is under development.')).toBeInTheDocument();
  });
});
