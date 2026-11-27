import { useAuth } from '@better-auth-ui/react';
import type { ComponentProps } from 'react';

import { cn } from '@taucad/ui/utils/cn';
import { UserProfile } from '#components/auth/settings/account/user-profile.js';
import { EmailDeliverabilityBanner } from '#components/auth/settings/account/email-deliverability-banner.js';
import { SettingsGroup } from '@taucad/settings-ui/components/settings/settings-item';
import { WebHandOffRow } from '@taucad/settings-ui/components/settings/web-hand-off-row';
import { isDesktopTarget } from '#lib/build-target.js';
import { webSettingsUrl } from '#lib/web-settings.js';

export type AccountSettingsProps = {
  className?: string;
};

/**
 * Renders the account settings layout.
 *
 * Note: ChangeEmail is intentionally excluded — email changes are disabled in
 * this deployment (users authenticate via GitHub, Google, or magic-link).
 * Plugin-contributed account cards are rendered via the plugins array.
 */
export function AccountSettings({
  className,
  ...props
}: AccountSettingsProps & ComponentProps<'div'>): React.JSX.Element {
  const { plugins } = useAuth();

  if (isDesktopTarget()) {
    // Tau Desktop's sign-in may not change the profile (desktop sign-in rulings D1=A, P3): it opens on the website.
    return (
      <div className={cn('flex w-full flex-col gap-4 md:gap-6', className)} {...props}>
        <SettingsGroup>
          <WebHandOffRow
            title='Profile'
            description='Change your name and picture on Tau’s website.'
            href={webSettingsUrl('account', 'profile')}
          />
        </SettingsGroup>
      </div>
    );
  }

  return (
    <div className={cn('flex w-full flex-col gap-4 md:gap-6', className)} {...props}>
      <EmailDeliverabilityBanner />
      <UserProfile />
      {plugins.flatMap(
        (plugin) => plugin.accountCards?.map((Card) => <Card key={`${plugin.id}-${Card.name}`} />) ?? [],
      )}
    </div>
  );
}
