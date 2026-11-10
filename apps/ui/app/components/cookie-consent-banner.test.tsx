// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as ReactRouter from 'react-router';
import { readConsentCookie, writeConsent } from '@taucad/consent';
import { CookieConsentBanner } from '#components/cookie-consent-banner.js';

vi.mock('react-router', async (loadOriginal) => ({
  ...(await loadOriginal<typeof ReactRouter>()),
  useRouteLoaderData: () => undefined,
}));

const setNavigator = (name: 'doNotTrack' | 'globalPrivacyControl', value: unknown): void => {
  Object.defineProperty(navigator, name, { configurable: true, value });
};

afterEach(() => {
  writeConsent(undefined);
  setNavigator('globalPrivacyControl', false);
  setNavigator('doNotTrack', null);
});

describe('Cookie consent banner', () => {
  it('should offer analytics to a visitor with no decision and record acceptance in the shared cookie', async () => {
    render(<CookieConsentBanner />);

    expect(screen.getByRole('complementary', { name: 'Optional analytics' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cookie policy' })).toHaveAttribute(
      'href',
      expect.stringMatching(/\/legal\/cookies$/u),
    );
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Allow analytics' }));
    });

    expect(readConsentCookie(document.cookie)).toBe('accepted');
    // The shared channel announces the write to this document too, so the banner goes as other tabs' would.
    await waitFor(() => {
      expect(screen.queryByRole('complementary', { name: 'Optional analytics' })).not.toBeInTheDocument();
    });
  });

  it('should record a decline and then stay hidden', async () => {
    render(<CookieConsentBanner />);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Continue without' }));
    });

    expect(readConsentCookie(document.cookie)).toBe('declined');
    await waitFor(() => {
      expect(screen.queryByRole('complementary', { name: 'Optional analytics' })).not.toBeInTheDocument();
    });
  });

  it('should not show once the website recorded a decision', () => {
    writeConsent('declined');
    render(<CookieConsentBanner />);

    expect(screen.queryByRole('complementary', { name: 'Optional analytics' })).not.toBeInTheDocument();
  });

  it('should not show under Global Privacy Control or Do Not Track', () => {
    setNavigator('globalPrivacyControl', true);
    const gpc = render(<CookieConsentBanner />);
    expect(screen.queryByRole('complementary', { name: 'Optional analytics' })).not.toBeInTheDocument();
    gpc.unmount();

    setNavigator('globalPrivacyControl', false);
    setNavigator('doNotTrack', '1');
    render(<CookieConsentBanner />);
    expect(screen.queryByRole('complementary', { name: 'Optional analytics' })).not.toBeInTheDocument();
  });
});
