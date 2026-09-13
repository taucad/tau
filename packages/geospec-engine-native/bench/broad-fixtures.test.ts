import assert from 'node:assert/strict';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { broadFixtureCache, createManyClaims, generateLargeMesh } from '#bench/broad-fixtures';
import { sha256 } from '#bench/lib';

const controlDirectory = resolve(broadFixtureCache, 'small-controls');

await test('should generate closed outward indexed cubes with exact counts and byte length', async () => {
  await rm(controlDirectory, { recursive: true, force: true });
  await mkdir(controlDirectory, { recursive: true });
  try {
    const generated = await generateLargeMesh(controlDirectory, 2);
    assert.deepEqual(generated.counts, {
      cubeCount: 8,
      vertexCount: 64,
      triangleCount: 96,
      positionBytes: 768,
      indexBytes: 1152,
      binaryBytes: 1920,
    });
    const binary = await readFile(generated.resources[0]!.path);
    assert.equal(binary.byteLength, generated.resources[0]!.bytes);
    assert.equal(sha256(binary), generated.resources[0]!.sha256);
    const edgeUses = new Map<string, number>();
    let signedSixVolume = 0;
    for (let triangle = 0; triangle < generated.counts.triangleCount; triangle += 1) {
      const indices = [0, 1, 2].map((corner) =>
        binary.readUInt32LE(generated.counts.positionBytes + (triangle * 3 + corner) * 4),
      );
      assert.ok(indices.every((index) => index < generated.counts.vertexCount));
      const edges: Array<[number, number]> = [
        [indices[0]!, indices[1]!],
        [indices[1]!, indices[2]!],
        [indices[2]!, indices[0]!],
      ];
      for (const [left, right] of edges) {
        const edge = left < right ? `${left}:${right}` : `${right}:${left}`;
        edgeUses.set(edge, (edgeUses.get(edge) ?? 0) + 1);
      }
      const point = (index: number) => [0, 1, 2].map((axis) => binary.readFloatLE((index * 3 + axis) * 4));
      const [a, b, c] = indices.map((index) => point(index));
      signedSixVolume +=
        a![0]! * (b![1]! * c![2]! - b![2]! * c![1]!) -
        a![1]! * (b![0]! * c![2]! - b![2]! * c![0]!) +
        a![2]! * (b![0]! * c![1]! - b![1]! * c![0]!);
    }
    assert.ok([...edgeUses.values()].every((uses) => uses === 2));
    assert.equal(signedSixVolume / 6, 8);
  } finally {
    await rm(controlDirectory, { recursive: true, force: true });
  }
});

await test('should refuse recipe counts above the frozen admission parameters before allocation', async () => {
  await assert.rejects(generateLargeMesh(controlDirectory, 49), /large mesh side/);
  assert.throws(() => createManyClaims(4097), /many-claims count/);
});

await test('should construct stable unique claim IDs with bounded approved query placeholders', () => {
  const request = createManyClaims(1001);
  assert.equal(request.claimCount, 1001);
  assert.equal(new Set(request.claims.map(({ claimId }) => claimId)).size, 1001);
  assert.equal(request.claims[0]!.claimId, 'many-claims-1001-0000');
  assert.equal(request.claims[1000]!.claimId, 'many-claims-1001-1000');
  assert.deepEqual(request.claims[64]!.query, {
    kind: 'selected-overlap-pair',
    left: 'claim-subject-a',
    right: 'claim-subject-b',
  });
  assert.equal(request.profileRequirements.logicalBudget, 'W2.C-LOGICAL-BUDGET-02');
  assert.equal(request.metadataObligations.status, 'obligation-not-observation');
});
