import { useEffect, useRef } from 'react';
import { toast } from '#components/ui/sonner.js';
import { useSettingsDialog } from '#hooks/use-settings-dialog.js';
import {
  claimDesktopAnalyticsNotice,
  desktopAnalyticsCopy,
  useDesktopAnalytics,
} from '#hooks/use-desktop-analytics.js';
import { legalUrl } from '#lib/legal-url.js';
import { posthogConfig } from '#lib/posthog.lib.js';

/** One id, so a second mount (Strict Mode, a remount) updates the same toast rather than stacking another. */
export const desktopAnalyticsNoticeId = 'desktop-analytics-notice';

/**
 * The desktop app's first-launch analytics notice (Q3): a toast that stays until dismissed, shown once per device.
 * It informs rather than asks, so analytics do not wait for it; it is shown only while analytics actually run, and is
 * recorded as shown the moment it appears.
 *
 * @returns Nothing; the notice is a toast.
 */
export function DesktopAnalyticsNotice(): undefined {
  const [isEnabled] = useDesktopAnalytics();
  const { open } = useSettingsDialog();
  /* The toast outlives this render; its action opens the dialog through the router's current setter. */
  const openSettings = useRef(open);
  useEffect(() => {
    openSettings.current = open;
  }, [open]);

  useEffect(() => {
    if (!isEnabled || posthogConfig.apiKey === '' || !claimDesktopAnalyticsNotice()) {
      return;
    }
    toast.info(desktopAnalyticsCopy.noticeTitle, {
      id: desktopAnalyticsNoticeId,
      description: (
        <>
          {desktopAnalyticsCopy.noticeDescription}{' '}
          <a href={legalUrl('cookies')} target='_blank' rel='noopener noreferrer' className='underline'>
            {desktopAnalyticsCopy.learnMore}
          </a>
        </>
      ),
      duration: Number.POSITIVE_INFINITY,
      action: {
        label: desktopAnalyticsCopy.noticeAction,
        onClick() {
          openSettings.current('data-controls', 'desktop-analytics');
        },
      },
    });
  }, [isEnabled]);

  return undefined;
}
