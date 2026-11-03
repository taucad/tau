'use client';

import { SettingsGroup, SettingsItem } from '#components/settings/settings-item.js';

import { useAuth } from '@better-auth-ui/react';
import { cn } from '@taucad/ui/utils/cn';
import { ActiveSessions } from '#components/auth/settings/security/active-sessions.js';
import { ChangePassword } from '#components/auth/settings/security/change-password.js';
import { LinkedAccounts } from '#components/auth/settings/security/linked-accounts.js';
import { GithubPermissions } from '#components/auth/settings/security/github-permissions.js';

export type SecuritySettingsProps = {
  className?: string;
};

/**
 * Renders the security settings: password, sign-in methods (social providers, GitHub and its Gist access) and active sessions.
 *
 * ChangePassword is rendered when password authentication is enabled; LinkedAccounts adds a row per non-GitHub social provider.
 * GitHub repository access is a separate connection and lives under Repositories.
 * Each registered auth plugin may contribute `securityCards` (for example passkeys, delete-user).
 *
 * @param className - Optional additional CSS class names for the outer container.
 * @returns The security settings container as a JSX element.
 */
export function SecuritySettings({ className }: SecuritySettingsProps): React.JSX.Element {
  const { emailAndPassword, plugins, socialProviders } = useAuth();

  return (
    <div className={cn('flex w-full flex-col gap-6 md:gap-8', className)}>
      {emailAndPassword.enabled && (
        <SettingsItem settingId='password'>
          <ChangePassword />
        </SettingsItem>
      )}
      <SettingsItem settingId='linked-accounts'>
        <SettingsGroup title='Sign-in methods'>
          {(socialProviders?.length ?? 0) > 0 ? <LinkedAccounts /> : null}
          <GithubPermissions />
        </SettingsGroup>
      </SettingsItem>
      <SettingsItem settingId='active-sessions'>
        <ActiveSessions />
      </SettingsItem>
      {plugins.flatMap(
        (plugin) => plugin.securityCards?.map((Card, index) => <Card key={`${plugin.id}-${index.toString()}`} />) ?? [],
      )}
    </div>
  );
}
