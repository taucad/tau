import { createRequire } from 'node:module';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(import.meta.dirname, '../../../..');
const dependencyPath = (project: string, specifier: string): string =>
  createRequire(resolve(repositoryRoot, project, 'package.json')).resolve(specifier);

type WasmBudget = {
  name: string;
  path: string;
  maxBytes: number;
};

// Current size plus an explicit ~2%/64 KiB-aligned ratchet margin.
const wasmBudgets: WasmBudget[] = [
  {
    name: 'Replicad single',
    path: dependencyPath('packages/plugins/replicad', 'replicad-opencascadejs/wasm'),
    maxBytes: 23_461_888,
  },
  {
    name: 'Replicad multi',
    path: dependencyPath('packages/plugins/replicad', 'replicad-opencascadejs/multi/wasm'),
    maxBytes: 23_003_136,
  },
  {
    name: 'OpenCascade single',
    path: dependencyPath('packages/plugins/opencascade', 'libcascade/wasm'),
    maxBytes: 43_581_440,
  },
  {
    name: 'OpenCascade multi',
    path: dependencyPath('packages/plugins/opencascade', 'libcascade/multi/wasm'),
    maxBytes: 43_581_440,
  },
  {
    name: 'Manifold',
    path: dependencyPath('packages/plugins/manifold', 'manifold-3d/manifold.wasm'),
    maxBytes: 524_288,
  },
  {
    name: 'Zoo/KCL',
    path: dependencyPath('packages/plugins/zoo', '@taucad/kcl-wasm-lib/kcl.wasm'),
    maxBytes: 13_434_880,
  },
  { name: 'esbuild', path: 'packages/plugins/esbuild/src/vm/wasm/esbuild.wasm', maxBytes: 13_828_096 },
  {
    name: 'libassimp',
    path: dependencyPath('packages/plugins/assimp', 'libassimp/wasm'),
    maxBytes: 11_993_088,
  },
  { name: 'BRep OCCT', path: 'packages/plugins/brep/src/wasm/occt-import-js.wasm', maxBytes: 7_798_784 },
  {
    name: 'glTF Draco decoder',
    path: dependencyPath('packages/plugins/gltf', 'draco3dgltf/draco_decoder_gltf.wasm'),
    maxBytes: 196_608,
  },
  {
    name: 'glTF Draco encoder',
    path: dependencyPath('packages/plugins/gltf', 'draco3dgltf/draco_encoder.wasm'),
    maxBytes: 393_216,
  },
  { name: 'Rhino', path: 'packages/plugins/rhino/src/wasm/rhino3dm.wasm', maxBytes: 2_686_976 },
  {
    name: 'OpenRSCAD',
    path: dependencyPath('packages/plugins/openrscad', '@taulabs/openrscad-engine/openrscad_bg.wasm'),
    maxBytes: 6_029_312,
  },
  {
    name: 'GeoSpec OCCT',
    path: 'packages/geospec-engine/native/opencascade/dist/geospec_opencascade_single.wasm',
    maxBytes: 13_369_344,
  },
  {
    name: 'image/resvg',
    path: dependencyPath('packages/plugins/image', '@resvg/resvg-wasm/index_bg.wasm'),
    maxBytes: 2_555_904,
  },
];

describe('WASM binary size budgets', () => {
  for (const budget of wasmBudgets) {
    it(`${budget.name} exists and stays within its ratchet`, () => {
      const fullPath = resolve(repositoryRoot, budget.path);
      expect(existsSync(fullPath), `Missing expected WASM artifact: ${budget.path}`).toBe(true);
      if (!existsSync(fullPath)) {
        return;
      }
      expect(statSync(fullPath).size).toBeLessThanOrEqual(budget.maxBytes);
    });
  }
});
