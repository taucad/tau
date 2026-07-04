import { describe, expect, it } from 'vitest';
import { composeFullName, isValidStoredName, parseSelectorPath } from '#selector/grammar.js';

describe('selector grammar', () => {
  describe('isValidStoredName (profile test vectors)', () => {
    it.each(['deck.left', 'mainBearingBore[3]', 'a1.b2', 'Block'])('should accept the valid vector %s', (name) => {
      expect(isValidStoredName(name)).toBe(true);
    });

    it.each(['.deck', 'deck..left', 'bore[0]', 'bore[*]', 'deck left', '9lives'])(
      'should reject the invalid vector %s',
      (name) => {
        expect(isValidStoredName(name)).toBe(false);
      },
    );
  });

  describe('parseSelectorPath', () => {
    it('should parse indexed segments with 1-based indices', () => {
      expect(parseSelectorPath('crank.mainJournal[2]')).toEqual([{ name: 'crank' }, { name: 'mainJournal', index: 2 }]);
    });

    it('should accept the selector-side [*] wildcard that stored names reject', () => {
      expect(parseSelectorPath('headL.boltHole[*]')).toEqual([{ name: 'headL' }, { name: 'boltHole', wildcard: true }]);
      expect(isValidStoredName('headL.boltHole[*]')).toBe(false);
    });

    it.each(['.deck', 'deck..left', 'bore[0]', 'deck left', '9lives', ''])(
      'should return undefined for the non-conforming path %j',
      (path) => {
        expect(parseSelectorPath(path)).toBeUndefined();
      },
    );
  });

  describe('composeFullName', () => {
    it('should compose occurrence path and part-relative name with a dot', () => {
      expect(composeFullName('bankL.block', 'deck.left')).toBe('bankL.block.deck.left');
    });

    it('should return the part-relative name unchanged for an empty occurrence path', () => {
      expect(composeFullName('', 'deck.left')).toBe('deck.left');
    });
  });
});
