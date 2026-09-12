import { describe, expect, it } from 'vitest';
import { classify, pathRegistry, unlistedPathClassification } from '#path-registry.js';
import type { PathRegistryRow } from '#path-registry.js';

/** A path inside the family a row names, so the table drives its own test. */
const memberOf = (row: PathRegistryRow): string => (row.directory ? `${row.prefix}/child/leaf.bin` : row.prefix);

describe('path registry', () => {
  it.each(pathRegistry.map((row) => [row.prefix, row] as const))('classifies everything under %s', (_prefix, row) => {
    const { class: storageClass, versioned, agentAccess, watch } = classify(memberOf(row));

    expect({ class: storageClass, versioned, agentAccess, watch }).toStrictEqual({
      class: row.class,
      versioned: row.versioned,
      agentAccess: row.agentAccess,
      watch: row.watch,
    });
  });

  it('names each family once, so no two rows can disagree', () => {
    expect(new Set(pathRegistry.map((row) => row.prefix)).size).toBe(pathRegistry.length);
  });

  it.each([
    'main.ts',
    'src/parts/bracket.ts',
    'tau.json',
    '.gitignore',
    '.gitattributes',
    '.tau/config.json',
    '.tau/parameters/main.json',
    '.tau/skills/cad/SKILL.md',
    /* No project-level `.cache` directory exists anywhere in the tree; the
     * project machine's exclusion named nothing, so it is authored like any
     * other unlisted path. */
    '.cache/render.bin',
  ])('gives %s the authored default', (path) => {
    expect(classify(path)).toStrictEqual(unlistedPathClassification);
  });

  it('answers the same for the directory itself and for anything beneath it', () => {
    expect(classify('.tau/revisions').agentAccess).toBe('hidden');
    expect(classify('.tau/revisions/objects/ab/cdef').agentAccess).toBe('hidden');
    expect(classify('/.tau/revisions/HEAD').agentAccess).toBe('hidden');
  });

  it('matches a nested node_modules but only a project-root exports', () => {
    expect(classify('node_modules/replicad/index.d.ts').class).toBe('cache');
    expect(classify('packages/kernel/node_modules/x.js').class).toBe('cache');
    expect(classify('exports/model.step').class).toBe('records');
    expect(classify('src/exports/helper.ts')).toStrictEqual(unlistedPathClassification);
  });

  it('does not let a path that merely starts like a reserved one inherit it', () => {
    expect(classify('.tau/chats-notes.md')).toStrictEqual(unlistedPathClassification);
    expect(classify('.gitignore-old')).toStrictEqual(unlistedPathClassification);
    expect(classify('thumbnail.webp.bak')).toStrictEqual(unlistedPathClassification);
  });

  it('keeps every unversioned row out of a revision and every versioned row in', () => {
    expect(pathRegistry.filter((row) => row.versioned)).toStrictEqual([]);
    expect(classify('src/model.ts').versioned).toBe(true);
    expect(classify('.tau/types/kernel.d.ts').versioned).toBe(false);
  });
});
