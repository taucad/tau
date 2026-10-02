import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { partPose } from '../src/story-kinematics.mjs';

test('should preserve source provenance, 34 bounded meshes and three planets', async () => {
  const manifest = JSON.parse(await readFile(new URL('../public/planetary.json', import.meta.url)));
  const source = await readFile(
    new URL('../../../libs/tau-examples/src/kernels/replicad/planetary-gear-system/main.ts', import.meta.url),
  );
  assert.equal(manifest.sha256, createHash('sha256').update(source).digest('hex'));
  assert.equal(manifest.meshes.length, 34);
  assert.equal(manifest.meshes.filter((p) => p.name.startsWith('Planet Gear')).length, 3);
  assert.equal(manifest.meshes.filter((p) => p.name.startsWith('Sun Gear')).length, 1);
  assert.equal(manifest.meshes.filter((p) => p.name.startsWith('Front Socket Screw')).length, 3);
  assert.deepEqual(manifest.teeth, { sun: 24, planet: 24, ring: 72 });
  const compressed = await readFile(new URL('../public/planetary.bin.gz', import.meta.url));
  assert.ok(compressed.length < 1_000_000, 'Keep the source mesh transfer bounded');
  const binary = gunzipSync(compressed);
  let cursor = 0;
  for (const part of manifest.meshes) {
    for (const key of ['position', 'normal', 'index']) {
      assert.equal(part[key].offset, cursor);
      cursor += part[key].length * 4;
      assert.ok(cursor <= binary.length);
    }
    assert.equal(part.position.length, part.normal.length);
    assert.equal(part.position.length % 3, 0);
    assert.equal(part.index.length % 3, 0);
    const indices = new Uint32Array(binary.buffer, binary.byteOffset + part.index.offset, part.index.length);
    for (const index of indices) {
      assert.ok(index < part.position.length / 3, 'Triangle must refer to an existing vertex');
    }
  }
  assert.equal(cursor, binary.length);
});

test('should maintain gear meshing, carrier hardware and bushing coupling through four sun turns', () => {
  for (const angle of [0, Math.PI / 7, Math.PI, 2 * Math.PI, 8 * Math.PI]) {
    const sun = partPose('Sun Gear And Input Shaft', angle).rotation;
    const carrier = partPose('Carrier Front And Output Hub', angle).rotation;
    const ring = partPose('Internal Ring Gear', angle).rotation;
    assert.equal(ring, 0);
    assert.ok(Math.abs(24 * (sun - carrier) + 72 * (ring - carrier)) < 1e-9, 'Willis fixed-ring equation');
    for (let i = 1; i <= 3; i++) {
      const planet = partPose(`Planet Gear ${i}`, angle);
      assert.ok(
        Math.abs(24 * (planet.rotation - carrier) + 24 * (sun - carrier)) < 1e-9,
        'Sun/planet relative meshing',
      );
      assert.ok(Math.abs(Math.hypot(planet.x, planet.y) - 48) < 1e-9, 'Pitch center remains on the carrier');
      assert.deepEqual(partPose(`Flanged Bushing ${i}`, angle), planet);
      assert.equal(partPose(`Front Socket Screw ${i}`, angle).rotation, carrier);
    }
  }
});
