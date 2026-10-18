import { z } from 'zod';
import { geoSpecDefaultMaxRunBudget, geoSpecDefaultMaxWorkUnitLimit } from '#constants/rpc.constants.js';
import { jsonValueSchema } from '#schemas/message-provider.schema.js';
import { rootedFilePathSchema } from '#schemas/rooted-path.schema.js';
import { sourceRevisionSchema } from '#schemas/tools/source-revision.schema.js';

const geoSpecTestStatusSchema = z.enum(['passed', 'failed', 'unsupported', 'inconclusive', 'not-run', 'skipped']);
const geoSpecLineageStatusSchema = z.enum(['complete', 'unavailable', 'mixed']);
const sha256Schema = z.string().regex(/^[\da-f]{64}$/u);
const observedCountSchema = z.number().int().nonnegative();

/** Complete observed accounting; unstarted modules do not imply known test counts. @public */
export const geoSpecRunAccountingSchema = z
  .object({
    discovered: observedCountSchema,
    selected: observedCountSchema,
    completed: observedCountSchema,
    passed: observedCountSchema,
    failed: observedCountSchema,
    unsupported: observedCountSchema,
    inconclusive: observedCountSchema,
    skipped: observedCountSchema,
    notRun: observedCountSchema,
    requestedFiles: z.array(z.string()),
    completedFiles: z.array(z.string()),
    notRunFiles: z.array(z.string()),
    discoveryComplete: z.boolean(),
    cancelled: z.boolean(),
    bailed: z.boolean(),
  })
  .strict();

/** Consumed module, per-load source and artifact identities, without live engine handles. @public */
export const geoSpecRunLineageSchema = z
  .object({
    status: geoSpecLineageStatusSchema,
    modules: z.array(
      z
        .object({
          entryPath: z.string(),
          bundleSha256: sha256Schema,
          files: z.record(z.string(), z.string().regex(/^(?:sha256:[\da-f]{64}|missing)$/u)),
          consistent: z.boolean(),
        })
        .strict(),
    ),
    loads: z.array(
      z
        .object({
          loadId: z.string(),
          status: z.enum(['complete', 'unavailable', 'failed']),
          subject: z
            .object({ subjectHash: sha256Schema.optional(), contentHash: sha256Schema.optional() })
            .strict()
            .optional(),
          evidence: z
            .object({
              loadId: z.string(),
              status: z.enum(['complete', 'unavailable']),
              format: z.string(),
              parameters: z.record(z.string(), jsonValueSchema),
              exportOptions: z.record(z.string(), jsonValueSchema).optional(),
              ingestOptions: z.record(z.string(), jsonValueSchema),
              sourceRevision: sourceRevisionSchema.optional(),
              sourcePath: z.string().optional(),
              rootDir: z.string().optional().describe('Project-relative folder this load resolved its paths in.'),
              workUnitLimit: z.number().int().positive().optional(),
              reused: z.literal(true).optional(),
              region: z
                .object({
                  min: z.tuple([z.number(), z.number(), z.number()]),
                  max: z.tuple([z.number(), z.number(), z.number()]),
                })
                .strict()
                .optional()
                .describe('The crop this load applied: claims on it hold for this millimetre box only.'),
              artifacts: z.array(
                z
                  .object({
                    name: z.string(),
                    sha256: sha256Schema,
                    byteLength: observedCountSchema,
                    sourcePath: z.string().optional(),
                  })
                  .strict(),
              ),
            })
            .strict()
            .optional(),
          error: z.string().optional(),
          diagnostics: z.array(jsonValueSchema).optional(),
        })
        .strict(),
    ),
  })
  .strict();

// =============================================================================
// View and Observation Schemas (internal use for capturing screenshots)
// =============================================================================

/**
 * View sides enum for orthographic views.
 * Used internally for capturing model screenshots.
 * @public
 */
export const viewSideSchema = z.enum(['front', 'back', 'right', 'left', 'top', 'bottom', 'composite']);
/** @public */
export type ViewSide = z.infer<typeof viewSideSchema>;

/**
 * Observation schema - each image capture is an "observation".
 * Used internally by the test runner.
 * @public
 */
export const observationSchema = z.object({
  id: z.string(),
  side: viewSideSchema,
  src: z.string(),
});
/** @public */
export type Observation = z.infer<typeof observationSchema>;

// =============================================================================
// Test Model Tool Schemas (input/output for test_model tool)
// =============================================================================

/**
 * Shared filter input for GeoSpec runs.
 *
 * The same fields are accepted by the `test_model` tool and the
 * `run_geospec_tests` browser RPC. They intentionally mirror the GeoSpec CLI
 * filters while keeping output-format flags (for example `--json`) CLI-only.
 * @public
 */
export const geoSpecRunFilterInputSchema = z
  .object({
    files: z
      .array(rootedFilePathSchema.max(512))
      .max(50)
      .optional()
      .describe('JSON array of GeoSpec files or directory roots, e.g. ["main.geospec.ts"] or ["lib"].'),
    include: z
      .array(z.string().min(1).max(512))
      .max(50)
      .optional()
      .describe('JSON array of GeoSpec file include globs, e.g. ["parts/**/*.geospec.ts"].'),
    exclude: z
      .array(z.string().min(1).max(512))
      .max(50)
      .optional()
      .describe('JSON array of GeoSpec file exclude globs, e.g. ["**/*.slow.geospec.ts"].'),
    testNamePattern: z
      .string()
      .min(1)
      .max(512)
      .optional()
      .describe(
        'JavaScript RegExp source matched against full suite > test names, e.g. "watertight" or "^(?!.*known failing check).*". Equivalent to CLI --testNamePattern.',
      ),
    testTimeout: z
      .number()
      .int()
      .min(1)
      .max(Number.MAX_SAFE_INTEGER)
      .optional()
      .describe(
        `Per-test async timeout in milliseconds on every host (CLI --test-timeout). A test still running then fails with GEOSPEC_TEST_TIMEOUT; the run still waits for it to settle, so this does not shorten the run. Omit for none. The browser run budget is raised to cover it, up to the host's maximum (${geoSpecDefaultMaxRunBudget} ms unless the host raised it); a larger value is refused, and a run that outlives its budget returns \`timeout\` plus the requirements completed so far.`,
      ),
    workUnitLimit: z
      .number()
      .int()
      .positive()
      .max(Number.MAX_SAFE_INTEGER)
      .optional()
      .describe(
        `Engine work-unit budget for each claim in this run, replacing the host default. A budget in loadModel or expectGeo still wins for its own claims. Raise it when a row has category work-budget, up to the host's maximum (${geoSpecDefaultMaxWorkUnitLimit} unless the host raised it); a larger value is refused. Omit for the host default.`,
      ),
  })
  .strict();

/**
 * Input schema for test_model tool.
 *
 * No input is required: by default the tool recursively discovers and runs all
 * GeoSpec test files. Filters match the standalone GeoSpec CLI.
 *
 * @public
 */
export const testModelInputSchema = geoSpecRunFilterInputSchema;
/** @public */
export type TestModelInput = z.input<typeof testModelInputSchema>;

const geometryDiagnosticSchema = z
  .object({
    code: z.string(),
    severity: z.enum(['error', 'warning', 'info']),
    message: z.string(),
    suggestion: z.string().optional(),
    spatial: z
      .object({
        min: z.tuple([z.number(), z.number(), z.number()]).optional(),
        max: z.tuple([z.number(), z.number(), z.number()]).optional(),
        center: z.tuple([z.number(), z.number(), z.number()]).optional(),
      })
      .optional(),
    details: z.unknown().optional(),
  })
  .describe('Structured GeoSpec diagnostic preserved from the matcher runner');

/**
 * JSON-safe projection of one compiled GeoSpec claim report. Exact bytes
 * travel to the record owner before compact model-facing normalization.
 *
 * @public
 */
export const nativeGeoSpecReportSchema = z.object({
  claimId: z.string(),
  status: z.string(),
  polarity: z.enum(['negative', 'positive']),
  claim: z.record(z.string(), jsonValueSchema),
  result: z.record(z.string(), jsonValueSchema),
  diagnostics: z.array(jsonValueSchema),
  evidence: jsonValueSchema.optional(),
  loadId: z.string().optional(),
  canonical: z
    .object({
      claim: z.array(z.number().int().min(0).max(255)),
      plan: z.array(z.number().int().min(0).max(255)),
      result: z.array(z.number().int().min(0).max(255)),
    })
    .strict()
    .optional(),
});
/** @public */
export type NativeGeoSpecReport = z.infer<typeof nativeGeoSpecReportSchema>;

/**
 * Why a requirement did not pass, one category per refusal cause. Only
 * `geometry` is a decided claim; every other category keeps the assertion and
 * changes how the evidence is obtained.
 *
 * @public
 */
export const geoSpecFailureCategorySchema = z
  .enum([
    'geometry',
    'unsupported-evidence',
    'analysis-limit',
    'resource-limit',
    'work-budget',
    'timeout',
    'model-load',
    'infrastructure',
  ])
  .describe(
    'geometry: the claim was decided false. unsupported-evidence: the loaded evidence cannot answer the matcher. analysis-limit / resource-limit: the subject exceeds an engine analysis or admission limit. work-budget: the claim exhausted its work-unit budget. timeout: a wall-clock bound expired. model-load: the model did not load. infrastructure: bundling, engine or host failure.',
  );
/** @public */
export type GeoSpecFailureCategory = z.infer<typeof geoSpecFailureCategorySchema>;

/**
 * The limit that left a requirement undecided, with the one retry that can
 * change the outcome. Present on `analysis-limit`, `resource-limit` and
 * `work-budget` rows when the refusal reports its numbers.
 */
const geoSpecLimitSchema = z
  .object({
    kind: z
      .enum(['capacity', 'budget'])
      .describe('capacity: an engine or host limit. budget: the claim work-unit budget (workUnitLimit).'),
    name: z
      .string()
      .describe(
        'The limit: the configuration key or fixed ceiling the refusal names (maxSubjectBytes, maxTotalBinaryBytes, maxTriangles, descriptorBytes, workUnitLimit) or, for an analysis limit, the evidence the engine names (continuousEvidenceBytes).',
      ),
    declared: observedCountSchema.optional().describe('The limit value, in unit.'),
    measured: observedCountSchema.optional().describe('What the subject or claim needs or used, in unit.'),
    unit: z
      .string()
      .describe('bytes, vertices, triangles, occurrences, retained subjects, mesh entries or work-units.'),
    operation: z.string().describe('The refused step: ingestSubject for an admission limit, else the matcher.'),
    subject: z.string().optional().describe('The loadId of the refused claim.'),
    retry: z
      .object({ parameter: z.literal('workUnitLimit'), value: z.number().int().positive() })
      .strict()
      .nullable()
      .describe(
        "The workUnitLimit value that can decide the claim, set where that claim's budget is set (test_model for the run, or its loadModel or expectGeo option); null when no argument raises the limit.",
      ),
    source: z
      .enum(['engine', 'host'])
      .describe('engine: the engine refused. host: the host refused before the engine.'),
  })
  .strict();

/**
 * A browser run that outlived its run budget. The run is reported with the
 * requirements it completed; the rest are not run, never passed.
 *
 * @public
 */
export const geoSpecRunTimeoutSchema = z
  .object({
    errorCode: z.literal('OPERATION_TIMEOUT'),
    code: z.literal('GEOSPEC_RUN_TIMEOUT'),
    budget: z.number().int().positive().describe('Run budget in milliseconds.'),
    elapsed: z.number().int().nonnegative().describe('Milliseconds the run had taken when the budget expired.'),
    phase: z
      .enum(['queued', 'running'])
      .describe('queued: the run waited behind an earlier run in this session and never started.'),
    file: z.string().optional().describe('GeoSpec file in flight when the budget expired'),
    requirement: z.string().optional().describe('Requirement in flight when the budget expired'),
  })
  .strict();
/** @public */
export type GeoSpecRunTimeout = z.infer<typeof geoSpecRunTimeoutSchema>;

/**
 * Test failure result -- failures include detailed feedback for the LLM and
 * are tagged with the source file whose geometry failed the requirement.
 */
const testFailureSchema = z.object({
  id: z.string().describe('ID of the failed requirement'),
  requirement: z.string().describe('Description of the requirement that failed'),
  reason: z.string().describe('Why the test failed'),
  suggestion: z.string().describe('Actionable suggestion to fix the issue'),
  category: geoSpecFailureCategorySchema.optional(),
  limit: geoSpecLimitSchema.optional(),
  targetFile: rootedFilePathSchema.describe('Source file whose geometry produced this failure'),
  diagnostics: z
    .array(geometryDiagnosticSchema)
    .optional()
    .describe('Structured GeoSpec matcher diagnostics for UI / programmatic consumers'),
  reports: z
    .array(nativeGeoSpecReportSchema)
    .optional()
    .describe('Complete native GeoSpec claim reports in assertion order'),
});
/**
 * Inferred failed-test row emitted by the GeoSpec runner / agent tooling.
 * @public
 */
export type TestFailure = z.infer<typeof testFailureSchema>;

/**
 * Test pass result -- passes are simpler, just id/description/targetFile.
 */
const testPassSchema = z.object({
  id: z.string().describe('ID of the passed requirement'),
  requirement: z.string().describe('Description of the requirement that passed'),
  targetFile: rootedFilePathSchema.describe('Source file whose geometry satisfied this requirement'),
  reports: z
    .array(nativeGeoSpecReportSchema)
    .optional()
    .describe('Complete native GeoSpec claim reports in assertion order'),
});
/**
 * Inferred passing-test row for summarising satisfied requirements.
 * @public
 */
export type TestPass = z.infer<typeof testPassSchema>;

/** Full GeoSpec result retained when its inline MCP response would be too large. @public */
export const testModelResultArtifactSchema = z
  .object({
    path: z.string().regex(/^(?:attachments\/[\da-f]{64}\.json|\.tau\/artifacts\/[\w.-]+\/result\.json)$/u),
    absolutePath: z.string().min(1).optional(),
    mimeType: z.literal('application/json'),
    byteLength: z.number().int().positive(),
    sha256: z.string().regex(/^[\da-f]{64}$/u),
  })
  .strict();

/**
 * Output schema for test_model tool.
 * Includes both failures (with detailed feedback) and passes (for UI display).
 * @public
 */
export const testModelOutputSchema = z.object({
  failures: z.array(testFailureSchema).describe('Array of failed tests with actionable feedback'),
  passes: z.array(testPassSchema).describe('Array of passed tests'),
  passed: z.number().describe('Number of tests that passed'),
  total: z
    .number()
    .int()
    .nonnegative()
    .describe('Observed selected test count; requested-run coverage is named by accounting.'),
  runStatus: z
    .enum(['passed', 'failed', 'unsupported', 'inconclusive', 'not-run'])
    .optional()
    .describe('Run qualification, distinct from individual passed claims; absence is unqualified.'),
  accounting: geoSpecRunAccountingSchema.optional(),
  timeout: geoSpecRunTimeoutSchema.optional(),
  lineageStatus: geoSpecLineageStatusSchema.optional(),
  lineage: z.array(z.object({ file: z.string(), lineage: geoSpecRunLineageSchema }).strict()).optional(),
  tests: z
    .array(
      z
        .object({
          id: z.string(),
          requirement: z.string(),
          targetFile: z.string(),
          status: geoSpecTestStatusSchema,
          ordinal: observedCountSchema.optional(),
          limit: geoSpecLimitSchema.optional(),
        })
        .strict(),
    )
    .optional()
    .describe('Every observed test, including skipped and not-run requirements.'),
  sourceRevisions: z
    .array(sourceRevisionSchema)
    .optional()
    .describe('One entry per model the run loaded, naming the source it was evaluated from (R4).'),
  projectRoot: z
    .string()
    .min(1)
    .optional()
    .describe('Absolute project root every targetFile and loadModel file resolved against.'),
  fullResult: testModelResultArtifactSchema
    .optional()
    .describe('Full result artifact when inline details were reduced'),
  omittedFailures: z.number().int().nonnegative().optional(),
  omittedPasses: z.number().int().nonnegative().optional(),
  omittedSourceRevisions: z.number().int().nonnegative().optional(),
  omittedTests: z.number().int().nonnegative().optional(),
  omittedLineage: z.number().int().nonnegative().optional(),
});
/**
 * Inferred aggregate output from `test_model` / GeoSpec evaluation runs.
 * @public
 */
export type TestModelOutput = z.infer<typeof testModelOutputSchema>;
