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
import { Skeleton } from '@taucad/ui/components/skeleton';
import { Spinner } from '#components/ui/spinner.js';
import { cn } from '@taucad/ui/utils/cn';
import { SettingsRow } from '#components/settings/settings-item.js';

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
    ? `${signIn} This also disconnects Gist sharing in Tau. Existing Gists and repository connections remain. Your authorization on GitHub is not revoked.`
    : signIn;
};

/**
 * One sign-in provider as a settings row: the provider and linked identity, with link or unlink on the right.
 *
 * @param props - The linked account, when there is one, and its provider.
 * @returns The provider row.
 */
export function LinkedAccount({ account, provider }: LinkedAccountProps): React.JSX.Element {
  const { authClient, baseURL, localization } = useAuth();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const { data: accountInfo, isPending: isLoadingInfo } = useAccountInfo(authClient, {
    query: { accountId: account?.id ?? '' },
    enabled: Boolean(account),
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

  const icon = ProviderIcon ? (
    <ProviderIcon aria-hidden className={cn('size-4 shrink-0', !account && 'opacity-50')} />
  ) : (
    <Plug aria-hidden className={cn('size-4 shrink-0', !account && 'opacity-50')} />
  );

  return (
    <SettingsRow
      title={
        <>
          {icon}
          {providerName}
        </>
      }
      description={
        account && isLoadingInfo ? (
          <Skeleton className='my-0.5 h-3 w-24' />
        ) : (
          <span className='block truncate'>{account ? displayName : 'Not linked'}</span>
        )
      }
      control={
        account ? (
          <>
            <Button
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
                      unlinkAccount({ accountId: account.id });
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
        )
      }
    />
  );
}
