import { getProviderId } from '@better-auth-ui/core';
import { useAuth, useListAccounts } from '@better-auth-ui/react';
import { Skeleton } from '@taucad/ui/components/skeleton';
import { LinkedAccount } from '#components/auth/settings/security/linked-account.js';

/**
 * Render one row per social sign-in provider other than GitHub, for a `SettingsGroup`.
 *
 * Linked accounts (excluding the "credential" provider) are shown with an unlink control;
 * available providers are shown with a link control. GitHub has its own rows beside its Gist access.
 *
 * @returns The provider rows, or skeleton rows while accounts load.
 */
export function LinkedAccounts(): React.ReactNode {
  const { authClient, socialProviders } = useAuth();

  const { data: accounts, isPending } = useListAccounts(authClient);

  const linkedAccounts = accounts?.filter(
    (account) => account.providerId !== 'credential' && account.providerId !== 'github',
  );
  const linkedProviderIds = new Set(linkedAccounts?.map((account) => account.providerId) ?? []);
  const unlinkedSocialProviders =
    socialProviders?.filter(
      (provider) => getProviderId(provider) !== 'github' && !linkedProviderIds.has(getProviderId(provider)),
    ) ?? [];

  const allRows = [
    ...(linkedAccounts?.map((account) => ({
      key: account.id,
      account,
      provider: account.providerId,
    })) ?? []),
    ...unlinkedSocialProviders.map((provider) => ({
      key: getProviderId(provider),
      account: undefined,
      provider: getProviderId(provider),
    })),
  ];

  if (isPending) {
    return socialProviders
      ?.filter((provider) => getProviderId(provider) !== 'github')
      .map((provider) => <AccountRowSkeleton key={getProviderId(provider)} />);
  }
  return allRows.map((row) => <LinkedAccount key={row.key} account={row.account} provider={row.provider} />);
}

function AccountRowSkeleton(): React.JSX.Element {
  return (
    <div className='flex items-center justify-between gap-4 py-3.5'>
      <div className='flex flex-col gap-1.5'>
        <Skeleton className='h-4 w-20' />
        <Skeleton className='h-3 w-32' />
      </div>
      <Skeleton className='h-8 w-20 rounded-md' />
    </div>
  );
}
