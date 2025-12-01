import { z } from 'zod';

export const fileEditInputSchema = z.object({
  targetFile: z.string().describe('The target file to modify.'),
  codeEdit: z.string().describe('Specify ONLY the precise lines of code that you wish to edit...'),
});

export const fileEditOutputSchema = z.object({
  codeErrors: z.array(z.unknown()),
  kernelError: z.unknown().optional(),
  screenshot: z.string().optional(),
});

export type FileEditInput = z.infer<typeof fileEditInputSchema>;
export type FileEditOutput = z.infer<typeof fileEditOutputSchema>;

export const FILE_EDIT_TOOL_NAME = 'edit_file';
