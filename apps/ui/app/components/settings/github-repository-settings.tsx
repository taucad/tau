import { memo, useEffect, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@taucad/ui/components/button';
import { Card, CardContent } from '@taucad/ui/components/card';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@taucad/ui/components/alert-dialog';
import { SettingsItem } from '#components/settings/settings-item.js';
import { GithubRepositoryWriteSettings } from '#components/github/github-repository-write-settings.js';
import {
  configureGithubAccess,
  githubConnections,
  GithubRequestError,
  githubErrorMessage,
} from '#lib/github-connections.js';
import type { GithubConnection, GithubInstallation } from '#lib/github-connections.js';
import { isDesktopTarget } from '#lib/build-target.js';

const RepositoryList = memo(function RepositoryList({
  connectionId,
  installation,
}: {
  readonly connectionId: string;
  readonly installation: GithubInstallation;
}): React.JSX.Element {
  const [selected, setSelected] = useState<number>();
  const repositories = useInfiniteQuery({
    queryKey: ['github', 'settings-repositories', connectionId, installation.id],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => githubConnections.repositories(connectionId, installation.id, pageParam),
    getNextPageParam: (last, pages) =>
      pages.flatMap((page) => page.repositories).length < last.totalCount ? last.page + 1 : undefined,
    retry: false,
  });
  return (
    <section aria-label={`${installation.owner.login} repositories`} className='space-y-3'>
      <div>
        <h3 className='text-sm font-medium'>{installation.owner.login}</h3>
        <p className='text-xs text-muted-foreground'>
          {installation.suspended
            ? 'Installation suspended'
            : `${installation.repositorySelection === 'all' ? 'All' : 'Selected'} repositories · Contents ${installation.permissions['contents'] === 'write' ? 'read and write' : 'read'} on GitHub`}
        </p>
      </div>
      {repositories.isPending ? (
        <p role='status' aria-busy='true' className='text-xs'>
          Loading repositories…
        </p>
      ) : null}
      {repositories.error ? (
        <p role='alert' className='text-xs'>
          {githubErrorMessage(repositories.error)}{' '}
          <Button
            variant='link'
            size='sm'
            onClick={() => {
              void repositories.refetch();
            }}
          >
            Try again
          </Button>
        </p>
      ) : null}
      <Card className='gap-0 p-0'>
        <CardContent className='p-0'>
          {repositories.data?.pages
            .flatMap((page) => page.repositories)
            .map((repository) => (
              <div key={repository.id} className='space-y-3 border-t p-4 first:border-0'>
                <div className='flex flex-wrap items-center gap-3'>
                  <span className='min-w-0 flex-1 text-sm font-medium break-words'>{repository.fullName}</span>
                  <Button
                    size='sm'
                    variant='outline'
                    aria-expanded={selected === repository.id}
                    onClick={() => {
                      setSelected(selected === repository.id ? undefined : repository.id);
                    }}
                  >
                    Repository settings
                  </Button>
                </div>
                {selected === repository.id ? (
                  <GithubRepositoryWriteSettings connectionId={connectionId} repositoryId={repository.id} />
                ) : null}
              </div>
            ))}
        </CardContent>
      </Card>
      {repositories.data?.pages[0]?.totalCount === 0 ? (
        <p className='text-xs text-muted-foreground'>
          No repositories are available. Choose repositories on GitHub, or ask an organization owner to approve access.
        </p>
      ) : null}
      {repositories.hasNextPage ? (
        <Button
          size='sm'
          variant='outline'
          disabled={repositories.isFetchingNextPage}
          onClick={() => {
            void repositories.fetchNextPage();
          }}
        >
          Load more repositories
        </Button>
      ) : null}
    </section>
  );
});

const Connection = memo(function Connection({
  connection,
  onRemoved,
}: {
  readonly connection: GithubConnection;
  readonly onRemoved: () => Promise<unknown>;
}): React.JSX.Element {
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const installations = useInfiniteQuery({
    queryKey: ['github', 'settings-installations', connection.id],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => githubConnections.installations(connection.id, pageParam),
    getNextPageParam: (last, pages) =>
      pages.flatMap((page) => page.installations).length < last.totalCount ? last.page + 1 : undefined,
    retry: false,
  });
  const remove = async (): Promise<void> => {
    setBusy(true);
    try {
      await githubConnections.remove(connection.id);
      await onRemoved();
    } catch (error_) {
      setError(githubErrorMessage(error_));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-label={`Repository connection ${connection.login}`} className='space-y-4'>
      <div className='flex flex-wrap items-center gap-3'>
        <h2 className='min-w-0 flex-1 text-sm font-semibold'>@{connection.login}</h2>
        <Button
          size='sm'
          variant='outline'
          onClick={() => {
            setConfirm(true);
          }}
        >
          Disconnect repositories
        </Button>
      </div>
      {installations.isPending ? (
        <p role='status' aria-busy='true' className='text-xs'>
          Checking installations…
        </p>
      ) : null}
      {installations.error ? (
        <p role='alert' className='text-xs'>
          {githubErrorMessage(installations.error)}{' '}
          <Button
            variant='link'
            size='sm'
            onClick={() => {
              void installations.refetch();
            }}
          >
            Try again
          </Button>
        </p>
      ) : null}
      {installations.data?.pages
        .flatMap((page) => page.installations)
        .map((installation) => (
          <RepositoryList key={installation.id} connectionId={connection.id} installation={installation} />
        ))}
      {installations.data?.pages[0]?.totalCount === 0 ? (
        <p className='text-xs text-muted-foreground'>
          No installation is available. Choose repositories on GitHub; an organization owner may need to approve.
        </p>
      ) : null}
      {installations.hasNextPage ? (
        <Button
          size='sm'
          variant='outline'
          disabled={installations.isFetchingNextPage}
          onClick={() => {
            void installations.fetchNextPage();
          }}
        >
          Load more installations
        </Button>
      ) : null}
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect repositories for @{connection.login}?</AlertDialogTitle>
            <AlertDialogDescription>
              Repository access and write approvals in Tau are removed. Local projects, GitHub sign-in and Gists remain.
              This does not uninstall the App on GitHub.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error ? (
            <p role='alert' className='text-sm'>
              {error}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button
              variant='destructive'
              disabled={busy}
              onClick={() => {
                void remove();
              }}
            >
              Disconnect repositories
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
});

/** Account installations, selected repositories and their separate Tau write approvals. */
export function GithubRepositorySettings(): React.JSX.Element {
  const queryClient = useQueryClient();
  const connections = useQuery({ queryKey: ['github', 'connections'], queryFn: githubConnections.list, retry: false });
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const attempt = useRef<string | undefined>(undefined);
  const abort = useRef<AbortController | undefined>(undefined);
  useEffect(
    () => () => {
      abort.current?.abort();
    },
    [],
  );
  const returnTo = `${globalThis.location.pathname}?settings=repositories`;
  const connect = async (): Promise<void> => {
    setPending(true);
    setError(undefined);
    const controller = new AbortController();
    const cancelled = (): boolean => controller.signal.aborted;
    abort.current = controller;
    try {
      const desktop = isDesktopTarget();
      const started = await githubConnections.start(returnTo, desktop ? 'desktop-poll' : 'browser');
      if (cancelled()) {
        await githubConnections.cancel(started.attemptId).catch(() => undefined);
        return;
      }
      attempt.current = started.attemptId;
      globalThis.location.assign(started.authorizationUrl);
      if (!desktop) {
        return;
      }
      const deadline = Date.now() + 600_000;
      while (!cancelled() && Date.now() < deadline) {
        try {
          // oxlint-disable-next-line no-await-in-loop -- completion is polled in order.
          await githubConnections.complete(started.attemptId);
          if (cancelled()) {
            return;
          }
          // oxlint-disable-next-line no-await-in-loop -- refresh only after completion.
          await queryClient.invalidateQueries({ queryKey: ['github'] });
          return;
        } catch (error_) {
          if (!(error_ instanceof GithubRequestError && error_.code === 'GITHUB_COMPLETION_PENDING')) {
            throw error_;
          }
        }
        // oxlint-disable-next-line no-await-in-loop -- bounded provider completion poll.
        await new Promise<void>((resolve) => {
          globalThis.setTimeout(resolve, 1500);
        });
      }
      if (!cancelled()) {
        setError('The GitHub connection expired. Try again.');
      }
    } catch (error_) {
      if (!cancelled()) {
        setError(githubErrorMessage(error_));
      }
    } finally {
      if (!cancelled()) {
        setPending(false);
      }
      if (abort.current === controller) {
        attempt.current = undefined;
      }
    }
  };
  const configure = async (): Promise<void> => {
    try {
      const { installUrl } = await githubConnections.configuration();
      configureGithubAccess(installUrl, returnTo);
    } catch (error_) {
      setError(githubErrorMessage(error_));
    }
  };
  const cancel = async (): Promise<void> => {
    abort.current?.abort();
    const id = attempt.current;
    setPending(false);
    if (id !== undefined) {
      await githubConnections.cancel(id).catch(() => undefined);
    }
  };
  return (
    <SettingsItem settingId='github-repositories'>
      <div className='space-y-5'>
        <div>
          <h2 className='text-sm font-semibold'>GitHub repositories</h2>
          <p className='mt-1 text-xs text-muted-foreground'>
            Choose “Only select repositories” on GitHub. Writes start off in Tau and each push needs a separate action.
          </p>
        </div>
        <div className='flex flex-wrap gap-2'>
          <Button
            size='sm'
            disabled={pending}
            onClick={() => {
              void connect();
            }}
          >
            {pending ? 'Finish connecting in your browser…' : 'Connect GitHub account'}
          </Button>
          {pending ? (
            <Button
              variant='outline'
              size='sm'
              onClick={() => {
                void cancel();
              }}
            >
              Cancel
            </Button>
          ) : null}
          <Button
            variant='outline'
            size='sm'
            onClick={() => {
              void configure();
            }}
          >
            Change repository selection on GitHub
          </Button>
          <Button
            variant='ghost'
            size='sm'
            onClick={() => {
              void queryClient.invalidateQueries({ queryKey: ['github'] });
            }}
          >
            Refresh
          </Button>
        </div>
        {(error ?? connections.error) ? (
          <p role='alert' className='text-sm'>
            {error ?? githubErrorMessage(connections.error)}
          </p>
        ) : null}
        {connections.isPending ? (
          <p role='status' aria-busy='true' className='text-xs'>
            Loading connections…
          </p>
        ) : null}
        {connections.data?.map((connection) => (
          <Connection key={connection.id} connection={connection} onRemoved={connections.refetch} />
        ))}
        {connections.data?.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            No repository connection. GitHub sign-in and Gists are managed separately in Security.
          </p>
        ) : null}
      </div>
    </SettingsItem>
  );
}
