import { useContext, useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import { QueryClientContext } from '@tanstack/react-query';
// oxlint-disable-next-line import/no-unassigned-import -- side-effect loads `AuthPluginRegister` module augmentation before `<AuthProvider>`
import '#utils/auth-plugin.js';
import { AuthProvider } from '#components/auth/auth-provider.js';
import { authClient } from '#lib/auth-client.js';
import { ENV } from '#environment.config.js';
import { apiKeyPlugin } from '#utils/api-key-plugin.js';
import { magicLinkPlugin } from '#utils/magic-link-plugin.js';

/**
 * The auth surface Electron's preload exposes to the renderer (batch A, item
 * A6). Main owns the credential end to end — the renderer can ask it to start
 * or drop a session and be told when one changes, but never sees the token.
 */
export type TauDesktopAuthBridge = {
  /** Opens the system browser and resolves once main has a session (or the user cancelled). */
  readonly signIn: () => Promise<void>;
  /** Drops main's stored credential and resolves once it is gone. */
  readonly signOut: () => Promise<void>;
  /** Subscribes to sign-in/sign-out/refresh. Returns an unsubscribe function. */
  readonly onAuthChanged: (listener: () => void) => () => void;
};

declare global {
  // oxlint-disable-next-line @typescript-eslint/consistent-type-definitions -- required for augmentation
  interface Window {
    /** Present only in the Electron renderer; `undefined` in every browser build. */
    tauAuth?: TauDesktopAuthBridge;
  }
}

/**
 * Every better-auth-ui query lives under this prefix, so one invalidation
 * covers the session, the account list, and the session list.
 */
const authQueryKeyPrefix = ['auth'] as const;

/**
 * Auth destinations the Electron shell owns instead of the in-app flow.
 *
 * Sign-in and sign-up must run in the **system browser** (RFC 8252 forbids an
 * embedded webview, and Google refuses one), and sign-out must reach Electron
 * main so it drops the credential it holds — a renderer-only sign-out would
 * leave the injected bearer alive.
 *
 * Keyed on better-auth-ui's default `basePaths.auth` + `viewPaths.auth`, which
 * `AuthConfigProvider` does not override.
 */
type DesktopAuthAction = 'signIn' | 'signOut';

const desktopBridgedAuthPaths = new Map<string, DesktopAuthAction>([
  ['/auth/sign-in', 'signIn'],
  ['/auth/sign-up', 'signIn'],
  ['/auth/sign-out', 'signOut'],
]);

/**
 * The desktop bridge call a given auth destination should become.
 *
 * @param to - The destination better-auth-ui wants to route to.
 * @returns The bridge method name, or `undefined` to route in-app as usual.
 */
export function desktopAuthAction(to: string): DesktopAuthAction | undefined {
  if (import.meta.env.TAU_TARGET !== 'desktop') {
    return undefined;
  }

  return desktopBridgedAuthPaths.get(to.split('?')[0] ?? '');
}

/**
 * Runs the desktop shell's auth flow for a destination.
 *
 * @param to - The destination better-auth-ui wants to route to.
 * @returns `true` when the shell took it, `false` to route in-app as usual.
 */
function runDesktopAuthAction(to: string): boolean {
  const action = desktopAuthAction(to);
  const bridge = globalThis.window.tauAuth;
  if (action === undefined || !bridge) {
    return false;
  }

  void bridge[action]();
  return true;
}

/**
 * The `Link` better-auth-ui renders for its own destinations — including the
 * user button's signed-out "Sign in" item, which is the desktop shell's only
 * interactive entry point into the loopback flow.
 *
 * @param props - Anchor props; `href` is better-auth-ui's destination.
 * @returns A router link, or on desktop an anchor that calls the shell.
 */
export function AuthConfigLink({
  href,
  to: _to,
  onClick,
  ...rest
}: React.ComponentProps<'a'> & { readonly href: string; readonly to?: string }): React.JSX.Element {
  if (desktopAuthAction(href) === undefined) {
    return <Link {...rest} to={href} />;
  }

  return (
    <a
      {...rest}
      rel='noreferrer'
      href={href}
      onClick={(event) => {
        event.preventDefault();
        onClick?.(event);
        runDesktopAuthAction(href);
      }}
    />
  );
}

/**
 * Keeps the renderer's two independent session caches honest when Electron
 * main changes the credential out from under them.
 *
 * There are genuinely two: the TanStack Query cache behind
 * `@better-auth-ui/react`'s `useSession` (`['auth', 'getSession']`), which
 * every signed-in surface reads, and better-auth's own nanostore behind
 * `authClient.useSession()`. Neither observes the other.
 *
 * Mount this anywhere inside the app's `QueryClientProvider`; it is also
 * mounted by `AuthConfigProvider` below, which `root.tsx` currently renders
 * *above* that provider — there the nanostore half still fires and the query
 * half no-ops.
 *
 * ponytail: reading the context instead of a mount-order contract keeps this
 * position-independent. Nesting `QueryClientProvider` outside
 * `AuthConfigProvider` in `root.tsx` is the one-line upgrade that makes the
 * single mount here sufficient.
 *
 * @returns Nothing — this component renders no markup.
 */
export function DesktopAuthBridge(): undefined {
  // Read the context rather than calling `useQueryClient()`: the hook throws
  // when no client is in scope, and this component is deliberately mountable
  // on either side of the provider.
  const queryClient = useContext(QueryClientContext);

  useEffect(() => {
    if (import.meta.env.TAU_TARGET !== 'desktop') {
      return;
    }

    // The preload bridge is absent in dev before the shell injects it, and in
    // any non-Electron host that somehow loads the desktop bundle.
    const bridge = globalThis.window.tauAuth;
    if (!bridge) {
      return;
    }

    return bridge.onAuthChanged(() => {
      void queryClient?.invalidateQueries({ queryKey: authQueryKeyPrefix });
      authClient.$store.notify('$sessionSignal');
    });
  }, [queryClient]);
}

export function AuthConfigProvider({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  const navigate = useNavigate();

  return (
    <AuthProvider
      authClient={authClient}
      navigate={({ to, replace }) => {
        // `useAuthenticate` and friends bounce here when a session is required;
        // on desktop that is the shell's job, not an in-app route.
        if (runDesktopAuthAction(to)) {
          return;
        }

        void navigate(to, { replace: replace ?? false });
      }}
      Link={AuthConfigLink}
      plugins={[magicLinkPlugin(), apiKeyPlugin()]}
      socialProviders={['github', 'google']}
      redirectTo='/'
      baseURL={ENV.TAU_FRONTEND_URL}
    >
      <DesktopAuthBridge />
      {children}
    </AuthProvider>
  );
}
