import { describe, expect, it } from 'vitest';
import { WorkspaceSnapshot } from '#workspace-snapshot.js';

describe('WorkspaceSnapshot', () => {
  it('keeps only C# sources from a substring search, sorted and unique', () => {
    expect(WorkspaceSnapshot.sources(['b.cs', 'notes.csv', 'a/Main.CS', 'b.cs', 'view.cshtml'])).toEqual([
      'a/Main.CS',
      'b.cs',
    ]);
  });

  it('builds canonical file URIs for workspace-relative paths', () => {
    expect(WorkspaceSnapshot.uriFor('Shapes/Ball Shape.cs')).toBe('file:///Shapes/Ball%20Shape.cs');
    expect(WorkspaceSnapshot.uriFor('/main.cs')).toBe('file:///main.cs');
  });

  it('reports additions, edits and deletions once', () => {
    const snapshot = new WorkspaceSnapshot();
    expect(
      snapshot.update(
        new Map([
          ['file:///a.cs', 'class A {}'],
          ['file:///b.cs', 'class B {}'],
        ]),
      ),
    ).toEqual([
      { uri: 'file:///a.cs', text: 'class A {}' },
      { uri: 'file:///b.cs', text: 'class B {}' },
    ]);
    expect(snapshot.size).toBe(2);
    expect(
      snapshot.update(
        new Map([
          ['file:///a.cs', 'class A {}'],
          ['file:///b.cs', 'class B { int x; }'],
        ]),
      ),
    ).toEqual([{ uri: 'file:///b.cs', text: 'class B { int x; }' }]);
    expect(snapshot.update(new Map([['file:///b.cs', 'class B { int x; }']]))).toEqual([
      { uri: 'file:///a.cs', text: null },
    ]);
    expect(snapshot.update(new Map([['file:///b.cs', 'class B { int x; }']]))).toEqual([]);
    expect(snapshot.size).toBe(1);
  });
});
