import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useSession } from '@better-auth-ui/react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BillingSessionProvider, useBillingSession } from '@taucad/billing/hooks/billing-session';
import { formatCredits } from '@taucad/ui-core/utils/credits.utils';
import type { WirePaymentAction } from '@taucad/billing';
import { AuthConfigProvider } from '#providers/auth-provider.js';
import { authClient } from '#lib/auth-client.js';
import { isDesktopTarget } from '#lib/build-target.js';
import { ENV } from '#environment.config.js';
import { useSearchParameter } from '#hooks/use-search-parameter.js';
import { stringParameter } from '@taucad/ui-core/utils/search-parameter.codecs';
import {
  cancelPaymentAction,
  followPaymentRedirect,
  getPaymentAction,
  recoverPaymentAction,
} from '#lib/billing-payment-client.js';
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
  // Desktop SPA prerender runs before preload supplies the runtime API configuration.
  // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- globalThis.window is absent during desktop SPA prerender.
  const apiBaseUrl = isDesktopTarget() && globalThis.window === undefined ? undefined : ENV.TAU_API_URL;
  const identity =
    apiBaseUrl === undefined || ENV.TAU_BILLING_ENVIRONMENT === undefined || session?.user.id === undefined
      ? undefined
      : { apiBaseUrl, environment: ENV.TAU_BILLING_ENVIRONMENT, ownerId: session.user.id };
  return (
    <FinancialSessionScope identity={identity}>
      <BillingSessionProvider
        value={{
          apiBaseUrl,
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
// A purchase Checkout settles from its own session on recovery; a card-setup Checkout's recovery reads the session
// to tell a finished setup (still being confirmed) from one the customer left.
const recoverablePurposes = new Set(['manual_topup', 'subscription_checkout', 'reload_setup']);
const paymentActionParameter = stringParameter();
const billingReturnParameter = stringParameter();
// Stripe tells billing about a portal change by webhook, so the plan is re-read a few times after the return.
const portalRefreshDelaysMilliseconds = [2000, 5000, 10_000, 20_000];
const billingUpdatedMessage = 'Billing updated.';
const paymentActionIdPattern = /^[A-Za-z0-9._:-]{1,128}$/u;

/** Whether billing has yet to hear how the payment ended, which settles the action without the customer. */
const isAwaitingOutcome = (action: WirePaymentAction): boolean =>
  action.state === 'attention_required' &&
  action.attention?.reason === 'provider_outcome_unknown' &&
  action.attention.action === 'wait';

/** Whether the action may still settle on its own, so the return keeps re-reading it for a while. */
const isSettling = (action: WirePaymentAction): boolean =>
  action.purpose !== 'billing_portal' &&
  // An open card setup was left by the customer; only they can finish it.
  !(action.purpose === 'reload_setup' && action.state === 'redirect_required') &&
  (settlingStates.has(action.state) || isAwaitingOutcome(action));

/** Whether a read failed because the action is not this account's, as after signing in as someone else. */
const isNotFound = (error: unknown): boolean => error instanceof Error && error.message.endsWith(' 404');

/**
 * A portal visit moves no money, so its return is not a payment to inspect: it says billing was updated and re-reads
 * the plan, credits and saved card while Stripe's webhook catches up.
 */
const useCloudPortalReturn = (): void => {
  const { userId } = useBillingSession();
  const queryClient = useQueryClient();
  const [billingReturn, clearBillingReturn] = useSearchParameter('billing_return', billingReturnParameter);
  const [returned] = useState(billingReturn === 'portal');
  const announced = useRef(false);
  const clearBillingReturnRef = useRef(clearBillingReturn);
  useEffect(() => {
    clearBillingReturnRef.current = clearBillingReturn;
  }, [clearBillingReturn]);
  useEffect(() => {
    if (!returned || userId === undefined || announced.current) {
      return;
    }
    announced.current = true;
    clearBillingReturnRef.current('');
    toast(billingUpdatedMessage);
    void queryClient.invalidateQueries({ queryKey: ['billing'] });
    const timers = portalRefreshDelaysMilliseconds.map((refreshDelayMilliseconds) =>
      setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ['billing'] });
      }, refreshDelayMilliseconds),
    );
    return () => {
      for (const timer of timers) {
        clearTimeout(timer);
      }
    };
  }, [queryClient, returned, userId]);
};

export const useCloudPaymentActionReturn = (): void => {
  useCloudPortalReturn();
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
      // Balance, plan and saved card may all have changed; cached entitlements would otherwise lag for minutes.
      void queryClient.invalidateQueries({ queryKey: ['billing'] });
      if (action.purpose === 'billing_portal') {
        // A portal visit from before portal returns carried their own marker: nothing to continue or resume.
        return toast(billingUpdatedMessage);
      }
      switch (action.state) {
        case 'fulfilled': {
          if (!action.receipt) {
            return undefined;
          }
          const added = `${formatCredits(BigInt(action.receipt.grantedCreditAtoms))} added to your ${action.purpose === 'subscription_checkout' ? 'monthly' : 'purchased'} credits.`;
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
          // A finished card setup reads processing until billing confirms the card.
          return toast(
            action.purpose === 'reload_setup'
              ? 'Confirming your card for automatic reload.'
              : 'Payment is still processing.',
          );
        }
        case 'redirect_required': {
          if (action.purpose === 'reload_setup') {
            // Recovery read the Session as still open: the customer left the card setup before finishing it.
            return toast.warning('Card setup for automatic reload was not finished.', {
              action: {
                label: 'Continue setup',
                onClick: () => {
                  if (active && binding.financialSession.isCurrent()) {
                    followPaymentRedirect(action);
                  }
                },
              },
            });
          }
          // The customer came back without paying, which is their choice: offer both ways on, not a warning.
          // eslint-disable-next-line tau-lint/no-engineering-vocabulary-in-copy -- Stripe Checkout is the payment product's own name, not a revision checkout.
          return toast('Checkout was not finished.', {
            action: {
              label: 'Resume Checkout',
              onClick: () => {
                if (active && binding.financialSession.isCurrent()) {
                  followPaymentRedirect(action);
                }
              },
            },
            cancel: {
              label: 'Cancel payment',
              onClick: async () => {
                if (!active || !binding.financialSession.isCurrent()) {
                  return;
                }
                try {
                  await cancelPaymentAction({ ...binding, subjectId: action.subjectId }, action.actionId);
                  toast('Payment canceled.');
                } catch {
                  toast.warning('Could not cancel the payment. Open Add credits to try again.');
                }
                void queryClient.invalidateQueries({ queryKey: ['billing'] });
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
      const isSetupConfirming = action.purpose === 'reload_setup' && action.state === 'processing';
      if (!isSetupConfirming && !isAwaitingOutcome(action)) {
        return;
      }
      if (neutralToast !== undefined) {
        toast.dismiss(neutralToast);
      }
      if (isSetupConfirming) {
        // The card setup finished in Checkout; billing has yet to confirm the card, and needs nothing from the customer.
        toast.warning('Automatic reload is still confirming your card. Check back in a few minutes.');
      } else {
        // Billing is still waiting on Stripe; nothing here needs the customer, so the toast says so.
        toast.warning('Billing has not confirmed your payment yet. Check back in a few minutes.');
      }
    };
    const inspectReturn = async (): Promise<void> => {
      try {
        let action = await getPaymentAction(binding, actionId);
        if (
          active &&
          action.state === 'redirect_required' &&
          recoverablePurposes.has(action.purpose) &&
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
          // A card setup is re-read through recovery, which reads its Session: a plain read cannot tell a finished
          // setup awaiting confirmation from one the customer left.
          const settled =
            action.purpose === 'reload_setup'
              ? // oxlint-disable-next-line no-await-in-loop -- sequential bounded polling of one action
                await recoverPaymentAction({ ...binding, subjectId: action.subjectId }, actionId)
              : // oxlint-disable-next-line no-await-in-loop -- sequential bounded polling of one action
                await getPaymentAction(binding, actionId);
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
      } catch (error) {
        if (active) {
          // A failed check must not leave the parameter to re-run on every reload.
          clearReturnedActionRef.current('');
          toast.warning(
            isNotFound(error)
              ? 'This payment belongs to a different account. Sign in to that account to see it.'
              : 'Could not check the returned payment.',
          );
        }
      }
    };
    void inspectReturn();
    return () => {
      active = false;
    };
  }, [actionId, apiBaseUrl, environment, financialSession, queryClient, userId]);
};
