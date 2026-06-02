import type { GeometryDiagnostic, GeometrySubject, Vec3 } from '#mesh/types.js';
import { analyzeChamferDistance } from '#mesh/distance.js';
import type {
  GeoSpecAssertion,
  GeoSpecAxisExpectation,
  GeoSpecBoundingBoxExpectation,
  GeoSpecCenterOfMassExpectation,
  GeoSpecChamferDistanceExpectation,
  GeoSpecChamferFeatureExpectation,
  GeoSpecCircularHoleExpectation,
  GeoSpecCircularHolePatternExpectation,
  GeoSpecCylindricalFaceExpectation,
  GeoSpecConnectedComponentsExpectation,
  GeoSpecFilletFeatureExpectation,
  GeoSpecMatcher,
  GeoSpecMassExpectation,
  GeoSpecMinimumDistanceExpectation,
  GeoSpecMinimumWallThicknessExpectation,
  GeoSpecNumericExpectation,
  GeoSpecPlanarFaceExpectation,
  GeoSpecPointExpectation,
  GeoSpecProductStructureExpectation,
  GeoSpecStepUnitsExpectation,
  GeoSpecSurfaceAreaExpectation,
  GeoSpecTestCase,
  GeoSpecTopologyCountsExpectation,
  GeoSpecVolumeExpectation,
} from '#runner/types.js';

type GeoSpecTestFunction = () => unknown | PromiseLike<unknown>;

/**
 * Collects suites, tests, assertions, and async completion state for one
 * GeoSpec module execution.
 *
 * @public
 */
export type GeoSpecCollector = {
  tests: GeoSpecTestCase[];
  describe(name: string, function_: GeoSpecTestFunction): void;
  describeSkip(name: string, _function?: GeoSpecTestFunction): void;
  it(name: string, function_: GeoSpecTestFunction): void;
  itSkip(name: string, _function?: GeoSpecTestFunction): void;
  expectGeo(subject: unknown): GeoSpecMatcher;
  waitForCompletion(testTimeout: number): Promise<void>;
};

export const collectorGlobalKey = '__GEOSPEC_COLLECTOR__';
const activeTestGlobalKey = '__GEOSPEC_ACTIVE_TEST__';
const geospecGlobal = globalThis as typeof globalThis & Record<string, unknown>;

const isPromiseLike = (value: unknown): value is PromiseLike<unknown> =>
  typeof value === 'object' &&
  value !== null &&
  'then' in value &&
  typeof (value as { then?: unknown }).then === 'function';

const createErrorDiagnostic = (error: unknown): GeometryDiagnostic => {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('model.volume is not a function')) {
    return {
      code: 'GEOSPEC_SUBJECT_API_MISUSE',
      severity: 'error',
      message: 'GeoSpec GeometrySubject does not expose model.volume().',
      suggestion: 'Use expectGeo(model).toHaveVolume({ value, tolerance }) instead of reading model.volume().',
      details: error,
    };
  }
  if (/Cannot read properties of undefined \(reading 'bounds'\)/u.test(message)) {
    return {
      code: 'GEOSPEC_SUBJECT_API_MISUSE',
      severity: 'error',
      message: 'GeoSpec GeometrySubject does not expose model.boundingBox.bounds.',
      suggestion:
        'Use expectGeo(model).toHaveBoundingBox({ min, max, size, center, tolerance }) instead of reading model.boundingBox.',
      details: error,
    };
  }
  return {
    code: 'TEST_FAILED',
    severity: 'error',
    message,
    details: error,
  };
};

const defaultLengthTolerance = 0.1;
const defaultConnectedToleranceMm = 0.1;
const defaultScalarTolerance = 0.1;
const defaultUnitVectorTolerance = 1e-4;
const defaultChamferSamples = 10_000;

const axisNames = ['x', 'y', 'z'] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isGeometrySubject = (value: unknown): value is GeometrySubject =>
  isRecord(value) && value['kind'] === 'geometry-subject' && isRecord(value['mesh']) && isRecord(value['provenance']);

const unsupportedSubjectDiagnostic = (matcher: string): GeometryDiagnostic => ({
  code: 'UNSUPPORTED_GEOMETRY_SUBJECT',
  severity: 'error',
  message: `${matcher} requires a GeoSpec GeometrySubject loaded from geometry evidence.`,
  suggestion: 'Use loadMesh(...) or loadModel(...) and pass the returned GeometrySubject to expectGeo(...).',
});

const unsupportedEvidenceDiagnostic = (matcher: string, evidence: string): GeometryDiagnostic => ({
  code: 'UNSUPPORTED_GEOMETRY_EVIDENCE',
  severity: 'error',
  message: `${matcher} requires ${evidence} evidence, but this geometry subject does not include it.`,
  suggestion:
    'Load a STEP/BRep-capable subject with loadModel({ format: "step" }) or use a mesh measurement matcher that supports approximate mesh evidence.',
});

const isVec3 = (value: unknown): value is Vec3 =>
  Array.isArray(value) && value.length === 3 && value.every((entry) => typeof entry === 'number');

const axisValue = (expected: Vec3 | GeoSpecAxisExpectation | undefined, index: 0 | 1 | 2): number | undefined => {
  if (expected === undefined) {
    return undefined;
  }
  if (isVec3(expected)) {
    return expected[index];
  }
  return expected[axisNames[index]];
};

const pointAxisValue = (expected: GeoSpecPointExpectation, index: 0 | 1 | 2): number | undefined =>
  axisValue(expected, index);

const numericExpectation = (expected: GeoSpecNumericExpectation): Exclude<GeoSpecNumericExpectation, number> =>
  typeof expected === 'number' ? { value: expected } : expected;

const evaluateNumeric = (options: {
  actual: number;
  expected: GeoSpecNumericExpectation;
  tolerance: number;
  label: string;
}): string[] => {
  const expected = numericExpectation(options.expected);
  const failures: string[] = [];

  if (expected.value !== undefined && Math.abs(options.actual - expected.value) > options.tolerance) {
    failures.push(`${options.label}: expected ${expected.value} (+/-${options.tolerance}), got ${options.actual}`);
  }
  if (expected.greaterThan !== undefined && !(options.actual > expected.greaterThan - options.tolerance)) {
    failures.push(`${options.label}: expected greater than ${expected.greaterThan}, got ${options.actual}`);
  }
  if (expected.greaterThanOrEqual !== undefined && options.actual + options.tolerance < expected.greaterThanOrEqual) {
    failures.push(
      `${options.label}: expected greater than or equal to ${expected.greaterThanOrEqual}, got ${options.actual}`,
    );
  }
  if (expected.lessThan !== undefined && !(options.actual < expected.lessThan + options.tolerance)) {
    failures.push(`${options.label}: expected less than ${expected.lessThan}, got ${options.actual}`);
  }
  if (expected.lessThanOrEqual !== undefined && options.actual - options.tolerance > expected.lessThanOrEqual) {
    failures.push(
      `${options.label}: expected less than or equal to ${expected.lessThanOrEqual}, got ${options.actual}`,
    );
  }

  return failures;
};

const evaluatePoint = (options: {
  actual: Vec3;
  expected: GeoSpecPointExpectation;
  tolerance: number;
  label: string;
}): string[] => {
  const failures: string[] = [];
  const axisIndices = [0, 1, 2] as const;
  for (const index of axisIndices) {
    const expected = pointAxisValue(options.expected, index);
    if (expected === undefined) {
      continue;
    }
    const actual = options.actual[index];
    if (Math.abs(actual - expected) > options.tolerance) {
      failures.push(
        `${options.label}.${formatAxis({
          axis: axisNames[index],
          expected,
          actual,
          tolerance: options.tolerance,
        })}`,
      );
    }
  }
  return failures;
};

const asBoundingBoxExpectation = (
  first: Vec3 | GeoSpecBoundingBoxExpectation,
  second?: Vec3,
): GeoSpecBoundingBoxExpectation =>
  second === undefined ? (first as GeoSpecBoundingBoxExpectation) : { min: first as Vec3, max: second };

const sceneBounds = (subject: GeometrySubject): { min: Vec3; max: Vec3 } | undefined => {
  const box = subject.mesh.stats.boundingBox;
  if (!box) {
    return undefined;
  }

  const min: Vec3 = [box.center[0] - box.size[0] / 2, box.center[1] - box.size[1] / 2, box.center[2] - box.size[2] / 2];
  const max: Vec3 = [box.center[0] + box.size[0] / 2, box.center[1] + box.size[1] / 2, box.center[2] + box.size[2] / 2];
  return { min, max };
};

const selectedBounds = (
  subject: GeometrySubject,
  expected: GeoSpecBoundingBoxExpectation,
):
  | {
      min: Vec3;
      max: Vec3;
      size: Vec3;
      center: Vec3;
      evidence: 'mesh' | 'brep';
    }
  | undefined => {
  if (expected.evidence === 'brep') {
    return subject.brep?.boundingBox ? { ...subject.brep.boundingBox, evidence: 'brep' } : undefined;
  }
  if (expected.evidence !== 'mesh' && subject.brep?.boundingBox) {
    return { ...subject.brep.boundingBox, evidence: 'brep' };
  }
  const box = subject.mesh.stats.boundingBox;
  const bounds = sceneBounds(subject);
  return box && bounds
    ? { min: bounds.min, max: bounds.max, size: box.size, center: box.center, evidence: 'mesh' }
    : undefined;
};

const formatAxis = (options: { axis: 'x' | 'y' | 'z'; expected: number; actual: number; tolerance: number }): string =>
  `${options.axis}: expected ${options.expected} (+/-${options.tolerance}), got ${options.actual}`;

const evaluateBoundingBox = (subject: unknown, expected: GeoSpecBoundingBoxExpectation): GeometryDiagnostic[] => {
  if (!isGeometrySubject(subject)) {
    return [unsupportedSubjectDiagnostic('toHaveBoundingBox')];
  }

  const bounds = selectedBounds(subject, expected);
  if (!bounds) {
    if (expected.evidence === 'brep') {
      return [unsupportedEvidenceDiagnostic('toHaveBoundingBox', 'BRep bounding-box')];
    }
    return [
      {
        code: 'BOUNDING_BOX_UNAVAILABLE',
        severity: 'error',
        message: 'No bounding box is available for this geometry subject.',
        suggestion: 'Ensure the rendered model produces visible mesh geometry.',
      },
    ];
  }

  const tolerance = expected.tolerance ?? defaultLengthTolerance;
  const failures: string[] = [];
  const axisIndices = [0, 1, 2] as const;

  for (const index of axisIndices) {
    const axis = axisNames[index];
    const expectations = [
      { field: 'min', expected: axisValue(expected.min, index), actual: bounds.min[index] },
      { field: 'max', expected: axisValue(expected.max, index), actual: bounds.max[index] },
      { field: 'size', expected: expected.size?.[axis], actual: bounds.size[index] },
      { field: 'center', expected: expected.center?.[axis], actual: bounds.center[index] },
    ] as const;

    for (const entry of expectations) {
      if (entry.expected === undefined) {
        continue;
      }
      if (Math.abs(entry.actual - entry.expected) > tolerance) {
        failures.push(
          `${entry.field}.${formatAxis({
            axis,
            expected: entry.expected,
            actual: entry.actual,
            tolerance,
          })}`,
        );
      }
    }
  }

  if (failures.length === 0) {
    return [];
  }

  return [
    {
      code: 'BOUNDING_BOX_MISMATCH',
      severity: 'error',
      message: `Bounding box mismatch:\n${failures.map((failure) => `- ${failure}`).join('\n')}`,
      suggestion: 'Adjust model dimensions or the tested parameter case so the rendered bounds match the expected box.',
      spatial: {
        min: bounds.min,
        max: bounds.max,
        center: bounds.center,
      },
      details: {
        expected,
        actual: {
          min: bounds.min,
          max: bounds.max,
          size: bounds.size,
          center: bounds.center,
          evidence: bounds.evidence,
        },
      },
    },
  ];
};

const evaluateConnectedComponents = (
  subject: unknown,
  expected: GeoSpecConnectedComponentsExpectation,
): GeometryDiagnostic[] => {
  if (!isGeometrySubject(subject)) {
    return [unsupportedSubjectDiagnostic('toHaveConnectedComponents')];
  }

  const toleranceMm = expected.toleranceMm ?? expected.tolerance ?? defaultConnectedToleranceMm;
  const analysis = subject.mesh.stats.analyseConnectedComponents(toleranceMm);
  if (analysis.count === expected.count) {
    return [];
  }

  return [
    {
      code: 'CONNECTED_COMPONENTS_MISMATCH',
      severity: 'error',
      message: `Connected components: expected ${expected.count}, got ${analysis.count} (tolerance: ${toleranceMm}mm).`,
      suggestion:
        analysis.count > expected.count
          ? 'Fuse or move separated pieces together, or raise the expected component count if the separation is intentional.'
          : 'Split the model into the expected number of spatially separate pieces, or lower the expected component count.',
      details: { expected, actual: analysis },
    },
  ];
};

const evaluateWatertight = (subject: unknown): GeometryDiagnostic[] => {
  if (!isGeometrySubject(subject)) {
    return [unsupportedSubjectDiagnostic('toBeWatertight')];
  }

  const watertight = subject.mesh.stats.analyseWatertight();
  if (watertight.watertight) {
    return [];
  }

  return [
    {
      code: 'MESH_NOT_WATERTIGHT',
      severity: 'error',
      message: `Mesh is not watertight: ${watertight.irregularEdges} irregular edges, ${watertight.openBoundaryEdges} open boundary edges.`,
      suggestion:
        'Check for failed booleans, missing caps, open surfaces, or assemblies that should be tested per part.',
      details: watertight,
    },
  ];
};

const meshMeasurementDetails = (kind: string, actual: unknown, expected: unknown): Record<string, unknown> => ({
  evidence: 'mesh',
  measurement: kind,
  actual,
  expected,
});

const measurementEvidence = (expected: { evidence?: 'auto' | 'mesh' | 'brep' } | undefined): 'auto' | 'mesh' | 'brep' =>
  expected?.evidence ?? 'auto';

const requireBrepMeasurement = (matcher: string, available: unknown): GeometryDiagnostic[] | undefined => {
  if (available !== undefined) {
    return undefined;
  }
  return [unsupportedEvidenceDiagnostic(matcher, 'BRep measurement')];
};

const evaluateSurfaceArea = (subject: unknown, expected: GeoSpecSurfaceAreaExpectation): GeometryDiagnostic[] => {
  if (!isGeometrySubject(subject)) {
    return [unsupportedSubjectDiagnostic('toHaveSurfaceArea')];
  }

  const brepValue = subject.brep?.massProperties?.surfaceArea;
  const required = measurementEvidence(expected);
  const missingBrep = required === 'brep' ? requireBrepMeasurement('toHaveSurfaceArea', brepValue) : undefined;
  if (missingBrep) {
    return missingBrep;
  }
  const actual =
    required === 'mesh'
      ? subject.mesh.stats.meshQuality.surfaceArea
      : (brepValue ?? subject.mesh.stats.meshQuality.surfaceArea);
  const failures = evaluateNumeric({
    actual,
    expected: typeof expected.value === 'number' ? { value: expected.value } : expected.value,
    tolerance: expected.tolerance ?? defaultScalarTolerance,
    label: 'surfaceArea',
  });
  if (failures.length === 0) {
    return [];
  }

  return [
    {
      code: 'SURFACE_AREA_MISMATCH',
      severity: 'error',
      message: `Surface area mismatch:\n${failures.map((failure) => `- ${failure}`).join('\n')}`,
      suggestion:
        'Check model dimensions, missing faces, unintended holes, or parameter values that affect surface scale.',
      details: {
        ...meshMeasurementDetails('surfaceArea', actual, expected),
        evidence: brepValue !== undefined && required !== 'mesh' ? 'brep' : 'mesh',
      },
    },
  ];
};

const meshVolume = (subject: GeometrySubject): number => Math.abs(subject.mesh.stats.meshQuality.signedVolume);

const evaluateVolume = (subject: unknown, expected: GeoSpecVolumeExpectation): GeometryDiagnostic[] => {
  if (!isGeometrySubject(subject)) {
    return [unsupportedSubjectDiagnostic('toHaveVolume')];
  }

  const brepValue = subject.brep?.massProperties?.volume;
  const required = measurementEvidence(expected);
  const missingBrep = required === 'brep' ? requireBrepMeasurement('toHaveVolume', brepValue) : undefined;
  if (missingBrep) {
    return missingBrep;
  }
  const actual = required === 'mesh' ? meshVolume(subject) : (brepValue ?? meshVolume(subject));
  const failures = evaluateNumeric({
    actual,
    expected: typeof expected.value === 'number' ? { value: expected.value } : expected.value,
    tolerance: expected.tolerance ?? defaultScalarTolerance,
    label: 'volume',
  });
  if (failures.length === 0) {
    return [];
  }

  return [
    {
      code: 'VOLUME_MISMATCH',
      severity: 'error',
      message: `Volume mismatch:\n${failures.map((failure) => `- ${failure}`).join('\n')}`,
      suggestion:
        'Check extrusion depth, boolean operations, shell thickness, and whether the mesh is closed and consistently oriented.',
      details: {
        ...meshMeasurementDetails('volume', actual, expected),
        evidence: brepValue !== undefined && required !== 'mesh' ? 'brep' : 'mesh',
      },
    },
  ];
};

const evaluateMass = (subject: unknown, expected: GeoSpecMassExpectation): GeometryDiagnostic[] => {
  if (!isGeometrySubject(subject)) {
    return [unsupportedSubjectDiagnostic('toHaveMass')];
  }

  const brepMass = subject.brep?.massProperties?.mass;
  const required = measurementEvidence(expected);
  const brepVolume = subject.brep?.massProperties?.volume;
  const exactValue = brepMass ?? (brepVolume === undefined ? undefined : brepVolume * (expected.density ?? 1));
  const missingBrep = required === 'brep' ? requireBrepMeasurement('toHaveMass', exactValue) : undefined;
  if (missingBrep) {
    return missingBrep;
  }
  const actual =
    required === 'mesh'
      ? meshVolume(subject) * (expected.density ?? 1)
      : (exactValue ?? meshVolume(subject) * (expected.density ?? 1));
  const failures = evaluateNumeric({
    actual,
    expected: typeof expected.value === 'number' ? { value: expected.value } : expected.value,
    tolerance: expected.tolerance ?? defaultScalarTolerance,
    label: 'mass',
  });
  if (failures.length === 0) {
    return [];
  }

  return [
    {
      code: 'MASS_MISMATCH',
      severity: 'error',
      message: `Mass mismatch:\n${failures.map((failure) => `- ${failure}`).join('\n')}`,
      suggestion: 'Check the model volume and the density used by this assertion.',
      details: {
        ...meshMeasurementDetails('mass', actual, expected),
        evidence: exactValue !== undefined && required !== 'mesh' ? 'brep' : 'mesh',
      },
    },
  ];
};

const evaluateCenterOfMass = (subject: unknown, expected: GeoSpecCenterOfMassExpectation): GeometryDiagnostic[] => {
  if (!isGeometrySubject(subject)) {
    return [unsupportedSubjectDiagnostic('toHaveCenterOfMass')];
  }

  const required = measurementEvidence(expected);
  const brepValue = subject.brep?.massProperties?.centerOfMass;
  const missingBrep = required === 'brep' ? requireBrepMeasurement('toHaveCenterOfMass', brepValue) : undefined;
  if (missingBrep) {
    return missingBrep;
  }
  const actual =
    required === 'mesh'
      ? subject.mesh.stats.meshQuality.centerOfMass
      : (brepValue ?? subject.mesh.stats.meshQuality.centerOfMass);
  if (!actual) {
    return [
      {
        code: 'CENTER_OF_MASS_UNAVAILABLE',
        severity: 'error',
        message: 'Center of mass is unavailable for this geometry subject.',
        suggestion: 'Use closed, consistently-oriented mesh geometry or load exact BRep mass-property evidence.',
      },
    ];
  }

  const tolerance = expected.tolerance ?? defaultLengthTolerance;
  const failures = evaluatePoint({ actual, expected: expected.point, tolerance, label: 'centerOfMass' });
  if (failures.length === 0) {
    return [];
  }

  return [
    {
      code: 'CENTER_OF_MASS_MISMATCH',
      severity: 'error',
      message: `Center of mass mismatch:\n${failures.map((failure) => `- ${failure}`).join('\n')}`,
      suggestion: 'Check asymmetric features, mirrored components, and parameter cases that shift the model balance.',
      spatial: { center: actual },
      details: meshMeasurementDetails('centerOfMass', actual, expected),
    },
  ];
};

const evaluateChamferDistance = (
  subject: unknown,
  reference: unknown,
  expected: GeoSpecChamferDistanceExpectation,
): GeometryDiagnostic[] => {
  if (!isGeometrySubject(subject)) {
    return [unsupportedSubjectDiagnostic('toHaveChamferDistanceTo')];
  }
  if (!isGeometrySubject(reference)) {
    return [unsupportedSubjectDiagnostic('toHaveChamferDistanceTo reference')];
  }

  const result = analyzeChamferDistance({
    actual: subject.mesh.stats.meshQuality.triangles,
    expected: reference.mesh.stats.meshQuality.triangles,
    samples: expected.samples ?? defaultChamferSamples,
  });
  if (!result.success) {
    return result.diagnostics;
  }
  const actual = result.stats;
  const tolerance = defaultScalarTolerance;
  const failures = [
    ...(expected.min === undefined
      ? []
      : evaluateNumeric({ actual: actual.min, expected: expected.min, tolerance, label: 'min' })),
    ...(expected.mean === undefined
      ? []
      : evaluateNumeric({ actual: actual.mean, expected: expected.mean, tolerance, label: 'mean' })),
    ...(expected.max === undefined
      ? []
      : evaluateNumeric({ actual: actual.max, expected: expected.max, tolerance, label: 'max' })),
    ...(expected.p50 === undefined
      ? []
      : evaluateNumeric({ actual: actual.p50, expected: expected.p50, tolerance, label: 'p50' })),
    ...(expected.p95 === undefined
      ? []
      : evaluateNumeric({ actual: actual.p95, expected: expected.p95, tolerance, label: 'p95' })),
    ...(expected.p99 === undefined
      ? []
      : evaluateNumeric({ actual: actual.p99, expected: expected.p99, tolerance, label: 'p99' })),
    ...(expected.rms === undefined
      ? []
      : evaluateNumeric({ actual: actual.rms, expected: expected.rms, tolerance, label: 'rms' })),
  ];
  if (failures.length === 0) {
    return [];
  }

  return [
    {
      code: 'CHAMFER_DISTANCE_MISMATCH',
      severity: 'error',
      message: `Chamfer distance mismatch:\n${failures.map((failure) => `- ${failure}`).join('\n')}`,
      suggestion:
        'Compare the actual model against the reference dimensions, missing details, and tolerance-sensitive features.',
      details: { evidence: 'mesh', actual, expected },
    },
  ];
};

const evaluateDistanceSummary = (options: {
  subject: unknown;
  reference: unknown;
  expected: GeoSpecMinimumDistanceExpectation;
  metric: 'min' | 'max';
  matcher: string;
  code: string;
}): GeometryDiagnostic[] => {
  const { code, expected, matcher, metric, reference, subject } = options;
  if (!isGeometrySubject(subject)) {
    return [unsupportedSubjectDiagnostic(matcher)];
  }
  if (!isGeometrySubject(reference)) {
    return [unsupportedSubjectDiagnostic(`${matcher} reference`)];
  }
  const result = analyzeChamferDistance({
    actual: subject.mesh.stats.meshQuality.triangles,
    expected: reference.mesh.stats.meshQuality.triangles,
    samples: expected.samples ?? defaultChamferSamples,
    seed: expected.seed,
  });
  if (!result.success) {
    return result.diagnostics;
  }
  const actual = result.stats[metric];
  const failures = evaluateNumeric({
    actual,
    expected: expected.value,
    tolerance: expected.tolerance ?? defaultScalarTolerance,
    label: metric === 'min' ? 'minimumDistance' : 'hausdorffDistance',
  });
  if (failures.length === 0) {
    return [];
  }
  return [
    {
      code,
      severity: 'error',
      message: `${metric === 'min' ? 'Minimum' : 'Hausdorff'} distance mismatch:\n${failures.map((failure) => `- ${failure}`).join('\n')}`,
      suggestion:
        'Compare the actual model against the reference geometry and inspect localized deviations before changing tolerances.',
      details: { evidence: 'mesh', actual: result.stats, expected },
    },
  ];
};

const normalizedVectorFailures = (options: {
  actual: Vec3;
  expected: GeoSpecPointExpectation;
  tolerance: number;
  label: string;
}): string[] => evaluatePoint(options);

const evaluatePlanarFace = (subject: unknown, expected: GeoSpecPlanarFaceExpectation): GeometryDiagnostic[] => {
  if (!isGeometrySubject(subject)) {
    return [unsupportedSubjectDiagnostic('toHavePlanarFace')];
  }
  const faces = subject.brep?.planarFaces;
  if (!faces) {
    return [unsupportedEvidenceDiagnostic('toHavePlanarFace', 'BRep planar-face')];
  }

  const tolerance = expected.tolerance ?? defaultLengthTolerance;
  const match = faces.find((face) => {
    const failures = [
      ...normalizedVectorFailures({
        actual: face.normal,
        expected: expected.normal,
        tolerance: expected.tolerance ?? defaultUnitVectorTolerance,
        label: 'normal',
      }),
      ...evaluateNumeric({ actual: face.offset, expected: { value: expected.offset }, tolerance, label: 'offset' }),
      ...(expected.area === undefined || face.area === undefined
        ? []
        : evaluateNumeric({ actual: face.area, expected: expected.area, tolerance, label: 'area' })),
    ];
    return failures.length === 0;
  });
  if (match) {
    return [];
  }

  return [
    {
      code: 'PLANAR_FACE_NOT_FOUND',
      severity: 'error',
      message: 'No planar face matched the expected normal, offset, and area constraints.',
      suggestion: 'Check the modeled plane orientation, extrusion depth, and whether exact BRep evidence is available.',
      details: { evidence: 'brep', expected, actual: faces },
    },
  ];
};

const evaluateCylindricalFace = (
  subject: unknown,
  expected: GeoSpecCylindricalFaceExpectation,
): GeometryDiagnostic[] => {
  if (!isGeometrySubject(subject)) {
    return [unsupportedSubjectDiagnostic('toHaveCylindricalFace')];
  }
  const faces = subject.brep?.cylindricalFaces;
  if (!faces) {
    return [unsupportedEvidenceDiagnostic('toHaveCylindricalFace', 'BRep cylindrical-face')];
  }

  const tolerance = expected.tolerance ?? defaultLengthTolerance;
  const match = faces.find(
    (face) =>
      face.axis === expected.axis &&
      evaluateNumeric({
        actual: face.radius,
        expected: { value: expected.radius },
        tolerance,
        label: 'radius',
      }).length === 0,
  );
  if (match) {
    return [];
  }

  return [
    {
      code: 'CYLINDRICAL_FACE_NOT_FOUND',
      severity: 'error',
      message: 'No cylindrical face matched the expected radius and axis.',
      suggestion: 'Check hole, boss, or shaft radius and whether exact BRep evidence is available.',
      details: { evidence: 'brep', expected, actual: faces },
    },
  ];
};

const evaluateCircularHole = (subject: unknown, expected: GeoSpecCircularHoleExpectation): GeometryDiagnostic[] => {
  if (!isGeometrySubject(subject)) {
    return [unsupportedSubjectDiagnostic('toHaveCircularHole')];
  }
  const holes = subject.brep?.circularHoles;
  if (!holes) {
    return [unsupportedEvidenceDiagnostic('toHaveCircularHole', 'BRep circular-hole')];
  }

  const tolerance = expected.tolerance ?? defaultLengthTolerance;
  const match = holes.find((hole) => {
    const failures = [
      ...evaluateNumeric({
        actual: hole.diameter,
        expected: { value: expected.diameter },
        tolerance,
        label: 'diameter',
      }),
      ...(expected.center === undefined || hole.center === undefined
        ? []
        : evaluatePoint({ actual: hole.center, expected: expected.center, tolerance, label: 'center' })),
    ];
    return (
      failures.length === 0 &&
      (expected.axis === undefined || hole.axis === expected.axis) &&
      (expected.through === undefined || hole.through === expected.through)
    );
  });
  if (match) {
    return [];
  }

  const actualSummary =
    holes.length === 0
      ? 'No circular holes were detected.'
      : `Detected circular holes: ${holes
          .map((hole) => {
            const center = hole.center
              ? `, center [${hole.center.map((value) => Number(value.toFixed(4))).join(', ')}]`
              : '';
            return `diameter ${hole.diameter}, through ${hole.through}, axis ${hole.axis}${center}`;
          })
          .join('; ')}.`;

  return [
    {
      code: 'CIRCULAR_HOLE_NOT_FOUND',
      severity: 'error',
      message: `No circular hole matched the expected diameter, through-state, axis, and center. ${actualSummary}`,
      suggestion:
        'Check the hole diameter, placement, cut direction, and whether the cut tool fully spans the part when a through-hole is expected.',
      details: { evidence: 'brep', expected, actual: holes },
    },
  ];
};

const evaluateChamferFeature = (subject: unknown, expected: GeoSpecChamferFeatureExpectation): GeometryDiagnostic[] => {
  if (!isGeometrySubject(subject)) {
    return [unsupportedSubjectDiagnostic('toHaveChamferFeature')];
  }
  const features = subject.brep?.chamferFeatures;
  if (!features) {
    return [unsupportedEvidenceDiagnostic('toHaveChamferFeature', 'BRep chamfer-feature')];
  }

  const tolerance = expected.tolerance ?? defaultLengthTolerance;
  const match = features.find(
    (feature) =>
      (expected.selection === undefined || feature.selection === expected.selection) &&
      evaluateNumeric({
        actual: feature.distance,
        expected: { value: expected.distance },
        tolerance,
        label: 'distance',
      }).length === 0,
  );
  if (match) {
    return [];
  }

  return [
    {
      code: 'CHAMFER_FEATURE_NOT_FOUND',
      severity: 'error',
      message: 'No chamfer feature matched the expected distance and selection.',
      suggestion: 'Check the selected edge/perimeter, chamfer operation, and whether exact BRep evidence is available.',
      details: { evidence: 'brep', expected, actual: features },
    },
  ];
};

const evaluateMinimumWallThickness = (
  subject: unknown,
  expected: GeoSpecMinimumWallThicknessExpectation,
): GeometryDiagnostic[] => {
  if (!isGeometrySubject(subject)) {
    return [unsupportedSubjectDiagnostic('toHaveMinimumWallThickness')];
  }
  const thickness = subject.brep?.minimumWallThickness;
  if (!thickness) {
    return [unsupportedEvidenceDiagnostic('toHaveMinimumWallThickness', 'BRep wall-thickness')];
  }

  const tolerance = expected.tolerance ?? defaultLengthTolerance;
  const failures = evaluateNumeric({
    actual: thickness.value,
    expected: expected.value,
    tolerance,
    label: 'minimumWallThickness',
  });
  if (failures.length === 0) {
    return [];
  }

  return [
    {
      code: 'MINIMUM_WALL_THICKNESS_MISMATCH',
      severity: 'error',
      message: `Minimum wall thickness mismatch:\n${failures.map((failure) => `- ${failure}`).join('\n')}`,
      suggestion: 'Thicken the shell, reduce interior cutouts, or update the expected manufacturing constraint.',
      spatial: { center: thickness.location },
      details: { evidence: 'brep', expected, actual: thickness },
    },
  ];
};

const evaluateValidBrep = (subject: unknown): GeometryDiagnostic[] => {
  if (!isGeometrySubject(subject)) {
    return [unsupportedSubjectDiagnostic('toBeValidBrep')];
  }
  const validity = subject.brep?.validity;
  if (!validity) {
    return [unsupportedEvidenceDiagnostic('toBeValidBrep', 'BRep validity')];
  }
  if (validity.valid) {
    return [];
  }
  return [
    {
      code: 'BREP_INVALID',
      severity: 'error',
      message: 'BRep validity check failed.',
      suggestion: 'Inspect failed booleans, missing caps, self-intersections, and imported STEP diagnostics.',
      details: validity,
    },
  ];
};

const evaluateTopologyCounts = (subject: unknown, expected: GeoSpecTopologyCountsExpectation): GeometryDiagnostic[] => {
  if (!isGeometrySubject(subject)) {
    return [unsupportedSubjectDiagnostic('toHaveTopologyCounts')];
  }
  const counts = subject.brep?.topologyCounts;
  if (!counts) {
    return [unsupportedEvidenceDiagnostic('toHaveTopologyCounts', 'BRep topology-count')];
  }
  const tolerance = expected.tolerance ?? 0;
  const fields = ['vertices', 'edges', 'wires', 'faces', 'shells', 'solids', 'compounds'] as const;
  const failures = fields.flatMap((field) => {
    const expectation = expected[field];
    const actual = counts[field];
    return expectation === undefined || actual === undefined
      ? []
      : evaluateNumeric({ actual, expected: expectation, tolerance, label: field });
  });
  if (failures.length === 0) {
    return [];
  }
  return [
    {
      code: 'TOPOLOGY_COUNTS_MISMATCH',
      severity: 'error',
      message: `Topology counts mismatch:\n${failures.map((failure) => `- ${failure}`).join('\n')}`,
      suggestion: 'Check whether features were added, removed, fused, or failed during STEP/BRep generation.',
      details: { evidence: 'brep', expected, actual: counts },
    },
  ];
};

const evaluateStepUnits = (subject: unknown, expected: GeoSpecStepUnitsExpectation): GeometryDiagnostic[] => {
  if (!isGeometrySubject(subject)) {
    return [unsupportedSubjectDiagnostic('toHaveStepUnits')];
  }
  if (!subject.step) {
    return [unsupportedEvidenceDiagnostic('toHaveStepUnits', 'STEP unit')];
  }
  if (subject.step.unit === expected.unit) {
    return [];
  }
  return [
    {
      code: 'STEP_UNITS_MISMATCH',
      severity: 'error',
      message: `STEP units mismatch: expected ${expected.unit}, got ${subject.step.unit ?? 'unknown'}.`,
      suggestion: 'Check export unit settings and loader unit options.',
      details: { expected, actual: subject.step.unit, readStrategy: subject.step.readStrategy },
    },
  ];
};

const evaluateProductStructure = (
  subject: unknown,
  expected: GeoSpecProductStructureExpectation,
): GeometryDiagnostic[] => {
  if (!isGeometrySubject(subject)) {
    return [unsupportedSubjectDiagnostic('toHaveProductStructure')];
  }
  const productStructure = subject.step?.productStructure;
  if (!productStructure) {
    return [unsupportedEvidenceDiagnostic('toHaveProductStructure', 'STEP product-structure')];
  }
  const failures = [
    ...(expected.count === undefined
      ? []
      : evaluateNumeric({
          actual: productStructure.length,
          expected: expected.count,
          tolerance: 0,
          label: 'productCount',
        })),
    ...(expected.names ?? [])
      .filter((name) => !productStructure.some((product) => product.name === name))
      .map((name) => `name: expected product '${name}'`),
  ];
  if (failures.length === 0) {
    return [];
  }
  return [
    {
      code: 'PRODUCT_STRUCTURE_MISMATCH',
      severity: 'error',
      message: `Product structure mismatch:\n${failures.map((failure) => `- ${failure}`).join('\n')}`,
      suggestion: 'Check named exports, assembly shape names, and STEP product metadata.',
      details: { expected, actual: productStructure },
    },
  ];
};

const evaluateCircularHolePattern = (
  subject: unknown,
  expected: GeoSpecCircularHolePatternExpectation,
): GeometryDiagnostic[] => {
  if (!isGeometrySubject(subject)) {
    return [unsupportedSubjectDiagnostic('toHaveCircularHolePattern')];
  }
  const patterns = subject.brep?.circularHolePatterns;
  if (!patterns) {
    return [unsupportedEvidenceDiagnostic('toHaveCircularHolePattern', 'BRep circular-hole-pattern')];
  }
  const tolerance = expected.tolerance ?? defaultLengthTolerance;
  const match = patterns.find((pattern) => {
    const failures = [
      ...evaluateNumeric({ actual: pattern.count, expected: { value: expected.count }, tolerance: 0, label: 'count' }),
      ...evaluateNumeric({
        actual: pattern.holeDiameter,
        expected: { value: expected.holeDiameter },
        tolerance,
        label: 'holeDiameter',
      }),
      ...(expected.boltCircleDiameter === undefined
        ? []
        : evaluateNumeric({
            actual: pattern.boltCircleDiameter,
            expected: { value: expected.boltCircleDiameter },
            tolerance,
            label: 'boltCircleDiameter',
          })),
      ...(expected.center === undefined || pattern.center === undefined
        ? []
        : evaluatePoint({ actual: pattern.center, expected: expected.center, tolerance, label: 'center' })),
    ];
    return failures.length === 0 && (expected.axis === undefined || pattern.axis === expected.axis);
  });
  if (match) {
    return [];
  }
  return [
    {
      code: 'CIRCULAR_HOLE_PATTERN_NOT_FOUND',
      severity: 'error',
      message: 'No circular hole pattern matched the expected count, diameter, axis, and bolt circle constraints.',
      suggestion: 'Check repeated hole placement, bolt circle radius, and through-hole construction.',
      details: { evidence: 'brep', expected, actual: patterns },
    },
  ];
};

const evaluateFilletFeature = (subject: unknown, expected: GeoSpecFilletFeatureExpectation): GeometryDiagnostic[] => {
  if (!isGeometrySubject(subject)) {
    return [unsupportedSubjectDiagnostic('toHaveFilletFeature')];
  }
  const features = subject.brep?.filletFeatures;
  if (!features) {
    return [unsupportedEvidenceDiagnostic('toHaveFilletFeature', 'BRep fillet-feature')];
  }
  const tolerance = expected.tolerance ?? defaultLengthTolerance;
  const match = features.find(
    (feature) =>
      (expected.selection === undefined || feature.selection === expected.selection) &&
      evaluateNumeric({ actual: feature.radius, expected: { value: expected.radius }, tolerance, label: 'radius' })
        .length === 0,
  );
  if (match) {
    return [];
  }
  return [
    {
      code: 'FILLET_FEATURE_NOT_FOUND',
      severity: 'error',
      message: 'No fillet feature matched the expected radius and selection.',
      suggestion: 'Check the selected edge/perimeter, fillet operation, and whether exact BRep evidence is available.',
      details: { evidence: 'brep', expected, actual: features },
    },
  ];
};

const recordAssertion = (assertion: GeoSpecAssertion, diagnostics: GeometryDiagnostic[]): GeoSpecAssertion => {
  assertion.passed = diagnostics.length === 0;
  assertion.diagnostics = diagnostics;
  if (diagnostics.length > 0) {
    throw new Error(diagnostics.map((diagnostic) => diagnostic.message).join('\n'));
  }
  return assertion;
};

const withTimeout = async (promise: Promise<unknown>, testTimeout: number): Promise<void> => {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`GeoSpec test timed out after ${testTimeout}ms.`));
        }, testTimeout);
      }),
    ]);
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
  }
};

export const getCollector = (): GeoSpecCollector => {
  const collector = geospecGlobal[collectorGlobalKey];
  if (!isGeoSpecCollector(collector)) {
    throw new Error('GeoSpec collector is not active. Run the module through runGeoSpecModule().');
  }

  return collector;
};

const isGeoSpecCollector = (value: unknown): value is GeoSpecCollector =>
  typeof value === 'object' &&
  value !== null &&
  'describe' in value &&
  'it' in value &&
  'expectGeo' in value &&
  'tests' in value;

const isGeoSpecTestCase = (value: unknown): value is GeoSpecTestCase =>
  typeof value === 'object' && value !== null && 'suite' in value && 'name' in value && 'assertions' in value;

const setActiveTest = (test: GeoSpecTestCase | undefined): void => {
  if (test === undefined) {
    Reflect.deleteProperty(geospecGlobal, activeTestGlobalKey);
    return;
  }
  geospecGlobal[activeTestGlobalKey] = test;
};

/**
 * Create a collector used by the embedded GeoSpec runner.
 *
 * @returns A fresh collector instance.
 */
export const createCollector = (): GeoSpecCollector => {
  const suite: string[] = [];
  const tests: GeoSpecTestCase[] = [];
  const pending: Array<Promise<unknown>> = [];

  const trackPending = (
    operation: PromiseLike<unknown>,
    handlers: {
      onError(error: unknown): void;
      onFinally(): void;
    },
  ): void => {
    pending.push(
      (async () => {
        try {
          await operation;
        } catch (error) {
          handlers.onError(error);
        } finally {
          handlers.onFinally();
        }
      })(),
    );
  };

  const recordSkipped = (name: string): void => {
    tests.push({
      suite: [...suite],
      name,
      assertions: [],
      status: 'skipped',
      diagnostics: [],
    });
  };

  return {
    describe(name, function_) {
      suite.push(name);
      try {
        const result = function_();
        if (isPromiseLike(result)) {
          trackPending(result, {
            onError(error) {
              tests.push({
                suite: [...suite],
                name,
                assertions: [],
                status: 'failed',
                diagnostics: [createErrorDiagnostic(error)],
              });
            },
            onFinally() {
              suite.pop();
            },
          });
          return;
        }
      } catch (error) {
        tests.push({
          suite: [...suite],
          name,
          assertions: [],
          status: 'failed',
          diagnostics: [createErrorDiagnostic(error)],
        });
      }
      suite.pop();
    },

    describeSkip(name) {
      recordSkipped(name);
    },

    it(name, function_) {
      const test: GeoSpecTestCase = {
        suite: [...suite],
        name,
        assertions: [],
        status: 'passed',
        diagnostics: [],
      };
      tests.push(test);
      const previousTest = geospecGlobal[activeTestGlobalKey];
      setActiveTest(test);
      const restore = (): void => {
        setActiveTest(isGeoSpecTestCase(previousTest) ? previousTest : undefined);
      };

      try {
        const result = function_();
        if (isPromiseLike(result)) {
          trackPending(result, {
            onError(error) {
              test.status = 'failed';
              test.diagnostics.push(createErrorDiagnostic(error));
            },
            onFinally: restore,
          });
          return;
        }
      } catch (error) {
        test.status = 'failed';
        test.diagnostics.push(createErrorDiagnostic(error));
      }
      restore();
    },

    itSkip(name) {
      recordSkipped(name);
    },

    expectGeo(subject) {
      return {
        toHaveBoundingBox(first, second) {
          const activeTest = geospecGlobal[activeTestGlobalKey];
          if (!isGeoSpecTestCase(activeTest)) {
            throw new Error('expectGeo() must be called inside it().');
          }

          const expected = asBoundingBoxExpectation(first, second);
          const assertion: GeoSpecAssertion = {
            kind: 'boundingBox',
            subject,
            expected,
          };
          activeTest.assertions.push(assertion);
          return recordAssertion(assertion, evaluateBoundingBox(subject, expected));
        },

        toHaveConnectedComponents(expected) {
          const activeTest = geospecGlobal[activeTestGlobalKey];
          if (!isGeoSpecTestCase(activeTest)) {
            throw new Error('expectGeo() must be called inside it().');
          }

          const assertion: GeoSpecAssertion = {
            kind: 'connectedComponents',
            subject,
            expected,
          };
          activeTest.assertions.push(assertion);
          return recordAssertion(assertion, evaluateConnectedComponents(subject, expected));
        },

        toBeWatertight() {
          const activeTest = geospecGlobal[activeTestGlobalKey];
          if (!isGeoSpecTestCase(activeTest)) {
            throw new Error('expectGeo() must be called inside it().');
          }

          const assertion: GeoSpecAssertion = {
            kind: 'watertight',
            subject,
            expected: true,
          };
          activeTest.assertions.push(assertion);
          return recordAssertion(assertion, evaluateWatertight(subject));
        },

        toHaveSurfaceArea(expected) {
          const activeTest = geospecGlobal[activeTestGlobalKey];
          if (!isGeoSpecTestCase(activeTest)) {
            throw new Error('expectGeo() must be called inside it().');
          }

          const assertion: GeoSpecAssertion = { kind: 'surfaceArea', subject, expected };
          activeTest.assertions.push(assertion);
          return recordAssertion(assertion, evaluateSurfaceArea(subject, expected));
        },

        toHaveVolume(expected) {
          const activeTest = geospecGlobal[activeTestGlobalKey];
          if (!isGeoSpecTestCase(activeTest)) {
            throw new Error('expectGeo() must be called inside it().');
          }

          const assertion: GeoSpecAssertion = { kind: 'volume', subject, expected };
          activeTest.assertions.push(assertion);
          return recordAssertion(assertion, evaluateVolume(subject, expected));
        },

        toHaveMass(expected) {
          const activeTest = geospecGlobal[activeTestGlobalKey];
          if (!isGeoSpecTestCase(activeTest)) {
            throw new Error('expectGeo() must be called inside it().');
          }

          const assertion: GeoSpecAssertion = { kind: 'mass', subject, expected };
          activeTest.assertions.push(assertion);
          return recordAssertion(assertion, evaluateMass(subject, expected));
        },

        toHaveCenterOfMass(expected) {
          const activeTest = geospecGlobal[activeTestGlobalKey];
          if (!isGeoSpecTestCase(activeTest)) {
            throw new Error('expectGeo() must be called inside it().');
          }

          const assertion: GeoSpecAssertion = { kind: 'centerOfMass', subject, expected };
          activeTest.assertions.push(assertion);
          return recordAssertion(assertion, evaluateCenterOfMass(subject, expected));
        },

        toHaveChamferDistanceTo(reference, expected) {
          const activeTest = geospecGlobal[activeTestGlobalKey];
          if (!isGeoSpecTestCase(activeTest)) {
            throw new Error('expectGeo() must be called inside it().');
          }

          const assertion: GeoSpecAssertion = { kind: 'chamferDistance', subject, expected };
          activeTest.assertions.push(assertion);
          return recordAssertion(assertion, evaluateChamferDistance(subject, reference, expected));
        },

        toHaveHausdorffDistanceTo(reference, expected) {
          const activeTest = geospecGlobal[activeTestGlobalKey];
          if (!isGeoSpecTestCase(activeTest)) {
            throw new Error('expectGeo() must be called inside it().');
          }

          const assertion: GeoSpecAssertion = { kind: 'hausdorffDistance', subject, expected };
          activeTest.assertions.push(assertion);
          return recordAssertion(
            assertion,
            evaluateDistanceSummary({
              subject,
              reference,
              expected,
              metric: 'max',
              matcher: 'toHaveHausdorffDistanceTo',
              code: 'HAUSDORFF_DISTANCE_MISMATCH',
            }),
          );
        },

        toHaveMinimumDistanceTo(reference, expected) {
          const activeTest = geospecGlobal[activeTestGlobalKey];
          if (!isGeoSpecTestCase(activeTest)) {
            throw new Error('expectGeo() must be called inside it().');
          }

          const assertion: GeoSpecAssertion = { kind: 'minimumDistance', subject, expected };
          activeTest.assertions.push(assertion);
          return recordAssertion(
            assertion,
            evaluateDistanceSummary({
              subject,
              reference,
              expected,
              metric: 'min',
              matcher: 'toHaveMinimumDistanceTo',
              code: 'MINIMUM_DISTANCE_MISMATCH',
            }),
          );
        },

        toBeValidBrep() {
          const activeTest = geospecGlobal[activeTestGlobalKey];
          if (!isGeoSpecTestCase(activeTest)) {
            throw new Error('expectGeo() must be called inside it().');
          }

          const assertion: GeoSpecAssertion = { kind: 'validBrep', subject, expected: true };
          activeTest.assertions.push(assertion);
          return recordAssertion(assertion, evaluateValidBrep(subject));
        },

        toHaveTopologyCounts(expected) {
          const activeTest = geospecGlobal[activeTestGlobalKey];
          if (!isGeoSpecTestCase(activeTest)) {
            throw new Error('expectGeo() must be called inside it().');
          }

          const assertion: GeoSpecAssertion = { kind: 'topologyCounts', subject, expected };
          activeTest.assertions.push(assertion);
          return recordAssertion(assertion, evaluateTopologyCounts(subject, expected));
        },

        toHaveStepUnits(expected) {
          const activeTest = geospecGlobal[activeTestGlobalKey];
          if (!isGeoSpecTestCase(activeTest)) {
            throw new Error('expectGeo() must be called inside it().');
          }

          const assertion: GeoSpecAssertion = { kind: 'stepUnits', subject, expected };
          activeTest.assertions.push(assertion);
          return recordAssertion(assertion, evaluateStepUnits(subject, expected));
        },

        toHaveProductStructure(expected) {
          const activeTest = geospecGlobal[activeTestGlobalKey];
          if (!isGeoSpecTestCase(activeTest)) {
            throw new Error('expectGeo() must be called inside it().');
          }

          const assertion: GeoSpecAssertion = { kind: 'productStructure', subject, expected };
          activeTest.assertions.push(assertion);
          return recordAssertion(assertion, evaluateProductStructure(subject, expected));
        },

        toHavePlanarFace(expected) {
          const activeTest = geospecGlobal[activeTestGlobalKey];
          if (!isGeoSpecTestCase(activeTest)) {
            throw new Error('expectGeo() must be called inside it().');
          }

          const assertion: GeoSpecAssertion = { kind: 'planarFace', subject, expected };
          activeTest.assertions.push(assertion);
          return recordAssertion(assertion, evaluatePlanarFace(subject, expected));
        },

        toHaveCylindricalFace(expected) {
          const activeTest = geospecGlobal[activeTestGlobalKey];
          if (!isGeoSpecTestCase(activeTest)) {
            throw new Error('expectGeo() must be called inside it().');
          }

          const assertion: GeoSpecAssertion = { kind: 'cylindricalFace', subject, expected };
          activeTest.assertions.push(assertion);
          return recordAssertion(assertion, evaluateCylindricalFace(subject, expected));
        },

        toHaveCircularHole(expected) {
          const activeTest = geospecGlobal[activeTestGlobalKey];
          if (!isGeoSpecTestCase(activeTest)) {
            throw new Error('expectGeo() must be called inside it().');
          }

          const assertion: GeoSpecAssertion = { kind: 'circularHole', subject, expected };
          activeTest.assertions.push(assertion);
          return recordAssertion(assertion, evaluateCircularHole(subject, expected));
        },

        toHaveCircularHolePattern(expected) {
          const activeTest = geospecGlobal[activeTestGlobalKey];
          if (!isGeoSpecTestCase(activeTest)) {
            throw new Error('expectGeo() must be called inside it().');
          }

          const assertion: GeoSpecAssertion = { kind: 'circularHolePattern', subject, expected };
          activeTest.assertions.push(assertion);
          return recordAssertion(assertion, evaluateCircularHolePattern(subject, expected));
        },

        toHaveChamferFeature(expected) {
          const activeTest = geospecGlobal[activeTestGlobalKey];
          if (!isGeoSpecTestCase(activeTest)) {
            throw new Error('expectGeo() must be called inside it().');
          }

          const assertion: GeoSpecAssertion = { kind: 'chamferFeature', subject, expected };
          activeTest.assertions.push(assertion);
          return recordAssertion(assertion, evaluateChamferFeature(subject, expected));
        },

        toHaveFilletFeature(expected) {
          const activeTest = geospecGlobal[activeTestGlobalKey];
          if (!isGeoSpecTestCase(activeTest)) {
            throw new Error('expectGeo() must be called inside it().');
          }

          const assertion: GeoSpecAssertion = { kind: 'filletFeature', subject, expected };
          activeTest.assertions.push(assertion);
          return recordAssertion(assertion, evaluateFilletFeature(subject, expected));
        },

        toHaveMinimumWallThickness(expected) {
          const activeTest = geospecGlobal[activeTestGlobalKey];
          if (!isGeoSpecTestCase(activeTest)) {
            throw new Error('expectGeo() must be called inside it().');
          }

          const assertion: GeoSpecAssertion = { kind: 'minimumWallThickness', subject, expected };
          activeTest.assertions.push(assertion);
          return recordAssertion(assertion, evaluateMinimumWallThickness(subject, expected));
        },
      };
    },

    async waitForCompletion(testTimeout) {
      await withTimeout(Promise.allSettled(pending), testTimeout);
    },

    tests,
  };
};

/**
 * Clear runner globals after a module finishes.
 */
export const clearCollectorGlobals = (): void => {
  Reflect.deleteProperty(geospecGlobal, collectorGlobalKey);
  Reflect.deleteProperty(geospecGlobal, activeTestGlobalKey);
};

/**
 * Install a collector into the current JavaScript global scope.
 *
 * @param collector - Collector for the active run.
 */
export const installCollector = (collector: GeoSpecCollector): void => {
  geospecGlobal[collectorGlobalKey] = collector;
};
