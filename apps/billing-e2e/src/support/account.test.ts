import { describe, expect, it } from 'vitest';
import { findMailLink } from '#support/account.js';

describe('findMailLink', () => {
  it('should find the verification link in a text part', () => {
    const link = findMailLink(
      ['Confirm: https://taucad.dev/auth/verify-email?token=abc.def&redirectTo=/ thanks'],
      '/auth/verify-email',
    );
    expect(link?.href).toBe('https://taucad.dev/auth/verify-email?token=abc.def&redirectTo=/');
  });

  it('should undo HTML ampersands in an HTML part', () => {
    const link = findMailLink(
      ['', '<a href="https://taucad.dev/auth/magic-link/verify?callbackURL=%2F&amp;token=xyz">Sign in</a>'],
      '/auth/magic-link/verify',
    );
    expect(link?.searchParams.get('token')).toBe('xyz');
    expect(link?.searchParams.get('callbackURL')).toBe('/');
  });

  it('should ignore links to other paths and links without a token', () => {
    expect(
      findMailLink(
        ['https://taucad.dev/auth/verify-email?token=abc', 'https://taucad.dev/auth/magic-link/verify?next=/'],
        '/auth/magic-link/verify',
      ),
    ).toBeUndefined();
  });
});
