/* eslint-disable @typescript-eslint/naming-convention -- PostHog and environment APIs use snake/constant case. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CaptureResult } from 'posthog-js';
import { posthogConfig } from '#lib/posthog.lib.js';

const state = vi.hoisted(() => ({ consent: 'accepted' as 'accepted' | 'declined' }));
const environment = vi.hoisted(() => ({
  POSTHOG_CLIENT_KEY: 'initial-key',
  POSTHOG_UI_HOST: 'https://initial-posthog.tau.test',
}));

vi.mock('#lib/cookie-consent.lib.js', () => ({ readConsentStatus: () => state.consent }));
vi.mock('#environment.config.js', () => ({ ENV: environment }));

describe('posthogConfig', () => {
  afterEach(() => {
    environment.POSTHOG_CLIENT_KEY = 'initial-key';
    environment.POSTHOG_UI_HOST = 'https://initial-posthog.tau.test';
    state.consent = 'accepted';
  });

  it('should keep accepted web analytics BAU with SPA pageviews and no opt-out workarounds', () => {
    const { before_send: beforeSend, ...staticOptions } = posthogConfig.options;
    expect(staticOptions).toEqual({
      __preview_deferred_init_extensions: true,
      api_host: '/api/ph',
      autocapture: true,
      capture_dead_clicks: true,
      capture_pageleave: true,
      capture_pageview: 'history_change',
      defaults: '2025-11-30',
      disable_session_recording: true,
      persistence: 'localStorage+cookie',
      ui_host: 'https://initial-posthog.tau.test',
    });
    expect(Object.keys(posthogConfig.options).sort()).toStrictEqual([
      '__preview_deferred_init_extensions',
      'api_host',
      'autocapture',
      'before_send',
      'capture_dead_clicks',
      'capture_pageleave',
      'capture_pageview',
      'defaults',
      'disable_session_recording',
      'persistence',
      'ui_host',
    ]);
    expect(typeof beforeSend).toBe('function');
    expect(posthogConfig.options.cookieless_mode).toBeUndefined();
  });

  it('should discard events immediately after withdrawal', () => {
    const event: CaptureResult = { event: 'example', properties: {}, uuid: 'event-id' };
    const beforeSend = posthogConfig.options.before_send;
    expect(typeof beforeSend).toBe('function');
    if (typeof beforeSend !== 'function') {
      throw new TypeError('Expected a single before_send function');
    }
    expect(beforeSend(event)).toBe(event);
    state.consent = 'declined';
    expect(beforeSend(event)).toBeNull();
  });

  it('should read PostHog environment values lazily', () => {
    environment.POSTHOG_CLIENT_KEY = 'late-key';
    environment.POSTHOG_UI_HOST = 'https://late-posthog.tau.test';

    expect(posthogConfig.apiKey).toBe('late-key');
    expect(posthogConfig.options.ui_host).toBe('https://late-posthog.tau.test');
  });
});
