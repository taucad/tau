import { tool } from '@langchain/core/tools';
import { z } from 'zod';

export const fileEditTool = tool((args) => args, {
  name: 'file_edit',
  description:
    'Edit a file. After a file is edited, the client will render the CAD model and return the result of the render, which may be either 1) a successful render, 2) a failed render with error details',
  schema: z.object({
    fileName: z.string(),
    content: z.string(),
  }),
});
