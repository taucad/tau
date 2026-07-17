import { mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildMarkdown, runBatch, sha256File, staleReason } from '#pdf-to-md.js';

const entry = {
  title: 'A Paper',
  authors: ['Ada Lovelace'],
  year: 2026,
  venue: 'Journal',
  source_url: 'https://example.com/paper', // eslint-disable-line @typescript-eslint/naming-convention -- YAML field
  pdf_url: 'https://example.com/paper.pdf', // eslint-disable-line @typescript-eslint/naming-convention -- YAML field
  pdf: 'docs/reference/pdf/a-paper.pdf',
  markdown: 'docs/reference/a-paper.md',
  citation: { format: 'bibtex', key: 'lovelace2026', bibtex: '@article{lovelace2026, title={A Paper}}' },
};

const markdownFor = (pdfSha256: string): string =>
  buildMarkdown({ id: 'a-paper', entry, pageCount: 3, pdfSha256, text: 'body' });

const writeTemporaryPdf = (contents: string): string => {
  const path = join(mkdtempSync(join(tmpdir(), 'pdf-to-md-')), 'a-paper.pdf');
  writeFileSync(path, contents);
  return path;
};

describe('staleReason', () => {
  const pdfSha256 = 'a'.repeat(64);
  const manifestHash = (): string => {
    const hash = /^> Manifest hash: `(?<hash>[a-f0-9]+)`$/mu.exec(markdownFor(pdfSha256))?.groups?.['hash'];
    if (hash === undefined) {
      throw new Error('generated markdown is missing its manifest hash');
    }
    return hash;
  };

  it('should report generated markdown as fresh when both recorded hashes match', () => {
    expect(staleReason({ markdown: markdownFor(pdfSha256), manifestHash: manifestHash(), pdfSha256 })).toBeUndefined();
  });

  it('should report stale markdown when the cached PDF content no longer matches', () => {
    expect(
      staleReason({ markdown: markdownFor(pdfSha256), manifestHash: manifestHash(), pdfSha256: 'b'.repeat(64) }),
    ).toBe('pdf changed');
  });

  it('should report stale markdown when the manifest entry changed', () => {
    expect(staleReason({ markdown: markdownFor(pdfSha256), manifestHash: 'deadbeef', pdfSha256 })).toBe(
      'manifest changed',
    );
  });

  it('should report stale markdown when it predates recorded PDF hashes', () => {
    expect(staleReason({ markdown: '> Manifest hash: `deadbeef`\n', manifestHash: 'deadbeef', pdfSha256 })).toBe(
      'pdf changed',
    );
  });

  it('should skip the PDF comparison when the cached PDF is missing', () => {
    expect(
      staleReason({ markdown: markdownFor(pdfSha256), manifestHash: manifestHash(), pdfSha256: undefined }),
    ).toBeUndefined();
  });
});

describe('runBatch', () => {
  it('should keep going after a failure so one bad reference cannot skip the rest', async () => {
    const attempted: string[] = [];
    const run = runBatch(['a', 'bad', 'c'], async (id) => {
      attempted.push(id);
      if (id === 'bad') {
        throw new Error(`${id}: cached PDF missing`);
      }
    });

    await expect(run).rejects.toThrow('1 of 3 references failed');
    expect(attempted).toEqual(['a', 'bad', 'c']);
  });

  it('should report every failure rather than only the first', async () => {
    const run = runBatch(['x', 'y'], async (id) => {
      throw new Error(`${id}: cached PDF missing`);
    });

    await expect(run).rejects.toThrow(
      '2 of 2 references failed:\n  - x: cached PDF missing\n  - y: cached PDF missing',
    );
  });

  it('should resolve without throwing when every reference succeeds', async () => {
    await expect(runBatch(['a', 'b'], async () => undefined)).resolves.toBeUndefined();
  });
});

describe('sha256File', () => {
  it('should ignore mtime changes so `git lfs checkout` does not fake staleness', () => {
    const path = writeTemporaryPdf('%PDF-1.7 bytes');
    const before = sha256File(path);

    utimesSync(path, new Date(), new Date(Date.now() + 86_400_000));

    expect(sha256File(path)).toBe(before);
    expect(staleReason({ markdown: markdownFor(before), manifestHash: 'x', pdfSha256: before })).not.toBe(
      'pdf changed',
    );
  });

  it('should change when the PDF bytes change', () => {
    const path = writeTemporaryPdf('%PDF-1.7 bytes');
    const before = sha256File(path);
    writeFileSync(path, '%PDF-1.7 other bytes');

    expect(sha256File(path)).not.toBe(before);
  });
});
