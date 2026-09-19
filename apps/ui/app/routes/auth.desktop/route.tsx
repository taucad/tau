import { useAuthenticate } from '@better-auth-ui/react';
import { CircleAlert, Download, ExternalLink, MonitorSmartphone } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useLocation } from 'react-router';

import { Button } from '@taucad/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@taucad/ui/components/card';
import { Spinner } from '#components/ui/spinner.js';
import { tauDesktopDownloadUrl } from '#components/desktop/open-in-desktop.js';
import { authClient } from '#lib/auth-client.js';
import type { Handle } from '#types/matches.types.js';

/** Query params this page accepts, and the ones it hands back over `tau://`. */
export const desktopHandoffParameterNames = {
  state: 'state',
  oneTimeToken: 'ott',
} as const;

export type DesktopHandoffTarget = {
  /** Opaque nonce minted by main; echoed back untouched so main can match it. */
  readonly state: string;
};

/**
 * Validates the handoff parameters before anything is minted for them.
 *
 * The state must look like the opaque nonce main generated — this page never
 * interprets it, it only refuses to carry anything that is not one. There is
 * no port any more: the callback goes to the app's own `tau://` scheme, which
 * the OS routes to the installed Tau, so there is nothing for a caller to
 * point somewhere else.
 *
 * @param search - The route's raw query string.
 * @returns The validated target, or `undefined` when the request is malformed.
 */
export function parseDesktopHandoffTarget(search: string): DesktopHandoffTarget | undefined {
  const parameters = new URLSearchParams(search);
  const state = parameters.get(desktopHandoffParameterNames.state) ?? '';

  if (!/^[\w-]{8,128}$/.test(state)) {
    return undefined;
  }

  return { state };
}

/**
 * Builds the deep link this page navigates to once a token exists.
 *
 * The shell admits exactly these two parameters and no fragment
 * (`apps/desktop/src/main/deep-links.ts`), so anything else here is a link the
 * app will refuse and log.
 *
 * @param target - The validated state.
 * @param oneTimeToken - The freshly minted single-use token.
 * @returns The absolute `tau://auth/callback?...` URL.
 */
export function buildDesktopCallbackUrl(target: DesktopHandoffTarget, oneTimeToken: string): string {
  const url = new URL('tau://auth/callback');
  url.searchParams.set(desktopHandoffParameterNames.oneTimeToken, oneTimeToken);
  url.searchParams.set(desktopHandoffParameterNames.state, target.state);
  return url.toString();
}

export const handle: Handle = {
  enablePageWrapper: false,
};

type HandoffStatus = 'invalid-request' | 'awaiting-consent' | 'minting' | 'opening' | 'not-opened' | 'failed';

/** One sentence per state, so the card is a lookup rather than a ternary chain. */
const handoffTitle: Record<HandoffStatus, string> = {
  'invalid-request': 'This sign-in link is not valid',
  'awaiting-consent': 'Connect to Tau Desktop?',
  minting: 'Signing you in to Tau Desktop',
  opening: 'Opening Tau Desktop',
  'not-opened': 'Tau Desktop didn’t open',
  failed: "We couldn't complete the sign-in",
};

const handoffDescription: Record<HandoffStatus, React.ReactNode> = {
  'invalid-request': 'Start sign-in from Tau Desktop rather than opening this page directly.',
  'awaiting-consent': 'Only continue if you just started sign-in from Tau Desktop on this computer.',
  minting: 'Hold tight while Tau hands your session to the desktop app.',
  opening: (
    <>
      Your browser asks whether to open Tau. Choose <strong>Open</strong> to continue there.
    </>
  ),
  'not-opened': 'Tau Desktop may not be installed on this computer, or the browser did not offer to open it.',
  failed: 'Return to Tau Desktop and start sign-in again.',
};

/**
 * The icon that belongs beside a state's sentence.
 *
 * @param view - The state the card is showing.
 * @returns The icon element.
 */
const handoffIcon = (view: HandoffStatus): React.JSX.Element => {
  if (view === 'minting' || view === 'opening') {
    return <Spinner className='size-5' />;
  }
  if (view === 'awaiting-consent') {
    return <MonitorSmartphone className='size-5' aria-hidden='true' />;
  }
  return <CircleAlert className='size-5' aria-hidden='true' />;
};

/**
 * Web-only sign-in handoff for the Electron app (ruling D7, R4).
 *
 * Runs in the user's system browser, never in the renderer. On confirmation it
 * mints a one-time token and hands it to the desktop app by navigating to
 * `tau://auth/callback` — a top-level navigation, which is how a browser is
 * asked to consult its scheme handlers.
 *
 * **The token is minted only from a user gesture, never on mount.** Any site can
 * navigate a signed-in browser to this URL, and `/one-time-token/verify`
 * exchanges the result for a full session. `state` proves the callback to
 * Electron main; it proves nothing to the person whose session is being handed
 * over. The confirmation is what stands between a drive-by navigation and a
 * stolen session.
 *
 * Nothing here is on a timer. The scheme gives the page no signal, so the way
 * out of "opening" is a button that is visible the whole time.
 *
 * @returns The handoff status card.
 */
export default function AuthDesktopRoute(): React.JSX.Element {
  const location = useLocation();
  const target = useMemo(() => parseDesktopHandoffTarget(location.search), [location.search]);
  // Redirects to /auth/sign-in?redirectTo=<this URL> when signed out, so every
  // provider (GitHub, Google, magic link, password) returns here afterwards.
  const { data: session } = useAuthenticate(authClient);
  const [status, setStatus] = useState<HandoffStatus>(target ? 'awaiting-consent' : 'invalid-request');
  /* Kept so "Try again" re-offers the same token: the app never received it,
     so it is still unspent, and minting a second one would leave the first
     live for its whole lifetime. */
  const [callbackUrl, setCallbackUrl] = useState<string>();

  const handOff = useCallback(async (): Promise<void> => {
    if (!target) {
      return;
    }

    setStatus('minting');
    /* A throwing mint is the same outcome as a refused one: the desktop app
       gets nothing either way, and saying so beats an unhandled rejection. */
    let token: string;
    try {
      const result = await authClient.$fetch<{ token: string }>('/one-time-token/generate');
      if (result.error !== null || result.data.token === '') {
        setStatus('failed');
        return;
      }
      token = result.data.token;
    } catch {
      setStatus('failed');
      return;
    }

    const url = buildDesktopCallbackUrl(target, token);
    setCallbackUrl(url);
    setStatus('opening');
    globalThis.location.assign(url);
  }, [target]);

  const retry = useCallback((): void => {
    if (callbackUrl === undefined) {
      return;
    }
    setStatus('opening');
    globalThis.location.assign(callbackUrl);
  }, [callbackUrl]);

  const canConfirm = status === 'awaiting-consent' && target !== undefined && session !== undefined;
  // Signed out, `useAuthenticate` has already bounced through
  // /auth/sign-in?redirectTo=…; show progress rather than a consent prompt for
  // a session that does not exist yet.
  const view = status === 'awaiting-consent' && session === undefined ? 'minting' : status;
  const busy = view === 'minting' || view === 'opening';

  return (
    <div className='flex min-h-svh items-center justify-center p-6'>
      <Card className='w-full max-w-sm' role={busy ? 'status' : undefined} aria-busy={busy ? 'true' : undefined}>
        <CardHeader>
          <div className='mb-2 flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary'>
            {handoffIcon(view)}
          </div>

          <CardTitle className='text-xl font-semibold'>{handoffTitle[view]}</CardTitle>

          <CardDescription>{handoffDescription[view]}</CardDescription>
        </CardHeader>

        {canConfirm && (
          <CardContent className='flex flex-col gap-2'>
            <Button
              className='w-full'
              onClick={() => {
                // async-iife: user gesture -- a click handler cannot await; `handOff` settles every branch into state.
                void handOff();
              }}
            >
              Connect to Tau Desktop
            </Button>
            <p className='text-xs text-muted-foreground'>This request expires in 5 minutes.</p>
          </CardContent>
        )}

        {view === 'opening' && (
          <CardContent>
            <Button
              variant='outline'
              className='w-full'
              onClick={() => {
                setStatus('not-opened');
              }}
            >
              Tau Desktop didn’t open
            </Button>
          </CardContent>
        )}

        {view === 'not-opened' && (
          <CardContent className='flex flex-col gap-2'>
            <Button className='w-full' onClick={retry}>
              <ExternalLink aria-hidden='true' />
              Try again
            </Button>
            <Button asChild variant='outline' className='w-full'>
              <a href={tauDesktopDownloadUrl} target='_blank' rel='noreferrer'>
                <Download aria-hidden='true' />
                Get Tau Desktop
              </a>
            </Button>
            {/* Sign-in is the one flow with no browser continuation: the
                session being handed over is the desktop app's, not this tab's. */}
            <p className='text-sm text-muted-foreground'>
              To sign in without the desktop app, close this tab and use Tau in the browser.
            </p>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
