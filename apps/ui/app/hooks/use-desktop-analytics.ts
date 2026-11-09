/**
 * The desktop app's analytics choice (legal decision Q3): product analytics run unless the person turns them off in
 * Settings → Data controls, and the app says so once at first launch. The choice is a device preference in the app's
 * local storage, beside its other preferences; the desktop app has no cookie consent.
 *
 * @module
 */

import { useCallback, useSyncExternalStore } from 'react';
import { cookieName } from '#constants/cookie.constants.js';
import { metaConfig } from '#constants/meta.constants.js';
import { store } from '#hooks/use-cookie.js';

/** The storage names `useCookie` would give these preferences. */
export const desktopAnalyticsStorageName = `${metaConfig.cookiePrefix}${cookieName.desktopAnalytics}`;
export const desktopAnalyticsNoticeStorageName = `${metaConfig.cookiePrefix}${cookieName.desktopAnalyticsNotice}`;

/** Copy for the Data controls switch and the first-launch notice. It says "analytics" and names no vendor. */
export const desktopAnalyticsCopy = {
  label: 'Analytics',
  description: 'Send usage analytics to help improve Tau',
  details: [
    'Records how you use the app, such as which features you open, without session replay.',
    'Turning this off stops analytics, resets its identifier and clears its stored data on this device.',
    'Share usage and diagnostics and error reports are separate.',
  ],
  learnMore: 'Learn more',
  noticeTitle: 'Tau sends usage analytics',
  noticeDescription:
    'The desktop app sends usage analytics to help improve Tau. You can turn this off in Settings → Data controls.',
  noticeAction: 'Data controls',
} as const;

/** Anything but an explicit `false` is on: analytics run unless the person turns them off. */
const readEnabled = (): boolean => store.get<unknown>(desktopAnalyticsStorageName) !== false;

/*
 * The desktop renderer is a client-only SPA whose shell was rendered at build time, so the hydration snapshot is the
 * stored choice rather than a default. With the default, the hydration commit would start analytics a person turned
 * off, and switching it off again would clear the identity of a person who left it on. Outside a document (the build's
 * shell render) nothing runs, so the default answers.
 */
const readHydrationEnabled = (): boolean => (typeof document === 'undefined' ? true : readEnabled());

const subscribe = (listener: () => void): (() => void) => store.subscribe(desktopAnalyticsStorageName, listener);

/**
 * The desktop analytics switch.
 *
 * @returns Whether analytics are on, and the writer for the person's choice.
 */
export function useDesktopAnalytics(): readonly [isEnabled: boolean, setEnabled: (isEnabled: boolean) => void] {
  const isEnabled = useSyncExternalStore(subscribe, readEnabled, readHydrationEnabled);
  const setEnabled = useCallback((next: boolean): void => {
    store.update(desktopAnalyticsStorageName, next);
  }, []);
  return [isEnabled, setEnabled];
}

/**
 * Records the first-launch notice as shown, unless it already was. Read at the moment of showing, never from a
 * render snapshot, so a hydration default cannot show it twice.
 *
 * @returns Whether this call is the first, and so should show the notice.
 */
export const claimDesktopAnalyticsNotice = (): boolean => {
  if (store.get<unknown>(desktopAnalyticsNoticeStorageName) === true) {
    return false;
  }
  store.update(desktopAnalyticsNoticeStorageName, true);
  return true;
};
