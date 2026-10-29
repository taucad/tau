import { describe, expect, it } from 'vitest';
import { EditorDocument } from '#lib/editor-document.js';

describe('EditorDocument', () => {
  it('shares one versioned text and undo history across two view subscribers', () => {
    const document = new EditorDocument('main.ts', 'abc');
    const left: string[] = [];
    const right: string[] = [];
    document.subscribe((event) => left.push(`${event.version}:${event.viewId ?? ''}`));
    document.subscribe((event) => right.push(`${event.version}:${event.viewId ?? ''}`));
    expect(
      document.apply({ expectedVersion: 1, changes: [{ from: 1, to: 2, insert: 'X' }], origin: 'view', viewId: 'left' })
        ?.version,
    ).toBe(2);
    expect(document.text).toBe('aXc');
    expect(document.undo('right')?.origin).toBe('undo');
    expect(document.text).toBe('abc');
    expect(document.redo('left')?.version).toBe(4);
    expect(document.text).toBe('aXc');
    expect(left).toEqual(['2:left', '3:right', '4:left']);
    expect(right).toEqual(left);
  });

  it('uses UTF-16 offsets without rewriting CRLF or surrogate pairs', () => {
    const document = new EditorDocument('emoji.ts', 'a\r\n😀b');
    document.apply({ expectedVersion: 1, origin: 'view', changes: [{ from: 3, to: 5, insert: '🛠️' }] });
    expect(document.text).toBe('a\r\n🛠️b');
    document.undo();
    expect(document.text).toBe('a\r\n😀b');
  });

  it('refuses stale or overlapping edits without changing version', () => {
    const document = new EditorDocument('main.ts', 'hello');
    expect(
      document.apply({ expectedVersion: 0, origin: 'view', changes: [{ from: 0, to: 1, insert: 'H' }] }),
    ).toBeUndefined();
    expect(
      document.apply({
        expectedVersion: 1,
        origin: 'view',
        changes: [
          { from: 0, to: 2, insert: 'H' },
          { from: 1, to: 3, insert: 'x' },
        ],
      }),
    ).toBeUndefined();
    expect(document.version).toBe(1);
    expect(document.text).toBe('hello');
  });

  it('retains document identity and history across a path rename', () => {
    const document = new EditorDocument('old.ts', 'one');
    document.apply({ expectedVersion: 1, origin: 'view', changes: [{ from: 3, to: 3, insert: ' two' }] });
    document.rename('lib/new.ts');
    expect(document.uri).toBe('file:///lib/new.ts');
    expect(document.undo()?.path).toBe('lib/new.ts');
    expect(document.text).toBe('one');
  });

  it('keeps a held external replacement in the shared undo history', () => {
    const document = new EditorDocument('main.ts', 'original');
    document.apply({ expectedVersion: 1, origin: 'view', changes: [{ from: 8, to: 8, insert: '!' }] });
    document.adopt('revision');
    expect(document.text).toBe('revision');
    document.undo('right');
    expect(document.text).toBe('original!');
    document.undo('right');
    expect(document.text).toBe('original');
  });

  it('groups contiguous typing but isolates paste and a paused typing run', () => {
    const document = new EditorDocument('main.ts', '');
    document.apply({
      expectedVersion: 1,
      origin: 'view',
      viewId: 'left',
      history: { kind: 'typing', atMilliseconds: 100 },
      changes: [{ from: 0, to: 0, insert: 'a' }],
    });
    document.apply({
      expectedVersion: 2,
      origin: 'view',
      viewId: 'left',
      history: { kind: 'typing', atMilliseconds: 200 },
      changes: [{ from: 1, to: 1, insert: 'b' }],
    });
    document.apply({
      expectedVersion: 3,
      origin: 'view',
      viewId: 'left',
      history: { kind: 'paste', atMilliseconds: 250 },
      changes: [{ from: 2, to: 2, insert: 'paste' }],
    });
    document.apply({
      expectedVersion: 4,
      origin: 'view',
      viewId: 'left',
      history: { kind: 'typing', atMilliseconds: 2000 },
      changes: [{ from: 7, to: 7, insert: 'c' }],
    });
    expect(document.text).toBe('abpastec');
    document.undo();
    expect(document.text).toBe('abpaste');
    document.undo();
    expect(document.text).toBe('ab');
    document.undo();
    expect(document.text).toBe('');
  });

  it('keeps one IME composition atomic across replacement updates', () => {
    const document = new EditorDocument('main.ts', 'x');
    document.apply({
      expectedVersion: 1,
      origin: 'view',
      viewId: 'left',
      history: { kind: 'composition', groupId: 'ime-1' },
      changes: [{ from: 1, to: 1, insert: 'n' }],
    });
    document.apply({
      expectedVersion: 2,
      origin: 'view',
      viewId: 'left',
      history: { kind: 'composition', groupId: 'ime-1' },
      changes: [{ from: 1, to: 2, insert: 'に' }],
    });
    expect(document.text).toBe('xに');
    document.undo();
    expect(document.text).toBe('x');
    document.redo();
    expect(document.text).toBe('xに');
  });
});
