/**
 * Shared error schemas used across multiple tool definitions.
 * These schemas are registered with unique IDs in Zod's registry.
 */
import type { CodeIssue } from '@taucad/types';
import type { KernelIssue } from '@taucad/runtime';
import { kernelIssueCodeValues } from '@taucad/runtime/types';
import { z } from 'zod';
import { rootedFilePathSchema } from '#schemas/rooted-path.schema.js';

export const codeIssueSchema: z.ZodType<CodeIssue> = z
  .object({
    message: z.string(),
    startLineNumber: z.number(),
    endLineNumber: z.number(),
    startColumn: z.number(),
    endColumn: z.number(),
  })
  .meta({ id: 'CodeIssue' });

export const errorLocationSchema = z.object({
  fileName: rootedFilePathSchema,
  startLineNumber: z.number(),
  startColumn: z.number(),
  endLineNumber: z.number().optional(),
  endColumn: z.number().optional(),
});

const kernelStackFrameSchema = z
  .object({
    fileName: z.string().optional(),
    functionName: z.string().optional(),
    lineNumber: z.number().optional(),
    columnNumber: z.number().optional(),
    source: z.string().optional(),
    context: z.enum(['user', 'library', 'framework', 'runtime']).optional(),
  })
  .catchall(z.unknown());

export const kernelIssueSchema: z.ZodType<KernelIssue> = z
  .object({
    message: z.string(),
    code: z.enum(kernelIssueCodeValues),
    location: errorLocationSchema.optional(),
    stack: z.string().optional(),
    stackFrames: z.array(kernelStackFrameSchema).optional(),
    details: z.unknown().optional(),
    severity: z.enum(['error', 'warning', 'info']),
    type: z.enum(['compilation', 'runtime', 'kernel', 'connection', 'unknown']).optional(),
  })
  .catchall(z.unknown())
  .meta({ id: 'KernelIssue' });
