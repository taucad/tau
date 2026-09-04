import { useAuthenticate } from '@better-auth-ui/react';
import { CheckCircle2, CircleAlert, MonitorSmartphone } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useLocation } from 'react-router';

import { Button } from '@taucad/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@taucad/ui/components/card';
import { Spinner } from '#components/ui/spinner.js';
import { authClient } from '#lib/auth-client.js';
import type { Handle } from '#types/matches.types.js';

/**
 * The path Electron main's ephemeral loopback listener serves. Part of the
 * batch A contract with the desktop shell — changing it breaks sign-in.
 */
export const desktopLoopbackCallbackPath = '/callback';

/** Query params this page accepts, and the ones it echoes back over loopback. */
export const desktopHandoffParameterNames = {
  port: 'port',
  state: 'state',
  oneTimeToken: 'ott',
} as const;

export type DesktopHandoffTarget = {
  /** The loopback port Electron main is listening on. */
  readonly port: number;
  /** Opaque nonce minted by main; echoed back untouched so main can match it. */
  readonly state: string;
};

/**
 * Validates the handoff parameters before anything is minted for them.
 *
 * The port must be a real, non-ephemeral TCP port (main resolves `:0` to a
 * concrete port before it opens the browser), and the state must look like the
 * opaque nonce main generated — this page never interprets it, it only refuses
 * to carry anything that is not one.
 *
 * @param search - The route's raw query string.
 * @returns The validated target, or `undefined` when the request is malformed.
 */
export function parseDesktopHandoffTarget(search: string): DesktopHandoffTarget | undefined {
  const parameters = new URLSearchParams(search);
  const rawPort = parameters.get(desktopHandoffParameterNames.port) ?? '';
  const state = parameters.get(desktopHandoffParameterNames.state) ?? '';

  // Number('') is 0 and Number('80x') is NaN — both fail the range check below.
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    return undefined;
  }

  if (!/^[\w-]{8,128}$/.test(state)) {
    return undefined;
  }

  return { port, state };
}

/**
 * Builds the loopback URL this page navigates to once a token exists.
 *
 * @param target - The validated port and state.
 * @param oneTimeToken - The freshly minted single-use token.
 * @returns The absolute `http://127.0.0.1:<port>/callback?...` URL.
 */
export function buildDesktopLoopbackUrl(target: DesktopHandoffTarget, oneTimeToken: string): string {
  const url = new URL(`http://127.0.0.1:${target.port}${desktopLoopbackCallbackPath}`);
  url.searchParams.set(desktopHandoffParameterNames.oneTimeToken, oneTimeToken);
  url.searchParams.set(desktopHandoffParameterNames.state, target.state);
  return url.toString();
}

export const handle: Handle = {
  enablePageWrapper: false,
};

type HandoffStatus = 'invalid-request' | 'awaiting-consent' | 'minting' | 'handed-off' | 'failed';

/**
 * Web-only sign-in handoff for the Electron app (ruling D7).
 *
 * Runs in the user's system browser, never in the renderer. On confirmation it
 * mints a one-time token and hands it to the desktop app by navigating — a
 * top-level navigation rather than a `fetch`, because Chrome's Private Network
 * Access preflight would block a cross-origin request to loopback but does not
 * gate navigations.
 *
 * **The token is minted only from a user gesture, never on mount.** Any site can
 * navigate a signed-in browser to this URL with a port of its choosing, and
 * `/one-time-token/verify` exchanges the result for a full session. `state`
 * proves the callback to Electron main; it proves nothing to the person whose
 * session is being handed over. The confirmation naming the port is what stands
 * between a drive-by navigation and a stolen session.
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

  const handOff = useCallback(async (): Promise<void> => {
    if (!target) {
      return;
    }

    setStatus('minting');
    const result = await authClient.$fetch<{ token: string }>('/one-time-token/generate');

    if (result.error !== null || result.data.token === '') {
      setStatus('failed');
      return;
    }

    setStatus('handed-off');
    globalThis.location.assign(buildDesktopLoopbackUrl(target, result.data.token));
  }, [target]);

  const canConfirm = status === 'awaiting-consent' && target !== undefined && session !== undefined;
  // Signed out, `useAuthenticate` has already bounced through
  // /auth/sign-in?redirectTo=…; show progress rather than a consent prompt for
  // a session that does not exist yet.
  const view = status === 'awaiting-consent' && session === undefined ? 'minting' : status;

  return (
    <div className='flex min-h-svh items-center justify-center p-6'>
      <Card className='w-full max-w-sm'>
        <CardHeader>
          <div className='mb-2 flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary'>
            {view === 'handed-off' ? (
              <CheckCircle2 className='size-5' aria-hidden='true' />
            ) : view === 'minting' ? (
              <Spinner className='size-5' />
            ) : view === 'awaiting-consent' ? (
              <MonitorSmartphone className='size-5' aria-hidden='true' />
            ) : (
              <CircleAlert className='size-5' aria-hidden='true' />
            )}
          </div>

          <CardTitle className='text-xl font-semibold'>
            {view === 'handed-off'
              ? 'You can return to the app'
              : view === 'minting'
                ? 'Signing you in to Tau Desktop'
                : view === 'awaiting-consent'
                  ? 'Connect to Tau Desktop?'
                  : view === 'invalid-request'
                    ? 'This sign-in link is not valid'
                    : "We couldn't complete the sign-in"}
          </CardTitle>

          <CardDescription>
            {view === 'handed-off'
              ? 'Tau Desktop has your session. You can close this tab.'
              : view === 'minting'
                ? 'Hold tight while Tau hands your session to the desktop app.'
                : view === 'awaiting-consent'
                  ? `An app on this computer is asking for your Tau session at 127.0.0.1:${target?.port ?? ''}. Only continue if you just started sign-in from Tau Desktop.`
                  : view === 'invalid-request'
                    ? 'Start sign-in from Tau Desktop rather than opening this page directly.'
                    : 'Return to Tau Desktop and start sign-in again.'}
          </CardDescription>
        </CardHeader>

        {canConfirm && (
          <CardContent>
            <Button className='w-full' onClick={() => void handOff()}>
              Connect to Tau Desktop
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
