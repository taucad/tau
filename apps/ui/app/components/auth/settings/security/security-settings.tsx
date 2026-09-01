'use client';

import { useAuth } from '@better-auth-ui/react';
import { cn } from '#utils/ui.utils.js';
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
export function SecuritySettings({ className }: SecuritySettingsProps) {
  const { emailAndPassword, plugins, socialProviders } = useAuth();

  return (
    <div className={cn('flex w-full flex-col gap-4 md:gap-6', className)}>
      {emailAndPassword?.enabled && <ChangePassword />}
      {(socialProviders?.length ?? 0) > 0 ? <LinkedAccounts /> : null}
      <ActiveSessions />
      {plugins.flatMap(
        (plugin) => plugin.securityCards?.map((Card, index) => <Card key={`${plugin.id}-${index.toString()}`} />) ?? [],
      )}
    </div>
  );
}
