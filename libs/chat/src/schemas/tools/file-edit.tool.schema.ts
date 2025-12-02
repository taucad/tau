import { z } from 'zod';

const codeErrorSchema = z
  .object({
    message: z.string(),
    startLineNumber: z.number(),
    endLineNumber: z.number(),
    startColumn: z.number(),
    endColumn: z.number(),
  })
  .meta({ id: 'CodeError' });

const kernelErrorSchema = z
  .object({
    message: z.string(),
    startLineNumber: z.number(),
    endLineNumber: z.number(),
    startColumn: z.number(),
    endColumn: z.number(),
    stack: z.string(),
    stackFrames: z.array(
      z.object({
        fileName: z.string(),
        functionName: z.string(),
        lineNumber: z.number(),
        columnNumber: z.number(),
        source: z.string(),
      }),
    ),
  })
  .meta({ id: 'KernelError' });

export const fileEditInputSchema = z.object({
  targetFile: z.string().describe('The target file to modify.'),
  codeEdit: z.string().describe('Specify ONLY the precise lines of code that you wish to edit...'),
});

export const fileEditOutputSchema = z.object({
  codeErrors: z.array(codeErrorSchema),
  kernelError: kernelErrorSchema.optional(),
  screenshot: z.string().optional(),
});

export type FileEditInput = z.infer<typeof fileEditInputSchema>;
export type FileEditOutput = z.infer<typeof fileEditOutputSchema>;
