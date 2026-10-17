import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { workbenchPaths } from '@taucad/workbench';
import { createSceneController } from '#experiments/filesystem-scene/scene.js';
import type { SceneAdapter, SceneRevision } from '#experiments/filesystem-scene/scene.js';
import { createNodeSceneSource, watchScene } from '#experiments/filesystem-scene/node-source.js';

// This end-to-end example adopts real glTF Transform scene documents. It is a
// renderer-contract consumer, not a replacement renderer or screenshot claim.
const root = resolve(process.argv[2] ?? 'out/research/filesystem-scene/example');
const viewPath = workbenchPaths.view('front');
const io = new NodeIO();
await mkdir(join(root, '.tau/workbench/views'), { recursive: true });
await mkdir(join(root, 'assets'), { recursive: true });
const seed = {
  version: 1,
  entryPath: 'assets/triangle.glb',
  assetDirectory: 'assets',
  camera: { kind: 'preset', preset: 'front' },
  lighting: { ambientIntensity: 0.1, headlampIntensity: 1.5 },
  display: { grid: true, axes: true },
};
try {
  await readFile(join(root, viewPath));
} catch (error) {
  if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
    throw error;
  }
  const document = new Document();
  const buffer = document.createBuffer();
  const positions = document
    .createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
    .setBuffer(buffer);
  const primitive = document.createPrimitive().setAttribute('POSITION', positions);
  const mesh = document.createMesh('Triangle').addPrimitive(primitive);
  document.createScene('Example').addChild(document.createNode('Triangle').setMesh(mesh));
  await writeFile(join(root, 'assets/triangle.glb'), await io.writeBinary(document));
  await writeFile(join(root, viewPath), `${JSON.stringify(seed, null, 2)}\n`);
}
let documents: Document[] = [];
let presentation: SceneRevision | undefined;
let geometryPreparations = 0;
const adapter: SceneAdapter = {
  async prepare(candidate, signal) {
    const prepared: Document[] = [];
    for (const asset of candidate.revision.assets) {
      signal.throwIfAborted();
      // oxlint-disable-next-line no-await-in-loop -- Bound decoder memory to one staged asset at a time.
      prepared.push(await io.readBinary(candidate.readAsset(asset.digest)));
    }
    geometryPreparations++;
    return {
      commit() {
        documents = prepared;
        presentation = candidate.revision;
      },
      dispose() {
        /* Document owns JS objects, no GPU/native resources. */
      },
    };
  },
  present(revision) {
    presentation = revision;
  },
};
const controller = createSceneController({ source: await createNodeSceneSource(root), viewPath, adapter });
const report = (): void => {
  console.log(
    JSON.stringify({
      revision: presentation?.id,
      geometryId: presentation?.geometryId,
      geometryPreparations,
      meshes: documents.reduce((sum, document) => sum + document.getRoot().listMeshes().length, 0),
      camera: presentation?.view.camera,
      lighting: presentation?.view.lighting,
      grid: presentation?.view.display.grid,
      axes: presentation?.view.display.axes,
    }),
  );
};
try {
  const first = await controller.reconcile();
  if (first.status !== 'applied') {
    throw new Error(JSON.stringify(first));
  }
  report();
  if (process.argv.includes('--watch')) {
    const watcher = watchScene({
      root,
      invalidate: () => {
        controller.invalidate();
      },
      reconcile: async () => controller.reconcile(),
      report(result) {
        console.log(result.status);
        if (result.status === 'applied') {
          report();
        }
      },
    });
    try {
      await new Promise<void>((resolve) => {
        process.once('SIGINT', resolve);
        process.once('SIGTERM', resolve);
      });
    } finally {
      watcher.dispose();
    }
  } else {
    const original = await readFile(join(root, viewPath));
    const next = {
      ...presentation!.view,
      camera: { kind: 'preset', preset: 'top' },
      lighting: { ...presentation!.view.lighting, ambientIntensity: 0.6 },
      display: { ...presentation!.view.display, grid: false, axes: false },
    };
    await writeFile(join(root, `${viewPath}.tmp`), JSON.stringify(next));
    await rename(join(root, `${viewPath}.tmp`), join(root, viewPath));
    const changed = await controller.reconcile();
    if (changed.status !== 'applied' || geometryPreparations !== 1) {
      throw new Error('Presentation unexpectedly rebuilt geometry.');
    }
    report();
    await writeFile(join(root, viewPath), '{');
    const invalid = await controller.reconcile();
    if (invalid.status !== 'invalid-preserved' || controller.current?.id !== presentation?.id) {
      throw new Error('Last-known-good preservation failed.');
    }
    console.log(JSON.stringify({ interruptedWrite: invalid.status, retainedRevision: controller.current?.id }));
    await writeFile(join(root, viewPath), original);
  }
} finally {
  controller.dispose();
}
