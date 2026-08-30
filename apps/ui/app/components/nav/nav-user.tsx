import { useEntitlements } from '@taucad/billing/hooks/use-entitlements';
import { Bug, CircleHelp, CreditCard, Settings, Sparkles, WifiOff } from 'lucide-react';
import { Button } from '#components/ui/button.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu.js';
import { ClientOnly } from '#components/ui/utils/client-only.js';
import { openSettingsDialog } from '#hooks/use-settings-dialog.js';
import { UserButton } from '#components/auth/user/user-button.js';
import { ProBadge } from '#components/tier-badge.js';
import { useNetworkConnectivity } from '#hooks/use-network-connectivity.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { metaConfig } from '#constants/meta.constants.js';
import { SvgIcon } from '#components/icons/svg-icon.js';

/**
 * Nav user button: delegates avatar, sign-in/up/out chrome to the registry
 * `<UserButton>`, and extends the dropdown with Tau-specific items (Billing,
 * Settings dialog) via the `links` prop.
 *
 * `shouldHideSettings` suppresses the built-in navigation link so we can open the
 * dialog instead (Tau's settings live in a modal, not a dedicated route).
 */
export function NavUser(): React.JSX.Element {
  const isOnline = useNetworkConnectivity();
  const { tier } = useEntitlements();

  const upgradeItem = (
    <DropdownMenuItem
      key='upgrade'
      className='cursor-pointer'
      onSelect={() => {
        openSettingsDialog('billing');
      }}
    >
      <Sparkles />
      Upgrade to Pro
      <ProBadge className='ml-auto' />
    </DropdownMenuItem>
  );

  const helpItems = [
    <DropdownMenuItem key='bug' asChild>
      <a href={`${metaConfig.githubUrl}/issues/new?labels=bug`} target='_blank' rel='noopener noreferrer'>
        <Bug />
        Report a bug
      </a>
    </DropdownMenuItem>,
    <DropdownMenuItem key='github' asChild>
      <a href={metaConfig.githubUrl} target='_blank' rel='noopener noreferrer'>
        <SvgIcon id='github' />
        GitHub
      </a>
    </DropdownMenuItem>,
    <DropdownMenuItem key='discord' asChild>
      <a href={metaConfig.discordUrl} target='_blank' rel='noopener noreferrer'>
        <CircleHelp />
        Community Discord
      </a>
    </DropdownMenuItem>,
  ];

  return (
    <ClientOnly>
      <div className='flex w-full items-center gap-1'>
        <div className='relative min-w-0 flex-1'>
          <UserButton
            variant='ghost'
            size='sm'
            className='h-7 w-full justify-start px-2.5 select-none'
            align='start'
            side='top'
            sideOffset={8}
            shouldHideSettings
            links={[
              ...(isOnline
                ? []
                : [
                    <DropdownMenuItem key='offline' disabled>
                      <WifiOff />
                      Offline — online features unavailable
                    </DropdownMenuItem>,
                  ]),
              tier === 'free' ? (
                upgradeItem
              ) : (
                <DropdownMenuItem
                  key='billing'
                  className='cursor-pointer'
                  onSelect={() => {
                    openSettingsDialog('billing');
                  }}
                >
                  <CreditCard />
                  Billing
                </DropdownMenuItem>
              ),
              <DropdownMenuItem
                key='settings'
                className='cursor-pointer'
                onSelect={() => {
                  openSettingsDialog('general');
                }}
              >
                <Settings />
                Settings
              </DropdownMenuItem>,
            ]}
          />
          {isOnline ? null : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  role='status'
                  aria-label='Offline'
                  className='absolute top-1 left-5 size-1.5 rounded-full border border-sidebar bg-destructive'
                />
              </TooltipTrigger>
              <TooltipContent side='top'>Offline — reconnect to access online features</TooltipContent>
            </Tooltip>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label='Help'
              variant='ghost'
              size='icon-sm'
              className='size-7 text-muted-foreground data-[state=open]:bg-accent/50'
            >
              <CircleHelp />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side='top' align='end' sideOffset={8} className='min-w-52'>
            {helpItems}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className='font-normal text-muted-foreground'>
              Tau v{metaConfig.version}
            </DropdownMenuLabel>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </ClientOnly>
  );
}
