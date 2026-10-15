import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { partPose } from '@taucad/planetary-gearbox';

// Geometry, kinematics and assembly-order checks live with @taucad/planetary-gearbox.
test('should assemble from the rear carrier to the screws and keep the ring fixed', async () => {
  const { storyFrame, storyPart } = await import('#www/story-timeline.js');
  const manifest = JSON.parse(
    await readFile(new URL(import.meta.resolve('@taucad/planetary-gearbox/assets/planetary.json')), 'utf8'),
  ) as { meshes: Array<{ name: string }> };
  const names = manifest.meshes.map((mesh) => mesh.name);
  // Parts enter along the axis only: once gathered over the build point nothing moves sideways,
  // and each later step waits above (or, for the rear screws, below) everything before it.
  const gathered = storyFrame(3.99);
  const states = names.map((name, index) => ({
    name,
    ...storyPart({ name, index }, 3.99, gathered),
  }));
  for (const state of states) {
    const pose = partPose(state.name, 0);
    assert.ok(Math.hypot(state.x - pose.x, state.y - pose.y) < 1e-6, `${state.name} is over its seat`);
  }
  const lift = (name: string) => states.find((state) => state.name === name)?.z ?? Number.NaN;
  assert.ok(lift('Planet Pin 1') > lift('Rear Thrust Spacer 1'));
  assert.ok(lift('Sun Gear And Input Shaft') > lift('Planet Gear 1'));
  assert.ok(lift('Internal Ring Gear') > lift('Sun Gear And Input Shaft'));
  assert.ok(lift('Front Socket Screw 1') > lift('Carrier Front And Output Hub'));
  assert.ok(lift('Rear Socket Screw 1') < lift('Rear Screw Washer 1') && lift('Rear Screw Washer 1') < 0);
  for (const p of [4.99, 5.5, 6.5]) {
    const frame = storyFrame(p);
    for (const [index, name] of names.entries()) {
      const state = storyPart({ name, index }, p, frame);
      assert.ok(Math.abs(state.z) < 1e-6, `${name} is seated at ${p}`);
      if (name.startsWith('Internal Ring')) {
        assert.equal(state.rotation, 0);
      }
    }
  }
  const before = storyFrame(5.1);
  const after = storyFrame(5.99);
  assert.equal(before.variant, 0);
  assert.equal(after.variant, 1);
  assert.ok(
    Math.abs(after.sunAngle - (2 * Math.PI + Math.PI / 6)) < 1e-9,
    'One demonstration turn plus inputAngle 30°',
  );
});

test('should map reading position to continuous chapter progress', async () => {
  const { progressFromTops } = await import('#www/story-progress.js');
  globalThis.innerHeight = 1000;
  assert.equal(progressFromTops([600, 1400, 2200], 500), 0);
  assert.equal(progressFromTops([100, 900, 1700], 500), 0.5);
  assert.equal(progressFromTops([-700, 100, 900], 500), 1.5);
  assert.ok(progressFromTops([-3000, -2200, -1400], 500) < 3);
});

test('should advertise Tau Cloud sync as available on paid plans and never as coming soon', async () => {
  const { plans, pricingFaq, storyChapters } = await import('#www/content.js');
  const copy = JSON.stringify({ plans, pricingFaq, storyChapters });
  for (const plan of plans) {
    for (const [label, flag] of plan.features) {
      if (/sync|backup/iu.test(label)) {
        assert.equal(flag, undefined, `${label} is available now`);
      }
    }
  }
  assert.ok(plans.find((plan) => plan.id === 'pro')?.features.some(([label]) => label.includes('10 GB')));
  assert.ok(plans.find((plan) => plan.id === 'enterprise')?.features.some(([label]) => label.includes('100 GB')));
  assert.equal(
    plans.find((plan) => plan.id === 'free')?.features.some(([label]) => /Tau Cloud/u.test(label)),
    false,
  );
  assert.doesNotMatch(copy, /sync[^"]*coming soon|coming soon[^"]*sync/iu);
});
