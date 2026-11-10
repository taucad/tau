import { useEffect, useState } from 'react';
import { ArrowUpCircle } from 'lucide-react';
import { useSidebar } from '@taucad/ui/components/sidebar';
import {
  describeSupersession,
  haveWritesStopped,
  isReloadOffered,
  subscribeReloadOffer,
} from '#filesystem/build-skew.js';
import { UpdateControl } from '#components/nav/update-control.js';
import { useReloadOffered, useSupersedingBuild } from '#hooks/use-superseding-build.js';

const builtAt = (supersedingBuildId: number, isRolledBack: boolean): string | undefined =>
  supersedingBuildId > 0
    ? `Tau · ${isRolledBack ? 'Built' : 'Updated'} ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(supersedingBuildId)}`
    : undefined;

/**
 * Browser counterpart of `DesktopUpdate`: a tab whose bundle has been superseded
 * by a newer one in another tab (blueprint DF20) has stopped writing durable
 * state, and one a deploy replaced (`#lib/stale-build-recovery`) is running old
 * code; both surface the same sidebar control and offer a reload. The sidebar is the
 * only surface that shows an update: there is no floating banner.
 */
export function BrowserUpdate(): React.JSX.Element | undefined {
  const superseded = useReloadOffered();
  const { supersedingBuildId, isRolledBack } = useSupersedingBuild();
  const [open, setOpen] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const { setOpen: showSidebar } = useSidebar();
  useEffect(() => {
    /* Opened for the user only once writes have stopped. An offer alone (a deploy in a lone tab that
     * still writes) shows the control where it is, without opening the sidebar. A remount does not
     * replay a reveal, and a withdrawn offer reveals nothing. */
    let wasStopped = isReloadOffered() && haveWritesStopped();
    const reveal = (): void => {
      const isStopped = isReloadOffered() && haveWritesStopped();
      if (isStopped && !wasStopped) {
        showSidebar(true);
        setRevealed(true);
        setOpen(true);
      }
      wasStopped = isStopped;
    };
    return subscribeReloadOffer(reveal);
  }, [showSidebar]);
  if (!superseded) {
    return undefined;
  }
  return (
    <UpdateControl
      title='Update ready'
      version={builtAt(supersedingBuildId, isRolledBack)}
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
