import { useAuth, useListSessions, useSession } from '@better-auth-ui/react';
import { Button } from '@taucad/ui/components/button';
import { Card, CardContent } from '@taucad/ui/components/card';
import { Separator } from '@taucad/ui/components/separator';
import { Skeleton } from '@taucad/ui/components/skeleton';
import { cn } from '@taucad/ui/utils/cn';
import { CircleAlert, LogIn, RefreshCw } from 'lucide-react';
import { ActiveSession } from '#components/auth/settings/security/active-session.js';
import { Spinner } from '#components/ui/spinner.js';
import { useAuthLinks } from '#hooks/use-auth-links.js';

export type ActiveSessionsProps = {
  className?: string;
};

const getAuthErrorCode = (error: unknown): string | undefined => {
  if (!error || typeof error !== 'object') {
    return undefined;
  }
  const body = (error as { error?: unknown }).error;
  if (!body || typeof body !== 'object' || !('code' in body)) {
    return undefined;
  }
  const { code } = body as { code?: unknown };
  return typeof code === 'string' ? code : undefined;
};

/**
 * Render a card listing all active sessions for the current user with revoke controls.
 *
 * Shows each session's browser, OS, IP address, and creation time. The current session is marked
 * and navigates to sign-out on click, while other sessions can be revoked individually.
 *
 * @returns A JSX element containing the sessions card
 */
export function ActiveSessions({ className }: ActiveSessionsProps): React.JSX.Element {
  const { authClient, localization, Link } = useAuth();
  const { signIn } = useAuthLinks();
  const { data: session } = useSession(authClient);

  const {
    data: sessions,
    error,
    isError,
    isFetching,
    isPending,
    refetch,
  } = useListSessions(authClient, {
    meta: { handlesErrorLocally: true },
  });

  const activeSessions = [...(sessions ?? [])].sort(
    (first, second) => Number(second.token === session?.session.token) - Number(first.token === session?.session.token),
  );
  const sessionIsNotFresh = getAuthErrorCode(error) === 'SESSION_NOT_FRESH';

  return (
    <div>
      <h2 className='mb-3 text-sm font-semibold'>{localization.settings.activeSessions}</h2>

      <Card className={cn('p-0', className)}>
        <CardContent className='p-0'>
          {isPending ? (
            <div role='status' aria-busy='true' aria-label='Loading active sessions'>
              <SessionRowSkeleton />
            </div>
          ) : isError ? (
            <div className='flex min-h-24 flex-wrap items-center gap-3 p-4' role='alert'>
              <div className='flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground'>
                <CircleAlert className='size-4.5' aria-hidden='true' />
              </div>

              <p className='min-w-48 flex-1 text-sm text-muted-foreground'>
                {sessionIsNotFresh
                  ? 'For your security, sign in again to view and manage active sessions.'
                  : "We couldn't load your active sessions."}
              </p>

              {sessionIsNotFresh ? (
                <Button asChild className='ml-auto' size='sm'>
                  <Link href={signIn}>
                    <LogIn aria-hidden='true' />
                    Sign in again
                  </Link>
                </Button>
              ) : (
                <Button
                  className='ml-auto'
                  variant='outline'
                  size='sm'
                  disabled={isFetching}
                  onClick={async () => {
                    await refetch();
                  }}
                >
                  {isFetching ? <Spinner /> : <RefreshCw aria-hidden='true' />}
                  Try again
                </Button>
              )}
            </div>
          ) : activeSessions.length === 0 ? (
            <p className='p-4 text-sm text-muted-foreground'>No active sessions found.</p>
          ) : (
            activeSessions.map((activeSession, index) => (
              <div key={activeSession.id}>
                {index > 0 && <Separator />}

                <ActiveSession activeSession={activeSession} />
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SessionRowSkeleton() {
  return (
    <Card className='border-0 bg-transparent shadow-none ring-0'>
      <CardContent className='flex items-center gap-3'>
        <Skeleton className='size-10 rounded-md' />

        <div className='flex flex-col gap-1'>
          <Skeleton className='h-4 w-20' />
          <Skeleton className='h-3 w-32' />
        </div>
      </CardContent>
    </Card>
  );
}
