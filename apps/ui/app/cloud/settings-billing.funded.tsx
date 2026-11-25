import { useState } from 'react';
import { BillingSettings } from '@taucad/billing-ui/components/settings/billing-settings';
import { AccountClosureSettings } from '@taucad/billing-ui/components/billing/account-closure-settings';
import type { AccountClosureServices } from '@taucad/billing-ui/components/billing/account-closure-settings';
import { TopupModal } from '@taucad/billing-ui/components/billing/topup-modal';
import { useBillingBinding } from '@taucad/billing-ui/components/billing/use-billing-binding';
import { SettingsGroup } from '@taucad/settings-ui/components/settings/settings-item';
import { EmailDeliverabilityBanner } from '#components/auth/settings/account/email-deliverability-banner.js';
import { authClient } from '#lib/auth-client.js';

/** Account closure's last step deletes the signed-in user through the app's Better Auth client. */
const accountClosureServices: AccountClosureServices = {
  deleteUser: async (options) => authClient.deleteUser(options),
};

export function CloudBillingSettings(): React.JSX.Element {
  return <BillingSettings accountNotice={<EmailDeliverabilityBanner />} />;
}

/** Account closure for a signed-in owner; it waits on payments the Add credits dialog can finish. */
export function CloudAccountClosure(): React.JSX.Element | undefined {
  const binding = useBillingBinding();
  const [isTopupOpen, setIsTopupOpen] = useState(false);
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
