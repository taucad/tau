/*
 * An R2 binding grants read and write; the files Worker is read-only by its own code (blueprint §2,
 * "Binding scope"). This scans every non-test source file the bundle can include — this app's and the
 * link library's — and the bundle itself, for any write, delete or multipart call.
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { bucketWrites, bundleFilesWorker, tauCloudForbiddenSubstrings } from '#scripts/bundle.mts';

const sources = (directory: string): readonly string[] =>
  readdirSync(directory, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts') && !file.startsWith('testing'))
    .map((file) => path.join(directory, file));

const roots = [import.meta.dirname, path.resolve(import.meta.dirname, '../../../libs/file-links/src')];

describe('no bucket writes', () => {
  it.each(roots.flatMap((root) => sources(root)).map((file) => [path.basename(file), file]))(
    'should find no put, delete or multipart call in %s',
    (_name, file) => {
      expect(bucketWrites(readFileSync(file, 'utf8'))).toEqual([]);
    },
  );

  it('should scan the Worker entry and the link library', () => {
    const scanned = roots.flatMap((root) => sources(root)).map((file) => path.basename(file));
    expect(scanned).toEqual(expect.arrayContaining(['files-worker.ts', 'worker.ts', 'verify.ts', 'path.ts']));
  });

  it('should find none in the bundle tau-cloud deploys', async () => {
    const { code } = await bundleFilesWorker();
    expect(bucketWrites(code)).toEqual([]);
  });

  it.each(tauCloudForbiddenSubstrings.map((substring) => [substring]))(
    'should hold none of the substrings tau-cloud refuses: %s',
    async (substring) => {
      const { code } = await bundleFilesWorker();
      expect(code.includes(substring)).toBe(false);
    },
  );

  it('should recognise every substring tau-cloud refuses', () => {
    for (const substring of tauCloudForbiddenSubstrings) {
      expect(bucketWrites(`x${substring}y`)).not.toEqual([]);
    }
  });

  it('should recognise each forbidden call', () => {
    expect(bucketWrites('env.BUCKET.put(key, body); env.BUCKET.delete(key);')).toEqual([
      String.raw`\.put\s*\(`,
      String.raw`\.delete\s*\(`,
    ]);
    expect(bucketWrites('BUCKET.createMultipartUpload (k); BUCKET.resumeMultipartUpload(k, id)')).toHaveLength(2);
    expect(bucketWrites('env.BUCKET.list({ prefix })')).toEqual([String.raw`\.list\s*\(`]);
  });
});
