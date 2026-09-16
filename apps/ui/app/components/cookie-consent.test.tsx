// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { CookieConsent, CookiePreferencesDialog } from '#components/cookie-consent.js';

const consent = vi.hoisted(() => ({ set: vi.fn(), status: 'unknown' as 'unknown' | 'accepted' | 'declined' }));
const privacy = vi.hoisted(() => ({ globalPrivacyControl: false }));

vi.mock('#hooks/use-cookie-consent.js', () => ({
  useCookieConsent: () => [consent.status, consent.set],
}));
vi.mock('#lib/cookie-consent.lib.js', () => ({
  isGlobalPrivacyControlEnabled: () => privacy.globalPrivacyControl,
}));

describe('CookieConsent', () => {
  beforeEach(() => {
    consent.status = 'unknown';
    consent.set.mockClear();
    privacy.globalPrivacyControl = false;
  });

  it('should show immediately only when the web consent decision is unknown', () => {
    const view = render(<CookieConsent />);
    expect(screen.getByRole('heading', { name: 'Cookies' })).toBeInTheDocument();
    // Accept bypasses Manage, so the first layer itself names replay.
    expect(screen.getByText(/including session recording/i)).toBeInTheDocument();

    consent.status = 'accepted';
    view.rerender(<CookieConsent />);
    expect(screen.queryByRole('heading', { name: 'Cookies' })).toBeNull();
  });

  it('should give accept and decline equivalent controls', () => {
    render(<CookieConsent />);

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(consent.set).toHaveBeenCalledWith('accepted');
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
    expect(consent.set).toHaveBeenCalledWith('declined');
    expect(screen.getByRole('button', { name: 'Accept' }).className).toBe(
      screen.getByRole('button', { name: 'Decline' }).className,
    );
  });

  it('should let a user enable analytics after a previous decline', () => {
    consent.status = 'declined';
    render(
      <MemoryRouter>
        <CookiePreferencesDialog isOpen onOpenChange={vi.fn()} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'Product analytics' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(consent.set).toHaveBeenCalledWith('accepted');
  });

  it('should keep analytics disabled while Global Privacy Control is active', () => {
    consent.status = 'accepted';
    privacy.globalPrivacyControl = true;
    render(
      <MemoryRouter>
        <CookiePreferencesDialog isOpen onOpenChange={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('checkbox', { name: 'Product analytics' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(consent.set).toHaveBeenCalledWith('declined');
  });
});
