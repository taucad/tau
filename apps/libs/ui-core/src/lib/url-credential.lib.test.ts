import { describe, expect, it } from 'vitest';
import { redactUrlCredentials, urlCarriesCredential } from '#lib/url-credential.lib.js';

describe('redactUrlCredentials', () => {
  it('removes the token from a plain invitation path', () => {
    expect(redactUrlCredentials('https://tau.new/invitations/AbC-123_xyz')).toBe(
      'https://tau.new/invitations/[redacted]',
    );
    expect(redactUrlCredentials('/invitations/AbC-123_xyz')).toBe('/invitations/[redacted]');
  });

  it('removes it from the percent-encoded copy the sign-in round trip carries', () => {
    expect(redactUrlCredentials('https://tau.new/auth/sign-in?redirectTo=%2Finvitations%2FAbC-123_xyz')).toBe(
      'https://tau.new/auth/sign-in?redirectTo=%2Finvitations%2F[redacted]',
    );
  });

  it('keeps a query string, a fragment and everything that is not a token', () => {
    expect(redactUrlCredentials('/invitations/AbC-123?utm=x#top')).toBe('/invitations/[redacted]?utm=x#top');
    expect(redactUrlCredentials('/projects')).toBe('/projects');
    /* The listing route, which holds no token and must stay legible. */
    expect(redactUrlCredentials('/invitations')).toBe('/invitations');
  });

  it('removes sign-in tokens, OAuth codes and device codes from the query', () => {
    expect(redactUrlCredentials('https://tau.new/auth/reset-password?token=abc.DEF-123')).toBe(
      'https://tau.new/auth/reset-password?token=[redacted]',
    );
    expect(redactUrlCredentials('/auth/verify-email?callbackURL=%2F&token=eyJ.x.y#done')).toBe(
      '/auth/verify-email?callbackURL=%2F&token=[redacted]#done',
    );
    expect(redactUrlCredentials('/api/auth/callback/github?code=gho_1&state=s')).toBe(
      '/api/auth/callback/github?code=[redacted]&state=s',
    );
    expect(redactUrlCredentials('/auth/cli?user_code=ABCD-EFGH')).toBe('/auth/cli?user_code=[redacted]');
  });

  it('removes a sign-in token whose parameter name is percent-encoded', () => {
    expect(redactUrlCredentials('/auth/reset-password?%74oken=abc.DEF-123')).toBe(
      '/auth/reset-password?%74oken=[redacted]',
    );
    expect(redactUrlCredentials('/auth/cli?USER%5FCODE=ABCD')).toBe('/auth/cli?USER%5FCODE=[redacted]');
    // `codec=` is a different parameter and stays legible.
    expect(redactUrlCredentials('/convert?codec=h264')).toBe('/convert?codec=h264');
  });

  it('removes a sign-in token nested inside an encoded redirect', () => {
    expect(redactUrlCredentials('/auth/sign-in?redirectTo=%2Fauth%2Fmagic%3Ftoken%3Dabc%26next%3D1')).toBe(
      '/auth/sign-in?redirectTo=%2Fauth%2Fmagic%3Ftoken%3D[redacted]%26next%3D1',
    );
  });

  it('keeps parameters that only resemble a credential name', () => {
    expect(redactUrlCredentials('/docs?access_token_help=1&codec=h264&tokens=2')).toBe(
      '/docs?access_token_help=1&codec=h264&tokens=2',
    );
  });
});

describe('urlCarriesCredential', () => {
  it.each([
    '/invitations/AbC-123_xyz',
    'https://tau.new/auth/sign-in?redirectTo=%2Finvitations%2FAbC-123_xyz',
    '/auth/reset-password?token=abc.DEF-123',
    '/api/auth/callback/github?code=gho_1&state=s',
    '/auth/cli?user_code=ABCD-EFGH',
    // A browser reads a percent-encoded name as the plain one.
    '/auth/reset-password?%74oken=abc.DEF-123',
    '/auth/cli?user%5Fcode=ABCD-EFGH',
    '/auth/sign-in?redirectTo=%2Fauth%2Freset-password%3F%2574oken%3Dabc',
  ])('answers true for %s', (url) => {
    expect(urlCarriesCredential(url)).toBe(true);
  });

  it.each([
    '/',
    '/invitations',
    '/projects?view=grid#top',
    '/invitations/[redacted]',
    '/auth/sign-in?redirectTo=%2Finvitations',
  ])('answers false for %s', (url) => {
    expect(urlCarriesCredential(url)).toBe(false);
  });

  it('answers the same on every call, so it can gate a render', () => {
    const url = '/invitations/AbC-123_xyz';
    expect([urlCarriesCredential(url), urlCarriesCredential(url), urlCarriesCredential(url)]).toStrictEqual([
      true,
      true,
      true,
    ]);
  });
});
