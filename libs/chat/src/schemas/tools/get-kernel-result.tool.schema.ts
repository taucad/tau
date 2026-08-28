import type { KernelIssue } from '@taucad/runtime';
import { z } from 'zod';
import { kernelIssueSchema } from '#schemas/tools/issue.schema.js';
import { rootedFilePathSchema } from '#schemas/rooted-path.schema.js';

/** @public */
export const getKernelResultInputSchema = z.object({
  targetFile: rootedFilePathSchema.describe('The file to check kernel results for, relative to the project root.'),
});

/** @public */
export const getKernelResultOutputSchema = z.object({
  status: z.enum(['ready', 'error', 'pending']).describe('The current status of the kernel.'),
  kernelIssues: z.array(kernelIssueSchema).optional().describe('Any kernel issues encountered during compilation.'),
});

/** @public */
export type GetKernelResultInput = z.infer<typeof getKernelResultInputSchema>;

// Explicitly defined to avoid TS2742 with tsgo compiler
/** @public */
export type GetKernelResultOutput = {
  status: 'ready' | 'error' | 'pending';
  kernelIssues?: KernelIssue[];
};
