import { useAuth, useSession } from '@better-auth-ui/react';
import { ChevronsUpDown, LogIn, LogOut, Settings, UserPlus2 } from 'lucide-react';
import { isValidElement } from 'react';
import type { ComponentType, ReactElement, ReactNode } from 'react';

import { Button } from '#components/ui/button.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu.js';
import { cn } from '#utils/ui.utils.js';
import { UserAvatar } from '#components/auth/user/user-avatar.js';
import { UserView } from '#components/auth/user/user-view.js';
/** Auth states a `UserButton` link can be visible in. */
export type UserButtonLinkVisibility = 'authenticated' | 'unauthenticated' | 'always';

/** A simple link entry rendered as a `DropdownMenuItem` in the `UserButton` menu. */
export type UserButtonLink = {
  /** Visible label. */
  label: ReactNode;
  /** Destination URL. */
  href: string;
  /** Optional leading icon. Sized/coloured to match built-in items. */
  icon?: ReactNode;
  /** Forwarded to the underlying `DropdownMenuItem`. */
  variant?: 'default' | 'destructive';
  /**
   * When this link is visible based on auth state.
   * @default "always"
   */
  visibility?: UserButtonLinkVisibility;
};

export type UserButtonProps = {
  className?: string;
  align?: 'center' | 'end' | 'start' | undefined;
  side?: 'top' | 'right' | 'bottom' | 'left';
  sideOffset?: number;
  size?: 'default' | 'icon' | 'sm';
  variant?: 'default' | 'destructive' | 'ghost' | 'link' | 'outline' | 'secondary';
  /** Additional menu entries rendered above the built-in items. */
  links?: Array<UserButtonLink | ReactElement>;
  /** Hide the built-in "Settings" link. Useful when replacing it via `links`. */
  shouldHideSettings?: boolean;
};

function renderUserLink(
  link: UserButtonLink | ReactElement,
  Link: ComponentType<{ href: string; children?: ReactNode }>,
  fallbackKey: string,
): ReactNode {
  if (isValidElement(link)) {
    return link;
  }

  const { label, href, icon, variant } = link;
  return (
    <DropdownMenuItem key={fallbackKey} variant={variant} asChild>
      <Link href={href}>
        {icon}
        {label}
      </Link>
    </DropdownMenuItem>
  );
}

/**
 * Render a user dropdown button that shows user info, settings, theme controls, and authentication actions.
 *
 * Includes user profile, settings link, optional multi-session account switching, theme picker,
 * and sign-in/sign-up/sign-out actions depending on authentication state.
 */
export function UserButton({
  className,
  align,
  side,
  sideOffset,
  size = 'default',
  variant = 'ghost',
  links,
  shouldHideSettings = false,
}: UserButtonProps): React.JSX.Element {
  const { authClient, basePaths, viewPaths, localization, plugins, Link } = useAuth();

  const { data: session, isPending: sessionPending } = useSession(authClient);
  const isCompact = size === 'sm';

  const userLinks = links?.flatMap((link, index) => {
    if (!isValidElement(link)) {
      const visibility = link.visibility ?? 'always';
      if (visibility === 'authenticated' && !session) {
        return [];
      }
      if (visibility === 'unauthenticated' && session) {
        return [];
      }
    }
    return [renderUserLink(link, Link, `user-button-link-${index.toString()}`)];
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          size === 'icon' && 'rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring',
          size === 'icon' && className,
        )}
        asChild={size !== 'icon'}
      >
        {size === 'icon' ? (
          <UserAvatar />
        ) : (
          <Button
            variant={variant}
            className={cn('font-normal', size === 'default' && 'h-auto py-2.5', className)}
            size={isCompact ? 'sm' : 'lg'}
          >
            {(session ?? sessionPending) ? (
              <UserView isCompact={isCompact} />
            ) : (
              <>
                <UserAvatar className={cn(isCompact && 'size-4 text-[10px]')} />

                <div className='grid flex-1 text-left text-sm leading-tight'>{localization.auth.account}</div>
              </>
            )}

            {isCompact ? null : <ChevronsUpDown className='ml-auto' />}
          </Button>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className='w-[--radix-dropdown-menu-trigger-width] max-w-[48svw] min-w-40 md:min-w-56'
        sideOffset={sideOffset}
        side={side}
        align={align}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
        }}
      >
        {session && (
          <>
            <DropdownMenuLabel className='text-sm font-normal'>
              <UserView />
            </DropdownMenuLabel>

            <DropdownMenuSeparator />
          </>
        )}

        {session ? (
          <>
            {userLinks}

            {!shouldHideSettings && (
              <DropdownMenuItem asChild>
                <Link href={`${basePaths.settings}/${viewPaths.settings.account}`}>
                  <Settings className='text-muted-foreground' />

                  {localization.settings.settings}
                </Link>
              </DropdownMenuItem>
            )}

            {plugins.flatMap((plugin) =>
              plugin.userMenuItems?.map((Item, index) => <Item key={`${plugin.id}-${index.toString()}`} />),
            )}

            <DropdownMenuSeparator />

            <DropdownMenuItem asChild>
              <Link href={`${basePaths.auth}/${viewPaths.auth.signOut}`}>
                <LogOut className='text-muted-foreground' />

                {localization.auth.signOut}
              </Link>
            </DropdownMenuItem>
          </>
        ) : (
          <>
            {userLinks}

            <DropdownMenuItem asChild>
              <Link href={`${basePaths.auth}/${viewPaths.auth.signIn}`}>
                <LogIn className='text-muted-foreground' />

                {localization.auth.signIn}
              </Link>
            </DropdownMenuItem>

            <DropdownMenuItem asChild>
              <Link href={`${basePaths.auth}/${viewPaths.auth.signUp}`}>
                <UserPlus2 className='text-muted-foreground' />

                {localization.auth.signUp}
              </Link>
            </DropdownMenuItem>

            {plugins.flatMap((plugin) =>
              plugin.userMenuItems?.map((Item, index) => <Item key={`${plugin.id}-${index.toString()}`} />),
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
