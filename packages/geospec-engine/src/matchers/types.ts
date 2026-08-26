/** Engine-internal matcher call shapes. Live subjects never cross Contract B. @module */

import type { GeoSpecMatcherName } from 'geospec/engine';
import type { GeometryDiagnostic } from '#mesh/types.js';
import type { GeoSpecAssertion } from '#runner/types.js';
import type { ForensicSink } from '#runner/forensic.js';

/**
 *
 */
export type GeoSpecMatcherInvocation = {
  readonly protocolVersion: number;
  readonly matcher: GeoSpecMatcherName;
  readonly kind: GeoSpecAssertion['kind'];
  readonly subject: unknown;
  readonly arguments: readonly unknown[];
  readonly expected: unknown;
  /** Request-scoped observation sink; never part of claim identity. */
  readonly forensic?: ForensicSink;
};

/**
 *
 */
export type GeoSpecMatcherImplementation = (
  invocation: GeoSpecMatcherInvocation,
) => readonly GeometryDiagnostic[] | Promise<readonly GeometryDiagnostic[]>;

/**
 *
 */
export type GeoSpecMatcherImplementations = Partial<Record<GeoSpecMatcherName, GeoSpecMatcherImplementation>>;
