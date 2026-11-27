import { useEffect, useState, useSyncExternalStore } from 'react';
import { ArrowUpCircle, RotateCw } from 'lucide-react';
import { Topic } from '@taucad/events';
import { useSidebar } from '@taucad/ui/components/sidebar';
import { haveWritesStopped, isReloadOffered, subscribeReloadOffer } from '#filesystem/build-skew.js';
import { UpdateControl } from '#components/nav/update-control.js';
import { useReloadOffered, useSupersedingBuild } from '#hooks/use-superseding-build.js';

/** Set by {@link BrowserUpdateReveal} when writes stop; the next {@link BrowserUpdate} to look opens its details. */
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

const dateFormat = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/**
 * The date line: when the version the reload switches to was published. The year is left out so the line fits the
 * sidebar.
 *
 * @param supersedingBuildId - The build the reload switches to, a timestamp (`0` when unknown).
 * @param isRolledBack - Whether that build is older than this one.
 * @returns The line, or nothing without a build date.
 */
export const updateDateLine = (supersedingBuildId: number, isRolledBack: boolean): string | undefined =>
  supersedingBuildId > 0
    ? `Tau · ${isRolledBack ? 'Version from' : 'Updated'} ${dateFormat.format(supersedingBuildId)}`
    : undefined;

/**
 * The notice's title and detail. Saving stops only when another tab announced a different version
 * (`#filesystem/build-skew`), and the only work it stops is the project library's discovery pass
 * (`#runtime/project-library`), so "your project list" is the widest truthful claim. A replaced build may fail to
 * load parts it has not loaded yet, since the deploy took its files away.
 *
 * @param state - Whether this tab stopped saving, and whether the reload goes back to an older version.
 * @returns The copy for that state.
 */
export const updateCopy = ({
  hasStoppedSaving,
  isRolledBack,
}: {
  readonly hasStoppedSaving: boolean;
  readonly isRolledBack: boolean;
}): { readonly title: string; readonly detail: string } => {
  if (hasStoppedSaving) {
    return {
      title: 'Reload needed',
      detail: isRolledBack
        ? 'This version of Tau was withdrawn, and this tab has stopped saving changes to your project list. Reload to resume.'
        : 'A newer Tau is open in another tab, so this tab has stopped saving changes to your project list. Reload to resume.',
    };
  }
  return isRolledBack
    ? {
        title: 'Version withdrawn',
        detail: 'This version of Tau was withdrawn. Reload when you’re ready to switch to the current version.',
      }
    : {
        title: 'Update ready',
        detail: 'Reload when you’re ready to get the latest version. Until then, some parts of Tau may not load.',
      };
};

const serverStopped = (): boolean => false;

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
  // The offer topic also fires when writes stop for good, so it drives this too.
  const hasStoppedSaving = useSyncExternalStore(subscribeReloadOffer, haveWritesStopped, serverStopped);
  const { supersedingBuildId, isRolledBack } = useSupersedingBuild();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    // Opens the details for a reveal, including one requested before this control mounted.
    const consumeReveal = (): void => {
      if (pendingReveal) {
        pendingReveal = false;
        setOpen(true);
      }
    };
    consumeReveal();
    return revealTopic.subscribe(consumeReveal);
  }, []);
  if (!superseded) {
    return undefined;
  }
  const { title, detail } = updateCopy({ hasStoppedSaving, isRolledBack });
  return (
    <UpdateControl
      title={title}
      version={updateDateLine(supersedingBuildId, isRolledBack)}
      detail={detail}
      icon={isRolledBack ? RotateCw : ArrowUpCircle}
      isOpen={open}
      action={{
        label: 'Reload now',
        variant: 'default',
        onClick: () => {
          globalThis.location.reload();
        },
      }}
      onOpenChange={setOpen}
    />
  );
}
