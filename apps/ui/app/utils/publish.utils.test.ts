import { describe, expect, it } from 'vitest';
import { isForbiddenPublishRelativePath } from '#utils/publish.utils.js';

describe('isForbiddenPublishRelativePath', () => {
  it.each([
    ['main.ts', false],
    ['lib/body.ts', false],
    ['.tau/parameters/main.ts.json', false],
    ['.tau/parameters/sub/x.json', false],
  ])('allows %s', (path, forbidden) => {
    expect(isForbiddenPublishRelativePath(path)).toBe(forbidden);
  });

  it.each([
    ['.tau/artifacts/foo.glb', true],
    ['.tau/transcripts/chat.jsonl', true],
    ['.tau/cache/foo', true],
    ['.tau/skills/x.md', true],
    ['.tau/AGENTS.md', true],
    ['.tau', true],
    ['.tau/parameters', true],
    ['node_modules/x', true],
    ['dist/y', true],
    ['../escape', true],
    ['/abs', true],
    ['', true],
  ])('forbids %s', (path, forbidden) => {
    expect(isForbiddenPublishRelativePath(path)).toBe(forbidden);
  });
});
