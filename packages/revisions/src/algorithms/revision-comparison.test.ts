import { describe, expect, it } from 'vitest';
import { compareRevisionFile, diffRevisionTrees, ImmutableRevisionTree } from '@taucad/revisions/algorithms';
import type { FileMode } from '@taucad/filesystem';
const file = (text: string | number[], mode: FileMode = '100644') => ({
  content: typeof text === 'string' ? new TextEncoder().encode(text) : new Uint8Array(text),
  mode,
});
describe('exact revision comparison', () => {
  it('should distinguish absence, empty files, modes and identical bytes', () => {
    expect(compareRevisionFile({})).toMatchObject({ change: 'unchanged', notices: [] });
    expect(compareRevisionFile({ original: file(''), modified: file('') })).toMatchObject({ change: 'unchanged' });
    expect(compareRevisionFile({ modified: file([0xef, 0xbb, 0xbf]) })).toMatchObject({
      change: 'added',
      notices: ['empty-added'],
    });
    expect(compareRevisionFile({ original: file([0xff, 0xfe]) })).toMatchObject({
      change: 'deleted',
      notices: ['empty-deleted'],
    });
    expect(compareRevisionFile({ modified: file('') })).toMatchObject({ change: 'added', notices: ['empty-added'] });
    expect(compareRevisionFile({ original: file('') })).toMatchObject({
      change: 'deleted',
      notices: ['empty-deleted'],
    });
    expect(compareRevisionFile({ original: file('code'), modified: file('code', '100755') })).toMatchObject({
      change: 'modified',
      notices: ['executable-added'],
    });
    expect(compareRevisionFile({ original: file('code', '100755'), modified: file('code') })).toMatchObject({
      change: 'modified',
      notices: ['executable-removed'],
    });
  });
  it('should decode supported BOM encodings strictly and keep encoding-only changes visible', () => {
    const original = file('A');
    for (const bytes of [
      [0xef, 0xbb, 0xbf, 65],
      [0xff, 0xfe, 65, 0],
      [0xfe, 0xff, 0, 65],
    ]) {
      expect(compareRevisionFile({ original, modified: file(bytes) })).toEqual({
        original: 'A',
        modified: 'A',
        kind: 'text',
        change: 'modified',
        notices: ['encoding'],
      });
    }
    for (const bytes of [[0x80], [0xff, 0xfe, 0], [0xff, 0xfe, 0, 0, 65, 0, 0, 0]]) {
      expect(compareRevisionFile({ original, modified: file(bytes) })).toMatchObject({
        kind: 'unsupported',
        change: 'modified',
        modified: '',
      });
    }
    expect(compareRevisionFile({ original: file([0x80]), modified: file([0x81]) })).toMatchObject({
      kind: 'unsupported',
      change: 'modified',
    });
    expect(compareRevisionFile({ modified: file([65, 0, 66]) })).toMatchObject({
      kind: 'binary',
      change: 'added',
      modified: '',
    });
  });
  it('should explain line endings and final newlines without classifying normal edits as encoding changes', () => {
    expect(compareRevisionFile({ original: file('a\r\n'), modified: file('a\n') })).toMatchObject({
      notices: ['line-endings'],
    });
    expect(compareRevisionFile({ original: file('a'), modified: file('a\n') })).toMatchObject({
      notices: ['final-newline'],
    });
    expect(compareRevisionFile({ original: file('a\n'), modified: file('a') })).toMatchObject({
      notices: ['final-newline'],
    });
    expect(compareRevisionFile({ original: file('a\nb\r\n'), modified: file('a\r\nb\n') })).toMatchObject({
      notices: ['line-endings'],
    });
    expect(compareRevisionFile({ original: file('cube(1);'), modified: file('cube(2);') })).toMatchObject({
      notices: [],
      kind: 'text',
      change: 'modified',
    });
  });
  it('should list only actual tree differences, including empty files and executable modes', () => {
    const original = new ImmutableRevisionTree([
      ['same.ts', 'same'],
      ['mode.ts', 'mode'],
      ['gone.ts', ''],
    ]);
    const modified = new ImmutableRevisionTree([
      ['same.ts', 'same'],
      ['mode.ts', 'mode', '100755'],
      ['new.ts', ''],
    ]);
    expect(diffRevisionTrees({ original, modified })).toEqual([
      { path: 'gone.ts', kind: 'deleted' },
      { path: 'mode.ts', kind: 'modified' },
      { path: 'new.ts', kind: 'added' },
    ]);
  });
});
