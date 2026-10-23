import { useEffect, useRef, useState } from 'react';
import { ArrowUpCircle, Check, Download, LoaderCircle, ShieldAlert } from 'lucide-react';
import type { DesktopUpdateBridge, DesktopUpdateSnapshot } from '@taucad/types/desktop-updates';
import { useSidebar } from '@taucad/ui/components/sidebar';
import { UpdateControl } from '#components/nav/update-control.js';
import { desktopUpdates } from '#filesystem/desktop-bridge.js';

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
  const [actionFailed, setActionFailed] = useState(false);
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
        // Hydration restores status, not a historical request to open the popover.
        receive(await bridge.snapshot(), false);
      } catch {
        if (!subscriptionLifetime.signal.aborted) {
          setActionFailed(true);
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
  const { phase } = snapshot;
  const busy = phase === 'saving' || phase === 'restarting' || phase === 'checking';
  const failed = phase === 'error' || phase === 'restart-blocked' || actionFailed;
  const quiet = phase === 'current' || phase === 'checking' || phase === 'disabled' || phase === 'system-managed';
  if (quiet && !open) {
    return undefined;
  }
  const title = actionFailed
    ? 'Couldn’t complete the request'
    : {
        'system-managed': 'Updates managed by APT',
        disabled: 'Updates unavailable',
        checking: 'Checking for updates',
        current: 'You’re up to date',
        downloading: 'Downloading an update',
        ready: 'Update ready',
        available: 'Update available',
        error: 'Update interrupted',
        saving: 'Saving your work',
        'restart-blocked': 'Restart paused',
        restarting: 'Restarting Tau',
      }[phase];
  const detail = actionFailed
    ? 'Try again. Your current session is still open.'
    : (snapshot.detail ??
      {
        'system-managed': 'Your administrator manages updates through APT.',
        disabled: 'Automatic updates are disabled for this build.',
        checking: 'Looking for the latest version of Tau.',
        current: 'You have the latest version.',
        downloading: 'Keep working. We’ll let you know here when it’s ready.',
        ready:
          snapshot.installOnQuit === false
            ? 'Saves your work, then restarts to install. Quitting normally leaves the update for later.'
            : 'Saves your work, then restarts. Otherwise, installs when you quit Tau.',
        available: 'Download the latest version. Your session will stay open.',
        error: 'We’ll retry automatically. Your work is unaffected.',
        saving: 'Saving your work before restarting…',
        'restart-blocked': 'Tau stayed open. Finish saving or reviewing active machines, then try again.',
        restarting: 'Reopening your workspace…',
      }[phase]);
  const Icon = failed
    ? ShieldAlert
    : busy || phase === 'downloading'
      ? LoaderCircle
      : phase === 'current'
        ? Check
        : phase === 'available'
          ? Download
          : ArrowUpCircle;
  const act = async (): Promise<void> => {
    setActionFailed(false);
    try {
      if (phase === 'ready' || phase === 'restart-blocked') {
        await bridge.install();
      } else if (phase === 'available') {
        await bridge.download();
      } else {
        await bridge.check();
      }
    } catch {
      setActionFailed(true);
    }
  };
  const actionLabel =
    phase === 'ready'
      ? 'Restart now'
      : phase === 'restart-blocked'
        ? 'Retry restart'
        : phase === 'available'
          ? 'Download'
          : phase === 'current' || phase === 'system-managed'
            ? 'Check again'
            : 'Retry';
  return (
    <UpdateControl
      title={title}
      version={`Tau ${snapshot.version ?? snapshot.currentVersion}${snapshot.channel === 'staging' ? ' · Staging' : ''}`}
      detail={detail}
      icon={Icon}
      isFailed={failed}
      releasePage={snapshot.releasePage}
      isOpen={open}
      action={
        phase === 'downloading' || phase === 'disabled'
          ? undefined
          : {
              label: actionLabel,
              variant: phase === 'error' || phase === 'current' || phase === 'system-managed' ? 'outline' : 'default',
              busy,
              onClick: () => {
                void act();
              },
            }
      }
      onOpenChange={setOpen}
    />
  );
}
