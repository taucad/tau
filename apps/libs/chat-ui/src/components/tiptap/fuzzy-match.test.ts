import { describe, it, expect } from 'vitest';
import { fuzzyMatch } from '#components/tiptap/fuzzy-match.js';

describe('fuzzyMatch', () => {
  describe('basic matching', () => {
    it('should match when all query characters appear sequentially in target', () => {
      const result = fuzzyMatch('abc', 'aXbXc');
      expect(result).toBeDefined();
      expect(result!.positions).toEqual([0, 2, 4]);
    });

    it('should return undefined when query characters are not found sequentially', () => {
      expect(fuzzyMatch('xyz', 'hello world')).toBeUndefined();
    });

    it('should return undefined when query is longer than target', () => {
      expect(fuzzyMatch('longquery', 'short')).toBeUndefined();
    });

    it('should return score 0 and empty positions for empty query', () => {
      const result = fuzzyMatch('', 'anything');
      expect(result).toEqual({ score: 0, positions: [] });
    });

    it('should match single character queries', () => {
      const result = fuzzyMatch('a', 'apple');
      expect(result).toBeDefined();
      expect(result!.positions).toEqual([0]);
    });
  });

  describe('case insensitivity', () => {
    it('should match case-insensitively', () => {
      const result = fuzzyMatch('PC', 'past chats');
      expect(result).toBeDefined();
      expect(result!.positions).toEqual([0, 5]);
    });

    it('should award a bonus for exact case matches', () => {
      const exactCase = fuzzyMatch('P', 'Past');
      const wrongCase = fuzzyMatch('p', 'Past');
      expect(exactCase).toBeDefined();
      expect(wrongCase).toBeDefined();
      expect(exactCase!.score).toBeGreaterThan(wrongCase!.score);
    });
  });

  describe('consecutive character bonus', () => {
    it('should score higher for consecutive matches than scattered matches', () => {
      const consecutive = fuzzyMatch('past', 'Past Chats');
      const scattered = fuzzyMatch('past', 'pXaXsXt');
      expect(consecutive).toBeDefined();
      expect(scattered).toBeDefined();
      expect(consecutive!.score).toBeGreaterThan(scattered!.score);
    });

    it('should award increasing bonuses for longer consecutive runs', () => {
      const twoConsec = fuzzyMatch('ab', 'abXX');
      const threeConsec = fuzzyMatch('abc', 'abcX');
      expect(twoConsec).toBeDefined();
      expect(threeConsec).toBeDefined();
      const perCharTwo = twoConsec!.score / 2;
      const perCharThree = threeConsec!.score / 3;
      expect(perCharThree).toBeGreaterThan(perCharTwo);
    });
  });

  describe('word boundary bonus', () => {
    it('should score higher when matches align with word boundaries', () => {
      const boundary = fuzzyMatch('pc', 'Past Chats');
      const nonBoundary = fuzzyMatch('pc', 'opic_ture');
      expect(boundary).toBeDefined();
      expect(nonBoundary).toBeDefined();
      expect(boundary!.score).toBeGreaterThan(nonBoundary!.score);
    });

    it('should detect camelCase transitions as word boundaries', () => {
      const result = fuzzyMatch('gI', 'getItems');
      expect(result).toBeDefined();
      expect(result!.positions).toEqual([0, 3]);
    });

    it('should detect separator characters as word boundaries', () => {
      const dash = fuzzyMatch('fb', 'foo-bar');
      expect(dash).toBeDefined();
      expect(dash!.positions).toEqual([0, 4]);

      const underscore = fuzzyMatch('fb', 'foo_bar');
      expect(underscore).toBeDefined();
      expect(underscore!.positions).toEqual([0, 4]);

      const dot = fuzzyMatch('fb', 'foo.bar');
      expect(dot).toBeDefined();
      expect(dot!.positions).toEqual([0, 4]);
    });
  });

  describe('prefix bonus', () => {
    it('should score higher when match starts at beginning of target', () => {
      const prefix = fuzzyMatch('ma', 'main.ts');
      const nonPrefix = fuzzyMatch('ma', 'xmain.ts');
      expect(prefix).toBeDefined();
      expect(nonPrefix).toBeDefined();
      expect(prefix!.score).toBeGreaterThan(nonPrefix!.score);
    });
  });

  describe('exact match', () => {
    it('should produce the highest score for an exact match', () => {
      const exact = fuzzyMatch('main.ts', 'main.ts');
      const partial = fuzzyMatch('main', 'main.ts');
      expect(exact).toBeDefined();
      expect(partial).toBeDefined();
      expect(exact!.score).toBeGreaterThan(partial!.score);
    });
  });

  describe('gap penalty', () => {
    it('should penalize gaps between matched characters', () => {
      const noGap = fuzzyMatch('ab', 'ab');
      const smallGap = fuzzyMatch('ab', 'aXb');
      const largeGap = fuzzyMatch('ab', 'aXXXXb');
      expect(noGap).toBeDefined();
      expect(smallGap).toBeDefined();
      expect(largeGap).toBeDefined();
      expect(noGap!.score).toBeGreaterThan(smallGap!.score);
      expect(smallGap!.score).toBeGreaterThan(largeGap!.score);
    });
  });

  describe('position tracking', () => {
    it('should return correct match positions', () => {
      const result = fuzzyMatch('pas', 'Past Chats');
      expect(result).toBeDefined();
      expect(result!.positions).toEqual([0, 1, 2]);
    });

    it('should return positions for word boundary matches', () => {
      const result = fuzzyMatch('ff', 'Files & Folders');
      expect(result).toBeDefined();
      expect(result!.positions).toEqual([0, 8]);
    });
  });

  describe('real-world scenarios', () => {
    it('should rank "Past Chats" higher than "parameters-sorter.ts" for query "pas"', () => {
      const pastChats = fuzzyMatch('pas', 'Past Chats');
      const parameterSorter = fuzzyMatch('pas', 'parameters-sorter.ts');
      expect(pastChats).toBeDefined();
      expect(parameterSorter).toBeDefined();
      expect(pastChats!.score).toBeGreaterThan(parameterSorter!.score);
    });

    it('should match "ts" against "Take Screenshot" at word boundaries', () => {
      const result = fuzzyMatch('ts', 'Take Screenshot');
      expect(result).toBeDefined();
      expect(result!.positions).toEqual([0, 5]);
    });

    it('should match file paths with slash separators', () => {
      const result = fuzzyMatch('um', 'utils/math.ts');
      expect(result).toBeDefined();
      expect(result!.positions).toEqual([0, 6]);
    });
  });
});
