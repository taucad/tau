import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Ellipsis, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { formatShareUrl } from '@taucad/share/locator';
import type { ShareLocator } from '@taucad/share/locator';
import { isShareError } from '@taucad/share/provider';
import type { ShareProjectSnapshot } from '@taucad/share/snapshot';
import type { ShareProtection } from '@taucad/share/provider';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#components/ui/alert-dialog.js';
import { Button } from '#components/ui/button.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu.js';
import { useAuthLinks } from '#hooks/use-auth-links.js';
import {
  connectGithubGist,
  getGithubGistConnectionStatus,
  parseGithubGistAuthorizationReturn,
  shareProviderRegistry,
  withBrowserShareProviderContext,
} from '#lib/share-providers.js';
import type { GithubGistConnectionStatus } from '#lib/share-providers.js';
import { toast } from '#components/ui/sonner.js';

type GithubGistManagementProps = {
  readonly locator: ShareLocator;
  readonly protection: ShareProtection;
  readonly collectSnapshot: () => Promise<ShareProjectSnapshot>;
  readonly onRepublished: (url: string) => void;
  readonly onUnpublished: () => void;
};

/** Owner lifecycle controls for a canonical Tau project stored in a GitHub Gist. */
export function GithubGistManagement({
  locator,
  protection,
  collectSnapshot,
  onRepublished,
  onUnpublished,
}: GithubGistManagementProps): React.JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const authorizationReturn = useMemo(() => parseGithubGistAuthorizationReturn(location.search), [location.search]);
  const { signIn } = useAuthLinks({
    redirectTo: `${location.pathname}${authorizationReturn?.remainingSearch ?? location.search}`,
  });
  const [status, setStatus] = useState<GithubGistConnectionStatus>();
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadStatus = async (): Promise<void> => {
      const next = await getGithubGistConnectionStatus();
      if (!cancelled) {
        setStatus(next);
      }
    };
    // async-iife: bootstrap
    void loadStatus();
    if (authorizationReturn) {
      if (authorizationReturn.outcome === 'cancelled') {
        toast.info('GitHub Gist access was not granted.');
      } else if (authorizationReturn.outcome === 'failed') {
        toast.error('GitHub authorization could not be completed.');
      } else {
        toast.success('GitHub Gist access updated.');
      }
      void navigate(`${location.pathname}${authorizationReturn.remainingSearch}${location.hash}`, { replace: true });
    }
    return () => {
      cancelled = true;
    };
  }, [authorizationReturn, location.hash, location.pathname, navigate]);

  const handleFailure = (error: unknown): void => {
    if (isShareError(error) && error.code === 'SHARE_AUTH_REQUIRED') {
      setStatus('not-connected');
    }
    if (isShareError(error) && error.code === 'SHARE_PERMISSION_REQUIRED') {
      setStatus('permission-required');
    }
    toast.error(error instanceof Error ? error.message : 'GitHub Gist management failed.');
  };

  const republish = async (): Promise<void> => {
    setBusy(true);
    try {
      const provider = await shareProviderRegistry.load('github-gist');
      const providerRepublish = provider.republish;
      if (!providerRepublish) {
        throw new Error('This sharing method cannot republish projects.');
      }
      const url = await withBrowserShareProviderContext(async (context) => {
        const publication = await providerRepublish(
          { locator, snapshot: await collectSnapshot(), protection },
          context,
        );
        return formatShareUrl({
          origin: context.origin,
          locator: publication.locator,
          secrets: publication.secrets,
        });
      });
      toast.success('GitHub Gist republished');
      onRepublished(url);
    } catch (error) {
      handleFailure(error);
    } finally {
      setBusy(false);
    }
  };

  const unpublish = async (): Promise<void> => {
    setBusy(true);
    try {
      const provider = await shareProviderRegistry.load('github-gist');
      const providerUnpublish = provider.unpublish;
      if (!providerUnpublish) {
        throw new Error('This sharing method cannot unpublish projects.');
      }
      await withBrowserShareProviderContext(async (context) => providerUnpublish({ locator }, context));
      setConfirmOpen(false);
      toast.success('GitHub Gist unpublished');
      onUnpublished();
    } catch (error) {
      handleFailure(error);
    } finally {
      setBusy(false);
    }
  };

  const connect = async (): Promise<void> => {
    setBusy(true);
    try {
      await connectGithubGist({ returnUrl: globalThis.location.href, surface: 'share-page' });
    } catch (error) {
      handleFailure(error);
      setBusy(false);
    }
  };

  if (status === 'signed-out') {
    return (
      <Button asChild type='button' size='sm' variant='ghost' className='h-8 px-2.5 text-xs'>
        <Link to={signIn}>Sign in to manage</Link>
      </Button>
    );
  }

  if (status === 'not-connected' || status === 'permission-required') {
    return (
      <Button
        type='button'
        size='sm'
        variant='ghost'
        className='h-8 px-2.5 text-xs'
        disabled={busy}
        onClick={() => {
          void connect();
        }}
      >
        {status === 'permission-required' ? 'Allow Gist access' : 'Connect GitHub'}
      </Button>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type='button'
            size='sm'
            variant='ghost'
            aria-label='Manage GitHub Gist'
            className='h-8 px-2.5 text-xs max-sm:size-8 max-sm:px-0'
            disabled={status === undefined || busy}
          >
            {busy ? (
              <Loader2 className='size-3.5 animate-spin' aria-hidden />
            ) : (
              <Ellipsis className='size-3.5' aria-hidden />
            )}
            <span className='hidden sm:inline'>Manage</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          <DropdownMenuItem onSelect={() => void republish()}>
            <RefreshCw className='size-4' aria-hidden />
            Republish Gist
          </DropdownMenuItem>
          <DropdownMenuItem
            variant='destructive'
            onSelect={() => {
              setConfirmOpen(true);
            }}
          >
            <Trash2 className='size-4' aria-hidden />
            Unpublish Gist
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unpublish this GitHub Gist?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the Gist from GitHub. Existing Tau and GitHub links will stop working.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button type='button' variant='destructive' disabled={busy} onClick={() => void unpublish()}>
              {busy ? <Loader2 className='size-4 animate-spin' aria-hidden /> : null}
              Unpublish Gist
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
