import { describe, expect, it } from 'vitest';
import { redactInvitationTokens } from '#lib/invitation-token.lib.js';

describe('redactInvitationTokens', () => {
  it('removes the token from a plain invitation path', () => {
    expect(redactInvitationTokens('https://tau.new/invitations/AbC-123_xyz')).toBe(
      'https://tau.new/invitations/[redacted]',
    );
    expect(redactInvitationTokens('/invitations/AbC-123_xyz')).toBe('/invitations/[redacted]');
  });

  it('removes it from the percent-encoded copy the sign-in round trip carries', () => {
    expect(redactInvitationTokens('https://tau.new/auth/sign-in?redirectTo=%2Finvitations%2FAbC-123_xyz')).toBe(
      'https://tau.new/auth/sign-in?redirectTo=%2Finvitations%2F[redacted]',
    );
  });

  it('keeps a query string, a fragment and everything that is not a token', () => {
    expect(redactInvitationTokens('/invitations/AbC-123?utm=x#top')).toBe('/invitations/[redacted]?utm=x#top');
    expect(redactInvitationTokens('/projects')).toBe('/projects');
    /* The listing route, which holds no token and must stay legible. */
    expect(redactInvitationTokens('/invitations')).toBe('/invitations');
  });
});
