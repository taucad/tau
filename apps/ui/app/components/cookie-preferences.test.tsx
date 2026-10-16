// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as ReactRouter from 'react-router';
import { readConsentCookie, writeConsent } from '@taucad/consent';
import { CookiePreferencesDialog } from '#components/cookie-preferences.js';

vi.mock('react-router', async (loadOriginal) => ({
  ...(await loadOriginal<typeof ReactRouter>()),
  useRouteLoaderData: () => undefined,
}));

afterEach(() => {
  writeConsent(undefined);
  Object.defineProperty(navigator, 'globalPrivacyControl', { configurable: true, value: false });
});

describe('Cookie preferences dialog', () => {
  it('should record acceptance in the cookie the website shares', () => {
    const onOpenChange = vi.fn();
    render(<CookiePreferencesDialog isOpen onOpenChange={onOpenChange} />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Product analytics' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(readConsentCookie(document.cookie)).toBe('accepted');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('should show an accepted decision and record its withdrawal', () => {
    writeConsent('accepted');
    render(<CookiePreferencesDialog isOpen onOpenChange={vi.fn()} />);

    const analytics = screen.getByRole('checkbox', { name: 'Product analytics' });
    expect(analytics).toBeChecked();
    fireEvent.click(analytics);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(readConsentCookie(document.cookie)).toBe('declined');
  });

  it('should hold analytics off under Global Privacy Control', () => {
    Object.defineProperty(navigator, 'globalPrivacyControl', { configurable: true, value: true });
    render(<CookiePreferencesDialog isOpen onOpenChange={vi.fn()} />);

    expect(screen.getByRole('checkbox', { name: 'Product analytics' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(readConsentCookie(document.cookie)).toBe('declined');
  });
});
