import { describe, expect, it } from 'vitest';
import { generatedIgnoreContent, generatedIgnoreEntries, generatedJjConfigContent } from '#workspace-config.js';
import { parseRevisionCommitMessage, revisionCommitMessage } from '#revision-headers.js';
import type { RevisionTrailer } from '#revision-headers.js';

describe('generated ignore file', () => {
  it('excludes every derived path plus the generated files themselves', () => {
    const content = generatedIgnoreContent(undefined);
    for (const entry of generatedIgnoreEntries) {
      expect(content).toContain(entry);
    }
    expect(content).toContain('/.gitignore');
    expect(content).toContain('/.tau/jj-config.toml');
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

describe('generated engine configuration', () => {
  it('lifts the size limit that otherwise drops an authored file', () => {
    const content = generatedJjConfigContent({ name: 'Tau', email: 'tau@example.com' });
    expect(content).toContain('max-new-file-size = 0');
    expect(content).toContain('backend = "none"');
    expect(content).toContain('name = "Tau"');
  });

  it('escapes an identity that would otherwise break the TOML', () => {
    const content = generatedJjConfigContent({ name: 'Ada "Lovelace"', email: 'a\\b@example.com' });
    expect(content).toContain(String.raw`name = "Ada \"Lovelace\""`);
    expect(content).toContain(String.raw`email = "a\\b@example.com"`);
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
