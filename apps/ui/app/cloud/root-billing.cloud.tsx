import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useSession } from '@better-auth-ui/react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BillingSessionProvider, useBillingSession } from '@taucad/billing/hooks/billing-session';
import { formatCreditAtoms } from '@taucad/billing';
import type { WirePaymentAction } from '@taucad/billing';
import { AuthConfigProvider } from '#providers/auth-provider.js';
import { authClient } from '#lib/auth-client.js';
import { ENV } from '#environment.config.js';
import { useSearchParameter } from '#hooks/use-search-parameter.js';
import { stringParameter } from '#utils/search-parameter.codecs.js';
import { followPaymentRedirect, getPaymentAction, recoverPaymentAction } from '#lib/billing-payment-client.js';
import {
  FinancialSessionProvider,
  FinancialSessionScope,
  useFinancialSession,
} from '#providers/financial-session-provider.js';

export function CloudRootBoundary({ children }: { readonly children: ReactNode }): React.JSX.Element {
  return (
    <FinancialSessionProvider>
      <AuthConfigProvider>
        <BillingSessionBridge>{children}</BillingSessionBridge>
      </AuthConfigProvider>
    </FinancialSessionProvider>
  );
}

const BillingSessionBridge = ({ children }: { readonly children: ReactNode }): React.JSX.Element => {
  const { data: session } = useSession(authClient);
  const identity =
    ENV.TAU_BILLING_ENVIRONMENT === undefined || session?.user.id === undefined
      ? undefined
      : { apiBaseUrl: ENV.TAU_API_URL, environment: ENV.TAU_BILLING_ENVIRONMENT, ownerId: session.user.id };
  return (
    <FinancialSessionScope identity={identity}>
      <BillingSessionProvider
        value={{
          apiBaseUrl: ENV.TAU_API_URL,
          environment: ENV.TAU_BILLING_ENVIRONMENT,
          userId: session?.user.id,
        }}
      >
        {children}
      </BillingSessionProvider>
    </FinancialSessionScope>
  );
};

// Checkout returns to the same URL whether the customer paid or cancelled, and a paid session is only
// settled later by the payments worker, so the returned action can still read `redirect_required`, or
// `attention_required` while billing waits to hear how a card authentication or a retried payment ended.
// The toast for the state we can see is raised immediately; these bound a background re-check that
// replaces it once the action settles, so a paid Checkout stops offering "Resume Checkout". A card setup
// or payment only billing can confirm gets a neutral toast, and a warning only if the re-check runs out.
const returnSettleAttempts = 10;
const returnSettleIntervalMilliseconds = 2000;
const settlingStates = new Set(['redirect_required', 'processing', 'funds_received']);
// Only a purchase Checkout can settle from its own session; a reload-setup Checkout's SetupIntent is qualified
// by the sweep directly, so there is nothing to recover on its return.
const purchaseCheckoutPurposes = new Set(['manual_topup', 'subscription_checkout']);
const paymentActionParameter = stringParameter();
const paymentActionIdPattern = /^[A-Za-z0-9._:-]{1,128}$/u;

/** Whether billing has yet to hear how the payment ended, which settles the action without the customer. */
const isAwaitingOutcome = (action: WirePaymentAction): boolean =>
  action.state === 'attention_required' &&
  action.attention?.reason === 'provider_outcome_unknown' &&
  action.attention.action === 'wait';

/** Whether the action may still settle on its own, so the return keeps re-reading it for a while. */
const isSettling = (action: WirePaymentAction): boolean =>
  settlingStates.has(action.state) || isAwaitingOutcome(action);

export const useCloudPaymentActionReturn = (): void => {
  const { apiBaseUrl, environment, userId } = useBillingSession();
  const financialSession = useFinancialSession();
  const queryClient = useQueryClient();
  const [returnedActionId, clearReturnedAction] = useSearchParameter('payment_action', paymentActionParameter);
  /* Latched at mount, because clearing the parameter re-renders: the bounded
   * re-check below outlives the URL it arrived on, and reading the live value
   * would tear it down the moment it removes itself. Checkout returns on a
   * fresh load, so the mount value is the returned action. */
  const [actionId] = useState(returnedActionId);
  const inspected = useRef(false);
  /* Held in a ref rather than a dependency: React Router hands out a new
   * `setSearchParams` identity on every URL change, so depending on the writer
   * would tear this effect down the instant it deletes its own parameter. */
  const clearReturnedActionRef = useRef(clearReturnedAction);
  useEffect(() => {
    clearReturnedActionRef.current = clearReturnedAction;
  }, [clearReturnedAction]);
  useEffect(() => {
    if (apiBaseUrl === undefined || environment === undefined || userId === undefined) {
      return;
    }
    if (inspected.current || !paymentActionIdPattern.test(actionId)) {
      return;
    }
    inspected.current = true;
    const binding = { apiBaseUrl, environment, ownerId: userId, financialSession: financialSession.capture() };
    let active = true;
    const announce = (action: WirePaymentAction): string | number | undefined => {
      if (action.state === 'fulfilled' || action.state === 'completed') {
        // Balance, plan and saved card all changed; cached entitlements would otherwise stay Free for minutes.
        void queryClient.invalidateQueries({ queryKey: ['billing'] });
      }
      switch (action.state) {
        case 'fulfilled': {
          if (!action.receipt) {
            return undefined;
          }
          const added = `${formatCreditAtoms(BigInt(action.receipt.grantedCreditAtoms))} credits added.`;
          // A paid Pro subscription settles here with its first credits; billing never reports it as completed.
          return toast.success(action.purpose === 'subscription_checkout' ? `Tau Pro is active. ${added}` : added);
        }
        case 'completed': {
          // Only a card setup completes; every purchase settles as fulfilled, with its receipt.
          return action.purpose === 'reload_setup' ? toast.success('Automatic reload is on.') : undefined;
        }
        case 'funds_received': {
          return toast('Payment received. Credits are still being added.');
        }
        case 'processing': {
          return toast('Payment is still processing.');
        }
        case 'redirect_required': {
          if (action.purpose === 'reload_setup') {
            // A finished card setup reads redirect_required until the billing worker confirms it, so the
            // re-check below offers to continue only if it is still open when that runs out.
            return toast('Confirming your card for automatic reload.');
          }
          // eslint-disable-next-line tau-lint/no-engineering-vocabulary-in-copy -- Stripe Checkout is the payment product's own name, not a revision checkout.
          return toast.warning('Checkout is ready to continue.', {
            action: {
              label: 'Resume Checkout',
              onClick: () => {
                if (active && binding.financialSession.isCurrent()) {
                  followPaymentRedirect(action);
                }
              },
            },
          });
        }
        case 'attention_required': {
          if (isAwaitingOutcome(action)) {
            // Billing has yet to hear how the payment ended; the re-check below warns only if it never does.
            return toast('Payment is still processing.');
          }
          if (action.attention?.action !== 'continue_hosted') {
            return toast.warning('Your payment needs attention. Reopen billing to continue.');
          }
          return toast.warning('Your payment needs attention.', {
            action: {
              label: 'Continue in Checkout',
              onClick: async () => {
                if (!active || !binding.financialSession.isCurrent()) {
                  return;
                }
                const recovered = await recoverPaymentAction(
                  { ...binding, subjectId: action.subjectId },
                  action.actionId,
                );
                // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- cleanup may run during the await above.
                if (active && binding.financialSession.isCurrent()) {
                  followPaymentRedirect(recovered);
                }
              },
            },
          });
        }
        case 'failed':
        case 'canceled': {
          // A card setup moves no money, so it is left or refused rather than unpaid.
          return toast.warning(
            action.purpose === 'reload_setup'
              ? 'Card setup for automatic reload was not completed.'
              : 'Payment was not completed.',
          );
        }
        default: {
          return undefined;
        }
      }
    };
    /** Replaces the neutral toast of a card setup or payment the re-check never saw confirmed with a warning. */
    const warnUnsettled = (action: WirePaymentAction, neutralToast: string | number | undefined): void => {
      const isSetupOpen = action.purpose === 'reload_setup' && action.state === 'redirect_required';
      if (!isSetupOpen && !isAwaitingOutcome(action)) {
        return;
      }
      if (neutralToast !== undefined) {
        toast.dismiss(neutralToast);
      }
      if (isSetupOpen) {
        // The customer left the card setup before finishing it, or billing has yet to confirm it.
        toast.warning('Automatic reload is waiting for card setup.', {
          action: {
            label: 'Continue setup',
            onClick: () => {
              if (active && binding.financialSession.isCurrent()) {
                followPaymentRedirect(action);
              }
            },
          },
        });
      } else {
        toast.warning('Your payment needs attention. Reopen billing to continue.');
      }
    };
    const inspectReturn = async (): Promise<void> => {
      try {
        let action = await getPaymentAction(binding, actionId);
        if (
          active &&
          action.state === 'redirect_required' &&
          purchaseCheckoutPurposes.has(action.purpose) &&
          binding.financialSession.isCurrent()
        ) {
          // A paid Checkout whose webhook has not arrived settles from Stripe's own session on recovery;
          // an open one comes back unchanged, still offering Resume Checkout. The read above stays ungated: a
          // session that changed owner mid-flight still announces what it fetched, it just recovers nothing.
          try {
            action = await recoverPaymentAction({ ...binding, subjectId: action.subjectId }, actionId);
          } catch {
            // The fetched action stands; the bounded re-check below keeps following it.
          }
        }
        if (!active) {
          return;
        }
        clearReturnedActionRef.current('');
        let toastId = announce(action);
        for (let attempt = 0; attempt < returnSettleAttempts && isSettling(action); attempt++) {
          // oxlint-disable-next-line no-await-in-loop -- sequential bounded polling of one action
          await new Promise((resolve) => {
            setTimeout(resolve, returnSettleIntervalMilliseconds);
          });
          // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- cleanup may run during the await above.
          if (!active) {
            return;
          }
          // oxlint-disable-next-line no-await-in-loop -- sequential bounded polling of one action
          const settled = await getPaymentAction(binding, actionId);
          // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- cleanup may run during the await above.
          if (!active) {
            return;
          }
          if (settled.state === action.state && settled.attention?.action === action.attention?.action) {
            continue;
          }
          action = settled;
          if (toastId !== undefined) {
            toast.dismiss(toastId);
          }
          toastId = announce(action);
        }
        // The re-check is over: a card setup or payment it never saw confirmed now needs the customer.
        warnUnsettled(action, toastId);
      } catch {
        if (active) {
          // A failed check must not leave the parameter to re-run on every reload.
          clearReturnedActionRef.current('');
          toast.warning('Could not check the returned payment.');
        }
      }
    };
    void inspectReturn();
    return () => {
      active = false;
    };
  }, [actionId, apiBaseUrl, environment, financialSession, queryClient, userId]);
};
