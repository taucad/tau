import { z } from 'zod';
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
              artifacts: z.array(
                z.object({ name: z.string(), sha256: sha256Schema, byteLength: observedCountSchema }).strict(),
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
      .max(300_000)
      .optional()
      .describe('Async test timeout in milliseconds. Equivalent to CLI --test-timeout.'),
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
 * Test failure result -- failures include detailed feedback for the LLM and
 * are tagged with the source file whose geometry failed the requirement.
 */
const testFailureSchema = z.object({
  id: z.string().describe('ID of the failed requirement'),
  requirement: z.string().describe('Description of the requirement that failed'),
  reason: z.string().describe('Why the test failed'),
  suggestion: z.string().describe('Actionable suggestion to fix the issue'),
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
        })
        .strict(),
    )
    .optional()
    .describe('Every observed test, including skipped and not-run requirements.'),
  sourceRevisions: z
    .array(sourceRevisionSchema)
    .optional()
    .describe('One entry per model the run loaded, naming the source it was evaluated from (R4).'),
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
