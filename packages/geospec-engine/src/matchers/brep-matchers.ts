/**
 * Matcher bodies backed by exact BRep and STEP evidence.
 *
 * Every one of them reads a facet of the lazy evidence ledger. A subject with
 * no BRep evidence never gets a mesh-derived approximation of a chamfer or a
 * hole pattern: the claim is `unsupported` and says so (§5). A facet that
 * exists but is empty is a genuine `no such feature` verdict, not missing
 * evidence — the difference is the whole point of the ledger.
 *
 * @module
 */

import type { GeoSpecMatcherImplementation } from '#matchers/types.js';
import type { BrepEvidence, GeometryDiagnostic, GeometrySubject, Vec3 } from '#mesh/types.js';
import type {
  GeoSpecAssemblyOccurrencesExpectation,
  GeoSpecChamferFeatureExpectation,
  GeoSpecCircularHoleExpectation,
  GeoSpecCircularHolePatternExpectation,
  GeoSpecCylindricalFaceExpectation,
  GeoSpecFilletFeatureExpectation,
  GeoSpecMinimumWallThicknessExpectation,
  GeoSpecPlanarFaceExpectation,
  GeoSpecProductStructureExpectation,
  GeoSpecStepUnitsExpectation,
  GeoSpecTopologyCountsExpectation,
  GeoSpecValidBrepExpectation,
} from '#runner/types.js';
import { baseComponentLabel } from '#mesh/analysis-record.js';
import { setBrepEvidenceForensicSink } from '#step/evidence-ledger.js';
import {
  brepSuggestion,
  defaultLinearTolerance,
  describeNumeric,
  describeSelector,
  evidenceUnsupported,
  labelMatches,
  matcherDiagnostic,
  matcherSubject,
  numericHolds,
  pointComponents,
} from '#matchers/support.js';

const featureMismatch = (options: {
  matcher: string;
  message: string;
  suggestion: string;
  details: Record<string, unknown>;
}): GeometryDiagnostic[] => [
  matcherDiagnostic({
    code: 'GEOSPEC_FEATURE_MISMATCH',
    message: options.message,
    suggestion: options.suggestion,
    details: { matcher: options.matcher, ...options.details },
  }),
];

/**
 * A matcher over one BRep facet: read it, or refuse with the reason.
 *
 * @param options - Matcher name, the facet, and the decision over it.
 * @returns The matcher body.
 */
const brepMatcher =
  <Facet>(options: {
    matcher: string;
    facet: string;
    read: (brep: BrepEvidence) => Facet | undefined;
    decide: (facet: Facet, expected: unknown, subject: GeometrySubject) => GeometryDiagnostic[];
  }): GeoSpecMatcherImplementation =>
  (invocation) => {
    const resolved = matcherSubject(invocation);
    if ('diagnostics' in resolved) {
      return resolved.diagnostics;
    }
    const { brep } = resolved.subject;
    const clearForensics = brep === undefined ? undefined : setBrepEvidenceForensicSink(brep, invocation.forensic);
    let facet: Facet | undefined;
    try {
      facet = brep === undefined ? undefined : options.read(brep);
    } finally {
      clearForensics?.();
    }
    if (facet === undefined) {
      return evidenceUnsupported({
        matcher: options.matcher,
        missing: `exact BRep ${options.facet} evidence`,
        suggestion: brepSuggestion,
      });
    }
    return options.decide(facet, invocation.expected, resolved.subject);
  };

/**
 * `expectGeo(...).toBeValidBrep(...)`.
 *
 * @public
 */
export const toBeValidBrep = brepMatcher({
  matcher: 'toBeValidBrep',
  facet: 'validity',
  read: (brep) => brep.validity,
  decide: (validity, expected) => {
    const expectation = (expected ?? {}) as GeoSpecValidBrepExpectation;
    const failures: string[] = [];
    if (!validity.valid) {
      failures.push(
        `the kernel reports the shape invalid${validity.reason === undefined ? '' : ` (${validity.reason})`}`,
      );
    }
    if (
      expectation.maxTolerance !== undefined &&
      validity.maxTolerance !== undefined &&
      validity.maxTolerance > expectation.maxTolerance
    ) {
      failures.push(`maximum tolerance ${validity.maxTolerance} exceeds the declared ${expectation.maxTolerance}`);
    }
    if (
      expectation.freeBounds?.count !== undefined &&
      !numericHolds(validity.freeBounds?.count ?? 0, expectation.freeBounds.count, 0)
    ) {
      failures.push(
        `${validity.freeBounds?.count ?? 0} free bounds, which does not satisfy ${describeNumeric(expectation.freeBounds.count)}`,
      );
    }
    if (expectation.minEdgeLength !== undefined) {
      const shorter = (validity.smallEdges ?? []).filter((edge) => edge.length < expectation.minEdgeLength!);
      if (shorter.length > 0) {
        failures.push(`${shorter.length} edges shorter than the declared ${expectation.minEdgeLength} mm`);
      }
    }
    for (const [key, label] of [
      ['sameParameter', 'same-parameter'],
      ['closedShells', 'closed shells'],
      ['closedWires', 'closed wires'],
    ] as const) {
      const declared = expectation[key];
      const actual = validity[key];
      if (declared !== undefined && actual !== undefined && actual !== declared) {
        failures.push(`${label} is ${actual}, not the declared ${declared}`);
      }
    }
    return failures.length === 0
      ? []
      : featureMismatch({
          matcher: 'toBeValidBrep',
          message: `Exact BRep validity failed: ${failures.join('; ')}.`,
          suggestion: 'Repair the model in the CAD kernel (heal faces, close shells) and re-export.',
          details: { failures, validity },
        });
  },
});

/**
 * `expectGeo(...).toHaveTopologyCounts(...)`.
 *
 * @public
 */
export const toHaveTopologyCounts = brepMatcher({
  matcher: 'toHaveTopologyCounts',
  facet: 'topology-count',
  read: (brep) => brep.topologyCounts,
  decide: (counts, expected) => {
    const expectation = expected as GeoSpecTopologyCountsExpectation;
    const tolerance = expectation.tolerance ?? 0;
    const failures: string[] = [];
    for (const key of ['vertices', 'edges', 'wires', 'faces', 'shells', 'solids', 'compounds'] as const) {
      const declared = expectation[key];
      if (declared === undefined) {
        continue;
      }
      const actual = counts[key] ?? 0;
      if (!numericHolds(actual, declared, tolerance)) {
        failures.push(`${key}: ${actual} does not satisfy ${describeNumeric(declared)}`);
      }
    }
    return failures.length === 0
      ? []
      : featureMismatch({
          matcher: 'toHaveTopologyCounts',
          message: `Exact topology counts do not match: ${failures.join('; ')}.`,
          suggestion: 'Correct the model, or widen the declared topology-count expectation.',
          details: { failures, counts },
        });
  },
});

/**
 * `expectGeo(...).toHavePlanarFace(...)`.
 *
 * @public
 */
export const toHavePlanarFace = brepMatcher({
  matcher: 'toHavePlanarFace',
  facet: 'planar-face',
  read: (brep) => brep.planarFaces,
  decide: (faces, expected) => {
    const expectation = expected as GeoSpecPlanarFaceExpectation;
    const tolerance = expectation.tolerance ?? defaultLinearTolerance;
    const declared = pointComponents(expectation.normal);
    const matched = faces.some((face) => {
      // A plane and its opposite describe the same surface, so compare the
      // normal folded onto the declared orientation.
      const flip = declared.every(
        (component, axis) => component === undefined || Math.abs(-face.normal[axis]! - component) <= tolerance,
      );
      const sign = flip ? -1 : 1;
      const normalMatches = declared.every(
        (component, axis) => component === undefined || Math.abs(sign * face.normal[axis]! - component) <= tolerance,
      );
      const offsetMatches = Math.abs(sign * face.offset - expectation.offset) <= tolerance;
      const areaMatches =
        expectation.area === undefined ||
        (face.area !== undefined && numericHolds(face.area, expectation.area, tolerance));
      return normalMatches && offsetMatches && areaMatches;
    });
    return matched
      ? []
      : featureMismatch({
          matcher: 'toHavePlanarFace',
          message: `No planar face matches normal [${declared.join(', ')}] at offset ${expectation.offset} within ${tolerance} mm.`,
          suggestion: 'Check the declared normal/offset against the exported frame, or widen the tolerance.',
          details: { expected: expectation, planarFaces: faces },
        });
  },
});

/**
 * `expectGeo(...).toHaveCylindricalFace(...)`.
 *
 * @public
 */
export const toHaveCylindricalFace = brepMatcher({
  matcher: 'toHaveCylindricalFace',
  facet: 'cylindrical-face',
  read: (brep) => brep.cylindricalFaces,
  decide: (faces, expected) => {
    const expectation = expected as GeoSpecCylindricalFaceExpectation;
    const tolerance = expectation.tolerance ?? defaultLinearTolerance;
    const matched = faces.some(
      (face) => face.axis === expectation.axis && Math.abs(face.radius - expectation.radius) <= tolerance,
    );
    return matched
      ? []
      : featureMismatch({
          matcher: 'toHaveCylindricalFace',
          message: `No cylindrical face has radius ${expectation.radius} on the ${expectation.axis} axis within ${tolerance} mm.`,
          suggestion: 'Check the declared radius/axis against the export, or widen the tolerance.',
          details: { expected: expectation, cylindricalFaces: faces },
        });
  },
});

/**
 * `expectGeo(...).toHaveCircularHole(...)`.
 *
 * @public
 */
export const toHaveCircularHole = brepMatcher({
  matcher: 'toHaveCircularHole',
  facet: 'circular-hole',
  read: (brep) => brep.circularHoles,
  decide: (holes, expected) => {
    const expectation = expected as GeoSpecCircularHoleExpectation;
    const tolerance = expectation.tolerance ?? defaultLinearTolerance;
    const centre = expectation.center === undefined ? undefined : pointComponents(expectation.center);
    const matched = holes.some(
      (hole) =>
        Math.abs(hole.diameter - expectation.diameter) <= tolerance &&
        (expectation.through === undefined || hole.through === expectation.through) &&
        (expectation.axis === undefined || hole.axis === expectation.axis) &&
        (centre === undefined ||
          centre.every(
            (component, axis) =>
              component === undefined || Math.abs((hole.center?.[axis] ?? Number.NaN) - component) <= tolerance,
          )),
    );
    return matched
      ? []
      : featureMismatch({
          matcher: 'toHaveCircularHole',
          message: `No circular hole matches diameter ${expectation.diameter} within ${tolerance} mm.`,
          suggestion: 'Check the declared diameter/axis/through-ness against the export, or widen the tolerance.',
          details: { expected: expectation, circularHoles: holes },
        });
  },
});

/**
 * `expectGeo(...).toHaveCircularHolePattern(...)`.
 *
 * @public
 */
export const toHaveCircularHolePattern = brepMatcher({
  matcher: 'toHaveCircularHolePattern',
  facet: 'circular-hole-pattern',
  read: (brep) => brep.circularHolePatterns,
  decide: (patterns, expected) => {
    const expectation = expected as GeoSpecCircularHolePatternExpectation;
    const tolerance = expectation.tolerance ?? defaultLinearTolerance;
    const centre = expectation.center === undefined ? undefined : pointComponents(expectation.center);
    const matched = patterns.some(
      (pattern) =>
        pattern.count === expectation.count &&
        Math.abs(pattern.holeDiameter - expectation.holeDiameter) <= tolerance &&
        (expectation.boltCircleDiameter === undefined ||
          Math.abs(pattern.boltCircleDiameter - expectation.boltCircleDiameter) <= tolerance) &&
        (expectation.axis === undefined || pattern.axis === expectation.axis) &&
        (centre === undefined ||
          centre.every(
            (component, axis) =>
              component === undefined || Math.abs((pattern.center?.[axis] ?? Number.NaN) - component) <= tolerance,
          )),
    );
    return matched
      ? []
      : featureMismatch({
          matcher: 'toHaveCircularHolePattern',
          message: `No circular-hole pattern has ${expectation.count} holes of diameter ${expectation.holeDiameter} within ${tolerance} mm.`,
          suggestion:
            'Check the declared count/diameter/bolt circle against the export, or widen the tolerance — a pattern splits when consecutive holes sit further apart than the pad separation gap.',
          details: { expected: expectation, circularHolePatterns: patterns },
        });
  },
});

/**
 * `expectGeo(...).toHaveChamferFeature(...)`.
 *
 * @public
 */
export const toHaveChamferFeature = brepMatcher({
  matcher: 'toHaveChamferFeature',
  facet: 'chamfer-feature',
  read: (brep) => brep.chamferFeatures,
  decide: (features, expected) => {
    const expectation = expected as GeoSpecChamferFeatureExpectation;
    const tolerance = expectation.tolerance ?? defaultLinearTolerance;
    const matched = features.some(
      (feature) =>
        Math.abs(feature.distance - expectation.distance) <= tolerance &&
        (expectation.selection === undefined || feature.selection === expectation.selection),
    );
    return matched
      ? []
      : featureMismatch({
          matcher: 'toHaveChamferFeature',
          message: `No chamfer feature has distance ${expectation.distance} within ${tolerance} mm.`,
          suggestion: 'Check the declared chamfer distance against the export, or widen the tolerance.',
          details: { expected: expectation, chamferFeatures: features },
        });
  },
});

/**
 * `expectGeo(...).toHaveFilletFeature(...)`.
 *
 * @public
 */
export const toHaveFilletFeature = brepMatcher({
  matcher: 'toHaveFilletFeature',
  facet: 'fillet-feature',
  read: (brep) => brep.filletFeatures,
  decide: (features, expected) => {
    const expectation = expected as GeoSpecFilletFeatureExpectation;
    const tolerance = expectation.tolerance ?? defaultLinearTolerance;
    const matched = features.some(
      (feature) =>
        Math.abs(feature.radius - expectation.radius) <= tolerance &&
        (expectation.selection === undefined || feature.selection === expectation.selection),
    );
    return matched
      ? []
      : featureMismatch({
          matcher: 'toHaveFilletFeature',
          message: `No fillet feature has radius ${expectation.radius} within ${tolerance} mm.`,
          suggestion: 'Check the declared fillet radius against the export, or widen the tolerance.',
          details: { expected: expectation, filletFeatures: features },
        });
  },
});

/**
 * `expectGeo(...).toHaveMinimumWallThickness(...)`.
 *
 * @public
 */
export const toHaveMinimumWallThickness = brepMatcher({
  matcher: 'toHaveMinimumWallThickness',
  facet: 'wall-thickness',
  read: (brep) => brep.minimumWallThickness,
  decide: (thickness, expected) => {
    const expectation = expected as GeoSpecMinimumWallThicknessExpectation;
    const tolerance = expectation.tolerance ?? defaultLinearTolerance;
    return numericHolds(thickness.value, expectation.value, tolerance)
      ? []
      : featureMismatch({
          matcher: 'toHaveMinimumWallThickness',
          message: `The minimum wall thickness is ${thickness.value} mm, which does not satisfy ${describeNumeric(expectation.value)}.`,
          suggestion: 'Thicken the thinnest wall, or lower the declared minimum.',
          details: { measured: thickness, expected: expectation },
        });
  },
});

/**
 * `expectGeo(...).toHaveStepUnits(...)`.
 *
 * @public
 */
export const toHaveStepUnits: GeoSpecMatcherImplementation = (invocation) => {
  const resolved = matcherSubject(invocation);
  if ('diagnostics' in resolved) {
    return resolved.diagnostics;
  }
  const unit = resolved.subject.step?.unit;
  if (unit === undefined) {
    return evidenceUnsupported({
      matcher: 'toHaveStepUnits',
      missing: 'STEP unit evidence',
      suggestion: brepSuggestion,
    });
  }
  const expectation = invocation.expected as GeoSpecStepUnitsExpectation;
  return unit === expectation.unit
    ? []
    : featureMismatch({
        matcher: 'toHaveStepUnits',
        message: `The STEP file declares '${unit}', not the expected '${expectation.unit}'.`,
        suggestion: 'Re-export with the declared unit, or correct the expectation.',
        details: { measured: unit, expected: expectation.unit },
      });
};

/**
 * `expectGeo(...).toHaveProductStructure(...)`.
 *
 * @public
 */
export const toHaveProductStructure: GeoSpecMatcherImplementation = (invocation) => {
  const resolved = matcherSubject(invocation);
  if ('diagnostics' in resolved) {
    return resolved.diagnostics;
  }
  const occurrences = resolved.subject.step?.xde?.occurrences;
  const meshPrimitives = resolved.subject.mesh.stats.boundingBox?.primitives ?? [];
  const structure = occurrences
    ? occurrences.map(({ path }) => ({ name: path }))
    : resolved.subject.step === undefined && meshPrimitives.length > 0
      ? meshPrimitives.map(({ name }) => ({
          name: baseComponentLabel(name),
        }))
      : undefined;
  if (!structure) {
    return evidenceUnsupported({
      matcher: 'toHaveProductStructure',
      missing: 'XDE product-structure evidence or named mesh primitives',
      suggestion: brepSuggestion,
    });
  }
  const expectation = invocation.expected as GeoSpecProductStructureExpectation;
  const names = new Set(structure.map((entry) => entry.name));
  const missing = (expectation.names ?? []).filter((name) => !names.has(name));
  const countHolds = expectation.count === undefined || numericHolds(structure.length, expectation.count, 0);
  if (missing.length === 0 && countHolds) {
    return [];
  }
  return featureMismatch({
    matcher: 'toHaveProductStructure',
    message: [
      missing.length > 0 ? `${missing.length} declared product(s) are absent: ${missing.slice(0, 8).join(', ')}` : '',
      countHolds
        ? ''
        : `the file carries ${structure.length} products, which does not satisfy ${describeNumeric(expectation.count!)}`,
    ]
      .filter((part) => part.length > 0)
      .join('; '),
    suggestion: 'Re-export the assembly with every declared product present, or correct the census.',
    details: { missing, productCount: structure.length, expected: expectation },
  });
};

/**
 * The occurrence inventory a subject carries: STEP assembly occurrences when
 * it has them, otherwise the named mesh primitives (with the `#n` sub-piece
 * suffix stripped, so a multi-primitive node reads as one authored part).
 *
 * @param subject - The subject.
 * @returns One entry per occurrence.
 * @public
 */
export const occurrenceInventory = (
  subject: GeometrySubject,
): Array<{ name: string; bounds?: { min: Vec3; max: Vec3 } }> => {
  const occurrences = subject.step?.xde?.occurrences;
  if (occurrences) {
    return occurrences.map((occurrence) => ({
      name: occurrence.path,
      ...(occurrence.bounds === undefined ? {} : { bounds: occurrence.bounds }),
    }));
  }
  return (subject.mesh.stats.boundingBox?.primitives ?? []).map((primitive) => ({
    name: baseComponentLabel(primitive.name),
    bounds: { min: primitive.aabb.min as Vec3, max: primitive.aabb.max as Vec3 },
  }));
};

/**
 * `expectGeo(...).toHaveAssemblyOccurrences(...)`.
 *
 * @public
 */
export const toHaveAssemblyOccurrences: GeoSpecMatcherImplementation = (invocation) => {
  const resolved = matcherSubject(invocation);
  if ('diagnostics' in resolved) {
    return resolved.diagnostics;
  }
  const inventory = occurrenceInventory(resolved.subject);
  if (inventory.length === 0) {
    return evidenceUnsupported({
      matcher: 'toHaveAssemblyOccurrences',
      missing: 'assembly occurrence evidence (STEP occurrences or named mesh nodes)',
      suggestion: brepSuggestion,
    });
  }
  const expectation = invocation.expected as GeoSpecAssemblyOccurrencesExpectation;
  const failures: string[] = [];
  for (const rule of expectation.occurrences) {
    const matches = inventory.filter((entry) => labelMatches(entry.name, rule.name));
    if (rule.count !== undefined && !numericHolds(matches.length, rule.count, 0)) {
      failures.push(
        `'${describeSelector(rule.name)}' matched ${matches.length} occurrence(s), which does not satisfy ${describeNumeric(rule.count)}`,
      );
      continue;
    }
    if (matches.length === 0) {
      failures.push(`'${describeSelector(rule.name)}' matched no occurrence`);
      continue;
    }
    const { bounds } = rule;
    const [firstMatch] = matches;
    const { bounds: first } = firstMatch!;
    if (bounds && !first) {
      return evidenceUnsupported({
        matcher: 'toHaveAssemblyOccurrences',
        missing: `analytic world bounds for occurrence '${firstMatch!.name}'`,
        suggestion: 'Load STEP evidence produced by an XDE reader that reports placed occurrence bounds.',
      });
    }
    if (bounds && first) {
      const tolerance = bounds.tolerance ?? defaultLinearTolerance;
      for (const [field, declared] of [
        ['min', bounds.min],
        ['max', bounds.max],
        ['center', bounds.center],
      ] as const) {
        if (!declared) {
          continue;
        }
        const measured =
          field === 'center'
            ? ([0, 1, 2].map((axis) => (first.min[axis]! + first.max[axis]!) / 2) as unknown as Vec3)
            : first[field];
        for (const [axis, component] of pointComponents(declared).entries()) {
          if (component !== undefined && Math.abs(measured[axis]! - component) > tolerance) {
            failures.push(
              `'${describeSelector(rule.name)}' ${field}.${'xyz'[axis]} is ${measured[axis]}, not ${component} (±${tolerance})`,
            );
          }
        }
      }
    }
  }
  if (expectation.uniqueNames === true) {
    const seen = new Set<string>();
    for (const entry of inventory) {
      if (seen.has(entry.name)) {
        failures.push(`occurrence name '${entry.name}' is not unique`);
      }
      seen.add(entry.name);
    }
  }
  return failures.length === 0
    ? []
    : featureMismatch({
        matcher: 'toHaveAssemblyOccurrences',
        message: `Assembly occurrence rules failed: ${failures.slice(0, 8).join('; ')}${failures.length > 8 ? ` (+${failures.length - 8} more)` : ''}.`,
        suggestion: 'Re-export the assembly with the declared occurrences, or correct the census.',
        details: { failures, occurrenceCount: inventory.length },
      });
};
