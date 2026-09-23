import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, Cloud, CloudOff, GitBranch } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@taucad/ui/components/button';
import { Input } from '@taucad/ui/components/input';
import { Label } from '@taucad/ui/components/label';
import { RadioGroup, RadioGroupItem } from '@taucad/ui/components/radio-group';
import { cn } from '@taucad/ui/utils/cn';
import { gitRemoteUrlProblem } from '@taucad/revisions';
import type { RemoteFacet, SyncFacet } from '@taucad/revisions';
/* The machine's own subpath: `SyncFailureReason` is not on the package barrel,
   and a second copy of the union here would be exactly the dual vocabulary the
   contract forbids (§3). */
import type { SyncFailureReason } from '@taucad/revisions';
import { CommercialUpgradeLabel } from '#cloud/commercial-features.js';
import { GithubRepositoryPicker } from '#components/github/github-repository-picker.js';
import type { GithubRepositorySelection } from '#components/github/github-repository-picker.js';
import { githubConnections } from '#lib/github-connections.js';
import { formatBytes } from '#lib/format-bytes.js';
import { ENV } from '#environment.config.js';
import { Spinner } from '#components/ui/spinner.js';
import { Switch } from '@taucad/ui/components/switch';
import { RevisionCollaborators } from '#routes/w.$workspace.$project/revision-collaborators.js';
import { isSyncReadOnly } from '#hooks/use-cloud-projects.js';
import type { ProjectAccessRole } from '#hooks/use-cloud-projects.js';

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
  // oxlint-disable-next-line react-js/boolean-prop-naming -- mirrors the persisted project manifest field `syncChats`.
  readonly syncChats: boolean;
  readonly onSyncChatsChange: (enabled: boolean) => void;
  /** EQ7/D16: generated evidence is opt-in, per project, beside *Sync chats*. */
  // oxlint-disable-next-line react-js/boolean-prop-naming -- mirrors the persisted project manifest field `syncLargeExports`.
  readonly syncLargeExports: boolean;
  readonly onSyncLargeExportsChange: (enabled: boolean) => void;
  /**
   * Whether this account may back a project up at all (N4).
   *
   * Read once by the pane from `useCommercialFeatures`, because this component
   * is presentational and a plan is a session fact, not a projection fact. The
   * default is "entitled", which is what a self-host build always answers.
   */
  // oxlint-disable-next-line react-js/boolean-prop-naming -- mirrors the `useCommercialFeatures()` entitlement field.
  readonly canSyncFiles?: boolean;
  // oxlint-disable-next-line react-js/boolean-prop-naming -- mirrors the `useCommercialFeatures()` entitlement field.
  readonly canConnectGitHub?: boolean;
  /** Take a free account to the plan surface; the pane supplies the route. */
  readonly onUpgrade?: () => void;
  /** Where *Sign in* goes when the remote answered 401 (N3). */
  readonly signInHref?: string;
  /**
   * What this account may do with the Tau Cloud project (D27).
   *
   * Read from `GET /v1/projects` by the pane, because a role is an account fact
   * and not a projection fact. `revoked` is a settled listing that no longer
   * names the project — an owner took access away while this tab was open.
   * `undefined` is nothing known at all, and folds every affordance away.
   */
  readonly role?: ProjectAccessRole;
  /** The Tau Cloud project id, which the owner's collaborator surface needs. */
  readonly projectId?: string;
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
export const syncCopy = (sync: SyncFacet): string | undefined => {
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

/**
 * The one action a failure class implies (N3).
 *
 * Keyed on the machine's own `reason`, never on the sentence: the text is the
 * server's and changes with it, while the class is a contract (contract §3).
 * `Open Revisions` is deliberately absent — this *is* Revisions.
 *
 * @param reason - The failure class the sync machine recorded.
 * @param remote - The connection, so a credential problem names its provider.
 * @returns Which action to render, or `undefined` when there is nothing to do.
 */
const syncFailureAction = (
  reason: SyncFailureReason | undefined,
  remote: RemoteFacet,
): 'signIn' | 'upgrade' | 'reconnectGithub' | 'syncNow' | 'retry' | undefined => {
  switch (reason) {
    case 'unauthorized': {
      return remote.provider === 'github' ? 'reconnectGithub' : 'signIn';
    }
    case 'notEntitled':
    case 'quota': {
      return 'upgrade';
    }
    case 'forbidden':
    case 'notFound': {
      return remote.provider === 'github' ? 'reconnectGithub' : 'retry';
    }
    case 'rejected':
    case 'offline': {
      return 'syncNow';
    }
    case 'unknown': {
      return 'retry';
    }
    default: {
      return undefined;
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
  if (url === undefined) {
    return github ? 'GitHub repository' : 'Git remote';
  }
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replaceAll(/^\/+|\/+$/gu, '').replace(/\.git$/u, '');
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
 * *Available on Pro*, with the route the rest of the app already uses (N4).
 *
 * @param props - The upgrade verb the pane supplied, when this build has one.
 * @returns The label, or nothing on a build with no plans to sell.
 */
function PlanGate({ onUpgrade }: { readonly onUpgrade: (() => void) | undefined }): React.JSX.Element | undefined {
  if (onUpgrade === undefined) {
    return undefined;
  }
  return (
    <button
      type='button'
      className='inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline'
      onClick={onUpgrade}
    >
      Available on Pro · <CommercialUpgradeLabel />
    </button>
  );
}

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
  syncLargeExports,
  onSyncLargeExportsChange,
  canSyncFiles = true,
  canConnectGitHub = true,
  onUpgrade,
  signInHref,
  role,
  projectId,
  className,
}: RevisionSyncRegionProps): React.JSX.Element {
  const busy = remote.phase === 'connecting' || remote.phase === 'disconnecting';
  /*
   * A `read` collaborator is fetch-only for exactly the reason a read-only
   * GitHub link is: the push would be refused. The shared predicate, so this
   * region and the command palette can never disagree about it (F1).
   */
  const readOnly = isSyncReadOnly(remote, role);
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
  const failureAction = syncFailureAction(sync.reason, remote);
  /*
   * One renderer for rule 19's action, because there are now two surfaces that
   * must offer exactly one: the Sync row's refused push, and a refused connect.
   * They differ only in what *Retry* does — a push retries the push, a connect
   * reopens the draft — so that is the one parameter.
   */
  const renderFailureAction = (
    action: ReturnType<typeof syncFailureAction>,
    onRetry: () => void = onSync,
  ): ReactNode => {
    switch (action) {
      case 'signIn': {
        return signInHref === undefined ? undefined : (
          <Button asChild size='xs' variant='outline'>
            <Link to={signInHref}>Sign in</Link>
          </Button>
        );
      }
      case 'upgrade': {
        return onUpgrade === undefined ? undefined : (
          <Button size='xs' variant='outline' onClick={onUpgrade}>
            <CommercialUpgradeLabel />
          </Button>
        );
      }
      case 'reconnectGithub': {
        return (
          <Button
            size='xs'
            variant='outline'
            onClick={() => {
              setChoice('git');
              setChangingBackup(true);
            }}
          >
            Reconnect GitHub
          </Button>
        );
      }
      case 'syncNow': {
        return (
          <Button size='xs' variant='outline' onClick={onSync}>
            Sync now
          </Button>
        );
      }
      case 'retry': {
        return (
          <Button size='xs' variant='outline' onClick={onRetry}>
            Retry
          </Button>
        );
      }
      default: {
        return undefined;
      }
    }
  };
  const [connectionError, setConnectionError] = useState<string | undefined>(undefined);
  const percentage =
    remote.storage === undefined || remote.storage.quota <= 0
      ? 0
      : Math.min((remote.storage.used / remote.storage.quota) * 100, 100);

  /* Symmetric on purpose (C9): the draft is open exactly while there is no
   * settled connection. An effect that only ever *closed* it left a connection
   * that fell out of `connected` rendering three radios and no verb at all —
   * no Connect, no Cancel, no summary — with focus on `<body>`. */
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- C9: the draft mirrors the external connection phase, which no render-time derivation sees.
    setChangingBackup(remote.phase !== 'connected');
    if (remote.phase === 'connected') {
      setChoice(undefined);
    }
  }, [remote.phase]);

  const connectedLabel = remote.kind === 'tau' ? 'Tau Cloud' : gitRemoteLabel(remote.url, remote.provider === 'github');
  const pendingLabel =
    pendingConnection?.kind === 'tau'
      ? 'Tau Cloud'
      : pendingConnection?.kind === 'github'
        ? pendingConnection.selection.repository.fullName
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
    /* N4: a free account issues **no** connect. The radio is already disabled;
     * this is the one funnel every kind passes through, including the GitHub
     * picker's own `onSelect`. */
    if (pending.kind === 'tau' ? !canSyncFiles : !canConnectGitHub) {
      onUpgrade?.();
      return;
    }
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
    if (choice === 'git') {
      return;
    }
    if (choice === 'none' && remote.kind !== 'none') {
      setConfirmingDisconnect(true);
      return;
    }
    if (choice === 'none') {
      return;
    }
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
          {readOnly ? <span className='text-xs text-muted-foreground'>Read only</span> : null}
          {remote.kind === 'tau' ? (
            <span className='flex items-center gap-2'>
              <Switch aria-label='Sync chats' checked={syncChats} onCheckedChange={onSyncChatsChange} />
              <span className='text-xs'>Sync chats</span>
              {/* EQ7/D16: the project's own `syncLargeExports`, on the row that
                  already owns the other per-project transfer choice. Only the
                  import route wrote it before, so a connected project could
                  never turn it on (C14). */}
              <Switch aria-label='Sync exports' checked={syncLargeExports} onCheckedChange={onSyncLargeExportsChange} />
              <span className='text-xs'>Sync exports</span>
            </span>
          ) : null}
          {readOnly ? null : (
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
          {/* N4: a plan that cannot back files up is not offered a backup. The
              row still exists — hiding it would make the capability invisible
              — but it says what it costs and routes to the plan surface, the
              way `project-share-panel` already gates private shares. */}
          <div className='flex items-center gap-2'>
            <RadioGroupItem id='remote-tau' value='tau' disabled={!canSyncFiles} />
            <Cloud aria-hidden className='size-4 shrink-0 text-muted-foreground' />
            <Label htmlFor='remote-tau' className={cn('font-normal', !canSyncFiles && 'text-muted-foreground')}>
              Tau Cloud
            </Label>
            {canSyncFiles ? null : <PlanGate onUpgrade={onUpgrade} />}
          </div>
          <div className='flex items-center gap-2'>
            <RadioGroupItem id='remote-git' value='git' disabled={!canConnectGitHub} />
            <GitBranch aria-hidden className='size-4 shrink-0 text-muted-foreground' />
            <Label htmlFor='remote-git' className={cn('font-normal', !canConnectGitHub && 'text-muted-foreground')}>
              Git remote
            </Label>
            {canConnectGitHub ? null : <PlanGate onUpgrade={onUpgrade} />}
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
            disabled={(remote.kind === 'none' && choice === 'none') || (choice === 'tau' && !canSyncFiles)}
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
        <div
          role='status'
          aria-label='Backup connection progress'
          aria-busy='true'
          className='flex items-center gap-2 text-sm'
        >
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
        <div role='status' aria-label='Backup status' className='flex flex-col gap-1.5 text-sm'>
          <span className='flex items-center gap-2'>
            {sync.state === 'conflicted' || sync.state === 'failed' || sync.state === 'queued' ? (
              <AlertTriangle aria-hidden className='size-4 shrink-0 text-destructive' />
            ) : (
              <Cloud aria-hidden className='size-4 shrink-0 text-muted-foreground' />
            )}
            <span className='tabular-nums'>{syncState}</span>
            {sync.online ? undefined : <span className='text-xs text-muted-foreground'>Offline</span>}
          </span>
          {/*
            The reason, and exactly one action for its class (N3, C4).

            `sync.error` is the server's own sentence; the *action* is chosen
            from `sync.reason`, which is a contract. A count is not a reason,
            and a reason with no verb is not an answer.
          */}
          {sync.error === undefined ? undefined : (
            <span className='flex flex-wrap items-center gap-2 text-xs'>
              <span className='min-w-0 flex-1'>{sync.error}</span>
              {renderFailureAction(failureAction)}
            </span>
          )}
        </div>
      )}

      {remote.phase === 'connected' && !changingBackup && remote.url !== undefined && remote.kind === 'git' ? (
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <details className='min-w-0 flex-1'>
            <summary className='text-xs text-muted-foreground'>Connection details</summary>
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
                <Button asChild variant='ghost' size='sm'>
                  <a href={remote.url.replace(/\.git$/u, '')} target='_blank' rel='noreferrer'>
                    Open GitHub
                  </a>
                </Button>
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
          <p role='alert' aria-label='GitHub connection' className='flex items-center gap-2 text-sm'>
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
        <div role='alert' aria-label='Backup connection error' className='flex flex-wrap items-center gap-2 text-sm'>
          <AlertTriangle aria-hidden className='size-4 shrink-0 text-destructive' />
          <span className='min-w-0 flex-1'>{connectionError}</span>
          <Button
            size='xs'
            variant='outline'
            onClick={() => {
              setConnectionError(undefined);
              setChangingBackup(true);
            }}
          >
            Retry
          </Button>
        </div>
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

      {/*
        A refused *connect*, classified the same way a refused push is (rule 19).

        `remote.reason` comes from the one classifier `sync.machine` owns, so the
        `403 GIT_SYNC_NOT_ENTITLED` that opened this closeout offers *Upgrade*
        here exactly as it does on the Sync row, instead of the unclassified
        *Retry* this block could once offer for every class alike.
      */}
      {remote.phase === 'failed' && remote.error !== undefined ? (
        <div role='alert' aria-label='Backup connection error' className='flex flex-wrap items-center gap-2 text-sm'>
          <AlertTriangle aria-hidden className='size-4 shrink-0 text-destructive' />
          <span className='min-w-0 flex-1'>{remote.error}</span>
          {renderFailureAction(syncFailureAction(remote.reason, remote) ?? 'retry', () => {
            setChangingBackup(true);
          })}
        </div>
      ) : undefined}

      {/*
        Access this account no longer has (N1).

        A settled listing that does not name the project is an owner's revoke
        arriving at a tab that never closed. The row says so in one sentence and
        `readOnly` has already taken *Sync now* away — a push would be refused,
        and a button that fails after the gesture is worse than no button.
      */}
      {role === 'revoked' && remote.kind === 'tau' ? (
        <p className='flex items-center gap-2 text-sm'>
          <AlertTriangle aria-hidden className='size-4 shrink-0 text-destructive' />
          <span>You no longer have access to this project&apos;s cloud copy.</span>
        </p>
      ) : undefined}

      {/*
        Who else may work on this project (D27, charter W5).

        The owner alone: every route behind the panel needs `owner`, so a
        collaborator would only meet a refusal. Tau Cloud alone, too (N4) — a
        GitHub-backed project has an owner but no cloud project to invite
        anybody to, and a project with no remote has neither.
      */}
      {role === 'owner' && projectId !== undefined && remote.kind === 'tau' && remote.phase === 'connected' ? (
        <RevisionCollaborators projectId={projectId} />
      ) : undefined}
    </section>
  );
}
