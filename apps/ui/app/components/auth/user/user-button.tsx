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
  sideOffset?: number;
  size?: 'default' | 'icon';
  variant?: 'default' | 'destructive' | 'ghost' | 'link' | 'outline' | 'secondary';
  /** Additional menu entries rendered above the built-in items. */
  links?: Array<UserButtonLink | ReactElement>;
  /** Hide the built-in "Settings" link. Useful when replacing it via `links`. */
  hideSettings?: boolean;
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
 *
 * @param className - Additional CSS classes applied to the button trigger
 * @param align - Alignment of the dropdown menu relative to the trigger
 * @param sideOffset - Offset between the trigger and the dropdown menu
 * @param size - "icon" renders only the avatar; "default" renders a full button with label and chevron
 * @param variant - Visual variant of the trigger button
 * @param links - Additional menu entries rendered above the built-in items
 * @param hideSettings - Hide the built-in "Settings" link
 * @returns The dropdown menu component with user actions
 */
export function UserButton({
  className,
  align,
  sideOffset,
  size = 'default',
  variant = 'ghost',
  links,
  hideSettings = false,
}: UserButtonProps) {
  const { authClient, basePaths, viewPaths, localization, plugins, Link } = useAuth();

  const { data: session, isPending: sessionPending } = useSession(authClient);

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
        className={cn(size === 'icon' && 'rounded-full', size === 'icon' && className)}
        asChild={size === 'default'}
      >
        {size === 'icon' ? (
          <UserAvatar />
        ) : (
          <Button variant={variant} className={cn('py-2.5 h-auto font-normal', className)} size='lg'>
            {(session ?? sessionPending) ? (
              <UserView />
            ) : (
              <>
                <UserAvatar />

                <div className='grid flex-1 text-left text-sm leading-tight'>{localization.auth.account}</div>
              </>
            )}

            <ChevronsUpDown className='ml-auto' />
          </Button>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className='w-[--radix-dropdown-menu-trigger-width] max-w-[48svw] min-w-40 md:min-w-56'
        sideOffset={sideOffset}
        align={align}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
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

            {!hideSettings && (
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
