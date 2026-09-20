import { describe, expect, it } from 'vitest';
import { classify, pathRegistry, reservedTauPathClassification, unlistedPathClassification } from '#path-registry.js';
import type { PathRegistryRow } from '#path-registry.js';

/** A path inside the family a row names, so the table drives its own test. */
const memberOf = (row: PathRegistryRow): string => (row.directory ? `${row.prefix}/child/leaf.bin` : row.prefix);

/** The one answer every control-plane row gives. */
const controlPlane = Object.freeze({
  class: 'control-plane',
  versioned: false,
  agentAccess: 'hidden',
  watch: 'none',
} as const);

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
    expect(classify('.git').agentAccess).toBe('hidden');
    expect(classify('.git/objects/ab/cdef').agentAccess).toBe('hidden');
    expect(classify('/.git/HEAD').agentAccess).toBe('hidden');
  });

  /* CI1, ruling EQ1: a repository nested in the design — a vendored dependency,
   * a submodule, a second Tau project — is the control plane wherever it sits.
   * A `.git` with no children is a worktree or submodule pointer file, which
   * names the real store somewhere else, so it is covered by the same row. */
  it.each(['vendor/lib/.git/hooks/pre-commit', 'a/b/.jj/x', 'sub/.git', 'packages/kernel/.tau/binding.json'])(
    'should keep %s in the control plane whatever its depth',
    (path) => {
      expect(classify(path)).toStrictEqual({
        class: 'control-plane',
        versioned: false,
        agentAccess: 'hidden',
        watch: 'none',
      });
    },
  );

  /* G0-3: `classify` takes the first matching row, so a row that matched at the
   * project root used to claim a control plane nested inside it — the cache row
   * for `node_modules`, and the authored `.tau/skills` and `.tau/parameters`
   * rows, which made a vendored store *versioned* and captured into every
   * revision. The control plane answers before the family it sits inside. */
  it.each([
    'node_modules/pkg/.git/hooks/pre-commit',
    '.tau/skills/x/.git/config',
    '.tau/parameters/x/.git/config',
    'exports/x/.git/config',
    '.tau/chats/x/.git/config',
  ])('should answer the control plane for %s rather than the family it sits inside', (path) => {
    expect(classify(path)).toStrictEqual(controlPlane);
  });

  /* What the answer above rests on, stated where a reordering would break it. */
  it('should order the control-plane rows before every other row', () => {
    const rows = pathRegistry.filter((row) => row.class === 'control-plane');

    expect(pathRegistry.slice(0, rows.length)).toStrictEqual(rows);
  });

  /* G0-1, G0-5: every filesystem a `NodeFsProvider` runs on folds case, and
   * Win32 folds trailing dots and spaces as well, so each of these spellings
   * opens the real store while a byte comparison calls it the user's content.
   * The fold is unconditional: a genuinely separate `.GIT` directory on a
   * case-sensitive disk being hidden is the fail-closed answer, and asking the
   * provider would make the mask depend on where the project sits. */
  it.each([
    '.Git/config',
    '.GIT/config',
    '.giT',
    '/.Git/config',
    'vendor/lib/.Git/hooks/pre-commit',
    'vendor/lib/.GIT',
    '.git.',
    '.git ',
    'vendor/.GIT. ',
    'vendor/.git./hooks/pre-commit',
    '.JJ',
    'a/b/.Jj/x',
    '.jj.',
    /* `.tau/binding.json` names the store this project is bound to, so a
     * spelling the filesystem folds onto it is the same control file. */
    '.TAU/Binding.JSON',
    'packages/kernel/.Tau/binding.json',
  ])('should fold %s onto the control plane on every filesystem', (path) => {
    expect(classify(path)).toStrictEqual(controlPlane);
  });

  /* `.tau` is Tau's namespace rather than a name a person claims, so a first
   * segment the filesystem folds onto it is classified as `.tau` is: on a
   * case-insensitive disk `.TAU/chats/**` *is* the agent's durable log, and
   * calling it authored made it agent-writable and captured it into revisions. */
  it.each(['.TAU/chats/c1.json', '.Tau/chats/c1/events.jsonl', '.tau./chats/c1.json'])(
    'should answer the records row for %s',
    (path) => {
      expect(classify(path)).toStrictEqual({
        class: 'records',
        versioned: false,
        agentAccess: 'read-only',
        watch: 'ui',
      });
    },
  );

  it('should keep a folded `.tau` control writable and a folded generated one unversioned', () => {
    expect(classify('.TAU/parameters/main.json')).toStrictEqual(unlistedPathClassification);
    /* The row whose own prefix is not lowercase stays reachable, because only the
     * first segment is rewritten. */
    expect(classify('.TAU/AGENTS.md')).toStrictEqual(unlistedPathClassification);
    expect(classify('.tau./types/kernel.d.ts')).toMatchObject({ versioned: false, agentAccess: 'read-write' });
  });

  /* A family no row names falls to the reserved answer through the canonical
   * spelling too. Below the first segment the rows are compared as spelled, so
   * `.TAU/Chats/…` answers exactly what `.tau/Chats/…` answers — the reserved
   * default, which is the fail-closed side. */
  it.each(['.Tau/library.json', '.TAU/Foo/x', '.tau./unknown/y', '.tau/Chats/c1.json', '.TAU/Chats/c1.json'])(
    'should give %s the reserved `.tau` answer',
    (path) => {
      expect(classify(path)).toStrictEqual(reservedTauPathClassification);
    },
  );

  /* The accepted boundary: only `.tau` folds. `exports`, `thumbnail.webp` and
   * `node_modules` are names a person sees and may have typed themselves, and
   * the rows below `.tau/` are root-matched, so a nested `.TAU` is the user's
   * directory like any other. Normalization is in the fold for the reason
   * `portable-tree.ts` applies it, not because it can change an answer — every
   * prefix is ASCII, which normalization never rewrites, so a decomposed path
   * answers by its segments alone. */
  it.each([
    'Exports/model.step',
    'Thumbnail.webp',
    'Node_Modules/replicad/index.d.ts',
    'Café/README.md',
    '.GitHub/workflows/ci.yml',
    '.taurus/main.scad',
    '.tau-old/chats/c1.json',
    'x/.TAU/chats/y',
    '.TAU',
  ])('should leave %s on the authored default rather than folding it onto a row', (path) => {
    expect(classify(path)).toStrictEqual(unlistedPathClassification);
  });

  it('should classify a decomposed path by its segments', () => {
    expect(classify('café/.git/config')).toStrictEqual(controlPlane);
    expect(classify('café/main.ts')).toStrictEqual(unlistedPathClassification);
  });

  /* A prefix collision is not a fold: these are ordinary names that merely start
   * or end like a control-plane one, and git needs the first four in the tree. */
  it.each([
    '.github/workflows/ci.yml',
    '.gitignore',
    '.gitattributes',
    '.gitmodules',
    'x.git',
    '.git-foo',
    '.gitx',
    'a.git.b',
    'src/.git.old/config',
  ])('should leave %s outside the control plane', (path) => {
    expect(classify(path)).toStrictEqual(unlistedPathClassification);
  });

  /* PP3: a control-plane row matches a path segment, never a root, so its answer
   * cannot depend on how deep the repository sits. */
  it('should match every control-plane row by segment, never by root', () => {
    const controlPlane = pathRegistry.filter((row) => row.class === 'control-plane');

    expect(controlPlane.filter((row) => row.match !== 'segment')).toStrictEqual([]);
  });

  /* PP2: hidden is inherited. The mask relies on it for every descent and
   * nothing pinned it — it held because of how the prefix match happened to be
   * written. */
  it.each(pathRegistry.filter((row) => row.agentAccess === 'hidden').map((row) => [row.prefix, row] as const))(
    'should hide every path beneath %s',
    (_prefix, row) => {
      expect(classify(memberOf(row)).agentAccess).toBe('hidden');
      expect(classify(`${memberOf(row)}/deeper/still.bin`).agentAccess).toBe('hidden');
    },
  );

  /* Ruling D29: one repository name on every host. `.tau/revisions` was the
   * browser's second name for the same directory; nothing but the `.git` row may
   * claim the control plane now. */
  it('names the repository once, at .git', () => {
    expect(pathRegistry.filter((row) => row.class === 'control-plane').map((row) => row.prefix)).toStrictEqual([
      '.tau/binding.json',
      '.jj',
      '.git',
    ]);
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
