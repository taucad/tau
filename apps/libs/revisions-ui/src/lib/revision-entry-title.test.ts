import { describe, expect, it } from 'vitest';
import { entryTitleOf } from '#lib/revision-entry-title.js';

describe('entryTitleOf', () => {
  it('reads the engine’s generated saves as a person does (C37)', () => {
    expect(entryTitleOf('Saved changes (save)')).toBe('Saved changes');
    expect(entryTitleOf('Saved changes (idle)')).toBe('Autosave');
    expect(entryTitleOf('Saved changes (close)')).toBe('Autosave');
  });

  /* Q9: the engine titles a turn's cuts itself, so they pass through as recorded. */
  it('keeps a title the engine or a person wrote', () => {
    expect(entryTitleOf('Make the lid walls 2.4 mm')).toBe('Make the lid walls 2.4 mm');
    expect(entryTitleOf('Agent change')).toBe('Agent change');
    expect(entryTitleOf('Autosave')).toBe('Autosave');
    expect(entryTitleOf('Saved changes (save) to the lid')).toBe('Saved changes (save) to the lid');
  });
});
