import { z } from 'zod';

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
      .array(z.string().min(1).max(512))
      .max(50)
      .optional()
      .describe(
        'JSON array of GeoSpec files or directory roots, e.g. ["main.geospec.ts"] or ["lib"]. Do not use bracket-key syntax.',
      ),
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
export type TestModelInput = z.infer<typeof testModelInputSchema>;
