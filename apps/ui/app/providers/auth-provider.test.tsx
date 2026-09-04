// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthConfigLink, DesktopAuthBridge, desktopAuthAction } from '#providers/auth-provider.js';
import type { TauDesktopAuthBridge } from '#providers/auth-provider.js';

const mocks = vi.hoisted(() => ({
  notify: vi.fn(),
  routerLink: vi.fn(),
}));
const { routerLink } = mocks;

vi.mock('react-router', () => ({
  Link: ({ to, children, ...rest }: { readonly to: string } & React.ComponentProps<'a'>) => {
    routerLink(to);
    return (
      <a {...rest} rel='noreferrer' href={to}>
        {children}
      </a>
    );
  },
  useNavigate: () => vi.fn(),
}));

vi.mock('#lib/auth-client.js', () => ({
  authClient: { $store: { notify: mocks.notify } },
}));

const createBridge = () => {
  const listeners: Array<() => void> = [];
  const unsubscribe = vi.fn();
  const bridge: TauDesktopAuthBridge = {
    signIn: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
    onAuthChanged: vi.fn((listener: () => void) => {
      listeners.push(listener);
      return unsubscribe;
    }),
  };
  const emit = (): void => {
    for (const listener of listeners) {
      listener();
    }
  };
  return { bridge, unsubscribe, emit };
};

const renderBridge = (queryClient: QueryClient): ReturnType<typeof render> =>
  render(
    <QueryClientProvider client={queryClient}>
      <DesktopAuthBridge />
    </QueryClientProvider>,
  );

describe('DesktopAuthBridge', () => {
  let queryClient: QueryClient;
  let invalidate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    delete globalThis.window.tauAuth;
  });

  it('invalidates both session caches when the desktop shell reports an auth change', () => {
    vi.stubEnv('TAU_TARGET', 'desktop');
    const { bridge, emit } = createBridge();
    globalThis.window.tauAuth = bridge;

    renderBridge(queryClient);
    emit();

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['auth'] });
    expect(mocks.notify).toHaveBeenCalledWith('$sessionSignal');
  });

  it('unsubscribes from the shell on unmount', () => {
    vi.stubEnv('TAU_TARGET', 'desktop');
    const { bridge, unsubscribe } = createBridge();
    globalThis.window.tauAuth = bridge;

    renderBridge(queryClient).unmount();

    expect(unsubscribe).toHaveBeenCalled();
  });

  it('never subscribes in the web build', () => {
    // No TAU_TARGET define: `undefined === 'desktop'` is false.
    const { bridge } = createBridge();
    globalThis.window.tauAuth = bridge;

    renderBridge(queryClient);

    expect(bridge.onAuthChanged).not.toHaveBeenCalled();
  });

  it('tolerates a desktop build whose preload has not exposed the bridge yet', () => {
    vi.stubEnv('TAU_TARGET', 'desktop');

    expect(() => renderBridge(queryClient)).not.toThrow();
  });

  it('still refreshes the nanostore when mounted outside a QueryClientProvider', () => {
    vi.stubEnv('TAU_TARGET', 'desktop');
    const { bridge, emit } = createBridge();
    globalThis.window.tauAuth = bridge;

    render(<DesktopAuthBridge />);
    emit();

    expect(mocks.notify).toHaveBeenCalledWith('$sessionSignal');
  });
});

/**
 * Regression cover for review finding MAJOR 6: `window.tauAuth.signIn()` and
 * `signOut()` had no callers, so the desktop shell's interactive sign-in was
 * dead UI-side and only the `TAU_DESKTOP_TOKEN` seed produced a session.
 *
 * Both seams that decide "the user must sign in" are props this provider owns:
 * `navigate` (better-auth-ui's programmatic bounce, e.g. `useAuthenticate`) and
 * `Link` (the user-button's menu items). Both route through `desktopAuthAction`.
 */
describe('desktopAuthAction', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ['/auth/sign-in', 'signIn'],
    ['/auth/sign-up', 'signIn'],
    ['/auth/sign-out', 'signOut'],
    ['/auth/sign-in?redirectTo=%2Fprojects', 'signIn'],
  ])('routes %s to the desktop shell', (to, action) => {
    vi.stubEnv('TAU_TARGET', 'desktop');

    expect(desktopAuthAction(to)).toBe(action);
  });

  it.each(['/auth/forgot-password', '/auth/desktop', '/projects', '/auth/sign-in/evil'])(
    'leaves %s to in-app routing',
    (to) => {
      vi.stubEnv('TAU_TARGET', 'desktop');

      expect(desktopAuthAction(to)).toBeUndefined();
    },
  );

  it('never diverts anything in the web build', () => {
    expect(desktopAuthAction('/auth/sign-in')).toBeUndefined();
    expect(desktopAuthAction('/auth/sign-out')).toBeUndefined();
  });
});

describe('AuthConfigLink', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    delete globalThis.window.tauAuth;
  });

  it('hands a desktop sign-in click to the shell instead of navigating (MAJOR 6)', async () => {
    vi.stubEnv('TAU_TARGET', 'desktop');
    const { bridge } = createBridge();
    globalThis.window.tauAuth = bridge;

    render(<AuthConfigLink href='/auth/sign-in'>Sign in</AuthConfigLink>);
    await userEvent.click(screen.getByText('Sign in'));

    expect(bridge.signIn).toHaveBeenCalled();
    expect(bridge.signOut).not.toHaveBeenCalled();
  });

  it('hands a desktop sign-out click to the shell so main drops its token', async () => {
    vi.stubEnv('TAU_TARGET', 'desktop');
    const { bridge } = createBridge();
    globalThis.window.tauAuth = bridge;

    render(<AuthConfigLink href='/auth/sign-out'>Sign out</AuthConfigLink>);
    await userEvent.click(screen.getByText('Sign out'));

    expect(bridge.signOut).toHaveBeenCalled();
  });

  it('renders an ordinary router link in the web build', () => {
    render(<AuthConfigLink href='/auth/sign-in'>Sign in</AuthConfigLink>);

    expect(screen.getByText('Sign in').closest('a')).toHaveAttribute('href', '/auth/sign-in');
    expect(routerLink).toHaveBeenCalled();
  });
});
