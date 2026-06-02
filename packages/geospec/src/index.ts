/**
 * GeoSpec root authoring API.
 *
 * @module
 */

import { getCollector } from '#runner/collector.js';
import type { GeoSpecConfig } from '#config/index.js';
import type { AnalyzeMeshResult, LoadMeshOptions, LoadMeshResult } from '#mesh/load-mesh.js';
import type { GeoSpecMatcher } from '#runner/types.js';

export type { GeoSpecConfig, GeoSpecRunnerConfig, GeoSpecToleranceConfig, GeoSpecUnit } from '#config/index.js';
export type {
  GeoSpecAssertion,
  GeoSpecAxisExpectation,
  GeoSpecBoundingBoxExpectation,
  GeoSpecCenterOfMassExpectation,
  GeoSpecChamferDistanceExpectation,
  GeoSpecChamferFeatureExpectation,
  GeoSpecCircularHoleExpectation,
  GeoSpecCylindricalFaceExpectation,
  GeoSpecConnectedComponentsExpectation,
  GeoSpecMatcher,
  GeoSpecMassExpectation,
  GeoSpecMinimumWallThicknessExpectation,
  GeoSpecCircularHolePatternExpectation,
  GeoSpecFilletFeatureExpectation,
  GeoSpecMinimumDistanceExpectation,
  GeoSpecNumericExpectation,
  GeoSpecPlanarFaceExpectation,
  GeoSpecPointExpectation,
  GeoSpecProductStructureExpectation,
  GeoSpecStepUnitsExpectation,
  GeoSpecSurfaceAreaExpectation,
  GeoSpecTopologyCountsExpectation,
  GeoSpecVolumeExpectation,
} from '#runner/types.js';
export type {
  BrepEvidence,
  GeometryFileFormat,
  GeometryCapability,
  GeometryDiagnostic,
  GeometryProvenance,
  GeometrySource,
  GeometrySubject,
  MeshEvidence,
  MeshFileFormat,
  MeshQualityStats,
  MeshTriangle,
  StepEvidence,
  Vec3,
} from '#mesh/types.js';

/**
 * Stateful GeoSpec API created by {@link createGeoSpec}.
 *
 * @public
 */
export type GeoSpec = {
  readonly config: GeoSpecConfig;
  loadMesh(options: LoadMeshOptions): Promise<LoadMeshResult>;
  analyzeMesh(options: LoadMeshOptions): Promise<AnalyzeMeshResult>;
};

/**
 * Create a GeoSpec instance.
 *
 * The root factory stays lazy: mesh parsing code is loaded only when a mesh
 * method is called.
 *
 * @param config - Optional GeoSpec defaults.
 * @returns A GeoSpec API instance.
 * @public
 */
export function createGeoSpec(config: GeoSpecConfig = {}): GeoSpec {
  return {
    config,
    async loadMesh(options) {
      const mesh = await import('#mesh/index.js');
      return mesh.loadMesh({ unit: config.unit, ...options });
    },
    async analyzeMesh(options) {
      const mesh = await import('#mesh/index.js');
      return mesh.analyzeMesh({ unit: config.unit, ...options });
    },
  };
}

type GeoSpecTestCallback = () => unknown | PromiseLike<unknown>;

type SuiteFunction = {
  (name: string, function_: GeoSpecTestCallback): void;
  skip(name: string, function_?: GeoSpecTestCallback): void;
};

type TestFunction = {
  (name: string, function_: GeoSpecTestCallback): void;
  skip(name: string, function_?: GeoSpecTestCallback): void;
};

/**
 * GeoSpec suite helper used inside VM-executed test modules.
 *
 * @public
 */
export const describe: SuiteFunction = Object.assign(
  (name: string, function_: GeoSpecTestCallback): void => {
    getCollector().describe(name, function_);
  },
  {
    skip(name: string, _function?: GeoSpecTestCallback): void {
      getCollector().describeSkip(name, _function);
    },
  },
);

/**
 * GeoSpec test helper used inside VM-executed test modules.
 *
 * @public
 */
export const it: TestFunction = Object.assign(
  (name: string, function_: GeoSpecTestCallback): void => {
    getCollector().it(name, function_);
  },
  {
    skip(name: string, _function?: GeoSpecTestCallback): void {
      getCollector().itSkip(name, _function);
    },
  },
);

/**
 * Alias for {@link it}.
 *
 * @public
 */
export const test = it;

/**
 * Start a geometry assertion chain.
 *
 * @param subject - geometry subject under test.
 * @returns GeoSpec geometry matchers.
 * @public
 */
export function expectGeo(subject: unknown): GeoSpecMatcher {
  return getCollector().expectGeo(subject);
}

export type { AnalyzeMeshResult, LoadMeshOptions, LoadMeshResult } from '#mesh/load-mesh.js';
export type { Vec3 as GeoSpecVec3 } from '#mesh/types.js';
