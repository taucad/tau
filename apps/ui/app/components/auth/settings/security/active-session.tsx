'use client';

import { useAuth, useRevokeSession, useSession } from '@better-auth-ui/react';
import type { Session } from 'better-auth';
import Bowser from 'bowser';
import { LogOut, Monitor, Smartphone, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '#components/ui/button.js';
import { Card, CardContent } from '#components/ui/card.js';
import { Spinner } from '#components/ui/spinner.js';

function timeAgo(date: Date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

  const relativeTimeUnits: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3600],
    ['minute', 60],
    ['second', 1],
  ];

  for (const [unit, threshold] of relativeTimeUnits) {
    if (seconds >= threshold) {
      return rtf.format(-Math.floor(seconds / threshold), unit);
    }
  }

  return rtf.format(0, 'second');
}

export type ActiveSessionProps = {
  activeSession: Session;
};

/**
 * Render a single active session row with device info and revoke control.
 *
 * Shows the session's browser, OS, and creation time. The current session is marked
 * and navigates to sign-out on click, while other sessions can be revoked individually.
 *
 * @param session - The session object containing id, token, userAgent, ipAddress, and createdAt
 * @returns A JSX element containing the active session row
 */
export function ActiveSession({ activeSession }: ActiveSessionProps) {
  const { authClient, basePaths, localization, viewPaths, navigate } = useAuth();
  const { data: session } = useSession(authClient, { refetchOnMount: false });

  const { mutate: revokeSession, isPending: isRevoking } = useRevokeSession(authClient, {
    onSuccess: () => toast.success(localization.settings.revokeSessionSuccess),
  });

  const isCurrentSession = activeSession.token === session?.session.token;
  const ua = Bowser.parse(activeSession.userAgent ?? '');
  const isMobile = ua.platform.type === 'mobile' || ua.platform.type === 'tablet';

  return (
    <Card className='border-0 bg-transparent shadow-none ring-0'>
      <CardContent className='flex items-center justify-between gap-3'>
        <div className='flex size-10 shrink-0 items-center justify-center rounded-md bg-muted'>
          {isMobile ? <Smartphone className='size-4.5' /> : <Monitor className='size-4.5' />}
        </div>

        <div className='flex min-w-0 flex-col'>
          <span className='truncate text-sm font-medium'>
            {ua.browser.name ?? 'Unknown Browser'}
            {ua.os.name ? `, ${ua.os.name}` : ''}
          </span>

          {isCurrentSession ? (
            <span className='w-fit rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary'>
              {localization.settings.currentSession}
            </span>
          ) : (
            activeSession.createdAt && (
              <span className='text-xs text-muted-foreground capitalize'>{timeAgo(activeSession.createdAt)}</span>
            )
          )}
        </div>

        <Button
          className='ml-auto shrink-0'
          variant='outline'
          size='sm'
          onClick={() => {
            if (isCurrentSession) {
              navigate({
                to: `${basePaths.auth}/${viewPaths.auth.signOut}`,
              });
              return;
            }
            revokeSession(activeSession);
          }}
          disabled={isRevoking}
          aria-label={isCurrentSession ? localization.auth.signOut : localization.settings.revokeSession}
        >
          {isRevoking ? <Spinner /> : isCurrentSession ? <LogOut /> : <X />}

          {isCurrentSession ? localization.auth.signOut : localization.settings.revoke}
        </Button>
      </CardContent>
    </Card>
  );
}
