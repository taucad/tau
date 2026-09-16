import { BookOpen, Bug, CircleHelp, Files, FileText, Settings, Shield, WifiOff } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@taucad/ui/components/dropdown-menu';
import { ClientOnly } from '#components/ui/utils/client-only.js';
import { useSettingsDialog } from '#hooks/use-settings-dialog.js';
import { UserButton } from '#components/auth/user/user-button.js';
import { useNetworkConnectivity } from '#hooks/use-network-connectivity.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { legalUrl, metaConfig } from '#constants/meta.constants.js';
import { SvgIcon } from '#components/icons/svg-icon.js';
import { NavBillingItem } from '#cloud/nav-billing.js';

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
  const { open: openSettings } = useSettingsDialog();
  const helpItems = [
    <DropdownMenuItem key='documentation' asChild>
      <a href='https://docs.tau.new' target='_blank' rel='noopener noreferrer'>
        <BookOpen />
        Documentation
      </a>
    </DropdownMenuItem>,
    <DropdownMenuItem key='privacy' asChild>
      <a href={legalUrl('privacy')} target='_blank' rel='noopener noreferrer'>
        <Shield />
        Privacy
      </a>
    </DropdownMenuItem>,
    <DropdownMenuItem key='terms' asChild>
      <a href={legalUrl('terms')} target='_blank' rel='noopener noreferrer'>
        <FileText />
        Terms
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
              <NavBillingItem key='billing' />,
              { label: 'Files', href: '/files', icon: <Files /> },
              <DropdownMenuItem
                key='settings'
                onSelect={() => {
                  openSettings('general');
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
