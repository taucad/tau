import { describe, expect, it } from 'vitest';
import { projectToManifest, serializeProjectManifest } from '@taucad/types';
import { declaresManifest } from '#utils/project-manifest-equivalence.js';

const project = { name: 'Part', description: '', tags: ['a'], assets: { main: { entryPath: 'main.scad' } } };
const encode = (value: unknown, indent?: number): Uint8Array<ArrayBuffer> =>
  new TextEncoder().encode(JSON.stringify(value, undefined, indent));
const canonical = JSON.parse(new TextDecoder().decode(serializeProjectManifest(projectToManifest(project)))) as Record<
  string,
  unknown
>;

describe('declaresManifest', () => {
  it('should hold bytes equal however they are indented, ordered or terminated', () => {
    const { $schema, ...rest } = canonical;
    expect(declaresManifest(encode({ ...rest, $schema }, 4), project)).toBe(true);
    expect(declaresManifest(encode(canonical), project)).toBe(true);
  });

  it('should hold a spelled-out default equal to its absence', () => {
    expect(declaresManifest(encode({ ...canonical, syncChats: true, syncLargeExports: false }), project)).toBe(true);
    expect(
      declaresManifest(serializeProjectManifest(projectToManifest(project)), { ...project, syncChats: true }),
    ).toBe(true);
  });

  it('should refuse a declaration that differs, or bytes that do not parse strictly', () => {
    expect(declaresManifest(encode({ ...canonical, syncChats: false }), project)).toBe(false);
    expect(declaresManifest(encode({ ...canonical, name: 'Other' }), project)).toBe(false);
    expect(declaresManifest(encode({ ...canonical, extra: 1 }), project)).toBe(false);
    expect(declaresManifest(new TextEncoder().encode('{'), project)).toBe(false);
  });
});
