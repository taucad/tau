import { memo, useEffect, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ExternalLink, Plus, RefreshCw } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@taucad/ui/components/alert-dialog';
import { cn } from '@taucad/ui/utils/cn';
import { SettingsGroup, SettingsItem, SettingsRow } from '#components/settings/settings-item.js';
import { GithubRepositoryWriteSettings } from '#components/github/github-repository-write-settings.js';
import {
  configureGithubAccess,
  githubConnections,
  GithubRequestError,
  githubErrorMessage,
} from '#lib/github-connections.js';
import type { GithubConnection, GithubInstallation, GithubRepository } from '#lib/github-connections.js';
import { isDesktopTarget } from '#lib/build-target.js';

/** A loading, failure or empty line inside a group, sized like a row. */
function StatusRow({
  kind,
  children,
  onRetry,
}: {
  readonly kind: 'pending' | 'error' | 'empty';
  readonly children: React.ReactNode;
  readonly onRetry?: () => void;
}): React.JSX.Element {
  return (
    <div
      role={kind === 'pending' ? 'status' : kind === 'error' ? 'alert' : undefined}
      aria-busy={kind === 'pending' ? true : undefined}
      className='flex min-h-12 items-center justify-between gap-4 py-3 text-xs text-muted-foreground'
    >
      <span className={cn(kind === 'error' && 'text-foreground')}>{children}</span>
      {onRetry ? (
        <Button variant='outline' size='sm' onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

/** A centred "show more" control closing a paged list. */
function MoreRow({
  label,
  isDisabled,
  onClick,
}: {
  readonly label: string;
  readonly isDisabled: boolean;
  readonly onClick: () => void;
}): React.JSX.Element {
  return (
    <div className='flex justify-center py-2'>
      <Button variant='ghost' size='sm' disabled={isDisabled} onClick={onClick}>
        {label}
      </Button>
    </div>
  );
}

/** How much a repository lets Tau do, in the person's words. */
const repositoryAccess = (repository: GithubRepository, installation: GithubInstallation): string => {
  const write =
    repository.access === 'unknown' ? installation.permissions['contents'] === 'write' : repository.access === 'write';
  const access = write ? 'Read and write' : 'Read only';
  return repository.archived ? `${access} · Archived` : access;
};

const RepositoryRow = memo(function RepositoryRow({
  connectionId,
  installation,
  repository,
}: {
  readonly connectionId: string;
  readonly installation: GithubInstallation;
  readonly repository: GithubRepository;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <SettingsRow
      title={<span className='break-all'>{repository.fullName}</span>}
      description={repositoryAccess(repository, installation)}
      control={
        <Button
          size='sm'
          variant='ghost'
          aria-expanded={open}
          aria-label={`Manage ${repository.fullName}`}
          onClick={() => {
            setOpen(!open);
          }}
        >
          Manage
          <ChevronDown aria-hidden className={cn('transition-transform', open && 'rotate-180')} />
        </Button>
      }
    >
      {open ? <GithubRepositoryWriteSettings connectionId={connectionId} repositoryId={repository.id} /> : null}
    </SettingsRow>
  );
});

const RepositoryList = memo(function RepositoryList({
  connectionId,
  installation,
}: {
  readonly connectionId: string;
  readonly installation: GithubInstallation;
}): React.JSX.Element {
  const repositories = useInfiniteQuery({
    queryKey: ['github', 'settings-repositories', connectionId, installation.id],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => githubConnections.repositories(connectionId, installation.id, pageParam),
    getNextPageParam: (last, pages) =>
      pages.flatMap((page) => page.repositories).length < last.totalCount ? last.page + 1 : undefined,
    retry: false,
  });
  return (
    <section aria-label={`${installation.owner.login} repositories`}>
      <SettingsGroup
        title={installation.owner.login}
        action={
          <span className='text-xs text-muted-foreground'>
            {installation.suspended
              ? 'Suspended on GitHub'
              : installation.repositorySelection === 'all'
                ? 'All repositories'
                : 'Selected repositories'}
          </span>
        }
      >
        {repositories.isPending ? <StatusRow kind='pending'>Loading repositories…</StatusRow> : null}
        {repositories.error ? (
          <StatusRow
            kind='error'
            onRetry={() => {
              void repositories.refetch();
            }}
          >
            {githubErrorMessage(repositories.error)}
          </StatusRow>
        ) : null}
        {repositories.data?.pages
          .flatMap((page) => page.repositories)
          .map((repository) => (
            <RepositoryRow
              key={repository.id}
              connectionId={connectionId}
              installation={installation}
              repository={repository}
            />
          ))}
        {repositories.data?.pages[0]?.totalCount === 0 ? (
          <StatusRow kind='empty'>
            No repositories yet. Choose some on GitHub, or ask an organization owner to approve access.
          </StatusRow>
        ) : null}
        {repositories.hasNextPage ? (
          <MoreRow
            label='Show more repositories'
            isDisabled={repositories.isFetchingNextPage}
            onClick={() => {
              void repositories.fetchNextPage();
            }}
          />
        ) : null}
      </SettingsGroup>
    </section>
  );
});

/** The installations (personal account and organizations) one connection reaches, each with its repositories. */
const ConnectionRepositories = memo(function ConnectionRepositories({
  connection,
}: {
  readonly connection: GithubConnection;
}): React.JSX.Element {
  const installations = useInfiniteQuery({
    queryKey: ['github', 'settings-installations', connection.id],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => githubConnections.installations(connection.id, pageParam),
    getNextPageParam: (last, pages) =>
      pages.flatMap((page) => page.installations).length < last.totalCount ? last.page + 1 : undefined,
    retry: false,
  });
  const empty = installations.data?.pages[0]?.totalCount === 0;
  return (
    <section aria-label={`Repository connection ${connection.login}`} className='flex flex-col gap-6'>
      {installations.isPending || installations.error !== null || empty ? (
        <SettingsGroup title='Repositories'>
          {installations.isPending ? <StatusRow kind='pending'>Checking installations…</StatusRow> : null}
          {installations.error ? (
            <StatusRow
              kind='error'
              onRetry={() => {
                void installations.refetch();
              }}
            >
              {githubErrorMessage(installations.error)}
            </StatusRow>
          ) : null}
          {empty ? (
            <StatusRow kind='empty'>
              No repositories yet. Choose some on GitHub; an organization owner may need to approve.
            </StatusRow>
          ) : null}
        </SettingsGroup>
      ) : null}
      {installations.data?.pages
        .flatMap((page) => page.installations)
        .map((installation) => (
          <RepositoryList key={installation.id} connectionId={connection.id} installation={installation} />
        ))}
      {installations.hasNextPage ? (
        <MoreRow
          label='Show more accounts'
          isDisabled={installations.isFetchingNextPage}
          onClick={() => {
            void installations.fetchNextPage();
          }}
        />
      ) : null}
    </section>
  );
});

/** The connected GitHub account, with a confirmed disconnect. */
const ConnectionRow = memo(function ConnectionRow({
  connection,
  onRemoved,
}: {
  readonly connection: GithubConnection;
  readonly onRemoved: () => Promise<unknown>;
}): React.JSX.Element {
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
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
    <SettingsRow
      title={`@${connection.login}`}
      description='Connected account'
      control={
        <>
          <Button
            size='sm'
            variant='outline'
            aria-label={`Disconnect @${connection.login}`}
            onClick={() => {
              setConfirm(true);
            }}
          >
            Disconnect
          </Button>
          <AlertDialog open={confirm} onOpenChange={setConfirm}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Disconnect repositories for @{connection.login}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Repository access and write approvals in Tau are removed. Local projects, GitHub sign-in and Gists
                  remain. This does not uninstall the App on GitHub.
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
        </>
      }
    />
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
  const connected = (connections.data?.length ?? 0) > 0;
  return (
    <SettingsItem settingId='github-repositories'>
      <div className='flex flex-col gap-6 md:gap-8'>
        <SettingsGroup
          title='GitHub'
          action={
            <div className='flex items-center gap-1'>
              {connected && !pending ? (
                <Button
                  variant='ghost'
                  size='sm'
                  onClick={() => {
                    void connect();
                  }}
                >
                  <Plus aria-hidden />
                  Add account
                </Button>
              ) : null}
              <Button
                variant='ghost'
                size='icon-sm'
                aria-label='Refresh'
                onClick={() => {
                  void queryClient.invalidateQueries({ queryKey: ['github'] });
                }}
              >
                <RefreshCw aria-hidden className='size-3.5' />
              </Button>
            </div>
          }
        >
          {connections.isPending ? <StatusRow kind='pending'>Loading connections…</StatusRow> : null}
          {(error ?? connections.error) ? (
            <StatusRow kind='error'>{error ?? githubErrorMessage(connections.error)}</StatusRow>
          ) : null}
          {connections.data?.map((connection) => (
            <ConnectionRow key={connection.id} connection={connection} onRemoved={connections.refetch} />
          ))}
          {connected ? (
            <SettingsRow
              title='Repository access'
              description='Choose which repositories Tau can use'
              control={
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => {
                    void configure();
                  }}
                >
                  Change on GitHub
                  <ExternalLink aria-hidden />
                </Button>
              }
            />
          ) : null}
          {connections.isPending || (connected && !pending) ? null : (
            <SettingsRow
              title='Connect GitHub'
              description={
                pending ? 'Finish connecting in your browser' : 'Import from and push to your GitHub repositories'
              }
              control={
                <>
                  {pending ? (
                    <Button
                      variant='ghost'
                      size='sm'
                      onClick={() => {
                        void cancel();
                      }}
                    >
                      Cancel
                    </Button>
                  ) : null}
                  <Button
                    size='sm'
                    disabled={pending}
                    onClick={() => {
                      void connect();
                    }}
                  >
                    {pending ? 'Waiting for GitHub…' : 'Connect'}
                  </Button>
                </>
              }
            />
          )}
        </SettingsGroup>
        {connections.data?.map((connection) => (
          <ConnectionRepositories key={connection.id} connection={connection} />
        ))}
      </div>
    </SettingsItem>
  );
}
