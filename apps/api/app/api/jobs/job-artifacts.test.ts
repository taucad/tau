import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';

import { jobActionRecordStorageKey, verifyJobArtifactStream } from '#api/jobs/job-artifacts.js';

const digest = (value: string): `sha256:${string}` => `sha256:${createHash('sha256').update(value).digest('hex')}`;

describe('verifyJobArtifactStream', () => {
  it('verifies the complete byte sequence across multipart-shaped chunks', async () => {
    await expect(
      verifyJobArtifactStream({
        body: Readable.from([Buffer.from('whole-'), Buffer.from('object')]),
        expectedDigest: digest('whole-object'),
        expectedSize: Buffer.byteLength('whole-object'),
      }),
    ).resolves.toEqual({ verified: true });
  });

  it('rejects same-sized corrupt content even when storage metadata could match', async () => {
    await expect(
      verifyJobArtifactStream({
        body: Readable.from([Buffer.from('whole-'), Buffer.from('objeet')]),
        expectedDigest: digest('whole-object'),
        expectedSize: Buffer.byteLength('whole-object'),
      }),
    ).resolves.toEqual({ verified: false, reason: 'digest' });
  });

  it('rejects non-byte storage chunks at the trust boundary', async () => {
    const body = Readable.from([{ invalid: true }]);
    const destroy = vi.spyOn(body, 'destroy');

    await expect(verifyJobArtifactStream({ body, expectedDigest: digest('ignored'), expectedSize: 1 })).rejects.toThrow(
      'non-byte stream chunk',
    );
    expect(destroy).toHaveBeenCalledOnce();
  });
});

describe('jobActionRecordStorageKey', () => {
  it('scopes immutable action records by exact owner, job, and digest identities', () => {
    expect(jobActionRecordStorageKey('owner/one', 'job/two', `sha256:${'a'.repeat(64)}`)).toBe(
      `jobs/owner%2Fone/actions/job%2Ftwo/sha256/${'a'.repeat(64)}.json`,
    );
  });
});
