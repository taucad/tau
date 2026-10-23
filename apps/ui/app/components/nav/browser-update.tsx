import { useEffect, useState, useSyncExternalStore } from 'react';
import { ArrowUpCircle } from 'lucide-react';
import { Topic } from '@taucad/events';
import { useSidebar } from '@taucad/ui/components/sidebar';
import { isBuildSuperseded, readNewestBuildId, subscribeBuildSkew } from '#filesystem/build-skew.js';
import { UpdateControl } from '#components/nav/update-control.js';

const serverSnapshot = (): boolean => false;

let mountedControls = 0;
const mountedTopic = new Topic<void>({ name: 'browser-update-control' });

/**
 * `true` while a sidebar update control is mounted, so the floating fallback
 * (`BuildSkewBanner`) only appears on surfaces without the app sidebar.
 */
export const useBrowserUpdateControlMounted = (): boolean =>
  useSyncExternalStore(
    (listener) => mountedTopic.subscribe(listener),
    () => mountedControls > 0,
    serverSnapshot,
  );

const builtAt = (buildId: number): string | undefined =>
  buildId > 0
    ? `Tau · Updated ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(buildId)}`
    : undefined;

/**
 * Browser counterpart of `DesktopUpdate`: a tab whose bundle has been superseded
 * by a newer one in another tab (blueprint DF20) has already stopped writing
 * durable state, so it surfaces the same sidebar control and offers a reload.
 */
export function BrowserUpdate(): React.JSX.Element | undefined {
  const superseded = useSyncExternalStore(subscribeBuildSkew, isBuildSuperseded, serverSnapshot);
  const [open, setOpen] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const { setOpen: showSidebar } = useSidebar();
  useEffect(() => {
    mountedControls += 1;
    mountedTopic.emit();
    return () => {
      mountedControls -= 1;
      mountedTopic.emit();
    };
  }, []);
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
      version={builtAt(readNewestBuildId())}
      detail='A newer version of Tau is open in another tab. This tab has paused saving — reload to continue with the latest version.'
      icon={ArrowUpCircle}
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
