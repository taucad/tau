import { AuthUIContext, SignedIn, SignedOut, UserAvatar, UserButton } from '@daveyplate/better-auth-ui';
import type { UserButtonProps } from '@daveyplate/better-auth-ui';
import { CreditCard, Sparkles } from 'lucide-react';
import { useContext } from 'react';
import { Link } from 'react-router';
import { Button } from '~/components/ui/button.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip.js';

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
        <Link to="/auth/sign-in">
          <Button variant="outline" className="select-none">
            Sign In
          </Button>
        </Link>
      </SignedOut>
      <SignedOut>
        <Link to="/auth/sign-up">
          <Button className="select-none">Sign Up</Button>
        </Link>
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

  // Return (
  //   <Tooltip>
  //     <DropdownMenu>
  //       <DropdownMenuTrigger asChild>
  //         <TooltipTrigger asChild>
  //           <Button variant="outline" size="icon" className="size-7 rounded-full select-none">
  //             <Avatar className="size-7.5">
  //               <AvatarImage src={user.avatar} alt={user.name} />
  //               <AvatarFallback className="rounded-lg">CN</AvatarFallback>
  //             </Avatar>
  //           </Button>
  //         </TooltipTrigger>
  //       </DropdownMenuTrigger>
  //       <TooltipContent>Profile</TooltipContent>
  //       <DropdownMenuContent
  //         className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
  //         side="bottom"
  //         align="end"
  //         sideOffset={4}
  //       >
  //         <DropdownMenuLabel className="p-0 font-normal">
  //           <div className="flex items-center gap-2 px-2 py-1.5 text-left text-sm">
  //             <div className="grid flex-1 text-left text-sm leading-tight">
  //               <span className="truncate font-semibold">{user.name}</span>
  //               <span className="truncate text-xs">{user.email}</span>
  //             </div>
  //           </div>
  //         </DropdownMenuLabel>
  //         <DropdownMenuSeparator />
  //         <DropdownMenuGroup>
  //           <DropdownMenuItem>
  //             <Sparkles />
  //             Upgrade to Pro
  //           </DropdownMenuItem>
  //         </DropdownMenuGroup>
  //         <DropdownMenuSeparator />
  //         <DropdownMenuGroup>
  //           <DropdownMenuItem>
  //             <BadgeCheck />
  //             Account
  //           </DropdownMenuItem>
  //           <DropdownMenuItem>
  //             <CreditCard />
  //             Billing
  //           </DropdownMenuItem>
  //           <DropdownMenuItem>
  //             <Bell />
  //             Notifications
  //           </DropdownMenuItem>
  //         </DropdownMenuGroup>
  //         <DropdownMenuSeparator />
  //       </DropdownMenuContent>
  //     </DropdownMenu>
  //   </Tooltip>
  // );
}
