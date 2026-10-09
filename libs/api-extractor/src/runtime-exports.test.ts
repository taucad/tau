// @vitest-environment node
import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { authoringTypeMaps, geospecTypes, kinematicsTypes } from '#authoring-types.js';
import type { BundledTypesPackage } from '#bundled-types.types.js';
import {
  jscadModelingTypes,
  kernelTypePackageMaps,
  manifoldTypes,
  opencascadeTypes,
  picovoxelTypes,
  replicadTypes,
} from '#kernel-types.js';

describe('@taucad/api-extractor runtime subpaths', () => {
  it('should expose raw declaration maps and package-shaped projections for all kernels', () => {
    /* Sharded by W15/R14: one 10 MB declaration is now a root plus one module
     * per OpenCascade package, so the map is 290 keys rather than 1. The root
     * still has to be there and still has to be the entry point. */
    expect(Object.keys(opencascadeTypes)).toContain('libcascade');
    expect(Object.keys(opencascadeTypes).length).toBeGreaterThan(200);
    expect(
      Object.keys(opencascadeTypes)
        .filter((key) => key !== 'libcascade')
        .every((key) => key.startsWith('libcascade/')),
    ).toBe(true);
    expect(Object.keys(replicadTypes).length).toBeGreaterThan(0);
    expect(Object.keys(jscadModelingTypes).length).toBeGreaterThan(0);
    expect(Object.keys(manifoldTypes).length).toBeGreaterThan(0);
    expect(typeof replicadTypes['replicad']).toBe('string');
    expect(typeof jscadModelingTypes['@jscad/modeling/colors']).toBe('string');

    const packages: Record<string, BundledTypesPackage> = {};
    for (const packageMap of kernelTypePackageMaps) {
      for (const [packageName, packageTypes] of Object.entries(packageMap)) {
        packages[packageName] = packageTypes;
      }
    }
    expect(Object.keys(packages).sort()).toEqual(
      ['libcascade', 'replicad', '@jscad/modeling', 'manifold-3d', 'picovoxel', '@taucad/picovoxel'].sort(),
    );

    const jscadPackage = packages['@jscad/modeling'];
    const manifoldPackage = packages['manifold-3d'];
    const opencascadePackage = packages['libcascade'];
    const replicadPackage = packages['replicad'];
    expect(jscadPackage?.content).toBe(jscadModelingTypes['@jscad/modeling']);
    expect(Object.keys(jscadPackage?.files ?? {}).sort()).toEqual(
      Object.keys(jscadModelingTypes)
        .filter((specifier) => specifier !== '@jscad/modeling')
        .map((specifier) => `${specifier.slice('@jscad/modeling/'.length)}/index.d.ts`)
        .sort(),
    );
    expect(jscadPackage?.files?.['colors/index.d.ts']).toBe(jscadModelingTypes['@jscad/modeling/colors']);
    expect(manifoldPackage?.content).toBe(manifoldTypes['manifold-3d']);
    expect(manifoldPackage?.files?.['manifoldCAD/index.d.ts']).toBe(manifoldTypes['manifold-3d/manifoldCAD']);
    expect(opencascadePackage?.content).toBe(opencascadeTypes['libcascade']);
    /* Every shard is projected as a file, and every file is a shard: a shard the
     * projection drops is a type the editor cannot resolve, which is exactly the
     * dangling-pointer failure sharding exists to avoid. */
    expect(Object.keys(opencascadePackage?.files ?? {}).sort()).toEqual(
      Object.keys(opencascadeTypes)
        .filter((specifier) => specifier !== 'libcascade')
        .map((specifier) => `${specifier.slice('libcascade/'.length)}/index.d.ts`)
        .sort(),
    );
    expect(replicadPackage?.content).toBe(replicadTypes['replicad']);
    expect(Object.keys(replicadPackage?.files ?? {})).toEqual([]);

    // PicoVoxel keeps its relative declaration topology: assert structure, not individual file names.
    const picovoxelPackage = packages['picovoxel'];
    expect(picovoxelPackage).toBe(picovoxelTypes['picovoxel']);
    const picovoxelExports = picovoxelPackage?.packageJson?.['exports'] as Record<string, { types: string }>;
    expect(Object.keys(picovoxelExports)).toEqual([
      '.',
      './latticelibrary',
      './numerics',
      './shapekernel',
      './slicing',
    ]);
    const picovoxelFiles: Readonly<Record<string, string | undefined>> = {
      'index.d.ts': picovoxelPackage?.content,
      ...picovoxelPackage?.files,
    };
    for (const { types } of Object.values(picovoxelExports)) {
      expect(picovoxelFiles[types.slice(2)], types).toBeTypeOf('string');
    }
    // Every relative import, nested or climbing (`../numerics/frame.js`), lands on a bundled file.
    for (const [name, declaration] of Object.entries(picovoxelFiles)) {
      for (const [, specifier] of declaration!.matchAll(/(?:from\s+|import\s*\(\s*)["'](\.{1,2}\/[^"']+)\.js["']/gu)) {
        const target = posix.join(posix.dirname(name), `${specifier}.d.ts`);
        expect(picovoxelFiles, `${name} imports ${specifier}`).toHaveProperty([target]);
      }
    }
    expect(Object.keys(picovoxelFiles).filter((name) => /^(?:multi|raw|three)\.d\.ts$/u.test(name))).toEqual([]);
    expect(picovoxelPackage?.content).toContain('type Pico,');
    expect(picovoxelFiles['shapekernel.d.ts']).toContain('BaseBox');
    expect(Object.keys(picovoxelFiles).filter((name) => name.startsWith('shapekernel/')).length).toBeGreaterThan(0);
  });

  it('should keep KCL markdown assets out of the kernel-types module', () => {
    const kernelTypesSource = readFileSync(fileURLToPath(new URL('kernel-types.ts', import.meta.url)), 'utf8');
    expect(kernelTypesSource).not.toContain('kcl-stdlib-compact.md');
    expect(kernelTypesSource).not.toContain('kcl-reference');
  });

  it('should keep the root entry type-only and free of runtime assets', () => {
    const indexSource = readFileSync(fileURLToPath(new URL('index.ts', import.meta.url)), 'utf8');
    expect(indexSource).not.toMatch(/\?raw/);
    expect(indexSource).not.toContain('kernelTypePackageMaps');
    expect(indexSource).not.toContain('authoringTypeMaps');
  });

  it('should expose the mechanism authoring declarations with the spatial types they reference', () => {
    expect(authoringTypeMaps).toContain(kinematicsTypes);
    const kinematics = kinematicsTypes['@taucad/kinematics'];
    const spatial = kinematicsTypes['@taucad/spatial'];
    // Type-only entries: kernel modules import these packages for types alone.
    expect(kinematics?.content).toBe("export type * from './types.js';\n");
    expect(kinematics?.files?.['types.d.ts']).toContain('export type Mechanism =');
    expect(kinematics?.files?.['types.d.ts']).toContain("from '@taucad/spatial'");
    expect(spatial?.content).toBe("export type * from './entry.js';\n");
    expect(spatial?.files?.['entry.d.ts']).toContain("from './spatial-domain.js'");
    expect(spatial?.files?.['spatial-domain.d.ts']).toContain('export type SpatialVector');
  });

  it('should expose generated GeoSpec package declarations for all public subpaths', () => {
    expect(authoringTypeMaps).toContain(geospecTypes);
    const { geospec } = geospecTypes;
    if (!geospec) {
      throw new Error('Generated GeoSpec authoring types are missing.');
    }
    const { content = '', files = {}, packageJson = {} } = geospec;

    expect(content).toContain("from './runner/types.js'");
    for (const declarationFile of [
      'config/index.d.ts',
      'config/node/index.d.ts',
      'mesh/index.d.ts',
      'model/index.d.ts',
      'runner/index.d.ts',
      'runner/native/index.d.ts',
      'runner/worker/index.d.ts',
    ]) {
      expect(typeof files[declarationFile]).toBe('string');
    }
    expect(packageJson['name']).toBe('geospec');
    const exportsValue = packageJson['exports'];
    if (!exportsValue || typeof exportsValue !== 'object' || Array.isArray(exportsValue)) {
      throw new TypeError('Generated GeoSpec package.json exports must be an object.');
    }
    const packageExports: Record<string, unknown> = exportsValue as Record<string, unknown>;
    const expectedPublicExports = [
      ['./config', './config/index.d.ts'],
      ['./config/node', './config/node/index.d.ts'],
      ['./model', './model/index.d.ts'],
      ['./runner/native', './runner/native/index.d.ts'],
      ['./runner/worker', './runner/worker/index.d.ts'],
    ] as const;
    for (const removed of [
      './brep',
      './inspection',
      './proofs',
      './runner/node',
      './runner/web',
      './selector',
      './step',
    ]) {
      expect(packageExports[removed]).toBeUndefined();
    }
    for (const [specifier, typePath] of expectedPublicExports) {
      const exportEntry = packageExports[specifier];
      if (!exportEntry || typeof exportEntry !== 'object' || Array.isArray(exportEntry)) {
        throw new TypeError(`Generated GeoSpec package export ${specifier} must be an object.`);
      }
      expect((exportEntry as Record<string, unknown>)['types']).toBe(typePath);
    }
  });

  it('should preserve model-loader and matcher JSDoc in generated GeoSpec declarations', () => {
    const { geospec } = geospecTypes;
    if (!geospec) {
      throw new Error('Generated GeoSpec authoring types are missing.');
    }
    const { files = {} } = geospec;
    const modelTypes = files['model/index.d.ts'] ?? '';
    const modelLoaderTypes = files['model/load-model.d.ts'] ?? '';
    const modelOptionTypes = files['model/types.d.ts'] ?? '';
    const runnerDiscoveryTypes = files['runner/discovery.d.ts'] ?? '';
    const runnerTypes = files['runner/types.d.ts'] ?? '';
    const runnerIndexTypes = files['runner/index.d.ts'] ?? '';
    const runnerNativeTypes = files['runner/native/native-serial-runner.d.ts'] ?? '';
    const runnerWorkerTypes = files['runner/worker/runner-types.d.ts'] ?? '';

    expect(modelTypes).toContain("export { createModelLoader, loadModel } from './load-model.js';");
    expect(files['model/parameters.d.ts']).toBeUndefined();
    expect(modelTypes).not.toContain('parameterGroups');
    expect(modelTypes).not.toContain('activeParams');
    expect(modelLoaderTypes).toContain('Load a CAD model into GeoSpec evidence.');
    expect(modelLoaderTypes).toContain('export declare function loadModel');
    expect(modelOptionTypes).toContain("'step' | 'stp'");
    expect(modelOptionTypes).toContain('parameters?: Record<string, unknown>');
    expect(modelOptionTypes).not.toContain('parameterSource');
    expect(modelOptionTypes).not.toContain('kernel?:');
    expect(modelOptionTypes).not.toContain('CAD kernel hint');
    expect(modelTypes).toContain('GeoSpecModelLoadError');
    expect(modelTypes).not.toContain('loadModelSafe');
    expect(modelTypes).not.toContain('tryLoadModel');
    expect(runnerDiscoveryTypes).toContain('defaultGeoSpecInclude');
    expect(runnerDiscoveryTypes).toContain('include?: readonly string[]');
    expect(runnerDiscoveryTypes).toContain('exclude?: readonly string[]');
    expect(runnerDiscoveryTypes).toContain('Vitest-style file globs');
    expect(runnerTypes).toContain('Assert total surface area');
    expect(runnerTypes).toContain('testNamePattern?: string | RegExp');
    expect(runnerTypes).toContain('JavaScript regular expression matched against full `suite > test` names.');
    expect(runnerTypes).toContain('toBeValidBrep');
    expect(runnerTypes).not.toContain('toHaveChamferDistanceTo');
    expect(runnerTypes).not.toContain('toHaveHausdorffDistanceTo');
    expect(runnerTypes).not.toContain('toHaveMinimumDistanceTo');
    expect(runnerTypes).not.toContain('minContactArea');
    expect(runnerTypes).toContain('toHaveCircularHolePattern');
    expect(runnerTypes).toContain('toHaveFilletFeature');
    expect(runnerTypes).toContain('toHavePlanarFace');
    expect(runnerTypes).toContain('GeoSpecComponentInterferenceExpectation');
    expect(runnerTypes).toContain('toHaveNoComponentInterference');
    expect(runnerTypes).toContain('Assert that separate assembly components do not occupy the same solid volume');
    expect(runnerIndexTypes).toContain('GeoSpecComponentInterferenceExpectation');
    expect(runnerNativeTypes).toContain('Compose compiled assertion and model bindings');
    expect(runnerWorkerTypes).toContain('Lifecycle event emitted by GeoSpec worker-style runners.');
    expect(runnerWorkerTypes).toContain('testNamePattern?: string | RegExp');
  });
});
