import { useSyncExternalStore } from 'react';
import { PlatformLogo } from '@taucad/ui-kit/icons/platform-logos';
import type { DesktopPlatform } from '@taucad/ui-kit/icons/platform-logos';
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

/** The mark for each OS that runs Tau Desktop, shared with the marketing site's download buttons. */
const desktopPlatforms: Readonly<Partial<Record<ReturnType<typeof osClass>, DesktopPlatform>>> = {
  macos: 'apple',
  windows: 'windows',
  linux: 'linux',
};

// OS facts are stable for this page; phones, tablets and unknown systems cannot run Tau Desktop.
const subscribePlatform = (): (() => void) => () => undefined;
const readDesktopPlatform = (): DesktopPlatform | undefined => desktopPlatforms[osClass()];
const serverDesktopPlatform = (): DesktopPlatform | undefined => undefined;

/**
 * "Try Tau on desktop": a dismissible sidebar card that links to the downloads page. Shown only
 * in a browser build that offers the desktop download (`TAU_DESKTOP_RELEASED`), on a computer
 * that can run it, until this device dismisses it. The tile shows that computer's OS mark.
 */
export function DesktopAppNotice(): React.JSX.Element | undefined {
  const [isDismissed, dismiss] = useSidebarNoticeDismissal(desktopAppNoticeId);
  const platform = useSyncExternalStore(subscribePlatform, readDesktopPlatform, serverDesktopPlatform);
  if (isDesktopTarget() || !isTauDesktopReleased() || platform === undefined || isDismissed) {
    return undefined;
  }
  return (
    <SidebarNoticeCard
      title='Try Tau on desktop'
      icon={<PlatformLogo platform={platform} />}
      action={{ label: 'Download', href: tauDownloadsPath, opensInNewTab: true }}
      dismissLabel='Dismiss desktop app offer'
      onDismiss={dismiss}
    />
  );
}
