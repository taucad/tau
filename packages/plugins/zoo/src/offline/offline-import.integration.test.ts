// @vitest-environment node
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileSystemManager } from '#filesystem-manager.js';
import { KclUtilities } from '#kcl-utils.js';
import { OfflineEngineConnection } from '#offline/offline-engine-connection.js';
import type { Oc } from '#offline/offline-occt.js';
import { boundingBox } from '#offline/offline-occt.js';

// Imported meshes count no volume or area, so the fixture suite's baselines cannot see where a mesh lands; these
// checks pin the placement: unit, axes and transforms.
const fixtures = path.join(import.meta.dirname, 'fixtures/kcl/simulation');

type Box = { min: [number, number, number]; max: [number, number, number] };

async function importedBoxes(name: string): Promise<Box[]> {
  const directory = path.join(fixtures, name);
  const fileSystem = {
    async readFile(file: string, encoding?: string) {
      const bytes = await readFile(path.join(directory, file));
      return encoding ? bytes.toString('utf8') : new Uint8Array(bytes);
    },
    async exists(file: string) {
      try {
        await access(path.join(directory, file));
        return true;
      } catch {
        return false;
      }
    },
    async readdir(file: string) {
      return readdir(path.join(directory, file));
    },
  } as unknown as ConstructorParameters<typeof FileSystemManager>[0];
  const utils = new KclUtilities({
    baseUrl: 'ws://offline',
    mode: 'offline',
    fileSystemManager: new FileSystemManager(fileSystem),
  });
  try {
    await utils.initializeEngine();
    const { program } = await utils.parseKcl(await readFile(path.join(directory, 'main.kcl'), 'utf8'));
    const outcome = await utils.executeProgram(program, 'main.kcl');
    expect(outcome.errors.map((error) => error.message)).toEqual([]);
    const oc = await (OfflineEngineConnection as unknown as { occt: Promise<Oc> }).occt;
    return utils.offlineConnection!.engine!.scene.visibleSolids().map((solid) => {
      const box = boundingBox(oc, solid.shape)!;
      return { min: [box.min.x, box.min.y, box.min.z], max: [box.max.x, box.max.y, box.max.z] };
    });
  } finally {
    await utils.cleanup();
  }
}

const expectBox = (actual: Box | undefined, min: number[], max: number[]): void => {
  for (const [axis, value] of min.entries()) {
    expect(actual!.min[axis]).toBeCloseTo(value, 6);
    expect(actual!.max[axis]).toBeCloseTo(max[axis]!, 6);
  }
};

describe('offline KCL: foreign-file imports', () => {
  it('reads glTF in metres', async () => {
    const [cube] = await importedBoxes('import_foreign');
    expectBox(cube, [-1000, -1000, -1000], [1000, 1000, 1000]);
  }, 120_000);

  it('reads OBJ in the unit kcl-lib resolves', async () => {
    const [millimetres] = await importedBoxes('import_obj_with_mtl');
    expectBox(millimetres, [-1, -1, -1], [1, 1, 1]);
    const [metres] = await importedBoxes('import_obj_with_mtl_units');
    expectBox(metres, [-1000, -1000, -1000], [1000, 1000, 1000]);
  }, 120_000);

  it('translates clones of an imported mesh', async () => {
    const boxes = await importedBoxes('import_mesh_clone');
    const corners = boxes
      .map((box) => [Math.round(box.min[0]), Math.round(box.min[1])])
      .toSorted((a, b) => a[1]! - b[1]! || a[0]! - b[0]!);
    expect(corners).toEqual([
      [-3000, -3000],
      [1000, -3000],
      [-3000, 1000],
      [1000, 1000],
    ]);
  }, 120_000);

  it('converts a STEP part from Y-up axes', async () => {
    const boxes = await importedBoxes('multiple-foreign-imports-all-render');
    expectBox(
      boxes.find((box) => Math.abs(box.min[0] + 500) < 1e-6),
      [-500, -500, 0],
      [500, 500, 1000],
    );
  }, 120_000);

  it('scales an imported STL', async () => {
    const [screw] = await importedBoxes('import_transform');
    // The 13.27 x 71.5 mm stand-in box, scaled by 3.14 after a small rotation: its extent grows past 3.14 times.
    const length = screw!.max[1] - screw!.min[1];
    expect(length).toBeGreaterThan(71.5 * 3.14);
    expect(length).toBeLessThan(71.5 * 3.14 * 1.05);
  }, 120_000);
});
