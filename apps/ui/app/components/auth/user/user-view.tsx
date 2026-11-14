'use client';

import { useAuth, useSession } from '@better-auth-ui/react';
import type { User } from 'better-auth';

import { cn } from '@taucad/ui/utils/cn';
import { UserAvatar } from '#components/auth/user/user-avatar.js';

export type UserViewProps = {
  className?: string;
  isCompact?: boolean;
  isPending?: boolean;
  user?: User;
};

export function UserView({ className, isCompact = false, isPending, user }: UserViewProps): React.JSX.Element {
  const { authClient } = useAuth();
  const { data: session, isPending: sessionPending } = useSession(authClient, {
    enabled: !user && !isPending,
  });

  const resolvedUser = user ?? session?.user;
  /* While the session is unknown the row keeps its frame: an empty avatar box and no words, never skeleton bars.
     What the session already gives is shown at once. */
  const isUnknown = !resolvedUser && (isPending ?? sessionPending);

  return (
    <div data-compact={isCompact} className={cn('group/user-view flex items-center gap-2', className)}>
      <UserAvatar
        className='group-data-[compact=true]/user-view:size-4 group-data-[compact=true]/user-view:text-[10px]'
        user={resolvedUser}
        isPending={isUnknown}
      />

      <div className='grid flex-1 text-left text-sm leading-tight'>
        <span className='truncate font-medium text-foreground group-data-[compact=true]/user-view:font-normal'>
          {resolvedUser?.name ?? resolvedUser?.email}
        </span>

        {resolvedUser?.name && (
          <span className='truncate text-xs text-muted-foreground group-data-[compact=true]/user-view:hidden'>
            {resolvedUser.email}
          </span>
        )}
      </div>
    </div>
  );
}
