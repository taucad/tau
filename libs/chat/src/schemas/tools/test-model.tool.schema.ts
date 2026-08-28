import { z } from 'zod';
import { rootedFilePathSchema } from '#schemas/rooted-path.schema.js';

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
});
/**
 * Inferred passing-test row for summarising satisfied requirements.
 * @public
 */
export type TestPass = z.infer<typeof testPassSchema>;

/**
 * Output schema for test_model tool.
 * Includes both failures (with detailed feedback) and passes (for UI display).
 * @public
 */
export const testModelOutputSchema = z.object({
  failures: z.array(testFailureSchema).describe('Array of failed tests with actionable feedback'),
  passes: z.array(testPassSchema).describe('Array of passed tests'),
  passed: z.number().describe('Number of tests that passed'),
  total: z.number().describe('Total number of tests run'),
});
/**
 * Inferred aggregate output from `test_model` / GeoSpec evaluation runs.
 * @public
 */
export type TestModelOutput = z.infer<typeof testModelOutputSchema>;
