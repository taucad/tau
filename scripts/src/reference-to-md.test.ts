import { EventEmitter } from 'node:events';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import type { IncomingMessage } from 'node:http';
import type { request as httpsRequest } from 'node:https';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { dump as yamlDump } from 'js-yaml';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { assertPublicAddresses, downloadArtifact, validateArtifactUrl } from '#reference-download.js';
import { buildHtmlSnapshot } from '#reference-html.js';
import { isPublicUrl, sanitizeReferenceMarkdown } from '#reference-markdown.js';
import {
  buildReferenceMarkdown,
  readReferenceManifest,
  referenceManifestHash,
  referencePaths,
  runBatch,
  runReferenceCli,
  staleReason,
  validateReferenceManifest,
} from '#reference-to-md.js';
import type {
  HtmlCaptureReport,
  ReferenceEntry,
  ReferenceFormat,
  ReferenceManifest,
  ReferenceRunner,
} from '#reference-to-md.js';

type HttpsRequest = typeof httpsRequest;

const temporaryDirectories: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const entry = (format: ReferenceFormat = 'pdf'): ReferenceEntry => ({
  title: 'A Paper',
  authors: ['Ada Lovelace'],
  year: 2026,
  venue: 'Journal',
  source_url: 'https://example.com/paper', // eslint-disable-line @typescript-eslint/naming-convention -- manifest field
  artifact: {
    format,
    url:
      format === 'pdf'
        ? 'https://arxiv.org/pdf/2601.00000'
        : format === 'html'
          ? 'https://example.com/paper'
          : undefined,
    rights: { status: 'unreviewed' },
  },
  citation: { format: 'bibtex', key: 'lovelace2026', bibtex: '@article{lovelace2026, title={A Paper}}' },
});

const manifest = (format: ReferenceFormat = 'pdf'): ReferenceManifest => ({
  version: 2,
  groups: { research: { references: ['a-paper'] } },
  references: { 'a-paper': entry(format) },
});

const temporaryRepo = (format: ReferenceFormat = 'pdf'): string => {
  const root = mkdtempSync(join(tmpdir(), 'tau-reference-test-'));
  temporaryDirectories.push(root);
  const reference = join(root, 'repos/tau-brain/reference');
  mkdirSync(reference, { recursive: true });
  mkdirSync(join(root, 'docs'), { recursive: true });
  symlinkSync('../repos/tau-brain/reference', join(root, 'docs/reference'));
  writeFileSync(join(reference, '_index.yaml'), yamlDump(manifest(format), { lineWidth: -1 }));
  return root;
};

describe('reference manifest v2', () => {
  it('should validate the discriminated artifact and derive fixed paths from the id', () => {
    const root = temporaryRepo();
    expect(readReferenceManifest(root)).toEqual(manifest());
    expect(referencePaths(root, 'a-paper', 'pdf')).toMatchObject({
      artifactDisplay: 'docs/reference/pdf/a-paper.pdf',
      markdownDisplay: 'docs/reference/a-paper.md',
    });
  });

  it('should derive both fixed HTML cache paths without accepting manifest paths', () => {
    const root = temporaryRepo('html');
    expect(readReferenceManifest(root)).toEqual(manifest('html'));
    expect(referencePaths(root, 'a-paper', 'html')).toMatchObject({
      artifactDisplay: 'docs/reference/pdf/a-paper.pdf',
      snapshotDisplay: 'docs/reference/source/a-paper.snapshot.html',
      markdownDisplay: 'docs/reference/a-paper.md',
    });
  });

  it('should allow explicit permission and validate optional rights provenance', () => {
    const root = temporaryRepo();
    const candidate = manifest() as unknown as Record<string, unknown>;
    candidate['pdf_dir'] = 'docs/reference/pdf';
    expect(() => validateReferenceManifest(candidate, root)).toThrow('pdf_dir is a removed version 1 field');

    const explicitlyPermitted = manifest();
    explicitlyPermitted.references['a-paper']!.artifact.rights = { status: 'permitted' };
    expect(validateReferenceManifest(explicitlyPermitted, root)).toEqual(explicitlyPermitted);

    const invalid = manifest();
    invalid.references['a-paper']!.artifact.rights = {
      status: 'permitted',
      license: 'all-rights-reserved',
      evidence_url: 'https://example.com/license', // eslint-disable-line @typescript-eslint/naming-convention -- manifest field
    };
    expect(() => validateReferenceManifest(invalid, root)).toThrow('approved redistribution license');

    // 2026-07-26 operator decision: any credential-free HTTPS surface is valid evidence.
    const nonArxiv = manifest();
    nonArxiv.references['a-paper']!.artifact.rights = {
      status: 'permitted',
      license: 'CC-BY-4.0',
      evidence_url: 'https://diglib.eg.org/some/paper?rights=cc-by', // eslint-disable-line @typescript-eslint/naming-convention -- manifest field
    };
    expect(validateReferenceManifest(nonArxiv, root)).toEqual(nonArxiv);

    const insecure = manifest();
    insecure.references['a-paper']!.artifact.rights = {
      status: 'permitted',
      license: 'CC-BY-4.0',
      evidence_url: 'http://example.com/license', // eslint-disable-line @typescript-eslint/naming-convention -- manifest field
    };
    expect(() => validateReferenceManifest(insecure, root)).toThrow('credential-free HTTPS URL');

    const credentialed = manifest();
    credentialed.references['a-paper']!.artifact.rights = {
      status: 'permitted',
      license: 'CC-BY-4.0',
      evidence_url: 'https://user:pass@example.com/license', // eslint-disable-line @typescript-eslint/naming-convention -- manifest field
    };
    expect(() => validateReferenceManifest(credentialed, root)).toThrow('must be a public HTTP(S) URL');
  });

  it('should require page-scoped same-origin rights evidence for HTML', () => {
    const root = temporaryRepo('html');
    const explicitlyPermitted = manifest('html');
    explicitlyPermitted.references['a-paper']!.artifact.rights = { status: 'permitted' };
    expect(validateReferenceManifest(explicitlyPermitted, root)).toEqual(explicitlyPermitted);

    const allowed = manifest('html');
    allowed.references['a-paper']!.artifact.rights = {
      status: 'permitted',
      license: 'CC-BY-4.0',
      evidence_url: 'https://example.com/license', // eslint-disable-line @typescript-eslint/naming-convention -- manifest field
    };
    expect(validateReferenceManifest(allowed, root)).toEqual(allowed);

    const crossOrigin = structuredClone(allowed);
    crossOrigin.references['a-paper']!.artifact.rights.evidence_url = 'https://publisher.example/license';
    expect(() => validateReferenceManifest(crossOrigin, root)).toThrow('HTML publisher origin');
  });

  it('should trust only the canonical Tau Brain boundary symlink', () => {
    const root = temporaryRepo('latex');
    const outside = join(root, 'outside');
    mkdirSync(outside);
    symlinkSync(outside, join(root, 'repos/tau-brain/reference/source'));
    expect(() => referencePaths(root, 'a-paper', 'latex')).toThrow('contains a symlink below the trusted root');
  });
});

describe('reference Markdown', () => {
  it('should remove active content while preserving visible evidence', () => {
    const sanitized = sanitizeReferenceMarkdown(
      '# Result\n\n<script>alert(1)</script>\n\n![tracker](https://example.com/pixel)\n\n[x](javascript:alert(1)) [data](data:text/plain,bad) [file](file:///etc/passwd)\n\n{danger}\n\nimport secrets',
    );
    expect(sanitized).not.toMatch(/script|javascript:|https:\/\/example.com\/pixel/u);
    expect(sanitized).toContain('tracker');
    expect(sanitized).toContain('x');
    expect(sanitized).toContain('data');
    expect(sanitized).toContain('file');
    expect(sanitized).not.toContain('data:text/plain');
    expect(sanitized).not.toContain('file:///');
    expect(sanitized).toContain(String.raw`\\{danger\\}`);
    expect(sanitized).toContain(String.raw`\import secrets`);
    expect(sanitizeReferenceMarkdown(sanitized)).toBe(sanitized);
  });

  it('should accept public URLs and reject local or credential-bearing URLs', () => {
    expect(isPublicUrl('https://doi.org/10.1/example')).toBe(true);
    expect(isPublicUrl('http://127.0.0.1/private')).toBe(false);
    expect(isPublicUrl('https://user:secret@example.com/')).toBe(false);
  });

  it('should record hashes and expose observable stale reasons', () => {
    const root = temporaryRepo();
    const paths = referencePaths(root, 'a-paper', 'pdf');
    const currentEntry = entry();
    const markdown = buildReferenceMarkdown({
      id: 'a-paper',
      entry: currentEntry,
      paths,
      artifactSha256: 'a'.repeat(64),
      detail: 'PDF text extraction',
      body: 'Evidence',
    });
    expect(
      staleReason({
        markdown,
        manifestHash: referenceManifestHash('a-paper', currentEntry),
        artifactSha256: 'a'.repeat(64),
      }),
    ).toBeUndefined();
    expect(
      staleReason({
        markdown,
        manifestHash: referenceManifestHash('a-paper', currentEntry),
        artifactSha256: 'b'.repeat(64),
      }),
    ).toBe('artifact changed');
  });

  it('should require both HTML hashes and report exact pair staleness', () => {
    const root = temporaryRepo('html');
    const paths = referencePaths(root, 'a-paper', 'html');
    const currentEntry = entry('html');
    const capture: HtmlCaptureReport = {
      profile: 'html-v1',
      chromiumVersion: '149.0.0.0',
      finalUrl: 'https://example.com/paper',
      semanticRoot: 'main',
      completeness: 'standards-complete',
      discovered: 2,
      visited: 2,
      empty: 0,
      failed: 0,
      skipped: 0,
    };
    const markdown = buildReferenceMarkdown({
      id: 'a-paper',
      entry: currentEntry,
      paths,
      artifactSha256: 'a'.repeat(64),
      snapshotSha256: 'b'.repeat(64),
      capture,
      detail: 'HTML conversion',
      body: 'Evidence',
    });
    expect(
      staleReason({
        markdown,
        manifestHash: referenceManifestHash('a-paper', currentEntry),
        artifactSha256: 'a'.repeat(64),
        snapshotSha256: 'b'.repeat(64),
        requiresSnapshot: true,
      }),
    ).toBeUndefined();
    expect(
      staleReason({
        markdown,
        manifestHash: referenceManifestHash('a-paper', currentEntry),
        artifactSha256: 'a'.repeat(64),
        snapshotSha256: 'c'.repeat(64),
        requiresSnapshot: true,
      }),
    ).toBe('snapshot changed');
    expect(
      staleReason({
        markdown,
        manifestHash: referenceManifestHash('a-paper', currentEntry),
        artifactSha256: 'a'.repeat(64),
        requiresSnapshot: true,
      }),
    ).toBe('snapshot missing');
  });
});

describe('reference downloader', () => {
  it('should reject private addresses and unapproved sources', () => {
    expect(() => {
      assertPublicAddresses([{ address: '127.0.0.1', family: 4 }]);
    }).toThrow('non-public');
    expect(() => {
      assertPublicAddresses([{ address: '::ffff:127.0.0.1', family: 6 }]);
    }).toThrow('non-public');
    expect(() => {
      assertPublicAddresses([
        { address: '93.184.216.34', family: 4 },
        { address: '::1', family: 6 },
      ]);
    }).toThrow('non-public');
    // 2026-07-26 operator decision: any host may serve a PDF artifact once the
    // manifest rights gate holds; transport constraints below are unchanged.
    expect(validateArtifactUrl('https://example.com/paper.pdf', 'pdf').hostname).toBe('example.com');
    expect(() => {
      validateArtifactUrl('https://arxiv.org/source.tex', 'latex');
    }).toThrow('remote LaTeX downloads are not enabled');
    expect(() => {
      validateArtifactUrl('https://arxiv.org/paper.pdf?token=secret', 'pdf');
    }).toThrow('without a query or fragment');
  });

  it('should pin validated DNS, follow allowed redirects, and atomically persist a bounded PDF', async () => {
    const root = mkdtempSync(join(tmpdir(), 'tau-download-test-'));
    temporaryDirectories.push(root);
    const destination = join(root, 'paper.pdf');
    const responses = [
      { status: 302, headers: { location: 'https://arxiv.org/final.pdf' }, body: Buffer.alloc(0) },
      {
        status: 200,
        headers: { 'content-type': 'application/pdf', 'content-length': '9' },
        body: Buffer.from('%PDF-data'),
      },
    ];
    const request = ((_url: URL, _options: unknown, callback: (response: IncomingMessage) => void) => {
      const next = responses.shift();
      if (!next) {
        throw new Error('unexpected request');
      }
      const response = Readable.from([next.body]) as IncomingMessage;
      response.statusCode = next.status;
      response.headers = next.headers;
      // oxlint-disable-next-line unicorn/prefer-event-target -- Mimics Node's ClientRequest in a network-free test.
      const requestObject = new EventEmitter() as EventEmitter & {
        setTimeout(milliseconds: number, callback: () => void): unknown;
        end(): void;
        destroy(error?: Error): void;
      };
      requestObject.setTimeout = () => requestObject;
      requestObject.end = () => {
        queueMicrotask(() => {
          callback(response);
        });
      };
      requestObject.destroy = (error) => {
        if (error) {
          requestObject.emit('error', error);
        }
      };
      return requestObject;
    }) as unknown as HttpsRequest;

    const result = await downloadArtifact(
      { id: 'paper', format: 'pdf', url: 'https://arxiv.org/start.pdf', destination, force: false },
      {
        lookup: async () => [{ address: '93.184.216.34', family: 4 }],
        request,
      },
    );
    expect(result.bytes).toBe(9);
    expect(readFileSync(destination, 'latin1')).toBe('%PDF-data');
    expect((statSync(destination).mode % 0o1000).toString(8)).toBe('600');
  });
});

describe('reference runner', () => {
  it('should convert through the shared sanitizer without downloading', async () => {
    const root = temporaryRepo();
    const paths = referencePaths(root, 'a-paper', 'pdf');
    mkdirSync(dirname(paths.artifact), { recursive: true });
    writeFileSync(paths.artifact, '%PDF-fixture');
    chmodSync(paths.artifact, 0o644);

    await runReferenceCli(
      {
        format: 'pdf',
        target: 'pdf-to-md',
        repoRoot: root,
        validateArtifacts: async () => undefined,
        convertArtifacts: async () => ({ markdown: '<b>bad</b>\n\nEvidence', detail: 'test extraction' }),
      },
      ['convert', 'a-paper'],
    );

    const markdown = readFileSync(paths.markdown, 'utf8');
    expect(markdown).toContain('BEGIN UNTRUSTED REFERENCE CONTENT');
    expect(markdown).toContain('Evidence');
    expect(markdown).not.toContain('<b>');
  });

  it('should aggregate batch failures without skipping later work', async () => {
    const attempted: string[] = [];
    await expect(
      runBatch(['a', 'bad', 'c'], async (id) => {
        attempted.push(id);
        if (id === 'bad') {
          throw new TypeError('bad reference');
        }
      }),
    ).rejects.toThrow('1 of 3 references failed');
    expect(attempted).toEqual(['a', 'bad', 'c']);
  });

  it('should fail validation when a durable artifact is missing', async () => {
    const root = temporaryRepo();
    await expect(
      runReferenceCli(
        {
          format: 'pdf',
          target: 'pdf-to-md',
          repoRoot: root,
          validateArtifacts: async () => undefined,
          convertArtifacts: async () => ({ markdown: 'unused', detail: 'unused' }),
        },
        ['validate'],
      ),
    ).rejects.toThrow('artifact missing: docs/reference/pdf/a-paper.pdf');
  });

  it('should acquire an incomplete HTML pair once and reconvert without recapture', async () => {
    const root = temporaryRepo('html');
    const permittedManifest = manifest('html');
    permittedManifest.references['a-paper']!.artifact.rights = {
      status: 'permitted',
      license: 'CC-BY-4.0',
      evidence_url: 'https://example.com/license', // eslint-disable-line @typescript-eslint/naming-convention -- manifest field
    };
    writeFileSync(join(root, 'repos/tau-brain/reference/_index.yaml'), yamlDump(permittedManifest, { lineWidth: -1 }));
    const paths = referencePaths(root, 'a-paper', 'html');
    if (paths.format !== 'html') {
      throw new Error('expected HTML reference paths');
    }
    mkdirSync(dirname(paths.artifact), { recursive: true });
    mkdirSync(dirname(paths.snapshot), { recursive: true });
    const acquire = vi.fn(async () => {
      writeFileSync(paths.artifact, '%PDF-fixture');
      writeFileSync(
        paths.snapshot,
        buildHtmlSnapshot({
          report: {
            profile: 'html-v1',
            chromiumVersion: '149.0.0.0',
            finalUrl: 'https://example.com/paper',
            semanticRoot: 'main',
            completeness: 'standards-complete',
            discovered: 0,
            visited: 0,
            empty: 0,
            failed: 0,
            skipped: 0,
          },
          nodes: [{ kind: 'element', tag: 'p', children: [{ kind: 'text', value: 'Evidence' }] }],
        }),
      );
    });
    const runner: ReferenceRunner = {
      format: 'html',
      target: 'html-to-md',
      repoRoot: root,
      acquireArtifacts: acquire,
      validateArtifacts: async () => undefined,
      convertArtifacts: async () => ({
        markdown: 'Evidence',
        detail: 'test HTML conversion',
        capture: {
          profile: 'html-v1',
          chromiumVersion: '149.0.0.0',
          finalUrl: 'https://example.com/paper',
          semanticRoot: 'main',
          completeness: 'standards-complete',
          discovered: 0,
          visited: 0,
          empty: 0,
          failed: 0,
          skipped: 0,
        },
      }),
    };

    await runReferenceCli(runner, ['sync', 'a-paper']);
    expect(acquire).toHaveBeenCalledOnce();
    await runReferenceCli(runner, ['sync', '--force', 'a-paper']);
    expect(acquire).toHaveBeenCalledOnce();
    expect(readFileSync(paths.markdown, 'utf8')).toContain('Snapshot SHA-256');
  });
});
