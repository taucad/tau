/**
 * Project a GeoSpec runner result onto the compact `test_model` RPC shape.
 *
 * A `GeoSpecRunnerResult` holds the live geometry subject of every assertion,
 * so it is an in-process structure that must never cross a wire. This is the
 * projection that makes it transportable, and it is the same one whichever host
 * ran the tests.
 *
 * @module
 */

import type { RunGeoSpecTestsRpcResult } from '@taucad/chat';
import { geoSpecRunAccountingSchema, geoSpecRunLineageSchema } from '@taucad/chat/schemas/tools/test-model';
import { isRecord } from '@taucad/utils/schema';
import type { GeometryDiagnostic } from 'geospec/mesh';
import { geoSpecMeshEvidenceMatchers, geoSpecRegionWholeModelClaimCode } from 'geospec/model';
import { isGeoSpecTimeoutCode } from 'geospec/runner/worker';
import type { GeoSpecTestCase } from 'geospec/runner';
import type { GeoSpecRunnerFileResult, GeoSpecRunnerResult } from 'geospec/runner/worker';

type RunGeoSpecTestsSuccess = Extract<RunGeoSpecTestsRpcResult, { success: true }>;
type RunGeoSpecTestFailure = RunGeoSpecTestsSuccess['failures'][number];
type RunGeoSpecTestDiagnostic = NonNullable<RunGeoSpecTestFailure['diagnostics']>[number];
type RunGeoSpecReport = NonNullable<RunGeoSpecTestFailure['reports']>[number];
type RunGeoSpecLimit = NonNullable<RunGeoSpecTestFailure['limit']>;

const fullGeoSpecTestName = (test: GeoSpecTestCase): string => [...test.suite, test.name].join(' > ');

const runtimeIssueText = (issue: unknown): string | undefined => {
  if (!isRecord(issue) || typeof issue['message'] !== 'string') {
    return undefined;
  }

  const prefix = typeof issue['code'] === 'string' ? `Runtime issue ${issue['code']}: ` : 'Runtime issue: ';
  return `${prefix}${issue['message']}`;
};

const nestedDiagnosticText = (diagnostic: GeometryDiagnostic): readonly string[] => {
  const { details } = diagnostic;
  if (!isRecord(details)) {
    return [];
  }

  const nested = [details['issues'], details['diagnostics']].flatMap((value): unknown[] =>
    Array.isArray(value) ? value : [],
  );
  return nested.flatMap((issue) => {
    const text = runtimeIssueText(issue);
    return text ? [text] : [];
  });
};

const diagnosticText = (diagnostics: readonly GeometryDiagnostic[] | undefined): string | undefined => {
  if (!diagnostics || diagnostics.length === 0) {
    return undefined;
  }
  return diagnostics.flatMap((diagnostic) => [diagnostic.message, ...nestedDiagnosticText(diagnostic)]).join('\n');
};

const cloneDiagnosticVec3 = (
  vector: readonly [number, number, number],
): NonNullable<RunGeoSpecTestDiagnostic['spatial']>['min'] => [vector[0], vector[1], vector[2]];

const transportDiagnostics = (
  diagnostics: readonly GeometryDiagnostic[] | undefined,
): RunGeoSpecTestFailure['diagnostics'] =>
  diagnostics?.map((diagnostic) => ({
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    ...(diagnostic.suggestion === undefined ? {} : { suggestion: diagnostic.suggestion }),
    ...(diagnostic.spatial === undefined
      ? {}
      : {
          spatial: {
            ...(diagnostic.spatial.min === undefined ? {} : { min: cloneDiagnosticVec3(diagnostic.spatial.min) }),
            ...(diagnostic.spatial.max === undefined ? {} : { max: cloneDiagnosticVec3(diagnostic.spatial.max) }),
            ...(diagnostic.spatial.center === undefined
              ? {}
              : { center: cloneDiagnosticVec3(diagnostic.spatial.center) }),
          },
        }),
    ...(diagnostic.details === undefined ? {} : { details: structuredClone(diagnostic.details) }),
  }));

// Exact bytes cross the JSON boundary once; the record owner retains them before compact normalization.
const transportReports = (test: GeoSpecTestCase): RunGeoSpecReport[] | undefined => {
  const reports = test.assertions.flatMap((assertion): RunGeoSpecReport[] => {
    const { report } = assertion;
    if (report === undefined) {
      return [];
    }
    return [
      {
        claimId: report.claimId,
        status: report.status,
        polarity: report.polarity,
        claim: structuredClone(report.claim),
        result: structuredClone(report.result),
        diagnostics: report.diagnostics.map((diagnostic) => structuredClone(diagnostic)),
        ...(report.evidence === undefined ? {} : { evidence: structuredClone(report.evidence) }),
        ...(assertion.loadId === undefined ? {} : { loadId: assertion.loadId }),
        canonical: {
          claim: [...report.canonicalClaim],
          plan: [...report.canonicalPlan],
          result: [...report.canonicalResult],
        },
      },
    ];
  });
  return reports.length === 0 ? undefined : reports;
};

/** The `test_model` payload minus its success discriminant. @public */
export type TestModelOutput = Omit<RunGeoSpecTestsSuccess, 'success'>;

type TestRow = NonNullable<TestModelOutput['tests']>[number];
type PassRow = RunGeoSpecTestsSuccess['passes'][number];
type LineageRow = NonNullable<TestModelOutput['lineage']>[number];
type SourceRevisionRow = NonNullable<TestModelOutput['sourceRevisions']>[number];

/**
 * What the host knows about the kernel that evaluated one model source, so an
 * evidence refusal names a next step that kernel can take.
 *
 * @public
 */
export type GeoSpecKernelEvidence = {
  /** The kernel that evaluates the source. */
  readonly kernelId: string;
  /** True when that kernel offers a direct BRep STEP export route. */
  readonly directBrepStep: boolean;
};

/** Options for projecting runner results. @public */
export type GeoSpecProjectionOptions = {
  /** Whether the caller applied selection filters. */
  readonly filtersApplied?: boolean;
  /** Kernel facts by model source path, from the host's runtime routes. */
  readonly kernels?: ReadonlyMap<string, GeoSpecKernelEvidence>;
};

/** One test's projected rows. Skipped tests have only their test row. @public */
export type GeoSpecProjectedTest = {
  readonly test: TestRow;
  readonly failure?: RunGeoSpecTestFailure;
  readonly pass?: PassRow;
};

/** One settled file's projected rows and observed accounting. @public */
export type GeoSpecFileProjection = {
  readonly failures: RunGeoSpecTestFailure[];
  readonly passes: PassRow[];
  readonly tests: TestRow[];
  readonly lineage?: LineageRow;
  readonly sourceRevisions: SourceRevisionRow[];
  /** Observed test counts for this file, when the module reported them. */
  readonly counts?: GeoSpecTestCounts;
};

/** Observed per-file test counts, summed into run accounting. @public */
export type GeoSpecTestCounts = Pick<
  NonNullable<TestModelOutput['accounting']>,
  'discovered' | 'selected' | 'completed' | 'passed' | 'failed' | 'unsupported' | 'inconclusive' | 'skipped' | 'notRun'
>;

type FailureCategory = NonNullable<RunGeoSpecTestFailure['category']>;
type RunnerIssue = NonNullable<GeoSpecRunnerResult['issues']>[number];

const analysisLimitCodes = new Set(['GEOSPEC_ANALYSIS_LIMIT']);
const resourceLimitCodes = new Set(['GEOSPEC_RESOURCE_LIMIT', 'LIMIT_EXCEEDED', 'limit-exceeded']);
const workBudgetCodes = new Set(['MATCHER_TIMEOUT', 'GEOSPEC_WORK_BUDGET_EXHAUSTED']);
const evidenceCodes = new Set([
  'GEOSPEC_UNSUPPORTED_EVIDENCE',
  'GEOSPEC_EVIDENCE_UNSUPPORTED',
  'GEOSPEC_KERNEL_BREP_UNSUPPORTED',
  'GEOSPEC_DIRECT_STEP_ROUTE_REQUIRED',
  geoSpecRegionWholeModelClaimCode,
]);
const weakeningSuggestion =
  /\b(?:update|weaken|relax|loosen|remove|delete|drop|change)\b[^.]{0,60}\b(?:assertion|expectation|expected|tolerance|test)\b/iu;
/** Advice to reduce the design to fit a limit; a limit is met with resources, never less geometry. */
const reducingSuggestion =
  /\b(?:coarsen|coarser|shrink|crop|simplify|decimate)\b|\bsmaller (?:part|model|subject|export)\b|\blower (?:the )?resolution\b/iu;
const notDecided =
  'No `test_model` argument raises it; keep the model and assertion as designed and report the claim as not decided.';
const limitCategories: ReadonlySet<FailureCategory> = new Set(['analysis-limit', 'resource-limit', 'work-budget']);
/** The engine configuration key behind each noun of an engine "the configured <noun> limit is" refusal. */
const configuredLimitNames: ReadonlyMap<string, string> = new Map([
  ['binary subject', 'maxSubjectBytes'],
  ['binary resource', 'maxResourceBytes'],
  ['total binary', 'maxTotalBinaryBytes'],
  ['vertex', 'maxVertices'],
  ['triangle', 'maxTriangles'],
  ['occurrence', 'maxOccurrences'],
  ['retained subject', 'maxRetainedSubjects'],
  ['analysis retention', 'maxMeshBytes'],
  ['mesh entry', 'maxMeshEntries'],
]);
const configuredLimitNoun = /; the configured (?<noun>[a-z ]+) limit is /u;
/** The evidence an analysis refusal names before its verb, as in "Continuous evidence needs 35.6 MiB". */
const refusedEvidence = /^(?:the |this |a )?(?<evidence>[a-z][\w -]*?) (?:needs|is|has|exceeds?) /iu;

const meshMatchers = geoSpecMeshEvidenceMatchers.join(', ');

const diagnosticCodes = (diagnostic: GeometryDiagnostic): readonly string[] => {
  const nested = isRecord(diagnostic.details) ? diagnostic.details['code'] : undefined;
  return typeof nested === 'string' ? [diagnostic.code, nested] : [diagnostic.code];
};

const diagnosticCategory = (diagnostic: GeometryDiagnostic): FailureCategory | undefined => {
  const codes = diagnosticCodes(diagnostic);
  if (codes.some((code) => isGeoSpecTimeoutCode(code))) {
    return 'timeout';
  }
  if (codes.some((code) => analysisLimitCodes.has(code))) {
    return 'analysis-limit';
  }
  if (codes.some((code) => resourceLimitCodes.has(code))) {
    return 'resource-limit';
  }
  if (codes.some((code) => workBudgetCodes.has(code))) {
    return 'work-budget';
  }
  if (codes.some((code) => evidenceCodes.has(code))) {
    return 'unsupported-evidence';
  }
  if (codes.some((code) => code.startsWith('GEOSPEC_NATIVE_') || code.startsWith('GEOSPEC_MODEL_'))) {
    return 'model-load';
  }
  if (codes.includes('GEOSPEC_CANONICAL_EXPORT_UNSUPPORTED')) {
    return 'model-load';
  }
  return undefined;
};

/** Most specific first: a decided claim stands; then what keeps the claim undecided. */
const categoryPriority: readonly FailureCategory[] = [
  'geometry',
  'timeout',
  'resource-limit',
  'analysis-limit',
  'work-budget',
  'unsupported-evidence',
  'model-load',
  'infrastructure',
];

const failureCategory = (test: GeoSpecTestCase, diagnostics: readonly GeometryDiagnostic[]): FailureCategory => {
  const found = new Set<FailureCategory>();
  for (const diagnostic of diagnostics) {
    const category = diagnosticCategory(diagnostic);
    if (category !== undefined) {
      found.add(category);
    }
  }
  const decided = test.assertions.some(
    (assertion) =>
      assertion.report?.status === 'failed' ||
      (assertion.report === undefined &&
        assertion.passed === false &&
        !(assertion.diagnostics ?? []).some((diagnostic) => diagnosticCategory(diagnostic) !== undefined)),
  );
  if (decided && !diagnostics.some((diagnostic) => diagnostic.code === 'TEST_FAILED')) {
    found.add('geometry');
  }
  return categoryPriority.find((category) => found.has(category)) ?? 'infrastructure';
};

const keepsAssertion = (suggestion: string | undefined): suggestion is string =>
  suggestion !== undefined &&
  suggestion.trim() !== '' &&
  !weakeningSuggestion.test(suggestion) &&
  !reducingSuggestion.test(suggestion);

const evidenceSuggestion = (
  kernels: readonly GeoSpecKernelEvidence[],
  engineSuggestion: string | undefined,
): string => {
  const meshOnly = kernels.filter((kernel) => !kernel.directBrepStep);
  if (meshOnly.length > 0) {
    const names = meshOnly.map((kernel) => `'${kernel.kernelId}'`).join(', ');
    return `This matcher needs exact BRep evidence, and kernel ${names} has no direct STEP/BRep export route, so the matcher is unsupported on this kernel. Keep the requirement and report it as unsupported. Assert what a mesh can answer with the mesh-supported matchers: ${meshMatchers}.`;
  }
  if (kernels.length > 0) {
    return keepsAssertion(engineSuggestion)
      ? engineSuggestion
      : "Load the model with loadModel({ file, format: 'step' }) for exact BRep evidence and keep the assertion.";
  }
  const meshNote = `On a mesh-only kernel this matcher is unsupported; mesh-supported matchers are ${meshMatchers}.`;
  return keepsAssertion(engineSuggestion)
    ? `${engineSuggestion} ${meshNote}`
    : `Keep the assertion and load evidence that can answer it. ${meshNote}`;
};

/** One diagnostic with the step it refused: a claim's matcher and load, or the admission of a load that threw. */
type LimitEvidence = {
  readonly diagnostic: GeometryDiagnostic;
  readonly operation: string;
  readonly subject?: string;
};

const count = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;

const limitIdentifier = (words: string): string =>
  words
    .split(/[^a-z\d]+/iu)
    .filter((word) => word !== '')
    .map((word, index) =>
      index === 0 ? word.toLowerCase() : `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`,
    )
    .join('');

/**
 * Name a capacity limit the engine reports without a name: the configuration key its admission message names,
 * else the evidence its analysis message names, in the limit's unit.
 */
const limitName = (message: string, details: Readonly<Record<string, unknown>>, unit: string): string => {
  if (typeof details['name'] === 'string') {
    return details['name'];
  }
  const noun = configuredLimitNoun.exec(message)?.groups?.['noun'];
  const configured = noun === undefined ? undefined : configuredLimitNames.get(noun);
  if (configured !== undefined) {
    return configured;
  }
  const limitClass = typeof details['limitClass'] === 'string' ? details['limitClass'] : 'engine';
  return limitIdentifier(`${refusedEvidence.exec(message)?.groups?.['evidence'] ?? limitClass} ${unit}`);
};

const typedLimit = (category: FailureCategory, evidence: LimitEvidence): RunGeoSpecLimit | undefined => {
  const details: Readonly<Record<string, unknown>> = isRecord(evidence.diagnostic.details)
    ? evidence.diagnostic.details
    : {};
  const declared = count(details['limit']);
  const step = {
    operation: evidence.operation,
    ...(evidence.subject === undefined ? {} : { subject: evidence.subject }),
  };
  if (category === 'work-budget') {
    const maximum = count(details['maximumLimit']);
    if (declared === undefined || maximum === undefined) {
      return undefined;
    }
    const used = count(details['used']);
    return {
      kind: 'budget',
      name: 'workUnitLimit',
      declared,
      ...(used === undefined ? {} : { measured: used }),
      unit: 'work-units',
      ...step,
      // The budget is a ceiling, not a cost, so the host maximum is the one value that can still decide the claim.
      retry:
        declared < maximum && (used === undefined || used <= maximum)
          ? { parameter: 'workUnitLimit', value: maximum }
          : null,
      source: 'engine',
    };
  }
  const { unit } = details;
  if (typeof unit !== 'string') {
    return undefined;
  }
  const measured = count(details['required']);
  return {
    kind: 'capacity',
    name: limitName(evidence.diagnostic.message, details, unit),
    ...(declared === undefined ? {} : { declared }),
    ...(measured === undefined ? {} : { measured }),
    unit,
    ...step,
    retry: null,
    source: details['source'] === 'host' ? 'host' : 'engine',
  };
};

/** The typed limit behind a limit row: the first diagnostic of the row's category that reports one. */
const rowLimit = (category: FailureCategory, evidence: readonly LimitEvidence[]): RunGeoSpecLimit | undefined => {
  if (!limitCategories.has(category)) {
    return undefined;
  }
  for (const item of evidence) {
    const limit = diagnosticCategory(item.diagnostic) === category ? typedLimit(category, item) : undefined;
    if (limit !== undefined) {
      return limit;
    }
  }
  return undefined;
};

const capacitySuggestion = (category: FailureCategory, limit: RunGeoSpecLimit | undefined): string => {
  if (limit === undefined) {
    return `Not decided: the ${category === 'resource-limit' ? 'admission' : 'analysis'} limit the diagnostic names stops this claim. ${notDecided}`;
  }
  const usage =
    limit.declared === undefined
      ? ''
      : ` (${limit.declared} ${limit.unit}${limit.measured === undefined ? '' : `; this subject ${limit.measured}`})`;
  return `Not decided: ${limit.operation} needs more than ${limit.name}${usage}. ${notDecided}`;
};

const budgetSuggestion = (limit: RunGeoSpecLimit | undefined): string => {
  if (limit === undefined) {
    return 'Keep the assertion: the claim exhausted its deterministic work-unit budget (the diagnostic details give limit and used). Raise workUnitLimit for this claim (expectGeo or loadModel option, or test_model workUnitLimit for the whole run) or narrow its selection, then re-run.';
  }
  const usage = `(${limit.declared} work units${limit.measured === undefined ? '' : `; used ${limit.measured}`})`;
  return limit.retry === null
    ? `Not decided: ${limit.operation} needs more work units than this host allows ${usage}. ${notDecided}`
    : `Not decided: ${limit.operation} exhausted its work-unit budget ${usage}. Raise workUnitLimit to ${limit.retry.value} where this claim's budget is set (test_model for the run, or its loadModel or expectGeo option) and re-run; keep the assertion.`;
};

const categorySuggestion = (options: {
  readonly category: FailureCategory;
  readonly diagnostics: readonly GeometryDiagnostic[];
  readonly kernels: readonly GeoSpecKernelEvidence[];
  readonly limit: RunGeoSpecLimit | undefined;
}): string => {
  const { category, diagnostics, kernels, limit } = options;
  const own = diagnostics.find(
    (diagnostic) => diagnosticCategory(diagnostic) === category && keepsAssertion(diagnostic.suggestion),
  )?.suggestion;
  const any = diagnostics.find((diagnostic) => keepsAssertion(diagnostic.suggestion))?.suggestion;
  const regionScope = diagnostics.find((diagnostic) => diagnostic.code === geoSpecRegionWholeModelClaimCode);
  if (regionScope?.suggestion !== undefined) {
    return regionScope.suggestion;
  }
  switch (category) {
    case 'geometry': {
      return (
        any ??
        'Change the model so it meets this requirement, using the expected and actual values in the diagnostics. Keep the assertion and its tolerance.'
      );
    }
    case 'timeout': {
      return (
        own ??
        'Keep the assertion and the model as designed. Raise testTimeout so the requirement can finish, or re-run only it with testNamePattern; if this host cannot give it the time, report the claim as not decided.'
      );
    }
    case 'analysis-limit':
    case 'resource-limit': {
      return capacitySuggestion(category, limit);
    }
    case 'work-budget': {
      return budgetSuggestion(limit);
    }
    case 'unsupported-evidence': {
      return evidenceSuggestion(kernels, own ?? any);
    }
    case 'model-load': {
      return (
        own ??
        any ??
        'Fix the model so it evaluates and exports in the requested format (see the runtime issues), then re-run. Keep the assertion.'
      );
    }
    case 'infrastructure': {
      return (
        any ??
        'This is not a geometry verdict. Fix the spec or host problem the diagnostics name and re-run; keep the assertion.'
      );
    }
  }
};

const loadKernels = (
  test: GeoSpecTestCase,
  lineage: LineageRow | undefined,
  kernels: ReadonlyMap<string, GeoSpecKernelEvidence> | undefined,
): GeoSpecKernelEvidence[] => {
  if (kernels === undefined || lineage === undefined) {
    return [];
  }
  const loadIds = new Set(
    test.assertions.flatMap((assertion) => (assertion.loadId === undefined ? [] : [assertion.loadId])),
  );
  const sources = lineage.lineage.loads.flatMap((load) =>
    (loadIds.size === 0 || loadIds.has(load.loadId)) && load.evidence?.sourcePath !== undefined
      ? [load.evidence.sourcePath]
      : [],
  );
  return [...new Set(sources)].flatMap((source) => {
    const kernel = kernels.get(source);
    return kernel === undefined ? [] : [kernel];
  });
};

/**
 * Project one settled test onto its `test_model` rows.
 *
 * @param file - The GeoSpec file the test belongs to.
 * @param test - The settled test.
 * @param options - Whether to carry claim reports, the file's lineage and kernel facts.
 * @returns The test row and its pass or failure row.
 * @public
 */
export const projectGeoSpecTest = (
  file: string,
  test: GeoSpecTestCase,
  options: {
    readonly reports?: boolean;
    readonly lineage?: LineageRow;
    readonly kernels?: ReadonlyMap<string, GeoSpecKernelEvidence>;
  } = {},
): GeoSpecProjectedTest => {
  const requirement = fullGeoSpecTestName(test);
  const testRow: TestRow = {
    id: `${file}:${test.ordinal ?? requirement}`,
    requirement,
    targetFile: file,
    status: test.status,
    ...(test.ordinal === undefined ? {} : { ordinal: test.ordinal }),
  };
  if (test.status === 'skipped') {
    return { test: testRow };
  }
  const allReports = transportReports(test);
  const reports = options.reports === false ? undefined : allReports;
  const nonPassingReport = allReports?.find((report) => report.status !== 'passed');
  if (
    test.status !== 'passed' ||
    test.assertions.some(
      (assertion) =>
        assertion.passed === false || (assertion.report !== undefined && assertion.report.status !== 'passed'),
    )
  ) {
    const assertionDiagnostics = test.assertions.flatMap((assertion) => assertion.diagnostics ?? []);
    // The collector mirrors its thrown assertion's exact diagnostic objects.
    // Worker structured-clone preserves these aliases. Never deduplicate by
    // code/message: separate failures can have identical text and locations.
    const mirrored = new Set(assertionDiagnostics);
    const thrown = test.diagnostics.filter((diagnostic) => !mirrored.has(diagnostic));
    const diagnostics = [...assertionDiagnostics, ...thrown];
    const category = failureCategory(test, diagnostics);
    const limit = rowLimit(category, [
      ...test.assertions.flatMap((assertion): LimitEvidence[] => {
        const capability = assertion.report?.claim['capability'];
        const operation = typeof capability === 'string' ? capability : assertion.kind;
        return (assertion.diagnostics ?? []).map((diagnostic) => ({
          diagnostic,
          operation,
          ...(assertion.loadId === undefined ? {} : { subject: assertion.loadId }),
        }));
      }),
      // A diagnostic no assertion carries was thrown by the test body: a load the engine or host refused to admit.
      ...thrown.map((diagnostic) => ({ diagnostic, operation: 'ingestSubject' })),
    ]);
    return {
      test: { ...testRow, ...(limit === undefined ? {} : { limit }) },
      failure: {
        id: `${file}:${requirement}`,
        requirement,
        reason:
          diagnosticText(diagnostics) ??
          (nonPassingReport ? `GeoSpec evidence status: ${nonPassingReport.status}.` : 'GeoSpec test failed.'),
        suggestion: categorySuggestion({
          category,
          diagnostics,
          kernels: loadKernels(test, options.lineage, options.kernels),
          limit,
        }),
        category,
        ...(limit === undefined ? {} : { limit }),
        targetFile: file,
        diagnostics: transportDiagnostics(diagnostics),
        ...(reports === undefined ? {} : { reports }),
      },
    };
  }
  return {
    test: testRow,
    pass: {
      id: `${file}:${requirement}`,
      requirement,
      targetFile: file,
      ...(reports === undefined ? {} : { reports }),
    },
  };
};

const issueRow = (issue: RunnerIssue, targetFile: string): RunGeoSpecTestFailure => {
  if (isGeoSpecTimeoutCode(issue.code)) {
    return {
      id: issue.code,
      requirement: 'Every selected GeoSpec file must finish within its wall-clock bound',
      reason: issue.message,
      suggestion:
        'Keep the assertions and the model as designed. Re-run the timed-out file on its own or raise its timeout; if this host cannot give it the time, report its claims as not decided.',
      category: 'timeout',
      targetFile,
    };
  }
  if (issue.code === 'GEOSPEC_RUNNER_ABORTED' || issue.code === 'GEOSPEC_RUNNER_BAILED') {
    return {
      id: issue.code,
      requirement: 'Every selected GeoSpec file must run',
      reason: issue.message,
      suggestion:
        'The files in accounting.notRunFiles never started. Re-run them with files: [...]; nothing was asserted for them.',
      category: 'infrastructure',
      targetFile,
    };
  }
  return {
    id: issue.code,
    requirement: 'At least one selected GeoSpec test must run',
    reason: issue.message,
    suggestion:
      'Run without filters, or use files/include/exclude/testNamePattern values that select at least one GeoSpec test.',
    targetFile,
  };
};

/**
 * Project one settled file onto its `test_model` rows, lineage and counts.
 *
 * @param fileResult - The runner's result for one file.
 * @param options - Kernel facts by model source path.
 * @returns The file's rows in test order, after its bundle failure.
 * @public
 */
export const projectGeoSpecFile = (
  fileResult: GeoSpecRunnerFileResult,
  options: Pick<GeoSpecProjectionOptions, 'kernels'> = {},
): GeoSpecFileProjection => {
  const { file, result: moduleResult } = fileResult;
  const lineage: LineageRow | undefined =
    moduleResult.lineage === undefined
      ? undefined
      : { file, lineage: geoSpecRunLineageSchema.parse(moduleResult.lineage) };
  const failures: RunGeoSpecTestFailure[] = [];
  const passes: PassRow[] = [];
  const tests: TestRow[] = [];
  if (!moduleResult.success) {
    const timeoutIssue = moduleResult.issues.find((issue) => isGeoSpecTimeoutCode(issue.code));
    failures.push({
      id: `${file}:bundle`,
      requirement: `GeoSpec module ${file} must bundle and execute`,
      reason: moduleResult.issues.map((issue) => issue.message).join('\n'),
      suggestion:
        timeoutIssue === undefined
          ? 'Fix the GeoSpec syntax, imports, or referenced project files.'
          : issueRow(timeoutIssue, file).suggestion,
      ...(timeoutIssue === undefined ? {} : { category: 'timeout' }),
      targetFile: file,
    });
  }
  for (const test of moduleResult.tests ?? []) {
    const projected = projectGeoSpecTest(file, test, {
      ...(lineage === undefined ? {} : { lineage }),
      ...(options.kernels === undefined ? {} : { kernels: options.kernels }),
    });
    tests.push(projected.test);
    if (projected.failure !== undefined) {
      failures.push(projected.failure);
    }
    if (projected.pass !== undefined) {
      passes.push(projected.pass);
    }
  }
  const sourceRevisions =
    lineage?.lineage.loads.flatMap(({ evidence }) =>
      evidence?.sourceRevision === undefined ? [] : [evidence.sourceRevision],
    ) ?? [];
  const counts = moduleResult.accounting;
  return {
    failures,
    passes,
    tests,
    ...(lineage === undefined ? {} : { lineage }),
    sourceRevisions,
    ...(counts === undefined
      ? {}
      : {
          counts: {
            discovered: counts.discovered,
            selected: counts.selected,
            completed: counts.completed,
            passed: counts.passed,
            failed: counts.failed,
            unsupported: counts.unsupported,
            inconclusive: counts.inconclusive,
            skipped: counts.skipped,
            notRun: counts.notRun,
          },
        }),
  };
};

/**
 * Convert a GeoSpec runner result into the compact `test_model` RPC shape.
 *
 * @param result - The runner's aggregate result.
 * @param entryPaths - Discovered GeoSpec files the run selected.
 * @param options - Whether the caller applied selection filters, and kernel facts.
 * @returns The compact model-facing verdict.
 * @public
 */
export const runnerResultToTestModelOutput = (
  result: GeoSpecRunnerResult,
  entryPaths: readonly string[],
  options: GeoSpecProjectionOptions = {},
): TestModelOutput => {
  const failures: RunGeoSpecTestsSuccess['failures'] = [];
  const passes: RunGeoSpecTestsSuccess['passes'] = [];
  const files = result.files.map((fileResult) =>
    projectGeoSpecFile(fileResult, options.kernels === undefined ? {} : { kernels: options.kernels }),
  );
  const tests: NonNullable<TestModelOutput['tests']> = files.flatMap((file) => file.tests);
  const lineage = files.flatMap((file) => (file.lineage === undefined ? [] : [file.lineage]));
  const sourceRevisions = files.flatMap((file) => file.sourceRevisions);

  if (entryPaths.length === 0) {
    if (options.filtersApplied) {
      failures.push({
        id: 'NO_MATCHING_GEOSPEC_TESTS',
        requirement: 'At least one selected GeoSpec test must run',
        reason: 'No GeoSpec files matched the supplied filters or directory roots.',
        suggestion:
          'Run without filters, or use files/include/exclude/testNamePattern values that select at least one GeoSpec test.',
        targetFile: '*.geospec.ts',
      });
    } else {
      failures.push({
        id: 'missing_geospec_file',
        requirement: 'At least one GeoSpec test file must exist',
        reason: 'No *.geospec.ts or *.geospec.js files found in the project.',
        suggestion:
          'Create a *.geospec.ts test file using loadModel from geospec/model and expectGeo from geospec. The host supplies the geometry binding.',
        targetFile: '*.geospec.ts',
      });
    }
  }

  for (const issue of result.issues ?? []) {
    failures.push(issueRow(issue, entryPaths.join(', ') || '*.geospec.ts'));
  }

  for (const file of files) {
    failures.push(...file.failures);
    passes.push(...file.passes);
  }

  if (entryPaths.length > 0 && failures.length === 0 && passes.length === 0) {
    failures.push({
      id: 'NO_MATCHING_GEOSPEC_TESTS',
      requirement: 'At least one selected GeoSpec test must run',
      reason: 'GeoSpec files were found, but no non-skipped tests ran.',
      suggestion: 'Run without filters or use a matching Vitest-style testNamePattern.',
      targetFile: entryPaths.join(', '),
    });
  }

  return {
    failures,
    passes,
    passed: passes.length,
    total: result.accounting?.selected ?? result.selectedTests,
    runStatus: runStatus(result, tests),
    tests,
    ...(result.accounting === undefined ? {} : { accounting: geoSpecRunAccountingSchema.parse(result.accounting) }),
    lineageStatus: result.lineageStatus ?? 'unavailable',
    ...(lineage.length === 0 ? {} : { lineage }),
    ...(sourceRevisions.length === 0 ? {} : { sourceRevisions }),
  };
};

const runStatus = (
  result: GeoSpecRunnerResult,
  tests: NonNullable<TestModelOutput['tests']>,
): TestModelOutput['runStatus'] => {
  if (result.failed > 0 || tests.some((test) => test.status === 'failed')) {
    return 'failed';
  }
  if (tests.some((test) => test.status === 'inconclusive') || result.accounting?.cancelled) {
    return 'inconclusive';
  }
  if (tests.some((test) => test.status === 'unsupported')) {
    return 'unsupported';
  }
  if (result.selectedTests === 0 || (tests.length > 0 && tests.every((test) => test.status === 'skipped'))) {
    return 'not-run';
  }
  const { accounting } = result;
  return result.success &&
    result.lineageStatus === 'complete' &&
    accounting?.discoveryComplete &&
    accounting.completed + tests.filter((test) => test.status === 'skipped').length === accounting.selected &&
    accounting.notRunFiles.length === 0 &&
    !accounting.bailed
    ? 'passed'
    : 'inconclusive';
};
