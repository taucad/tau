'use client';

import { useAuth, useSession } from '@better-auth-ui/react';
import type { User } from 'better-auth';

import { Skeleton } from '#components/ui/skeleton.js';
import { cn } from '#utils/ui.utils.js';
import { UserAvatar } from '#components/auth/user/user-avatar.js';

export type UserViewProps = {
  className?: string;
  isPending?: boolean;
  user?: User;
};

export function UserView({ className, isPending, user }: UserViewProps): React.JSX.Element {
  const { authClient } = useAuth();
  const { data: session, isPending: sessionPending } = useSession(authClient, {
    enabled: !user && !isPending,
  });

  const resolvedUser = user ?? session?.user;

  if ((isPending ?? sessionPending) && !user) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <UserAvatar isPending />

        <div className='grid flex-1 gap-1 text-left text-sm'>
          <Skeleton className='h-4 w-24' />
          <Skeleton className='h-3 w-32' />
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <UserAvatar user={resolvedUser} />

      <div className='grid flex-1 text-left text-sm leading-tight'>
        <span className='truncate font-medium text-foreground'>{resolvedUser?.name ?? resolvedUser?.email}</span>

        {resolvedUser?.name && <span className='truncate text-xs text-muted-foreground'>{resolvedUser.email}</span>}
      </div>
    </div>
  );
}
