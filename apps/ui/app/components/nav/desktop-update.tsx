import { useEffect, useRef, useState } from 'react';
import { ArrowUpCircle, Check, Download, ShieldAlert } from 'lucide-react';
import { Loader } from '@taucad/ui/components/loader';
import type { DesktopUpdateBridge, DesktopUpdateSnapshot } from '@taucad/types/desktop-updates';
import { useSidebar } from '@taucad/ui/components/sidebar';
import { UpdateControl } from '#components/nav/update-control.js';
import { desktopUpdates } from '@taucad/files-ui/filesystem/desktop-bridge';

/** Desktop-only subscription. Main owns checks, downloads and restart admission. */
export function DesktopUpdate(): React.JSX.Element | undefined {
  const bridge = desktopUpdates();
  return bridge ? <DesktopUpdateControl bridge={bridge} /> : undefined;
}

/** Same shipping control used by the design preview with a local bridge fixture. */
export function DesktopUpdateControl({
  bridge,
}: {
  readonly bridge: DesktopUpdateBridge;
}): React.JSX.Element | undefined {
  const [snapshot, setSnapshot] = useState<DesktopUpdateSnapshot>();
  const [open, setOpen] = useState(false);
  /* The action the person asked for that failed, which names the failure; reading the first status counts as a check. */
  const [failedAction, setFailedAction] = useState<FailedAction>();
  const { setOpen: showSidebar, setOpenMobile, isMobile } = useSidebar();
  const revealedRequest = useRef(0);
  useEffect(() => {
    const subscriptionLifetime = new AbortController();
    const receive = (next: DesktopUpdateSnapshot, reveal: boolean): void => {
      if (!subscriptionLifetime.signal.aborted) {
        if (reveal && next.requestId > revealedRequest.current) {
          showSidebar(true);
          if (isMobile) {
            setOpenMobile(true);
          }
          setOpen(true);
        }
        revealedRequest.current = Math.max(revealedRequest.current, next.requestId);
        setSnapshot((previous) => (previous && previous.revision >= next.revision ? previous : next));
      }
    };
    // Subscribe first; revisions prevent a slower initial read from replacing a newer event.
    const unsubscribe = bridge.subscribe((next) => {
      receive(next, true);
    });
    // async-iife: bootstrap — hydrate the external subscription; cleanup ignores late results.
    void (async () => {
      try {
        // Hydration restores status, not a historical request to open the details.
        receive(await bridge.snapshot(), false);
      } catch {
        if (!subscriptionLifetime.signal.aborted) {
          setFailedAction('check');
        }
      }
    })();
    return () => {
      subscriptionLifetime.abort();
      unsubscribe();
    };
  }, [bridge, showSidebar, setOpenMobile, isMobile]);
  if (!snapshot) {
    return undefined;
  }
  const { phase, blockedReason } = snapshot;
  const busyLabel = busyLabels[phase];
  const failed =
    phase === 'error' || phase === 'restart-blocked' || blockedReason !== undefined || failedAction !== undefined;
  /* A blocked update is never quiet: the person is the only one who can fix the clock or reinstall (B25, B27). */
  const quiet =
    blockedReason === undefined &&
    (phase === 'current' || phase === 'checking' || phase === 'disabled' || phase === 'system-managed');
  if (quiet && !open) {
    return undefined;
  }
  /* The user already asked to restart: the download's completion installs without a second ask. */
  const restartsWhenReady = phase === 'downloading' && snapshot.installWhenReady === true;
  const blocked = blockedReason === undefined ? undefined : blockedCopy[blockedReason];
  /* Installing after a clock refusal would only meet the same refusal; a fresh check is the retry (B25). */
  const intent = blockedReason === 'clock' ? 'check' : intentOf(phase);
  const title = failedAction
    ? failedTitles[failedAction]
    : blocked
      ? blocked.title
      : restartsWhenReady
        ? 'Restarts when ready'
        : titles[phase];
  const detail = failedAction
    ? failedAction === 'restart' || failedAction === 'move'
      ? 'Tau is still open. Try again.'
      : 'Your work isn’t affected. Try again.'
    : blocked
      ? blocked.detail
      : restartsWhenReady
        ? 'Tau will save your work and restart as soon as the download finishes.'
        : phase === 'ready'
          ? /* Main words the one case the renderer cannot tell apart: a newer Tau that APT already installed. */
            (snapshot.detail ??
            (snapshot.installOnQuit === false
              ? 'Tau saves your work, then restarts to install. Quitting normally leaves the update for later.'
              : 'Tau saves your work, then restarts to install. If you’d rather wait, it installs when you quit Tau.'))
          : details[phase];
  /* One spinner at a time: a busy button carries its own, so the tile spins only while downloading. */
  const Icon = failed
    ? ShieldAlert
    : phase === 'downloading'
      ? Loader
      : phase === 'current'
        ? Check
        : phase === 'available'
          ? Download
          : ArrowUpCircle;
  const act = async (): Promise<void> => {
    setFailedAction(undefined);
    try {
      if (intent === 'restart') {
        /* Before the download finishes, main holds the request and restarts when it does. */
        await bridge.install();
      } else if (phase === 'error') {
        /* A failed download starts over with a check, which downloads again; "Try again" never agrees to a restart, and
         * main forgets the failed release, so `download` would have nothing to fetch. */
        await bridge.check();
      } else if (intent === 'download' || intent === 'move') {
        /* For move-required, main moves Tau to Applications and relaunches it from there. */
        await bridge.download();
      } else {
        await bridge.check();
      }
    } catch {
      setFailedAction(intent);
    }
  };
  return (
    <UpdateControl
      title={title}
      version={`Tau ${snapshot.version ?? snapshot.currentVersion}${snapshot.channel === 'staging' ? ' · Staging' : ''}`}
      detail={detail}
      icon={Icon}
      isFailed={failed}
      releasePage={blocked ? snapshot.downloadPage : snapshot.releasePage}
      releaseLabel={blocked ? 'Download Tau' : undefined}
      isOpen={open}
      action={
        restartsWhenReady || phase === 'disabled' || blockedReason === 'installation-marker'
          ? undefined
          : {
              /* A repeated failed action is "Try again" (UX policy). */
              label: failedAction ? 'Try again' : blockedReason === 'clock' ? 'Check again' : labels[phase],
              variant: phase === 'error' || phase === 'current' || phase === 'system-managed' ? 'outline' : 'default',
              busy: busyLabel !== undefined,
              busyLabel,
              onClick: () => {
                void act();
              },
            }
      }
      onOpenChange={setOpen}
    />
  );
}

type Phase = DesktopUpdateSnapshot['phase'];

/** What the notice's button asks main to do. */
type FailedAction = 'check' | 'download' | 'restart' | 'move';

const intentOf = (phase: Phase): FailedAction =>
  phase === 'ready' || phase === 'restart-blocked' || phase === 'downloading'
    ? 'restart'
    : phase === 'error' || phase === 'available'
      ? 'download'
      : phase === 'move-required'
        ? 'move'
        : 'check';

/* The two refusals only the person can fix; both offer Download Tau in place of release notes (B25, B27). */
const blockedCopy: Readonly<
  Record<NonNullable<DesktopUpdateSnapshot['blockedReason']>, { title: string; detail: string }>
> = {
  clock: {
    title: 'Check your date and time',
    detail:
      'Tau couldn’t verify the update because your computer’s date and time look wrong. Correct them, then check again.',
  },
  'installation-marker': {
    title: 'This copy of Tau can’t update itself',
    detail: 'Its installation is damaged. Download Tau and install it again; your projects stay where they are.',
  },
};

const failedTitles: Readonly<Record<FailedAction, string>> = {
  check: 'Couldn’t check',
  download: 'Couldn’t download',
  restart: 'Couldn’t restart',
  move: 'Couldn’t move Tau',
};

/* Titles are the state in about three words: the collapsed row and the screen-reader announcement show nothing else. */
const titles: Readonly<Record<Phase, string>> = {
  'system-managed': 'Updates via APT',
  disabled: 'Updates are off',
  checking: 'Checking for updates',
  current: 'You’re up to date',
  downloading: 'Downloading update',
  ready: 'Update ready',
  available: 'Update available',
  error: 'Couldn’t update',
  saving: 'Saving your work',
  'restart-blocked': 'Couldn’t restart',
  restarting: 'Restarting Tau',
  'move-required': 'Move Tau to update',
};

/* Say what happened to the person and their work, then the one next step. `ready` is worded where it is built. */
const details: Readonly<Record<Phase, string>> = {
  'system-managed': 'Tau updates through APT on this computer, so new versions arrive with your system updates.',
  disabled: 'This copy of Tau doesn’t update itself.',
  checking: 'Looking for a newer version of Tau.',
  current: 'Tau checks for new versions on its own.',
  downloading: 'Keep working. Tau will let you know here when it’s ready.',
  ready: '',
  /* Only the manual-update route offers `available`; its Download opens the archive in the browser. */
  available: 'Opens your browser to download the latest version. Tau stays open.',
  /* Main retries on a backoff and checks again every few hours, so "later" holds. */
  /* `error` also covers a failed check (offline, say) and a failure before restarting. */
  error: 'Tau couldn’t check for or download an update. Your work isn’t affected, and Tau will try again later.',
  saving: 'Tau restarts as soon as everything is saved.',
  /* `prepareToInstall` refuses while work is unsaved or a machine still runs. */
  'restart-blocked':
    'Tau stayed open: something is still saving, or a machine is still running. Finish up, then try again.',
  restarting: 'Your workspace reopens in a moment.',
  'move-required':
    'Tau can’t update from where it is now, such as Downloads or a disk image. Moving it to Applications restarts Tau.',
};

/* Buttons name the action; a repeated failed action is "Try again" (UX policy). */
const labels: Readonly<Record<Phase, string>> = {
  'system-managed': 'Check again',
  disabled: 'Check again',
  checking: 'Check again',
  current: 'Check again',
  downloading: 'Restart when ready',
  ready: 'Restart now',
  available: 'Download',
  error: 'Try again',
  saving: 'Restart now',
  'restart-blocked': 'Try again',
  restarting: 'Restart now',
  'move-required': 'Move to Applications',
};

/* While busy, the button names the work under way. */
const busyLabels: Readonly<Partial<Record<Phase, string>>> = {
  checking: 'Checking…',
  saving: 'Saving…',
  restarting: 'Restarting…',
};
