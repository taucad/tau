// @vitest-environment jsdom
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { flagRegistry, layoutFlagNames } from '#flags/flag.constants.js';
import type { FlagDefinition } from '#flags/flag.constants.js';
import { readRememberedLayoutFlags, rememberLayoutFlags } from '#flags/layout-flags.js';
import { forgetClientFacts } from '#lib/client-facts.js';
import type { RemoteFlagClient } from '#flags/remote-flags.js';
import { connectRemoteFlags, disconnectRemoteFlags, readRemoteFlagStatus } from '#flags/remote-flags.js';
import { readSettledLayoutFlags, useLayoutFlag } from '#flags/use-feature.js';

/** A PostHog client stand-in that answers when told to, as a `/flags` response or a failed load would. */
function createClient(): RemoteFlagClient & {
  answer(variants: Record<string, string | boolean>, errorsLoading?: boolean): void;
} {
  let variants: Record<string, string | boolean> | undefined;
  const listeners = new Set<Parameters<RemoteFlagClient['onFeatureFlags']>[0]>();
  return {
    onFeatureFlags(callback) {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
    featureFlags: { getFlagVariants: () => variants ?? {} },
    answer(next, errorsLoading = false) {
      variants = next;
      for (const listener of listeners) {
        listener([], next, { errorsLoading });
      }
    },
  };
}

const forget = (): void => {
  localStorage.clear();
  forgetClientFacts();
};

beforeEach(() => {
  forget();
});

afterEach(() => {
  disconnectRemoteFlags();
  forget();
});

describe('layout flag registry', () => {
  it('marks onboarding, and only flags it names, as affecting layout', () => {
    expect(layoutFlagNames).toStrictEqual(['onboarding']);
    const definition: FlagDefinition = flagRegistry.onboarding;
    expect(definition.affectsLayout).toBe(true);
  });
});

describe('remembered layout flags', () => {
  it('remembers settled values in the client facts and keeps the value of a flag not given', () => {
    rememberLayoutFlags({ onboarding: true });
    expect(readRememberedLayoutFlags()).toStrictEqual({ onboarding: true });
    rememberLayoutFlags({});
    expect(readRememberedLayoutFlags()).toStrictEqual({ onboarding: true });
    rememberLayoutFlags({ onboarding: false });
    expect(readRememberedLayoutFlags()).toStrictEqual({ onboarding: false });
  });
});

describe('settled remote flags', () => {
  it('is pending while a connected client has not answered, then evaluated', () => {
    const client = createClient();
    connectRemoteFlags(client);
    expect(readRemoteFlagStatus()).toBe('pending');
    expect(readSettledLayoutFlags()).toStrictEqual({});
    client.answer({ onboarding: true });
    expect(readRemoteFlagStatus()).toBe('evaluated');
    expect(readSettledLayoutFlags()).toStrictEqual({ onboarding: true });
  });

  it('is absent, with the defaults final, once analytics are not admitted or withdrawn', () => {
    connectRemoteFlags(createClient());
    disconnectRemoteFlags();
    expect(readRemoteFlagStatus()).toBe('absent');
    expect(readSettledLayoutFlags()).toStrictEqual({ onboarding: false });
  });

  it('settles when PostHog reports that loading the flags failed', () => {
    const client = createClient();
    connectRemoteFlags(client);
    client.answer({}, true);
    expect(readRemoteFlagStatus()).toBe('absent');
    expect(readSettledLayoutFlags()).toStrictEqual({ onboarding: false });
  });

  it('settles as absent when the client throws while subscribing', () => {
    connectRemoteFlags({
      onFeatureFlags: () => {
        throw new Error('not ready');
      },
    });
    expect(readRemoteFlagStatus()).toBe('absent');
  });

  it('remembers every settled change, and nothing while pending', () => {
    const client = createClient();
    connectRemoteFlags(client);
    expect(readRememberedLayoutFlags()).toStrictEqual({});
    client.answer({ onboarding: true });
    expect(readRememberedLayoutFlags()).toStrictEqual({ onboarding: true });
    client.answer({ onboarding: false });
    expect(readRememberedLayoutFlags()).toStrictEqual({ onboarding: false });
    // A reconnect is pending again: the record keeps the last settled value.
    connectRemoteFlags(createClient());
    expect(readRememberedLayoutFlags()).toStrictEqual({ onboarding: false });
  });
});

describe('useLayoutFlag', () => {
  it('renders unknown on the server, whatever this device remembers or has settled', () => {
    rememberLayoutFlags({ onboarding: true });
    const probe = (): React.JSX.Element => {
      const value = useLayoutFlag('onboarding');
      return createElement('span', undefined, value === undefined ? 'unknown' : String(value));
    };

    expect(renderToString(createElement(probe))).toBe('<span>unknown</span>');
  });

  it('reads the remembered value until the flag settles, then the settled value', () => {
    rememberLayoutFlags({ onboarding: false });
    const client = createClient();
    connectRemoteFlags(client);
    const { result } = renderHook(() => useLayoutFlag('onboarding'));
    expect(result.current).toBe(false);
    act(() => {
      client.answer({ onboarding: true });
    });
    expect(result.current).toBe(true);
    act(() => {
      disconnectRemoteFlags();
    });
    expect(result.current).toBe(false);
  });
});
