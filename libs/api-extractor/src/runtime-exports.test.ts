// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { authoringTypeMaps, geospecTypes } from '#authoring-types.js';
import { jscadModelingTypes, kernelTypeMaps, manifoldTypes, opencascadeTypes, replicadTypes } from '#kernel-types.js';
import { kclStdlibReference } from '#kcl-reference.js';

describe('@taucad/api-extractor runtime subpaths', () => {
  it('kernel-types exposes parsed JSON type maps for all kernels', () => {
    expect(kernelTypeMaps).toHaveLength(4);
    expect(Object.keys(opencascadeTypes).length).toBeGreaterThan(0);
    expect(Object.keys(replicadTypes).length).toBeGreaterThan(0);
    expect(Object.keys(jscadModelingTypes).length).toBeGreaterThan(0);
    expect(Object.keys(manifoldTypes).length).toBeGreaterThan(0);
    expect(typeof Object.values(replicadTypes)[0]).toBe('string');
  });

  it('kcl-reference exposes bundled markdown text', () => {
    expect(typeof kclStdlibReference).toBe('string');
    expect(kclStdlibReference.length).toBeGreaterThan(100);
  });

  it('kernel-types module does not pull in KCL markdown assets', () => {
    const kernelTypesSource = readFileSync(fileURLToPath(new URL('kernel-types.ts', import.meta.url)), 'utf8');
    expect(kernelTypesSource).not.toContain('kcl-stdlib-compact.md');
    expect(kernelTypesSource).not.toContain('kcl-reference');
  });

  it('root entry stays type-only and does not bundle runtime assets', () => {
    const indexSource = readFileSync(fileURLToPath(new URL('index.ts', import.meta.url)), 'utf8');
    expect(indexSource).not.toMatch(/\?raw/);
    expect(indexSource).not.toContain('kernelTypeMaps');
    expect(indexSource).not.toContain('kclStdlibReference');
    expect(indexSource).not.toContain('authoringTypeMaps');
  });

  it('authoring-types exposes generated GeoSpec package declarations for all public subpaths', () => {
    expect(authoringTypeMaps).toContain(geospecTypes);
    const { geospec } = geospecTypes;
    if (!geospec) {
      throw new Error('Generated GeoSpec authoring types are missing.');
    }
    const { content = '', files = {}, packageJson = {} } = geospec;

    expect(content).toContain("from './runner/types.js'");
    for (const declarationFile of [
      'brep/index.d.ts',
      'config/index.d.ts',
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

    expect(packageJson['name']).toBe('geospec');
    const exportsValue = packageJson['exports'];
    if (!exportsValue || typeof exportsValue !== 'object' || Array.isArray(exportsValue)) {
      throw new TypeError('Generated GeoSpec package.json exports must be an object.');
    }
    const packageExports: Record<string, unknown> = exportsValue as Record<string, unknown>;
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

  it('generated GeoSpec declarations preserve model-loader and matcher JSDoc', () => {
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
    const runnerNodeTypes = files['runner/node/index.d.ts'] ?? '';
    const runnerWebTypes = files['runner/web/index.d.ts'] ?? '';
    const runnerWorkerTypes = files['runner/worker/index.d.ts'] ?? '';
    const stepTypes = files['step/index.d.ts'] ?? '';
    const stepLoaderTypes = files['step/load-step.d.ts'] ?? '';

    expect(modelTypes).toContain("export { createModelLoader, loadModel } from './load-model.js';");
    expect(modelLoaderTypes).toContain('Load a CAD model into GeoSpec evidence.');
    expect(modelLoaderTypes).toContain('export declare function loadModel');
    expect(modelOptionTypes).toContain("'step' | 'stp'");
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
    expect(runnerTypes).toContain('toHaveHausdorffDistanceTo');
    expect(runnerTypes).toContain('toHaveCircularHolePattern');
    expect(runnerTypes).toContain('toHaveFilletFeature');
    expect(runnerTypes).toContain('toHavePlanarFace');
    expect(runnerTypes).toContain('GeoSpecComponentOverlapExpectation');
    expect(runnerTypes).toContain('toHaveNoComponentOverlap');
    expect(runnerTypes).toContain('Assert that separate assembly components do not occupy the same solid volume');
    expect(runnerIndexTypes).toContain('GeoSpecComponentOverlapExpectation');
    expect(runnerNodeTypes).toContain('Create a GeoSpec runner for Node.js and CLI environments.');
    expect(runnerWebTypes).toContain('Create a GeoSpec runner for browser environments.');
    expect(runnerWorkerTypes).toContain('Lifecycle event emitted by GeoSpec worker-style runners.');
    expect(runnerWorkerTypes).toContain('testNamePattern?: string | RegExp');
    expect(stepTypes).toContain('loadStep');
    expect(stepLoaderTypes).toContain('Load STEP/XDE/BRep evidence');
  });

  it('generated GeoSpec mesh declarations expose native component-overlap analysis', () => {
    const { geospec } = geospecTypes;
    if (!geospec) {
      throw new Error('Generated GeoSpec authoring types are missing.');
    }
    const { files = {} } = geospec;
    const meshIndexTypes = files['mesh/index.d.ts'] ?? '';
    const meshOverlapTypes = files['mesh/overlap.d.ts'] ?? '';
    const meshNativeTypes = files['mesh/native.d.ts'] ?? '';

    expect(meshIndexTypes).toContain('analyzeMeshOverlap');
    expect(meshOverlapTypes).toContain('Analyze whether separate mesh components physically occupy the same solid');
    expect(meshOverlapTypes).toContain('AnalyzeMeshOverlapOptions');
    expect(meshOverlapTypes).toContain('MeshComponentOverlap');
    expect(meshNativeTypes).toContain('GeoSpecNativeMeshOverlapResult');
  });
});
