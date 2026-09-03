import type { z } from 'zod';
import { editFileInputSchema, editFileOutputSchema } from '#schemas/tools/edit-file.tool.schema.js';
import { webBrowserInputSchema, webBrowserOutputSchema } from '#schemas/tools/web-browser.tool.schema.js';
import { webSearchInputSchema, webSearchOutputSchema } from '#schemas/tools/web-search.tool.schema.js';
import { readFileInputSchema, readFileOutputSchema } from '#schemas/tools/read-file.tool.schema.js';
import { useSkillInputSchema, useSkillOutputSchema } from '#schemas/tools/use-skill.tool.schema.js';
import { listDirectoryInputSchema, listDirectoryOutputSchema } from '#schemas/tools/list-directory.tool.schema.js';
import { createFileInputSchema, createFileOutputSchema } from '#schemas/tools/create-file.tool.schema.js';
import { deleteFileInputSchema, deleteFileOutputSchema } from '#schemas/tools/delete-file.tool.schema.js';
import { grepInputSchema, grepOutputSchema } from '#schemas/tools/grep.tool.schema.js';
import { globSearchInputSchema, globSearchOutputSchema } from '#schemas/tools/glob-search.tool.schema.js';
import {
  getKernelResultInputSchema,
  getKernelResultOutputSchema,
} from '#schemas/tools/get-kernel-result.tool.schema.js';
import { screenshotInputSchema, screenshotOutputSchema } from '#schemas/tools/screenshot.tool.schema.js';
import { exportGeometryInputSchema, exportGeometryOutputSchema } from '#schemas/tools/export-geometry.tool.schema.js';
import { testModelInputSchema, testModelOutputSchema } from '#schemas/tools/test-model.tool.schema.js';
import { transferToolInputSchema, transferToolOutputSchema } from '#schemas/tools/transfer-tool.schema.js';
import { toolName } from '#constants/tool.constants.js';
import type { ToolName } from '#types/tool.types.js';

/** @public */
export type ToolPartType = `tool-${ToolName}`;

/**
 * Maps every static tool part type (e.g. `tool-read_file`) to the strict Zod
 * schema enforced by `safeValidateUiMessages` for that tool's `input` field.
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
 * This registry is the single source of truth consumed by both AI SDK message
 * validation and Tau's lifecycle checks.
 *
 * @public
 */
export const uiMessageTools = {
  [toolName.webSearch]: { inputSchema: webSearchInputSchema, outputSchema: webSearchOutputSchema },
  [toolName.webBrowser]: { inputSchema: webBrowserInputSchema, outputSchema: webBrowserOutputSchema },
  [toolName.testModel]: { inputSchema: testModelInputSchema, outputSchema: testModelOutputSchema },
  [toolName.useSkill]: { inputSchema: useSkillInputSchema, outputSchema: useSkillOutputSchema },
  [toolName.readFile]: { inputSchema: readFileInputSchema, outputSchema: readFileOutputSchema },
  [toolName.listDirectory]: { inputSchema: listDirectoryInputSchema, outputSchema: listDirectoryOutputSchema },
  [toolName.createFile]: { inputSchema: createFileInputSchema, outputSchema: createFileOutputSchema },
  [toolName.editFile]: { inputSchema: editFileInputSchema, outputSchema: editFileOutputSchema },
  [toolName.deleteFile]: { inputSchema: deleteFileInputSchema, outputSchema: deleteFileOutputSchema },
  [toolName.grep]: { inputSchema: grepInputSchema, outputSchema: grepOutputSchema },
  [toolName.globSearch]: { inputSchema: globSearchInputSchema, outputSchema: globSearchOutputSchema },
  [toolName.getKernelResult]: { inputSchema: getKernelResultInputSchema, outputSchema: getKernelResultOutputSchema },
  [toolName.exportGeometry]: { inputSchema: exportGeometryInputSchema, outputSchema: exportGeometryOutputSchema },
  [toolName.screenshot]: { inputSchema: screenshotInputSchema, outputSchema: screenshotOutputSchema },
  [toolName.transferToCadExpert]: { inputSchema: transferToolInputSchema, outputSchema: transferToolOutputSchema },
  [toolName.transferToResearchExpert]: { inputSchema: transferToolInputSchema, outputSchema: transferToolOutputSchema },
  [toolName.transferBackToSupervisor]: { inputSchema: transferToolInputSchema, outputSchema: transferToolOutputSchema },
} as const;

/** Static tool-part input schemas used by lifecycle normalization. @public */
export const toolInputSchemas = Object.fromEntries(
  Object.entries(uiMessageTools).map(([name, tool]) => [`tool-${name}`, tool.inputSchema]),
) as unknown as Record<ToolPartType, z.ZodType>;

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
