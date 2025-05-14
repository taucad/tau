import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { interrupt } from '@langchain/langgraph';

type FileEditResult =
  | {
      success: true;
    }
  | {
      success: false;
      error: string;
    };

export const fileEditTool = tool(
  (args) => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- required.
    const result = interrupt(args) as FileEditResult;
    console.log('fileEditTool', result);
    return result;
  },
  {
    name: 'file_edit',
    description:
      'Edit a file. After a file is edited, the client will render the CAD model and return the result of the render, which may be either 1) a successful render, 2) a failed render with error details',
    schema: z.object({
      fileName: z.string(),
      content: z.string(),
    }),
  },
);
