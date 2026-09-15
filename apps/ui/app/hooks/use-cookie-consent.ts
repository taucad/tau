import * as Cookies from 'es-cookie';
import { useEffect, useSyncExternalStore } from 'react';
import { useRouteLoaderData } from 'react-router';
import { Topic } from '@taucad/events';
import { consentCookieName } from '#constants/cookie.constants.js';
import type { RootLoaderData } from '#root-layout.js';
import { isGlobalPrivacyControlEnabled, parseStoredConsent, readConsentStatus } from '#lib/cookie-consent.lib.js';
import type { ConsentStatus } from '#lib/cookie-consent.lib.js';

type StoredConsent = {
  readonly status: Exclude<ConsentStatus, 'unknown'>;
  readonly version: 1;
};

const consentLifetimeDays = 365;
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
};

const subscribe = (listener: () => void): (() => void) => consentTopic.subscribe(listener);

/** Web-only analytics consent, kept separate from ordinary UI preferences. */
export function useCookieConsent(): readonly [ConsentStatus, (status: Exclude<ConsentStatus, 'unknown'>) => void] {
  const loaderData = useRouteLoaderData<RootLoaderData & { readonly consentStatus: ConsentStatus }>('root');
  const status = useSyncExternalStore(subscribe, readConsentStatus, () => loaderData?.consentStatus ?? 'unknown');

  useEffect(() => {
    const stored = parseStoredConsent(Cookies.get(consentCookieName));
    if (stored.legacy && stored.status !== 'unknown') {
      writeConsentStatus(stored.status);
    }
  }, []);

  return [status, writeConsentStatus] as const;
}
