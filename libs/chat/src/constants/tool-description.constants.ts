import { toolName } from '#constants/tool.constants.js';
import { arrangeWorkbenchDescription } from '#schemas/tools/arrange-workbench.tool.schema.js';
import { requestPrintOptionKeys } from '#schemas/tools/print.tool.schema.js';

const parameterUnitRule =
  'When current.entry.groups[g].units[pointer] exists, it is the unit of the stored number and of native-value writes; use unit-value with inputUnit to be explicit.';

/** R8/I5/I9: what every kernel-backed read promises about the bytes it answered for. */
const sourceRevisionRule =
  'Computed from the bytes on disk at call time; `sourceRevision` names the digests it read. Compare it with the `revision.digest` of your last write; a result answering for superseded bytes returns as a `STALE_EVALUATION` error naming both digests, never as a result.';

/** R8/I5: what every write promises about the bytes it left behind. */
const writeRevisionRule =
  'Returns `revision`: the path and the digest now at it (`"missing"` once deleted), comparable with the `sourceRevision` of any later kernel result.';

/** Canonical provider-facing descriptions shared by API and portable browser hosts. @public */
export const toolDescriptions = {
  [toolName.testModel]: `Run GeoSpec tests against the current 3D model(s).

No input recursively runs all *.geospec.ts or *.geospec.js files. Tests load
Tau model files and assert measurable geometry requirements.

Filter examples:
- Run one file: { files: ['main.geospec.ts'] }
- Run one directory subtree: { files: ['lib'] }
- Select a named requirement: { testNamePattern: 'intended envelope' }
- Exclude an explicitly out-of-scope fixture: { exclude: ['**/fixtures/**'] }

Returns compact rows tagged by targetFile, plus \`sourceRevisions\` for loaded models. Check \`runStatus\`, \`accounting\`, discovery completion and \`lineageStatus\`; empty failures alone do not qualify a run. Unsupported, inconclusive, skipped and not-run requirements are not passes. Filters qualify only the selected scope, never excluded requirements. Read the retained \`fullResult\` when compact details are omitted. ${sourceRevisionRule}

When NOT to use:
- NOT as a substitute for \`evaluate_model\` when you only need build status; \`test_model\` measures geometry against requirements.`,
  [toolName.evaluateModel]: `Evaluate one CAD source file (\`targetFile\`) and its default view, then list what this build can show and export.

Call it after every \`edit_file\`, \`create_file\` or \`delete_file\`. Returns \`status\`, \`kernelIssues\`, offered \`views\`, per-view \`instances\`, and an export-id-to-extension map. A ready build may still report error-severity design issues; inspect them. A default-view render failure is an error, and a valid export-only build can offer zero views. Set \`includeCapabilities: true\` to inspect view/export option schemas, defaults and reachable export targets. ${sourceRevisionRule}

Once 'ready', use \`test_model\` to measure the geometry against requirements.`,
  [toolName.exportModel]: `Export one model artifact set and write its files under \`.tau/artifacts/\` in the active project workspace.

Give explicit \`targetFile\` and \`to\`: a declared export ID (such as \`bom\`) or an unambiguous reachable extension (such as \`stl\` or \`3mf\`), without a dot. IDs win over extensions. Use \`evaluate_model({ targetFile, includeCapabilities: true })\` to discover targets and options. An unavailable or ambiguous target returns the available choices.

For a design question, text/JSON exports may be used as evidence only when both the declaration and every actual output file are text/JSON: call \`export_model\`, then \`read_file\` on the returned artifact path, and compare \`sourceRevision\` with the current source. A binary or mixed deliverable requires the person's export request.

Returns the resolved \`exportId\`, pinned \`sourceRevision\`, and ordered \`files\` with producer names, persisted paths, MIME types and byte lengths. The first file is primary; later files are required companions. Report \`warnings\` about limits of the written result.

For deterministic measurement runs, create or edit \`*.geospec.ts\` tests and use \`${toolName.testModel}\` instead.`,
  [toolName.getParameters]: `Read the admitted parameter manifest and current checked parameter record for one geometry source file.

Use resolutionMode "declared-only" when inferred semantics are not acceptable. The result includes stored values, semantic bindings, provenance, diagnostics, and the exact identity required by apply_parameter_operation. ${sourceRevisionRule} ${parameterUnitRule} Reading in the same mode never disturbs a pending source-unit plan; reading in a different mode rejects it. An "unresolved" result carries a diagnostic code: INVALID_RECORD means the saved values cannot be read and are preserved untouched, and RESOLUTION_SUPERSEDED means a concurrent read changed the mode.`,
  [toolName.applyParameterOperation]: `Propose one checked parameter operation, or confirm/cancel a plan a previous propose returned.

Every call names an action:
- action "propose" with targetFile, requestId, expected, pressure and operation.
- action "confirm" with targetFile, the proposal's requestId and its planFingerprint.
- action "cancel" with targetFile and the proposal's requestId.

Pass no other fields: confirm and cancel carry no operation, and propose carries no planFingerprint.

Call get_parameters first and pass its exact identity as expected. ${parameterUnitRule} Reuse requestId only for an identical retry. The returned outcome distinguishes committed, rejected, cancelled, known-not-applied, and indeterminate operations; inspect it before continuing. An outcome of "confirmation-required" carries a planFingerprint and applies nothing until you follow it with a confirm naming that fingerprint and the same requestId, or a cancel.

A value operation names its field by group and pointer, exactly as get_parameters lists them: native-value carries the number, unit-value carries text plus the inputUnit it was typed in. Nothing else identifies a field. Rejections: UNKNOWN_FIELD — fix the pointer, the manifest did not change; REPRESENTATION_UNSUPPORTED — address a scalar member, or send native-value for a field with no unit; STALE_MANIFEST — call get_parameters again.

A source-unit operation changes the unit the source interprets a value in, and is the operation that asks for confirmation. Only a binding with sourceUnitCapability admits it. Build it from get_parameters, with binding = manifest.bindings[pointer]: producerCapability is { producer: manifest.source.id, sourceRevision: manifest.source.revision, capability: binding.sourceUnitCapability }.`,
  [toolName.screenshot]: `Capture a declared model view for visual inspection.

Pass \`targetFile\` explicitly. Choose a kernel \`view\`, optional sheet/drawing \`instance\`, and that view's \`options\` from \`evaluate_model\`; omit \`view\` for the default. A 2D view produces one image. Each result echoes its view, instance and, for 3D, camera \`angle\`. The call fails for a missing source, unavailable view or instance, render failure, timeout or invalid image. ${sourceRevisionRule}

Modes (\`mode\`, default \`single\`):
- single: one deterministic perspective isometric image for a 3D view
- multi_angle: six orthographic camera angles for a 3D view (front, back, right, left, top, bottom)

Annotated 3D images include:
- an in-image view label; canonical axis-aligned labels name the camera position as View From ±axis
- a camera-aligned red-X, green-Y, blue-Z orientation indicator with dot/cross depth notation
- a physical scale bar; orthographic scale is depth-invariant, while perspective scale is measured at the subject-center plane and marked @ center

Use these annotations when reasoning about orientation, handedness, opposite faces, and size.`,
  [toolName.editFile]: `Replace text in one existing file. Read the file first and copy oldString with enough context to be unique. The edit tolerates only trailing whitespace and common Unicode punctuation differences. Set replaceAll only when every match should change. ${writeRevisionRule} Use create_file or delete_file for file lifecycle operations.`,
  [toolName.arrangeWorkbench]: arrangeWorkbenchDescription,
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
  [toolName.createFile]: `Create a file in the project filesystem, with the path relative to the project root.

Missing parent directories are created. An existing file at the path is overwritten without warning — read_file first when that matters. ${writeRevisionRule}`,
  [toolName.deleteFile]: `Delete a file from the project filesystem.

Fails gracefully when the file does not exist, when the operation is rejected for security reasons, or when the file cannot be deleted. ${writeRevisionRule}`,
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
  [toolName.updateTodos]: `Replace this chat's task list, the one the person watches above the composer while you work.

Send the whole list every time: an item you leave out is removed. Keep one item \`in_progress\` at a time and mark items \`done\` as they finish. Titles are short and outcome-shaped ("Slice the pyramid"), not step narration.

Returns the written path (\`.tau/chats/<chatId>/todo.yaml\`) and a count per status.`,
  [toolName.askQuestions]: `Ask the person 1–3 multiple-choice questions at a hard fork, keep the turn moving, and get their answers back.

Ask only what the person alone can decide and what changes the work: what to build, scope, intent, or a trade-off with no conventional default, especially a costly or irreversible one. Look up discoverable facts in files, the model and tools instead. Never ask for permission or "should I continue?". Usually ask one question; add another only when it is a second hard fork. Do not ask about what has a sensible default you can state and change later, such as size, detail or print settings.

Ask early, before investing in a direction. Put your recommendation first: it is adopted if nobody answers within waitSeconds. The person can always answer in their own words. Use waitSeconds 0 when you can start on the recommendation now.

Returns each answer and who settled it. Unless status is "answered", proceed with the recommended option and say once which you assumed; a later answer arrives as a message. Never repeat a question or write a multiple-choice question as prose.`,
  [toolName.getMachine]:
    'Read one bound machine: its readiness, loaded setup and printable envelope. Omit machineId when exactly one machine is bound; otherwise the error names every bound machine.',
  [toolName.requestPrint]: `The only way to print. Slices one CAD source file to a .gcode.3mf in the project and opens a print request on a bound machine; nothing is uploaded or started until a person accepts, which starts the print. A Tau-hosted turn waits for the answer and the start; elsewhere it returns the request awaiting-approval for the Print pane. Report the outcome as nextStep states it; an unconfirmed start is unknown, never "submitted" or "started". Never retry or work around a request with other machine tools. First run test_model, check the part fits get_machine's printable envelope, and call get_print_profiles. When get_machine shows no bedType, ask which plate is installed and pass it as plate. Under engine "bambu-studio" presets follow what the printer reports; change them with profiles and settings as get_print_profiles names them. Under the reference engine, options accept only ${requestPrintOptionKeys.join(', ')}.`,
  [toolName.getPrintProfiles]: `List the slicing presets and settings request_print can use for a bound machine. Read-only.

For a Bambu printer with Bambu Studio available it returns engine "bambu-studio": defaults (the presets chosen from the printer's model, nozzle, loaded filament and reported plate), the compatible printers, processes and filaments (source "user" marks the person's own), plates, and every setting's current value by group with enum choices. Pass profiles to read another selection, and keys for full descriptors (units, ranges, descriptions). Otherwise it returns engine "reference" and why. The project’s .tau/machines/settings/<typeId>.json retains named profiles shared by machines of that type. savedProfiles lists stable IDs and the active selection. Pass profileId to inspect or prepare a different saved profile without changing that selection. machinePreferences reports the exact profile and source versions used; request_print arguments override its sparse values. Edit the versioned record to change saved preferences.`,
  [toolName.getPrintRequest]:
    'Read one print request by its exact request ID: state, summary, receipts, any failure, and a nextStep saying what to tell the person and do next. A started request also says whether its run is still running or has ended; only get_machine says whether the machine is ready.',
  [toolName.listPrintRequests]:
    "List print requests, newest first, optionally for one machine. A started request's run says whether it is still running or has ended, so a finished print is not read as a busy machine.",
  [toolName.cancelPrint]:
    'Stop a print. Withdraws a request that has not started, or cancels the exact observed provider run of a started one, which stops the printer. Give requestId alone, or machineId with expectedProviderRunId.',
  [toolName.revisions]: `Read this project's saved revisions. Read-only.

Actions:
- describe: which branch the project is on, its current revision number, and every branch it holds
- log: that branch's revisions, newest first ({ action: 'log', limit: 10 })
- diff: the files that changed between two revisions ({ action: 'diff', from, to })

Use this to find out what changed and when — before rewriting a file someone
else just changed, when a user refers to "the last version", or to check whether
your own turn's edits were recorded.

Revisions are saved by Tau itself, never by you: there is no action here that
creates a branch, merges, restores, discards or syncs anything. Ask the user to
do those.`,
} as const;
