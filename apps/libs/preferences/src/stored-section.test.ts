import { describe, expect, it } from 'vitest';
import {
  deviceSection,
  emptyOnboardingState,
  emptyPersonProfile,
  onboardingSection,
  personProfileSection,
  prepareSectionWrite,
  readSection,
  storedSectionSchema,
  viewerPreferencesSection,
  personProfileSchema,
} from '@taucad/preferences';
import type { PersonProfile } from '@taucad/preferences';

const profile: PersonProfile = { version: 1, goals: ['printing'], tool: 'slicer', languages: ['none'] };

describe('storedSectionSchema', () => {
  const schema = storedSectionSchema(personProfileSchema);

  it('accepts a value with no synced half, as every launch device stores it', () => {
    expect(schema.safeParse({ value: profile }).success).toBe(true);
  });

  it('accepts a value with the synced half account sync will write', () => {
    expect(schema.safeParse({ value: profile, synced: { value: emptyPersonProfile, revision: 3 } }).success).toBe(true);
  });

  it('refuses a synced half without an integer revision', () => {
    expect(schema.safeParse({ value: profile, synced: { value: profile, revision: -1 } }).success).toBe(false);
    expect(schema.safeParse({ value: profile, synced: { value: profile } }).success).toBe(false);
  });
});

describe('readSection', () => {
  it('reads an absent key, unreadable text or an invalid value as empty', () => {
    for (const raw of [undefined, '', 'not json', '[]', '{"value":{"version":1,"goals":"printing"}}']) {
      expect(readSection(personProfileSection, raw)).toEqual({ status: 'empty', value: emptyPersonProfile });
    }
  });

  it('reads a stored section', () => {
    const read = readSection(personProfileSection, JSON.stringify({ value: profile }));
    expect(read).toEqual({ status: 'current', value: profile, stored: { value: profile } });
  });

  it('does not parse a section a later build wrote, and reads as empty', () => {
    const newer = JSON.stringify({ value: { version: 2, goals: 'a shape this build cannot read' } });
    expect(readSection(personProfileSection, newer)).toEqual({ status: 'newer', value: emptyPersonProfile });
    const newerSynced = JSON.stringify({ value: profile, synced: { value: { version: 2 }, revision: 1 } });
    expect(readSection(personProfileSection, newerSynced).status).toBe('newer');
  });
});

describe('prepareSectionWrite', () => {
  it('merges into what is stored, not into a copy the caller holds', () => {
    const stored = JSON.stringify({ value: { ...emptyOnboardingState, tour: { seen: ['look'], wanted: false } } });
    const write = prepareSectionWrite(onboardingSection, stored, { seenAdd: ['ask'] });
    expect(write.status).toBe('write');
    expect(write.status === 'write' && JSON.parse(write.raw)).toEqual({
      value: { version: 1, tour: { seen: ['ask', 'look'], wanted: false } },
    });
  });

  it('starts from the empty section when nothing is stored', () => {
    const write = prepareSectionWrite(deviceSection, undefined, { tourPaused: true });
    expect(write).toEqual({
      status: 'write',
      value: { version: 1, tourPaused: true },
      raw: '{"value":{"version":1,"tourPaused":true}}',
    });
  });

  it('drops the retired trackpad key and keeps the rest of the device record', () => {
    const stored = JSON.stringify({ value: { version: 1, inputDevice: 'trackpad', tourPaused: true } });
    expect(readSection(deviceSection, stored).value).toEqual({ version: 1, tourPaused: true });
    const write = prepareSectionWrite(deviceSection, stored, { inviteDismissed: true });
    expect(write.status === 'write' && JSON.parse(write.raw)).toEqual({
      value: { version: 1, tourPaused: true, inviteDismissed: true },
    });
  });

  it('drops view defaults Settings no longer offers and keeps the rest of the viewer section', () => {
    const stored = JSON.stringify({
      value: {
        version: 1,
        controls: {},
        gizmo: {},
        viewDefaults: {
          'display.surfaces': false,
          'display.lines': false,
          'display.postProcessing': true,
          'display.grid': false,
        },
      },
    });
    expect(readSection(viewerPreferencesSection, stored).value.viewDefaults).toEqual({ 'display.grid': false });
  });

  it('keeps the synced half as it was', () => {
    const synced = { value: profile, revision: 4 };
    const write = prepareSectionWrite(personProfileSection, JSON.stringify({ value: profile, synced }), {
      tool: 'blender',
    });
    expect(write.status === 'write' && JSON.parse(write.raw)).toEqual({
      value: { ...profile, tool: 'blender' },
      synced,
    });
  });

  it('never prepares a write over a section a later build wrote', () => {
    const newer = JSON.stringify({ value: { version: 2 } });
    expect(prepareSectionWrite(viewerPreferencesSection, newer, { controls: { invertZoom: true } })).toEqual({
      status: 'newer',
      value: { version: 1, controls: { invertZoom: true }, gizmo: {}, viewDefaults: {} },
    });
  });

  it('refuses a write that would store an invalid value', () => {
    expect(() =>
      prepareSectionWrite(viewerPreferencesSection, undefined, { viewDefaults: { fieldOfView: 120 } }),
    ).toThrow();
  });
});
