/**
 * GeoSpec root authoring API.
 *
 * @module
 */

import { createCollector, getCollector } from '#runner/collector.js';
import type { AnalyzeMeshResult, LoadMeshOptions, LoadMeshResult } from '#mesh/load-mesh.js';
import type { GeoSpecMatcher } from '#runner/types.js';

/**
 * Stateful GeoSpec API created by {@link createGeoSpec}.
 *
 * @public
 */
export type GeoSpec = {
  loadMesh(options: LoadMeshOptions): Promise<LoadMeshResult>;
  analyzeMesh(options: LoadMeshOptions): Promise<AnalyzeMeshResult>;
};

/**
 * Create a GeoSpec instance.
 *
 * The root factory stays lazy: mesh parsing code is loaded only when a mesh
 * method is called.
 *
 * @returns A GeoSpec API instance.
 * @public
 */
export function createGeoSpec(): GeoSpec {
  return {
    async loadMesh(options) {
      const mesh = await import('#mesh/index.js');
      return mesh.loadMesh(options);
    },
    async analyzeMesh(options) {
      const mesh = await import('#mesh/index.js');
      return mesh.analyzeMesh(options);
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

/**
 * Every matcher name exposed by {@link expectGeo}, derived from the live
 * matcher surface so it can never drift from the real implementation. Use it to
 * assert that documentation, prompt examples, or authored suites only reference
 * matchers that actually exist.
 *
 * @public
 */
export const geoSpecMatcherNames: readonly string[] = Object.freeze(
  Object.keys(createCollector().expectGeo(undefined)),
);
