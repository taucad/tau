/* eslint-disable @typescript-eslint/naming-convention -- RFC 8628 wire fields. */
import { useAuthenticate } from '@better-auth-ui/react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocation } from 'react-router';
import { Button } from '@taucad/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@taucad/ui/components/card';
import { authClient } from '#lib/auth-client.js';
import type { Handle } from '#types/matches.types.js';

export const handle: Handle = { enablePageWrapper: false };
export const meta = (): Array<{ title: string }> => [{ title: 'Authorize Tau CLI — Tau' }];

/** Explicit approval binds the code shown by the terminal to the signed-in account. */
export default function AuthCliRoute(): React.JSX.Element {
  const location = useLocation();
  const userCode = new URLSearchParams(location.search).get('user_code') ?? '';
  const isValidCode = /^[A-Z0-9-]{4,32}$/u.test(userCode);
  const { data: session } = useAuthenticate(authClient);
  const [outcome, setOutcome] = useState<'approved' | 'denied' | 'failed'>();
  const [isBusy, setIsBusy] = useState(false);
  const request = useQuery({
    queryKey: ['cli-authorization', session?.user.id, userCode],
    enabled: isValidCode && Boolean(session),
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const result = await authClient.device({ query: { user_code: userCode } });
      if (result.error !== null || result.data.client_id !== 'tau-cli' || Boolean(result.data.scope)) {
        throw new Error('Invalid request');
      }
      return result.data;
    },
  });
  const canApprove = !outcome && request.data?.status === 'pending' && !request.isError && !isBusy;
  const decide = async (decision: 'approve' | 'deny'): Promise<void> => {
    if (!canApprove) {
      return;
    }
    setIsBusy(true);
    try {
      const result = await authClient.device[decision]({ userCode });
      setOutcome(result.error ? 'failed' : decision === 'approve' ? 'approved' : 'denied');
    } catch {
      setOutcome('failed');
    } finally {
      setIsBusy(false);
    }
  };
  const hasError = !isValidCode || request.isError || outcome === 'failed';
  const isFinished = outcome === 'approved' || outcome === 'denied';
  return (
    <div className='flex min-h-svh items-center justify-center p-6'>
      <Card className='w-full max-w-sm'>
        <CardHeader>
          <CardTitle>Authorize Tau CLI</CardTitle>
          <CardDescription>
            Only approve if you started sign-in in your own terminal and the codes match.
          </CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          {hasError ? (
            <p role='alert'>This request is invalid, expired, or unavailable. Start again with tau auth login.</p>
          ) : isFinished ? (
            <p role='status'>
              {outcome === 'approved'
                ? 'Approved. Return to your terminal to finish signing in.'
                : 'Sign-in denied. You can close this page.'}
            </p>
          ) : (
            <>
              <p className='font-mono text-2xl' aria-label='Confirmation code'>
                {userCode}
              </p>
              <p>Account: {session?.user.email ?? 'Signing in…'}</p>
              <p className='text-sm text-muted-foreground'>
                Tau CLI will be able to access your Tau Cloud account, including your projects, backups, and paid
                services. It receives its own session, which you can revoke with tau auth logout.
              </p>
              {request.data && request.data.status !== 'pending' ? (
                <p role='status'>This request has already been processed. Return to your terminal.</p>
              ) : null}
              <Button
                disabled={!canApprove}
                aria-busy={isBusy}
                onClick={() => {
                  void decide('approve');
                }}
              >
                Approve CLI sign-in
              </Button>
              <Button
                variant='outline'
                disabled={!canApprove}
                onClick={() => {
                  void decide('deny');
                }}
              >
                Deny
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
