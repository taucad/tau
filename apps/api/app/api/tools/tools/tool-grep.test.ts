// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { grepToolDefinition } from '#api/tools/tools/tool-grep.js';

describe('grepToolDefinition', () => {
  describe('tool description', () => {
    // A single positive trailing redirect replaces the universal
    // "When NOT to use" block.
    it('redirects to glob for file-name-pattern searches', () => {
      expect(grepToolDefinition.description).toMatch(/use\s+`glob`/);
    });

    it('does NOT carry a "When NOT to use" block', () => {
      expect(grepToolDefinition.description).not.toMatch(/When NOT to use:/);
    });

    it('should advertise the 50-match default with headLimit/offset pagination guidance', () => {
      expect(grepToolDefinition.description).toMatch(/first 50 matches/);
      expect(grepToolDefinition.description).toMatch(/`headLimit`/);
      expect(grepToolDefinition.description).toMatch(/`offset`/);
    });
  });
});
