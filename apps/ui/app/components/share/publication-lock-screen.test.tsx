import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, it, expect, vi } from 'vitest';
import { PublicationLockScreen, parsePublicationLockPayload } from '#components/share/publication-lock-screen.js';
import type { PublicationLockScreenVariant } from '#components/share/publication-lock-screen.js';

vi.mock('#hooks/use-auth-links.js', () => ({
  useAuthLinks: () => ({
    signIn: '/auth/sign-in?redirectTo=%2Fs%2Ftau~pub',
    magicLink: '/auth/magic-link?redirectTo=%2Fs%2Ftau~pub',
    signUp: '/auth/sign-up?redirectTo=%2Fs%2Ftau~pub',
    signOut: '/auth/sign-out?redirectTo=%2Fs%2Ftau~pub',
  }),
}));

const variantHeadlines: ReadonlyArray<[PublicationLockScreenVariant, RegExp]> = [
  ['signInRequired', /this design is private/i],
  ['accessDenied', /your account doesn't have access/i],
  ['notFound', /doesn't exist/i],
  ['unpublished', /unpublished/i],
  ['rateLimited', /too many requests/i],
  ['serviceUnavailable', /can't load this design right now/i],
  ['filesUnavailable', /can't load this design's files/i],
];

describe('PublicationLockScreen', () => {
  const renderLock = (ui: ReactElement) => {
    return render(<MemoryRouter>{ui}</MemoryRouter>);
  };

  it.each(variantHeadlines)('variant %s renders expected headline', (variant, headline) => {
    renderLock(<PublicationLockScreen variant={variant} />);
    expect(screen.getByRole('heading', { level: 1, name: headline })).toBeInTheDocument();
  });

  it.each(variantHeadlines)('variant %s does not surface API-style diagnostics', (variant) => {
    renderLock(<PublicationLockScreen variant={variant} />);
    expect(screen.queryByText(/requestid/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/owner_leak_title/i)).not.toBeInTheDocument();
  });

  it('inline mode applies full-size layout classes', () => {
    const { container } = renderLock(<PublicationLockScreen variant='serviceUnavailable' isInline />);
    expect(container.firstChild).toHaveClass('size-full');
  });

  it('routes private-publication sign-in through the magic-link auth surface', () => {
    renderLock(<PublicationLockScreen variant='signInRequired' />);
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute(
      'href',
      '/auth/magic-link?redirectTo=%2Fs%2Ftau~pub',
    );
  });
});

describe('parsePublicationLockPayload', () => {
  it('parses JSON string bodies', () => {
    expect(parsePublicationLockPayload(JSON.stringify({ reason: 'not-found' }))).toBe('not-found');
  });

  it('parses object bodies', () => {
    expect(parsePublicationLockPayload({ reason: 'unpublished' })).toBe('unpublished');
  });

  it('returns undefined for unknown reasons', () => {
    expect(parsePublicationLockPayload(JSON.stringify({ reason: 'nope' }))).toBeUndefined();
  });
});
