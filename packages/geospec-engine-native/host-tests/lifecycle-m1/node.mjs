import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { Engine } from '@taucad/geospec-engine-native/node';

const encode = (value) => Buffer.from(JSON.stringify(value));
/** @type {(seed: number) => Buffer} */
const mesh = (seed) => {
  const bytes = Buffer.alloc(96);
  bytes.write('GSM1');
  bytes.writeUInt32LE(3, 4);
  bytes.writeUInt32LE(1, 8);
  for (const [index, value] of [
    [seed, 0, 0],
    [seed + 1, 0, 0],
    [seed, 1, 0],
  ]
    .flat()
    .entries()) {
    bytes.writeDoubleLE(value, 12 + index * 8);
  }
  for (const [index, value] of [0, 1, 2].entries()) {
    bytes.writeUInt32LE(value, 84 + index * 4);
  }
  return bytes;
};

const engine = new Engine();
for (let seed = 0; seed < 40; seed += 1) {
  const primary = mesh(seed);
  const contentHash = createHash('sha256').update(primary).digest('hex');
  engine.ingestMesh(
    encode({
      method: 'ingestSubject',
      requestId: `ingest-${seed}`,
      protocolVersion: 3,
      registryVersion: 4,
      canonicalProfile: 'geospec-jcs-v1',
      contentHash,
      format: 'mesh-buffer-v1',
      frame: { coordinateSystem: 'z-up', unit: 'mm' },
    }),
    primary,
  );
  const handle = /** @type {{ result: { subjectHandle: string } }} */ (
    JSON.parse(
      Buffer.from(
        engine.subjectHandle(
          encode({
            method: 'subjectHandle',
            requestId: `handle-${seed}`,
            protocolVersion: 3,
            registryVersion: 4,
            canonicalProfile: 'geospec-jcs-v1',
            contentHash,
          }),
        ),
      ).toString(),
    )
  ).result.subjectHandle;
  /** @type {(requestId: string) => boolean} */
  const release = (requestId) =>
    /** @type {{ result: { released: boolean } }} */ (
      JSON.parse(
        Buffer.from(
          engine.releaseSubject(
            encode({
              method: 'releaseSubject',
              requestId,
              protocolVersion: 3,
              registryVersion: 4,
              canonicalProfile: 'geospec-jcs-v1',
              subjectHandle: handle,
            }),
          ),
        ).toString(),
      )
    ).result.released;
  assert.equal(release(`release-${seed}`), true);
  assert.equal(release(`duplicate-${seed}`), false);
}
