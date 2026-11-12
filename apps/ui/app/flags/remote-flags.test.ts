// @vitest-environment jsdom
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAllFlags, isFeatureEnabled, resetFlagCache, resolveFlags } from '#flags/feature-flags.js';
import { featureFlagDefaults, featureFlagNames, flagRegistry } from '#flags/flag.constants.js';
import type { FlagDefinition } from '#flags/flag.constants.js';
import type { RemoteFlagClient } from '#flags/remote-flags.js';
import { connectRemoteFlags, disconnectRemoteFlags, readRemoteFlagValues } from '#flags/remote-flags.js';
import { useFeature } from '#flags/use-feature.js';

/** A PostHog client stand-in: `evaluate` plays a `/flags` response or a console override. */
function createClient(initial?: Record<string, string | boolean>): RemoteFlagClient & {
  readonly listenerCount: () => number;
  evaluate(variants: Record<string, string | boolean>): void;
} {
  let variants = initial;
  const listeners = new Set<() => void>();
  return {
    onFeatureFlags(callback) {
      listeners.add(callback);
      if (variants !== undefined) {
        callback();
      }
      return () => {
        listeners.delete(callback);
      };
    },
    featureFlags: { getFlagVariants: () => variants ?? {} },
    evaluate(next) {
      variants = next;
      for (const listener of listeners) {
        listener();
      }
    },
    listenerCount: () => listeners.size,
  };
}

const emptyStorage: Pick<Storage, 'getItem'> = { getItem: () => null };

afterEach(() => {
  disconnectRemoteFlags();
  resetFlagCache();
});

describe('PostHog-backed flag registry', () => {
  it.each([
    ['viewerControls', 'viewer-controls'],
    ['onboarding', 'onboarding'],
    ['onboardingAutoOpen', 'onboarding-auto-open'],
  ] as const)('declares %s as a hidden flag following PostHog key %s, off by default', (name, key) => {
    const definition: FlagDefinition = flagRegistry[name];
    expect(definition.posthogKey).toBe(key);
    expect(definition.showInExperimental).toBe(false);
    expect(featureFlagDefaults[name]).toBe(false);
  });

  it('names only registered flags in requires', () => {
    for (const name of featureFlagNames) {
      const { requires }: FlagDefinition = flagRegistry[name];
      if (requires !== undefined) {
        expect(featureFlagNames).toContain(requires);
      }
    }
  });
});

describe('remote flag resolution', () => {
  it('resolves to defaults when PostHog is not configured or has not evaluated flags', () => {
    expect(readRemoteFlagValues()).toBeUndefined();
    expect(getAllFlags()).toStrictEqual(featureFlagDefaults);
    // A client that is connected but has not loaded flags yet changes nothing.
    connectRemoteFlags(createClient());
    expect(readRemoteFlagValues()).toBeUndefined();
    expect(isFeatureEnabled('onboarding')).toBe(false);
  });

  it("prefers PostHog's evaluated value over the default once flags load", () => {
    connectRemoteFlags(createClient({ onboarding: true, 'viewer-controls': 'test-variant', unrelated: true }));
    expect(isFeatureEnabled('onboarding')).toBe(true);
    expect(isFeatureEnabled('viewerControls')).toBe(true);
    expect(readRemoteFlagValues()).toStrictEqual({ onboarding: true, viewerControls: true });
  });

  it('keeps the default for a key PostHog did not return and honours an explicit false', () => {
    expect(resolveFlags(emptyStorage, { onboarding: false })).toMatchObject({
      onboarding: false,
      viewerControls: false,
    });
  });

  it('ignores a stored local override for a hidden PostHog-backed flag', () => {
    const storage = { getItem: () => JSON.stringify({ onboarding: true, viewerControls: true }) };
    expect(resolveFlags(storage, undefined)).toMatchObject({ onboarding: false, viewerControls: false });
  });

  it('turns onboardingAutoOpen on only while onboarding is on', () => {
    const resolve = (remote: Parameters<typeof resolveFlags>[1]): boolean =>
      resolveFlags(emptyStorage, remote).onboardingAutoOpen;
    expect(resolve({ onboardingAutoOpen: true })).toBe(false);
    expect(resolve({ onboarding: false, onboardingAutoOpen: true })).toBe(false);
    expect(resolve({ onboarding: true, onboardingAutoOpen: true })).toBe(true);
    expect(resolve({ onboarding: true })).toBe(false);
  });

  it('follows re-evaluations and console overrides live, without a cache reset', () => {
    const client = createClient({ onboarding: false });
    connectRemoteFlags(client);
    expect(isFeatureEnabled('onboarding')).toBe(false);
    client.evaluate({ onboarding: true, 'onboarding-auto-open': true });
    expect(isFeatureEnabled('onboarding')).toBe(true);
    expect(isFeatureEnabled('onboardingAutoOpen')).toBe(true);
    client.evaluate({ onboarding: false, 'onboarding-auto-open': true });
    expect(isFeatureEnabled('onboardingAutoOpen')).toBe(false);
  });

  it('returns every PostHog-backed flag to its default when analytics are withdrawn or declined', () => {
    const client = createClient({ onboarding: true, 'viewer-controls': true });
    connectRemoteFlags(client);
    expect(isFeatureEnabled('onboarding')).toBe(true);
    disconnectRemoteFlags();
    expect(client.listenerCount()).toBe(0);
    expect(getAllFlags()).toStrictEqual(featureFlagDefaults);
    // Evaluations after the withdrawal are not followed.
    client.evaluate({ onboarding: true });
    expect(isFeatureEnabled('onboarding')).toBe(false);
  });

  it('keeps defaults when the client throws while subscribing', () => {
    connectRemoteFlags({
      onFeatureFlags: () => {
        throw new Error('not ready');
      },
    });
    expect(getAllFlags()).toStrictEqual(featureFlagDefaults);
  });
});

describe('useFeature with PostHog-backed flags', () => {
  it('re-renders when PostHog flags load, change and are withdrawn', () => {
    const client = createClient();
    const render = vi.fn();
    const { result } = renderHook(() => {
      render();
      return useFeature('onboarding');
    });
    expect(result.current).toBe(false);

    act(() => {
      connectRemoteFlags(client);
      client.evaluate({ onboarding: true });
    });
    expect(result.current).toBe(true);

    const renders = render.mock.calls.length;
    act(() => {
      // An unchanged evaluation (such as a reload after identify) does not re-render.
      client.evaluate({ onboarding: true, unrelated: false });
    });
    expect(render).toHaveBeenCalledTimes(renders);

    act(() => {
      client.evaluate({ onboarding: false });
    });
    expect(result.current).toBe(false);

    act(() => {
      client.evaluate({ onboarding: true });
    });
    act(() => {
      disconnectRemoteFlags();
    });
    expect(result.current).toBe(false);
  });
});

describe('server rendering', () => {
  it('renders the registry defaults even when PostHog has evaluated a flag on', () => {
    connectRemoteFlags(createClient({ onboarding: true }));
    function onboardingProbe(): React.JSX.Element {
      return createElement('span', undefined, useFeature('onboarding') ? 'on' : 'off');
    }
    expect(renderToString(createElement(onboardingProbe))).toBe('<span>off</span>');
  });
});
