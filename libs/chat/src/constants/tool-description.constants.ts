import { toolName } from '#constants/tool.constants.js';

/** Canonical provider-facing descriptions shared by API and portable browser hosts. @public */
export const toolDescriptions = {
  [toolName.testModel]: `Run GeoSpec tests against the current 3D model(s).

No input recursively runs all *.geospec.ts or *.geospec.js files. Tests load
Tau model files through geospec/model and assert geometry with expectGeo.

Filter examples:
- Run one file: { files: ['main.geospec.ts'] }
- Run one directory subtree: { files: ['lib'] }
- Skip one known failing check: { testNamePattern: '^(?!.*no meshing interference).*' }
- Skip slow files: { exclude: ['**/*.slow.geospec.ts'] }

Returns compact pass/fail rows tagged by targetFile. Empty failures with total > 0 means all selected tests passed.

When NOT to use:
- NOT as a substitute for \`get_kernel_result\` when you only need compile status; \`test_model\` measures geometry against requirements.`,
  [toolName.getKernelResult]: `Check the status of the CAD kernel and retrieve any compilation errors for a specific file.

Parameters:
- targetFile: The file to check kernel results for (relative to project root)

Use this tool AFTER using \`edit_file\` or \`create_file\` to verify that your code changes compiled successfully.

Returns:
- status: 'ready' if compilation succeeded, 'error' if there were errors, 'pending' if still processing
- kernelIssues: Array of compilation/runtime errors if any occurred

Best Practice: Always call this tool after making file changes to ensure the model renders correctly before proceeding.

After compilation succeeds, use \`test_model\` to run GeoSpec geometry tests.`,
  [toolName.exportGeometry]: `Produce a persisted interchange/mesh artifact for one geometry unit and write it under \`.tau/artifacts/\` in the active project workspace.

Give explicit \`targetFile\` and \`format\` (extension only, matching the Tau MIME/extension registry — include the leading dot nowhere).

Examples: \`format: "stl"\`, \`format: "step"\`, \`format: "glb"\`, \`format: "3mf"\`. The runtime must expose an export route for that extension on the user's active kernel — when it does not, the tool surfaces an RPC error explaining the rejection.

Returns an ordered \`files\` array with each producer name, persisted \`artifactPath\`, \`mimeType\`, and \`byteLength\`. The first entry is the primary artifact and later entries are required companions.

For deterministic measurement runs, create or edit \`*.geospec.ts\` tests and use \`${toolName.testModel}\` instead.`,
  [toolName.screenshot]: `Capture a screenshot of a specific geometry unit's 3D model for visual inspection.

You MUST pass \`targetFile\` (the source file path of the geometry unit to screenshot, e.g. "main.ts" or "lib/bracket.scad"). There is no project-level fallback. The requested geometry unit is resolved or created, then its render is awaited before headless capture. The call fails for a missing source file, render failure or render timeout, an unavailable renderer, or invalid image artifacts.

Modes:
- single: Captures one deterministic perspective isometric image
- multi_angle: Captures 6 separate orthographic images (front, back, right, left, top, bottom)

Every image includes:
- an in-image view label; canonical axis-aligned labels name the camera position as View From ±axis
- a camera-aligned red-X, green-Y, blue-Z orientation indicator with dot/cross depth notation
- a physical scale bar; orthographic scale is depth-invariant, while perspective scale is measured at the subject-center plane and marked @ center

Use these annotations when reasoning about orientation, handedness, opposite faces, and size.`,
  [toolName.editFile]:
    'Replace text in one existing file. Read the file first and copy oldString with enough context to be unique. The edit tolerates only trailing whitespace and common Unicode punctuation differences. Set replaceAll only when every match should change. When NOT to use: use create_file or delete_file for file lifecycle operations.',
  [toolName.useSkill]: `Activate one available workspace skill by name and read its full SKILL.md instructions.

Use this tool when the user's task matches a skill listed in the system prompt or selected by the user. The tool resolves the selected skill through the client skill resolver, reads only that skill's instructions, records skill usage through the use_skill tool call, and returns raw markdown for you to follow.

When NOT to use:
- Do not call for every available skill up front.
- Do not use read_file to activate a skill; use this tool so skill usage is visible in the transcript.
- Do not call for unknown skills unless the user explicitly named a newly installed skill.`,
  [toolName.readFile]: `Read the contents of a file from the project filesystem.

You can optionally specify a line offset and limit (especially handy for long files), but it's recommended to read the whole file by not providing these parameters.

Lines in the output are prefixed with a cat -n gutter ("   <line>\\t<content>"). Files >2000 lines require explicit \`offset\` and \`limit\`.

Use this tool when you need to:
- Examine the contents of a specific file
- Understand existing code before making modifications
- Review configuration files or documentation`,
  [toolName.listDirectory]: `List files and directories in a given path within the project.

Use this tool to:
- Explore the project structure
- Find files in specific directories
- Understand the organization of the codebase

Omit the path to list the project root.`,
  [toolName.createFile]: `Create a new file with the specified content in the project filesystem.

Use this tool to:
- Create new source files (e.g., new modules, libraries)
- Create configuration files
- Add new assets or resources

The file path should be relative to the project root. Parent directories will be created automatically if they don't exist.

Note: This tool will overwrite an existing file if one exists at the specified path. Use read_file first to check if a file exists if you want to avoid overwriting.`,
  [toolName.deleteFile]: `Delete a file from the project filesystem.

Use this tool to:
- Remove unused or obsolete files
- Clean up temporary files
- Remove files that are no longer needed

The operation will fail gracefully if:
- The file doesn't exist
- The operation is rejected for security reasons
- The file cannot be deleted`,
  [toolName.grep]: `Search for text patterns in files using regular expressions.

This is a powerful search tool for finding exact matches in file contents.

Usage:
- Supports full regex syntax, e.g. "function\\s+\\w+", "import.*from"
- Escape special characters for exact matches, e.g. "functionCall\\("
- Use the glob parameter to filter by file type, e.g. "*.scad", "*.ts"
- Results show file path, line number, and matching line content
- Defaults to first 50 matches; pass \`headLimit\` (1-1000) to widen, \`offset\` to paginate.

Use this tool when you need to:
- Find specific code patterns or function calls
- Locate variable or function definitions
- Search for text across multiple files

For finding files by name pattern, use \`glob\`.`,
  [toolName.globSearch]: `Find files matching a glob pattern in the project.

Use this tool to:
- Find all files of a certain type (e.g., "**/*.scad", "**/*.ts")
- Locate files in specific directories (e.g., "lib/**/*.scad")
- Discover files by name pattern (e.g., "**/test_*.scad")

Common glob patterns:
- "**/*.ext" - All files with extension in any directory
- "dir/**/*" - All files under a specific directory
- "**/prefix_*" - Files starting with a prefix in any directory

For searching file contents, use \`grep\`.`,
} as const;
