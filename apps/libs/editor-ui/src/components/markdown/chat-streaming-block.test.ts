import { describe, expect, it } from 'vitest';
import remend from 'remend';
import { parseMarkdownIntoBlocks } from 'streamdown';
import { repairStreamingTail } from '#components/markdown/chat-streaming-block.js';

/** A streamed answer of the shapes a chat writes: headings, lists, fences, tables, links, emphasis and math. */
const answer = [
  '# Tolerances for a bracket',
  '',
  'A **bracket** holds the *shaft* at `M6` clearance. See [ISO 286](https://www.iso.org/standard/45975.html).',
  '',
  '## Steps',
  '',
  '1. Sketch the profile.',
  '2. Extrude it by **8 mm**.',
  '   - Fillet the inside edge.',
  '',
  '```python',
  'from build123d import *',
  'with BuildPart() as part:',
  '    Box(40, 20, 8)',
  '```',
  '',
  '| Feature | Value |',
  '| --- | --- |',
  '| Hole | 6.4 mm |',
  '',
  '$$',
  'F = k x',
  '$$',
  '',
  '> Check the ~~old~~ new drawing before cutting.',
  '',
].join('\n');

/** Every prefix a stream could have shown, one character apart. */
const prefixes = (text: string): string[] =>
  Array.from({ length: text.length }, (_, index) => text.slice(0, index + 1));

describe('repairStreamingTail (WP-09)', () => {
  it('should show what repairing the whole text shows, for every prefix of a well-formed answer', () => {
    for (const prefix of prefixes(answer)) {
      const repaired = repairStreamingTail(parseMarkdownIntoBlocks(prefix), prefix);
      expect(repaired.blocks, JSON.stringify(prefix.slice(-40))).toEqual(parseMarkdownIntoBlocks(remend(prefix)));
      expect(repaired.blocks.join('')).toBe(repaired.markdown);
    }
  });

  it('should keep every settled block as split, so its rendering stays memoised', () => {
    const prefix = answer.slice(0, answer.indexOf('```python') + 20);
    const blocks = parseMarkdownIntoBlocks(prefix);
    const repaired = repairStreamingTail(blocks, prefix);
    expect(repaired.blocks.slice(0, -1)).toEqual(blocks.slice(0, -1));
  });

  it('should not close a marker left open in a finished block inside the block being written', () => {
    const prefix = 'Some **bold and *ital\n\n```py\nprint(1';
    /* Repairing the whole text writes the earlier paragraph's `*` into the code: `print(1*`. */
    expect(parseMarkdownIntoBlocks(remend(prefix)).at(-1)).toContain('print(1*');
    expect(repairStreamingTail(parseMarkdownIntoBlocks(prefix), prefix).blocks.at(-1)).not.toContain('print(1*');
  });
});
