import { describe, expect, it } from 'vitest';
import { allocateProjectDirectorySlug, allocateSlug, projectNameToSlug } from '#utils/project-directory.utils.js';

describe('project directory naming', () => {
  it('normalizes marks, punctuation, Unicode letters, and empty names', () => {
    expect(projectNameToSlug('  Crème brûlée / 机架  ')).toBe('creme-brulee-机架');
    expect(projectNameToSlug('---')).toBe('project');
  });

  it('bounds the slug by Unicode code points', () => {
    expect(allocateProjectDirectorySlug('a'.repeat(60), new Set())).toBe('a'.repeat(48));
  });

  it('appends increments until the target root has a free name', () => {
    expect(allocateProjectDirectorySlug('Cube Design', new Set())).toBe('cube-design');
    expect(allocateProjectDirectorySlug('Cube Design', new Set(['cube-design']))).toBe('cube-design-1');
    expect(allocateProjectDirectorySlug('Cube Design', new Set(['cube-design', 'cube-design-1']))).toBe(
      'cube-design-2',
    );
  });

  it('collides case-insensitively (APFS/NTFS)', () => {
    expect(allocateProjectDirectorySlug('Cube Design', new Set(['Cube-Design']))).toBe('cube-design-1');
    expect(allocateSlug('tau-workspace', new Set(['TAU-Workspace']))).toBe('tau-workspace-1');
  });

  it('allocates a raw slug against reserved names', () => {
    expect(allocateSlug('opfs', new Set(['opfs', 'indexeddb']))).toBe('opfs-1');
  });
});
