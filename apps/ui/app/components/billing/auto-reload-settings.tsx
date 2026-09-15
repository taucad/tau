import { useEffect, useState } from 'react';
// eslint-disable-next-line @nx/enforce-module-boundaries -- this first-party settings component owns the direct billing wire
import { formatCreditAtoms } from '@taucad/billing';
import type { WireAutoReloadConsent, WirePaymentAction } from '@taucad/billing';
import { Button } from '@taucad/ui/components/button';
import { CardContent, CardHeader, CardTitle } from '@taucad/ui/components/card';
import { SettingsSectionCard } from '#components/settings/settings-item.js';
import {
  confirmPaymentAction,
  createPaymentRequestId,
  followPaymentRedirect,
  recoverPaymentAction,
} from '#lib/billing-payment-client.js';
import type { PaymentActionBinding } from '#lib/billing-payment-client.js';
import { getReloadConsent, prepareReloadConsent, revokeReloadConsent } from '#lib/billing-lifecycle-client.js';
import { useFinancialSession } from '#providers/financial-session-provider.js';

/* oxlint-disable no-void, unicorn/no-negated-condition -- event handlers deliberately fire tracked UI operations */

const money = (minor: string): string => `US$${(Number(minor) / 100).toFixed(2)}`;

/** Explicit quote, acceptance, setup, and revocation controls for automatic credit reload. */
export function AutoReloadSettings({
  binding,
}: {
  readonly binding: PaymentActionBinding | undefined;
}): React.JSX.Element {
  const financial = useFinancialSession();
  const [consent, setConsent] = useState<WireAutoReloadConsent>();
  const [action, setAction] = useState<WirePaymentAction>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!binding) {
      return;
    }
    const currentBinding = {
      apiBaseUrl: binding.apiBaseUrl,
      environment: binding.environment,
      ownerId: binding.ownerId,
      subjectId: binding.subjectId,
    };
    const token = financial.capture();
    // async-iife: bootstrap
    void (async () => {
      try {
        const value = await getReloadConsent({ ...currentBinding, financialSession: token });
        if (token.isCurrent()) {
          setConsent(value);
          setAction(value?.setupAction ?? undefined);
        }
      } catch {
        if (token.isCurrent()) {
          setError('Automatic reload is unavailable. Try again.');
        }
      }
    })();
  }, [binding?.apiBaseUrl, binding?.environment, binding?.ownerId, binding?.subjectId, financial]);

  const refresh = async (): Promise<void> => {
    if (!binding) {
      return;
    }
    const token = financial.capture();
    const next = await getReloadConsent({ ...binding, financialSession: token });
    if (token.isCurrent()) {
      setConsent(next);
      setAction(next?.setupAction ?? undefined);
    }
  };
  const run = async (operation: () => Promise<void>): Promise<void> => {
    const guard = financial.capture();
    setBusy(true);
    setError(undefined);
    try {
      await operation();
    } catch {
      if (guard.isCurrent()) {
        setError('Could not update automatic reload. Try again.');
      }
    } finally {
      if (guard.isCurrent()) {
        setBusy(false);
      }
    }
  };

  return (
    <SettingsSectionCard>
      <CardHeader>
        <CardTitle className='text-base'>Automatic reload</CardTitle>
      </CardHeader>
      <CardContent className='flex flex-col gap-3 text-sm'>
        {consent ? (
          <dl className='grid grid-cols-2 gap-1 text-muted-foreground'>
            <dt>Reload amount</dt>
            <dd>{money(consent.terms.principalMinor)}</dd>
            <dt>Quoted tax</dt>
            <dd>{money(consent.terms.quotedTaxMinor)}</dd>
            <dt>Maximum charge</dt>
            <dd>{money(consent.terms.grossCeilingMinor)}</dd>
            <dt>Monthly maximum</dt>
            <dd>{money(consent.terms.monthlyGrossCapMinor)}</dd>
            <dt>Reload threshold</dt>
            <dd>{formatCreditAtoms(BigInt(consent.terms.thresholdAtoms))} credits</dd>
            <dt>Minimum time between reloads</dt>
            <dd>{Math.round(consent.terms.minimumCadenceSeconds / 3600)} hours</dd>
            <dt>Failure limit</dt>
            <dd>{consent.terms.terminalFailureLimit}</dd>
            <dt>Status</dt>
            <dd>{consent.state.replaceAll('_', ' ')}</dd>
            {consent.paymentMethod ? (
              <>
                <dt>Card</dt>
                <dd>
                  {consent.paymentMethod.brand} •••• {consent.paymentMethod.last4}
                </dd>
              </>
            ) : undefined}
          </dl>
        ) : (
          <p className='text-muted-foreground'>Automatic reload is off.</p>
        )}
        {action?.state === 'prepared' ? (
          <Button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const token = financial.capture();
                const next = await confirmPaymentAction(
                  { ...binding!, subjectId: action.subjectId, financialSession: token },
                  action.actionId,
                );
                if (token.isCurrent()) {
                  setAction(next);
                  followPaymentRedirect(next);
                  if (next.state !== 'redirect_required') {
                    await refresh();
                  }
                }
              })
            }
          >
            Accept these limits
          </Button>
        ) : undefined}
        {action?.state === 'redirect_required' ? (
          <Button onClick={() => followPaymentRedirect(action)}>Continue setup</Button>
        ) : undefined}
        {action?.state === 'attention_required' && action.attention?.action === 'continue_hosted' ? (
          <Button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const token = financial.capture();
                const next = await recoverPaymentAction(
                  { ...binding!, subjectId: action.subjectId, financialSession: token },
                  action.actionId,
                );
                if (token.isCurrent()) {
                  setAction(next);
                }
              })
            }
          >
            Continue setup
          </Button>
        ) : undefined}
        {!consent || consent.state === 'revoked' ? (
          <Button
            disabled={busy || !binding}
            onClick={() =>
              void run(async () => {
                const token = financial.capture();
                const next = await prepareReloadConsent(
                  { ...binding!, financialSession: token },
                  {
                    requestId: createPaymentRequestId(),
                    returnPath: `${location.pathname}${location.search}`,
                  },
                );
                if (token.isCurrent()) {
                  setAction(next);
                  await refresh();
                }
              })
            }
          >
            Review automatic reload
          </Button>
        ) : undefined}
        {consent && consent.state !== 'revoked' ? (
          <Button
            variant='outline'
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const token = financial.capture();
                const next = await revokeReloadConsent(
                  { ...binding!, subjectId: consent.subjectId, financialSession: token },
                  consent.consentId,
                );
                if (token.isCurrent()) {
                  setConsent(next);
                  setAction(undefined);
                }
              })
            }
          >
            Turn off automatic reload
          </Button>
        ) : undefined}
        {error ? <p className='text-warning'>{error}</p> : undefined}
      </CardContent>
    </SettingsSectionCard>
  );
}
/* oxlint-enable no-void, unicorn/no-negated-condition */
