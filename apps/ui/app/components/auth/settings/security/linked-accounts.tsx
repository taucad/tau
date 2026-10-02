import { useAuth, useListAccounts } from '@better-auth-ui/react';
import { Card, CardContent } from '#components/ui/card.js';
import { Separator } from '#components/ui/separator.js';
import { Skeleton } from '#components/ui/skeleton.js';
import { cn } from '#utils/ui.utils.js';
import { LinkedAccount } from '#components/auth/settings/security/linked-account.js';

export type LinkedAccountsProps = {
  className?: string;
};

/**
 * Render a card showing linked social accounts and available social providers to link.
 *
 * Linked accounts (excluding the "credential" provider) are shown with an unlink control;
 * available providers are shown with a link control. Button states and labels reflect
 * ongoing link/unlink activity and use localization for provider-specific text.
 *
 * @returns A JSX element containing the linked accounts card
 */
export function LinkedAccounts({ className }: LinkedAccountsProps) {
  const { authClient, localization, socialProviders } = useAuth();

  const { data: accounts, isPending } = useListAccounts(authClient);

  const linkedAccounts = accounts?.filter((account) => account.providerId !== 'credential');
  const linkedProviderIds = new Set(linkedAccounts?.map((account) => account.providerId) ?? []);
  const unlinkedSocialProviders = socialProviders?.filter((provider) => !linkedProviderIds.has(provider)) ?? [];

  const allRows = [
    ...(linkedAccounts?.map((account) => ({
      key: account.id,
      account,
      provider: account.providerId,
    })) ?? []),
    ...unlinkedSocialProviders.map((provider) => ({
      key: provider,
      account: undefined,
      provider,
    })),
  ];

  return (
    <div>
      <h2 className='mb-3 text-sm font-semibold'>{localization.settings.linkedAccounts}</h2>

      <Card className={cn('p-0', className)}>
        <CardContent className='p-0'>
          {isPending
            ? socialProviders?.map((provider, index) => (
                <div key={provider}>
                  {index > 0 && <Separator />}
                  <AccountRowSkeleton />
                </div>
              ))
            : allRows.map((row, index) => (
                <div key={row.key}>
                  {index > 0 && <Separator />}

                  <LinkedAccount account={row.account} provider={row.provider} />
                </div>
              ))}
        </CardContent>
      </Card>
    </div>
  );
}

function AccountRowSkeleton() {
  return (
    <Card className='border-0 bg-transparent shadow-none ring-0'>
      <CardContent className='flex items-center gap-3'>
        <Skeleton className='size-10 rounded-md' />

        <div className='flex flex-col gap-1'>
          <Skeleton className='h-4 w-20' />
          <Skeleton className='h-3 w-32' />
        </div>
      </CardContent>
    </Card>
  );
}
