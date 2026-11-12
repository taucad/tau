import { deviceSection, onboardingSection, personProfileSection, viewerPreferencesSection } from '@taucad/preferences';
import { cookieName } from '@taucad/ui-core/constants/cookie.constants';
import { createSectionStore } from '#preferences/section-store.js';

/** This browser profile's person record, one store per section. It is not keyed by account. */
export const personRecordStores = {
  profile: createSectionStore(cookieName.personProfile, personProfileSection),
  viewer: createSectionStore(cookieName.viewerPreferences, viewerPreferencesSection),
  onboarding: createSectionStore(cookieName.onboarding, onboardingSection),
} as const;

/** This computer's device record. It never syncs. */
export const deviceRecordStore = createSectionStore(cookieName.device, deviceSection);
