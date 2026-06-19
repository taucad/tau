import type { toolName } from '#constants/tool.constants.js';
import type { ListDirectoryOutput } from '#schemas/tools/list-directory.tool.schema.js';
import type { ReadFileOutput } from '#schemas/tools/read-file.tool.schema.js';
import type { UseSkillOutput } from '#schemas/tools/use-skill.tool.schema.js';
import type { CreateFileOutput } from '#schemas/tools/create-file.tool.schema.js';
import type { GrepOutput } from '#schemas/tools/grep.tool.schema.js';
import type { GlobSearchOutput } from '#schemas/tools/glob-search.tool.schema.js';
import type { GetKernelResultOutput } from '#schemas/tools/get-kernel-result.tool.schema.js';
import type { TestModelOutput } from '@taucad/testing';
import type { EditFileOutput } from '#schemas/tools/edit-file.tool.schema.js';
import type { ScreenshotOutput } from '#schemas/tools/screenshot.tool.schema.js';

/**
 * Type-only registry mapping tool names to their output types.
 * Used for type inference in tool result trimmers (no runtime validation needed
 * since validation happens upstream via the ChatRpc service).
 *
 * Includes both client tools and server-orchestrated tools that produce trimmable output.
 * @public
 */
export type ToolOutputRegistry = {
  [toolName.testModel]: TestModelOutput;
  [toolName.createFile]: CreateFileOutput;
  [toolName.editFile]: EditFileOutput;
  [toolName.getKernelResult]: GetKernelResultOutput;
  [toolName.useSkill]: UseSkillOutput;
  [toolName.readFile]: ReadFileOutput;
  [toolName.listDirectory]: ListDirectoryOutput;
  [toolName.grep]: GrepOutput;
  [toolName.globSearch]: GlobSearchOutput;
  [toolName.screenshot]: ScreenshotOutput;
};
