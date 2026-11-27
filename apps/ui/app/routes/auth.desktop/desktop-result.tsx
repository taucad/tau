import { CircleAlert, CircleCheck } from 'lucide-react';

import { Card, CardDescription, CardHeader, CardTitle } from '@taucad/ui/components/card';
import type { DesktopSignInResult } from '#lib/desktop-oauth.js';

/**
 * The page Tau Desktop sends the browser to once it received a sign-in, or could not finish one (desktop sign-in
 * execution plan DSI-3). The app tells the page what happened, so neither side waits for the other.
 *
 * @param props - The outcome the app reported.
 * @returns The outcome card.
 */
export function DesktopResult({ result }: { readonly result: DesktopSignInResult }): React.JSX.Element {
  const copy = resultCopy(result);
  return (
    <div className='flex min-h-svh items-center justify-center p-6'>
      <Card className='w-full max-w-sm' role={result.kind === 'failed' ? 'alert' : 'status'}>
        <CardHeader>
          <div className='mb-2 flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary'>
            {result.kind === 'signed-in' ? (
              <CircleCheck className='size-5' aria-hidden='true' />
            ) : (
              <CircleAlert className='size-5' aria-hidden='true' />
            )}
          </div>
          <CardTitle variant='title'>{copy.title}</CardTitle>
          <CardDescription>{copy.body}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

const resultCopy = (result: DesktopSignInResult): { readonly title: string; readonly body: string } => {
  if (result.kind === 'signed-in') {
    return { title: 'You’re signed in to Tau Desktop', body: 'You can close this tab.' };
  }
  switch (result.reason) {
    case 'canceled': {
      return { title: 'Sign-in canceled', body: 'Tau Desktop was not signed in. You can close this tab.' };
    }
    case 'expired': {
      return { title: 'This sign-in expired', body: 'Go back to Tau Desktop and choose Sign in again.' };
    }
    case 'error': {
      return {
        title: 'Couldn’t sign in to Tau Desktop',
        body: 'Go back to Tau Desktop and choose Sign in again. Tau Desktop shows what went wrong.',
      };
    }
  }
};
