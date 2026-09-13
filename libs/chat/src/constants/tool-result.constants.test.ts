import { describe, expect, it } from 'vitest';
import { fileUnchangedMarker } from '#constants/tool-result.constants.js';

describe('fileUnchangedMarker', () => {
  it('should expose a stable prefix string', () => {
    expect(fileUnchangedMarker.prefix).toBe('[File unchanged since last read');
  });

  describe('build', () => {
    it('should embed the prior tool_call id and instruct the LLM to refer to the earlier output', () => {
      const built = fileUnchangedMarker.build('toolu_42');

      expect(built).toBe(
        '[File unchanged since last read in tool_call toolu_42. ' +
          'Refer to the earlier read_file output in this conversation.]',
      );
    });

    it('should always start with the shared prefix so matches() round-trips', () => {
      const built = fileUnchangedMarker.build('toolu_anything');

      expect(built.startsWith(fileUnchangedMarker.prefix)).toBe(true);
    });
  });

  describe('matches', () => {
    it('should return true for every build() output', () => {
      expect(fileUnchangedMarker.matches(fileUnchangedMarker.build('toolu_first'))).toBe(true);
      expect(fileUnchangedMarker.matches(fileUnchangedMarker.build(''))).toBe(true);
    });

    it('should return false for an empty string', () => {
      expect(fileUnchangedMarker.matches('')).toBe(false);
    });

    it('should return false for a generic `<persisted-output>` envelope', () => {
      const envelope = '<persisted-output>\nread_file persisted: 30 KB</persisted-output>';

      expect(fileUnchangedMarker.matches(envelope)).toBe(false);
    });

    it('should return false for arbitrary read_file content', () => {
      expect(fileUnchangedMarker.matches('   1\thello world\n   2\tgoodbye\n')).toBe(false);
    });
  });
});
