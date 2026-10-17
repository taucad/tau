import { useQuery } from '@tanstack/react-query';
import { useSettingsDialog } from '#hooks/use-settings-dialog.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { EllipsisVertical, Loader2, RefreshCw, Trash2 } from 'lucide-react';
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
} from '@taucad/ui/components/alert-dialog';
import { Button } from '@taucad/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@taucad/ui/components/dropdown-menu';
import { useAuthLinks } from '#hooks/use-auth-links.js';
import {
  awaitGithubGistConnection,
  connectGithubGist,
  getGithubGistConnectionStatus,
  parseGithubGistAuthorizationReturn,
  shareProviderRegistry,
  withBrowserShareProviderContext,
} from '#lib/share-providers.js';
import type { GithubGistAuthorizationSurface } from '#lib/share-providers.js';
import { toast } from '#components/ui/sonner.js';

type GithubGistManagementProps = {
  readonly locator: ShareLocator;
  readonly protection: ShareProtection;
  readonly collectSnapshot: () => Promise<ShareProjectSnapshot>;
  readonly onRepublished: (url: string) => void;
  readonly onUnpublished: () => void;
  /** Where GitHub sends the person back after a reconnect: the share page, or the editor with Share open. */
  readonly surface?: GithubGistAuthorizationSurface;
};

/** Owner lifecycle controls for a canonical Tau project stored in a GitHub Gist. */
export function GithubGistManagement({
  locator,
  protection,
  collectSnapshot,
  onRepublished,
  onUnpublished,
  surface = 'share-page',
}: GithubGistManagementProps): React.JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const authorizationReturn = useMemo(() => parseGithubGistAuthorizationReturn(location.search), [location.search]);
  const { signIn } = useAuthLinks({
    redirectTo: `${location.pathname}${authorizationReturn?.remainingSearch ?? location.search}`,
  });
  const settings = useSettingsDialog();
  const capability = useQuery({
    queryKey: ['github', 'gist-status'],
    queryFn: getGithubGistConnectionStatus,
    retry: false,
    staleTime: 0,
  });
  const status = capability.error ? 'reconnect-required' : capability.data;
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  /* D16c: desktop runs the Gist grant in the system browser and waits here for it. */
  const [awaitingBrowser, setAwaitingBrowser] = useState(false);
  /* The Cancel that was clicked unmounts; focus returns to the button that started the grant. */
  const [refocusConnect, setRefocusConnect] = useState(false);
  const consentRef = useRef<AbortController | undefined>(undefined);

  useEffect(
    () => () => {
      consentRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    if (!authorizationReturn || status === undefined) {
      return;
    }
    if (authorizationReturn.outcome === 'cancelled') {
      toast.info('GitHub Gist access was not granted.');
    } else if (authorizationReturn.outcome === 'failed') {
      toast.error(authorizationReturn.failure ?? 'GitHub authorization could not be completed.');
    } else if (status === 'connected') {
      toast.success('GitHub Gist access verified. Nothing has been published.');
    } else {
      toast.info('Gist access still needs attention. Check Security settings before sharing.');
    }
    void navigate(`${location.pathname}${authorizationReturn.remainingSearch}${location.hash}`, { replace: true });
  }, [authorizationReturn, status, location.hash, location.pathname, navigate]);

  const handleFailure = (error: unknown): void => {
    if (isShareError(error) && error.code === 'SHARE_AUTH_REQUIRED') {
      void capability.refetch();
    }
    if (isShareError(error) && error.code === 'SHARE_PERMISSION_REQUIRED') {
      void capability.refetch();
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
    setRefocusConnect(false);
    try {
      const handoff = await connectGithubGist({ returnUrl: globalThis.location.href, surface });
      if (handoff === 'redirect') {
        return;
      }
      const consent = new AbortController();
      consentRef.current = consent;
      setAwaitingBrowser(true);
      const connected = await awaitGithubGistConnection(consent.signal);
      if (consent.signal.aborted) {
        return;
      }
      consentRef.current = undefined;
      setAwaitingBrowser(false);
      setBusy(false);
      if (connected) {
        await capability.refetch();
        toast.success('GitHub Gist access granted.');
      } else {
        toast.info('Gist access did not arrive within 10 minutes. Try again.');
      }
    } catch (error) {
      handleFailure(error);
      setBusy(false);
    }
  };

  const cancelBrowserConsent = (): void => {
    consentRef.current?.abort();
    consentRef.current = undefined;
    setAwaitingBrowser(false);
    setBusy(false);
    setRefocusConnect(true);
    toast.info('Stopped waiting for your browser. Gist access was not changed here.');
  };

  if (status === 'signed-out') {
    return (
      <Button asChild type='button' size='sm' variant='ghost' className='h-8 px-2.5 text-xs'>
        <Link to={signIn}>Sign in to manage</Link>
      </Button>
    );
  }

  if (awaitingBrowser) {
    return (
      <div className='flex items-center gap-1'>
        <span role='status' className='flex items-center gap-1.5 px-1 text-xs text-muted-foreground'>
          <Loader2 className='size-3.5 spin-glyph' aria-hidden />
          Finish in your browser
        </span>
        <Button type='button' size='sm' variant='ghost' className='h-8 px-2.5 text-xs' onClick={cancelBrowserConsent}>
          Cancel
        </Button>
      </div>
    );
  }

  if (status === 'disabled') {
    return (
      <Button
        size='sm'
        variant='ghost'
        onClick={() => {
          settings.open('security', 'github-permissions');
        }}
      >
        Manage Gist sharing
      </Button>
    );
  }

  if (status === 'not-connected' || status === 'permission-required' || status === 'reconnect-required') {
    return (
      <Button
        type='button'
        size='sm'
        variant='ghost'
        className='h-8 px-2.5 text-xs'
        disabled={busy}
        autoFocus={refocusConnect}
        onClick={() => {
          void connect();
        }}
      >
        {status === 'permission-required'
          ? 'Allow Gist access'
          : status === 'reconnect-required'
            ? 'Reconnect GitHub'
            : 'Connect GitHub'}
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
            className='h-8 px-2.5 text-xs max-md:size-8 max-md:px-0'
            disabled={status === undefined || busy}
          >
            {busy ? (
              <Loader2 className='size-3.5 spin-glyph' aria-hidden />
            ) : (
              <EllipsisVertical className='size-3.5' aria-hidden />
            )}
            <span className='hidden md:inline'>Manage</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          <DropdownMenuItem
            onSelect={() => {
              void republish();
            }}
          >
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
            <Button
              type='button'
              variant='destructive'
              disabled={busy}
              onClick={() => {
                void unpublish();
              }}
            >
              {busy ? <Loader2 className='size-4 spin-glyph' aria-hidden /> : null}
              Unpublish Gist
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
