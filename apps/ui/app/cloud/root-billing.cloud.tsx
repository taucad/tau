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
    const inspectReturn = async (): Promise<void> => {
      try {
        const action = await getPaymentAction(binding, actionId);
        if (!active) {
          return;
        }
        url.searchParams.delete('payment_action');
        globalThis.history.replaceState(globalThis.history.state, '', url);
        switch (action.state) {
          case 'fulfilled': {
            if (action.receipt) {
              toast.success(`${formatCreditAtoms(BigInt(action.receipt.grantedCreditAtoms))} credits added.`);
            }
            break;
          }
          case 'funds_received': {
            toast('Payment received. Credits are still being added.');
            break;
          }
          case 'processing': {
            toast('Payment is still processing.');
            break;
          }
          case 'redirect_required': {
            toast.warning('Checkout is ready to continue.', {
              action: {
                label: 'Resume Checkout',
                onClick: () => {
                  if (active && binding.financialSession.isCurrent()) {
                    followPaymentRedirect(action);
                  }
                },
              },
            });
            break;
          }
          case 'attention_required': {
            if (action.attention?.action === 'continue_hosted') {
              toast.warning('Your payment needs attention.', {
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
            } else {
              toast.warning('Your payment needs attention. Reopen billing to continue.');
            }
            break;
          }
          case 'failed':
          case 'canceled': {
            toast.warning('Payment was not completed.');
            break;
          }
          default: {
            break;
          }
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
