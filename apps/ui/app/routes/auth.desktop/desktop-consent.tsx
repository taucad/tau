import { useSession } from '@better-auth-ui/react';
import { CircleAlert, MonitorSmartphone } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@taucad/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@taucad/ui/components/card';
import { authClient } from '#lib/auth-client.js';
import { desktopAuthorizeUrl, desktopOauthClientName } from '#lib/desktop-oauth.js';
import type { DesktopAuthorization } from '#lib/desktop-oauth.js';

/** How long a check or a send may show progress before the page says it failed (UX rule: no spinner past ~10 s). */
const progressLimit = 10_000;

/** How long Continue stays disabled after the page appears, so a click aimed at something else cannot land on it. */
const continueArming = 500;

/** An account counts as new for this long after it was created: a wrong pick at a provider's chooser makes one. */
const newAccountWindow = 10 * 60 * 1000;

type ConsentState =
  | 'checking'
  | 'couldnt-check'
  | 'continuing'
  | 'expired'
  | 'signed-out'
  | 'consent'
  | 'sending'
  | 'couldnt-send'
  | 'handed-off';

/** The states an answer the person gave moves the page through, over whatever the session says. */
type ActionState = 'sending' | 'couldnt-send' | 'handed-off';

type ConsentAnswer = { readonly url?: unknown };

/**
 * Sends the consent answer and returns where the provider sends the browser next: Tau Desktop's loopback address,
 * with a code when accepted and an `access_denied` error when not.
 *
 * @param authorization - The signed request.
 * @param accept - The person's answer.
 * @returns The redirect URL.
 */
const answerConsent = async (authorization: DesktopAuthorization, accept: boolean): Promise<string> => {
  const result = await authClient.$fetch<ConsentAnswer>('/oauth2/consent', {
    method: 'POST',
    // eslint-disable-next-line @typescript-eslint/naming-convention -- the provider's wire field
    body: { accept, oauth_query: authorization.oauthQuery },
  });
  if (result.error !== null || typeof result.data.url !== 'string') {
    throw new Error('The consent answer was not accepted');
  }
  return result.data.url;
};

/**
 * Focus an element when React attaches it.
 *
 * @param element - The attached element, or `null` when React detaches it.
 */
const focusOnAttach: React.RefCallback<HTMLElement> = (element) => {
  element?.focus();
};

/**
 * Calls back once a delay has passed, kept by a CSS animation delay rather than a script timer (the wait ladder's
 * `wait-hold`, UI Policy § 6). Reduced motion shortens animations, never their delays.
 *
 * @param props - The delay and what to do when it ends.
 * @returns An empty element out of the flow.
 */
function HeldDelay({
  milliseconds,
  onElapsed,
}: {
  readonly milliseconds: number;
  readonly onElapsed: () => void;
}): React.JSX.Element {
  return (
    <span
      aria-hidden
      data-slot='desktop-consent-delay'
      className='absolute size-0 wait-hold'
      style={{ '--wait-hide-delay': `${String(milliseconds)}ms` } as React.CSSProperties}
      onAnimationEnd={(event) => {
        if (event.animationName === 'wait-conceal') {
          onElapsed();
        }
      }}
    />
  );
}

/**
 * The consent page for Tau Desktop's OAuth sign-in (desktop sign-in execution plan DSI-3; audit R5; blueprint
 * revision 6 for the copy). The API's provider sends a signed-in browser here with `prompt=consent` on every sign-in.
 * It names the account, offers a different one, and answers the provider; the provider then sends the browser to the
 * listener Tau Desktop opened for this sign-in on `127.0.0.1`.
 *
 * Nothing is answered without a click. The app's name comes from the client registration, never from the caller.
 *
 * @param props - The signed authorization request.
 * @returns The consent card.
 */
export function DesktopConsent({ authorization }: { readonly authorization: DesktopAuthorization }): React.JSX.Element {
  const { data: session, isPending, isError, refetch } = useSession(authClient);
  /* The time this page opened: what expiry and the new-account mark are judged against. */
  const [openedAt] = useState(() => Date.now());
  const [hasCheckTimedOut, setHasCheckTimedOut] = useState(false);
  const [action, setAction] = useState<ActionState | undefined>();
  const [isArmed, setIsArmed] = useState(false);
  const { isContinuation } = authorization;

  const baseState: ConsentState =
    openedAt >= authorization.expiresAt
      ? 'expired'
      : isPending
        ? hasCheckTimedOut
          ? 'couldnt-check'
          : 'checking'
        : isError
          ? 'couldnt-check'
          : session
            ? isContinuation
              ? 'continuing'
              : 'consent'
            : 'signed-out';
  const state: ConsentState = action ?? baseState;

  // Signed in after "Use a different account" or an emailed link: ask the provider again, for consent only.
  useEffect(() => {
    if (baseState === 'continuing') {
      globalThis.location.replace(desktopAuthorizeUrl(authorization, 'consent'));
    }
  }, [authorization, baseState]);

  const send = useCallback(
    async (accept: boolean): Promise<void> => {
      setAction('sending');
      const giveUp = setTimeout(() => {
        setAction((current) => (current === 'sending' ? 'couldnt-send' : current));
      }, progressLimit);
      try {
        const next = await answerConsent(authorization, accept);
        setAction('handed-off');
        globalThis.location.assign(next);
      } catch {
        setAction('couldnt-send');
      } finally {
        clearTimeout(giveUp);
      }
    },
    [authorization],
  );

  const useDifferentAccount = useCallback((): void => {
    globalThis.location.assign(desktopAuthorizeUrl(authorization, 'login consent'));
  }, [authorization]);

  const email = session?.user.email ?? '';
  const createdAt = session?.user.createdAt === undefined ? Number.NaN : new Date(session.user.createdAt).getTime();
  const isNewAccount = openedAt - createdAt < newAccountWindow;
  const busy = state === 'checking' || state === 'continuing' || state === 'sending';
  const isAlert = state === 'couldnt-check' || state === 'couldnt-send' || state === 'expired';

  const copy = consentCopy(state);

  return (
    <div className='flex min-h-svh items-center justify-center p-6'>
      {/* The session read gives up after the progress limit rather than spinning. */}
      {isPending && !hasCheckTimedOut ? (
        <HeldDelay
          milliseconds={progressLimit}
          onElapsed={() => {
            setHasCheckTimedOut(true);
          }}
        />
      ) : null}
      {/* Continue arms half a second after the consent card shows. */}
      {state === 'consent' && !isArmed ? (
        <HeldDelay
          milliseconds={continueArming}
          onElapsed={() => {
            setIsArmed(true);
          }}
        />
      ) : null}
      <Card
        className='w-full max-w-sm'
        role={busy ? 'status' : isAlert ? 'alert' : undefined}
        aria-busy={busy ? 'true' : undefined}
      >
        <CardHeader>
          <div className='mb-2 flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary'>
            {isAlert ? (
              <CircleAlert className='size-5' aria-hidden='true' />
            ) : (
              <MonitorSmartphone className='size-5' aria-hidden='true' />
            )}
          </div>
          {/* Every change of state draws a new title, which takes focus, so a screen reader announces it. */}
          <CardTitle key={state} variant='title' level={1} ref={focusOnAttach} tabIndex={-1} className='outline-none'>
            {copy.title}
          </CardTitle>
          <CardDescription>{copy.body}</CardDescription>
        </CardHeader>

        {state === 'consent' && (
          <CardContent className='flex flex-col gap-4'>
            <div className='rounded-md border p-3 text-sm'>
              <p className='font-medium break-all'>{email}</p>
              {isNewAccount && <p className='text-muted-foreground'>New account, created just now</p>}
              <p className='mt-2 text-muted-foreground'>App: {desktopOauthClientName}</p>
            </div>
            <p className='text-xs text-muted-foreground'>
              Only continue if you just started signing in from {desktopOauthClientName} on this computer. If someone
              sent you this link or is helping you sign in, cancel. {desktopOauthClientName} gets its own sign-in, which
              you can end in Settings, Security.
            </p>
            <div className='flex flex-col gap-2'>
              <Button
                className='h-auto w-full py-2 break-all whitespace-normal'
                disabled={!isArmed}
                onClick={() => {
                  // async-iife: user gesture -- a click handler cannot await; `send` settles every branch into state.
                  void send(true);
                }}
              >
                Continue as {email}
              </Button>
              <Button variant='outline' className='w-full' onClick={useDifferentAccount}>
                Use a different account
              </Button>
              <Button
                variant='ghost'
                className='w-full'
                onClick={() => {
                  // async-iife: user gesture -- the answer is sent and its outcome lands in state.
                  void send(false);
                }}
              >
                Cancel sign-in
              </Button>
            </div>
          </CardContent>
        )}

        {state === 'signed-out' && (
          <CardContent>
            <Button
              className='w-full'
              onClick={() => {
                globalThis.location.assign(desktopAuthorizeUrl(authorization, 'consent'));
              }}
            >
              Sign in
            </Button>
          </CardContent>
        )}

        {state === 'couldnt-check' && (
          <CardContent>
            <Button
              className='w-full'
              onClick={() => {
                setHasCheckTimedOut(false);
                void refetch();
              }}
            >
              Try again
            </Button>
          </CardContent>
        )}

        {state === 'couldnt-send' && (
          <CardContent className='flex flex-col gap-2'>
            <Button
              className='w-full'
              onClick={() => {
                setAction(undefined);
              }}
            >
              Try again
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

/**
 * One title and body per state.
 *
 * @param state - The state the card shows.
 * @returns The copy.
 */
const consentCopy = (state: ConsentState): { readonly title: string; readonly body: string } => {
  switch (state) {
    case 'checking': {
      return { title: 'Checking this sign-in', body: 'Tau is checking which account this browser is signed in to.' };
    }
    case 'couldnt-check': {
      return { title: 'Couldn’t check this sign-in', body: 'Tau didn’t answer. Check your connection and try again.' };
    }
    case 'continuing': {
      return { title: 'Continuing to Tau Desktop', body: 'Tau is opening the next step of this sign-in.' };
    }
    case 'expired': {
      return { title: 'This sign-in link expired', body: 'Go back to Tau Desktop and choose Sign in again.' };
    }
    case 'signed-out': {
      return {
        title: 'Sign in',
        body: 'Sign in to continue to Tau Desktop. This page then asks you to confirm the account.',
      };
    }
    case 'consent': {
      return { title: 'Sign in to Tau Desktop?', body: 'Tau Desktop is asking to sign in with your Tau account.' };
    }
    case 'sending': {
      return { title: 'Sending your answer', body: 'Tau is passing your answer to Tau Desktop.' };
    }
    case 'couldnt-send': {
      return { title: 'Couldn’t send your answer', body: 'Check your connection and try again.' };
    }
    case 'handed-off': {
      return {
        title: 'Opening Tau Desktop',
        body: 'Your browser is passing the sign-in to Tau Desktop on this computer.',
      };
    }
  }
};
