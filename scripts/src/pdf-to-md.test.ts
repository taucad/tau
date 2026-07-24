import { mkdtempSync, rmSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { convertPdfArtifact, validatePdfArtifact } from '#pdf-to-md.js';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const buildPdf = (text: string): Uint8Array<ArrayBuffer> => {
  const stream = text === '' ? '' : `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(Buffer.from(body));
};

const temporaryPdf = (contents: Uint8Array<ArrayBuffer>): string => {
  const directory = mkdtempSync(join(tmpdir(), 'tau-pdf-test-'));
  temporaryDirectories.push(directory);
  const path = join(directory, 'paper.pdf');
  writeFileSync(path, contents);
  return path;
};

describe('validatePdfArtifact', () => {
  it('should accept PDF magic and reject other cached bytes', async () => {
    await expect(validatePdfArtifact(temporaryPdf(buildPdf('Hello')))).resolves.toBeUndefined();
    await expect(validatePdfArtifact(temporaryPdf(Buffer.from('not a pdf')))).rejects.toThrow(
      'cached artifact is not a PDF',
    );
  });

  it('should reject an oversized PDF before parsing it', async () => {
    const path = temporaryPdf(Buffer.from('%PDF-'));
    truncateSync(path, 100 * 1024 * 1024 + 1);
    await expect(validatePdfArtifact(path)).rejects.toThrow('PDF exceeds');
  });
});

describe('convertPdfArtifact', () => {
  it('should isolate the parser and return extracted text', async () => {
    const result = await convertPdfArtifact(temporaryPdf(buildPdf('Hello Tau')));
    expect(result.markdown).toContain('Hello Tau');
    expect(result.detail).toContain('PDF text extraction');
  });

  it('should preserve the visible OCR failure for PDFs without text', async () => {
    await expect(convertPdfArtifact(temporaryPdf(buildPdf('')))).rejects.toThrow(/no extractable text|usable text/i);
  });
});
