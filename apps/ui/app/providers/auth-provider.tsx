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
import { useCloudFinancialPurge } from '#cloud/financial-purge.js';
import { useResolvedAuth } from '#hooks/use-resolved-auth.js';
import { isDesktopTarget } from '#lib/build-target.js';

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
export type DesktopAuthAction = 'signIn' | 'signOut';

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
  if (!isDesktopTarget()) {
    return undefined;
  }

  return desktopBridgedAuthPaths.get(to.split('?')[0] ?? '');
}

/**
 * Runs the desktop shell's auth flow for a destination.
 *
 * A destination the shell owns stays owned when the preload bridge is missing:
 * the caller must not fall through to the embedded web form, which cannot
 * complete a desktop sign-in.
 *
 * @param to - The destination better-auth-ui wants to route to.
 * @returns `true` when the destination belongs to the shell, `false` to route in-app as usual.
 */
function runDesktopAuthAction(to: string): boolean {
  const action = desktopAuthAction(to);
  if (action === undefined) {
    return false;
  }

  const bridge = globalThis.window.tauAuth;
  if (bridge) {
    void callDesktopShell(bridge[action]);
  }
  return true;
}

/**
 * Runs a desktop shell auth call whose failure the handoff panel already covers
 * with its retry, so a rejection needs no second surface.
 *
 * @param call - The bridge method to run.
 */
export async function callDesktopShell(call: () => Promise<void>): Promise<void> {
  try {
    await call();
  } catch {
    // The user retries from the handoff panel.
  }
}

/** How the auth route should present a destination the desktop shell owns. */
export type ShellAuthHandoff = {
  readonly action: DesktopAuthAction;
  /** `false` when the desktop preload has not exposed its auth bridge. */
  readonly isBridgeAvailable: boolean;
};

/**
 * Hands a bridged auth destination to the Electron shell instead of rendering it.
 *
 * The desktop window cannot host an OAuth flow itself. Main sends the provider
 * navigation to the system browser, so the state cookie better-auth wrote into
 * the renderer's session never reaches the callback and the provider returns
 * `state_mismatch`. Email/password is no better: the credential would land in
 * the renderer while main keeps injecting the bearer it still does not have.
 *
 * Intercepting navigation is not enough, because a plain `Link` built from
 * {@link useAuthLinks}, a deep link, or a loader redirect all reach the view
 * without passing through {@link AuthConfigLink}. Guarding the render covers
 * every one of them.
 *
 * @param to - The auth destination, for example `/auth/sign-in`.
 * @returns The shell handoff, or `undefined` to render the in-app view.
 */
export function useShellAuthHandoff(to: string): ShellAuthHandoff | undefined {
  // `desktopAuthAction` is `undefined` in every web build, so the bridge read is
  // never reached during SSR.
  const action = desktopAuthAction(to);
  const isBridgeAvailable = action !== undefined && globalThis.window.tauAuth !== undefined;

  useEffect(() => {
    if (isBridgeAvailable) {
      runDesktopAuthAction(to);
    }
  }, [isBridgeAvailable, to]);

  return action === undefined ? undefined : { action, isBridgeAvailable };
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
 * Refreshes the renderer's shared session query when Electron main changes
 * the credential out from under it.
 *
 * Every signed-in surface, including billing, reads the TanStack Query cache
 * behind `@better-auth-ui/react`'s `useSession` (`['auth', 'getSession']`).
 *
 * ponytail: reading the context instead of a mount-order contract keeps this
 * position-independent for focused tests; the app root supplies the client.
 *
 * @returns Nothing — this component renders no markup.
 */
export function DesktopAuthBridge(): undefined {
  // Read the context rather than calling `useQueryClient()`: the hook throws
  // when no client is in scope, and this component is deliberately mountable
  // on either side of the provider.
  const queryClient = useContext(QueryClientContext);
  const purgeFinancial = useCloudFinancialPurge();

  useEffect(() => {
    if (!isDesktopTarget()) {
      return;
    }

    // The preload bridge is absent in dev before the shell injects it, and in
    // any non-Electron host that somehow loads the desktop bundle.
    const bridge = globalThis.window.tauAuth;
    if (!bridge) {
      return;
    }

    return bridge.onAuthChanged(() => {
      purgeFinancial?.('owner_changed');
      void queryClient?.invalidateQueries({ queryKey: authQueryKeyPrefix });
    });
  }, [purgeFinancial, queryClient]);
}

/**
 * A **confirmed** anonymous session clears the local billing selection and this
 * device's saved usage (B4 R5). An indeterminate session does not: that is the
 * offline case, where the saved snapshot is exactly what the reader should see.
 * Remote revocation cannot be learned while offline, and this profile grants no
 * remote capability, so nothing is lost by waiting for a real 401.
 *
 * @returns Nothing — this component renders no markup.
 */
export function AnonymousSessionPurge(): undefined {
  const purgeFinancial = useCloudFinancialPurge();
  const resolved = useResolvedAuth();

  useEffect(() => {
    if (resolved === 'anonymous') {
      purgeFinancial?.('logout');
    }
  }, [purgeFinancial, resolved]);
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
      <AnonymousSessionPurge />
      {children}
    </AuthProvider>
  );
}
