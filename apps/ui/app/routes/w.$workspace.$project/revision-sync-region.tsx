import { useState } from 'react';
import { AlertTriangle, Cloud, CloudOff, GitBranch } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { Checkbox } from '@taucad/ui/components/checkbox';
import { Input } from '@taucad/ui/components/input';
import { Label } from '@taucad/ui/components/label';
import { RadioGroup, RadioGroupItem } from '@taucad/ui/components/radio-group';
import { cn } from '@taucad/ui/utils/cn';
import { gitRemoteUrlProblem, isGithubRemoteUrl } from '@taucad/revisions';
import type { RemoteFacet, SyncFacet } from '@taucad/revisions';
import { authorizeGithubRemote } from '#lib/share-providers.js';
import type { GithubRemoteVisibility } from '#lib/share-providers.js';
import { formatBytes } from '#lib/format-bytes.js';
import { Spinner } from '#components/ui/spinner.js';

/** Which remote a person can pick. @public */
export type RemoteChoice = 'none' | 'tau' | 'git';

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
    options?: Readonly<{ visibility?: GithubRemoteVisibility }>,
  ) => void | Promise<void>;
  readonly onDisconnect: () => void;
  readonly onCancel: () => void;
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
      return sync.pendingCount > 0 ? `Backing up… ${String(sync.pendingCount)}` : 'Backing up…';
    }
    case 'conflicted': {
      return 'Needs resolution';
    }
    default: {
      /* `queued` and `failed` read the same to a person: their work is not on
       * the server. What differs is whether this device will retry by itself,
       * which the offline line below says. */
      return sync.pendingCount > 0 ? `Not backed up · ${String(sync.pendingCount)}` : 'Not backed up';
    }
  }
};

const connectingCopy = (remote: RemoteFacet): string =>
  remote.phase === 'disconnecting'
    ? 'Disconnecting…'
    : remote.kind === 'tau'
      ? 'Connecting to Tau Cloud…'
      : 'Connecting…';

/**
 * What Tau is about to ask for, in the words of the thing being asked (A18).
 *
 * The sentence is written before the consent screen appears, never after, and
 * it names the authority rather than the mechanism: a person deciding whether
 * to grant `repo` is deciding whether Tau may read their private repositories.
 *
 * @param url - The address typed so far.
 * @param visibility - Whether the person said the repository is private.
 * @returns The sentence to show under the field.
 */
const authoritySentence = (url: string, visibility: GithubRemoteVisibility): string => {
  if (!isGithubRemoteUrl(url)) {
    return 'Tau can sign in to GitHub only, so another host has to allow access without one.';
  }
  return visibility === 'private'
    ? 'GitHub will ask you to let Tau read and write your repositories, including private ones.'
    : 'GitHub will ask you to let Tau read and write your public repositories.';
};

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
  visibility,
  onUrlChange,
  onVisibilityChange,
  onConnect,
}: {
  readonly url: string;
  readonly visibility: GithubRemoteVisibility;
  readonly onUrlChange: (url: string) => void;
  readonly onVisibilityChange: (visibility: GithubRemoteVisibility) => void;
  readonly onConnect: () => void;
}): React.JSX.Element {
  const problem = url === '' ? undefined : gitRemoteUrlProblem(url);
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
      <div className='flex items-center gap-2'>
        <Checkbox
          id='remote-git-private'
          checked={visibility === 'private'}
          onCheckedChange={(checked) => {
            onVisibilityChange(checked === true ? 'private' : 'public');
          }}
        />
        <Label htmlFor='remote-git-private' className='font-normal'>
          This repository is private
        </Label>
      </div>
      <p id='remote-git-authority' className='text-xs text-muted-foreground'>
        {authoritySentence(url, visibility)}
      </p>
      {/*
        Large objects do not cross this wire, and the port refuses the push by
        name before anything is offered (P20). Saying so here is the difference
        between a person choosing Tau Cloud now and meeting `LFS_REMOTE_UNSUPPORTED`
        at the first push.
      */}
      <p className='text-xs text-muted-foreground'>
        Files over 1 MB stay on this device: Tau transfers large files to Tau Cloud only.
      </p>
      {problem === undefined ? undefined : (
        <p role='alert' className='text-sm text-destructive'>
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
  const [visibility, setVisibility] = useState<GithubRemoteVisibility>('public');
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const syncState = syncCopy(sync);
  const [consentError, setConsentError] = useState<string | undefined>(undefined);
  const percentage =
    remote.storage === undefined || remote.storage.quota <= 0
      ? 0
      : Math.min((remote.storage.used / remote.storage.quota) * 100, 100);

  /**
   * Connect, or grant the credential again — the same two steps either way.
   *
   * @param reconnect - Ask GitHub again for a scope the session already records.
   */
  const connectGitRemote = async (reconnect: boolean): Promise<void> => {
    const target = reconnect ? (remote.url ?? url) : url;
    setConsentError(undefined);
    /* Opened inside the click, before the first `await`, or the browser
     * refuses it. Only GitHub needs one. */
    const consent = isGithubRemoteUrl(target)
      ? (globalThis.open('', 'tau-github-consent', 'width=720,height=820') ?? undefined)
      : undefined;
    try {
      if (isGithubRemoteUrl(target)) {
        await authorizeGithubRemote({ visibility, consent, reconnect });
      }
      await onConnect('git', target, { visibility });
    } catch (error) {
      consent?.close();
      setConsentError(error instanceof Error ? error.message : 'GitHub permission was not granted.');
    }
  };

  return (
    <section aria-labelledby='revision-sync-heading' className={cn('flex flex-col gap-3', className)}>
      <h3 id='revision-sync-heading' className='font-mono text-xs tracking-wide text-muted-foreground uppercase'>
        Sync
      </h3>

      <RadioGroup
        aria-label='Where this project syncs'
        value={choice}
        disabled={busy}
        onValueChange={(value) => {
          const next = value as RemoteChoice;
          setChoice(next);
          /* *Git remote* opens the form; the other two are the whole answer. */
          if (next !== 'git') {
            void onConnect(next);
          }
        }}
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

      {choice === 'git' ? undefined : (
        <p className='text-xs text-muted-foreground'>
          Connecting signs this project’s files, history and chats in to your Tau account and keeps them backed up.
        </p>
      )}

      {choice === 'git' && remote.phase !== 'connected' && !busy ? (
        <GitRemoteForm
          url={url}
          visibility={visibility}
          onUrlChange={setUrl}
          onVisibilityChange={setVisibility}
          onConnect={() => {
            void connectGitRemote(false);
          }}
        />
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

      {remote.phase === 'connected' && remote.url !== undefined ? (
        <div className='flex items-center justify-between gap-2'>
          <span className='truncate font-mono text-xs text-muted-foreground'>{remote.url}</span>
          {confirmingDisconnect ? undefined : (
            <Button
              variant='ghost'
              size='sm'
              onClick={() => {
                setConfirmingDisconnect(true);
              }}
            >
              Disconnect
            </Button>
          )}
        </div>
      ) : undefined}

      {confirmingDisconnect && remote.phase === 'connected' ? (
        <div className='flex flex-col gap-2'>
          <p className='text-sm'>Disconnect this remote? Every revision stays on this device.</p>
          <div className='flex items-center gap-2'>
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
              Disconnect
            </Button>
            <Button
              size='sm'
              variant='ghost'
              onClick={() => {
                setConfirmingDisconnect(false);
              }}
            >
              Keep it
            </Button>
          </div>
        </div>
      ) : undefined}

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
              void connectGitRemote(true);
            }}
          >
            Reconnect GitHub
          </Button>
        </div>
      ) : undefined}

      {consentError === undefined ? undefined : (
        <p role='alert' className='flex items-center gap-2 text-sm'>
          <AlertTriangle aria-hidden className='size-4 shrink-0 text-destructive' />
          <span>{consentError}</span>
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
