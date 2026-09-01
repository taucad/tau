import { CreditCard, Settings, Sparkles } from 'lucide-react';
import { DropdownMenuItem } from '#components/ui/dropdown-menu.js';
import { ClientOnly } from '#components/ui/utils/client-only.js';
import { openSettingsDialog } from '#hooks/use-settings-dialog.js';
import { UserButton } from '#components/auth/user/user-button.js';
import { ProBadge } from '#components/tier-badge.js';

/**
 * Nav user button: delegates avatar, sign-in/up/out chrome to the registry
 * `<UserButton>`, and extends the dropdown with Tau-specific items (Billing,
 * Settings dialog) via the `links` prop.
 *
 * `hideSettings` suppresses the built-in navigation link so we can open the
 * dialog instead (Tau's settings live in a modal, not a dedicated route).
 */
export function NavUser(): React.JSX.Element {
  return (
    <ClientOnly>
      <UserButton
        size='icon'
        variant='ghost'
        className='select-none'
        align='end'
        sideOffset={8}
        hideSettings
        links={[
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
          </DropdownMenuItem>,
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
        ]}
      />
    </ClientOnly>
  );
}
