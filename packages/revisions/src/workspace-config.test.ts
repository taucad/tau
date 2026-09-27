import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { assert, asyncProperty, boolean, constantFrom, oneof, record, stringMatching, tuple } from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isIgnored } from 'isomorphic-git';
import { pathRegistry, tauPathPolicy } from '@taucad/filesystem/path-registry';
import {
  generatedGitattributesContent,
  generatedGitattributesPath,
  generatedIgnoreContent,
  generatedIgnoreEntries,
  isLargeObjectPath,
  isTrackedLargeObjectPath,
  largeObjectThresholdBytes,
  tauRevisionPolicy,
} from '#workspace-config.js';
import { parseRevisionCommitMessage, revisionCommitMessage } from '#revision-headers.js';
import type { RevisionTrailer } from '#revision-headers.js';
import { gitToolchainOnPath } from '#test/native-git-harness.js';

describe('generated ignore file', () => {
  let ignoreRoot: string;

  beforeAll(async () => {
    ignoreRoot = await mkdtemp(join(tmpdir(), 'tau-generated-ignore-'));
    await mkdir(join(ignoreRoot, '.git'));
    await writeFile(join(ignoreRoot, '.gitignore'), generatedIgnoreContent(undefined));
  });

  afterAll(async () => rm(ignoreRoot, { recursive: true, force: true }));

  it('excludes every unversioned path and keeps the versioned generated files', () => {
    const content = generatedIgnoreContent(undefined);
    for (const entry of generatedIgnoreEntries(tauRevisionPolicy)) {
      expect(content).toContain(entry);
    }
    expect(content).toContain('/.tau/cache/');
    expect(content).toContain('node_modules/');
    /* Git needs its own control files in the tree (D24), so the generated
     * ignore file no longer excludes itself. */
    expect(content).not.toContain('/.gitignore');
    expect(content).not.toContain('/.gitattributes');
  });

  /* The ignore file is derived from the path registry, so the records rows
   * appear and the deleted Jujutsu configuration does not (W1 pin b). */
  it('lists the records rows and no engine configuration', () => {
    expect(generatedIgnoreEntries(tauRevisionPolicy)).toContain('/.tau/runs/');
    expect(generatedIgnoreEntries(tauRevisionPolicy)).toContain('/exports/');
    expect(generatedIgnoreEntries(tauRevisionPolicy)).not.toContain('/.tau/jj-config.toml');
  });

  /* PP5: `versioned` agrees with the ignore file — a path is unversioned exactly
   * when the generated block excludes it, and excluded as far as the row
   * matches. A row that classifies by segment must be excluded wherever it
   * appears, or a nested `.git` would be hidden from every view and captured
   * into the revision anyway.
   *
   * PP5 is stated over the rows, not over every spelling of them: `classify`
   * compares each row folded (G0b-8), so on a case-sensitive disk `Exports/x.step`
   * is unversioned while this block — a `.gitignore`, which git matches
   * case-sensitively there — does not name it. Widening the block with every
   * folded spelling would put Tau's case rules into the person's own ignore file;
   * the capture's own `exclude` (`!classify(path).versioned`) is what keeps such a
   * path out of every tree, and that is the half PP5 exists to protect. */
  it('should exclude every unversioned row as far as it matches, and no versioned one', () => {
    for (const row of pathRegistry) {
      const anywhere = generatedIgnoreEntries(tauRevisionPolicy).some(
        (entry) => entry.replace(/\/$/u, '') === `**/${row.prefix}`,
      );
      const atRoot = generatedIgnoreEntries(tauRevisionPolicy).some(
        (entry) => entry.replace(/\/$/u, '') === `/${row.prefix}`,
      );

      expect({ prefix: row.prefix, anywhere, atRoot }).toStrictEqual({
        prefix: row.prefix,
        anywhere: !row.versioned && row.match === 'segment',
        atRoot: !row.versioned && row.match === 'root',
      });
    }
  });

  it('should agree with the generated ignore block for generated project paths', async () => {
    const rowPath = record({ row: constantFrom(...pathRegistry), nested: boolean() }).map(({ row, nested }) => {
      const path = `${nested ? 'vendor/' : ''}${row.prefix}`;
      return row.directory ? `${path}/entry.txt` : path;
    });
    const authoredPath = tuple(
      stringMatching(/^[a-z][a-z0-9_-]{0,12}$/u),
      stringMatching(/^[a-z][a-z0-9_-]{0,12}$/u),
    ).map(([directory, name]) => `src/${directory}/${name}.ts`);

    /* P13: a `.tau` member no row names falls to the reserved answer, so the
     * block's `/.tau/*` head has to exclude it (R8). */
    const reservedPath = stringMatching(/^[a-z][a-z0-9_-]{0,12}$/u).map((name) => `.tau/${name}/entry.txt`);

    await assert(
      asyncProperty(oneof(rowPath, authoredPath, reservedPath), async (path) => {
        const excluded = await isIgnored({ fs, dir: ignoreRoot, filepath: path });
        expect(tauPathPolicy.classify(path).versioned).toBe(!excluded);
      }),
    );
  });

  /* G0-8: a trailing `/` restricts a gitignore pattern to directories, and a
   * control-plane row also covers the one-line `.git` a worktree or submodule
   * leaves behind — a path `classify` calls unversioned, which a directory-only
   * pattern would not exclude. `node_modules` keeps its slash: a file of that
   * name is not the cache. */
  it('should exclude a control-plane pointer file as well as its directory', () => {
    expect(generatedIgnoreEntries(tauRevisionPolicy)).toContain('**/.git');
    expect(generatedIgnoreEntries(tauRevisionPolicy)).toContain('**/.jj');
    expect(generatedIgnoreEntries(tauRevisionPolicy)).not.toContain('**/.git/');
    expect(generatedIgnoreEntries(tauRevisionPolicy)).toContain('**/node_modules/');
  });

  /* The whole block, literally: it is the one artifact a person reads in their
   * own checkout, so a changed row has to arrive as a reviewable diff rather
   * than as a passing `toContain`. */
  it('should write the generated block exactly as the registry orders it', () => {
    expect(generatedIgnoreContent(undefined)).toBe(
      `# BEGIN Tau generated — derived content is never versioned
/.tau/*
!/.tau/parameters
!/.tau/machines
!/.tau/skills
!/.tau/AGENTS.md
**/.tau/binding.json
**/.jj
**/.git
/.tau/types/
/.tau/tsconfig.generated.json
/.tau/lockfile.json
/.tau/chats/
/.tau/runs/
/.tau/export/
/.tau/artifacts/
/.tau/tool-results/
/.tau/offloaded-tool-results/
/.tau/library.json
/exports/
/thumbnail.webp
/.tau/cache/
**/node_modules/
# END Tau generated
`,
    );
  });

  /* One negation re-includes a direct member of the reserved directory only:
   * `/.tau/*` excludes `.tau/a`, and git cannot re-include `.tau/a/b` under it
   * (R8). A nested authored control needs the generator to emit a chain. */
  it('should keep every versioned row inside the reserved directory a direct member', () => {
    const inside = tauRevisionPolicy.rows.filter(
      (row) => row.versioned && row.prefix.startsWith(`${tauRevisionPolicy.reservedDirectory}/`),
    );

    expect(inside.map((row) => row.prefix)).toStrictEqual([
      '.tau/parameters',
      '.tau/machines',
      '.tau/skills',
      '.tau/AGENTS.md',
    ]);
    expect(inside.filter((row) => row.prefix.split('/').length !== 2)).toStrictEqual([]);
  });

  it('should emit only the rows when a layout has no reserved directory', () => {
    expect(generatedIgnoreEntries({ rows: pathRegistry })).not.toContain('/.tau/*');
    expect(generatedIgnoreEntries({ rows: pathRegistry }).some((entry) => entry.startsWith('!'))).toBe(false);
  });

  /* Stock Git is the reader PP5 protects, so the block is checked with the real
   * binary rather than only with isomorphic-git's matcher (R8 / F9). */
  it.runIf(gitToolchainOnPath)(
    'should ignore unlisted .tau members for stock git and keep the authored controls',
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'tau-generated-ignore-git-'));
      // A person's global `core.excludesFile` must not decide a verdict.
      const env: NodeJS.ProcessEnv = { ...process.env };
      env['GIT_CONFIG_GLOBAL'] = '/dev/null';
      env['GIT_CONFIG_NOSYSTEM'] = '1';
      try {
        execFileSync('git', ['init', '--quiet'], { cwd: root, env });
        await writeFile(join(root, '.gitignore'), generatedIgnoreContent(undefined));
        const paths = {
          '.tau/unknown/x': true,
          /* eslint-disable no-restricted-syntax -- the retired residue F9 found in
           * the field is this case's subject: the block has to ignore it. */
          '.tau/workspaces/project/tau.json': true,
          '.tau/revisions/objects/ab/cdef': true,
          /* eslint-enable no-restricted-syntax -- the pin is back on below. */
          '.tau/skills/a/.git/HEAD': true,
          '.tau/parameters/x.json': false,
          '.tau/machines/printer.json': false,
          '.tau/skills/a/SKILL.md': false,
          '.tau/AGENTS.md': false,
          '.tau/cache/mesh.bin': true,
          'src/part.ts': false,
        };
        await Promise.all(
          Object.keys(paths).map(async (path) => {
            await mkdir(join(root, path, '..'), { recursive: true });
            await writeFile(join(root, path), '');
          }),
        );
        /* `-v -n` lists every path with the pattern that decided it; a blank
         * pattern, or a `!` one, means not ignored. */
        const verdicts = execFileSync('git', ['check-ignore', '--no-index', '-v', '-n', ...Object.keys(paths)], {
          cwd: root,
          env,
        })
          .toString('utf8')
          .trim()
          .split('\n')
          .map((line) => {
            const [source, path] = line.split('\t');
            const pattern = (source ?? '').split(':').slice(2).join(':');
            return [path, pattern !== '' && !pattern.startsWith('!')] as const;
          });

        expect(Object.fromEntries(verdicts)).toStrictEqual(paths);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );

  it('keeps a hand-written ignore file and is idempotent', () => {
    const authored = '# mine\n*.log\n';
    const once = generatedIgnoreContent(authored);
    expect(once.startsWith(authored)).toBe(true);
    expect(generatedIgnoreContent(once)).toBe(once);
    expect(generatedIgnoreContent(once, ['/dist/'])).toContain('/dist/');
    // Re-running without the extra line drops it again rather than accreting.
    expect(generatedIgnoreContent(generatedIgnoreContent(once, ['/dist/']))).toBe(once);
  });
});

describe('provenance trailer', () => {
  const trailer: RevisionTrailer = {
    parents: ['a'.repeat(40)],
    provenance: { source: 'agent', actorId: 'actor', runId: 'run', createdAt: 1_700_000_000_000 },
    summary: { generated: 'Generated title', edited: 'Edited title' },
  };

  it('puts the edited title on the subject line and round-trips the rest', () => {
    const message = revisionCommitMessage(trailer);
    expect(message.split('\n')[0]).toBe('Edited title');
    expect(parseRevisionCommitMessage(message)).toStrictEqual(trailer);
  });

  it('reports a commit that is not a Tau revision rather than inventing provenance', () => {
    expect(parseRevisionCommitMessage('some upstream commit\n')).toBeUndefined();
    expect(parseRevisionCommitMessage('x\n\nTau-Metadata: not-base64url!!\n')).toBeUndefined();
  });
});

describe('generated attributes file', () => {
  /* W9 pin (b): the large-object families the design names must be tracked by
   * git LFS, and `-text` must keep git out of their bytes (A24, S35). */
  it('tracks the large-object families as LFS objects', () => {
    const content = generatedGitattributesContent(undefined);
    for (const extension of ['step', 'stl', 'glb']) {
      expect(content).toContain(`*.${extension} filter=lfs diff=lfs merge=lfs -text`);
    }
    expect(generatedGitattributesPath).toBe('.gitattributes');
  });

  it('keeps a hand-written attributes file and is idempotent', () => {
    const authored = '* text=auto\n';
    const once = generatedGitattributesContent(authored);
    expect(once.startsWith(authored)).toBe(true);
    expect(generatedGitattributesContent(once)).toBe(once);
  });

  /* The size half of A24 has no `.gitattributes` spelling — git has no size
   * predicate — so the threshold is the value a cut reads before it adds a
   * line of its own for that path (P15). */
  it('names the large-object threshold the cut applies', () => {
    expect(largeObjectThresholdBytes).toBe(1024 * 1024);
    expect(isLargeObjectPath('part.STEP')).toBe(true);
    expect(isLargeObjectPath('src/main.ts')).toBe(false);
  });

  it('tracks one path by name, anchors it, and says so afterwards (P15)', () => {
    const families = generatedGitattributesContent(undefined);
    expect(isTrackedLargeObjectPath('notes.txt', families)).toBe(false);
    const tracked = generatedGitattributesContent(families, ['notes.txt', 'docs/manual.md']);
    expect(tracked).toContain('/notes.txt filter=lfs diff=lfs merge=lfs -text');
    expect(tracked).toContain('/docs/manual.md filter=lfs diff=lfs merge=lfs -text');
    expect(isTrackedLargeObjectPath('notes.txt', tracked)).toBe(true);
    expect(isTrackedLargeObjectPath('docs/manual.md', tracked)).toBe(true);
    // A family the table already names never earns a line of its own.
    expect(isTrackedLargeObjectPath('models/big.step', families)).toBe(true);
    // Idempotent: the same cut twice is the same file.
    expect(generatedGitattributesContent(tracked, ['notes.txt'])).toBe(tracked);
    // A path with whitespace has no quoting in gitattributes; `?` matches it.
    const spaced = generatedGitattributesContent(families, ['my notes.txt']);
    expect(spaced).toContain('/my?notes.txt filter=lfs');
    expect(isTrackedLargeObjectPath('my notes.txt', spaced)).toBe(true);
  });
});
