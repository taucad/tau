// @vitest-environment jsdom
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { act, renderHook } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import * as Cookies from 'es-cookie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { flagRegistry, layoutFlagNames } from '#flags/flag.constants.js';
import type { FlagDefinition } from '#flags/flag.constants.js';
import {
  encodeLayoutFlags,
  layoutFlagsCookieName,
  parseLayoutFlags,
  readLayoutFlagsFromHeader,
  writeLayoutFlagsCookie,
} from '#flags/layout-flags.js';
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

const clearCookie = (): void => {
  Cookies.remove(layoutFlagsCookieName, { path: '/' });
};

beforeEach(() => {
  clearCookie();
});

afterEach(() => {
  disconnectRemoteFlags();
  clearCookie();
});

describe('layout flag registry', () => {
  it('marks onboarding, and only flags it names, as affecting layout', () => {
    expect(layoutFlagNames).toStrictEqual(['onboarding']);
    const definition: FlagDefinition = flagRegistry.onboarding;
    expect(definition.affectsLayout).toBe(true);
  });

  it('names the cookie with the app prefix', () => {
    expect(layoutFlagsCookieName).toBe('tau-layout-flags');
  });
});

describe('layout-flags cookie value', () => {
  it('round-trips settled values in a compact, cookie-safe form', () => {
    expect(encodeLayoutFlags({ onboarding: true })).toBe('onboarding.1');
    expect(encodeLayoutFlags({ onboarding: false })).toBe('onboarding.0');
    expect(encodeLayoutFlags({})).toBe('');
    expect(parseLayoutFlags('onboarding.1')).toStrictEqual({ onboarding: true });
    expect(parseLayoutFlags('onboarding.0')).toStrictEqual({ onboarding: false });
    expect(encodeLayoutFlags({ onboarding: true })).toMatch(/^[\w.]+$/u);
  });

  it.each([
    ['absent', undefined],
    ['empty', ''],
    ['an unknown name', 'machines.1'],
    ['a value other than 0 or 1', 'onboarding.true'],
    ['a missing value', 'onboarding'],
    ['JSON', '{"onboarding":true}'],
    ['a prototype key', '__proto__.1'],
    ['an oversized value', `onboarding.1_${'x'.repeat(600)}`],
  ])('ignores %s', (_label, value) => {
    expect(parseLayoutFlags(value)).toStrictEqual({});
  });

  it('keeps the known entries of a value that also holds unknown or malformed ones, first one winning', () => {
    expect(parseLayoutFlags('machines.1_onboarding.1_bad_onboarding.0')).toStrictEqual({ onboarding: true });
  });

  it('reads the cookie from a request header', () => {
    expect(readLayoutFlagsFromHeader(undefined)).toStrictEqual({});
    expect(readLayoutFlagsFromHeader('other=1; tau-layout-flags=onboarding.1')).toStrictEqual({ onboarding: true });
    expect(readLayoutFlagsFromHeader('tau-layout-flags=onboarding.x')).toStrictEqual({});
  });

  it('writes settled values and keeps the cookie value for a flag not given', () => {
    writeLayoutFlagsCookie({ onboarding: true });
    expect(Cookies.get(layoutFlagsCookieName)).toBe('onboarding.1');
    writeLayoutFlagsCookie({});
    expect(Cookies.get(layoutFlagsCookieName)).toBe('onboarding.1');
    writeLayoutFlagsCookie({ onboarding: false });
    expect(Cookies.get(layoutFlagsCookieName)).toBe('onboarding.0');
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

  it('mirrors every settled change to the cookie, and nothing while pending', () => {
    const client = createClient();
    connectRemoteFlags(client);
    expect(Cookies.get(layoutFlagsCookieName)).toBeUndefined();
    client.answer({ onboarding: true });
    expect(Cookies.get(layoutFlagsCookieName)).toBe('onboarding.1');
    client.answer({ onboarding: false });
    expect(Cookies.get(layoutFlagsCookieName)).toBe('onboarding.0');
    // A reconnect is pending again: the cookie keeps the last settled value.
    connectRemoteFlags(createClient());
    expect(Cookies.get(layoutFlagsCookieName)).toBe('onboarding.0');
  });
});

describe('useLayoutFlag', () => {
  const renderWithRoot = (layoutFlags: Readonly<Record<string, boolean>> | undefined) => {
    const probe = (): React.JSX.Element => {
      const value = useLayoutFlag('onboarding');
      return createElement('span', undefined, value === undefined ? 'unknown' : String(value));
    };
    return createMemoryRouter([{ id: 'root', path: '/', element: createElement(probe) }], {
      initialEntries: ['/'],
      hydrationData: { loaderData: { root: layoutFlags === undefined ? {} : { layoutFlags } } },
    });
  };

  it('renders the cookie value on the server, whatever the client has settled', () => {
    connectRemoteFlags(createClient());
    disconnectRemoteFlags();
    expect(renderToString(createElement(RouterProvider, { router: renderWithRoot({ onboarding: true }) }))).toBe(
      '<span>true</span>',
    );
    expect(renderToString(createElement(RouterProvider, { router: renderWithRoot({}) }))).toBe('<span>unknown</span>');
    expect(renderToString(createElement(RouterProvider, { router: renderWithRoot(undefined) }))).toBe(
      '<span>unknown</span>',
    );
  });

  it('reads the cookie value until the flag settles, then the settled value', () => {
    const client = createClient();
    connectRemoteFlags(client);
    const { result } = renderHook(() => useLayoutFlag('onboarding'));
    expect(result.current).toBeUndefined();
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
