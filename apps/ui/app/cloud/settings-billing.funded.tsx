import { useState } from 'react';
import { BillingSettings } from '@taucad/billing-ui/components/settings/billing-settings';
import { AccountClosureSettings } from '@taucad/billing-ui/components/billing/account-closure-settings';
import type { AccountClosureServices } from '@taucad/billing-ui/components/billing/account-closure-settings';
import { TopupModal } from '@taucad/billing-ui/components/billing/topup-modal';
import { useBillingBinding } from '@taucad/billing-ui/components/billing/use-billing-binding';
import { SettingsGroup } from '@taucad/settings-ui/components/settings/settings-item';
import { EmailDeliverabilityBanner } from '#components/auth/settings/account/email-deliverability-banner.js';
import { authClient } from '#lib/auth-client.js';
import { WebHandOffRow } from '@taucad/settings-ui/components/settings/web-hand-off-row';
import { isDesktopTarget } from '#lib/build-target.js';
import { webSettingsUrl } from '#lib/web-settings.js';

/** Account closure's last step deletes the signed-in user through the app's Better Auth client. */
const accountClosureServices: AccountClosureServices = {
  deleteUser: async (options) => authClient.deleteUser(options),
};

export function CloudBillingSettings(): React.JSX.Element {
  return (
    <BillingSettings
      accountNotice={<EmailDeliverabilityBanner />}
      webBillingUrl={isDesktopTarget() ? webSettingsUrl('billing') : undefined}
    />
  );
}

/** Account closure for a signed-in owner; it waits on payments the Add credits dialog can finish. */
export function CloudAccountClosure(): React.JSX.Element | undefined {
  const binding = useBillingBinding();
  const [isTopupOpen, setIsTopupOpen] = useState(false);
  if (isDesktopTarget()) {
    // Closing the account needs Tau on the web (desktop sign-in ruling D1=A).
    return (
      <SettingsGroup>
        <WebHandOffRow
          settingId='close-account'
          title='Close account'
          description='Close your Tau account on Tau’s website.'
          href={webSettingsUrl('data-controls', 'close-account')}
        />
      </SettingsGroup>
    );
  }
  if (binding === undefined) {
    return undefined;
  }
  return (
    <>
      <SettingsGroup>
        <AccountClosureSettings
          binding={binding}
          services={accountClosureServices}
          onReviewPayment={() => {
            setIsTopupOpen(true);
          }}
        />
      </SettingsGroup>
      <TopupModal isOpen={isTopupOpen} onOpenChange={setIsTopupOpen} />
    </>
  );
}
