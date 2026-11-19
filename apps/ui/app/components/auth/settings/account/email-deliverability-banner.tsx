import { useAuth, useSession } from '@better-auth-ui/react';
import { useQuery } from '@tanstack/react-query';
import { BillingNotice, supportEmail } from '@taucad/billing-ui/components/billing/billing-primitives';
import { ENV } from '#environment.config.js';
import { recordApiRequestId } from '@taucad/ui-core/lib/api-request-id';

type EmailDeliverability = {
  readonly deliverable: boolean;
};

export const emailDeliverabilityQueryKey = ['email-deliverability'] as const;

const getEmailDeliverability = async (): Promise<EmailDeliverability> => {
  const response = await fetch(`${ENV.TAU_API_URL}/v1/email/deliverability`, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw recordApiRequestId(new Error(`Failed to fetch email deliverability: ${response.status}`), response);
  }
  return (await response.json()) as EmailDeliverability;
};

/**
 * Tells a signed-in user that Tau's email to their account address bounced or was refused
 * (email bounce blueprint R11), naming the address so they can tell whether it is mistyped.
 * Shown on the Account, Security and Billing settings, the pages a person opens when sign-in
 * links, resets or billing notices stop arriving. Silent while loading, on a failed read and
 * when mail arrives: it is a warning about a rare state, never a reason to block the page.
 */
export function EmailDeliverabilityBanner(): React.JSX.Element | undefined {
  const { authClient } = useAuth();
  const { data: session } = useSession(authClient);
  const { data } = useQuery({
    queryKey: emailDeliverabilityQueryKey,
    queryFn: getEmailDeliverability,
    retry: false,
    staleTime: 5 * 60_000,
  });
  if (data?.deliverable !== false) {
    return undefined;
  }
  return (
    <BillingNotice tone='warning' role='alert'>
      We could not deliver email to{' '}
      {session?.user.email ? <span className='font-medium break-all'>{session.user.email}</span> : 'this address'}.
      Sign-in links, password resets and billing notices will not arrive. Email{' '}
      <a className='underline' href={`mailto:${supportEmail}`}>
        {supportEmail}
      </a>{' '}
      and we will help.
    </BillingNotice>
  );
}
