'use client';

import { getProviderName } from '@better-auth-ui/core';
import { providerIcons, useAccountInfo, useAuth, useLinkSocial, useUnlinkAccount } from '@better-auth-ui/react';
import type { Account, SocialProvider } from 'better-auth';
import { Link2, Link2Off, Plug } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '#components/ui/button.js';
import { Card, CardContent } from '#components/ui/card.js';
import { Skeleton } from '#components/ui/skeleton.js';
import { Spinner } from '#components/ui/spinner.js';
import { cn } from '#utils/ui.utils.js';

export type LinkedAccountProps = {
  account?: Account;
  provider: SocialProvider;
};

export function LinkedAccount({ account, provider }: LinkedAccountProps): React.JSX.Element {
  const { authClient, baseURL, localization } = useAuth();

  const { data: accountInfo, isPending: isLoadingInfo } = useAccountInfo(authClient, {
    query: { accountId: account?.accountId },
  });

  const { mutate: linkSocial, isPending: isLinking } = useLinkSocial(authClient);

  const { mutate: unlinkAccount, isPending: isUnlinking } = useUnlinkAccount(authClient, {
    onSuccess: () => toast.success(localization.settings.accountUnlinked),
  });

  const ProviderIcon = providerIcons[provider];
  const providerName = getProviderName(provider);

  const displayName = accountInfo ? (accountInfo.user.email ?? accountInfo.user.name) : account?.accountId;

  return (
    <Card className='border-0 bg-transparent shadow-none ring-0'>
      <CardContent className='flex items-center justify-between gap-3'>
        <div className='flex size-10 shrink-0 items-center justify-center rounded-md bg-muted'>
          {ProviderIcon ? (
            <ProviderIcon className={cn('size-4.5', !account && 'opacity-50')} />
          ) : (
            <Plug className={cn('size-4.5', !account && 'opacity-50')} />
          )}
        </div>

        <div className='flex min-w-0 flex-col'>
          <span className='text-sm leading-tight font-medium'>{providerName}</span>

          {account && isLoadingInfo ? (
            <Skeleton className='my-0.5 h-3 w-24' />
          ) : (
            <span className='truncate text-xs text-muted-foreground'>
              {account ? displayName : localization.settings.linkProvider.replace('{{provider}}', providerName)}
            </span>
          )}
        </div>

        {account ? (
          <Button
            className='ml-auto shrink-0'
            variant='outline'
            size='sm'
            onClick={() => {
              unlinkAccount({ providerId: account.providerId });
            }}
            disabled={isUnlinking}
            aria-label={localization.settings.unlinkProvider.replace('{{provider}}', providerName)}
          >
            {isUnlinking ? <Spinner /> : <Link2Off />}
            {localization.settings.unlinkProvider.replace('{{provider}}', '').trim()}
          </Button>
        ) : (
          <Button
            className='ml-auto shrink-0'
            variant='outline'
            size='sm'
            onClick={() => {
              linkSocial({
                provider,
                callbackURL: `${baseURL}${globalThis.location.pathname}`,
              });
            }}
            disabled={isLinking}
            aria-label={localization.settings.linkProvider.replace('{{provider}}', providerName)}
          >
            {isLinking ? <Spinner /> : <Link2 />}
            {localization.settings.link}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
