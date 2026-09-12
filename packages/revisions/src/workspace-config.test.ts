import { describe, expect, it } from 'vitest';
import { generatedIgnoreContent, generatedIgnoreEntries } from '#workspace-config.js';
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
