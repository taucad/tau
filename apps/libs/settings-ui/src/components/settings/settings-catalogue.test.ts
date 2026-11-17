import { describe, expect, it } from 'vitest';
import { createSettingsCatalogue, searchSettings } from '#components/settings/settings-catalogue.js';

const catalogue = createSettingsCatalogue([
  { name: 'kernelTracing', label: 'Kernel tracing', description: 'Record kernel spans' },
  { name: 'gridSnap', label: 'Grid snap', description: 'Snap sketches to the grid' },
]);

const ids = (query: string): string[] =>
  searchSettings(query, catalogue).flatMap(({ entries }) => entries.map(({ id }) => id));

describe('createSettingsCatalogue', () => {
  it('should list the given flags under Experimental, in order, as flag entries with their copy', () => {
    const experimental = catalogue.find(({ id }) => id === 'experimental');

    expect(experimental?.group).toBe('Advanced');
    expect(experimental?.entries).toEqual([
      {
        id: 'flag-kernelTracing',
        label: 'Kernel tracing',
        description: 'Record kernel spans',
        keywords: ['feature', 'flags'],
      },
      {
        id: 'flag-gridSnap',
        label: 'Grid snap',
        description: 'Snap sketches to the grid',
        keywords: ['feature', 'flags'],
      },
    ]);
  });

  it('should give every setting a globally unique id', () => {
    const entries = catalogue.flatMap(({ entries }) => entries);

    expect(new Set(entries.map(({ id }) => id)).size).toBe(entries.length);
  });

  it('should keep every section, ungated, for the host to filter', () => {
    expect(catalogue.map(({ id }) => id)).toEqual([
      'general',
      'account',
      'security',
      'repositories',
      'billing',
      'data-controls',
      'viewer',
      'compute',
      'machines',
      'models',
      'agents',
      'filesystem',
      'browser',
      'experimental',
    ]);
  });
});

describe('searchSettings', () => {
  it('should return no results for an empty query', () => {
    expect(searchSettings(' \t ', catalogue)).toEqual([]);
  });

  it('should normalize case, diacritics, and punctuation', () => {
    expect(ids('ACCENT---CÓLOR')).toContain('accent-color');
  });

  it('should match every query token across section and setting text', () => {
    const result = searchSettings('data training', catalogue);

    expect(result).toHaveLength(1);
    expect(result[0]?.section.id).toBe('data-controls');
    expect(result[0]?.entries.map(({ id }) => id)).toEqual(['improve-service']);
  });

  it('should reject results when any query token is unmatched', () => {
    expect(searchSettings('theme storage', catalogue)).toEqual([]);
  });

  it('should match setting aliases', () => {
    expect(ids('colour')).toContain('accent-color');
    expect(ids('cache')).toContain('compute-reuse');
    expect(ids('dark mode')).toContain('theme');
    expect(ids('colour theme')).toContain('theme');
    expect(ids('cursor hand')).toContain('pointer-cursors');
  });

  it('should rank an exact setting label before section-wide matches', () => {
    expect(ids('filesystem')[0]).toBe('filesystem-context');
  });

  it('should find the flags it is given by their label', () => {
    expect(ids('kernel tracing')).toEqual(['flag-kernelTracing']);
  });

  it('should search only the sections it is given', () => {
    const withoutBilling = catalogue.filter(({ id }) => id !== 'billing');

    expect(ids('top up')).toContain('credit-balance');
    expect(
      searchSettings('top up', withoutBilling).flatMap(({ entries }) => entries.map(({ id }) => id)),
    ).not.toContain('credit-balance');
  });
});
