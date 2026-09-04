import { afterEach, describe, expect, it, vi } from 'vitest';
import { posthogConfig } from '#lib/posthog.lib.js';

/* eslint-disable @typescript-eslint/naming-convention -- mock mirrors the runtime environment contract. */
const environment = vi.hoisted(() => ({
  POSTHOG_CLIENT_KEY: 'initial-key',
  POSTHOG_UI_HOST: 'https://initial-posthog.tau.test',
}));

vi.mock('#environment.config.js', () => ({ ENV: environment }));
/* eslint-enable @typescript-eslint/naming-convention -- mock mirrors the runtime environment contract. */

describe('posthogConfig', () => {
  afterEach(() => {
    environment.POSTHOG_CLIENT_KEY = 'initial-key';
    environment.POSTHOG_UI_HOST = 'https://initial-posthog.tau.test';
  });

  it('should enable deferred extension initialization', () => {
    expect(posthogConfig.options.__preview_deferred_init_extensions).toBe(true);
  });

  it('should set cookieless_mode to on_reject', () => {
    expect(posthogConfig.options.cookieless_mode).toBe('on_reject');
  });

  it('should use api proxy path as api_host', () => {
    expect(posthogConfig.options.api_host).toBe('/api/ph');
  });

  it('should use 2025-11-30 defaults', () => {
    expect(posthogConfig.options.defaults).toBe('2025-11-30');
  });

  it('should disable session recording at init', () => {
    expect(posthogConfig.options.disable_session_recording).toBe(true);
  });

  it('reads PostHog environment values when the config fields are used', () => {
    environment.POSTHOG_CLIENT_KEY = 'late-key';
    environment.POSTHOG_UI_HOST = 'https://late-posthog.tau.test';

    expect(posthogConfig.apiKey).toBe('late-key');
    expect(posthogConfig.options.ui_host).toBe('https://late-posthog.tau.test');
  });
});
