import { z } from 'zod';
import { editFileInputSchema } from '#schemas/tools/edit-file.tool.schema.js';
import { webBrowserInputSchema } from '#schemas/tools/web-browser.tool.schema.js';
import { webSearchInputSchema } from '#schemas/tools/web-search.tool.schema.js';
import { readFileInputSchema } from '#schemas/tools/read-file.tool.schema.js';
import { useSkillInputSchema } from '#schemas/tools/use-skill.tool.schema.js';
import { listDirectoryInputSchema } from '#schemas/tools/list-directory.tool.schema.js';
import { createFileInputSchema } from '#schemas/tools/create-file.tool.schema.js';
import { deleteFileInputSchema } from '#schemas/tools/delete-file.tool.schema.js';
import { grepInputSchema } from '#schemas/tools/grep.tool.schema.js';
import { globSearchInputSchema } from '#schemas/tools/glob-search.tool.schema.js';
import { getKernelResultInputSchema } from '#schemas/tools/get-kernel-result.tool.schema.js';
import { screenshotInputSchema } from '#schemas/tools/screenshot.tool.schema.js';
import { exportGeometryInputSchema } from '#schemas/tools/export-geometry.tool.schema.js';
import { testModelInputSchema } from '#schemas/tools/test-model.tool.schema.js';
import type { ToolName } from '#types/tool.types.js';

/**
 * Empty-input schema enforced by `createEmptyInputToolSchemas` in
 * `message.schema.ts`. Transfer tools with no parameters only
 * accept the literal empty object on the wire; anything else is invalid input
 * and must be forensically demoted to `rawInput` by the server-side healing
 * transform. Defined locally to keep this registry the single source of truth
 * for "is this input legal for this tool?".
 */
const emptyInputSchema = z.record(z.string(), z.never());

/** @public */
export type ToolPartType = `tool-${ToolName}`;

/**
 * Maps every static tool part type (e.g. `tool-read_file`) to the strict Zod
 * schema enforced by `uiMessagesSchema` for that tool's `input` field.
 *
 * Used by the server-side healing preprocess in `message.schema.ts` to detect
 * persisted tool parts in `output-error` state whose `input` no longer
 * satisfies the strict per-tool schema (typically because the LLM stream was
 * interrupted before the input finished serialising). When such parts are
 * detected, the preprocess demotes the malformed value into `rawInput` so the
 * request can still flow through `convertToModelMessages` ->
 * `messageContentSanitizerMiddleware` and a synthetic `tool_result` can be
 * paired with the dangling `tool_use` block.
 *
 * Keys must remain in lock-step with the `toolPartSchemas` aggregation in
 * `message.schema.ts`. Keep this file as the single source of truth — adding
 * a tool means updating both places, but every consumer of the registry stays
 * compile-checked against `ToolPartType`.
 *
 * @public
 */
export const toolInputSchemas: Record<ToolPartType, z.ZodType> = {
  'tool-web_search': webSearchInputSchema,
  'tool-web_browser': webBrowserInputSchema,
  'tool-test_model': testModelInputSchema,
  'tool-use_skill': useSkillInputSchema,
  'tool-read_file': readFileInputSchema,
  'tool-list_directory': listDirectoryInputSchema,
  'tool-create_file': createFileInputSchema,
  'tool-edit_file': editFileInputSchema,
  'tool-delete_file': deleteFileInputSchema,
  'tool-grep': grepInputSchema,
  'tool-glob_search': globSearchInputSchema,
  'tool-get_kernel_result': getKernelResultInputSchema,
  'tool-export_geometry': exportGeometryInputSchema,
  'tool-screenshot': screenshotInputSchema,
  'tool-transfer_to_cad_expert': emptyInputSchema,
  'tool-transfer_to_research_expert': emptyInputSchema,
  'tool-transfer_back_to_supervisor': emptyInputSchema,
};

/**
 * Type-guard variant of {@link toolInputSchemas} lookup that accepts the
 * unconstrained `string` type (e.g. `part.type` from a discriminated union)
 * and returns the matching schema or `undefined` for `dynamic-tool` and
 * unknown tool variants.
 *
 * @public
 */
export const getToolInputSchema = (toolPartType: string): z.ZodType | undefined =>
  Object.hasOwn(toolInputSchemas, toolPartType) ? toolInputSchemas[toolPartType as ToolPartType] : undefined;
