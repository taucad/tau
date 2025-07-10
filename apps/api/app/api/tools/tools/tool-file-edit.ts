import { tool } from '@langchain/core/tools';
import { z } from 'zod/v4';
import { interrupt } from '@langchain/langgraph';

type FileEditResult =
  | {
      success: true;
    }
  | {
      success: false;
      error: string;
    };

const fileEditSchema = z.object({
  targetFile: z
    .string()
    .describe(
      'The target file to modify. For Replicad use .ts extension, for OpenSCAD use .scad extension. If no extension is provided, one will be added based on the selected CAD kernel.',
    ),
  codeEdit: z
    .string()
    .describe(
      'Specify ONLY the precise lines of code that you wish to edit. Use // ... existing code ... for unchanged sections.',
    ),
});

const fileEditJsonSchema = z.toJSONSchema(fileEditSchema);

export const fileEditToolDefinition = {
  name: 'edit_file',
  description: `Use this tool to propose an edit to an existing file or create a new file.

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
DO NOT omit spans of pre-existing code without using the // ... existing code ... comment to indicate its absence.

**File Naming Guidelines:**
- For Replicad projects: Use .ts file extension (e.g., main.ts, component.ts)
- For OpenSCAD projects: Use .scad file extension (e.g., main.scad, part.scad)
- If no extension is provided in targetFile, the appropriate extension will be added based on the selected CAD kernel
- You can reference multiple files in a project and the system will track them appropriately

**Multi-file Support:**
The system supports multiple files per project. When working with complex models:
- Split logical components into separate files
- Use descriptive filenames that indicate the component's purpose
- The main file serves as the entry point that may import or reference other files
- The system will track all files and their relationships automatically`,
  schema: fileEditJsonSchema,
} as const;

export const fileEditTool = tool((args) => {
  const result = interrupt<unknown, FileEditResult>(args);
  return result;
}, fileEditToolDefinition);
