'use client';

import { useAuth, useSession } from '@better-auth-ui/react';
import type { User } from 'better-auth';

import { Skeleton } from '@taucad/ui/components/skeleton';
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

  if ((isPending ?? sessionPending) && !user) {
    return (
      <div data-compact={isCompact} className={cn('group/user-view flex items-center gap-2', className)}>
        <UserAvatar className='group-data-[compact=true]/user-view:size-4' isPending />

        <div className='grid flex-1 gap-1 text-left text-sm group-data-[compact=true]/user-view:gap-0'>
          <Skeleton className='h-4 w-24 group-data-[compact=true]/user-view:h-3' />
          <Skeleton className='h-3 w-32 group-data-[compact=true]/user-view:hidden' />
        </div>
      </div>
    );
  }

  return (
    <div data-compact={isCompact} className={cn('group/user-view flex items-center gap-2', className)}>
      <UserAvatar
        className='group-data-[compact=true]/user-view:size-4 group-data-[compact=true]/user-view:text-[10px]'
        user={resolvedUser}
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
