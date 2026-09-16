'use client';

import { SettingsItem } from '#components/settings/settings-item.js';

import { useAuth } from '@better-auth-ui/react';
import { cn } from '@taucad/ui/utils/cn';
import { ActiveSessions } from '#components/auth/settings/security/active-sessions.js';
import { ChangePassword } from '#components/auth/settings/security/change-password.js';
import { LinkedAccounts } from '#components/auth/settings/security/linked-accounts.js';

export type SecuritySettingsProps = {
  className?: string;
};

/**
 * Renders the security settings layout including password management, linked accounts, and active sessions.
 *
 * ChangePassword is rendered when password authentication is enabled; LinkedAccounts is rendered when social providers are present.
 * Each registered auth plugin may contribute `securityCards` (for example passkeys, delete-user).
 *
 * @param className - Optional additional CSS class names for the outer container.
 * @returns The security settings container as a JSX element.
 */
export function SecuritySettings({ className }: SecuritySettingsProps): React.JSX.Element {
  const { emailAndPassword, plugins, socialProviders } = useAuth();

  return (
    <div className={cn('flex w-full flex-col gap-4 md:gap-6', className)}>
      {emailAndPassword.enabled && (
        <SettingsItem settingId='password'>
          <ChangePassword />
        </SettingsItem>
      )}
      {(socialProviders?.length ?? 0) > 0 ? (
        <SettingsItem settingId='linked-accounts'>
          <LinkedAccounts />
        </SettingsItem>
      ) : null}
      <SettingsItem settingId='active-sessions'>
        <ActiveSessions />
      </SettingsItem>
      {plugins.flatMap(
        (plugin) => plugin.securityCards?.map((Card, index) => <Card key={`${plugin.id}-${index.toString()}`} />) ?? [],
      )}
    </div>
  );
}
