import { useSyncExternalStore } from 'react';
import { useRouteLoaderData } from 'react-router';
import { consentChannelName, consentCookieName } from '@taucad/consent';
import type { RootLoaderData } from '#root-layout.js';
import { readConsentStatus } from '#lib/cookie-consent.lib.js';
import { recordRequestGlobalPrivacyControl } from '#lib/global-privacy-control.lib.js';
import type { ConsentStatus } from '@taucad/consent';

type ConsentLoaderData = RootLoaderData & {
  readonly consentStatus: ConsentStatus;
  readonly globalPrivacyControl?: boolean;
};

/*
 * The cookie is the source of truth; these signals only prompt a re-read. `writeConsent` posts on the
 * channel, including from this document.
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
 * Web-only analytics consent, read from the shared `@taucad/consent` cookie. The website's consent panel
 * and the app's Help → Cookie preferences dialog both write it; every write is announced on the channel.
 *
 * @returns The effective decision, overridden by Global Privacy Control.
 */
export function useCookieConsent(): ConsentStatus {
  const loaderData = useRouteLoaderData<ConsentLoaderData>('root');
  // Before the first client snapshot, so hydration never resolves a stale acceptance.
  recordRequestGlobalPrivacyControl(loaderData?.globalPrivacyControl === true);
  return useSyncExternalStore(subscribe, readConsentStatus, () => loaderData?.consentStatus ?? 'unknown');
}
