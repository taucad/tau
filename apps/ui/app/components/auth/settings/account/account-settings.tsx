import { useAuth } from '@better-auth-ui/react';
import type { ComponentProps } from 'react';

import { cn } from '#utils/ui.utils.js';
import { UserProfile } from '#components/auth/settings/account/user-profile.js';

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

  return (
    <div className={cn('flex w-full flex-col gap-4 md:gap-6', className)} {...props}>
      <UserProfile />
      {plugins.flatMap(
        (plugin) => plugin.accountCards?.map((Card) => <Card key={`${plugin.id}-${Card.name}`} />) ?? [],
      )}
    </div>
  );
}
