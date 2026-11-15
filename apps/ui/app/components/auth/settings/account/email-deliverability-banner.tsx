import { useQuery } from '@tanstack/react-query';
import { BillingNotice, supportEmail } from '#components/billing/billing-primitives.js';
import { ENV } from '#environment.config.js';
import { recordApiRequestId } from '#lib/api-request-id.js';

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
 * (email bounce blueprint R11). Silent while loading, on a failed read and when mail arrives:
 * it is a warning about a rare state, never a reason to block the page.
 */
export function EmailDeliverabilityBanner(): React.JSX.Element | undefined {
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
      We could not deliver email to this address. Sign-in links, password resets and billing notices will not arrive.
      Email{' '}
      <a className='underline' href={`mailto:${supportEmail}`}>
        {supportEmail}
      </a>{' '}
      and we will help.
    </BillingNotice>
  );
}
