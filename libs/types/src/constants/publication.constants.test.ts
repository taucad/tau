import { describe, expect, it } from 'vitest';
import {
  isPublishableTauPath,
  publishableTauSubdirectory,
  publishForbiddenPathPrefixes,
} from '#constants/publication.constants.js';

describe('publish path rules', () => {
  describe('publishForbiddenPathPrefixes', () => {
    it('should exclude legacy .tau/cache without listing it explicitly', () => {
      expect(publishForbiddenPathPrefixes).not.toContain('.tau/cache/');
      expect(publishForbiddenPathPrefixes).toContain('node_modules/');
    });
  });

  describe('publishableTauSubdirectory', () => {
    it('should end with trailing slash for prefix matching', () => {
      expect(publishableTauSubdirectory.endsWith('/')).toBe(true);
    });
  });

  describe('isPublishableTauPath', () => {
    it.each([
      ['.tau/parameters/main.ts.json', true],
      ['.tau/parameters/sub/y.json', true],
      ['.tau/parameters', false],
      ['.tau/parameters/', false],
      ['.tau/artifacts/foo.glb', false],
      ['.tau/transcripts/chat.jsonl', false],
      ['.tau/skills/x.md', false],
      ['.tau/cache/x', false],
      ['.tau/AGENTS.md', false],
      ['.tau', false],
      ['main.ts', false],
      ['lib/.tau/parameters/x.json', false],
    ])('%s → %s', (path, expected) => {
      expect(isPublishableTauPath(path)).toBe(expected);
    });
  });
});
