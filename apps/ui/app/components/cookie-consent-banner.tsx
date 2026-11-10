import { useEffect, useSyncExternalStore } from 'react';
import { writeConsent } from '@taucad/consent';
import { Button } from '@taucad/ui/components/button';
import { useCookieConsent } from '#hooks/use-cookie-consent.js';
import { legalUrl } from '#lib/legal-url.js';

/**
 * While the banner is mounted, a focused control scrolls clear of it (WCAG 2.4.11). Scroll margin on the focused
 * element works in whichever container scrolls, and the rem-based spacing grows with text zoom as the banner does.
 * `<body>` carries no React-owned class, so toggling it here cannot race the root's theme classes.
 */
const bannerFocusClearanceClass = '[&_:focus]:scroll-mb-48';

const subscribeNever = (): (() => void) => () => undefined;
/** Do Not Track suppresses the offer, as on the website; it is read in the browser only, after hydration. */
const readDoNotTrack = (): boolean => globalThis.navigator.doNotTrack === '1';
const readDoNotTrackOnServer = (): boolean => false;

/**
 * First-visit analytics offer for a web visitor with no recorded decision.
 *
 * The decision is the `@taucad/consent` cookie the website shares, so a choice here also applies to the
 * Tau website, and a choice made there hides this. Global Privacy Control is a recorded decline
 * (`readConsentStatus`), so it never shows under GPC. Help → Cookie preferences changes the decision later.
 * Web only: the desktop root does not mount it.
 *
 * @returns The banner, or nothing once a decision exists.
 */
export function CookieConsentBanner(): React.JSX.Element | undefined {
  const consentStatus = useCookieConsent();
  const doNotTrack = useSyncExternalStore(subscribeNever, readDoNotTrack, readDoNotTrackOnServer);
  const isShown = consentStatus === 'unknown' && !doNotTrack;

  useEffect(() => {
    if (!isShown) {
      return undefined;
    }
    document.body.classList.add(bannerFocusClearanceClass);
    return () => {
      document.body.classList.remove(bannerFocusClearanceClass);
    };
  }, [isShown]);

  if (!isShown) {
    return undefined;
  }

  return (
    <aside
      aria-label='Optional analytics'
      className='fixed right-2 bottom-2 z-50 flex max-w-sm flex-col gap-3 rounded-lg border bg-card p-4 text-card-foreground shadow-md duration-300 fade-in slide-in-from-bottom-4 motion-safe:animate-in max-sm:left-2'
    >
      <p className='text-sm'>
        <strong className='font-semibold'>Help us improve Tau?</strong>
        <br />
        <span className='text-muted-foreground'>
          Allow optional analytics, including session recording. Your choice also applies to the Tau website.{' '}
          <a href={legalUrl('cookies')} target='_blank' rel='noopener noreferrer' className='underline'>
            Cookie policy
          </a>
        </span>
      </p>
      <div className='flex justify-end gap-2'>
        <Button
          variant='outline'
          size='sm'
          onClick={() => {
            writeConsent('declined');
          }}
        >
          Continue without
        </Button>
        <Button
          size='sm'
          onClick={() => {
            writeConsent('accepted');
          }}
        >
          Allow analytics
        </Button>
      </div>
    </aside>
  );
}
