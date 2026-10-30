import { describe, expect, it } from 'vitest';
import { WorkspaceSnapshot } from '#workspace-snapshot.js';

describe('WorkspaceSnapshot', () => {
  it('keeps only OpenSCAD sources from a substring search, sorted and unique', () => {
    expect(WorkspaceSnapshot.sources(['b.scad', 'notes.scadx', 'a/Main.SCAD', 'b.scad', 'model.scad.stl'])).toEqual([
      'a/Main.SCAD',
      'b.scad',
    ]);
  });

  it('builds canonical file URIs for workspace-relative paths', () => {
    expect(WorkspaceSnapshot.uriFor('lib/Spur Gear.scad')).toBe('file:///lib/Spur%20Gear.scad');
    expect(WorkspaceSnapshot.uriFor('/main.scad')).toBe('file:///main.scad');
  });

  it('reports additions, edits and deletions once', () => {
    const snapshot = new WorkspaceSnapshot();
    expect(
      snapshot.update(
        new Map([
          ['file:///a.scad', 'cube(1);'],
          ['file:///b.scad', 'module b() {}'],
        ]),
      ),
    ).toEqual([
      { uri: 'file:///a.scad', text: 'cube(1);' },
      { uri: 'file:///b.scad', text: 'module b() {}' },
    ]);
    expect(snapshot.size).toBe(2);
    expect(
      snapshot.update(
        new Map([
          ['file:///a.scad', 'cube(1);'],
          ['file:///b.scad', 'module b(size = 1) {}'],
        ]),
      ),
    ).toEqual([{ uri: 'file:///b.scad', text: 'module b(size = 1) {}' }]);
    expect(snapshot.update(new Map([['file:///b.scad', 'module b(size = 1) {}']]))).toEqual([
      { uri: 'file:///a.scad', text: null },
    ]);
    expect(snapshot.update(new Map([['file:///b.scad', 'module b(size = 1) {}']]))).toEqual([]);
    expect(snapshot.size).toBe(1);
  });
});
