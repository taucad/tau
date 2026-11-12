import { describe, expect, it } from 'vitest';
import { personFieldFromProfile } from '#person-field.js';
import { emptyPersonProfile } from '#person-profile.js';
import type { PersonProfile } from '#person-profile.js';

const profile = (patch: Partial<PersonProfile>): PersonProfile => ({ ...emptyPersonProfile, ...patch });

describe('personFieldFromProfile', () => {
  it('should send goals and languages in setup order, never the tool', () => {
    expect(
      personFieldFromProfile(profile({ goals: ['electronics', 'mechanical'], languages: ['python'], tool: 'kicad' })),
    ).toEqual({ makes: ['mechanical', 'electronics'], reads: ['python'] });
  });

  it('should keep "no code" as a language', () => {
    expect(personFieldFromProfile(profile({ goals: ['art'], languages: ['none'] }))).toEqual({
      makes: ['art'],
      reads: ['none'],
    });
  });

  it('should leave "Just exploring" out', () => {
    expect(personFieldFromProfile(profile({ goals: ['exploring'], languages: ['typescript'] }))).toEqual({
      makes: [],
      reads: ['typescript'],
    });
  });

  it.each([
    ['nothing answered', emptyPersonProfile],
    ['only "Just exploring"', profile({ goals: ['exploring'] })],
    ['only a tool', profile({ tool: 'fusion' })],
  ])('should build no field for %s', (_name, input) => {
    expect(personFieldFromProfile(input)).toBeUndefined();
  });
});
