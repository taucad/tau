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

const consent = vi.hoisted(() => ({ status: 'accepted' }));

vi.mock('#environment.config.js', () => ({
  /* eslint-disable-next-line @typescript-eslint/naming-convention -- `window.ENV`'s keys are the deployment's own environment variable names. */
  ENV: { POSTHOG_UI_HOST: 'https://us.posthog.com', POSTHOG_CLIENT_KEY: 'phc_test' },
}));
vi.mock('#lib/cookie-consent.lib.js', () => ({ readConsentStatus: () => consent.status }));

const { posthogConfig, redactEventProperties } = await import('#lib/posthog.lib.js');

/** One analytics event, narrowed to what these rows put in it. */
type TestEvent = { event: string; properties?: Record<string, unknown> };

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

  it('redacts invitation URLs inside replay metadata and DOM attributes', () => {
    const event: TestEvent = {
      event: '$snapshot',
      properties: {
        // eslint-disable-next-line @typescript-eslint/naming-convention -- PostHog replay wire property
        $snapshot_data: [
          { data: { node: { attributes: { href: '/invitations/AbC-123_xyz' } } } },
          { data: { href: '/projects', textContent: 'Public heading' } },
        ],
      },
    };
    const redacted = redactEventProperties(event);
    expect(JSON.stringify(redacted)).not.toContain('AbC-123_xyz');
    expect(JSON.stringify(redacted)).toContain('/invitations/[redacted]');
    expect(JSON.stringify(redacted)).toContain('Public heading');
  });

  it('preserves non-plain event property values', () => {
    const when = new Date('2026-09-29T00:00:00.000Z');
    const event: TestEvent = { event: 'dated', properties: { when } };
    expect(redactEventProperties(event).properties?.['when']).toBe(when);
  });
});

describe('posthogConfig.before_send', () => {
  it.each(['unknown', 'declined'])('drops events when consent is %s', (status) => {
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions, typescript/no-restricted-types -- This configuration installs one SDK hook.
    const send = posthogConfig.options.before_send as (event: TestEvent) => TestEvent | null;
    consent.status = status;
    expect(send({ event: 'product_event', properties: { location: '/projects' } })).toBeNull();
    consent.status = 'accepted';
  });

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

it('redacts recorder Meta and network URLs before replay compression', () => {
  const mask = posthogConfig.options.session_recording?.maskCapturedNetworkRequestFn;
  expect(mask).toBeDefined();
  const redacted = mask?.({
    name: 'https://tau.new/auth?redirectTo=%2Finvitations%2FAbC-123_xyz',
    entryType: 'resource',
    duration: 0,
    startTime: 0,
  });
  expect(redacted?.name).toBe('https://tau.new/auth?redirectTo=%2Finvitations%2F[redacted]');
});

it('masks all replay text and inputs while still blocking invitation links', () => {
  const recording = posthogConfig.options.session_recording;
  expect(recording?.maskTextSelector).toBe('*');
  expect(recording?.maskAllInputs).toBe(true);
  expect(recording?.blockSelector).toContain('a[href*="/invitations/"]');
});
