import { describe, expect, it } from 'vitest';
import { pathRegistry } from '@taucad/filesystem/path-registry';
import {
  generatedGitattributesContent,
  generatedGitattributesPath,
  generatedIgnoreContent,
  generatedIgnoreEntries,
  isLargeObjectPath,
  isTrackedLargeObjectPath,
  largeObjectThresholdBytes,
} from '#workspace-config.js';
import { parseRevisionCommitMessage, revisionCommitMessage } from '#revision-headers.js';
import type { RevisionTrailer } from '#revision-headers.js';

describe('generated ignore file', () => {
  it('excludes every unversioned path and keeps the versioned generated files', () => {
    const content = generatedIgnoreContent(undefined);
    for (const entry of generatedIgnoreEntries) {
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
    expect(generatedIgnoreEntries).toContain('/.tau/runs/');
    expect(generatedIgnoreEntries).toContain('/exports/');
    expect(generatedIgnoreEntries).not.toContain('/.tau/jj-config.toml');
  });

  /* PP5: `versioned` agrees with the ignore file — a path is unversioned exactly
   * when the generated block excludes it. Both halves are asserted, because the
   * pattern's anchoring is what makes them agree: a row that classifies by
   * segment must be excluded wherever it appears, or a nested `.git` would be
   * hidden from every view and captured into the revision anyway. */
  it('should exclude every unversioned row, anchored exactly where the row matches', () => {
    for (const row of pathRegistry.filter((entry) => !entry.versioned)) {
      expect(row.anchored, row.prefix).toBe(row.match === 'root');
      expect(generatedIgnoreEntries).toContain(`${row.anchored ? '/' : '**/'}${row.prefix}${row.directory ? '/' : ''}`);
    }
  });

  /* The whole block, literally: it is the one artifact a person reads in their
   * own checkout, so a changed row has to arrive as a reviewable diff rather
   * than as a passing `toContain`. */
  it('should write the generated block exactly as the registry orders it', () => {
    expect(generatedIgnoreContent(undefined)).toBe(
      `# BEGIN Tau generated — derived content is never versioned
/.tau/types/
/.tau/tsconfig.generated.json
/.tau/lockfile.json
/.tau/chats/
/.tau/runs/
/.tau/artifacts/
/.tau/tool-results/
/.tau/offloaded-tool-results/
/exports/
/thumbnail.webp
/.tau/cache/
**/node_modules/
**/.tau/binding.json
**/.jj/
**/.git/
# END Tau generated
`,
    );
  });

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
