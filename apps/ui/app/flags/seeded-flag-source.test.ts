// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

/*
 * The end-to-end flag source (FL4 harness, T0.4): in an undeployed debug build a seeded flag state replaces the
 * PostHog client's values for the life of the page; a deployed build ignores the seed. Each case loads the flag
 * modules fresh, because the seed is read once when they load.
 */

const environment = vi.hoisted(() => {
  const value: Record<string, unknown> = {};
  return { value };
});
vi.mock('#environment.config.js', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- mirrors environment.config's exported ENV.
  get ENV() {
    return environment.value;
  },
}));

type Seeded = typeof globalThis & { __TAU_E2E_POSTHOG_FLAGS__?: unknown; __tauFeatureFlags?: () => unknown };

type Build = { debug: boolean; deployContext?: string };

const load = async ({ debug, deployContext }: Build, seed: unknown) => {
  vi.resetModules();
  // eslint-disable-next-line @typescript-eslint/naming-convention -- the environment.config keys.
  environment.value = { TAU_DEBUG: debug, TAU_DEPLOY_CONTEXT: deployContext };
  (globalThis as Seeded).__TAU_E2E_POSTHOG_FLAGS__ = seed;
  const remote = await import('#flags/remote-flags.js');
  const flags = await import('#flags/feature-flags.js');
  return { remote, flags };
};

afterEach(() => {
  delete (globalThis as Seeded).__TAU_E2E_POSTHOG_FLAGS__;
  delete (globalThis as Seeded).__tauFeatureFlags;
});

const client = (variants: Record<string, boolean>) => ({
  featureFlags: { getFlagVariants: () => variants },
  onFeatureFlags(callback: () => void) {
    callback();
    return () => undefined;
  },
});

describe('seeded end-to-end flag state', () => {
  it.each([
    ['all-off', {}, { viewerControls: false, onboarding: false, onboardingAutoOpen: false }],
    [
      'viewer-controls',
      { 'viewer-controls': true },
      { viewerControls: true, onboarding: false, onboardingAutoOpen: false },
    ],
    [
      'all-on',
      { 'viewer-controls': true, onboarding: true, 'onboarding-auto-open': true },
      { viewerControls: true, onboarding: true, onboardingAutoOpen: true },
    ],
    [
      'viewer-controls-onboarding',
      { 'viewer-controls': true, onboarding: true, 'onboarding-auto-open': false },
      { viewerControls: true, onboarding: true, onboardingAutoOpen: false },
    ],
  ])('resolves the %s state in an undeployed debug build', async (_name, seed, expected) => {
    const { flags } = await load({ debug: true }, seed);
    expect(flags.getAllFlags()).toMatchObject(expected);
    expect((globalThis as Seeded).__tauFeatureFlags?.()).toMatchObject(expected);
  });

  it('keeps the seeded state when a PostHog client evaluates or is withdrawn', async () => {
    const { remote, flags } = await load({ debug: true }, { 'viewer-controls': true });
    remote.connectRemoteFlags(client({ 'viewer-controls': false, onboarding: true }));
    expect(flags.getAllFlags()).toMatchObject({ viewerControls: true, onboarding: false });
    remote.disconnectRemoteFlags();
    expect(flags.isFeatureEnabled('viewerControls')).toBe(true);
  });

  it('still applies requires to a seeded state', async () => {
    const { flags } = await load({ debug: true }, { 'onboarding-auto-open': true });
    expect(flags.isFeatureEnabled('onboardingAutoOpen')).toBe(false);
  });

  it.each([
    ['a deployed build carrying TAU_DEBUG', { debug: true, deployContext: 'production' }],
    ['a build without TAU_DEBUG', { debug: false }],
  ])('ignores the seed and installs no probe in %s', async (_name, env) => {
    const { remote, flags } = await load(env, { onboarding: true });
    expect(remote.isSeededFlagSourceAllowed).toBe(false);
    expect(flags.isFeatureEnabled('onboarding')).toBe(false);
    expect((globalThis as Seeded).__tauFeatureFlags).toBeUndefined();
    // PostHog stays the source there.
    remote.connectRemoteFlags(client({ onboarding: true }));
    expect(flags.isFeatureEnabled('onboarding')).toBe(true);
    remote.disconnectRemoteFlags();
  });

  it('falls back to PostHog when nothing usable is seeded', async () => {
    const { remote, flags } = await load({ debug: true }, 'viewer-controls');
    expect(remote.readRemoteFlagValues()).toBeUndefined();
    remote.connectRemoteFlags(client({ 'viewer-controls': true }));
    expect(flags.isFeatureEnabled('viewerControls')).toBe(true);
    remote.disconnectRemoteFlags();
  });
});
