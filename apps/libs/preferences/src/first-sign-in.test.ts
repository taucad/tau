import { describe, expect, it } from 'vitest';
import {
  deviceRecordSchema,
  deviceSection,
  firstSignInMerge,
  onboardingSection,
  onboardingStateSchema,
  personProfileSchema,
  personProfileSection,
  readSection,
  storedSectionSchema,
  viewerPreferencesSchema,
  viewerPreferencesSection,
} from '@taucad/preferences';
import type {
  DeviceRecord,
  OnboardingState,
  SectionDefinition,
  StoredSection,
  SyncedSections,
  ViewerPreferences,
} from '@taucad/preferences';

/** Each section exactly as a launch device stores it: `{ value }`, no `synced` half, no clock. */
const launch: { [K in keyof SyncedSections]: StoredSection<SyncedSections[K]> } & {
  device: StoredSection<DeviceRecord>;
} = {
  'person-profile': {
    value: { version: 1, goals: ['mechanical', 'printing'], tool: 'solidworks', languages: ['python'] },
  },
  'viewer-preferences': {
    value: {
      version: 1,
      controls: { preset: 'middle-ctrl', zoomToCursor: false },
      gizmo: { style: 'axis-balls' },
      viewDefaults: { 'display.grid': false, 'grid.unit': 'in', fieldOfView: 0 },
    },
  },
  onboarding: {
    value: { version: 1, setup: { status: 'completed' }, tour: { wanted: true, seen: ['ask', 'look'] } },
  },
  device: { value: { version: 1, inviteDismissed: true, tourPaused: true } },
};

const keysOf = (value: unknown): unknown =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, keysOf(inner)]))
    : typeof value;

/** A launch copy read back and merged at first sign-in keeps every key it had, with or without an account copy. */
function expectShapeKept<K extends keyof SyncedSections, Write>(
  key: K,
  section: SectionDefinition<SyncedSections[K], Write>,
): void {
  const stored = launch[key];
  const read = readSection(section, JSON.stringify(stored));
  expect(read.status).toBe('current');
  expect(firstSignInMerge(key, read.value, undefined)).toEqual(stored.value);
  const withAccount = firstSignInMerge(key, read.value, read.value);
  expect(keysOf(withAccount)).toEqual(keysOf(stored.value));
  expect(storedSectionSchema(section.schema).parse({ value: withAccount })).toEqual({ value: withAccount });
}

describe('launch fixtures', () => {
  it('parse as stored sections with no synced half', () => {
    expect(storedSectionSchema(personProfileSchema).parse(launch['person-profile'])).toEqual(launch['person-profile']);
    expect(storedSectionSchema(viewerPreferencesSchema).parse(launch['viewer-preferences'])).toEqual(
      launch['viewer-preferences'],
    );
    expect(storedSectionSchema(onboardingStateSchema).parse(launch.onboarding)).toEqual(launch.onboarding);
    expect(storedSectionSchema(deviceRecordSchema).parse(launch.device)).toEqual(launch.device);
    expect(readSection(deviceSection, JSON.stringify(launch.device)).status).toBe('current');
  });

  it('pass the first sign-in merge unchanged in shape', () => {
    expectShapeKept('person-profile', personProfileSection);
    expectShapeKept('viewer-preferences', viewerPreferencesSection);
    expectShapeKept('onboarding', onboardingSection);
  });
});

describe('firstSignInMerge', () => {
  const device = launch['viewer-preferences'].value;

  it('uploads the device copy when the account holds none, and adopts the account copy when the device holds none', () => {
    expect(firstSignInMerge('viewer-preferences', device, undefined)).toBe(device);
    expect(firstSignInMerge('viewer-preferences', undefined, device)).toBe(device);
    expect(firstSignInMerge('onboarding', undefined, undefined)).toBeUndefined();
  });

  it("takes the account's leaves and fills only the leaves it does not hold from the device", () => {
    const account: ViewerPreferences = {
      version: 1,
      controls: { preset: 'tau' },
      gizmo: {},
      viewDefaults: { 'display.grid': true },
    };
    expect(firstSignInMerge('viewer-preferences', device, account)).toEqual({
      version: 1,
      controls: { preset: 'tau', zoomToCursor: false },
      gizmo: { style: 'axis-balls' },
      viewDefaults: { 'display.grid': true, 'grid.unit': 'in', fieldOfView: 0 },
    });
    const profile = launch['person-profile'].value;
    expect(firstSignInMerge('person-profile', profile, { version: 1, goals: ['art'], languages: [] })).toEqual({
      version: 1,
      goals: ['art'],
      tool: 'solidworks',
      languages: [],
    });
  });

  it('merges onboarding by its own rules, so neither copy loses progress', () => {
    const account: OnboardingState = {
      version: 1,
      setup: { status: 'skipped' },
      tour: { seen: ['build'], ended: 'dismissed' },
    };
    expect(firstSignInMerge('onboarding', launch.onboarding.value, account)).toEqual({
      version: 1,
      setup: { status: 'completed' },
      tour: { wanted: true, seen: ['ask', 'look', 'build'], ended: 'dismissed' },
    });
  });
});
