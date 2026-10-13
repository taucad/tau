'use client';

import { getProviderName } from '@better-auth-ui/core';
import { providerIcons, useAccountInfo, useAuth, useLinkSocial, useUnlinkAccount } from '@better-auth-ui/react';
import type { Account, SocialProvider } from 'better-auth';
import { Link2, Link2Off, Plug } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@taucad/ui/components/alert-dialog';
import { Button } from '@taucad/ui/components/button';
import { Card, CardContent } from '@taucad/ui/components/card';
import { Skeleton } from '@taucad/ui/components/skeleton';
import { Spinner } from '#components/ui/spinner.js';
import { cn } from '@taucad/ui/utils/cn';

export type LinkedAccountProps = {
  account?: Account;
  provider: SocialProvider;
};

/**
 * What unlinking takes away, said before it happens (R7).
 *
 * GitHub is also the account Tau publishes Gists with, so its sentence says so.
 *
 * @param providerName - The provider's display name.
 * @param provider - The provider id.
 * @param accountLabel - The linked account's email or name, once known.
 * @returns The confirmation's description.
 */
const getUnlinkConsequence = (providerName: string, provider: SocialProvider, accountLabel?: string): string => {
  const signIn = `You will no longer be able to sign in to Tau with ${providerName}${accountLabel ? ` (${accountLabel})` : ''}.`;
  return provider === 'github'
    ? `${signIn} Tau also uses this account to publish and manage your GitHub Gists.`
    : signIn;
};

export function LinkedAccount({ account, provider }: LinkedAccountProps): React.JSX.Element {
  const { authClient, baseURL, localization } = useAuth();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const { data: accountInfo, isPending: isLoadingInfo } = useAccountInfo(authClient, {
    query: { accountId: account?.accountId },
  });

  const { mutate: linkSocial, isPending: isLinking } = useLinkSocial(authClient);

  const { mutate: unlinkAccount, isPending: isUnlinking } = useUnlinkAccount(authClient, {
    onSuccess: () => {
      setIsConfirmOpen(false);
      toast.success(localization.settings.accountUnlinked);
    },
  });

  const ProviderIcon = providerIcons[provider];
  const providerName = getProviderName(provider);

  const displayName = accountInfo ? (accountInfo.user.email ?? accountInfo.user.name) : account?.accountId;
  const unlinkLabel = localization.settings.unlinkProvider.replace('{{provider}}', providerName);

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
          <>
            <Button
              className='ml-auto shrink-0'
              variant='outline'
              size='sm'
              onClick={() => {
                setIsConfirmOpen(true);
              }}
              disabled={isUnlinking}
              aria-label={unlinkLabel}
            >
              {isUnlinking ? <Spinner /> : <Link2Off />}
              {localization.settings.unlinkProvider.replace('{{provider}}', '').trim()}
            </Button>
            <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{`${unlinkLabel}?`}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {getUnlinkConsequence(providerName, provider, accountInfo?.user.email ?? accountInfo?.user.name)}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isUnlinking}>{localization.settings.cancel}</AlertDialogCancel>
                  <Button
                    type='button'
                    variant='destructive'
                    disabled={isUnlinking}
                    onClick={() => {
                      unlinkAccount({ providerId: account.providerId });
                    }}
                  >
                    {isUnlinking ? <Spinner /> : null}
                    {unlinkLabel}
                  </Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
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
