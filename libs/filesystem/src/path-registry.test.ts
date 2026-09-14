import { describe, expect, it } from 'vitest';
import { classify, pathRegistry, reservedTauPathClassification, unlistedPathClassification } from '#path-registry.js';
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
    '.tau/artifacts/export/model.stl',
    '.tau/tool-results/chat/result.json',
    '.tau/offloaded-tool-results/chat/result.json',
  ])('keeps the host record %s read-only to agents', (path) => {
    expect(classify(path)).toMatchObject({ class: 'records', agentAccess: 'read-only' });
  });

  it.each([
    'main.ts',
    'src/parts/bracket.ts',
    'tau.json',
    '.gitignore',
    '.gitattributes',
    /* The authored `.tau` controls answer the authored default through their
     * own rows, which is what re-opens them above the reserved `.tau` default. */
    '.tau/parameters/main.json',
    '.tau/skills/cad/SKILL.md',
    '.tau/AGENTS.md',
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
    /* Inside `.tau` the near miss lands on the reserved default, never on the
     * row it resembles: the chats row is agent-readable, the default is not. */
    expect(classify('.tau/chats-notes.md').agentAccess).toBe('hidden');
    expect(classify('.gitignore-old')).toStrictEqual(unlistedPathClassification);
    expect(classify('thumbnail.webp.bak')).toStrictEqual(unlistedPathClassification);
  });

  /* Ruling P13: no migration deletes a residual `.tau/workspaces` directory, and
   * an unlisted path is otherwise authored, versioned and agent-writable — which
   * would capture the residue into the next revision and hand it to the agent. */
  /* The reserved answer is anchored and segment-bounded: a sibling file whose
   * name merely starts with `.tau`, and a nested `.tau` that is some package's
   * own, are the user's content like any other unlisted path. */
  it.each(['.tau-notes.md', '.taurus/main.scad', 'x/.tau/y', 'src/.tau/parameters/main.json'])(
    'keeps %s on the authored default',
    (path) => {
      expect(classify(path)).toStrictEqual(unlistedPathClassification);
    },
  );

  /* The container itself keeps the authored answer: it holds the authored
   * controls too, and an agent that cannot list `.tau` cannot find them. */
  it('leaves the `.tau` directory itself listable', () => {
    expect(classify('.tau')).toStrictEqual(unlistedPathClassification);
  });

  /* eslint-disable no-restricted-syntax -- the retired directory is this case's
   * subject: P13 is the row that makes a residual one harmless. */
  it.each(['.tau/workspaces/w1/main.scad', '.tau/workspaces', '.tau/unknown/y', '.tau/config.json'])(
    'gives %s the reserved `.tau` answer rather than the authored default',
    (path) => {
      expect(classify(path)).toStrictEqual(reservedTauPathClassification);
    },
  );
  /* eslint-enable no-restricted-syntax -- the pin is back on below. */

  it('keeps every unversioned row out of a revision and every versioned row in', () => {
    /* Rows exist to carve exceptions out of a revision. The only versioned rows
     * are the authored `.tau` controls, which exist to carve themselves back
     * out of the reserved `.tau` default, and they answer the authored one. */
    for (const row of pathRegistry.filter((entry) => entry.versioned)) {
      expect(classify(memberOf(row))).toStrictEqual(unlistedPathClassification);
      expect(row.prefix.startsWith('.tau/')).toBe(true);
    }
    expect(classify('src/model.ts').versioned).toBe(true);
    expect(classify('.tau/types/kernel.d.ts').versioned).toBe(false);
  });
});
