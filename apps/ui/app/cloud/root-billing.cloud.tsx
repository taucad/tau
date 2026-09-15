import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { useSession } from '@better-auth-ui/react';
import { toast } from 'sonner';
import { BillingSessionProvider, useBillingSession } from '@taucad/billing/hooks/billing-session';
import { formatCreditAtoms } from '@taucad/billing';
import { AuthConfigProvider } from '#providers/auth-provider.js';
import { authClient } from '#lib/auth-client.js';
import { ENV } from '#environment.config.js';
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
// settled later by the payments worker, so the returned action can still read `redirect_required`.
// The toast for the state we can see is raised immediately; these bound a background re-check that
// replaces it once the action settles, so a paid Checkout stops offering "Resume Checkout".
const returnSettleAttempts = 10;
const returnSettleIntervalMilliseconds = 2000;
const settlingStates = new Set(['redirect_required', 'processing', 'funds_received']);

export const useCloudPaymentActionReturn = (): void => {
  const { apiBaseUrl, environment, userId } = useBillingSession();
  const financialSession = useFinancialSession();
  useEffect(() => {
    if (apiBaseUrl === undefined || environment === undefined || userId === undefined) {
      return;
    }
    const binding = { apiBaseUrl, environment, ownerId: userId, financialSession: financialSession.capture() };
    let active = true;
    const url = new URL(globalThis.location.href);
    const actionId = url.searchParams.get('payment_action');
    if (actionId === null || !/^[A-Za-z0-9._:-]{1,128}$/u.test(actionId)) {
      return;
    }
    type PaymentAction = Awaited<ReturnType<typeof getPaymentAction>>;
    const announce = (action: PaymentAction): string | number | undefined => {
      switch (action.state) {
        case 'fulfilled': {
          return action.receipt
            ? toast.success(`${formatCreditAtoms(BigInt(action.receipt.grantedCreditAtoms))} credits added.`)
            : undefined;
        }
        case 'funds_received': {
          return toast('Payment received. Credits are still being added.');
        }
        case 'processing': {
          return toast('Payment is still processing.');
        }
        case 'redirect_required': {
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
          return toast.warning('Payment was not completed.');
        }
        default: {
          return undefined;
        }
      }
    };
    const inspectReturn = async (): Promise<void> => {
      try {
        let action = await getPaymentAction(binding, actionId);
        if (!active) {
          return;
        }
        url.searchParams.delete('payment_action');
        globalThis.history.replaceState(globalThis.history.state, '', url);
        let toastId = announce(action);
        for (let attempt = 0; attempt < returnSettleAttempts && settlingStates.has(action.state); attempt++) {
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
          if (settled.state === action.state) {
            continue;
          }
          action = settled;
          if (toastId !== undefined) {
            toast.dismiss(toastId);
          }
          toastId = announce(action);
        }
      } catch {
        if (active) {
          toast.warning('Could not check the returned payment.');
        }
      }
    };
    void inspectReturn();
    return () => {
      active = false;
    };
  }, [apiBaseUrl, environment, financialSession, userId]);
};
