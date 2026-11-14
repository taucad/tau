import { useAuth, useSession } from '@better-auth-ui/react';
import type { User } from 'better-auth';
import { User2 } from 'lucide-react';
import type { ReactNode } from 'react';

import { Avatar, AvatarFallback, AvatarImage } from '@taucad/ui/components/avatar';
import { cn } from '@taucad/ui/utils/cn';

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

  const resolvedUser = user ?? session?.user;

  /* The account row's box is held and left empty until the session names someone: no avatar block stands in for
     a person not known yet (loading-states blueprint, app shell). */
  if (!resolvedUser && (isPending ?? sessionPending)) {
    return <span aria-hidden data-slot='user-avatar-frame' className={cn('size-8 shrink-0 rounded-full', className)} />;
  }

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
