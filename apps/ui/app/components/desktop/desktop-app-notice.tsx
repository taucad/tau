import { lazy, Suspense, useSyncExternalStore } from 'react';
import type { ComponentType } from 'react';
import type { DesktopPlatform } from '@taucad/ui-kit/icons/platform-logos';
import type { DesktopAppNoticeCardProps } from '#components/desktop/desktop-app-notice-card.js';
import { useSidebarNoticeDismissal } from '#components/nav/sidebar-notices.js';
import { isTauDesktopReleased } from '#lib/desktop-release.js';
import { isDesktopTarget } from '#lib/build-target.js';
import { osClass } from '#telemetry/platform-class.js';

/*
 * Deferred tier (progressive loading policy): the card and the OS marks load only once this notice has decided to show
 * (a released build, a computer that runs Tau Desktop, not dismissed), which is never during SSR or hydration. A failed
 * load shows nothing: the offer is optional, and the next page load tries again.
 */
const DesktopAppNoticeCard = lazy<ComponentType<DesktopAppNoticeCardProps>>(async () => {
  try {
    return await import('#components/desktop/desktop-app-notice-card.js');
  } catch {
    return { default: (): undefined => undefined };
  }
});

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
    <Suspense fallback={undefined}>
      <DesktopAppNoticeCard platform={platform} onDismiss={dismiss} />
    </Suspense>
  );
}
