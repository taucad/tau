import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { entitlementsFromTier } from '@taucad/billing';
import { DataControlsSettings } from '#components/settings/data-controls-settings.js';
import type * as TelemetrySwitchModule from '#hooks/use-telemetry-switch.js';

const clientEnvironment = globalThis.window.ENV;
const useEntitlementsMock = vi.hoisted(() => vi.fn());
vi.mock('@taucad/billing/hooks/use-entitlements', () => ({
  useEntitlements: useEntitlementsMock,
}));

const mockUpdatePreferences = vi.fn();

vi.mock('react-router', () => ({
  Link: ({ children, className, to }: { children: ReactNode; className?: string; to: string }): ReactElement => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
  /* `useCommercialFeatures` reaches the settings dialog, which is URL state. */
  useSearchParams: (): [URLSearchParams, () => void] => [new URLSearchParams(), vi.fn()],
}));

let mockAllowsUsageMetrics: boolean;
let mockAllowsAiTraining: boolean;

vi.mock('#hooks/use-privacy-preferences.js', () => ({
  usePrivacyPreferences: () => ({
    preferences: { allowsAiTraining: mockAllowsAiTraining, allowsUsageMetrics: mockAllowsUsageMetrics },
    isLoading: false,
    error: undefined,
    updatePreferences: mockUpdatePreferences,
    isUpdating: false,
  }),
}));

const mockTelemetryChange = vi.fn();
let mockTelemetrySwitch: { checked: boolean; pending: boolean; forcedOff: boolean };

vi.mock('#hooks/use-telemetry-switch.js', async (importOriginal) => {
  const actual = await importOriginal<typeof TelemetrySwitchModule>();
  return {
    telemetryCopy: actual.telemetryCopy,
    useTelemetrySwitch: () => ({
      ...mockTelemetrySwitch,
      consent: mockTelemetrySwitch.checked ? 'granted' : 'denied',
      onCheckedChange: mockTelemetryChange,
      details: [...actual.telemetryCopy.details, actual.telemetryCopy.untilActivation.caveat],
    }),
  };
});

// The consent dialog has its own tests; here it only has to open.
vi.mock('#components/cookie-preferences.js', () => ({
  CookiePreferencesDialog: ({ isOpen }: { readonly isOpen: boolean }): ReactElement | undefined =>
    isOpen ? <div role='dialog' aria-label='Cookie preferences' /> : undefined,
}));

// Account closure has its own lifecycle tests.
vi.mock('#cloud/settings-billing.js', () => ({
  CloudAccountClosure: (): ReactElement => <div data-testid='account-closure' />,
}));

// Server-resolved recording purposes have their own query-backed section and hook tests.
vi.mock('#components/settings/agent-observability-settings.js', () => ({
  AgentObservabilitySettings: (): ReactElement => <div data-testid='agent-observability-settings' />,
}));

const improve = 'Improve the service for everyone';
const usage = 'Share usage and diagnostics';

describe('DataControlsSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useEntitlementsMock.mockReturnValue(entitlementsFromTier('free'));
    mockAllowsUsageMetrics = true;
    mockAllowsAiTraining = false;
    mockTelemetrySwitch = { checked: true, pending: false, forcedOff: false };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    globalThis.window.ENV = clientEnvironment;
  });

  it('replaces the training choice with the no-train guarantee on paid tiers (T15/AD15)', () => {
    useEntitlementsMock.mockReturnValue(entitlementsFromTier('pro'));

    render(<DataControlsSettings />);

    const toggle = screen.getByRole('switch', { name: improve });
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAttribute('data-state', 'unchecked');
    expect(screen.getByRole('group', { name: improve })).toHaveAccessibleDescription(
      /your plan never uses your chats/i,
    );
  });

  it('lets free-tier users choose whether their chats improve the service', async () => {
    render(<DataControlsSettings />);
    const user = userEvent.setup();

    const toggle = screen.getByRole('switch', { name: improve });
    expect(toggle).toBeEnabled();
    expect(screen.getByRole('group', { name: improve })).toHaveAccessibleDescription(
      /control whether your chats are used for improving the service/i,
    );
    await user.click(toggle);

    expect(mockUpdatePreferences).toHaveBeenCalledWith({ allowsAiTraining: true });
  });

  it.each(['free', 'pro'] as const)(
    'should link privacy details to the public website from a build that runs none (%s)',
    (tier) => {
      useEntitlementsMock.mockReturnValue(entitlementsFromTier(tier));

      render(<DataControlsSettings />);

      const links = screen.getAllByRole('link', { name: 'Learn more' });
      expect(links.length).toBeGreaterThan(0);
      for (const link of links) {
        expect(link).toHaveAttribute('href', 'https://tau.new/legal/privacy#9.2.1-ai-service-improvement');
        expect(link).toHaveAttribute('target', '_blank');
      }
    },
  );

  it.each(['free', 'pro'] as const)(
    'should link privacy details to the website of the deployment the app is bound to (%s)',
    (tier) => {
      useEntitlementsMock.mockReturnValue(entitlementsFromTier(tier));
      vi.stubEnv('TAU_TARGET', 'desktop');
      globalThis.window.ENV = {
        ...clientEnvironment,
        // eslint-disable-next-line @typescript-eslint/naming-convention -- `window.ENV`'s keys are the deployment's own environment variable names.
        TAU_FRONTEND_URL: 'https://taucad.dev',
      };

      render(<DataControlsSettings />);

      const links = screen.getAllByRole('link', { name: 'Learn more' });
      expect(links.length).toBeGreaterThan(0);
      for (const link of links) {
        expect(link).toHaveAttribute('href', 'https://taucad.dev/legal/privacy#9.2.1-ai-service-improvement');
      }
    },
  );

  it.each(['free', 'pro'] as const)(
    'should offer the usage and diagnostics switch beside the training choice on every tier (%s)',
    async (tier) => {
      useEntitlementsMock.mockReturnValue(entitlementsFromTier(tier));
      render(<DataControlsSettings />);
      const user = userEvent.setup();

      expect(screen.getByRole('switch', { name: usage })).toHaveAttribute('data-state', 'checked');
      expect(screen.getByRole('group', { name: usage })).toHaveAccessibleDescription(
        /anonymous data about how tau runs/i,
      );
      // The full disclosure, including what the switch does not yet stop, is one focus away.
      await user.hover(screen.getByRole('button', { name: 'About share usage and diagnostics' }));
      expect(
        await screen.findAllByText(/never includes prompts, code, parameter values, file names or geometry/i),
      ).not.toHaveLength(0);
      expect(screen.getAllByText(/may still be sent while this is off/i)).not.toHaveLength(0);
    },
  );

  it('should route switching usage and diagnostics off through the one switch', async () => {
    render(<DataControlsSettings />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('switch', { name: usage }));

    expect(mockTelemetryChange).toHaveBeenCalledWith(false);
  });

  it('should render the switch as off when the resolved consent is off', () => {
    mockTelemetrySwitch = { checked: false, pending: false, forcedOff: false };

    render(<DataControlsSettings />);

    expect(screen.getByRole('switch', { name: usage })).toHaveAttribute('data-state', 'unchecked');
  });

  it('should disable the switch and say why when GPC or declined analytics force it off', () => {
    mockTelemetrySwitch = { checked: false, pending: false, forcedOff: true };

    render(<DataControlsSettings />);

    expect(screen.getByRole('switch', { name: usage })).toBeDisabled();
    expect(screen.getByRole('group', { name: usage })).toHaveAccessibleDescription(/global privacy control/i);
  });

  it('should disable the switch while a signed-in preference loads', () => {
    mockTelemetrySwitch = { checked: false, pending: true, forcedOff: false };

    render(<DataControlsSettings />);

    expect(screen.getByRole('switch', { name: usage })).toBeDisabled();
  });

  it('opens cookie preferences from its row', async () => {
    render(<DataControlsSettings />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Manage' }));

    expect(await screen.findByRole('dialog', { name: 'Cookie preferences' })).toBeInTheDocument();
  });

  it('shows agent recording and account closure on the same page', () => {
    render(<DataControlsSettings />);

    expect(screen.getByTestId('agent-observability-settings')).toBeInTheDocument();
    expect(screen.getByTestId('account-closure')).toBeInTheDocument();
  });
});
