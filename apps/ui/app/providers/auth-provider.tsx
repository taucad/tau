import { useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { Topic } from '@taucad/events';
import { Link, useNavigate } from 'react-router';
import { QueryClientContext } from '@tanstack/react-query';
import type { AuthProviderProps } from '@better-auth-ui/react';
// oxlint-disable-next-line import/no-unassigned-import -- side-effect loads `AuthPluginRegister` module augmentation before `<AuthProvider>`
import '@taucad/ui-core/utils/auth-plugin';
import { AuthProvider } from '#components/auth/auth-provider.js';
import { authClient } from '#lib/auth-client.js';
import { apiKeyPlugin } from '@taucad/ui-core/utils/api-key-plugin';
import { magicLinkPlugin } from '#utils/magic-link-plugin.js';
import { useCloudFinancialPurge } from '#cloud/financial-purge.js';
import { useResolvedAuth } from '#hooks/use-resolved-auth.js';
import { hasWebsitePreference, setEntryPreference } from '@taucad/ui-core/lib/entry-preference';
import { isDesktopTarget } from '#lib/build-target.js';
import { authReturnOrigin } from '#lib/share-origin.js';

/**
 * The auth surface Electron's preload exposes to the renderer (batch A, item
 * A6). Main owns the credential end to end — the renderer can ask it to start
 * or drop a session and be told when one changes, but never sees the token.
 */
export type TauDesktopAuthBridge = {
  /**
   * Opens the system browser and resolves with how the attempt ended. `different-account` asks the browser to sign
   * in afresh before consent.
   */
  readonly signIn: (mode?: DesktopSignInMode) => Promise<DesktopSignInOutcome | undefined>;
  /** Ends the attempt in flight, if any. */
  readonly cancelSignIn: () => Promise<void>;
  /** The attempt in flight, a notice to show once, the account's email and when the sign-in ends. Never a token. */
  readonly status: () => Promise<DesktopSignInStatus | undefined>;
  /** Forgets the notice once shown. */
  readonly clearNotice: () => Promise<void>;
  /** Drops main's stored credential and resolves once it is gone. */
  readonly signOut: () => Promise<void>;
  /** Subscribes to sign-in/sign-out/refresh. Returns an unsubscribe function. */
  readonly onAuthChanged: (listener: () => void) => () => void;
};

/** How a desktop sign-in is asked for: the usual consent, or a sign-in as another account first. */
export type DesktopSignInMode = 'consent' | 'different-account';

/** How a desktop sign-in attempt ended. */
export type DesktopSignInOutcome = 'signed-in' | 'canceled' | 'expired' | 'error';

/** What main tells the window about desktop sign-in (DSI-4). */
export type DesktopSignInStatus = {
  /** The attempt in flight: its link for Copy link, whether the browser came back, whether it opened at all. */
  readonly attempt?: {
    readonly url: string;
    readonly phase: 'waiting' | 'finishing';
    readonly browserFailed: boolean;
  };
  /** Something to say once: an update signed the person out, or the sign-in ended. */
  readonly notice?: {
    readonly kind: 'signed-out-by-update' | 'sign-in-ended';
    readonly email?: string;
  };
  readonly email?: string;
  /** ISO time the sign-in ends however often it refreshes (90 days after it began). */
  readonly signInEndsAt?: string;
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
    if (action === 'signIn') {
      void startDesktopSignIn('consent');
    } else {
      void callDesktopShell(bridge.signOut);
    }
  }
  return true;
}

/* The last attempt's outcome, shared by the window's sign-in panel and whatever started the attempt. */
let lastDesktopSignInOutcome: DesktopSignInOutcome | undefined;
let desktopSignInAttempts = 0;
const desktopSignInOutcomeChanges = new Topic<void>({ name: 'DesktopSignIn.outcome' });

const setDesktopSignInOutcome = (outcome: DesktopSignInOutcome | undefined): void => {
  lastDesktopSignInOutcome = outcome;
  desktopSignInOutcomeChanges.emit();
};

/**
 * Starts a desktop sign-in through the shell and records how it ended for {@link useDesktopSignInOutcome}.
 *
 * @param mode - The usual consent, or a sign-in as another account first.
 */
export async function startDesktopSignIn(mode: DesktopSignInMode): Promise<void> {
  const bridge = globalThis.window.tauAuth;
  if (!bridge) {
    return;
  }
  desktopSignInAttempts += 1;
  const attempt = desktopSignInAttempts;
  setDesktopSignInOutcome(undefined);
  let outcome: DesktopSignInOutcome | undefined;
  try {
    outcome = await bridge.signIn(mode);
  } catch {
    outcome = 'error';
  }
  // A newer attempt replaced this one (the shell reports it canceled): only the newest attempt's outcome shows.
  if (attempt === desktopSignInAttempts) {
    setDesktopSignInOutcome(outcome ?? 'error');
  }
}

/**
 * How the last desktop sign-in attempt ended; `undefined` while one is open or before the first.
 *
 * @returns The outcome.
 */
export function useDesktopSignInOutcome(): DesktopSignInOutcome | undefined {
  return useSyncExternalStore(
    (listener) => desktopSignInOutcomeChanges.subscribe(listener),
    () => lastDesktopSignInOutcome,
    () => undefined,
  );
}

/**
 * What main says about desktop sign-in, read again whenever it announces a change.
 *
 * @returns The status, or `undefined` outside the desktop window or before the first read.
 */
export function useDesktopSignInStatus(): DesktopSignInStatus | undefined {
  const [status, setStatus] = useState<DesktopSignInStatus | undefined>();
  useEffect(() => {
    const bridge = isDesktopTarget() ? globalThis.window.tauAuth : undefined;
    if (!bridge) {
      return;
    }
    let isCurrent = true;
    const read = async (): Promise<void> => {
      try {
        const next = await bridge.status();
        if (isCurrent) {
          setStatus(next);
        }
      } catch {
        // The next change reads it again.
      }
    };
    void read();
    const unsubscribe = bridge.onAuthChanged(() => {
      void read();
    });
    return () => {
      isCurrent = false;
      unsubscribe();
    };
  }, []);
  return status;
}

/**
 * Runs a desktop shell auth call whose failure the handoff panel already covers
 * with its retry, so a rejection needs no second surface.
 *
 * @param call - The bridge method to run.
 */
export async function callDesktopShell(call: () => Promise<unknown>): Promise<void> {
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
  children,
  ...rest
}: React.ComponentProps<'a'> & {
  readonly href: string;
  readonly to?: string;
}): React.JSX.Element {
  if (desktopAuthAction(href) === undefined) {
    return (
      <Link {...rest} to={href}>
        {children}
      </Link>
    );
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
    >
      {children}
    </a>
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
      purgeFinancial('owner_changed');
      void queryClient?.invalidateQueries({ queryKey: authQueryKeyPrefix });
    });
  }, [purgeFinancial, queryClient]);

  useDesktopSignInNotices();
}

/** Milliseconds before the sign-in's absolute end at which the window offers to renew it (Principal ruling P1). */
const renewalWarningLead = 7 * 24 * 60 * 60 * 1000;

/* Once per window: the renewal warning is not repeated on every refresh. */
let hasWarnedOfSignInEnd = false;

/**
 * Says once what main has to tell the person unasked: an update signed them out, the sign-in ended, or it ends soon
 * (with one-click renew).
 */
function useDesktopSignInNotices(): void {
  const status = useDesktopSignInStatus();
  const notice = status?.notice;
  const signInEndsAt = status?.signInEndsAt;

  useEffect(() => {
    const bridge = globalThis.window.tauAuth;
    if (!bridge || notice === undefined) {
      return;
    }
    const account = notice.email === undefined ? '' : ` as ${notice.email}`;
    toast(notice.kind === 'signed-out-by-update' ? 'Sign in again' : 'Your sign-in ended', {
      description:
        notice.kind === 'signed-out-by-update'
          ? `This update of Tau signs in a new way, so you were signed out${account}.`
          : `Tau Desktop is no longer signed in${account}.`,
      action: {
        label: 'Sign in',
        onClick: () => {
          void startDesktopSignIn('consent');
        },
      },
    });
    void callDesktopShell(bridge.clearNotice);
  }, [notice]);

  useEffect(() => {
    if (signInEndsAt === undefined || hasWarnedOfSignInEnd) {
      return;
    }
    const endsAt = new Date(signInEndsAt);
    if (endsAt.getTime() - Date.now() > renewalWarningLead) {
      return;
    }
    hasWarnedOfSignInEnd = true;
    toast('Your sign-in ends soon', {
      description: `Tau Desktop signs out on ${endsAt.toLocaleDateString()}. Renew it in your browser to stay signed in.`,
      action: {
        label: 'Renew',
        onClick: () => {
          void startDesktopSignIn('consent');
        },
      },
    });
  }, [signInEndsAt]);
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
      purgeFinancial('logout');
    }
  }, [purgeFinancial, resolved]);
}

/** Remember confirmed app use without mistaking an outage for logout. */
export function AppEntryPreference(): undefined {
  const resolved = useResolvedAuth();
  useEffect(() => {
    if (!isDesktopTarget() && resolved === 'authed' && !hasWebsitePreference()) {
      setEntryPreference('app');
    }
  }, [resolved]);
}

/**
 * Tau's words for better-auth-ui's strings where its defaults differ: sentence case (page composition Rule 12), and
 * one name for one action everywhere (I6). Its "Sign In" titled the sign-in card, labelled its submit button and the
 * links back from sign-up, forgot-password and reset-password, while the command palette, invitations, share and the
 * user menu say "Sign in". The auth route's document titles read these too.
 */
export const authLocalization = {
  auth: {
    signIn: 'Sign in',
    signUp: 'Sign up',
    signOut: 'Sign out',
    forgotPassword: 'Forgot password',
    resetPassword: 'Reset password',
    verifyEmail: 'Verify email',
  },
} as const satisfies AuthProviderProps['localization'];

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
      localization={authLocalization}
      plugins={[magicLinkPlugin(), apiKeyPlugin()]}
      socialProviders={['github', 'google']}
      // Mirrors the API's `requireEmailVerification`: a sign-up answers with no session, so the form shows
      // "Check your email" instead of navigating home signed out.
      emailAndPassword={{ requireEmailVerification: true }}
      redirectTo='/'
      baseURL={authReturnOrigin()}
    >
      <DesktopAuthBridge />
      <AnonymousSessionPurge />
      <AppEntryPreference />
      {children}
    </AuthProvider>
  );
}
