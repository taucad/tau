import { describe, expect, it } from 'vitest';
import { searchSettings, settingsSections } from '#components/settings/settings-registry.js';
import { featureFlagNames } from '#flags/flag.constants.js';

describe('searchSettings', () => {
  it('should return no results for an empty query', () => {
    expect(searchSettings(' \t ')).toEqual([]);
  });

  it('should normalize case, diacritics, and punctuation', () => {
    const result = searchSettings('ACCENT---CÓLOR');

    expect(result.flatMap(({ entries }) => entries.map(({ id }) => id))).toContain('accent-color');
  });

  it('should match every query token across section and setting text', () => {
    const result = searchSettings('general privacy');

    expect(result).toHaveLength(1);
    expect(result[0]?.section.id).toBe('general');
    expect(result[0]?.entries.map(({ id }) => id)).toEqual(['privacy']);
  });

  it('should reject results when any query token is unmatched', () => {
    expect(searchSettings('theme storage')).toEqual([]);
  });

  it('should match setting aliases', () => {
    expect(searchSettings('colour').flatMap(({ entries }) => entries.map(({ id }) => id))).toContain('accent-color');
    expect(searchSettings('cache').flatMap(({ entries }) => entries.map(({ id }) => id))).toContain('compute-reuse');
    expect(searchSettings('dark mode').flatMap(({ entries }) => entries.map(({ id }) => id))).toContain('theme');
    expect(searchSettings('colour theme').flatMap(({ entries }) => entries.map(({ id }) => id))).toContain('theme');
    expect(searchSettings('cursor hand').flatMap(({ entries }) => entries.map(({ id }) => id))).toContain(
      'pointer-cursors',
    );
  });

  it('should include every setting when its section matches', () => {
    const result = searchSettings('agents');

    expect(result).toHaveLength(1);
    expect(result[0]?.section.id).toBe('agents');
    expect(result[0]?.entries.map(({ id }) => id)).toEqual([
      'show-credits',
      'filesystem-context',
      'active-file',
      'open-tabs',
      'testing-tools',
    ]);
  });

  it('should rank an exact setting label before section-wide matches', () => {
    const ids = searchSettings('filesystem').flatMap(({ entries }) => entries.map(({ id }) => id));

    expect(ids[0]).toBe('filesystem-context');
  });

  it('should register every feature flag with globally unique setting ids', () => {
    const entries = settingsSections.flatMap(({ entries }) => entries);
    const featureFlagIds = settingsSections.find(({ id }) => id === 'experimental')?.entries.map(({ id }) => id);

    expect(featureFlagIds).toEqual(featureFlagNames.map((flag) => `flag-${flag}`));
    expect(new Set(entries.map(({ id }) => id)).size).toBe(entries.length);
  });

  it('should keep API keys out of navigation and search', () => {
    expect(settingsSections.map(({ id }) => String(id))).not.toContain('api-keys');
    expect(searchSettings('API keys')).toEqual([]);
  });
});
