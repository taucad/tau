import { AuthUIContext, SignedIn, SignedOut, UserAvatar, UserButton } from '@daveyplate/better-auth-ui';
import type { UserButtonProps } from '@daveyplate/better-auth-ui';
import { CreditCard, Sparkles } from 'lucide-react';
import { useContext } from 'react';
import { NavLink } from 'react-router';
import { Button } from '#components/ui/button.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { LoadingSpinner } from '#components/loading-spinner.js';

const additionalUserButtonLinks: UserButtonProps['additionalLinks'] = [
  {
    href: '/settings/billing',
    label: 'Upgrade to Pro',
    icon: <Sparkles />,
    signedIn: true,
  },
  {
    href: '/settings/billing',
    label: 'Billing',
    icon: <CreditCard />,
    signedIn: true,
  },
];

export function NavUser(): React.JSX.Element {
  const { hooks } = useContext(AuthUIContext);
  const { data: session } = hooks.useSession();

  return (
    <>
      <SignedOut>
        <NavLink to="/auth/sign-in" tabIndex={-1}>
          {({ isPending }) => (
            <Button variant="outline" className="select-none">
              {isPending ? <LoadingSpinner /> : 'Sign In'}
            </Button>
          )}
        </NavLink>
      </SignedOut>
      <SignedOut>
        <NavLink to="/auth/sign-up" tabIndex={-1}>
          {({ isPending }) => <Button className="select-none">{isPending ? <LoadingSpinner /> : 'Sign Up'}</Button>}
        </NavLink>
      </SignedOut>
      <SignedIn>
        <Tooltip>
          <UserButton
            trigger={
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="select-none">
                  <UserAvatar className="size-7" user={session?.user} />
                </Button>
              </TooltipTrigger>
            }
            size="icon"
            classNames={{ content: { menuItem: 'cursor-pointer' } }}
            additionalLinks={additionalUserButtonLinks}
          />
          <TooltipContent>Profile</TooltipContent>
        </Tooltip>
      </SignedIn>
    </>
  );
}
