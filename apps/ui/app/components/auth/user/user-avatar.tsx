import { useAuth, useSession } from '@better-auth-ui/react';
import type { User } from 'better-auth';
import { User2 } from 'lucide-react';
import type { ReactNode } from 'react';

import { Avatar, AvatarFallback, AvatarImage } from '#components/ui/avatar.js';
import { Skeleton } from '#components/ui/skeleton.js';
import { cn } from '#utils/ui.utils.js';

export type UserAvatarProps = {
  className?: string;
  fallback?: ReactNode;
  isPending?: boolean;
  user?: User;
};

export function UserAvatar({ className, user, isPending, fallback }: UserAvatarProps): React.JSX.Element {
  const { authClient } = useAuth();
  const { data: session, isPending: sessionPending } = useSession(authClient, {
    enabled: !user && !isPending,
  });

  if ((isPending ?? sessionPending) && !user) {
    return <Skeleton className={cn('size-8 rounded-full', className)} />;
  }

  const resolvedUser = user ?? session?.user;

  const initials = (resolvedUser?.name ?? resolvedUser?.email)?.slice(0, 2).toUpperCase();

  return (
    <Avatar className={cn('size-8 bg-muted text-foreground text-sm rounded-full', className)}>
      <AvatarImage src={resolvedUser?.image ?? undefined} alt={resolvedUser?.name ?? resolvedUser?.email} />

      <AvatarFallback delayMs={resolvedUser?.image ? 600 : undefined}>
        {fallback ?? initials ?? <User2 className='size-4' />}
      </AvatarFallback>
    </Avatar>
  );
}
