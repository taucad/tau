import type { ToolRuntime } from '@langchain/core/tools';
import { tool } from '@langchain/core/tools';
import type { BaseStore } from '@langchain/langgraph';
import type { ChatTool, UseSkillInput, UseSkillOutput } from '@taucad/chat';
import { useSkillInputSchema, rpcClientErrorCode } from '@taucad/chat';
import { assertRpcSuccess, ToolError } from '@taucad/chat/utils';
import { rpcName, toolName } from '@taucad/chat/constants';
import type { ChatRpcConfigurable } from '#api/tools/tool.types.js';
import { recentSkillsIndexKey, recentSkillsRootNamespace } from '#api/chat/recent-skills-namespace.js';

export const useSkillToolDefinition = {
  name: toolName.useSkill,
  description: `Activate one available workspace skill by name and read its full SKILL.md instructions.

Use this tool when the user's task matches a skill listed in the system prompt or selected by the user. The tool resolves the selected skill through the client skill resolver, reads only that skill's instructions, records skill usage through the use_skill tool call, and returns raw markdown for you to follow.

When NOT to use:
- Do not call for every available skill up front.
- Do not use read_file to activate a skill; use this tool so skill usage is visible in the transcript.
- Do not call for unknown skills unless the user explicitly named a newly installed skill.`,
  schema: useSkillInputSchema,
} as const;

export function createUseSkillTool(): ChatTool<
  typeof useSkillInputSchema,
  UseSkillInput,
  UseSkillOutput,
  typeof toolName.useSkill
> {
  return tool(async (args, runtime: ToolRuntime) => {
    const { chatRpcService, thread_id: chatId } = runtime.configurable as ChatRpcConfigurable;
    const { toolCallId } = runtime;

    const result = await chatRpcService.sendRpcRequest({
      chatId,
      toolCallId,
      rpcName: rpcName.resolveSkill,
      args: { skillName: args.skillName },
    });

    assertRpcSuccess(result, {
      toolName: toolName.useSkill,
      toolCallId,
      clientErrorMessage(error) {
        if (error.errorCode === rpcClientErrorCode.skillNotFound) {
          return `Unknown skill: ${args.skillName}`;
        }
        return `Cannot resolve skill "${args.skillName}"`;
      },
    });

    if (result.enabled === false) {
      throw new ToolError({
        errorCode: 'TOOL_EXECUTION_ERROR',
        message: `Skill is disabled: ${result.skillName}`,
        toolName: toolName.useSkill,
        toolCallId,
      });
    }

    const output: UseSkillOutput = {
      skillName: result.skillName,
      resourceUri: result.resourceUri,
      ...(result.skillPath !== undefined && { skillPath: result.skillPath }),
      ...(result.baseDirectory !== undefined && { baseDirectory: result.baseDirectory }),
      source: result.source,
      ...(result.fingerprint !== undefined && { fingerprint: result.fingerprint }),
      frontmatter: result.frontmatter,
      content: result.content,
      supportingFiles: result.supportingFiles,
    };

    const store = runtime.store ? (runtime.store as unknown as BaseStore) : undefined;
    if (store) {
      const namespace = [...recentSkillsRootNamespace, chatId];
      const index = await store.get(namespace, recentSkillsIndexKey);
      const existingNames =
        index && Array.isArray((index.value as { names?: unknown }).names)
          ? (index.value as { names: string[] }).names
          : [];
      const names = [output.skillName, ...existingNames.filter((name) => name !== output.skillName)].slice(0, 8);

      await store.put(namespace, output.skillName, {
        skillName: output.skillName,
        resourceUri: output.resourceUri,
        skillPath: output.skillPath,
        baseDirectory: output.baseDirectory,
        source: output.source,
        fingerprint: output.fingerprint,
        content: output.content,
        usedAt: new Date().toISOString(),
      });
      await store.put(namespace, recentSkillsIndexKey, { names });
    }

    return output;
  }, useSkillToolDefinition) as unknown as ChatTool<
    typeof useSkillInputSchema,
    UseSkillInput,
    UseSkillOutput,
    typeof toolName.useSkill
  >;
}
