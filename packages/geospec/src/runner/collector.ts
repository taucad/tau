import type { GeometryDiagnostic, GeometrySubject, Vec3 } from '#mesh/types.js';
import { analyzeChamferDistance } from '#mesh/distance.js';
import { analyzeMeshOverlap } from '#mesh/overlap.js';
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
  GeoSpecComponentOverlapExpectation,
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
  waitForCompletion(testTimeout: number, testNamePattern?: string): Promise<void>;
};

export const collectorGlobalKey = '__GEOSPEC_COLLECTOR__';
const geospecGlobal = globalThis as typeof globalThis & Record<string, unknown>;

const isPromiseLike = (value: unknown): value is PromiseLike<unknown> =>
  typeof value === 'object' &&
  value !== null &&
  'then' in value &&
  typeof (value as { then?: unknown }).then === 'function';

/**
 * Assertion error thrown by GeoSpec matchers when an expectation does not hold.
 *
 * Runner, CLI, and tool adapters unwrap this error to preserve structured
 * diagnostics instead of collapsing them into a single string.
 *
 * @public
 */
export class GeoSpecAssertionError extends Error {
  public readonly diagnostics: readonly GeometryDiagnostic[];

  public constructor(diagnostics: readonly GeometryDiagnostic[]) {
    super(diagnostics.map((diagnostic) => diagnostic.message).join('\n') || 'GeoSpec assertion failed.');
    this.name = 'GeoSpecAssertionError';
    this.diagnostics = Object.freeze([...diagnostics]);
  }
}

const createErrorDiagnostics = (error: unknown): GeometryDiagnostic[] => {
  if (error instanceof GeoSpecAssertionError) {
    return [...error.diagnostics];
  }

  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('model.volume is not a function')) {
    return [
      {
        code: 'GEOSPEC_SUBJECT_API_MISUSE',
        severity: 'error',
        message: 'GeoSpec GeometrySubject does not expose model.volume().',
        suggestion: 'Use expectGeo(model).toHaveVolume({ value, tolerance }) instead of reading model.volume().',
        details: error,
      },
    ];
  }
  if (/Cannot read properties of undefined \(reading 'bounds'\)/u.test(message)) {
    return [
      {
        code: 'GEOSPEC_SUBJECT_API_MISUSE',
        severity: 'error',
        message: 'GeoSpec GeometrySubject does not expose model.boundingBox.bounds.',
        suggestion:
          'Use expectGeo(model).toHaveBoundingBox({ min, max, size, center, tolerance }) instead of reading model.boundingBox.',
        details: error,
      },
    ];
  }
  return [
    {
      code: 'TEST_FAILED',
      severity: 'error',
      message,
      details: error,
    },
  ];
};

const defaultLengthTolerance = 0.1;
const defaultConnectedToleranceMm = 0.1;
const defaultScalarTolerance = 0.1;
const defaultUnitVectorTolerance = 1e-4;
const defaultChamferSamples = 10_000;
const defaultComponentOverlapTolerance = 0.1;

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

const invalidExpectationDiagnostic = (options: {
  matcher: string;
  path: string;
  message: string;
  expected: unknown;
  accepted: string;
}): GeometryDiagnostic => ({
  code: 'GEOSPEC_INVALID_EXPECTATION',
  severity: 'error',
  message: `${options.matcher} received an invalid expectation at ${options.path}: ${options.message}`,
  suggestion: `Use ${options.matcher}(${options.accepted}).`,
  details: {
    matcher: options.matcher,
    path: options.path,
    field: options.path.startsWith('$.') ? options.path.slice(2).split('.')[0] : undefined,
    expected: options.expected,
    accepted: options.accepted,
  },
});

const validateObjectExpectation = (options: {
  matcher: string;
  expected: unknown;
  allowed: readonly string[];
  required?: readonly string[];
  accepted: string;
}): GeometryDiagnostic[] => {
  if (!isRecord(options.expected)) {
    return [
      invalidExpectationDiagnostic({
        matcher: options.matcher,
        path: '$',
        message: 'expected an options object.',
        expected: options.expected,
        accepted: options.accepted,
      }),
    ];
  }

  const allowed = new Set(options.allowed);
  const diagnostics: GeometryDiagnostic[] = [];
  for (const key of Object.keys(options.expected)) {
    if (!allowed.has(key)) {
      diagnostics.push(
        invalidExpectationDiagnostic({
          matcher: options.matcher,
          path: `$.${key}`,
          message: `unknown field '${key}'.`,
          expected: options.expected[key],
          accepted: options.accepted,
        }),
      );
    }
  }

  for (const key of options.required ?? []) {
    if (!(key in options.expected)) {
      diagnostics.push(
        invalidExpectationDiagnostic({
          matcher: options.matcher,
          path: `$.${key}`,
          message: `missing required field '${key}'.`,
          expected: undefined,
          accepted: options.accepted,
        }),
      );
    }
  }
  return diagnostics;
};

const numericExpectationKeys = ['value', 'greaterThan', 'greaterThanOrEqual', 'lessThan', 'lessThanOrEqual'] as const;

const validateNumericExpectation = (options: {
  matcher: string;
  path: string;
  expected: unknown;
  accepted: string;
}): GeometryDiagnostic[] => {
  if (typeof options.expected === 'number' && Number.isFinite(options.expected)) {
    return [];
  }
  if (!isRecord(options.expected)) {
    return [
      invalidExpectationDiagnostic({
        matcher: options.matcher,
        path: options.path,
        message: 'expected a finite number or a numeric range object.',
        expected: options.expected,
        accepted: options.accepted,
      }),
    ];
  }

  const diagnostics: GeometryDiagnostic[] = [];
  let hasComparator = false;
  for (const key of Object.keys(options.expected)) {
    if (!numericExpectationKeys.includes(key as (typeof numericExpectationKeys)[number])) {
      diagnostics.push(
        invalidExpectationDiagnostic({
          matcher: options.matcher,
          path: `${options.path}.${key}`,
          message: `unknown numeric comparator '${key}'.`,
          expected: options.expected[key],
          accepted: options.accepted,
        }),
      );
      continue;
    }
    hasComparator = true;
    if (typeof options.expected[key] !== 'number' || !Number.isFinite(options.expected[key])) {
      diagnostics.push(
        invalidExpectationDiagnostic({
          matcher: options.matcher,
          path: `${options.path}.${key}`,
          message: `expected '${key}' to be a finite number.`,
          expected: options.expected[key],
          accepted: options.accepted,
        }),
      );
    }
  }

  if (!hasComparator) {
    diagnostics.push(
      invalidExpectationDiagnostic({
        matcher: options.matcher,
        path: options.path,
        message: 'expected at least one numeric comparator.',
        expected: options.expected,
        accepted: options.accepted,
      }),
    );
  }
  return diagnostics;
};

const validateFiniteNumberField = (options: {
  matcher: string;
  expected: Record<string, unknown>;
  field: string;
  accepted: string;
}): GeometryDiagnostic[] => {
  if (options.expected[options.field] === undefined) {
    return [];
  }
  return typeof options.expected[options.field] === 'number' && Number.isFinite(options.expected[options.field])
    ? []
    : [
        invalidExpectationDiagnostic({
          matcher: options.matcher,
          path: `$.${options.field}`,
          message: `expected '${options.field}' to be a finite number.`,
          expected: options.expected[options.field],
          accepted: options.accepted,
        }),
      ];
};

const validatePositiveIntegerField = (options: {
  matcher: string;
  expected: Record<string, unknown>;
  field: string;
  accepted: string;
}): GeometryDiagnostic[] => {
  if (options.expected[options.field] === undefined) {
    return [];
  }
  const value = options.expected[options.field];
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? []
    : [
        invalidExpectationDiagnostic({
          matcher: options.matcher,
          path: `$.${options.field}`,
          message: `expected '${options.field}' to be a positive integer.`,
          expected: value,
          accepted: options.accepted,
        }),
      ];
};

const validateStringField = (options: {
  matcher: string;
  expected: Record<string, unknown>;
  field: string;
  accepted: string;
  optional?: boolean;
}): GeometryDiagnostic[] => {
  const value = options.expected[options.field];
  if (value === undefined && options.optional) {
    return [];
  }
  return typeof value === 'string'
    ? []
    : [
        invalidExpectationDiagnostic({
          matcher: options.matcher,
          path: `$.${options.field}`,
          message: `expected '${options.field}' to be a string.`,
          expected: value,
          accepted: options.accepted,
        }),
      ];
};

const validateBooleanField = (options: {
  matcher: string;
  expected: Record<string, unknown>;
  field: string;
  accepted: string;
  optional?: boolean;
}): GeometryDiagnostic[] => {
  const value = options.expected[options.field];
  if (value === undefined && options.optional) {
    return [];
  }
  return typeof value === 'boolean'
    ? []
    : [
        invalidExpectationDiagnostic({
          matcher: options.matcher,
          path: `$.${options.field}`,
          message: `expected '${options.field}' to be a boolean.`,
          expected: value,
          accepted: options.accepted,
        }),
      ];
};

const validateAxisField = (options: {
  matcher: string;
  expected: Record<string, unknown>;
  accepted: string;
  optional?: boolean;
}): GeometryDiagnostic[] => {
  const { axis } = options.expected;
  if (axis === undefined && options.optional) {
    return [];
  }
  return axis === 'x' || axis === 'y' || axis === 'z'
    ? []
    : [
        invalidExpectationDiagnostic({
          matcher: options.matcher,
          path: '$.axis',
          message: "expected axis to be 'x', 'y', or 'z'.",
          expected: axis,
          accepted: options.accepted,
        }),
      ];
};

const validatePointExpectation = (options: {
  matcher: string;
  path: string;
  expected: unknown;
  accepted: string;
  optional?: boolean;
}): GeometryDiagnostic[] => {
  if (options.expected === undefined && options.optional) {
    return [];
  }

  if (Array.isArray(options.expected)) {
    return options.expected.length === 3 &&
      options.expected.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
      ? []
      : [
          invalidExpectationDiagnostic({
            matcher: options.matcher,
            path: options.path,
            message: 'expected a three-number point array.',
            expected: options.expected,
            accepted: options.accepted,
          }),
        ];
  }

  if (!isRecord(options.expected)) {
    return [
      invalidExpectationDiagnostic({
        matcher: options.matcher,
        path: options.path,
        message: 'expected a point object with finite x, y, or z fields.',
        expected: options.expected,
        accepted: options.accepted,
      }),
    ];
  }

  const diagnostics: GeometryDiagnostic[] = [];
  const allowed = new Set(axisNames);
  let hasAxisValue = false;
  for (const key of Object.keys(options.expected)) {
    if (!allowed.has(key as (typeof axisNames)[number])) {
      diagnostics.push(
        invalidExpectationDiagnostic({
          matcher: options.matcher,
          path: `${options.path}.${key}`,
          message: `unknown point field '${key}'.`,
          expected: options.expected[key],
          accepted: options.accepted,
        }),
      );
    }
  }
  for (const axis of axisNames) {
    const value = options.expected[axis];
    if (value !== undefined) {
      hasAxisValue = true;
    }
    if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value))) {
      diagnostics.push(
        invalidExpectationDiagnostic({
          matcher: options.matcher,
          path: `${options.path}.${axis}`,
          message: `expected '${axis}' to be a finite number.`,
          expected: value,
          accepted: options.accepted,
        }),
      );
    }
  }
  if (!hasAxisValue) {
    diagnostics.push(
      invalidExpectationDiagnostic({
        matcher: options.matcher,
        path: options.path,
        message: 'expected at least one finite point coordinate.',
        expected: options.expected,
        accepted: options.accepted,
      }),
    );
  }
  return diagnostics;
};

const distanceStatisticKeys = ['min', 'mean', 'max', 'p50', 'p95', 'p99', 'rms'] as const;

const validateChamferDistanceExpectation = (expected: unknown, accepted: string): GeometryDiagnostic[] => {
  const matcher = 'toHaveChamferDistanceTo';
  const objectDiagnostics = validateObjectExpectation({
    matcher,
    expected,
    allowed: [...distanceStatisticKeys, 'samples', 'seed'],
    accepted,
  });
  if (!isRecord(expected)) {
    return objectDiagnostics;
  }

  const hasStatistic = distanceStatisticKeys.some((key) => expected[key] !== undefined);
  const statisticDiagnostics = distanceStatisticKeys.flatMap((key) =>
    expected[key] === undefined
      ? []
      : validateNumericExpectation({ matcher, path: `$.${key}`, expected: expected[key], accepted }),
  );
  return [
    ...objectDiagnostics,
    ...(hasStatistic
      ? []
      : [
          invalidExpectationDiagnostic({
            matcher,
            path: '$',
            message: 'expected at least one distance statistic.',
            expected,
            accepted,
          }),
        ]),
    ...statisticDiagnostics,
    ...validatePositiveIntegerField({ matcher, expected, field: 'samples', accepted }),
    ...validateFiniteNumberField({ matcher, expected, field: 'seed', accepted }),
  ];
};

const validateMinimumDistanceExpectation = (
  matcher: string,
  expected: unknown,
  accepted: string,
): GeometryDiagnostic[] => {
  const objectDiagnostics = validateObjectExpectation({
    matcher,
    expected,
    allowed: ['value', 'samples', 'seed', 'tolerance'],
    required: ['value'],
    accepted,
  });
  if (!isRecord(expected)) {
    return objectDiagnostics;
  }
  return [
    ...objectDiagnostics,
    ...validateNumericExpectation({ matcher, path: '$.value', expected: expected['value'], accepted }),
    ...validatePositiveIntegerField({ matcher, expected, field: 'samples', accepted }),
    ...validateFiniteNumberField({ matcher, expected, field: 'seed', accepted }),
    ...validateFiniteNumberField({ matcher, expected, field: 'tolerance', accepted }),
  ];
};

const recordValidatedAssertion = (
  assertion: GeoSpecAssertion,
  validationDiagnostics: GeometryDiagnostic[],
  evaluate: () => GeometryDiagnostic[],
): GeoSpecAssertion =>
  recordAssertion(assertion, validationDiagnostics.length > 0 ? validationDiagnostics : evaluate());

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

const validateComponentOverlapExpectation = (expected: unknown): GeometryDiagnostic[] => {
  const matcher = 'toHaveNoComponentOverlap';
  const accepted = '{ tolerance?: number }';
  const normalized = expected ?? {};
  const objectDiagnostics = validateObjectExpectation({
    matcher,
    expected: normalized,
    allowed: ['tolerance'],
    accepted,
  });
  if (!isRecord(normalized)) {
    return objectDiagnostics;
  }
  return [
    ...objectDiagnostics,
    ...validateFiniteNumberField({ matcher, expected: normalized, field: 'tolerance', accepted }),
  ];
};

const evaluateComponentOverlap = async (
  subject: unknown,
  expected: GeoSpecComponentOverlapExpectation,
): Promise<GeometryDiagnostic[]> => {
  if (!isGeometrySubject(subject)) {
    return [unsupportedSubjectDiagnostic('toHaveNoComponentOverlap')];
  }

  const analysis = await analyzeMeshOverlap({
    subject,
    tolerance: expected.tolerance ?? defaultComponentOverlapTolerance,
  });
  if (!analysis.success) {
    return analysis.diagnostics;
  }
  if (analysis.evidence.overlaps.length === 0) {
    return [];
  }

  const pairSummary = analysis.evidence.overlaps
    .map((overlap) => `${overlap.leftLabel} to ${overlap.rightLabel}: volume ${overlap.intersectionVolume}`)
    .join('\n');
  return [
    {
      code: 'GEOSPEC_COMPONENT_OVERLAP_DETECTED',
      severity: 'error',
      message: `Component overlap detected between ${analysis.evidence.overlaps.length} component pair(s):\n${pairSummary}`,
      suggestion:
        'Fix the assembly positions, clearances, boolean operations, or component dimensions so separate parts do not occupy the same solid volume.',
      spatial: analysis.evidence.overlaps[0]?.witnessPoint
        ? { center: analysis.evidence.overlaps[0].witnessPoint }
        : undefined,
      details: {
        ...analysis.evidence,
        ...subjectDiagnosticContext(subject),
      },
    },
  ];
};

const subjectDiagnosticContext = (subject: GeometrySubject): Record<string, unknown> => ({
  unit: subject.provenance.unit,
  source: subject.provenance.source,
  format: subject.provenance.source.format,
  parameters: subject.provenance.parameters,
});

const meshMeasurementDetails = (options: {
  subject: GeometrySubject;
  kind: string;
  actual: unknown;
  expected: unknown;
}): Record<string, unknown> => ({
  evidence: 'mesh',
  measurement: options.kind,
  actual: options.actual,
  expected: options.expected,
  ...subjectDiagnosticContext(options.subject),
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
        ...meshMeasurementDetails({ subject, kind: 'surfaceArea', actual, expected }),
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
        ...meshMeasurementDetails({ subject, kind: 'volume', actual, expected }),
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
        ...meshMeasurementDetails({ subject, kind: 'mass', actual, expected }),
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
      details: meshMeasurementDetails({ subject, kind: 'centerOfMass', actual, expected }),
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
      details: { evidence: 'brep', expected, actual: faces, ...subjectDiagnosticContext(subject) },
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
      details: { evidence: 'brep', expected, actual: faces, ...subjectDiagnosticContext(subject) },
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
      details: { evidence: 'brep', expected, actual: holes, ...subjectDiagnosticContext(subject) },
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
      details: { evidence: 'brep', expected, actual: features, ...subjectDiagnosticContext(subject) },
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
      details: { evidence: 'brep', expected, actual: thickness, ...subjectDiagnosticContext(subject) },
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
      details: { actual: validity, ...subjectDiagnosticContext(subject) },
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
      details: { evidence: 'brep', expected, actual: counts, ...subjectDiagnosticContext(subject) },
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
      details: {
        expected,
        actual: subject.step.unit,
        readStrategy: subject.step.readStrategy,
        ...subjectDiagnosticContext(subject),
      },
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
      details: { expected, actual: productStructure, ...subjectDiagnosticContext(subject) },
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
      details: { evidence: 'brep', expected, actual: patterns, ...subjectDiagnosticContext(subject) },
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
      details: { evidence: 'brep', expected, actual: features, ...subjectDiagnosticContext(subject) },
    },
  ];
};

const recordAssertion = (assertion: GeoSpecAssertion, diagnostics: GeometryDiagnostic[]): GeoSpecAssertion => {
  assertion.passed = diagnostics.length === 0;
  assertion.diagnostics = diagnostics;
  if (diagnostics.length > 0) {
    throw new GeoSpecAssertionError(diagnostics);
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

const fullTestName = (test: Pick<GeoSpecTestCase, 'suite' | 'name'>): string => [...test.suite, test.name].join(' > ');

/**
 * Create a collector used by the embedded GeoSpec runner.
 *
 * @returns A fresh collector instance.
 */
export const createCollector = (): GeoSpecCollector => {
  const suite: string[] = [];
  const tests: GeoSpecTestCase[] = [];
  const definitionPending: Array<Promise<unknown>> = [];
  const scheduled: Array<{ test: GeoSpecTestCase; function_: GeoSpecTestFunction }> = [];
  const pendingAssertions = new WeakMap<GeoSpecTestCase, Array<Promise<void>>>();
  let activeTest: GeoSpecTestCase | undefined;
  let executed = false;

  const trackDefinitionPending = (
    operation: PromiseLike<unknown>,
    handlers: {
      onError(error: unknown): void;
      onFinally(): void;
    },
  ): void => {
    definitionPending.push(
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

  const recordAsyncAssertion = (
    test: GeoSpecTestCase,
    assertion: GeoSpecAssertion,
    evaluate: () => Promise<GeometryDiagnostic[]>,
  ): GeoSpecAssertion => {
    const pending = (async () => {
      const diagnostics = await evaluate();
      assertion.passed = diagnostics.length === 0;
      assertion.diagnostics = diagnostics;
      if (diagnostics.length > 0) {
        throw new GeoSpecAssertionError(diagnostics);
      }
    })();
    const existing = pendingAssertions.get(test) ?? [];
    existing.push(pending);
    pendingAssertions.set(test, existing);
    return assertion;
  };

  return {
    describe(name, function_) {
      suite.push(name);
      try {
        const result = function_();
        if (isPromiseLike(result)) {
          const capturedSuite = [...suite];
          trackDefinitionPending(result, {
            onError(error) {
              tests.push({
                suite: capturedSuite,
                name,
                assertions: [],
                status: 'failed',
                diagnostics: createErrorDiagnostics(error),
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
          diagnostics: createErrorDiagnostics(error),
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
      scheduled.push({ test, function_ });
    },

    itSkip(name) {
      recordSkipped(name);
    },

    expectGeo(subject) {
      return {
        toHaveBoundingBox(first, second) {
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

        toHaveNoComponentOverlap(expected) {
          if (!isGeoSpecTestCase(activeTest)) {
            throw new Error('expectGeo() must be called inside it().');
          }

          const normalizedExpected = expected ?? {};
          const assertion: GeoSpecAssertion = {
            kind: 'componentOverlap',
            subject,
            expected: normalizedExpected,
          };
          activeTest.assertions.push(assertion);
          const validationDiagnostics = validateComponentOverlapExpectation(normalizedExpected);
          if (validationDiagnostics.length > 0) {
            return recordAssertion(assertion, validationDiagnostics);
          }
          return recordAsyncAssertion(activeTest, assertion, async () =>
            evaluateComponentOverlap(subject, normalizedExpected),
          );
        },

        toHaveSurfaceArea(expected) {
          if (!isGeoSpecTestCase(activeTest)) {
            throw new Error('expectGeo() must be called inside it().');
          }

          const assertion: GeoSpecAssertion = { kind: 'surfaceArea', subject, expected };
          activeTest.assertions.push(assertion);
          const accepted =
            '{ value: number | { greaterThan?: number }, tolerance?: number, evidence?: "auto" | "mesh" | "brep" }';
          const objectDiagnostics = validateObjectExpectation({
            matcher: 'toHaveSurfaceArea',
            expected,
            allowed: ['value', 'tolerance', 'evidence'],
            required: ['value'],
            accepted,
          });
          const fieldDiagnostics = isRecord(expected)
            ? [
                ...validateNumericExpectation({
                  matcher: 'toHaveSurfaceArea',
                  path: '$.value',
                  expected: expected.value,
                  accepted,
                }),
                ...validateFiniteNumberField({ matcher: 'toHaveSurfaceArea', expected, field: 'tolerance', accepted }),
              ]
            : [];
          return recordValidatedAssertion(assertion, [...objectDiagnostics, ...fieldDiagnostics], () =>
            evaluateSurfaceArea(subject, expected),
          );
        },

        toHaveVolume(expected) {
          if (!isGeoSpecTestCase(activeTest)) {
            throw new Error('expectGeo() must be called inside it().');
          }

          const assertion: GeoSpecAssertion = { kind: 'volume', subject, expected };
          activeTest.assertions.push(assertion);
          const accepted =
            '{ value: number | { lessThan?: number }, tolerance?: number, evidence?: "auto" | "mesh" | "brep" }';
          const objectDiagnostics = validateObjectExpectation({
            matcher: 'toHaveVolume',
            expected,
            allowed: ['value', 'tolerance', 'evidence'],
            required: ['value'],
            accepted,
          });
          const fieldDiagnostics = isRecord(expected)
            ? [
                ...validateNumericExpectation({
                  matcher: 'toHaveVolume',
                  path: '$.value',
                  expected: expected.value,
                  accepted,
                }),
                ...validateFiniteNumberField({ matcher: 'toHaveVolume', expected, field: 'tolerance', accepted }),
              ]
            : [];
          return recordValidatedAssertion(assertion, [...objectDiagnostics, ...fieldDiagnostics], () =>
            evaluateVolume(subject, expected),
          );
        },

        toHaveMass(expected) {
          if (!isGeoSpecTestCase(activeTest)) {
            throw new Error('expectGeo() must be called inside it().');
          }

          const assertion: GeoSpecAssertion = { kind: 'mass', subject, expected };
          activeTest.assertions.push(assertion);
          const accepted =
            '{ value: number | { greaterThan?: number }, density?: number, tolerance?: number, evidence?: "auto" | "mesh" | "brep" }';
          const objectDiagnostics = validateObjectExpectation({
            matcher: 'toHaveMass',
            expected,
            allowed: ['value', 'density', 'tolerance', 'evidence'],
            required: ['value'],
            accepted,
          });
          const fieldDiagnostics = isRecord(expected)
            ? [
                ...validateNumericExpectation({
                  matcher: 'toHaveMass',
                  path: '$.value',
                  expected: expected.value,
                  accepted,
                }),
                ...validateFiniteNumberField({ matcher: 'toHaveMass', expected, field: 'density', accepted }),
                ...validateFiniteNumberField({ matcher: 'toHaveMass', expected, field: 'tolerance', accepted }),
              ]
            : [];
          return recordValidatedAssertion(assertion, [...objectDiagnostics, ...fieldDiagnostics], () =>
            evaluateMass(subject, expected),
          );
        },

        toHaveCenterOfMass(expected) {
          if (!isGeoSpecTestCase(activeTest)) {
            throw new Error('expectGeo() must be called inside it().');
          }

          const assertion: GeoSpecAssertion = { kind: 'centerOfMass', subject, expected };
          activeTest.assertions.push(assertion);
          const accepted =
            '{ point: { x?: number, y?: number, z?: number }, tolerance?: number, evidence?: "auto" | "mesh" | "brep" }';
          const objectDiagnostics = validateObjectExpectation({
            matcher: 'toHaveCenterOfMass',
            expected,
            allowed: ['point', 'tolerance', 'evidence'],
            required: ['point'],
            accepted,
          });
          const fieldDiagnostics = isRecord(expected)
            ? [
                ...validatePointExpectation({
                  matcher: 'toHaveCenterOfMass',
                  path: '$.point',
                  expected: expected.point,
                  accepted,
                }),
                ...validateFiniteNumberField({ matcher: 'toHaveCenterOfMass', expected, field: 'tolerance', accepted }),
              ]
            : [];
          return recordValidatedAssertion(assertion, [...objectDiagnostics, ...fieldDiagnostics], () =>
            evaluateCenterOfMass(subject, expected),
          );
        },

        toHaveChamferDistanceTo(reference, expected) {
          if (!isGeoSpecTestCase(activeTest)) {
            throw new Error('expectGeo() must be called inside it().');
          }

          const assertion: GeoSpecAssertion = { kind: 'chamferDistance', subject, expected };
          activeTest.assertions.push(assertion);
          const accepted =
            '{ mean?: number | { lessThan?: number }, max?: number | { lessThan?: number }, p95?: number | { lessThan?: number }, samples?: number, seed?: number }';
          return recordValidatedAssertion(assertion, validateChamferDistanceExpectation(expected, accepted), () =>
            evaluateChamferDistance(subject, reference, expected),
          );
        },

        toHaveHausdorffDistanceTo(reference, expected) {
          if (!isGeoSpecTestCase(activeTest)) {
            throw new Error('expectGeo() must be called inside it().');
          }

          const assertion: GeoSpecAssertion = { kind: 'hausdorffDistance', subject, expected };
          activeTest.assertions.push(assertion);
          const accepted =
            '{ value: number | { lessThanOrEqual?: number }, samples?: number, seed?: number, tolerance?: number }';
          return recordValidatedAssertion(
            assertion,
            validateMinimumDistanceExpectation('toHaveHausdorffDistanceTo', expected, accepted),
            () =>
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
          if (!isGeoSpecTestCase(activeTest)) {
            throw new Error('expectGeo() must be called inside it().');
          }

          const assertion: GeoSpecAssertion = { kind: 'minimumDistance', subject, expected };
          activeTest.assertions.push(assertion);
          const accepted =
            '{ value: number | { greaterThanOrEqual?: number }, samples?: number, seed?: number, tolerance?: number }';
          return recordValidatedAssertion(
            assertion,
            validateMinimumDistanceExpectation('toHaveMinimumDistanceTo', expected, accepted),
            () =>
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
          if (!isGeoSpecTestCase(activeTest)) {
            throw new Error('expectGeo() must be called inside it().');
          }

          const assertion: GeoSpecAssertion = { kind: 'validBrep', subject, expected: true };
          activeTest.assertions.push(assertion);
          return recordAssertion(assertion, evaluateValidBrep(subject));
        },

        toHaveTopologyCounts(expected) {
          if (!isGeoSpecTestCase(activeTest)) {
            throw new Error('expectGeo() must be called inside it().');
          }

          const assertion: GeoSpecAssertion = { kind: 'topologyCounts', subject, expected };
          activeTest.assertions.push(assertion);
          const accepted =
            '{ faces?: number | { greaterThan?: number }, edges?: number, solids?: number, tolerance?: number }';
          const objectDiagnostics = validateObjectExpectation({
            matcher: 'toHaveTopologyCounts',
            expected,
            allowed: ['vertices', 'edges', 'wires', 'faces', 'shells', 'solids', 'compounds', 'tolerance'],
            accepted,
          });
          const fieldDiagnostics = isRecord(expected)
            ? [
                ...(['vertices', 'edges', 'wires', 'faces', 'shells', 'solids', 'compounds'] as const).flatMap(
                  (field) =>
                    expected[field] === undefined
                      ? []
                      : validateNumericExpectation({
                          matcher: 'toHaveTopologyCounts',
                          path: `$.${field}`,
                          expected: expected[field],
                          accepted,
                        }),
                ),
                ...validateFiniteNumberField({
                  matcher: 'toHaveTopologyCounts',
                  expected,
                  field: 'tolerance',
                  accepted,
                }),
              ]
            : [];
          return recordValidatedAssertion(assertion, [...objectDiagnostics, ...fieldDiagnostics], () =>
            evaluateTopologyCounts(subject, expected),
          );
        },

        toHaveStepUnits(expected) {
          if (!isGeoSpecTestCase(activeTest)) {
            throw new Error('expectGeo() must be called inside it().');
          }

          const assertion: GeoSpecAssertion = { kind: 'stepUnits', subject, expected };
          activeTest.assertions.push(assertion);
          const accepted = '{ unit: string }';
          const objectDiagnostics = validateObjectExpectation({
            matcher: 'toHaveStepUnits',
            expected,
            allowed: ['unit'],
            required: ['unit'],
            accepted,
          });
          const fieldDiagnostics = isRecord(expected)
            ? validateStringField({ matcher: 'toHaveStepUnits', expected, field: 'unit', accepted })
            : [];
          return recordValidatedAssertion(assertion, [...objectDiagnostics, ...fieldDiagnostics], () =>
            evaluateStepUnits(subject, expected),
          );
        },

        toHaveProductStructure(expected) {
          if (!isGeoSpecTestCase(activeTest)) {
            throw new Error('expectGeo() must be called inside it().');
          }

          const assertion: GeoSpecAssertion = { kind: 'productStructure', subject, expected };
          activeTest.assertions.push(assertion);
          const accepted = '{ names?: string[], count?: number | { greaterThan?: number } }';
          const objectDiagnostics = validateObjectExpectation({
            matcher: 'toHaveProductStructure',
            expected,
            allowed: ['names', 'count'],
            accepted,
          });
          const fieldDiagnostics = isRecord(expected)
            ? [
                ...(expected.count === undefined
                  ? []
                  : validateNumericExpectation({
                      matcher: 'toHaveProductStructure',
                      path: '$.count',
                      expected: expected.count,
                      accepted,
                    })),
                ...(expected.names === undefined ||
                (Array.isArray(expected.names) && expected.names.every((name) => typeof name === 'string'))
                  ? []
                  : [
                      invalidExpectationDiagnostic({
                        matcher: 'toHaveProductStructure',
                        path: '$.names',
                        message: 'expected names to be a string array.',
                        expected: expected.names,
                        accepted,
                      }),
                    ]),
              ]
            : [];
          return recordValidatedAssertion(assertion, [...objectDiagnostics, ...fieldDiagnostics], () =>
            evaluateProductStructure(subject, expected),
          );
        },

        toHavePlanarFace(expected) {
          if (!isGeoSpecTestCase(activeTest)) {
            throw new Error('expectGeo() must be called inside it().');
          }

          const assertion: GeoSpecAssertion = { kind: 'planarFace', subject, expected };
          activeTest.assertions.push(assertion);
          const accepted =
            '{ normal: { x?: number, y?: number, z?: number }, offset: number, area?: number | { greaterThan?: number }, tolerance?: number }';
          const objectDiagnostics = validateObjectExpectation({
            matcher: 'toHavePlanarFace',
            expected,
            allowed: ['normal', 'offset', 'area', 'tolerance'],
            required: ['normal', 'offset'],
            accepted,
          });
          const fieldDiagnostics = isRecord(expected)
            ? [
                ...validatePointExpectation({
                  matcher: 'toHavePlanarFace',
                  path: '$.normal',
                  expected: expected.normal,
                  accepted,
                }),
                ...validateFiniteNumberField({ matcher: 'toHavePlanarFace', expected, field: 'offset', accepted }),
                ...validateFiniteNumberField({ matcher: 'toHavePlanarFace', expected, field: 'tolerance', accepted }),
                ...(expected.area === undefined
                  ? []
                  : validateNumericExpectation({
                      matcher: 'toHavePlanarFace',
                      path: '$.area',
                      expected: expected.area,
                      accepted,
                    })),
              ]
            : [];
          return recordValidatedAssertion(assertion, [...objectDiagnostics, ...fieldDiagnostics], () =>
            evaluatePlanarFace(subject, expected),
          );
        },

        toHaveCylindricalFace(expected) {
          if (!isGeoSpecTestCase(activeTest)) {
            throw new Error('expectGeo() must be called inside it().');
          }

          const assertion: GeoSpecAssertion = { kind: 'cylindricalFace', subject, expected };
          activeTest.assertions.push(assertion);
          const accepted = "{ radius: number, axis: 'x' | 'y' | 'z', tolerance?: number }";
          const objectDiagnostics = validateObjectExpectation({
            matcher: 'toHaveCylindricalFace',
            expected,
            allowed: ['radius', 'axis', 'tolerance'],
            required: ['radius', 'axis'],
            accepted,
          });
          const fieldDiagnostics = isRecord(expected)
            ? [
                ...validateFiniteNumberField({ matcher: 'toHaveCylindricalFace', expected, field: 'radius', accepted }),
                ...validateFiniteNumberField({
                  matcher: 'toHaveCylindricalFace',
                  expected,
                  field: 'tolerance',
                  accepted,
                }),
                ...validateAxisField({ matcher: 'toHaveCylindricalFace', expected, accepted }),
              ]
            : [];
          return recordValidatedAssertion(assertion, [...objectDiagnostics, ...fieldDiagnostics], () =>
            evaluateCylindricalFace(subject, expected),
          );
        },

        toHaveCircularHole(expected) {
          if (!isGeoSpecTestCase(activeTest)) {
            throw new Error('expectGeo() must be called inside it().');
          }

          const assertion: GeoSpecAssertion = { kind: 'circularHole', subject, expected };
          activeTest.assertions.push(assertion);
          const accepted =
            "{ diameter: number, through?: boolean, axis?: 'x' | 'y' | 'z', center?: { x?: number, y?: number, z?: number }, tolerance?: number }";
          const objectDiagnostics = validateObjectExpectation({
            matcher: 'toHaveCircularHole',
            expected,
            allowed: ['diameter', 'through', 'axis', 'center', 'tolerance'],
            required: ['diameter'],
            accepted,
          });
          const fieldDiagnostics = isRecord(expected)
            ? [
                ...validateFiniteNumberField({ matcher: 'toHaveCircularHole', expected, field: 'diameter', accepted }),
                ...validateFiniteNumberField({ matcher: 'toHaveCircularHole', expected, field: 'tolerance', accepted }),
                ...validateBooleanField({
                  matcher: 'toHaveCircularHole',
                  expected,
                  field: 'through',
                  accepted,
                  optional: true,
                }),
                ...validateAxisField({ matcher: 'toHaveCircularHole', expected, accepted, optional: true }),
                ...validatePointExpectation({
                  matcher: 'toHaveCircularHole',
                  path: '$.center',
                  expected: expected.center,
                  accepted,
                  optional: true,
                }),
              ]
            : [];
          return recordValidatedAssertion(assertion, [...objectDiagnostics, ...fieldDiagnostics], () =>
            evaluateCircularHole(subject, expected),
          );
        },

        toHaveCircularHolePattern(expected) {
          if (!isGeoSpecTestCase(activeTest)) {
            throw new Error('expectGeo() must be called inside it().');
          }

          const assertion: GeoSpecAssertion = { kind: 'circularHolePattern', subject, expected };
          activeTest.assertions.push(assertion);
          const accepted =
            "{ count: number, holeDiameter: number, boltCircleDiameter?: number, axis?: 'x' | 'y' | 'z', center?: { x?: number, y?: number, z?: number }, tolerance?: number }";
          const objectDiagnostics = validateObjectExpectation({
            matcher: 'toHaveCircularHolePattern',
            expected,
            allowed: ['count', 'holeDiameter', 'boltCircleDiameter', 'axis', 'center', 'tolerance'],
            required: ['count', 'holeDiameter'],
            accepted,
          });
          const fieldDiagnostics = isRecord(expected)
            ? [
                ...validatePositiveIntegerField({
                  matcher: 'toHaveCircularHolePattern',
                  expected,
                  field: 'count',
                  accepted,
                }),
                ...validateFiniteNumberField({
                  matcher: 'toHaveCircularHolePattern',
                  expected,
                  field: 'holeDiameter',
                  accepted,
                }),
                ...validateFiniteNumberField({
                  matcher: 'toHaveCircularHolePattern',
                  expected,
                  field: 'boltCircleDiameter',
                  accepted,
                }),
                ...validateFiniteNumberField({
                  matcher: 'toHaveCircularHolePattern',
                  expected,
                  field: 'tolerance',
                  accepted,
                }),
                ...validateAxisField({
                  matcher: 'toHaveCircularHolePattern',
                  expected,
                  accepted,
                  optional: true,
                }),
                ...validatePointExpectation({
                  matcher: 'toHaveCircularHolePattern',
                  path: '$.center',
                  expected: expected.center,
                  accepted,
                  optional: true,
                }),
              ]
            : [];
          return recordValidatedAssertion(assertion, [...objectDiagnostics, ...fieldDiagnostics], () =>
            evaluateCircularHolePattern(subject, expected),
          );
        },

        toHaveChamferFeature(expected) {
          if (!isGeoSpecTestCase(activeTest)) {
            throw new Error('expectGeo() must be called inside it().');
          }

          const assertion: GeoSpecAssertion = { kind: 'chamferFeature', subject, expected };
          activeTest.assertions.push(assertion);
          const accepted = '{ distance: number, selection?: string, tolerance?: number }';
          const objectDiagnostics = validateObjectExpectation({
            matcher: 'toHaveChamferFeature',
            expected,
            allowed: ['distance', 'selection', 'tolerance'],
            required: ['distance'],
            accepted,
          });
          const fieldDiagnostics = isRecord(expected)
            ? [
                ...validateFiniteNumberField({
                  matcher: 'toHaveChamferFeature',
                  expected,
                  field: 'distance',
                  accepted,
                }),
                ...validateStringField({
                  matcher: 'toHaveChamferFeature',
                  expected,
                  field: 'selection',
                  accepted,
                  optional: true,
                }),
                ...validateFiniteNumberField({
                  matcher: 'toHaveChamferFeature',
                  expected,
                  field: 'tolerance',
                  accepted,
                }),
              ]
            : [];
          return recordValidatedAssertion(assertion, [...objectDiagnostics, ...fieldDiagnostics], () =>
            evaluateChamferFeature(subject, expected),
          );
        },

        toHaveFilletFeature(expected) {
          if (!isGeoSpecTestCase(activeTest)) {
            throw new Error('expectGeo() must be called inside it().');
          }

          const assertion: GeoSpecAssertion = { kind: 'filletFeature', subject, expected };
          activeTest.assertions.push(assertion);
          const accepted = '{ radius: number, selection?: string, tolerance?: number }';
          const objectDiagnostics = validateObjectExpectation({
            matcher: 'toHaveFilletFeature',
            expected,
            allowed: ['radius', 'selection', 'tolerance'],
            required: ['radius'],
            accepted,
          });
          const fieldDiagnostics = isRecord(expected)
            ? [
                ...validateFiniteNumberField({ matcher: 'toHaveFilletFeature', expected, field: 'radius', accepted }),
                ...validateStringField({
                  matcher: 'toHaveFilletFeature',
                  expected,
                  field: 'selection',
                  accepted,
                  optional: true,
                }),
                ...validateFiniteNumberField({
                  matcher: 'toHaveFilletFeature',
                  expected,
                  field: 'tolerance',
                  accepted,
                }),
              ]
            : [];
          return recordValidatedAssertion(assertion, [...objectDiagnostics, ...fieldDiagnostics], () =>
            evaluateFilletFeature(subject, expected),
          );
        },

        toHaveMinimumWallThickness(expected) {
          if (!isGeoSpecTestCase(activeTest)) {
            throw new Error('expectGeo() must be called inside it().');
          }

          const assertion: GeoSpecAssertion = { kind: 'minimumWallThickness', subject, expected };
          activeTest.assertions.push(assertion);
          const accepted = '{ value: number | { greaterThanOrEqual?: number }, tolerance?: number }';
          const objectDiagnostics = validateObjectExpectation({
            matcher: 'toHaveMinimumWallThickness',
            expected,
            allowed: ['value', 'tolerance'],
            required: ['value'],
            accepted,
          });
          const fieldDiagnostics = isRecord(expected)
            ? [
                ...validateNumericExpectation({
                  matcher: 'toHaveMinimumWallThickness',
                  path: '$.value',
                  expected: expected.value,
                  accepted,
                }),
                ...validateFiniteNumberField({
                  matcher: 'toHaveMinimumWallThickness',
                  expected,
                  field: 'tolerance',
                  accepted,
                }),
              ]
            : [];
          return recordValidatedAssertion(assertion, [...objectDiagnostics, ...fieldDiagnostics], () =>
            evaluateMinimumWallThickness(subject, expected),
          );
        },
      };
    },

    async waitForCompletion(testTimeout, testNamePattern) {
      if (executed) {
        return;
      }
      executed = true;
      await withTimeout(Promise.allSettled(definitionPending), testTimeout);
      const normalizedPattern = testNamePattern?.toLowerCase();
      for (const scheduledTest of scheduled) {
        if (normalizedPattern && !fullTestName(scheduledTest.test).toLowerCase().includes(normalizedPattern)) {
          continue;
        }

        const previousTest = activeTest;
        activeTest = scheduledTest.test;
        try {
          // oxlint-disable-next-line no-await-in-loop -- GeoSpec CAD tests run serially so model-loader state and native resources cannot cross-wire.
          await withTimeout(Promise.resolve(scheduledTest.function_()), testTimeout);
          // oxlint-disable-next-line no-await-in-loop -- Assertions must settle before the next CAD test mutates runner bindings.
          await withTimeout(Promise.all(pendingAssertions.get(scheduledTest.test) ?? []), testTimeout);
        } catch (error) {
          scheduledTest.test.status = 'failed';
          scheduledTest.test.diagnostics.push(...createErrorDiagnostics(error));
        } finally {
          activeTest = previousTest;
        }
      }
    },

    tests,
  };
};

/**
 * Clear runner globals after a module finishes.
 */
export const clearCollectorGlobals = (): void => {
  Reflect.deleteProperty(geospecGlobal, collectorGlobalKey);
};

/**
 * Install a collector into the current JavaScript global scope.
 *
 * @param collector - Collector for the active run.
 */
export const installCollector = (collector: GeoSpecCollector): void => {
  geospecGlobal[collectorGlobalKey] = collector;
};
