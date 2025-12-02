import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { interrupt } from '@langchain/langgraph';
import { fileEditInputSchema } from '@taucad/chat';
import type { FileEditOutput } from '@taucad/chat';

const fileEditJsonSchema = z.toJSONSchema(fileEditInputSchema);

export const fileEditToolDefinition = {
  name: 'editFile',
  description: `Use this tool to propose an edit to an existing file.

This will be read by a less intelligent model, which will quickly apply the edit. You should make it clear what the edit is, while also minimizing the unchanged code you write.

When writing the edit, you should specify each edit in sequence, with the special comment // ... existing code ... to represent unchanged code in between edited lines.

For example:

// ... existing code ...
FIRST_EDIT
// ... existing code ...
SECOND_EDIT
// ... existing code ...
THIRD_EDIT
// ... existing code ...

You should bias towards repeating as few lines of the original file as possible to convey the change.
Each edit should contain sufficient context of unchanged lines around the code you're editing to resolve ambiguity.
If you plan on deleting a section, you must provide surrounding context to indicate the deletion.
DO NOT omit spans of pre-existing code without using the // ... existing code ... comment to indicate its absence.`,
  schema: fileEditJsonSchema,
} as const;

export const fileEditTool = tool((args) => {
  const result = interrupt<unknown, FileEditOutput>(args);
  return result;
}, fileEditToolDefinition);
