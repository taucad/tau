import { useAuth, useListSessions, useSession } from '@better-auth-ui/react';
import { Button } from '@taucad/ui/components/button';
import { Skeleton } from '@taucad/ui/components/skeleton';
import { CircleAlert, LogIn, RefreshCw } from 'lucide-react';
import { ActiveSession } from '#components/auth/settings/security/active-session.js';
import { SettingsGroup, SettingsRow } from '#components/settings/settings-item.js';
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
 * Render a group listing all active sessions for the current user with revoke controls.
 *
 * Shows each session's browser, OS, IP address, and creation time. The current session is marked
 * and navigates to sign-out on click, while other sessions can be revoked individually.
 *
 * @returns A JSX element containing the sessions group
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

  const retry = (
    <Button
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
  );

  return (
    <SettingsGroup title={localization.settings.activeSessions} className={className}>
      {isPending ? (
        <div role='status' aria-busy='true' aria-label='Loading active sessions'>
          <SessionRowSkeleton />
        </div>
      ) : isError ? (
        <div role='alert'>
          <SettingsRow
            title={
              <>
                <CircleAlert aria-hidden='true' className='size-4 shrink-0 text-muted-foreground' />
                {sessionIsNotFresh ? 'Confirm it’s you' : "We couldn't load your active sessions."}
              </>
            }
            description={
              sessionIsNotFresh ? 'For your security, sign in again to view and manage active sessions.' : undefined
            }
            control={
              sessionIsNotFresh ? (
                <Button asChild size='sm'>
                  <Link href={signIn}>
                    <LogIn aria-hidden='true' />
                    Sign in again
                  </Link>
                </Button>
              ) : (
                retry
              )
            }
          />
        </div>
      ) : activeSessions.length === 0 ? (
        <SettingsRow title='No active sessions found.' control={retry} />
      ) : (
        activeSessions.map((activeSession) => <ActiveSession key={activeSession.id} activeSession={activeSession} />)
      )}
    </SettingsGroup>
  );
}

function SessionRowSkeleton(): React.JSX.Element {
  return (
    <div className='flex items-center justify-between gap-4 py-3.5'>
      <div className='flex flex-col gap-1.5'>
        <Skeleton className='h-4 w-28' />
        <Skeleton className='h-3 w-20' />
      </div>
      <Skeleton className='h-8 w-20 rounded-md' />
    </div>
  );
}
