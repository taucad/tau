import { useEffect, useState, useSyncExternalStore } from 'react';
import { ArrowUpCircle } from 'lucide-react';
import { Topic } from '@taucad/events';
import { useSidebar } from '@taucad/ui/components/sidebar';
import {
  buildId,
  describeSupersession,
  isBuildSuperseded,
  readSupersedingBuildId,
  subscribeBuildSkew,
  subscribeSupersedingBuildId,
} from '#filesystem/build-skew.js';
import { UpdateControl } from '#components/nav/update-control.js';

const serverSnapshot = (): boolean => false;
const serverBuildSnapshot = (): number => buildId;

let mountedControls = 0;
const mountedTopic = new Topic<void>({ name: 'browser-update-control' });

/**
 * `true` while a sidebar update control is mounted in an open sidebar, so the
 * floating fallback (`BuildSkewBanner`) covers surfaces without a reachable one.
 */
export const useBrowserUpdateControlMounted = (): boolean =>
  useSyncExternalStore(
    (listener) => mountedTopic.subscribe(listener),
    () => mountedControls > 0,
    serverSnapshot,
  );

const builtAt = (supersedingBuildId: number): string | undefined =>
  supersedingBuildId > 0
    ? `Tau · ${supersedingBuildId < buildId ? 'Built' : 'Updated'} ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(supersedingBuildId)}`
    : undefined;

/**
 * Browser counterpart of `DesktopUpdate`: a tab whose bundle has been superseded
 * by a newer one in another tab (blueprint DF20), or replaced by a deploy
 * (`#lib/stale-build-recovery`), has already stopped writing
 * durable state, so it surfaces the same sidebar control and offers a reload.
 */
export function BrowserUpdate(): React.JSX.Element | undefined {
  const superseded = useSyncExternalStore(subscribeBuildSkew, isBuildSuperseded, serverSnapshot);
  const supersedingBuildId = useSyncExternalStore(
    subscribeSupersedingBuildId,
    readSupersedingBuildId,
    serverBuildSnapshot,
  );
  const [open, setOpen] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const { open: sidebarOpen, openMobile, isMobile, setOpen: showSidebar } = useSidebar();
  // A collapsed sidebar is inert, so only an open one can own the prompt.
  const isReachable = isMobile ? openMobile : sidebarOpen;
  useEffect(() => {
    if (!isReachable) {
      return undefined;
    }
    mountedControls += 1;
    mountedTopic.emit();
    return () => {
      mountedControls -= 1;
      mountedTopic.emit();
    };
  }, [isReachable]);
  useEffect(
    () =>
      // Saving has stopped, so the transition is worth revealing once; a remount does not replay it.
      subscribeBuildSkew(() => {
        showSidebar(true);
        setRevealed(true);
        setOpen(true);
      }),
    [showSidebar],
  );
  if (!superseded) {
    return undefined;
  }
  return (
    <UpdateControl
      title='Update ready'
      version={builtAt(supersedingBuildId)}
      detail={describeSupersession(supersedingBuildId)}
      icon={ArrowUpCircle}
      isProminent
      isOpen={open}
      shouldFocusOnOpen={!revealed}
      action={{
        label: 'Reload now',
        variant: 'default',
        onClick: () => {
          globalThis.location.reload();
        },
      }}
      onOpenChange={(next) => {
        setRevealed(false);
        setOpen(next);
      }}
    />
  );
}
