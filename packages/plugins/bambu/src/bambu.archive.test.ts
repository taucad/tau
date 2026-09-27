import { createHash } from 'node:crypto';

import type { MachineArtifactReference } from '@taucad/runtime/machine';
import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { prepareBambuArtifact } from '#bambu.archive.js';

const encoder = new TextEncoder();
const digest = (bytes: Uint8Array<ArrayBuffer>): MachineArtifactReference['digest'] =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}` as MachineArtifactReference['digest'];
const artifact = (
  bytes: Uint8Array<ArrayBuffer>,
  overrides: Partial<MachineArtifactReference> = {},
): MachineArtifactReference => ({
  projectId: 'proj_0123456789abcdefghijK',
  path: 'known-good.gcode.3mf',
  digest: digest(bytes),
  length: bytes.byteLength,
  mediaType: 'application/vnd.bambulab.gcode-3mf',
  contract: { id: 'manufacturing.toolpath.bambu-gcode-3mf', version: 1 },
  selectedMember: 'Metadata/plate_1.gcode',
  ...overrides,
});
const runtime = (bytes: Uint8Array<ArrayBuffer>) => ({
  async *readArtifact() {
    yield Uint8Array.from(bytes);
  },
});

describe('Bambu artifact preflight', () => {
  it('should verify an immutable selected plate without inflating unrelated members', async () => {
    const bytes = zipSync({
      'Metadata/': new Uint8Array(),
      'Metadata/plate_1.gcode': encoder.encode('G28\n'),
      'Metadata/large.bin': new Uint8Array(1024 * 1024),
    });
    await expect(
      prepareBambuArtifact({
        artifact: artifact(bytes),
        runtime: runtime(bytes),
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({ digest: digest(bytes), length: bytes.byteLength });
  });

  it.each([
    ['path traversal', { '../Metadata/plate_1.gcode': encoder.encode('G28\n') }, 'BAMBU_ARCHIVE_MEMBER_INVALID'],
    [
      'member collision',
      { 'Metadata/plate_1.gcode': encoder.encode('G28\n'), 'metadata/PLATE_1.GCODE': encoder.encode('G29\n') },
      'BAMBU_ARCHIVE_LIMIT',
    ],
    ['missing plate', { 'Metadata/other.gcode': encoder.encode('G28\n') }, 'BAMBU_ARCHIVE_PLATE_MISSING'],
  ])('should refuse %s', async (_name, entries, code) => {
    const bytes = zipSync(entries);
    await expect(
      prepareBambuArtifact({
        artifact: artifact(bytes),
        runtime: runtime(bytes),
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(code);
  });

  it('should refuse mutation, truncation and same-extension incompatible artifacts', async () => {
    const bytes = zipSync({ 'Metadata/plate_1.gcode': encoder.encode('G28\n') });
    const changed = Uint8Array.from(bytes);
    changed[10] = changed[10] === 0 ? 1 : 0;
    await expect(
      prepareBambuArtifact({
        artifact: artifact(bytes),
        runtime: runtime(changed),
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('BAMBU_ARTIFACT_DIGEST_MISMATCH');
    await expect(
      prepareBambuArtifact({
        artifact: artifact(bytes, { length: bytes.byteLength + 1 }),
        runtime: runtime(bytes),
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('BAMBU_ARTIFACT_LENGTH_MISMATCH');
    await expect(
      prepareBambuArtifact({
        artifact: artifact(bytes, { mediaType: 'application/zip' }),
        runtime: runtime(bytes),
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('BAMBU_ARTIFACT_INCOMPATIBLE');
  });
});
