import { useState } from 'react';
import { BillingSettings } from '#components/settings/billing-settings.js';
import { AccountClosureSettings } from '#components/billing/account-closure-settings.js';
import { TopupModal } from '#components/billing/topup-modal.js';
import { useBillingBinding } from '#components/billing/use-billing-binding.js';
import { SettingsGroup } from '#components/settings/settings-item.js';

export function CloudBillingSettings(): React.JSX.Element {
  return <BillingSettings />;
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
          onReviewPayment={() => {
            setIsTopupOpen(true);
          }}
        />
      </SettingsGroup>
      <TopupModal isOpen={isTopupOpen} onOpenChange={setIsTopupOpen} />
    </>
  );
}
