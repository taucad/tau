import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { parseStoryManifest } from '#www/story-geometry.js';
import { partPose } from '#www/story-kinematics.js';

await test('should preserve source provenance, 34 bounded meshes and three planets', async () => {
  const compressed = await readFile(new URL('../public/planetary.bin.gz', import.meta.url));
  const binary = gunzipSync(compressed);
  const manifestText = await readFile(new URL('../public/planetary.json', import.meta.url), 'utf8');
  const manifest = parseStoryManifest(JSON.parse(manifestText), binary.byteLength);
  const source = await readFile(
    new URL('../../../libs/tau-examples/src/kernels/replicad/planetary-gear-system/main.ts', import.meta.url),
  );
  assert.equal(manifest.sha256, createHash('sha256').update(source).digest('hex'));
  assert.equal(manifest.meshes.length, 34);
  assert.equal(manifest.meshes.filter((p) => p.name.startsWith('Planet Gear')).length, 3);
  assert.equal(manifest.meshes.filter((p) => p.name.startsWith('Sun Gear')).length, 1);
  assert.equal(manifest.meshes.filter((p) => p.name.startsWith('Front Socket Screw')).length, 3);
  assert.deepEqual(manifest.teeth, { sun: 24, planet: 24, ring: 72 });
  assert.ok(compressed.length < 1_000_000, 'Keep the source mesh transfer bounded');
  let cursor = 0;
  for (const part of manifest.meshes) {
    for (const range of [part.position, part.normal, part.index]) {
      assert.equal(range.offset, cursor);
      cursor += range.length * 4;
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

await test('should maintain gear meshing, carrier hardware and bushing coupling through four sun turns', () => {
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

await test('should reject malformed geometry before allocating typed arrays or GPU resources', async () => {
  const text = await readFile(new URL('../public/planetary.json', import.meta.url), 'utf8');
  const compressed = await readFile(new URL('../public/planetary.bin.gz', import.meta.url));
  const bytes = gunzipSync(compressed);
  const valid = parseStoryManifest(JSON.parse(text), bytes.byteLength);
  const first = valid.meshes[0];
  assert.ok(first);
  const invalid = [
    null,
    { ...valid, parts: 33 },
    { ...valid, teeth: { ...valid.teeth, ring: 73 } },
    { ...valid, meshes: valid.meshes.map(() => first) },
    { ...valid, meshes: [{ ...first, metalness: Number.NaN }, ...valid.meshes.slice(1)] },
    { ...valid, meshes: [{ ...first, position: { ...first.position, offset: -4 } }, ...valid.meshes.slice(1)] },
    { ...valid, meshes: [{ ...first, index: { ...first.index, length: bytes.byteLength } }, ...valid.meshes.slice(1)] },
  ];
  for (const manifest of invalid) {
    assert.throws(() => parseStoryManifest(manifest, bytes.byteLength), {
      name: 'Error',
      message: /assembly|geometry|mesh/iu,
    });
  }
});

await test('should validate the authored faceWidth variant against the base mesh it offsets', async () => {
  const { parseVariantManifest } = await import('#www/story-geometry.js');
  const base = parseStoryManifest(
    JSON.parse(await readFile(new URL('../public/planetary.json', import.meta.url), 'utf8')),
    gunzipSync(await readFile(new URL('../public/planetary.bin.gz', import.meta.url))).byteLength,
  );
  const offsets = gunzipSync(await readFile(new URL('../public/planetary-face18.bin.gz', import.meta.url)));
  const raw = JSON.parse(await readFile(new URL('../public/planetary-face18.json', import.meta.url), 'utf8'));
  const variant = parseVariantManifest(raw, base, offsets.byteLength);
  assert.deepEqual(variant.axial, { from: 68, to: 72 });
  const ring = new Float32Array(offsets.buffer, offsets.byteOffset + (variant.meshes[0]?.dz.offset ?? 0), variant.meshes[0]?.dz.length);
  assert.equal(Math.max(...ring), 4, 'Ring top moves by the 4 mm face change');
  assert.equal(Math.min(...ring), 0, 'Ring base stays on the mounting face');
  assert.throws(() => parseVariantManifest({ ...raw, sha256: '0'.repeat(64) }, base, offsets.byteLength), /variant/iu);
  assert.throws(() => parseVariantManifest({ ...raw, meshes: raw.meshes.slice(1) }, base, offsets.byteLength), /variant/iu);
});

await test('should assemble from the rear carrier to the screws and keep the ring fixed', async () => {
  const { assemblyStep, storyFrame, storyPart } = await import('#www/story-timeline.js');
  const manifest = JSON.parse(await readFile(new URL('../public/planetary.json', import.meta.url), 'utf8'));
  /** @type {string[]} */
  const names = manifest.meshes.map((/** @type {{name: string}} */ mesh) => mesh.name);
  assert.equal(assemblyStep('Carrier Rear'), 0);
  assert.ok(assemblyStep('Planet Pin 1') < assemblyStep('Planet Gear 1'));
  assert.ok(assemblyStep('Planet Gear 1') < assemblyStep('Carrier Front And Output Hub'));
  assert.ok(assemblyStep('Carrier Front And Output Hub') < assemblyStep('Front Socket Screw 1'));
  for (const p of [4.99, 5.5, 6.5]) {
    const frame = storyFrame(p);
    for (const [index, name] of names.entries()) {
      const state = storyPart(name, index, p, frame);
      assert.ok(Math.abs(state.z) < 1e-6, `${name} is seated at ${p}`);
      if (name.startsWith('Internal Ring')) assert.equal(state.rotation, 0);
    }
  }
  const before = storyFrame(5.1);
  const after = storyFrame(5.99);
  assert.equal(before.variant, 0);
  assert.equal(after.variant, 1);
  assert.ok(Math.abs(after.sunAngle - (2 * Math.PI + Math.PI / 6)) < 1e-9, 'One demonstration turn plus inputAngle 30°');
});

await test('should map reading position to continuous chapter progress', async () => {
  const { progressFromTops } = await import('#www/story-progress.js');
  globalThis.innerHeight = 1000;
  assert.equal(progressFromTops([600, 1400, 2200], 500), 0);
  assert.equal(progressFromTops([100, 900, 1700], 500), 0.5);
  assert.equal(progressFromTops([-700, 100, 900], 500), 1.5);
  assert.ok(progressFromTops([-3000, -2200, -1400], 500) < 3);
});

await test('should advertise Tau Cloud sync as available on paid plans and never as coming soon', async () => {
  const { plans, pricingFaq, storyChapters } = await import('#www/content.js');
  const copy = JSON.stringify({ plans, pricingFaq, storyChapters });
  for (const plan of plans) {
    for (const [label, flag] of plan.features) {
      if (/sync|backup/iu.test(label)) assert.equal(flag, undefined, `${label} is available now`);
    }
  }
  assert.ok(plans.find((plan) => plan.id === 'pro')?.features.some(([label]) => label.includes('10 GB')));
  assert.ok(plans.find((plan) => plan.id === 'enterprise')?.features.some(([label]) => label.includes('100 GB')));
  assert.equal(plans.find((plan) => plan.id === 'free')?.features.some(([label]) => /Tau Cloud/u.test(label)), false);
  assert.doesNotMatch(copy, /sync[^"]*coming soon|coming soon[^"]*sync/iu);
});
