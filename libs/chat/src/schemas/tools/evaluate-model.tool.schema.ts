import { z } from 'zod';
import { kernelIssueSchema } from '#schemas/tools/issue.schema.js';
import { sourceRevisionSchema } from '#schemas/tools/source-revision.schema.js';
import { rootedFilePathSchema } from '#schemas/rooted-path.schema.js';
import { parameterOverridesSchema } from '#schemas/tools/parameter.tool.schema.js';
import { screenshotInputSchema } from '#schemas/tools/screenshot.tool.schema.js';

/** @public */
export const evaluateModelInputSchema = z
  .object({
    targetFile: rootedFilePathSchema.describe(
      'The project-relative CAD source file to evaluate; the project entry is `assets.main.entryPath` in tau.json.',
    ),
    includeCapabilities: z.boolean().optional().describe('Include view/export option schemas and reachable targets.'),
    // The default view's options, validated exactly as screenshot validates a view's options.
    options: screenshotInputSchema.shape.options,
    parameters: parameterOverridesSchema.optional(),
  })
  .strict();

const optionMetadataSchema = z.object({
  schema: z.record(z.string(), z.json()),
  defaults: z.record(z.string(), z.json()),
});

const count = z.number().int().nonnegative();

/** @public */
export const tessellationReportSchema = z
  .object({
    triangles: count,
    vertices: count,
    elapsed: z.number().nonnegative(),
    voxelSize: z.number().positive().optional(),
    activeVoxels: count.optional(),
    memoryBytes: count.optional(),
    requested: z.enum(['low', 'medium', 'high', 'extra-high', 'explicit']).optional(),
    linearTolerance: z.number().positive().optional(),
    angularTolerance: z.number().positive().optional(),
    downgraded: count.optional(),
  })
  .describe(
    'Cost of the default view mesh: triangles, vertices and milliseconds to produce it; voxel kernels add voxelSize (mm), activeVoxels and memoryBytes. Tolerance-meshed kernels add the requested preset or explicit, the effective linearTolerance (mm) and angularTolerance (degrees), and downgraded coarser steps taken to fit the triangle budget.',
  );

const millimetrePointSchema = z.object({ x: z.number(), y: z.number(), z: z.number() }).strict();

const admissionEstimateSchema = z.object({ estimated: count, limit: z.number().int().positive() }).strict();

/** @public */
export const modelSummarySchema = z
  .object({
    bounds: z
      .object({
        min: millimetrePointSchema,
        max: millimetrePointSchema,
        size: millimetrePointSchema,
        unit: z.literal('mm'),
      })
      .strict()
      .optional()
      .describe(
        "Axis-aligned box of the default view's mesh in the model's frame, Z up; absent when it draws no triangles.",
      ),
    componentCount: count.describe('Parts: the mesh nodes the default view draws.'),
    triangles: count,
    vertices: count,
    admission: z
      .object({
        triangles: admissionEstimateSchema,
        vertices: admissionEstimateSchema,
        subjectBytes: admissionEstimateSchema,
        warning: z.string().min(1).optional(),
      })
      .strict()
      .optional()
      .describe(
        "What a whole-model GeoSpec loadModel would ask the engine to admit, estimated from the display mesh at 72 bytes per triangle, against the engine's limits; warning names each estimate over its limit. A kernel can export a finer subject than it displays, so an estimate within a factor of about two of its limit is uncertain; STEP and region loads are not estimated. Present when the host can read the limits of the engine its test_model uses.",
      ),
  })
  .strict()
  .describe(
    "Facts about the default view's mesh, without a GeoSpec run; volume and every other measurement stay GeoSpec claims.",
  );

/** @public */
export const modelMechanismSchema = z
  .object({
    declared: z.boolean().describe('The source exports a mechanism.'),
    admitted: z
      .boolean()
      .describe("It was admitted against the delivered parts, so the default view's GLB carries it."),
    links: count,
    joints: count,
    couplings: count,
    animations: z.array(z.string()).describe('Animation ids, in authored order.'),
    issues: z
      .array(z.object({ code: z.string(), path: z.string() }).strict())
      .optional()
      .describe(
        'Each mechanism diagnostic once, by code and its path in the mechanism; kernelIssues gives the message.',
      ),
  })
  .strict()
  .describe(
    "The source's mechanism as the default view delivers it. Present when that view carries Tau topology or a mechanism diagnostic was reported.",
  );

/** @public */
export const evaluateModelOutputSchema = z.object({
  status: z.enum(['ready', 'error']).describe('The current status of the model evaluation and default view.'),
  kernelIssues: z.array(kernelIssueSchema).optional().describe('Issues encountered during evaluation or rendering.'),
  sourceRevision: sourceRevisionSchema.optional().describe('Digests of the source this verdict used.'),
  projectRoot: z.string().min(1).optional().describe('Absolute project root targetFile resolved against.'),
  views: z.array(z.string()).optional().describe('Offered view IDs, default first; present when ready.'),
  instances: z.record(z.string(), z.array(z.object({ id: z.string(), title: z.string() }).strict())).optional(),
  exports: z.record(z.string(), z.string()).optional().describe('Export ID to extension; present when ready.'),
  tessellation: tessellationReportSchema.optional(),
  summary: modelSummarySchema.optional(),
  mechanism: modelMechanismSchema.optional(),
  capabilities: z
    .object({
      views: z.record(z.string(), optionMetadataSchema),
      exports: z.record(z.string(), optionMetadataSchema),
      targets: z.array(z.string()),
    })
    .optional()
    .describe('Requested option metadata and reachable export targets.'),
});

/** @public */
export type EvaluateModelInput = z.infer<typeof evaluateModelInputSchema>;

/** @public */
export type EvaluateModelOutput = z.infer<typeof evaluateModelOutputSchema>;

/** @public */
export type ModelSummary = z.infer<typeof modelSummarySchema>;

/** @public */
export type ModelMechanism = z.infer<typeof modelMechanismSchema>;
