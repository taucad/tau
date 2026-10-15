import { useSyncExternalStore } from 'react';
import { useRouteLoaderData } from 'react-router';
import { consentCookieName } from '#constants/cookie.constants.js';
import type { RootLoaderData } from '#root-layout.js';
import { readConsentStatus } from '#lib/cookie-consent.lib.js';
import { recordRequestGlobalPrivacyControl } from '#lib/global-privacy-control.lib.js';
import type { ConsentStatus } from '#lib/cookie-consent.lib.js';

type ConsentLoaderData = RootLoaderData & {
  readonly consentStatus: ConsentStatus;
  readonly globalPrivacyControl?: boolean;
};

/** The marketing site posts here after it writes a decision, so open app tabs re-read the cookie. */
const consentChannelName = 'tau-cookie-consent';

/*
 * The cookie is the source of truth; these signals only prompt a re-read.
 * Cookie Store reports foreground changes where supported; focus and visibility
 * cover browsers without it after the next activation.
 */
const subscribe = (listener: () => void): (() => void) => {
  const channel = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel(consentChannelName);
  const cookieStore = Reflect.get(globalThis, 'cookieStore') as EventTarget | undefined;
  const onCookieChange = (event: Event): void => {
    const change = event as Event & {
      readonly changed?: ReadonlyArray<{ readonly name: string }>;
      readonly deleted?: ReadonlyArray<{ readonly name: string }>;
    };
    if ([...(change.changed ?? []), ...(change.deleted ?? [])].some(({ name }) => name === consentCookieName)) {
      listener();
    }
  };
  channel?.addEventListener('message', listener);
  cookieStore?.addEventListener('change', onCookieChange);
  globalThis.addEventListener('focus', listener);
  document.addEventListener('visibilitychange', listener);
  return () => {
    channel?.close();
    cookieStore?.removeEventListener('change', onCookieChange);
    globalThis.removeEventListener('focus', listener);
    document.removeEventListener('visibilitychange', listener);
  };
};

/**
 * Web-only analytics consent, read from the cookie the marketing site (`apps/www`) writes.
 * The app has no consent UI of its own; visitors give, change and withdraw consent on the website.
 *
 * @returns The effective decision, overridden by Global Privacy Control.
 */
export function useCookieConsent(): ConsentStatus {
  const loaderData = useRouteLoaderData<ConsentLoaderData>('root');
  // Before the first client snapshot, so hydration never resolves a stale acceptance.
  recordRequestGlobalPrivacyControl(loaderData?.globalPrivacyControl === true);
  return useSyncExternalStore(subscribe, readConsentStatus, () => loaderData?.consentStatus ?? 'unknown');
}
