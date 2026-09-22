import type { KernelIssue } from '@taucad/runtime';
import { z } from 'zod';
import { kernelIssueSchema } from '#schemas/tools/issue.schema.js';
import { sourceRevisionSchema } from '#schemas/tools/source-revision.schema.js';
import { rootedFilePathSchema } from '#schemas/rooted-path.schema.js';

/** @public */
export const getKernelResultInputSchema = z.object({
  targetFile: rootedFilePathSchema.describe('The file to check kernel results for, relative to the project root.'),
});

/** @public */
export const getKernelResultOutputSchema = z.object({
  status: z.enum(['ready', 'error']).describe('The current status of the kernel.'),
  kernelIssues: z.array(kernelIssueSchema).optional().describe('Any kernel issues encountered during compilation.'),
  sourceRevision: sourceRevisionSchema
    .optional()
    .describe('Digests of the source this verdict was computed from (R4).'),
});

/** @public */
export type GetKernelResultInput = z.infer<typeof getKernelResultInputSchema>;

// Explicitly defined to avoid TS2742 with tsgo compiler
/** @public */
export type GetKernelResultOutput = {
  status: 'ready' | 'error';
  kernelIssues?: KernelIssue[];
  sourceRevision?: { entry: string; files: Record<string, string> };
};
