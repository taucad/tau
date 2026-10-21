import { useEffect, useRef, useState } from 'react';
import { ArrowUpCircle, Check, ArrowUpRight, ChevronRight, Download, LoaderCircle, ShieldAlert, X } from 'lucide-react';
import type { DesktopUpdateBridge, DesktopUpdateSnapshot } from '@taucad/types/desktop-updates';
import { Button } from '@taucad/ui/components/button';
import { Popover, PopoverContent, PopoverTrigger } from '@taucad/ui/components/popover';
import { SidebarMenu, SidebarMenuItem, SidebarMenuButton, useSidebar } from '@taucad/ui/components/sidebar';
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
  return (
    <SidebarMenu className='p-1'>
      <SidebarMenuItem>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <SidebarMenuButton className='data-[state=open]:bg-sidebar-accent' aria-label={title}>
              <Icon className={failed ? 'text-destructive' : 'text-muted-foreground'} />
              <span>{title}</span>
              <ChevronRight className='ml-auto text-muted-foreground' />
            </SidebarMenuButton>
          </PopoverTrigger>
          <PopoverContent
            side='top'
            align='start'
            sideOffset={4}
            collisionPadding={8}
            className='w-64 max-w-[calc(100vw-1rem)] p-3'
            aria-label='Tau update'
          >
            <div className='flex items-center justify-between gap-2'>
              <h2 className='text-sm leading-5 font-medium'>{title}</h2>
              <Button
                variant='ghost'
                size='icon-xs'
                aria-label='Close update details'
                onClick={() => {
                  setOpen(false);
                }}
              >
                <X />
              </Button>
            </div>
            <p className='text-xs leading-4 text-muted-foreground'>
              Tau {snapshot.version ?? snapshot.currentVersion}
              {snapshot.channel === 'staging' ? ' · Staging' : ''}
            </p>
            <p className='mt-2 text-xs leading-4 text-muted-foreground'>{detail}</p>
            <div className='mt-3 flex items-center justify-between gap-2'>
              {snapshot.releasePage ? (
                <Button asChild variant='ghost' size='xs' className='-ml-2'>
                  <a href={snapshot.releasePage} target='_blank' rel='noopener noreferrer'>
                    What’s new
                    <ArrowUpRight className='size-3' />
                  </a>
                </Button>
              ) : (
                <span />
              )}
              {phase !== 'downloading' && phase !== 'disabled' ? (
                <Button
                  size='xs'
                  variant={
                    phase === 'error' || phase === 'current' || phase === 'system-managed' ? 'outline' : 'default'
                  }
                  disabled={busy}
                  onClick={() => {
                    void act();
                  }}
                >
                  {busy ? <LoaderCircle className='size-3 spin-glyph' /> : undefined}
                  {busy
                    ? 'Please wait…'
                    : phase === 'ready'
                      ? 'Restart now'
                      : phase === 'restart-blocked'
                        ? 'Retry restart'
                        : phase === 'available'
                          ? 'Download'
                          : phase === 'current' || phase === 'system-managed'
                            ? 'Check again'
                            : 'Retry'}
                </Button>
              ) : undefined}
            </div>
          </PopoverContent>
        </Popover>
        <span className='sr-only' role='status' aria-live='polite'>
          {title}
        </span>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
