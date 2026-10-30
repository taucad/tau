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

let mockSession: { user: { id: string } } | undefined;
vi.mock('@better-auth-ui/react', () => ({
  useSession: () => ({ data: mockSession, isPending: false }),
}));
vi.mock('#lib/auth-client.js', () => ({ authClient: {} }));

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

const mockDecide = vi.fn(async () => ({}));
let mockCanDecide: boolean;
vi.mock('#hooks/use-telemetry-purposes.js', () => ({
  useTelemetryPurposes: () => ({ canDecide: mockCanDecide, decide: mockDecide, isDeciding: false }),
}));

const improve = 'Improve the service for everyone';
const usage = 'Share usage and diagnostics';

describe('DataControlsSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useEntitlementsMock.mockReturnValue(entitlementsFromTier('free'));
    mockAllowsUsageMetrics = true;
    mockAllowsAiTraining = false;
    mockSession = { user: { id: 'user-a' } };
    mockCanDecide = false;
    mockTelemetrySwitch = { checked: true, pending: false, forcedOff: false };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    globalThis.window.ENV = clientEnvironment;
  });

  it("lets a paid plan opt in, showing the server's default-off answer", async () => {
    useEntitlementsMock.mockReturnValue(entitlementsFromTier('pro'));
    render(<DataControlsSettings />);
    const user = userEvent.setup();

    const toggle = screen.getByRole('switch', { name: improve });
    expect(toggle).toBeEnabled();
    expect(toggle).toHaveAttribute('data-state', 'unchecked');
    await user.click(toggle);

    expect(mockUpdatePreferences).toHaveBeenCalledWith({ allowsAiTraining: true });
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

  it('asks a signed-out visitor to sign in before choosing', () => {
    mockSession = undefined;
    render(<DataControlsSettings />);

    expect(screen.getByRole('switch', { name: improve })).toBeDisabled();
    expect(screen.getByRole('group', { name: improve })).toHaveAccessibleDescription('Sign in to choose');
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

  it('records each improvement purpose with the one switch once a recording notice is in force', async () => {
    mockCanDecide = true;
    render(<DataControlsSettings />);

    await userEvent.click(screen.getByRole('switch', { name: improve }));

    expect(mockUpdatePreferences).toHaveBeenCalledWith({ allowsAiTraining: true });
    expect(mockDecide).toHaveBeenCalledWith([
      { purpose: 'summary', granted: true },
      { purpose: 'content', granted: true },
      { purpose: 'reuse', granted: true },
      { purpose: 'training', granted: true },
    ]);
  });

  it('withdraws every improvement purpose and the rating grant when switched off', async () => {
    mockCanDecide = true;
    mockAllowsAiTraining = true;
    render(<DataControlsSettings />);

    await userEvent.click(screen.getByRole('switch', { name: improve }));

    expect(mockDecide).toHaveBeenCalledWith(
      ['summary', 'content', 'reuse', 'training', 'feedback'].map((purpose) => ({ purpose, granted: false })),
    );
  });

  it('records no recording decision while no notice is in force', async () => {
    render(<DataControlsSettings />);

    await userEvent.click(screen.getByRole('switch', { name: improve }));

    expect(mockUpdatePreferences).toHaveBeenCalledWith({ allowsAiTraining: true });
    expect(mockDecide).not.toHaveBeenCalled();
  });

  it('keeps data controls to four rows, with account closure last', () => {
    render(<DataControlsSettings />);

    for (const name of [usage, improve, 'Cookie preferences']) {
      expect(screen.getByRole('group', { name })).toBeInTheDocument();
    }
    expect(screen.queryByText('Agent recording')).not.toBeInTheDocument();
    expect(screen.getByTestId('account-closure')).toBeInTheDocument();
  });
});
