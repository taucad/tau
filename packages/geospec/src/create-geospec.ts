/**
 * GeoSpec root authoring API.
 *
 * @module
 */

import { getCollector } from '#runner/collector.js';
import type { GeoSpecMatcher } from '#runner/types.js';
import { expectGeoSubject } from '#model/subject-assertions.js';
import type { GeoSpecSubject } from '#model/subject.js';
import { geoSpecMatcherDescriptors } from '#engine/matchers.js';

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
export function expectGeo(subject: GeoSpecSubject): GeoSpecMatcher {
  return expectGeoSubject(subject);
}

/**
 * Every matcher name exposed by {@link expectGeo}, derived from the live
 * matcher surface so it can never drift from the real implementation. Use it to
 * assert that documentation, prompt examples, or authored suites only reference
 * matchers that actually exist.
 *
 * @public
 */
export const geoSpecMatcherNames: readonly string[] = Object.freeze(Object.keys(geoSpecMatcherDescriptors));
