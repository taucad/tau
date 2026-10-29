// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as TelemetryPurposesModule from '#hooks/use-telemetry-purposes.js';
import type { TelemetryPurpose, TelemetryPurposeState } from '#hooks/use-telemetry-purposes.js';
import { AgentObservabilitySettings } from '#components/settings/agent-observability-settings.js';

const hook = vi.hoisted(() => ({
  states: new Map<string, Partial<TelemetryPurposeState>>(),
  decide: vi.fn(),
}));

vi.mock('#hooks/use-telemetry-purposes.js', async (importOriginal) => {
  const original = await importOriginal<typeof TelemetryPurposesModule>();
  return {
    ...original,
    useTelemetryPurposes: () => ({
      stateOf: (purpose: TelemetryPurpose): TelemetryPurposeState => ({
        purpose,
        allowed: false,
        decided: false,
        granted: false,
        refusal: 'no-decision',
        ...hook.states.get(purpose),
      }),
      canDecide: true,
      isLoading: false,
      error: undefined,
      decide: hook.decide,
      isDeciding: false,
    }),
  };
});

describe('AgentObservabilitySettings', () => {
  beforeEach(() => {
    hook.states.clear();
    hook.decide.mockClear();
  });

  it('keeps a grant the plan overrides visible and withdrawable', async () => {
    hook.states.set('reuse', { decided: true, granted: true, refusal: 'tier-excluded' });
    render(<AgentObservabilitySettings />);

    const reuse = screen.getByRole('switch', { name: 'Evaluation examples' });
    expect(reuse).toBeChecked();
    expect(reuse).toBeEnabled();

    await userEvent.click(reuse);

    expect(hook.decide).toHaveBeenCalledWith({ purpose: 'reuse', granted: false });
  });

  it('does not offer a purpose the plan excludes when nothing is granted', () => {
    hook.states.set('training', { refusal: 'tier-excluded' });
    render(<AgentObservabilitySettings />);

    const training = screen.getByRole('switch', { name: 'Model training' });
    expect(training).not.toBeChecked();
    expect(training).toBeDisabled();
  });
});
