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
vi.mock('#lib/global-privacy-control.lib.js', () => ({
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

  it('should expose the banner as a named region with a reduced-motion-safe entrance', () => {
    render(<CookieConsent />);

    const banner = screen.getByRole('region', { name: 'Cookie preferences' });
    // Jsdom evaluates no media queries, so the contract is that the entrance only runs under motion-safe.
    expect(banner).toHaveClass('motion-safe:animate-in');
    expect(banner).not.toHaveClass('animate-in');
  });

  it('should keep focused controls clear of the banner only while it is shown', () => {
    const view = render(<CookieConsent />);
    expect(document.body).toHaveClass('[&_:focus]:scroll-mb-48');

    consent.status = 'declined';
    view.rerender(<CookieConsent />);
    expect(document.body).not.toHaveClass('[&_:focus]:scroll-mb-48');
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
