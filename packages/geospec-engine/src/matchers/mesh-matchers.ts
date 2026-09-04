/**
 * Matcher bodies backed by mesh evidence (and by exact mass properties when
 * the subject carries them).
 *
 * Exact BRep evidence is canonical when present; mesh evidence is used only
 * for mesh-only subjects.
 *
 * @module
 */

import type { GeoSpecMatcherImplementation } from '#matchers/types.js';
import { analyzeMeshOverlap } from '#mesh/overlap.js';
import type { GeometryDiagnostic, GeometrySubject, Vec3 } from '#mesh/types.js';
import type {
  GeoSpecBoundingBoxExpectation,
  GeoSpecCenterOfMassExpectation,
  GeoSpecComponentInterferenceAllowance,
  GeoSpecComponentInterferenceExpectation,
  GeoSpecConnectedComponentsExpectation,
  GeoSpecMassExpectation,
  GeoSpecMeshIntegrityExpectation,
  GeoSpecSurfaceAreaExpectation,
} from '#runner/types.js';
import {
  brepSuggestion,
  defaultLinearTolerance,
  describeNumeric,
  evidenceUnsupported,
  labelMatches,
  matcherDiagnostic,
  matcherSubject,
  numericHolds,
  pointFailures,
} from '#matchers/support.js';

/**
 * Pick the evidence source a scalar claim answers from.
 *
 * @param subject - The subject.
 * @returns The deterministic source.
 */
const scalarSource = (subject: GeometrySubject): 'brep' | 'mesh' =>
  subject.brep?.massProperties === undefined ? 'mesh' : 'brep';

const scalarMismatch = (options: {
  matcher: string;
  quantity: string;
  measured: number;
  expected: GeoSpecSurfaceAreaExpectation['value'];
  tolerance: number;
  source: string;
}): GeometryDiagnostic =>
  matcherDiagnostic({
    code: 'GEOSPEC_MEASUREMENT_MISMATCH',
    message: `${options.quantity} is ${options.measured} (${options.source} evidence), which does not satisfy ${describeNumeric(options.expected)} within ${options.tolerance}.`,
    suggestion: `Correct the model, or widen the declared ${options.quantity.toLowerCase()} expectation.`,
    details: {
      matcher: options.matcher,
      measured: options.measured,
      expected: options.expected,
      tolerance: options.tolerance,
      evidence: options.source,
    },
  });

/** One scalar mass-property matcher: surface area, volume, mass. */
const scalarMatcher =
  (options: {
    matcher: string;
    quantity: string;
    brep: (subject: GeometrySubject) => number | undefined;
    mesh: (subject: GeometrySubject) => number | undefined;
  }): GeoSpecMatcherImplementation =>
  (invocation) => {
    const resolved = matcherSubject(invocation);
    if ('diagnostics' in resolved) {
      return resolved.diagnostics;
    }
    const expectation = invocation.expected as GeoSpecSurfaceAreaExpectation;
    const source = scalarSource(resolved.subject);
    const measured = source === 'brep' ? options.brep(resolved.subject) : options.mesh(resolved.subject);
    if (measured === undefined) {
      return evidenceUnsupported({
        matcher: options.matcher,
        missing: `a ${options.quantity.toLowerCase()} measurement`,
        suggestion: brepSuggestion,
      });
    }
    const tolerance = expectation.tolerance ?? defaultLinearTolerance;
    return numericHolds(measured, expectation.value, tolerance)
      ? []
      : [
          scalarMismatch({
            matcher: options.matcher,
            quantity: options.quantity,
            measured,
            expected: expectation.value,
            tolerance,
            source,
          }),
        ];
  };

/**
 * `expectGeo(...).toHaveSurfaceArea(...)`.
 *
 * @public
 */
export const toHaveSurfaceArea = scalarMatcher({
  matcher: 'toHaveSurfaceArea',
  quantity: 'Surface area',
  brep: (subject) => subject.brep?.massProperties?.surfaceArea,
  mesh: (subject) => subject.mesh.stats.meshQuality.surfaceArea,
});

/**
 * `expectGeo(...).toHaveVolume(...)`.
 *
 * @public
 */
export const toHaveVolume = scalarMatcher({
  matcher: 'toHaveVolume',
  quantity: 'Volume',
  brep: (subject) => subject.brep?.massProperties?.volume,
  mesh: (subject) => Math.abs(subject.mesh.stats.meshQuality.signedVolume),
});

/**
 * `expectGeo(...).toHaveMass(...)`.
 *
 * Mass is exact mass properties when the kernel reported them, otherwise
 * `volume x density` — and a claim with neither is `unsupported` rather than
 * silently reported as a volume.
 *
 * @public
 */
export const toHaveMass: GeoSpecMatcherImplementation = (invocation) => {
  const resolved = matcherSubject(invocation);
  if ('diagnostics' in resolved) {
    return resolved.diagnostics;
  }
  const expectation = invocation.expected as GeoSpecMassExpectation;
  const source = scalarSource(resolved.subject);
  const volume =
    source === 'brep'
      ? resolved.subject.brep?.massProperties?.volume
      : Math.abs(resolved.subject.mesh.stats.meshQuality.signedVolume);
  const exact = source === 'brep' ? resolved.subject.brep?.massProperties?.mass : undefined;
  const measured =
    exact ?? (expectation.density !== undefined && volume !== undefined ? volume * expectation.density : undefined);
  if (measured === undefined) {
    return evidenceUnsupported({
      matcher: 'toHaveMass',
      missing: 'an exact mass, or a declared `density` to derive one from the volume',
      suggestion: 'Declare `density` on the expectation, or load a subject whose kernel reports mass properties.',
    });
  }
  const tolerance = expectation.tolerance ?? defaultLinearTolerance;
  return numericHolds(measured, expectation.value, tolerance)
    ? []
    : [
        scalarMismatch({
          matcher: 'toHaveMass',
          quantity: 'Mass',
          measured,
          expected: expectation.value,
          tolerance,
          source,
        }),
      ];
};

/**
 * `expectGeo(...).toHaveCenterOfMass(...)`.
 *
 * @public
 */
export const toHaveCenterOfMass: GeoSpecMatcherImplementation = (invocation) => {
  const resolved = matcherSubject(invocation);
  if ('diagnostics' in resolved) {
    return resolved.diagnostics;
  }
  const expectation = invocation.expected as GeoSpecCenterOfMassExpectation;
  const source = scalarSource(resolved.subject);
  const measured =
    source === 'brep'
      ? resolved.subject.brep?.massProperties?.centerOfMass
      : resolved.subject.mesh.stats.meshQuality.centerOfMass;
  if (!measured) {
    return evidenceUnsupported({
      matcher: 'toHaveCenterOfMass',
      missing: 'a centre of mass (the subject is not a closed solid)',
      suggestion: brepSuggestion,
    });
  }
  const tolerance = expectation.tolerance ?? defaultLinearTolerance;
  const failures = pointFailures(measured, expectation.point, tolerance);
  return failures.length === 0
    ? []
    : [
        matcherDiagnostic({
          code: 'GEOSPEC_MEASUREMENT_MISMATCH',
          message: `Centre of mass is [${measured.join(', ')}], off the declared point on ${failures.map((failure) => failure.axis).join('/')} by more than ${tolerance}.`,
          suggestion: 'Correct the model, or widen the declared centre-of-mass tolerance.',
          spatial: { center: [...measured] as Vec3 },
          details: { matcher: 'toHaveCenterOfMass', measured, failures, tolerance },
        }),
      ];
};

/**
 * `expectGeo(...).toHaveBoundingBox(...)`.
 *
 * @public
 */
export const toHaveBoundingBox: GeoSpecMatcherImplementation = (invocation) => {
  const resolved = matcherSubject(invocation);
  if ('diagnostics' in resolved) {
    return resolved.diagnostics;
  }
  const expectation = invocation.expected as GeoSpecBoundingBoxExpectation;
  const brep = resolved.subject.brep?.boundingBox;
  const useBrep = brep !== undefined;
  const mesh = resolved.subject.mesh.stats.boundingBox;
  if (!useBrep && !mesh) {
    return evidenceUnsupported({
      matcher: 'toHaveBoundingBox',
      missing: 'mesh bounds (the subject has no triangles)',
      suggestion: 'Load the model with mesh evidence enabled.',
    });
  }
  const size = useBrep ? brep.size : mesh!.size;
  const center = useBrep ? brep.center : mesh!.center;
  const min = useBrep ? brep.min : ([0, 1, 2].map((axis) => center[axis]! - size[axis]! / 2) as unknown as Vec3);
  const max = useBrep ? brep.max : ([0, 1, 2].map((axis) => center[axis]! + size[axis]! / 2) as unknown as Vec3);
  const tolerance = expectation.tolerance ?? defaultLinearTolerance;
  const failures = [
    ...(expectation.min ? pointFailures(min, expectation.min, tolerance).map((f) => ({ ...f, field: 'min' })) : []),
    ...(expectation.max ? pointFailures(max, expectation.max, tolerance).map((f) => ({ ...f, field: 'max' })) : []),
    ...(expectation.size === undefined
      ? []
      : pointFailures(size, expectation.size, tolerance).map((f) => ({ ...f, field: 'size' }))),
    ...(expectation.center
      ? pointFailures(center, expectation.center, tolerance).map((f) => ({ ...f, field: 'center' }))
      : []),
  ];
  return failures.length === 0
    ? []
    : [
        matcherDiagnostic({
          code: 'GEOSPEC_BOUNDING_BOX_MISMATCH',
          message: `Bounding box is off the declared bounds on ${failures.map((failure) => `${failure.field}.${failure.axis}`).join(', ')} (tolerance ${tolerance}).`,
          suggestion: 'Correct the model dimensions, or widen the declared bounding-box tolerance.',
          spatial: { min: [...min] as Vec3, max: [...max] as Vec3, center: [...center] as Vec3 },
          details: {
            matcher: 'toHaveBoundingBox',
            measured: { min, max, size, center },
            axisFailures: failures,
            tolerance,
            evidence: useBrep ? 'brep' : 'mesh',
          },
        }),
      ];
};

/**
 * `expectGeo(...).toHaveConnectedComponents(...)`.
 *
 * @public
 */
export const toHaveConnectedComponents: GeoSpecMatcherImplementation = (invocation) => {
  const resolved = matcherSubject(invocation);
  if ('diagnostics' in resolved) {
    return resolved.diagnostics;
  }
  const expectation = invocation.expected as GeoSpecConnectedComponentsExpectation;
  const toleranceMm = expectation.toleranceMm ?? expectation.tolerance ?? defaultLinearTolerance;
  const analysis = resolved.subject.mesh.stats.analyseConnectedComponents(toleranceMm);
  return analysis.count === expectation.count
    ? []
    : [
        matcherDiagnostic({
          code: 'GEOSPEC_CONNECTED_COMPONENTS_MISMATCH',
          message: `The subject has ${analysis.count} spatially disjoint components at a ${toleranceMm} mm tolerance, not the declared ${expectation.count}.`,
          suggestion:
            'Join or separate the parts, or loosen `toleranceMm` so intentionally close components collapse into one.',
          details: {
            matcher: 'toHaveConnectedComponents',
            expected: expectation.count,
            got: analysis.count,
            toleranceMm,
            clusters: analysis.clusters,
            gaps: analysis.gaps,
          },
        }),
      ];
};

/**
 * `expectGeo(...).toBeWatertight()`.
 *
 * @public
 */
export const toBeWatertight: GeoSpecMatcherImplementation = (invocation) => {
  const resolved = matcherSubject(invocation);
  if ('diagnostics' in resolved) {
    return resolved.diagnostics;
  }
  const analysis = resolved.subject.mesh.stats.analyseWatertight();
  return analysis.watertight
    ? []
    : [
        matcherDiagnostic({
          code: 'GEOSPEC_WATERTIGHT_MISMATCH',
          message: `The mesh has ${analysis.irregularEdges} irregular edges (${analysis.openBoundaryEdges} open, ${analysis.nonManifoldEdges} non-manifold), so it is not a closed manifold surface.`,
          suggestion: 'Close the open boundaries and remove the over-adjacent faces, then re-export.',
          details: { matcher: 'toBeWatertight', ...analysis },
        }),
      ];
};

/**
 * `expectGeo(...).toHaveMeshIntegrity(...)`.
 *
 * @public
 */
export const toHaveMeshIntegrity: GeoSpecMatcherImplementation = (invocation) => {
  const resolved = matcherSubject(invocation);
  if ('diagnostics' in resolved) {
    return resolved.diagnostics;
  }
  const expectation = invocation.expected as GeoSpecMeshIntegrityExpectation;
  const quality = resolved.subject.mesh.stats.meshQuality;
  const failures: string[] = [];
  if (expectation.finitePositions === true && quality.nonFiniteVertices.length > 0) {
    failures.push(`${quality.nonFiniteVertices.length} non-finite vertex positions`);
  }
  const degenerate = expectation.degenerateTriangles;
  if (degenerate) {
    const count = quality.degenerateTriangles.filter(
      (triangle) => degenerate.areaTolerance === undefined || triangle.area <= degenerate.areaTolerance,
    ).length;
    if (degenerate.count !== undefined && count !== degenerate.count) {
      failures.push(`${count} degenerate triangles, not the declared ${degenerate.count}`);
    }
    if (degenerate.maxCount !== undefined && count > degenerate.maxCount) {
      failures.push(`${count} degenerate triangles, above the declared maximum ${degenerate.maxCount}`);
    }
  }
  const duplicates = expectation.duplicateFaces;
  if (duplicates) {
    const count = quality.duplicateFaces.length;
    if (duplicates.count !== undefined && count !== duplicates.count) {
      failures.push(`${count} duplicate faces, not the declared ${duplicates.count}`);
    }
    if (duplicates.maxCount !== undefined && count > duplicates.maxCount) {
      failures.push(`${count} duplicate faces, above the declared maximum ${duplicates.maxCount}`);
    }
  }
  if (expectation.watertight !== undefined) {
    const { watertight } = resolved.subject.mesh.stats.analyseWatertight();
    if (watertight !== expectation.watertight) {
      failures.push(`watertight is ${watertight}, not the declared ${expectation.watertight}`);
    }
  }
  if (expectation.triangleCount !== undefined && !numericHolds(quality.triangleCount, expectation.triangleCount, 0)) {
    failures.push(
      `${quality.triangleCount} triangles, which does not satisfy ${describeNumeric(expectation.triangleCount)}`,
    );
  }
  return failures.length === 0
    ? []
    : [
        matcherDiagnostic({
          code: 'GEOSPEC_MESH_INTEGRITY_MISMATCH',
          message: `Mesh evidence is not trustworthy for downstream checks: ${failures.join('; ')}.`,
          suggestion: 'Re-tessellate the model (or repair it) until the mesh evidence is clean.',
          details: {
            matcher: 'toHaveMeshIntegrity',
            failures,
            triangleCount: quality.triangleCount,
            nonFiniteVertices: quality.nonFiniteVertices.slice(0, 4).map((vertex) => ({
              ...vertex,
              position: vertex.position.map(String),
            })),
            degenerateTriangles: quality.degenerateTriangles.slice(0, 4),
            duplicateFaces: quality.duplicateFaces.slice(0, 4).map((face) => ({
              ...face,
              center: quality.triangles[face.triangleIndex]?.center,
            })),
          },
        }),
      ];
};

/**
 * `expectGeo(...).toHaveNoComponentInterference(...)`.
 *
 * @public
 */
export const toHaveNoComponentInterference: GeoSpecMatcherImplementation = async (invocation) => {
  const resolved = matcherSubject(invocation);
  if ('diagnostics' in resolved) {
    return resolved.diagnostics;
  }
  const expectation = (invocation.expected ?? {}) as GeoSpecComponentInterferenceExpectation;
  const analysis = await analyzeMeshOverlap({
    subject: resolved.subject,
    ...(expectation.tolerance === undefined ? {} : { tolerance: expectation.tolerance }),
    ...(expectation.pairs === undefined ? {} : { pairs: expectation.pairs }),
  });
  if (!analysis.success) {
    return analysis.diagnostics;
  }
  const { overlaps } = analysis.evidence;
  const allowances = expectation.allowances ?? [];
  const unexplained = overlaps.filter((overlap) => {
    const allowed = allowances.find(
      (allowance: GeoSpecComponentInterferenceAllowance) =>
        (labelMatches(overlap.leftLabel, allowance.left) && labelMatches(overlap.rightLabel, allowance.right)) ||
        (labelMatches(overlap.leftLabel, allowance.right) && labelMatches(overlap.rightLabel, allowance.left)),
    );
    return !allowed || (allowed.maxVolume !== undefined && overlap.intersectionVolume > allowed.maxVolume);
  });
  return unexplained.length === 0
    ? []
    : [
        matcherDiagnostic({
          code: 'GEOSPEC_COMPONENT_INTERFERENCE_DETECTED',
          // "Unclassified" is the load-bearing word: an overlap an `allowances`
          // entry explains is a design decision, and only the ones nothing
          // explains are reported. The wording is a contract — the Tau
          // `test_model` harness greps it.
          message: `Unclassified component interference detected between ${unexplained.length} component pair(s): ${unexplained
            .map((overlap) => `${overlap.leftLabel}/${overlap.rightLabel} (${overlap.intersectionVolume} mm³)`)
            .join(', ')}.`,
          suggestion:
            'Fix the assembly so the parts no longer share solid volume, or declare the overlap as an `allowances` entry with its reason and maximum volume.',
          ...(unexplained[0]?.witnessPoint ? { spatial: { center: unexplained[0].witnessPoint } } : {}),
          details: {
            matcher: 'toHaveNoComponentInterference',
            overlaps: unexplained,
            checkedPairs: analysis.evidence.checkedPairs,
            tolerance: analysis.evidence.tolerance,
          },
        }),
      ];
};
