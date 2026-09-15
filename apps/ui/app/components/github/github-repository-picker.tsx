/* oxlint-disable react/set-state-in-effect -- these effects synchronize paged GitHub catalog state. */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, GitBranch, Lock, RefreshCw } from 'lucide-react';
import { useSession } from '@better-auth-ui/react';
import { Link } from 'react-router';
import { Button } from '@taucad/ui/components/button';
import { SvgIcon } from '#components/icons/svg-icon.js';
import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';
import { githubConnections } from '#lib/github-connections.js';
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
}>;

const byAccount = (left: GithubInstallation, right: GithubInstallation): number => {
  const leftOrganization = left.owner.type.toLowerCase() === 'organization';
  const rightOrganization = right.owner.type.toLowerCase() === 'organization';
  return Number(leftOrganization) - Number(rightOrganization) || left.owner.login.localeCompare(right.owner.login);
};

export const GithubRepositoryPicker = memo(function GithubRepositoryPicker({
  onSelect,
  actionLabel = 'Use repository',
  returnTo = '/import',
}: GithubRepositoryPickerProps): React.JSX.Element {
  const { data: session, isPending: sessionPending } = useSession(authClient);
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
      setError(error instanceof Error ? error.message : 'GitHub connections could not be loaded.');
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
          setError(error instanceof Error ? error.message : 'GitHub installations could not be loaded.');
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
          setError(error instanceof Error ? error.message : 'Repositories could not be loaded.');
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
        if (!active) {
          return;
        }
        const found = result.branches.length === 0 ? [{ name: repository.defaultBranch }] : result.branches;
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
          setError(error instanceof Error ? error.message : 'Branches could not be loaded.');
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
    try {
      const started = await githubConnections.start(returnTo, isDesktopTarget ? 'desktop-poll' : 'browser');
      oauthAttempt.current = started.attemptId;
      globalThis.location.assign(started.authorizationUrl);
      if (isDesktopTarget) {
        const abort = new AbortController();
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
          } catch {
            // The pending result does not exist until GitHub returns; retry within the attempt TTL.
          }
          // oxlint-disable-next-line no-await-in-loop -- bounded OAuth completion polling.
          await new Promise<void>((resolve) => {
            globalThis.setTimeout(resolve, 1500);
          });
        }
        if (!abort.signal.aborted) {
          throw new Error('The GitHub connection attempt expired. Try again.');
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      setError(error instanceof Error ? error.message : 'GitHub authorization could not be started.');
      setBusy(false);
    } finally {
      oauthAttempt.current = undefined;
      setOauthPending(false);
    }
  }, [loadConnections, returnTo]);

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
        setError(error instanceof Error ? error.message : 'The GitHub connection attempt could not be cancelled.');
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
    try {
      const configuration = await githubConnections.configuration();
      globalThis.location.assign(configuration.installUrl);
      if (isDesktopTarget) {
        setBusy(false);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'GitHub access could not be configured.');
      setBusy(false);
    }
  }, []);

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
      setError(error instanceof Error ? error.message : 'More repositories could not be loaded.');
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
      setError(error instanceof Error ? error.message : 'More branches could not be loaded.');
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
    try {
      const tree =
        branch.head === undefined
          ? { files: [] as readonly GithubTreeFile[], manifestBase64: undefined }
          : await githubConnections.tree(connection.id, repository.id, branch.head);
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
        disabled={(item) => item.suspended}
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
        disabled={(item) => item.access === 'unknown'}
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
        <Button ref={connectTrigger} variant='ghost' disabled={busy} onClick={connect}>
          Add account
        </Button>
        {oauthPending ? (
          <Button variant='ghost' onClick={cancelOauth}>
            Cancel connection
          </Button>
        ) : undefined}
        <Button variant='ghost' disabled={busy} onClick={configure}>
          Configure GitHub access
        </Button>
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
  disabled,
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
  disabled?: (item: Item) => boolean;
  onSelect: (value: string) => void;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  emptyListMessage?: string;
}>): React.JSX.Element {
  return (
    <div className='flex flex-col gap-1.5'>
      <span className='text-sm font-medium'>{label}</span>
      <ComboBoxResponsive
        groupedItems={items}
        value={value}
        getValue={getValue}
        getKeywords={getKeywords}
        renderLabel={(item) => <span className='truncate'>{render(item)}</span>}
        isDisabled={disabled}
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
