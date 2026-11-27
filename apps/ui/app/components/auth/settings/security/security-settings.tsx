'use client';

import { SettingsGroup, SettingsItem } from '@taucad/settings-ui/components/settings/settings-item';

import { useAuth } from '@better-auth-ui/react';
import { cn } from '@taucad/ui/utils/cn';
import { ActiveSessions } from '#components/auth/settings/security/active-sessions.js';
import { DesktopSignIns } from '#components/auth/settings/security/desktop-sign-ins.js';
import { isDesktopTarget } from '#lib/build-target.js';
import { ChangePassword } from '@taucad/settings-ui/components/auth/settings/security/change-password';
import { LinkedAccounts } from '@taucad/settings-ui/components/auth/settings/security/linked-accounts';
import { GithubPermissions } from '#components/auth/settings/security/github-permissions.js';
import { EmailDeliverabilityBanner } from '#components/auth/settings/account/email-deliverability-banner.js';
import { WebHandOffRow } from '@taucad/settings-ui/components/settings/web-hand-off-row';
import { webSettingsUrl } from '#lib/web-settings.js';

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

  if (isDesktopTarget()) {
    return <DesktopSecuritySettings className={className} />;
  }

  return (
    <div className={cn('flex w-full flex-col gap-6 md:gap-8', className)}>
      <EmailDeliverabilityBanner />
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
      <SettingsItem settingId='desktop-sign-ins'>
        <DesktopSignIns />
      </SettingsItem>
      {plugins.flatMap(
        (plugin) => plugin.securityCards?.map((Card, index) => <Card key={`${plugin.id}-${index.toString()}`} />) ?? [],
      )}
    </div>
  );
}

/**
 * Security in Tau Desktop (desktop sign-in ruling D1=A): the password, sign-in methods, sessions and signed-in
 * desktops change on the website, so each is a row that opens its page there and fetches nothing. Gist access reads the
 * account's linked providers, which the desktop's sign-in may not, so it opens there too; sharing itself stays here.
 *
 * @param props - Optional class name.
 * @returns The desktop's security settings.
 */
function DesktopSecuritySettings({ className }: SecuritySettingsProps): React.JSX.Element {
  return (
    <div className={cn('flex w-full flex-col gap-6 md:gap-8', className)}>
      <SettingsGroup title='Managed on Tau’s website'>
        <WebHandOffRow
          settingId='password'
          title='Password'
          description='Set or change your password on Tau’s website.'
          href={webSettingsUrl('security', 'password')}
        />
        <WebHandOffRow
          settingId='linked-accounts'
          title='Sign-in methods'
          description='Link or unlink GitHub and Google on Tau’s website.'
          href={webSettingsUrl('security', 'linked-accounts')}
        />
        <WebHandOffRow
          settingId='active-sessions'
          title='Active sessions'
          description='See and end your browser sessions on Tau’s website.'
          href={webSettingsUrl('security', 'active-sessions')}
        />
        <WebHandOffRow
          settingId='desktop-sign-ins'
          title='Tau Desktop'
          description='See and sign out the computers signed in to Tau Desktop on Tau’s website.'
          href={webSettingsUrl('security', 'desktop-sign-ins')}
        />
        <WebHandOffRow
          settingId='github-permissions'
          title='GitHub Gist access'
          description='Allow or stop Gist sharing on Tau’s website. Sharing itself works here once it is allowed.'
          href={webSettingsUrl('security', 'github-permissions')}
        />
      </SettingsGroup>
    </div>
  );
}
