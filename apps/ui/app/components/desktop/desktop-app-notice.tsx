import { useSyncExternalStore } from 'react';
import { Tau } from '@taucad/ui-kit/icons/tau';
import { SidebarNoticeCard, useSidebarNoticeDismissal } from '#components/nav/sidebar-notices.js';
import { isTauDesktopReleased } from '#components/desktop/open-in-desktop.js';
import { isDesktopTarget } from '#lib/build-target.js';
import { osClass } from '#telemetry/platform-class.js';

/**
 * The marketing site's download page, served on the app's own origin by the marketing edge
 * (`netlify/edge-functions/marketing.ts`). It picks the visitor's platform and lists the
 * macOS, Windows and Linux builds, which GitHub's release page does not.
 */
export const tauDownloadsPath = '/download';

/** The per-device dismissal id. Renaming it shows the offer again on every device. */
export const desktopAppNoticeId = 'desktop-app';

// OS facts are stable for this page; phones and tablets cannot run Tau Desktop.
const subscribePlatform = (): (() => void) => () => undefined;
const canRunDesktop = (): boolean => {
  const platform = osClass();
  return platform === 'macos' || platform === 'windows' || platform === 'linux';
};
const serverCanRunDesktop = (): boolean => false;

/**
 * "Try Tau on desktop": a dismissible sidebar card that links to the downloads page. Shown only
 * in a browser build that offers the desktop download (`TAU_DESKTOP_RELEASED`), on a computer
 * that can run it, until this device dismisses it.
 */
export function DesktopAppNotice(): React.JSX.Element | undefined {
  const [isDismissed, dismiss] = useSidebarNoticeDismissal(desktopAppNoticeId);
  const isSupported = useSyncExternalStore(subscribePlatform, canRunDesktop, serverCanRunDesktop);
  if (isDesktopTarget() || !isTauDesktopReleased() || !isSupported || isDismissed) {
    return undefined;
  }
  return (
    <SidebarNoticeCard
      title='Try Tau on desktop'
      icon={<Tau />}
      action={{ label: 'Download', href: tauDownloadsPath, opensInNewTab: true }}
      dismissLabel='Dismiss desktop app offer'
      onDismiss={dismiss}
    />
  );
}
