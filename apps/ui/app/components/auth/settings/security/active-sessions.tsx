import { useAuth, useListSessions, useSession } from '@better-auth-ui/react';
import { Card, CardContent } from '#components/ui/card.js';
import { Separator } from '#components/ui/separator.js';
import { Skeleton } from '#components/ui/skeleton.js';
import { cn } from '#utils/ui.utils.js';
import { ActiveSession } from '#components/auth/settings/security/active-session.js';

export type ActiveSessionsProps = {
  className?: string;
};

/**
 * Render a card listing all active sessions for the current user with revoke controls.
 *
 * Shows each session's browser, OS, IP address, and creation time. The current session is marked
 * and navigates to sign-out on click, while other sessions can be revoked individually.
 *
 * @returns A JSX element containing the sessions card
 */
export function ActiveSessions({ className }: ActiveSessionsProps) {
  const { authClient, localization } = useAuth();
  const { data: session } = useSession(authClient);

  const { data: sessions, isPending } = useListSessions(authClient);

  const activeSessions = [...(sessions ?? [])].sort((activeSession) =>
    activeSession.id === session?.session.id ? -1 : 1,
  );

  return (
    <div>
      <h2 className='mb-3 text-sm font-semibold'>{localization.settings.activeSessions}</h2>

      <Card className={cn('p-0', className)}>
        <CardContent className='p-0'>
          {isPending ? (
            <SessionRowSkeleton />
          ) : (
            activeSessions?.map((activeSession, index) => (
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
