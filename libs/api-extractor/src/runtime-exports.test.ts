// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { authoringTypeMaps, geospecTypes } from '#authoring-types.js';
import type { BundledTypesPackage } from '#bundled-types.types.js';
import {
  jscadModelingTypes,
  kernelTypePackageMaps,
  manifoldTypes,
  opencascadeTypes,
  picovoxelTypes,
  replicadTypes,
} from '#kernel-types.js';
import { kclStdlibReference } from '#kcl-reference.js';

describe('@taucad/api-extractor runtime subpaths', () => {
  it('should expose raw declaration maps and package-shaped projections for all kernels', () => {
    expect(Object.keys(opencascadeTypes)).toEqual(['libcascade']);
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
      ['libcascade', 'replicad', '@jscad/modeling', 'manifold-3d', 'picovoxel'].sort(),
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
    expect(Object.keys(opencascadePackage?.files ?? {})).toEqual([]);
    expect(replicadPackage?.content).toBe(replicadTypes['replicad']);
    expect(Object.keys(replicadPackage?.files ?? {})).toEqual([]);
    const picovoxelPackage = picovoxelTypes['picovoxel'];
    const picovoxelSubpaths = ['latticelibrary', 'multi', 'numerics', 'raw', 'shapekernel', 'slicing', 'three'];
    expect(picovoxelPackage?.content).toContain('createPico');
    for (const subpath of picovoxelSubpaths) {
      expect(picovoxelPackage?.files?.[`${subpath}.d.ts`], subpath).toBeTypeOf('string');
    }
    expect(Object.keys(picovoxelPackage?.files ?? {})).toEqual([
      'dispose.d.ts',
      'errors-DXf6-DZ_.d.ts',
      'fields-_29bPm81.d.ts',
      'frame-BJ-gW1HI.d.ts',
      'implicitUtility-Ihy7S0Uw.d.ts',
      'latticelibrary.d.ts',
      'multi.d.ts',
      'numerics.d.ts',
      'raw.d.ts',
      'session-C3vEcmta.d.ts',
      'shapekernel.d.ts',
      'slicing.d.ts',
      'three.d.ts',
      'types-a7F3gUD0.d.ts',
    ]);
    expect(picovoxelPackage?.files?.['shapekernel.d.ts']).toContain('BaseBox');
    expect(picovoxelPackage?.files?.['fields-_29bPm81.d.ts']).toContain('meshToStlBytes');
    expect(picovoxelPackage?.packageJson?.['exports']).toEqual(
      Object.fromEntries([
        ['.', { types: './index.d.ts' }],
        ...picovoxelSubpaths.map((subpath) => [`./${subpath}`, { types: `./${subpath}.d.ts` }]),
      ]),
    );
  });

  it('should expose bundled KCL markdown text', () => {
    expect(typeof kclStdlibReference).toBe('string');
    expect(kclStdlibReference.length).toBeGreaterThan(100);
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
    expect(indexSource).not.toContain('kclStdlibReference');
    expect(indexSource).not.toContain('authoringTypeMaps');
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
      'brep/index.d.ts',
      'mesh/index.d.ts',
      'model/index.d.ts',
      'runner/index.d.ts',
      'runner/node/index.d.ts',
      'runner/web/index.d.ts',
      'runner/worker/index.d.ts',
      'step/index.d.ts',
    ]) {
      expect(typeof files[declarationFile]).toBe('string');
    }
    expect(files['config/index.d.ts']).toBeUndefined();

    expect(packageJson['name']).toBe('geospec');
    const exportsValue = packageJson['exports'];
    if (!exportsValue || typeof exportsValue !== 'object' || Array.isArray(exportsValue)) {
      throw new TypeError('Generated GeoSpec package.json exports must be an object.');
    }
    const packageExports: Record<string, unknown> = exportsValue as Record<string, unknown>;
    expect(packageExports['./config']).toBeUndefined();
    const expectedPublicExports = [
      ['./brep', './brep/index.d.ts'],
      ['./model', './model/index.d.ts'],
      ['./runner/node', './runner/node/index.d.ts'],
      ['./runner/web', './runner/web/index.d.ts'],
      ['./runner/worker', './runner/worker/index.d.ts'],
      ['./step', './step/index.d.ts'],
    ] as const;
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
    const runnerNodeTypes = files['runner/node/node-runner.d.ts'] ?? '';
    const runnerWebTypes = files['runner/web/web-runner.d.ts'] ?? '';
    const runnerWorkerTypes = files['runner/worker/runner-types.d.ts'] ?? '';
    const stepTypes = files['step/index.d.ts'] ?? '';
    const stepLoaderTypes = files['step/load-step.d.ts'] ?? '';

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
    expect(runnerNodeTypes).toContain('Create a GeoSpec runner for Node.js and CLI environments.');
    expect(runnerWebTypes).toContain('Create a GeoSpec runner for browser environments.');
    expect(runnerWorkerTypes).toContain('Lifecycle event emitted by GeoSpec worker-style runners.');
    expect(runnerWorkerTypes).toContain('testNamePattern?: string | RegExp');
    expect(stepTypes).toContain('loadStep');
    expect(stepLoaderTypes).toContain('Load STEP/XDE/BRep evidence');
  });

  it('should expose native component-overlap analysis in generated GeoSpec mesh declarations', () => {
    const { geospec } = geospecTypes;
    if (!geospec) {
      throw new Error('Generated GeoSpec authoring types are missing.');
    }
    const { files = {} } = geospec;
    const meshIndexTypes = files['mesh/index.d.ts'] ?? '';
    const meshOverlapTypes = files['mesh/overlap.d.ts'] ?? '';

    expect(meshIndexTypes).toContain('analyzeMeshOverlap');
    expect(meshOverlapTypes).toContain("Find positive-volume intersections between a subject's components.");
    expect(meshOverlapTypes).toContain('AnalyzeMeshOverlapOptions');
    expect(meshOverlapTypes).toContain('MeshComponentOverlap');
  });
});
