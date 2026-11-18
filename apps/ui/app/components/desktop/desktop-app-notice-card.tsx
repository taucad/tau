import { PlatformLogo } from '@taucad/ui-kit/icons/platform-logos';
import type { DesktopPlatform } from '@taucad/ui-kit/icons/platform-logos';
import { SidebarNoticeCard } from '#components/nav/sidebar-notices.js';

/**
 * The marketing site's download page, served on the app's own origin by the marketing edge
 * (`netlify/edge-functions/marketing.ts`). It picks the visitor's platform and lists the
 * macOS, Windows and Linux builds, which GitHub's release page does not.
 */
export const tauDownloadsPath = '/download';

/**
 * The "Try Tau on desktop" card itself, with the visitor's OS mark. It is reached only by the dynamic import in
 * `desktop-app-notice.tsx`, once that notice has decided to show, so the card and the marks stay out of every page's
 * first load.
 *
 * @param props - The visitor's platform and the dismissal.
 * @returns The card.
 */
export type DesktopAppNoticeCardProps = {
  readonly platform: DesktopPlatform;
  readonly onDismiss: () => void;
};

export default function DesktopAppNoticeCard({ platform, onDismiss }: DesktopAppNoticeCardProps): React.JSX.Element {
  return (
    <SidebarNoticeCard
      title='Try Tau on desktop'
      icon={<PlatformLogo platform={platform} />}
      action={{ label: 'Download', href: tauDownloadsPath, opensInNewTab: true }}
      dismissLabel='Dismiss desktop app offer'
      onDismiss={onDismiss}
    />
  );
}
