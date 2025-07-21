import { AuthCard } from '@daveyplate/better-auth-ui';
import { Link, useLocation } from 'react-router';
import { Tau } from '~/components/icons/tau.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip.js';
import { ENV } from '~/config.js';
import type { Handle } from '~/types/matches.types.js';

export const handle: Handle = {
  noPageWrapper: true,
};

export default function AuthPage(): React.JSX.Element {
  const { pathname } = useLocation();
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <Tooltip>
            <Link to="/">
              <TooltipTrigger className="flex items-center gap-2 font-medium">
                <Tau className="size-7 text-primary" />
                <h1 className="-mb-0.5 -ml-3 font-mono text-2xl font-semibold tracking-wider text-primary italic group-data-[collapsible=icon]:hidden">
                  au
                </h1>
              </TooltipTrigger>
            </Link>
            <TooltipContent side="right">Go home</TooltipContent>
          </Tooltip>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <AuthCard
            pathname={pathname}
            className="w-full max-w-md"
            callbackURL={ENV.TAU_FRONTEND_URL}
            classNames={{ form: { secondaryButton: 'bg-neutral/20 hover:bg-neutral/30' } }}
          />
        </div>
      </div>
      <div className="relative hidden bg-muted lg:block">
        <img
          src="/placeholder.svg"
          alt="Image"
          className="absolute inset-0 h-full w-full object-cover dark:brightness-[0.2] dark:grayscale"
        />
      </div>
    </div>
  );
}
