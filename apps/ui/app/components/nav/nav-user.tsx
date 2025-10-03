import { AuthUIContext, SignedIn, SignedOut, UserAvatar, UserButton } from '@daveyplate/better-auth-ui';
import type { UserButtonProps } from '@daveyplate/better-auth-ui';
import { CreditCard, LogIn, Sparkles } from 'lucide-react';
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
        <Button asChild variant="overlay" className="select-none hidden lg:flex">
          <NavLink to="/auth/sign-in" tabIndex={-1}>
            {({ isPending }) => (
              <>{isPending ? <LoadingSpinner /> : 'Sign In'}</>
            )}
          </NavLink>
        </Button>
        <Button asChild className="select-none hidden">
          <NavLink to="/auth/sign-up" tabIndex={-1}>
            {({ isPending }) =>
              isPending ? <LoadingSpinner /> : 'Sign Up'}
          </NavLink>
        </Button>
        <Button asChild size="icon" variant="overlay" className="select-none lg:hidden text-primary">
          <NavLink to="/auth/sign-in" tabIndex={-1}>
            {({ isPending }) => (
              <>{isPending ? <LoadingSpinner /> : <LogIn />}</>
            )}
          </NavLink>
        </Button>
      </SignedOut>
      <SignedIn>
        <Tooltip>
          <UserButton
            trigger={
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="select-none">
                  <UserAvatar className="size-8 rounded-md" user={session?.user} />
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
