import { z } from 'zod';
import { kernelIssueSchema } from '#schemas/tools/issue.schema.js';
import { sourceRevisionSchema } from '#schemas/tools/source-revision.schema.js';
import { rootedFilePathSchema } from '#schemas/rooted-path.schema.js';

/** @public */
export const evaluateModelInputSchema = z
  .object({
    targetFile: rootedFilePathSchema.describe(
      'The project-relative CAD source file to evaluate; the project entry is `assets.main.entryPath` in tau.json.',
    ),
    includeCapabilities: z.boolean().optional().describe('Include view/export option schemas and reachable targets.'),
  })
  .strict();

const optionMetadataSchema = z.object({
  schema: z.record(z.string(), z.json()),
  defaults: z.record(z.string(), z.json()),
});

/** @public */
export const evaluateModelOutputSchema = z.object({
  status: z.enum(['ready', 'error']).describe('The current status of the model evaluation and default view.'),
  kernelIssues: z.array(kernelIssueSchema).optional().describe('Issues encountered during evaluation or rendering.'),
  sourceRevision: sourceRevisionSchema.optional().describe('Digests of the source this verdict used.'),
  views: z.array(z.string()).optional().describe('Offered view IDs, default first; present when ready.'),
  instances: z.record(z.string(), z.array(z.object({ id: z.string(), title: z.string() }).strict())).optional(),
  exports: z.record(z.string(), z.string()).optional().describe('Export ID to extension; present when ready.'),
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
