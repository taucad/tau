/* oxlint-disable react/set-state-in-effect -- these effects synchronize paged GitHub catalog state. */
import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, EllipsisVertical, GitBranch, Lock, RefreshCw } from 'lucide-react';
import { useSession } from '@better-auth-ui/react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
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
import { SvgIcon } from '#components/icons/svg-icon.js';
import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';
import {
  GithubRequestError,
  githubConnections,
  githubErrorMessage,
  githubSetupReturn,
} from '#lib/github-connections.js';
import { authClient } from '#lib/auth-client.js';
import { isDesktopTarget } from '#filesystem/desktop-bridge.js';
import type {
  GithubBranch,
  GithubConnection,
  GithubInstallation,
  GithubRepository,
  GithubTreeFile,
} from '#lib/github-connections.js';

export type GithubRepositorySelection = Readonly<{
  connection: GithubConnection;
  installation: GithubInstallation;
  repository: GithubRepository;
  branch: GithubBranch;
  files: readonly GithubTreeFile[];
  manifest?: Uint8Array<ArrayBuffer>;
}>;

type GithubRepositoryPickerProps = Readonly<{
  onSelect: (selection: GithubRepositorySelection) => void | Promise<void>;
  actionLabel?: string;
  returnTo?: string;
  /**
   * Start GitHub's connect flow, as *Connect GitHub* would, for a caller whose
   * own button is the reconnect (D48). The picker calls
   * `onConnectRequestHandled` as it starts, so a later remount does not replay it.
   */
  shouldConnect?: boolean;
  onConnectRequestHandled?: () => void;
}>;

/**
 * Whether this deployment has the GitHub App connection set up (D8), from
 * `GET /v1/github/configuration`. `undefined` while unknown or signed out.
 *
 * @returns `false` only when the API answered `GITHUB_CONNECTION_UNAVAILABLE`.
 */
export const useGithubConnectionAvailable = (): boolean | undefined => {
  const { data: session } = useSession(authClient);
  const { data, error } = useQuery({
    queryKey: ['github', 'configuration'],
    enabled: session !== null && session !== undefined,
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: async () => githubConnections.configuration(),
  });
  if (error instanceof GithubRequestError && error.code === 'GITHUB_CONNECTION_UNAVAILABLE') {
    return false;
  }
  return data === undefined ? undefined : true;
};

const byAccount = (left: GithubInstallation, right: GithubInstallation): number => {
  const leftOrganization = left.owner.type.toLowerCase() === 'organization';
  const rightOrganization = right.owner.type.toLowerCase() === 'organization';
  return Number(leftOrganization) - Number(rightOrganization) || left.owner.login.localeCompare(right.owner.login);
};

export const GithubRepositoryPicker = memo(function GithubRepositoryPicker({
  onSelect,
  actionLabel = 'Use repository',
  returnTo = '/import',
  shouldConnect = false,
  onConnectRequestHandled,
}: GithubRepositoryPickerProps): React.JSX.Element {
  const { data: session, isPending: sessionPending } = useSession(authClient);
  const connectionAvailable = useGithubConnectionAvailable();
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [connections, setConnections] = useState<readonly GithubConnection[]>([]);
  const [connectionId, setConnectionId] = useState('');
  const [installations, setInstallations] = useState<readonly GithubInstallation[]>([]);
  const [installationId, setInstallationId] = useState('');
  const [repositories, setRepositories] = useState<readonly GithubRepository[]>([]);
  const [repositoryId, setRepositoryId] = useState('');
  const [repositoryPage, setRepositoryPage] = useState(1);
  const [repositoryHasMore, setRepositoryHasMore] = useState(false);
  const [branches, setBranches] = useState<readonly GithubBranch[]>([]);
  const [branchName, setBranchName] = useState('');
  const [branchPage, setBranchPage] = useState(1);
  const [branchHasMore, setBranchHasMore] = useState(false);
  const [busy, setBusy] = useState(true);
  const [oauthPending, setOauthPending] = useState(false);
  const [error, setError] = useState<string>();
  const oauthAbort = useRef<AbortController | undefined>(undefined);
  const oauthAttempt = useRef<string | undefined>(undefined);
  const connectTrigger = useRef<HTMLButtonElement>(null);
  const catalogGeneration = useRef(0);

  const connection = connections.find((item) => item.id === connectionId);
  const installation = installations.find((item) => String(item.id) === installationId);
  const repository = repositories.find((item) => String(item.id) === repositoryId);
  const branch = branches.find((item) => item.name === branchName);

  const loadConnections = useCallback(async (): Promise<void> => {
    setBusy(true);
    setError(undefined);
    try {
      const found = await githubConnections.list();
      catalogGeneration.current += 1;
      setConnections(found);
      setConnectionId((current) => (found.some((item) => item.id === current) ? current : (found[0]?.id ?? '')));
    } catch (error) {
      setError(githubErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (sessionPending || session === null || session === undefined) {
      return;
    }
    // async-iife: bootstrap -- the component cleanup aborts any desktop OAuth poll.
    void loadConnections();
    return () => {
      oauthAbort.current?.abort();
    };
  }, [loadConnections, session, sessionPending]);

  useEffect(() => {
    if (connectionId === '') {
      setInstallations([]);
      setInstallationId('');
      setRepositories([]);
      setRepositoryId('');
      setRepositoryHasMore(false);
      return;
    }
    let active = true;
    setBusy(true);
    setInstallationId('');
    setRepositories([]);
    setRepositoryId('');
    setRepositoryHasMore(false);
    setBranches([]);
    setBranchName('');
    setBranchHasMore(false);
    const loadInstallations = async (): Promise<void> => {
      try {
        const first = await githubConnections.installations(connectionId);
        const all = [...first.installations];
        for (let page = 2; all.length < first.totalCount; page += 1) {
          // oxlint-disable-next-line no-await-in-loop -- GitHub pagination is an ordered cursor.
          const next = await githubConnections.installations(connectionId, page);
          all.push(...next.installations.filter((candidate) => !all.some((item) => item.id === candidate.id)));
          if (next.installations.length === 0) {
            break;
          }
        }
        if (!active) {
          return;
        }
        const found = all.toSorted(byAccount);
        catalogGeneration.current += 1;
        setInstallations(found);
        setInstallationId(found[0] === undefined ? '' : String(found[0].id));
        setBusy(false);
      } catch (error) {
        if (active) {
          setError(githubErrorMessage(error));
          setBusy(false);
        }
      }
    };
    // async-iife: bootstrap -- effect cleanup fences stale account results.
    void loadInstallations();
    return () => {
      active = false;
    };
  }, [connectionId]);

  useEffect(() => {
    if (connectionId === '' || installationId === '') {
      setRepositories([]);
      setRepositoryHasMore(false);
      return;
    }
    let active = true;
    setBusy(true);
    const loadRepositories = async (): Promise<void> => {
      try {
        const result = await githubConnections.repositories(connectionId, Number(installationId));
        if (!active) {
          return;
        }
        const contentsWritable = installation?.permissions['contents'] === 'write';
        setRepositories(
          result.repositories.map((repository_) =>
            repository_.access === 'write' && !contentsWritable ? { ...repository_, access: 'read' } : repository_,
          ),
        );
        setRepositoryHasMore(result.repositories.length > 0 && result.repositories.length < result.totalCount);
        setRepositoryPage(1);
        setRepositoryId('');
        setBranches([]);
        setBranchName('');
        setBranchHasMore(false);
        setBusy(false);
      } catch (error) {
        if (active) {
          setError(githubErrorMessage(error));
          setBusy(false);
        }
      }
    };
    // async-iife: bootstrap -- effect cleanup fences stale installation results.
    void loadRepositories();
    return () => {
      active = false;
    };
  }, [connectionId, installation, installationId]);

  useEffect(() => {
    if (connectionId === '' || repository === undefined) {
      setBranches([]);
      setBranchHasMore(false);
      return;
    }
    let active = true;
    setBusy(true);
    const loadBranches = async (): Promise<void> => {
      try {
        const result = await githubConnections.branches(connectionId, repository.id);
        let found: readonly GithubBranch[] =
          result.branches.length === 0 ? [{ name: repository.defaultBranch }] : result.branches;
        /* D14: pages are alphabetical, so the default branch may lie beyond the first one. */
        if (!found.some((item) => item.name === repository.defaultBranch)) {
          const resolved = await githubConnections
            .branch(connectionId, repository.id, repository.defaultBranch)
            .catch((error: unknown) => {
              if (error instanceof GithubRequestError && error.status === 404) {
                return undefined;
              }
              throw error;
            });
          found = resolved === undefined ? found : [resolved, ...found];
        }
        if (!active) {
          return;
        }
        setBranches(found);
        setBranchPage(1);
        setBranchHasMore(result.branches.length === 100);
        setBranchName(
          found.some((item) => item.name === repository.defaultBranch)
            ? repository.defaultBranch
            : (found[0]?.name ?? ''),
        );
        setBusy(false);
      } catch (error) {
        if (active) {
          setError(githubErrorMessage(error));
          setBusy(false);
        }
      }
    };
    // async-iife: bootstrap -- effect cleanup fences stale repository results.
    void loadBranches();
    return () => {
      active = false;
    };
  }, [connectionId, repository]);

  const connect = useCallback(async (): Promise<void> => {
    setBusy(true);
    setError(undefined);
    const abort = new AbortController();
    try {
      const started = await githubConnections.start(returnTo, isDesktopTarget ? 'desktop-poll' : 'browser');
      oauthAttempt.current = started.attemptId;
      globalThis.location.assign(started.authorizationUrl);
      if (!isDesktopTarget) {
        return;
      }
      oauthAbort.current?.abort();
      oauthAbort.current = abort;
      setOauthPending(true);
      const expiresAt = Date.now() + 10 * 60_000;
      while (!abort.signal.aborted && Date.now() < expiresAt) {
        try {
          // oxlint-disable-next-line no-await-in-loop -- completion appears only after the external-browser callback.
          await githubConnections.complete(started.attemptId);
          // oxlint-disable-next-line no-await-in-loop -- completion refresh belongs to the successful poll iteration.
          await loadConnections();
          return;
        } catch (error) {
          /* D7: only "not back from GitHub yet" is worth another poll; a denied or failed callback ends it. */
          if (!(error instanceof GithubRequestError && error.code === 'GITHUB_COMPLETION_PENDING')) {
            throw error;
          }
        }
        // oxlint-disable-next-line no-await-in-loop -- bounded OAuth completion polling.
        await new Promise<void>((resolve) => {
          globalThis.setTimeout(resolve, 1500);
        });
      }
      if (!abort.signal.aborted) {
        setError(githubErrorMessage({ code: 'GITHUB_COMPLETION_EXPIRED' }));
        setBusy(false);
      }
    } catch (error) {
      if (abort.signal.aborted) {
        return;
      }
      setError(githubErrorMessage(error));
      setBusy(false);
    } finally {
      oauthAttempt.current = undefined;
      setOauthPending(false);
    }
  }, [loadConnections, returnTo]);

  useEffect(() => {
    if (!shouldConnect || busy || connectionAvailable === false) {
      return;
    }
    onConnectRequestHandled?.();
    void connect();
  }, [busy, connect, shouldConnect, connectionAvailable, onConnectRequestHandled]);

  const cancelOauth = useCallback(async (): Promise<void> => {
    const attemptId = oauthAttempt.current;
    oauthAbort.current?.abort();
    oauthAbort.current = undefined;
    oauthAttempt.current = undefined;
    setOauthPending(false);
    setBusy(false);
    globalThis.queueMicrotask(() => {
      connectTrigger.current?.focus();
    });
    if (attemptId !== undefined) {
      try {
        await githubConnections.cancel(attemptId);
      } catch (error) {
        setError(githubErrorMessage(error));
      }
    }
  }, []);

  const refreshCatalog = useCallback(async (): Promise<void> => {
    catalogGeneration.current += 1;
    setConnectionId('');
    await loadConnections();
  }, [loadConnections]);

  const configure = useCallback(async (): Promise<void> => {
    setBusy(true);
    setError(undefined);
    try {
      const configuration = await githubConnections.configuration();
      if (!isDesktopTarget) {
        /* D16d: GitHub returns to the App's Setup URL (/github/complete) with no Tau state. */
        githubSetupReturn.remember(returnTo);
      }
      globalThis.location.assign(configuration.installUrl);
      if (isDesktopTarget) {
        setBusy(false);
      }
    } catch (error) {
      setError(githubErrorMessage(error));
      setBusy(false);
    }
  }, [returnTo]);

  const disconnect = useCallback(async (): Promise<void> => {
    if (connection === undefined) {
      return;
    }
    setDisconnectOpen(false);
    setBusy(true);
    setError(undefined);
    try {
      await githubConnections.remove(connection.id);
      await refreshCatalog();
    } catch (error) {
      setError(githubErrorMessage(error));
      setBusy(false);
    }
  }, [connection, refreshCatalog]);

  const loadMoreRepositories = useCallback(async (): Promise<void> => {
    if (connectionId === '' || installation === undefined || !repositoryHasMore) {
      return;
    }
    setBusy(true);
    const generation = catalogGeneration.current;
    try {
      const nextPage = repositoryPage + 1;
      const result = await githubConnections.repositories(connectionId, installation.id, nextPage);
      if (generation !== catalogGeneration.current) {
        return;
      }
      const contentsWritable = installation.permissions['contents'] === 'write';
      const found: readonly GithubRepository[] = result.repositories.map((repository_) =>
        repository_.access === 'write' && !contentsWritable ? { ...repository_, access: 'read' } : repository_,
      );
      const combined = [
        ...repositories,
        ...found.filter((candidate) => !repositories.some((item) => item.id === candidate.id)),
      ];
      setRepositories(combined);
      setRepositoryPage(nextPage);
      setRepositoryHasMore(result.repositories.length > 0 && combined.length < result.totalCount);
    } catch (error) {
      if (generation !== catalogGeneration.current) {
        return;
      }
      setError(githubErrorMessage(error));
    } finally {
      if (generation === catalogGeneration.current) {
        setBusy(false);
      }
    }
  }, [connectionId, installation, repositories, repositoryHasMore, repositoryPage]);

  const loadMoreBranches = useCallback(async (): Promise<void> => {
    if (connectionId === '' || repository === undefined || !branchHasMore) {
      return;
    }
    setBusy(true);
    const generation = catalogGeneration.current;
    try {
      const nextPage = branchPage + 1;
      const result = await githubConnections.branches(connectionId, repository.id, nextPage);
      if (generation !== catalogGeneration.current) {
        return;
      }
      setBranches((current) => [
        ...current,
        ...result.branches.filter((candidate) => !current.some((item) => item.name === candidate.name)),
      ]);
      setBranchPage(nextPage);
      setBranchHasMore(result.branches.length === 100);
    } catch (error) {
      if (generation !== catalogGeneration.current) {
        return;
      }
      setError(githubErrorMessage(error));
    } finally {
      if (generation === catalogGeneration.current) {
        setBusy(false);
      }
    }
  }, [branchHasMore, branchPage, connectionId, repository]);

  const choose = useCallback(async (): Promise<void> => {
    if (connection === undefined || installation === undefined || repository === undefined || branch === undefined) {
      return;
    }
    setBusy(true);
    setError(undefined);
    let tree: { readonly files: readonly GithubTreeFile[]; readonly manifestBase64?: string | undefined };
    try {
      tree =
        branch.head === undefined
          ? { files: [] }
          : await githubConnections.tree(connection.id, repository.id, branch.head);
    } catch (error) {
      setError(githubErrorMessage(error));
      setBusy(false);
      return;
    }
    try {
      const manifest =
        tree.manifestBase64 === undefined
          ? undefined
          : Uint8Array.from(globalThis.atob(tree.manifestBase64), (character) => character.codePointAt(0) ?? 0);
      await onSelect({
        connection,
        installation,
        repository,
        branch,
        files: tree.files,
        ...(manifest === undefined ? {} : { manifest }),
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'The selected repository could not be prepared.');
    } finally {
      setBusy(false);
    }
  }, [branch, connection, installation, onSelect, repository]);

  const connectionGroups = useMemo(() => [{ name: 'GitHub accounts', items: [...connections] }], [connections]);
  const installationGroups = useMemo(
    () => [
      { name: 'Personal', items: installations.filter((item) => item.owner.type.toLowerCase() !== 'organization') },
      {
        name: 'Organizations',
        items: installations.filter((item) => item.owner.type.toLowerCase() === 'organization'),
      },
    ],
    [installations],
  );
  const repositoryGroups = useMemo(() => [{ name: 'Repositories', items: [...repositories] }], [repositories]);
  const branchGroups = useMemo(() => [{ name: 'Branches', items: [...branches] }], [branches]);

  if (sessionPending) {
    return <p role='status'>Checking GitHub connection…</p>;
  }

  if (session === null || session === undefined) {
    return (
      <div className='flex flex-col gap-3'>
        <p className='text-sm text-muted-foreground'>Sign in to connect GitHub and select a repository.</p>
        <Button asChild className='self-start'>
          <Link to={`/auth/sign-in?redirectTo=${encodeURIComponent(returnTo)}`}>Sign in to connect GitHub</Link>
        </Button>
      </div>
    );
  }

  if (connectionAvailable === false) {
    return (
      <div className='flex flex-col gap-3'>
        <p className='text-sm text-muted-foreground'>
          GitHub connection isn’t set up on this deployment, so private and writable repositories can’t be linked here.
        </p>
        <Button disabled className='self-start'>
          <SvgIcon id='github' aria-hidden className='size-4' /> Connect GitHub
        </Button>
      </div>
    );
  }

  if (!busy && connections.length === 0) {
    return (
      <div className='flex flex-col gap-3'>
        <p className='text-sm text-muted-foreground'>
          Connect a GitHub App installation to browse personal and organization repositories.
        </p>
        <Button ref={connectTrigger} className='self-start' onClick={connect}>
          <SvgIcon id='github' aria-hidden className='size-4' /> Connect GitHub
        </Button>
        {error === undefined ? undefined : (
          <p role='alert' className='text-sm text-destructive'>
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-3' aria-busy={busy}>
      <div className='flex items-end gap-2'>
        <div className='min-w-0 flex-1'>
          <Picker
            label='GitHub account'
            items={connectionGroups}
            value={connection}
            getValue={(item) => item.id}
            render={(item) => item.login}
            onSelect={(value) => {
              catalogGeneration.current += 1;
              setConnectionId(value);
            }}
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              ref={connectTrigger}
              variant='outline'
              size='icon'
              aria-label='GitHub account options'
              disabled={busy}
            >
              <EllipsisVertical aria-hidden className='size-4' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            <DropdownMenuItem onSelect={connect}>Add account</DropdownMenuItem>
            <DropdownMenuItem onSelect={configure}>Configure GitHub access</DropdownMenuItem>
            <DropdownMenuItem
              variant='destructive'
              disabled={connection === undefined}
              onSelect={() => {
                setDisconnectOpen(true);
              }}
            >
              Disconnect {connection?.login ?? 'account'}…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <AlertDialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {connection?.login} from Tau?</AlertDialogTitle>
            <AlertDialogDescription>
              Tau removes this account and asks GitHub to revoke its access. Projects linked through it stop syncing
              until you connect GitHub again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant='destructive' onClick={disconnect}>
              Disconnect
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {connection !== undefined && installations.length === 0 && !busy ? (
        <div className='rounded-md border p-3 text-sm'>
          <p>No personal or organization installation is available for this account.</p>
          <Button className='mt-2' size='sm' variant='outline' onClick={configure}>
            Install Tau on GitHub
          </Button>
        </div>
      ) : undefined}
      <Picker
        label='Personal account or organization'
        items={installationGroups}
        value={installation}
        getValue={(item) => String(item.id)}
        render={(item) => item.owner.login}
        disabledReason={(item) =>
          item.suspended ? 'Suspended on GitHub. An owner must unsuspend the Tau app for this account.' : undefined
        }
        onSelect={(value) => {
          catalogGeneration.current += 1;
          setInstallationId(value);
        }}
      />
      <Picker
        label='Repository'
        items={repositoryGroups}
        value={repository}
        getValue={(item) => String(item.id)}
        getKeywords={(item) => [item.fullName, item.description ?? '']}
        render={(item) =>
          `${item.fullName}${item.visibility === 'public' ? '' : ` · ${item.visibility === 'private' ? 'Private' : 'Internal'}`}${item.archived ? ' · Archived' : ''}${item.disabled ? ' · Disabled' : ''}`
        }
        disabledReason={(item) =>
          item.access === 'unknown' ? "Your GitHub account can't read this repository." : undefined
        }
        isLoadingMore={busy}
        emptyListMessage={repositoryHasMore ? 'Searching remaining repositories…' : 'No repository found'}
        onLoadMore={repositoryHasMore ? loadMoreRepositories : undefined}
        onSelect={(value) => {
          catalogGeneration.current += 1;
          setRepositoryId(value);
        }}
      />
      <Picker
        label='Branch'
        items={branchGroups}
        value={branch}
        getValue={(item) => item.name}
        render={(item) => item.name}
        isLoadingMore={busy}
        emptyListMessage={branchHasMore ? 'Searching remaining branches…' : 'No branch found'}
        onLoadMore={branchHasMore ? loadMoreBranches : undefined}
        onSelect={setBranchName}
      />
      {repository === undefined ? undefined : (
        <p className='flex items-center gap-1.5 text-xs text-muted-foreground'>
          {repository.visibility === 'public' ? undefined : <Lock aria-hidden className='size-3.5' />}
          {repository.access === 'write' ? 'Read and write access' : 'Read-only import'}
        </p>
      )}
      {error === undefined ? undefined : (
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      )}
      <div className='flex flex-wrap gap-2'>
        <Button disabled={busy || branch === undefined} onClick={choose}>
          {actionLabel}
        </Button>
        <Button variant='outline' disabled={busy} onClick={refreshCatalog}>
          <RefreshCw aria-hidden className='size-4' /> Refresh
        </Button>
        {oauthPending ? (
          <Button variant='ghost' onClick={cancelOauth}>
            Cancel connection
          </Button>
        ) : undefined}
      </div>
    </div>
  );
});

function Picker<Item>({
  label,
  items,
  value,
  getValue,
  getKeywords,
  render,
  disabledReason,
  onSelect,
  onLoadMore,
  isLoadingMore,
  emptyListMessage,
}: Readonly<{
  label: string;
  items: Array<{ name: string; items: Item[] }>;
  value: Item | undefined;
  getValue: (item: Item) => string;
  getKeywords?: (item: Item) => readonly string[];
  render: (item: Item) => string;
  /** Why an item can't be chosen; shown beside it (D17). */
  disabledReason?: (item: Item) => string | undefined;
  onSelect: (value: string) => void;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  emptyListMessage?: string;
}>): React.JSX.Element {
  const labelId = useId();
  const triggerId = useId();
  return (
    <div className='flex flex-col gap-1.5'>
      <span id={labelId} className='text-sm font-medium'>
        {label}
      </span>
      <ComboBoxResponsive
        groupedItems={items}
        value={value}
        getValue={getValue}
        getKeywords={getKeywords}
        renderLabel={(item) => {
          const reason = disabledReason?.(item);
          return reason === undefined ? (
            <span className='truncate'>{render(item)}</span>
          ) : (
            <span className='flex min-w-0 flex-col'>
              <span className='truncate'>{render(item)}</span>
              <span className='text-xs text-muted-foreground'>{reason}</span>
            </span>
          );
        }}
        isDisabled={disabledReason === undefined ? undefined : (item) => disabledReason(item) !== undefined}
        title={`Select ${label}`}
        description={`Choose ${label.toLowerCase()}`}
        placeholder={`Select ${label.toLowerCase()}…`}
        searchPlaceHolder={`Search ${label.toLowerCase()}…`}
        emptyListMessage={emptyListMessage ?? `No ${label.toLowerCase()} found`}
        withVirtualization={items.some((group) => group.items.length > 20)}
        className='w-[min(28rem,calc(100vw-2rem))]'
        onLoadMore={onLoadMore}
        isLoadingMore={isLoadingMore}
        onSelect={onSelect}
      >
        <Button
          id={triggerId}
          aria-labelledby={`${labelId} ${triggerId}`}
          variant='outline'
          className='w-full justify-between'
          disabled={items.every((group) => group.items.length === 0)}
        >
          <span className='flex min-w-0 items-center gap-2 truncate'>
            {label === 'Branch' ? <GitBranch aria-hidden className='size-4 shrink-0' /> : undefined}
            {value === undefined ? `Select ${label.toLowerCase()}…` : render(value)}
          </span>
          <ChevronDown aria-hidden className='size-4 shrink-0' />
        </Button>
      </ComboBoxResponsive>
    </div>
  );
}
