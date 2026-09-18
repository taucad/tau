/**
 * An invitation token is a bearer credential that lives in a URL (charter W5,
 * D27), and analytics is in the business of recording URLs: `history_change`
 * pageviews capture `$current_url` and `$pathname`, autocapture records the
 * `href` of whatever was clicked, and the sign-in round trip carries the whole
 * path back as `?redirectTo=%2Finvitations%2F…`.
 *
 * Anybody who can read the analytics project could then accept the invitation.
 * These rows pin the redaction that keeps the token out of the payload.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('#environment.config.js', () => ({
  /* eslint-disable-next-line @typescript-eslint/naming-convention -- `window.ENV`'s keys are the deployment's own environment variable names. */
  ENV: { POSTHOG_UI_HOST: 'https://us.posthog.com', POSTHOG_CLIENT_KEY: 'phc_test' },
}));
vi.mock('#lib/cookie-consent.lib.js', () => ({ readConsentStatus: () => 'accepted' }));

const { posthogConfig, redactEventProperties, redactInvitationTokens } = await import('#lib/posthog.lib.js');

/** One analytics event, narrowed to what these rows put in it. */
type TestEvent = { event: string; properties?: Record<string, unknown> };

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

describe('redactEventProperties', () => {
  it('rewrites every string property an event carries', () => {
    const event: TestEvent = {
      event: '$pageview',
      properties: {
        // eslint-disable-next-line @typescript-eslint/naming-convention -- PostHog's own property names.
        $current_url: 'https://tau.new/invitations/AbC-123_xyz',

        $pathname: '/invitations/AbC-123_xyz',

        $referrer: 'https://tau.new/auth/sign-in?redirectTo=%2Finvitations%2FAbC-123_xyz',
        // eslint-disable-next-line @typescript-eslint/naming-convention -- PostHog's own property names.
        $screen_height: 900,
      },
    };

    const redacted = redactEventProperties(event);

    expect(redacted.properties).toStrictEqual({
      // eslint-disable-next-line @typescript-eslint/naming-convention -- PostHog's own property names.
      $current_url: 'https://tau.new/invitations/[redacted]',

      $pathname: '/invitations/[redacted]',

      $referrer: 'https://tau.new/auth/sign-in?redirectTo=%2Finvitations%2F[redacted]',
      // eslint-disable-next-line @typescript-eslint/naming-convention -- PostHog's own property names.
      $screen_height: 900,
    });
  });

  it('leaves an event with no properties alone', () => {
    const bare: TestEvent = { event: '$pageview' };
    expect(redactEventProperties(bare)).toStrictEqual({ event: '$pageview' });
  });
});

describe('posthogConfig.before_send', () => {
  it('redacts the event it lets through, so nothing reaches the wire unredacted', () => {
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions, typescript/no-restricted-types -- posthog-js allows an array of hooks and this build configures exactly one, and its own signature returns `null` to drop an event.
    const send = posthogConfig.options.before_send as (event: TestEvent) => TestEvent | null;

    const sent = send({
      event: '$pageview',

      properties: { $pathname: '/invitations/AbC-123_xyz' },
    });

    expect(sent?.properties).toStrictEqual({
      $pathname: '/invitations/[redacted]',
    });
  });
});
