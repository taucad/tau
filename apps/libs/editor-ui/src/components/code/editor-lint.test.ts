import { Text } from '@codemirror/state';
import { expect, it } from 'vitest';
import { codeMirrorDiagnostic, startAfterLineBreaks } from '#components/code/editor-lint.js';

const source = 'pinChamfer = 0.5mm\r\nneedleOD = 10mm\nwasherOD = 13mm';

it('starts a range that begins on a line break at the next row', () => {
  const needle = source.indexOf('needleOD');
  expect(startAfterLineBreaks(source, { from: needle - 2, to: needle + 8 })).toEqual({ from: needle, to: needle + 8 });
  const washer = source.indexOf('washerOD');
  const lines = Text.of(source.split(/\r?\n/u));
  const washerStart = lines.line(3).from;
  expect(startAfterLineBreaks(lines, { from: washerStart - 1, to: washerStart + 8 })).toEqual({
    from: washerStart,
    to: washerStart + 8,
  });
  expect(startAfterLineBreaks(source, { from: washer, to: washer + 8 })).toEqual({ from: washer, to: washer + 8 });
});

it('keeps empty and end-of-line ranges, and clamps to the text', () => {
  const lineEnd = source.indexOf('\r');
  expect(startAfterLineBreaks(source, { from: lineEnd, to: lineEnd })).toEqual({ from: lineEnd, to: lineEnd });
  expect(startAfterLineBreaks(source, { from: -4, to: source.length + 9 })).toEqual({ from: 0, to: source.length });
  expect(startAfterLineBreaks(source, { from: 20, to: 10 })).toEqual({ from: 10, to: 10 });
});

it('maps an editor diagnostic to the row its gutter marker and underline share', () => {
  const lines = Text.of(['pinChamfer = 0.5mm', 'needleOD = 10mm']);
  const diagnostic = codeMirrorDiagnostic(lines, {
    from: lines.line(1).to,
    to: lines.line(2).from + 8,
    message: 'Identifiers should be lowerCamelCase',
    severity: 'info',
    source: 'lint',
  });
  expect(lines.lineAt(diagnostic.from).number).toBe(2);
  expect(diagnostic).toMatchObject({ to: lines.line(2).from + 8, severity: 'info', source: 'lint' });
});
