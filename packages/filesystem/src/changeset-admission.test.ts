import { describe, expect, it } from 'vitest';
import type { Occupancy } from '#changeset-admission.js';
import { PhaseAdmission } from '#changeset-admission.js';

const at = (path: string, kind: Occupancy['kind'], space = 'root'): Occupancy[] => [{ space, path, kind }];

/** Admit each footprint in turn and answer the first conflict, or `undefined`. */
const firstConflict = (...footprints: Occupancy[][]): string | undefined => {
  const admission = new PhaseAdmission();
  for (const footprint of footprints) {
    const conflict = admission.conflict(footprint);
    if (conflict !== undefined) {
      return conflict;
    }
    admission.admit(footprint);
  }
  return undefined;
};

describe('PhaseAdmission', () => {
  it('should refuse two entries on one path', () => {
    expect(firstConflict(at('a.txt', 'write'), at('a.txt', 'write'))).toBe('a.txt');
    expect(firstConflict(at('a.txt', 'write'), at('a.txt', 'destructive'))).toBe('a.txt');
  });

  it('should admit appends to one path, which keep their order', () => {
    expect(firstConflict(at('log.txt', 'append'), at('log.txt', 'append'))).toBeUndefined();
    expect(firstConflict(at('log.txt', 'append'), at('log.txt', 'write'))).toBe('log.txt');
  });

  it('should refuse an entry inside a written or deleted subtree, in either order', () => {
    expect(firstConflict(at('src', 'destructive'), at('src/a.ts', 'write'))).toBe('src/a.ts');
    expect(firstConflict(at('src/a.ts', 'write'), at('src', 'destructive'))).toBe('src');
  });

  it('should admit a recursive mkdir of an ancestor of non-destructive work, in either order', () => {
    expect(firstConflict(at('src', 'mkdir'), at('src/lib/a.ts', 'write'))).toBeUndefined();
    expect(firstConflict(at('src/lib/a.ts', 'write'), at('src', 'mkdir'))).toBeUndefined();
  });

  it('should refuse a recursive mkdir of an ancestor of destructive work', () => {
    expect(firstConflict(at('src', 'mkdir'), at('src/old.ts', 'destructive'))).toBe('src/old.ts');
    expect(firstConflict(at('src/old.ts', 'destructive'), at('src', 'mkdir'))).toBe('src');
  });

  it('should treat the empty path as the ancestor of everything', () => {
    expect(firstConflict(at('', 'destructive'), at('a.txt', 'write'))).toBe('a.txt');
  });

  it('should keep storage spaces apart', () => {
    expect(firstConflict(at('a.txt', 'write', 'one'), at('a.txt', 'write', 'two'))).toBeUndefined();
  });

  it('should judge both ends of a move', () => {
    const move: Occupancy[] = [
      { space: 'root', path: 'from.txt', kind: 'destructive' },
      { space: 'root', path: 'to.txt', kind: 'destructive' },
    ];

    expect(firstConflict(move, at('to.txt', 'write'))).toBe('to.txt');
    expect(firstConflict(at('elsewhere.txt', 'write'), move)).toBeUndefined();
  });
});
