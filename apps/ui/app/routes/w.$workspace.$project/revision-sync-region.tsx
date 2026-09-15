import { useEffect, useState } from 'react';
import { AlertTriangle, Cloud, CloudOff, GitBranch } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { Input } from '@taucad/ui/components/input';
import { Label } from '@taucad/ui/components/label';
import { RadioGroup, RadioGroupItem } from '@taucad/ui/components/radio-group';
import { cn } from '@taucad/ui/utils/cn';
import { gitRemoteUrlProblem } from '@taucad/revisions';
import type { RemoteFacet, SyncFacet } from '@taucad/revisions';
import { GithubRepositoryPicker } from '#components/github/github-repository-picker.js';
import type { GithubRepositorySelection } from '#components/github/github-repository-picker.js';
import { githubConnections } from '#lib/github-connections.js';
import { formatBytes } from '#lib/format-bytes.js';
import { ENV } from '#environment.config.js';
import { Spinner } from '#components/ui/spinner.js';
import { Switch } from '@taucad/ui/components/switch';

/** Which remote a person can pick. @public */
export type RemoteChoice = 'none' | 'tau' | 'git';

type PendingConnection =
  | Readonly<{ kind: 'tau' }>
  | Readonly<{ kind: 'git'; url: string }>
  | Readonly<{ kind: 'github'; selection: GithubRepositorySelection }>;

export type RevisionSyncRegionProps = {
  /** The remote facet from the project's `RevisionStatus` projection. */
  readonly remote: RemoteFacet;
  /**
   * Whether this project is backed up, from the same projection (S26, W13).
   *
   * Settled values only, and the row says the same thing the header chip says —
   * one facet, two renderers, because two readers of two sources would
   * eventually disagree in front of the person.
   */
  readonly sync: SyncFacet;
  readonly onConnect: (
    kind: RemoteChoice,
    url?: string,
    options?: Readonly<{
      authorization?: string;
      provider?: 'github';
      repositoryId?: string;
      connectionId?: string;
      generation?: number;
      fetchOnly?: boolean;
    }>,
  ) => void | Promise<void>;
  readonly onDisconnect: () => void;
  readonly onCancel: () => void;
  readonly onSync: () => void;
  readonly syncChats: boolean;
  readonly onSyncChatsChange: (enabled: boolean) => void;
  readonly className?: string;
};

/**
 * The Sync row's own sentence (S26).
 *
 * Four states and a count, because "how much of my work is not on the server"
 * is the only question this row answers. `Checking…` is the open pull's first
 * window; after it the row says what this device actually knows rather than
 * holding a spinner over a pull that is still running.
 *
 * @param sync - The settled sync facet.
 * @returns What the row reads, or `undefined` when there is nothing to say.
 */
const syncCopy = (sync: SyncFacet): string | undefined => {
  switch (sync.state) {
    case 'noRemote': {
      return undefined;
    }
    case 'checking': {
      return 'Checking…';
    }
    case 'backedUp': {
      return 'Backed up';
    }
    case 'pending': {
      return sync.pendingCount > 0
        ? `Backing up… ${String(sync.pendingCount)} revision${sync.pendingCount === 1 ? '' : 's'}`
        : 'Backing up…';
    }
    case 'conflicted': {
      return 'Needs resolution';
    }
    default: {
      /* `queued` and `failed` read the same to a person: their work is not on
       * the server. What differs is whether this device will retry by itself,
       * which the offline line below says. */
      return sync.pendingCount > 0
        ? `Not backed up · ${String(sync.pendingCount)} revision${sync.pendingCount === 1 ? '' : 's'}`
        : 'Not backed up';
    }
  }
};

const connectingCopy = (remote: RemoteFacet): string =>
  remote.phase === 'disconnecting'
    ? 'Disconnecting…'
    : remote.kind === 'tau'
      ? 'Connecting to Tau Cloud…'
      : 'Connecting…';

const gitRemoteLabel = (url: string | undefined, github = false): string => {
  if (url === undefined) return github ? 'GitHub repository' : 'Git remote';
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/^\/+|\/+$/gu, '').replace(/\.git$/u, '');
    return github && path !== '' ? path : parsed.host;
  } catch {
    return github ? 'GitHub repository' : 'Git remote';
  }
};

/**
 * What Tau is about to ask for, in the words of the thing being asked (A18).
 *
 * The sentence is written before the consent screen appears, never after, and
 * it names the authority rather than the mechanism: a person deciding whether
 * to grant `repo` is deciding whether Tau may read their private repositories.
 *
 * @returns The sentence to show under the field.
 */
const authoritySentence = (): string =>
  'Advanced HTTPS remotes are anonymous. Use the GitHub picker above for private or writable repositories.';

/**
 * The *Git remote* half of the choice: an address, a visibility, and what
 * connecting will ask GitHub for.
 *
 * Its own component because the region is the one file W13 also edits, and a
 * self-contained block is the difference between two lanes reading one
 * 29-branch function and two small ones (review R12).
 *
 * @param props - The address so far, the visibility, and the three callbacks.
 * @returns The form.
 */
function GitRemoteForm({
  url,
  onUrlChange,
  onConnect,
}: {
  readonly url: string;
  readonly onUrlChange: (url: string) => void;
  readonly onConnect: () => void;
}): React.JSX.Element {
  /* P50: what this deployment allows, read from the page's own environment —
   * the server never tells the page to relax a client-side guard. */
  const allowPrivate = ENV.TAU_GIT_REMOTE_ALLOW_PRIVATE;
  const problem = url === '' ? undefined : gitRemoteUrlProblem(url, { allowPrivate });
  return (
    <div className='flex flex-col gap-2'>
      <Label htmlFor='remote-git-url' className='text-sm font-normal'>
        Repository address
      </Label>
      <Input
        id='remote-git-url'
        type='url'
        inputMode='url'
        placeholder='https://github.com/owner/repository.git'
        value={url}
        aria-describedby='remote-git-authority'
        aria-invalid={problem === undefined ? undefined : true}
        onChange={(event) => {
          onUrlChange(event.target.value);
        }}
      />
      <p id='remote-git-authority' className='text-xs text-muted-foreground'>
        {authoritySentence()}
      </p>
      {/*
        Large objects do not cross this wire, and the port refuses the push by
        name before anything is offered (P20). Saying so here is the difference
        between a person choosing Tau Cloud now and meeting `LFS_REMOTE_UNSUPPORTED`
        at the first push.
      */}
      <p className='text-xs text-muted-foreground'>
        GitHub repositories selected above use their Git LFS storage. Other hosts may reject large files.
      </p>
      {problem === undefined ? undefined : (
        <p role='alert' className='text-sm'>
          {problem}
        </p>
      )}
      <Button size='sm' className='self-start' disabled={url === '' || problem !== undefined} onClick={onConnect}>
        Connect
      </Button>
    </div>
  );
}

/**
 * *Sync* — the fourth region of the Revisions pane (S26, S34, S35).
 *
 * Presentational on purpose: it takes the projection's remote facet and three
 * callbacks, so the pane can render it, a test can script it, and nothing here
 * mounts a revision actor (which is what made earlier revision components hang
 * in jsdom). The one thing it does own is the GitHub consent window, because a
 * browser blocks a pop-up that is opened after an `await` — so it has to be
 * opened inside the click, which only the component can do.
 *
 * The copy names the authority a connection asks for before it asks (A18), the
 * storage row reads as a plan rather than as LFS (EQ7), and a refused push
 * names the files rather than a number (D16).
 *
 * @param props - The facet and the three verbs.
 * @returns The Sync region.
 */
export function RevisionSyncRegion({
  remote,
  sync,
  onConnect,
  onDisconnect,
  onCancel,
  onSync,
  syncChats,
  onSyncChatsChange,
  className,
}: RevisionSyncRegionProps): React.JSX.Element {
  const busy = remote.phase === 'connecting' || remote.phase === 'disconnecting';
  /* The radio is a *choice*, and picking *Git remote* asks a question rather
   * than connecting: there is no remote until an address has been typed. Until
   * somebody picks, the projection is the answer — so a reopened project shows
   * what it is actually connected to. */
  const [picked, setChoice] = useState<RemoteChoice | undefined>(undefined);
  const choice = picked ?? remote.kind;
  const [url, setUrl] = useState(remote.kind === 'git' ? (remote.url ?? '') : '');
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [pendingConnection, setPendingConnection] = useState<PendingConnection>();
  const [changingBackup, setChangingBackup] = useState(remote.phase !== 'connected');
  const syncState = syncCopy(sync);
  const [connectionError, setConnectionError] = useState<string | undefined>(undefined);
  const percentage =
    remote.storage === undefined || remote.storage.quota <= 0
      ? 0
      : Math.min((remote.storage.used / remote.storage.quota) * 100, 100);

  useEffect(() => {
    if (remote.phase === 'connected') {
      setChangingBackup(false);
      setChoice(undefined);
    }
  }, [remote.phase]);

  const connectedLabel = remote.kind === 'tau' ? 'Tau Cloud' : gitRemoteLabel(remote.url, remote.provider === 'github');
  const pendingLabel =
    pendingConnection?.kind === 'tau'
      ? 'Tau Cloud'
      : pendingConnection?.kind === 'github'
        ? (pendingConnection.selection.repository.fullName ??
          gitRemoteLabel(pendingConnection.selection.repository.cloneUrl, true))
        : pendingConnection?.kind === 'git'
          ? gitRemoteLabel(pendingConnection.url)
          : undefined;

  const commitConnection = async (pending: PendingConnection): Promise<void> => {
    setConnectionError(undefined);
    try {
      if (pending.kind === 'tau') {
        await onConnect('tau');
      } else if (pending.kind === 'git') {
        await onConnect('git', pending.url);
      } else {
        const { selection } = pending;
        const token = await githubConnections.token(selection.connection.id);
        const authorization = `Basic ${globalThis.btoa(`x-access-token:${token.accessToken}`)}`;
        await onConnect('git', selection.repository.cloneUrl, {
          authorization,
          provider: 'github',
          repositoryId: String(selection.repository.id),
          connectionId: selection.connection.id,
          generation: token.generation,
          fetchOnly: selection.repository.access !== 'write',
        });
      }
      setPendingConnection(undefined);
      setChangingBackup(false);
      setChoice(undefined);
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : 'The backup could not be connected.');
    }
  };

  const requestConnection = async (pending: PendingConnection): Promise<void> => {
    const same =
      pending.kind === 'tau'
        ? remote.kind === 'tau'
        : pending.kind === 'github'
          ? remote.kind === 'git' &&
            remote.provider === 'github' &&
            remote.repositoryId === String(pending.selection.repository.id)
          : remote.kind === 'git' && remote.provider === undefined && remote.url === pending.url;
    if (same) {
      setChangingBackup(false);
      setChoice(undefined);
      return;
    }
    if (remote.phase === 'connected' && remote.kind !== 'none') {
      setPendingConnection(pending);
      return;
    }
    await commitConnection(pending);
  };

  const selectRemote = (value: string): void => {
    const next = value as RemoteChoice;
    setPendingConnection(undefined);
    setChoice(next);
  };

  const applyRemote = async (): Promise<void> => {
    if (choice === 'git') return;
    if (choice === 'none' && remote.kind !== 'none') {
      setConfirmingDisconnect(true);
      return;
    }
    if (choice === 'none') return;
    await requestConnection({ kind: 'tau' });
  };

  return (
    <section aria-labelledby='revision-sync-heading' className={cn('flex flex-col gap-3', className)}>
      <h3 id='revision-sync-heading' className='text-xs font-medium text-muted-foreground'>
        Sync
      </h3>

      {remote.phase === 'connected' && !changingBackup ? (
        <div className='flex flex-wrap items-center gap-2 rounded-md border bg-card p-2'>
          {remote.kind === 'tau' ? (
            <Cloud aria-hidden className='size-4 text-muted-foreground' />
          ) : (
            <GitBranch aria-hidden className='size-4 text-muted-foreground' />
          )}
          <span className='min-w-0 flex-1 text-sm'>{connectedLabel}</span>
          {remote.fetchOnly ? <span className='text-xs text-muted-foreground'>Read only</span> : null}
          {remote.kind === 'tau' ? (
            <span className='flex items-center gap-2'>
              <Switch aria-label='Sync chats' checked={syncChats} onCheckedChange={onSyncChatsChange} />
              <span className='text-xs'>Sync chats</span>
            </span>
          ) : null}
          {remote.fetchOnly ? null : (
            <Button variant='outline' size='sm' onClick={onSync}>
              Sync now
            </Button>
          )}
          <Button
            variant='ghost'
            size='sm'
            onClick={() => {
              setPendingConnection(undefined);
              setChoice(remote.kind);
              setChangingBackup(true);
            }}
          >
            Change backup
          </Button>
        </div>
      ) : (
        <RadioGroup
          aria-label='Where this project syncs'
          value={choice}
          disabled={busy}
          onValueChange={selectRemote}
          className='gap-2'
        >
          <div className='flex items-center gap-2'>
            <RadioGroupItem id='remote-none' value='none' />
            <CloudOff aria-hidden className='size-4 shrink-0 text-muted-foreground' />
            <Label htmlFor='remote-none' className='font-normal'>
              No remote
            </Label>
          </div>
          <div className='flex items-center gap-2'>
            <RadioGroupItem id='remote-tau' value='tau' />
            <Cloud aria-hidden className='size-4 shrink-0 text-muted-foreground' />
            <Label htmlFor='remote-tau' className='font-normal'>
              Tau Cloud
            </Label>
          </div>
          <div className='flex items-center gap-2'>
            <RadioGroupItem id='remote-git' value='git' />
            <GitBranch aria-hidden className='size-4 shrink-0 text-muted-foreground' />
            <Label htmlFor='remote-git' className='font-normal'>
              Git remote
            </Label>
          </div>
        </RadioGroup>
      )}

      {changingBackup && choice === 'tau' ? (
        <p className='text-xs text-muted-foreground'>Files and history are backed up to your Tau account.</p>
      ) : null}

      {changingBackup && choice === 'tau' ? (
        <div className='flex items-center gap-2 rounded-md border bg-card p-2'>
          <Switch aria-label='Sync chats' id='sync-chats' checked={syncChats} onCheckedChange={onSyncChatsChange} />
          <Label htmlFor='sync-chats' className='flex-1 font-normal'>
            <span className='block text-sm'>Sync chats</span>
            <span className='block text-xs text-muted-foreground'>
              Included by default; turn off before connecting to keep chats on this device.
            </span>
          </Label>
        </div>
      ) : null}

      {changingBackup && choice !== 'git' ? (
        <div className='flex flex-wrap gap-2'>
          <Button
            size='sm'
            disabled={remote.kind === 'none' && choice === 'none'}
            onClick={() => {
              void applyRemote();
            }}
          >
            {remote.kind === 'none' ? 'Connect backup' : 'Apply backup change'}
          </Button>
          {remote.phase === 'connected' ? (
            <Button
              size='sm'
              variant='ghost'
              onClick={() => {
                setChoice(undefined);
                setChangingBackup(false);
              }}
            >
              Cancel
            </Button>
          ) : null}
        </div>
      ) : null}

      {changingBackup && choice === 'git' && !busy ? (
        <div className='flex flex-col gap-4'>
          <GithubRepositoryPicker
            actionLabel='Connect repository'
            returnTo={globalThis.location.pathname}
            onSelect={async (selection) => requestConnection({ kind: 'github', selection })}
          />
          <details>
            <summary className='text-sm text-muted-foreground'>Advanced HTTPS remote</summary>
            <div className='mt-3'>
              <GitRemoteForm
                url={url}
                onUrlChange={setUrl}
                onConnect={() => {
                  void requestConnection({ kind: 'git', url });
                }}
              />
            </div>
          </details>
          {remote.phase === 'connected' ? (
            <Button
              variant='ghost'
              size='sm'
              className='self-start'
              onClick={() => {
                setChoice(undefined);
                setPendingConnection(undefined);
                setChangingBackup(false);
              }}
            >
              Keep current repository
            </Button>
          ) : undefined}
        </div>
      ) : undefined}

      {busy ? (
        <div role='status' aria-busy='true' className='flex items-center gap-2 text-sm'>
          {/* The region's own `status` carries the message; the glyph is decoration. */}
          <Spinner role={undefined} aria-hidden aria-label={undefined} className='size-4' />
          <span>{connectingCopy(remote)}</span>
          {remote.phase === 'connecting' ? (
            <Button variant='ghost' size='sm' onClick={onCancel}>
              Cancel
            </Button>
          ) : undefined}
        </div>
      ) : undefined}

      {/*
        Whether this project is backed up, and how much is not (S26, S41, AC21).

        A `status` live region rather than prose, because it changes on its own:
        a person who has just closed a tab and reopened it wants to be told, not
        to go looking. `Not backed up` is never silent and never a spinner — the
        count is the whole of what they can act on.
      */}
      {syncState === undefined ? undefined : (
        <div role='status' className='flex items-center gap-2 text-sm'>
          {sync.state === 'conflicted' || sync.state === 'failed' || sync.state === 'queued' ? (
            <AlertTriangle aria-hidden className='size-4 shrink-0 text-destructive' />
          ) : (
            <Cloud aria-hidden className='size-4 shrink-0 text-muted-foreground' />
          )}
          <span className='tabular-nums'>{syncState}</span>
          {sync.online ? undefined : <span className='text-xs text-muted-foreground'>Offline</span>}
        </div>
      )}

      {remote.phase === 'connected' && !changingBackup && remote.url !== undefined && remote.kind === 'git' ? (
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <details className='min-w-0 flex-1'>
            <summary className='cursor-pointer text-xs text-muted-foreground'>Connection details</summary>
            {remote.provider === 'github' ? (
              <span className='block text-xs font-medium'>GitHub repository</span>
            ) : undefined}
            <span className='block truncate font-mono text-xs text-muted-foreground'>{remote.url}</span>
            {remote.fetchOnly ? (
              <span className='block text-xs text-muted-foreground'>Read-only link · Tau will not push</span>
            ) : undefined}
          </details>
          {confirmingDisconnect ? undefined : (
            <span className='flex shrink-0 items-center gap-1'>
              {remote.provider === 'github' ? (
                <>
                  <Button asChild variant='ghost' size='sm'>
                    <a href={remote.url.replace(/\.git$/u, '')} target='_blank' rel='noreferrer'>
                      Open GitHub
                    </a>
                  </Button>
                </>
              ) : undefined}
            </span>
          )}
        </div>
      ) : undefined}

      {confirmingDisconnect && remote.phase === 'connected' ? (
        <div className='flex flex-col gap-2'>
          <p className='text-sm'>{`Disconnect ${connectedLabel}? Every revision stays on this device.`}</p>
          <div className='flex flex-wrap items-center gap-2'>
            <Button
              size='sm'
              variant='destructive'
              /* The button the click came from unmounts, so focus would fall to
               * `<body>` without this (review R15). */
              autoFocus
              onClick={() => {
                setConfirmingDisconnect(false);
                setChoice('none');
                onDisconnect();
              }}
            >
              {`Disconnect ${connectedLabel}`}
            </Button>
            <Button
              size='sm'
              variant='ghost'
              onClick={() => {
                setConfirmingDisconnect(false);
                setChoice(undefined);
                setChangingBackup(false);
              }}
            >
              Keep it
            </Button>
          </div>
        </div>
      ) : undefined}

      {pendingConnection === undefined || pendingLabel === undefined ? null : (
        <div className='flex flex-col gap-2'>
          <p className='text-sm'>{`Replace ${connectedLabel} with ${pendingLabel}? Every revision stays on this device.`}</p>
          <div className='flex flex-wrap items-center gap-2'>
            <Button
              autoFocus
              size='sm'
              onClick={() => {
                void commitConnection(pendingConnection);
              }}
            >
              Replace backup
            </Button>
            <Button
              size='sm'
              variant='ghost'
              onClick={() => {
                setPendingConnection(undefined);
              }}
            >
              Keep current backup
            </Button>
          </div>
        </div>
      )}

      {/*
        The credential, not the remote (charter W12). An `AUTH_SECRET` rotation
        leaves the address, the history and the intent exactly right and only
        the stored GitHub token unreadable, so this row asks for the one thing
        that fixes it rather than reporting a failed push.
      */}
      {remote.phase === 'reconnectRequired' ? (
        <div className='flex flex-col gap-2'>
          <p role='alert' className='flex items-center gap-2 text-sm'>
            <AlertTriangle aria-hidden className='size-4 shrink-0 text-destructive' />
            <span>{remote.error ?? 'Your GitHub connection needs to be renewed.'}</span>
          </p>
          <Button
            size='sm'
            className='self-start'
            onClick={() => {
              setChoice('git');
            }}
          >
            Reconnect GitHub
          </Button>
        </div>
      ) : undefined}

      {connectionError === undefined ? undefined : (
        <p role='alert' className='flex items-center gap-2 text-sm'>
          <AlertTriangle aria-hidden className='size-4 shrink-0 text-destructive' />
          <span>{connectionError}</span>
        </p>
      )}

      {remote.storage === undefined ? undefined : (
        <div className='flex flex-col gap-1.5'>
          <p className='text-sm tabular-nums'>
            {formatBytes(remote.storage.used)} of {formatBytes(remote.storage.quota)}
          </p>
          <div
            role='meter'
            aria-label='Storage used against your plan'
            aria-valuenow={Math.round(percentage)}
            aria-valuemin={0}
            aria-valuemax={100}
            className='h-2 w-full overflow-hidden rounded-full bg-muted'
          >
            <div className='h-full rounded-full bg-primary' style={{ width: `${percentage.toFixed(1)}%` }} />
          </div>
        </div>
      )}

      {remote.overQuota.length > 0 ? (
        <div className='flex flex-col gap-1.5'>
          <p className='flex items-center gap-2 text-sm'>
            <AlertTriangle aria-hidden className='size-4 shrink-0 text-destructive' />
            <span>These files are over your plan and were not backed up:</span>
          </p>
          <ul className='flex flex-col gap-1'>
            {remote.overQuota.map((path) => (
              <li key={path} className='truncate font-mono text-xs text-muted-foreground'>
                {path}
              </li>
            ))}
          </ul>
        </div>
      ) : undefined}

      {remote.phase === 'failed' && remote.error !== undefined ? (
        <p role='alert' className='flex items-center gap-2 text-sm'>
          <AlertTriangle aria-hidden className='size-4 shrink-0 text-destructive' />
          <span>{remote.error}</span>
        </p>
      ) : undefined}
    </section>
  );
}
