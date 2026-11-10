import { useEffect, useState } from 'react';
import { ArrowUpCircle } from 'lucide-react';
import { Topic } from '@taucad/events';
import { useSidebar } from '@taucad/ui/components/sidebar';
import {
  describeSupersession,
  haveWritesStopped,
  isReloadOffered,
  subscribeReloadOffer,
} from '#filesystem/build-skew.js';
import { UpdateControl } from '#components/nav/update-control.js';
import { useReloadOffered, useSupersedingBuild } from '#hooks/use-superseding-build.js';

/** Set by {@link BrowserUpdateReveal} when writes stop; the next {@link BrowserUpdate} to look opens its popover. */
let pendingReveal = false;
const revealTopic = new Topic<void>({ name: 'browser-update-reveal' });

/**
 * Opens the sidebar once writes stop, so the stop never goes unseen. It renders nothing and is
 * mounted beside the sidebar, not in it: the mobile sidebar is a sheet whose content, and with it
 * {@link BrowserUpdate}, is unmounted while closed. An offer alone (a deploy in a lone tab that
 * still writes) reveals nothing, a remount does not replay a reveal, and a withdrawn offer reveals
 * nothing.
 */
export function BrowserUpdateReveal(): undefined {
  const { isMobile, setOpen, setOpenMobile } = useSidebar();
  useEffect(() => {
    let wasStopped = isReloadOffered() && haveWritesStopped();
    return subscribeReloadOffer(() => {
      const isStopped = isReloadOffered() && haveWritesStopped();
      if (isStopped && !wasStopped) {
        if (isMobile) {
          setOpenMobile(true);
        } else {
          setOpen(true);
        }
        pendingReveal = true;
        revealTopic.emit();
      }
      wasStopped = isStopped;
    });
  }, [isMobile, setOpen, setOpenMobile]);
  return undefined;
}

const builtAt = (supersedingBuildId: number, isRolledBack: boolean): string | undefined =>
  supersedingBuildId > 0
    ? `Tau · ${isRolledBack ? 'Built' : 'Updated'} ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(supersedingBuildId)}`
    : undefined;

/**
 * Browser counterpart of `DesktopUpdate`: a tab whose bundle has been superseded
 * by a newer one in another tab (blueprint DF20) has stopped writing durable
 * state, and one a deploy replaced (`#lib/stale-build-recovery`) is running old
 * code; both surface the same sidebar control and offer a reload. The sidebar is the
 * only surface that shows an update: there is no floating banner. Pair it with
 * {@link BrowserUpdateReveal} outside the sidebar.
 */
export function BrowserUpdate(): React.JSX.Element | undefined {
  const superseded = useReloadOffered();
  const { supersedingBuildId, isRolledBack } = useSupersedingBuild();
  const [open, setOpen] = useState(false);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    // Opens the popover for a reveal, including one requested before this control mounted.
    const consumeReveal = (): void => {
      if (pendingReveal) {
        pendingReveal = false;
        setRevealed(true);
        setOpen(true);
      }
    };
    consumeReveal();
    return revealTopic.subscribe(consumeReveal);
  }, []);
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
