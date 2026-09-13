import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

/**
 * Read-only projections of the hash-bound persisted route files. Opaque fields
 * remain on the original objects and are serialized unchanged into the matrix.
 * Reuse the harness/native types for the fields consumed by this summary.
 * @typedef {import('./corpus.mjs').AuthoringMap} AuthoringMap
 * @typedef {import('./corpus.mjs').ByteRecord} ByteRecord
 * @typedef {import('./corpus.mjs').Comparison} Comparison
 * @typedef {{id: string, route: string, routeState?: string, admission?: unknown, report?: {canonicalClaim: ByteRecord, canonicalPlan: ByteRecord, canonicalResult: ByteRecord, status: string} | null, error?: {isProtocolError?: boolean, protocolErrorName?: string | null} | null, comparison?: {directRouteEqual?: boolean | null, independentOracle?: Partial<Comparison['independentOracle']>}}} RouteRow
 * @typedef {{id: string, capability: string, reason: string}} SurfaceGap
 * @typedef {{rows: RouteRow[], ancillaryGaps: SurfaceGap[], directWallRows: {id: string, admission: unknown, error: unknown, canonicalResult: ByteRecord | null}[], typedAssertionGaps: {id: string, status: string}[]}} RouteFile
 */

/** @type {(name: string) => string} */
const requiredEnvironment = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
};
/** @type {(path: string) => unknown} */
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
/** @type {(path: string, value: unknown) => void} */
const writeJson = (path, value) => {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
};
/** @type {<Row extends {id: string}>(rows: Row[]) => Map<string, Row>} */
const indexRows = (rows) => new Map(rows.map((row) => [row.id, row]));
/** @type {(values: string[]) => Record<string, number>} */
const countBy = (values) =>
  Object.fromEntries(
    [...new Set(values)]
      .sort((left, right) => left.localeCompare(right))
      .map((value) => [value, values.filter((candidate) => candidate === value).length]),
  );

const map = /** @type {AuthoringMap} */ (readJson(requiredEnvironment('GEOSPEC_AUTHORING_MAP')));
const standalone = /** @type {RouteFile} */ (readJson(requiredEnvironment('GEOSPEC_STANDALONE_OUTPUT')));
const vitest = /** @type {RouteFile} */ (readJson(requiredEnvironment('GEOSPEC_VITEST_OUTPUT')));
const python313 = /** @type {RouteFile} */ (readJson(requiredEnvironment('GEOSPEC_PYTHON313_OUTPUT')));
const python314 = /** @type {RouteFile} */ (readJson(requiredEnvironment('GEOSPEC_PYTHON314_OUTPUT')));
const standaloneRows = indexRows(standalone.rows);
const vitestRows = indexRows(vitest.rows);
const python313Rows = indexRows(python313.rows);
const python314Rows = indexRows(python314.rows);
const matcherIds = new Set(map.rows.filter((row) => row.matcher).map((row) => row.id));
const standaloneGaps = indexRows(standalone.ancillaryGaps);
const vitestGaps = indexRows(vitest.ancillaryGaps);
const directWall = indexRows(standalone.directWallRows);

/** @type {(outcome: RouteRow | null, gap?: SurfaceGap | null) => string} */
const state = (outcome, gap) => {
  if (gap) {
    return 'absent-public-surface';
  }
  if (/** @type {!RouteRow} */ (outcome).routeState === 'admission-error') {
    return 'admission-error';
  }
  if (/** @type {!RouteRow} */ (outcome).routeState === 'ancillary-evaluate-probe') {
    return 'public-surface-error';
  }
  if (/** @type {!RouteRow} */ (outcome).report) {
    return /** @type {!NonNullable<RouteRow['report']>} */ (/** @type {!RouteRow} */ (outcome).report).status;
  }
  if (
    /** @type {!boolean} */ (/** @type {!RouteRow} */ (outcome).error?.isProtocolError) ||
    /** @type {!RouteRow} */ (outcome).error?.protocolErrorName === 'ProtocolError'
  ) {
    return 'protocol-error';
  }
  return /** @type {!RouteRow} */ (outcome).error ? 'error' : 'missing';
};

/** @type {(outcomes: (RouteRow | null)[], field: 'canonicalClaim' | 'canonicalPlan' | 'canonicalResult') => boolean} */
const reportBytesEqual = (outcomes, field) => {
  const records = /** @type {ByteRecord[]} */ (outcomes.map((outcome) => outcome?.report?.[field]).filter(Boolean));
  return records.length === outcomes.length && new Set(records.map((record) => record.utf8)).size === 1;
};

const matrixRows = map.rows.map((row) => {
  const jsStandalone = standaloneRows.get(row.id) ?? null;
  const jsVitest = vitestRows.get(row.id) ?? null;
  const py313 = python313Rows.get(row.id);
  const py314 = python314Rows.get(row.id);
  const jsStandaloneGap = standaloneGaps.get(row.id) ?? null;
  const jsVitestGap = vitestGaps.get(row.id) ?? null;
  assert.ok(py313 && py314);
  const publicOutcomes = row.matcher ? [jsStandalone, jsVitest, py313, py314] : [];
  return {
    id: row.id,
    block: row.block,
    capability: row.capability,
    polarity: row.polarity,
    matcher: row.matcher,
    directBaseline: row.frozenDirectB19 ?? directWall.get(row.id) ?? null,
    routes: {
      javascriptStandalone: jsStandalone ?? { gap: jsStandaloneGap },
      javascriptVitest: jsVitest ?? { gap: jsVitestGap },
      python313: py313,
      python314: py314,
    },
    routeStates: {
      javascriptStandalone: state(jsStandalone, jsStandaloneGap),
      javascriptVitest: state(jsVitest, jsVitestGap),
      python313: state(py313),
      python314: state(py314),
    },
    crossPublicCanonicalBytes: row.matcher
      ? {
          allFourReportsPresent: publicOutcomes.every((outcome) => outcome?.report),
          canonicalClaimAllEqual: reportBytesEqual(publicOutcomes, 'canonicalClaim'),
          canonicalPlanAllEqual: reportBytesEqual(publicOutcomes, 'canonicalPlan'),
          canonicalResultAllEqual: reportBytesEqual(publicOutcomes, 'canonicalResult'),
        }
      : null,
  };
});

/** @type {(rows: RouteRow[], gaps?: SurfaceGap[]) => {rows: number, gaps: number, states: Record<string, number>, completeReports: number, directBaseline: {matcherEqual: number, matcherUnequal: number, matcherUnbound: number, ancillaryEqual: number, ancillaryUnequal: number}, independentOracle: {canonicalClaimEqual: number, canonicalPlanEqual: number, canonicalResultEqual: number}}} */
const routeSummary = (rows, gaps = []) => ({
  rows: rows.length,
  gaps: gaps.length,
  states: countBy([...rows.map((row) => state(row)), ...gaps.map(() => 'absent-public-surface')]),
  completeReports: rows.filter((row) => row.report).length,
  directBaseline: {
    matcherEqual: rows.filter((row) => matcherIds.has(row.id) && row.comparison?.directRouteEqual === true).length,
    matcherUnequal: rows.filter((row) => matcherIds.has(row.id) && row.comparison?.directRouteEqual === false).length,
    matcherUnbound: rows.filter(
      (row) =>
        matcherIds.has(row.id) &&
        (row.comparison?.directRouteEqual === null || row.comparison?.directRouteEqual === undefined),
    ).length,
    ancillaryEqual: rows.filter((row) => !matcherIds.has(row.id) && row.comparison?.directRouteEqual === true).length,
    ancillaryUnequal: rows.filter((row) => !matcherIds.has(row.id) && row.comparison?.directRouteEqual === false)
      .length,
  },
  independentOracle: {
    canonicalClaimEqual: rows.filter((row) => row.comparison?.independentOracle?.canonicalClaimEqual === true).length,
    canonicalPlanEqual: rows.filter((row) => row.comparison?.independentOracle?.canonicalPlanEqual === true).length,
    canonicalResultEqual: rows.filter((row) => row.comparison?.independentOracle?.canonicalResultEqual === true).length,
  },
});

const familyCoverage = [...new Set(map.rows.filter((row) => row.matcher).map((row) => row.capability))]
  .sort((left, right) => left.localeCompare(right))
  .map((capability) => {
    const rows = matrixRows.filter((row) => row.capability === capability);
    return {
      capability,
      rows: rows.length,
      positiveRows: rows.filter((row) => row.polarity === 'positive').length,
      negativeRows: rows.filter((row) => row.polarity === 'negative').length,
      bothPolarities:
        rows.some((row) => row.polarity === 'positive') && rows.some((row) => row.polarity === 'negative'),
      refusalRows: {
        javascriptStandalone: rows.filter((row) => row.routeStates.javascriptStandalone === 'refused').length,
        javascriptVitest: rows.filter((row) => row.routeStates.javascriptVitest === 'refused').length,
        python313: rows.filter((row) => row.routeStates.python313 === 'refused').length,
        python314: rows.filter((row) => row.routeStates.python314 === 'refused').length,
      },
    };
  });

/**
 * The persisted matcher partition has route rows; ancillary gaps are outside it.
 * Optional route typing retains the original summary's optional access semantics.
 * @typedef {Omit<(typeof matrixRows)[number], 'crossPublicCanonicalBytes' | 'routes'> & {crossPublicCanonicalBytes: NonNullable<(typeof matrixRows)[number]['crossPublicCanonicalBytes']>, routes: {javascriptStandalone: RouteRow | null, javascriptVitest: RouteRow | null, python313: RouteRow, python314: RouteRow}}} MatcherMatrixRow
 */
const matcherRows = /** @type {MatcherMatrixRow[]} */ (matrixRows.filter((row) => row.matcher));
const unresolved = {
  ancillaryPublicSurface: matrixRows.filter((row) => !row.matcher).map((row) => row.id),
  wallAdmission: matrixRows
    .filter((row) => row.block === 'wall-interim' && Object.values(row.routeStates).includes('admission-error'))
    .map((row) => row.id),
  crossPublicCanonicalBytes: matcherRows
    .filter(
      (row) =>
        !row.crossPublicCanonicalBytes.canonicalClaimAllEqual ||
        !row.crossPublicCanonicalBytes.canonicalPlanAllEqual ||
        !row.crossPublicCanonicalBytes.canonicalResultAllEqual,
    )
    .map((row) => row.id),
  pythonDirectBaseline: matcherRows
    .filter(
      (row) =>
        row.routes.python313.comparison?.directRouteEqual === false ||
        row.routes.python314.comparison?.directRouteEqual === false,
    )
    .map((row) => row.id),
  independentOraclePlan: matcherRows
    .filter((row) => row.routes.javascriptStandalone?.comparison?.independentOracle?.canonicalPlanEqual === false)
    .map((row) => row.id),
  independentOracleResult: matcherRows
    .filter((row) => row.routes.javascriptStandalone?.comparison?.independentOracle?.canonicalResultEqual === false)
    .map((row) => row.id),
};

const summary = {
  schemaVersion: 1,
  taskId: map.taskId,
  qualification: 'interim-pre-CONTINUOUS02-only',
  scope: map.scope,
  routes: {
    javascriptStandalone: routeSummary(standalone.rows, standalone.ancillaryGaps),
    javascriptVitest: {
      ...routeSummary(vitest.rows, vitest.ancillaryGaps),
      typedAssertionGaps: vitest.typedAssertionGaps.length,
    },
    python313: routeSummary(python313.rows),
    python314: routeSummary(python314.rows),
  },
  parity: {
    allFourCanonicalReports: matcherRows.filter((row) => row.crossPublicCanonicalBytes.allFourReportsPresent).length,
    allFourCanonicalClaimBytesEqual: matcherRows.filter((row) => row.crossPublicCanonicalBytes.canonicalClaimAllEqual)
      .length,
    allFourCanonicalPlanBytesEqual: matcherRows.filter((row) => row.crossPublicCanonicalBytes.canonicalPlanAllEqual)
      .length,
    allFourCanonicalResultBytesEqual: matcherRows.filter((row) => row.crossPublicCanonicalBytes.canonicalResultAllEqual)
      .length,
    python313Python314ExactRowsIgnoringRouteName: python313.rows.filter(
      (row, index) =>
        JSON.stringify({ ...row, route: undefined }) === JSON.stringify({ ...python314.rows[index], route: undefined }),
    ).length,
  },
  directWall: {
    rows: standalone.directWallRows.length,
    admitted: standalone.directWallRows.filter((row) => row.admission).length,
    admissionErrors: standalone.directWallRows.filter((row) => !row.admission && row.error).length,
    completeResults: standalone.directWallRows.filter((row) => row.canonicalResult).length,
  },
  familyCoverage,
  unresolved,
  claims: {
    routeParityIsNotGeometryCorrectness: true,
    directCrossRouteEqualityDoesNotPromoteIndependentOracleFailures: true,
    wallRowsAreNotQualifiedContinuousWallAcceptance: true,
  },
};

writeJson(requiredEnvironment('GEOSPEC_ROUTE_MATRIX'), {
  schemaVersion: 1,
  taskId: map.taskId,
  rows: matrixRows,
});
writeJson(requiredEnvironment('GEOSPEC_SUMMARY'), summary);
writeJson(requiredEnvironment('GEOSPEC_UNMATCHED'), {
  schemaVersion: 1,
  taskId: map.taskId,
  categories: unresolved,
  rows: matrixRows.filter((row) => Object.values(unresolved).some((ids) => ids.includes(row.id))),
});
