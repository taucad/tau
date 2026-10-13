import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createExampleRuntimeClient } from '@taucad/tau-examples/runtime';
import { expect, it } from 'vitest';

// The Manifold doctrine's canonical pattern authors no normals; the headless
// renderer rejects triangle primitives without them, so the kernel supplies them.
it('renders a Manifold model that authors no normals to an image', async () => {
  const root = await mkdtemp(join(tmpdir(), 'manifold-normals-image-'));
  await writeFile(
    join(root, 'main.ts'),
    `
    import { Manifold } from 'manifold-3d/manifoldCAD';
    export default function main() {
      const body = Manifold.cube([80, 40, 20], true);
      const hole = Manifold.cylinder(22, 6, -1, 64, true);
      return body.subtract(Manifold.union([hole.translate([-20, 0, 0]), hole.translate([20, 0, 0])]));
    }
  `,
  );
  const client = await createExampleRuntimeClient(root);
  const document = client.open({ source: { path: 'main.ts' }, watch: false });
  try {
    const exported = await document.export('glb');
    expect(exported.success, exported.success ? '' : exported.issues.map(({ message }) => message).join('; ')).toBe(
      true,
    );
    if (!exported.success) {
      return;
    }
    const image = await client.transcode({
      from: 'glb',
      to: 'webp',
      files: [...exported.files],
      options: {
        mode: 'single',
        width: 256,
        height: 192,
        camera: { framing: 'bounds', direction: [0.6123724357, -0.6123724357, 0.5], up: [0, 0, 1] },
      },
    });
    expect(image.success, image.success ? '' : image.issues.map(({ message }) => message).join('; ')).toBe(true);
    if (image.success) {
      expect(image.data).toHaveLength(1);
      expect(image.data[0]!.mimeType).toBe('image/webp');
    }
  } finally {
    document.close();
    await client.shutdown();
    await rm(root, { recursive: true, force: true });
  }
});
