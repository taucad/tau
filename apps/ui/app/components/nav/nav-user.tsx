import { Bug, CircleHelp, CreditCard, Info, Settings, Sparkles, WifiOff } from 'lucide-react';
import { DropdownMenuItem } from '#components/ui/dropdown-menu.js';
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
 * `hideSettings` suppresses the built-in navigation link so we can open the
 * dialog instead (Tau's settings live in a modal, not a dedicated route).
 */
export function NavUser(): React.JSX.Element {
  const isOnline = useNetworkConnectivity();

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
    <DropdownMenuItem key='about' asChild>
      <a href='/docs'>
        <Info />
        About Tau
      </a>
    </DropdownMenuItem>,
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
      <div className='relative w-full'>
        <UserButton
          variant='ghost'
          className='w-full justify-start px-2 select-none'
          align='start'
          side='top'
          sideOffset={8}
          hideSettings
          links={[
            ...(isOnline
              ? []
              : [
                  <DropdownMenuItem key='offline' disabled>
                    <WifiOff />
                    Offline — online features unavailable
                  </DropdownMenuItem>,
                ]),
            upgradeItem,
            <DropdownMenuItem
              key='billing'
              className='cursor-pointer'
              onSelect={() => {
                openSettingsDialog('billing');
              }}
            >
              <CreditCard />
              Billing
            </DropdownMenuItem>,
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
            ...helpItems,
          ]}
        />
        {isOnline ? null : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                role='status'
                aria-label='Offline'
                className='absolute top-2 left-8 size-2 rounded-full border border-sidebar bg-destructive'
              />
            </TooltipTrigger>
            <TooltipContent side='top'>Offline — reconnect to access online features</TooltipContent>
          </Tooltip>
        )}
      </div>
    </ClientOnly>
  );
}
