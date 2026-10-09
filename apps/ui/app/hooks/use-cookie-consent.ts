import * as Cookies from 'es-cookie';
import { useEffect, useSyncExternalStore } from 'react';
import { useRouteLoaderData } from 'react-router';
import { Topic } from '@taucad/events';
import { consentCookieName } from '#constants/cookie.constants.js';
import type { RootLoaderData } from '#root-layout.js';
import { parseStoredConsent, readConsentStatus } from '#lib/cookie-consent.lib.js';
import { isGlobalPrivacyControlEnabled, recordRequestGlobalPrivacyControl } from '#lib/global-privacy-control.lib.js';
import type { ConsentStatus } from '#lib/cookie-consent.lib.js';

type StoredConsent = {
  readonly status: Exclude<ConsentStatus, 'unknown'>;
  readonly version: 1;
};

type ConsentLoaderData = RootLoaderData & {
  readonly consentStatus: ConsentStatus;
  readonly globalPrivacyControl?: boolean;
};

const consentLifetimeDays = 365;
/** Other documents of this origin re-read the cookie when a decision is written. */
const consentChannelName = 'tau-cookie-consent';
const consentTopic = new Topic<void>({ name: 'cookie-consent' });

const writeConsentStatus = (status: Exclude<ConsentStatus, 'unknown'>): void => {
  const effectiveStatus = isGlobalPrivacyControlEnabled() ? 'declined' : status;
  const stored: StoredConsent = { status: effectiveStatus, version: 1 };
  const attributes = {
    expires: consentLifetimeDays,
    path: '/',
    sameSite: 'lax',
  } as const;
  if (globalThis.location.protocol === 'https:') {
    Cookies.set(consentCookieName, JSON.stringify(stored), { ...attributes, secure: true });
  } else {
    Cookies.set(consentCookieName, JSON.stringify(stored), attributes);
  }
  consentTopic.emit();
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel(consentChannelName);
    channel.postMessage(effectiveStatus);
    channel.close();
  }
};

/*
 * The cookie is the source of truth; these signals only prompt a re-read.
 * Cookie Store reports foreground expiry where supported; focus and visibility
 * cover browsers without it after the next activation.
 */
const subscribe = (listener: () => void): (() => void) => {
  const unsubscribe = consentTopic.subscribe(listener);
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
    unsubscribe();
    channel?.close();
    cookieStore?.removeEventListener('change', onCookieChange);
    globalThis.removeEventListener('focus', listener);
    document.removeEventListener('visibilitychange', listener);
  };
};

/** Web-only analytics consent, kept separate from ordinary UI preferences. */
export function useCookieConsent(): readonly [ConsentStatus, (status: Exclude<ConsentStatus, 'unknown'>) => void] {
  const loaderData = useRouteLoaderData<ConsentLoaderData>('root');
  // Before the first client snapshot, so hydration never resolves a stale acceptance.
  recordRequestGlobalPrivacyControl(loaderData?.globalPrivacyControl === true);
  const status = useSyncExternalStore(subscribe, readConsentStatus, () => loaderData?.consentStatus ?? 'unknown');

  useEffect(() => {
    const stored = parseStoredConsent(Cookies.get(consentCookieName));
    if (stored.legacy && stored.status !== 'unknown') {
      writeConsentStatus(stored.status);
    }
  }, []);

  return [status, writeConsentStatus] as const;
}
