import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { entitlementsFromTier } from '@taucad/billing';
import { store } from '#hooks/use-cookie.js';
import { desktopAnalyticsStorageName } from '#hooks/use-desktop-analytics.js';
import { DataControlsSettings } from '#components/settings/data-controls-settings.js';

/* The settings registry decides which rows exist when it is first evaluated, so the desktop target is set before any
   import runs. */
vi.hoisted(() => {
  vi.stubEnv('TAU_TARGET', 'desktop');
});

vi.mock('@taucad/billing/hooks/use-entitlements', () => ({
  useEntitlements: () => entitlementsFromTier('free'),
}));
vi.mock('react-router', () => ({
  useSearchParams: (): [URLSearchParams, () => void] => [new URLSearchParams(), vi.fn()],
  useRouteLoaderData: (): undefined => undefined,
}));
vi.mock('@better-auth-ui/react', () => ({ useSession: () => ({ data: undefined, isPending: false }) }));
vi.mock('#lib/auth-client.js', () => ({ authClient: {} }));
vi.mock('#hooks/use-privacy-preferences.js', () => ({
  usePrivacyPreferences: () => ({
    preferences: undefined,
    isLoading: false,
    error: undefined,
    updatePreferences: vi.fn(),
    isUpdating: false,
  }),
}));
vi.mock('#hooks/use-telemetry-purposes.js', () => ({
  useTelemetryPurposes: () => ({ canDecide: false, decide: vi.fn(), isDeciding: false }),
}));
vi.mock('#components/cookie-preferences.js', () => ({ CookiePreferencesDialog: (): undefined => undefined }));
vi.mock('#cloud/settings-billing.js', () => ({
  CloudAccountClosure: (): ReactElement => <div data-testid='account-closure' />,
}));

afterAll(() => {
  vi.unstubAllEnvs();
});

describe('DataControlsSettings on desktop', () => {
  beforeEach(() => {
    store.remove(desktopAnalyticsStorageName);
  });

  it('should offer an analytics switch, on by default, in place of cookie preferences', () => {
    render(<DataControlsSettings />);

    expect(screen.getByRole('switch', { name: 'Analytics' })).toHaveAttribute('data-state', 'checked');
    expect(screen.getByRole('group', { name: 'Analytics' })).toHaveAccessibleDescription(
      /send usage analytics to help improve tau/i,
    );
    expect(screen.getByRole('link', { name: 'Learn more' })).toHaveAttribute(
      'href',
      expect.stringMatching(/\/legal\/cookies$/),
    );
    expect(screen.queryByRole('group', { name: 'Cookie preferences' })).not.toBeInTheDocument();
  });

  it('should keep the choice on this device when turned off, and resume when turned back on', async () => {
    render(<DataControlsSettings />);
    const user = userEvent.setup();
    const toggle = screen.getByRole('switch', { name: 'Analytics' });

    await user.click(toggle);
    expect(toggle).toHaveAttribute('data-state', 'unchecked');
    expect(localStorage.getItem(desktopAnalyticsStorageName)).toBe('false');

    await user.click(toggle);
    expect(toggle).toHaveAttribute('data-state', 'checked');
    expect(localStorage.getItem(desktopAnalyticsStorageName)).toBe('true');
  });

  it('should show a turned-off choice as off after a relaunch', () => {
    localStorage.setItem(desktopAnalyticsStorageName, 'false');

    render(<DataControlsSettings />);

    expect(screen.getByRole('switch', { name: 'Analytics' })).toHaveAttribute('data-state', 'unchecked');
  });
});
