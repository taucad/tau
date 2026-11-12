import { useSyncExternalStore } from 'react';
import type {
  LeafPatch,
  OnboardingDelta,
  OnboardingState,
  PersonProfile,
  ViewerPreferences,
} from '@taucad/preferences';
import { personRecordStores } from '#preferences/person-record.store.js';
import type { SectionStore, SectionWriteResult } from '#preferences/section-store.js';

const useSection = <T, Write>(store: SectionStore<T, Write>): T =>
  useSyncExternalStore(store.subscribe, store.read, store.readInitial);

/** The person record on this device and its writers. */
export type PersonRecord = Readonly<{
  profile: PersonProfile;
  viewer: ViewerPreferences;
  onboarding: OnboardingState;
  /** Set or reset profile leaves. */
  writeProfile: (patch: LeafPatch<PersonProfile>) => SectionWriteResult;
  /** Set or reset viewer-preference leaves. */
  writeViewer: (patch: LeafPatch<ViewerPreferences>) => SectionWriteResult;
  /** Add onboarding progress; it never removes any. */
  writeOnboarding: (delta: OnboardingDelta) => SectionWriteResult;
}>;

const writers = {
  writeProfile: personRecordStores.profile.write,
  writeViewer: personRecordStores.viewer.write,
  writeOnboarding: personRecordStores.onboarding.write,
};

/**
 * Read and write the person record stored on this device. A change in another tab appears without a reload. Every
 * write merges into what is stored at that moment and returns whether it was saved.
 *
 * @returns The three sections and their writers.
 */
export const usePersonRecord = (): PersonRecord => {
  const profile = useSection(personRecordStores.profile);
  const viewer = useSection(personRecordStores.viewer);
  const onboarding = useSection(personRecordStores.onboarding);
  return { profile, viewer, onboarding, ...writers };
};
