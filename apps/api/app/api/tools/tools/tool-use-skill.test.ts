// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { ToolRuntime } from '@langchain/core/tools';
import { InMemoryStore } from '@langchain/langgraph';
import { rpcName } from '@taucad/chat/constants';
import { rpcClientErrorCode } from '@taucad/chat';
import { ToolError } from '@taucad/chat/utils';
import type { ChatRpcConfigurable } from '#api/tools/tool.types.js';
import { recentSkillsIndexKey, recentSkillsRootNamespace } from '#api/chat/recent-skills-namespace.js';
import { createUseSkillTool, useSkillToolDefinition } from '#api/tools/tools/tool-use-skill.js';

type UseSkillInvoke = {
  invoke(input: { skillName: string; reason?: string }, runtime: ToolRuntime): Promise<unknown>;
};

const chatId = 'chat-skill-test';
const namespace = [...recentSkillsRootNamespace, chatId];

function buildRuntime(options: {
  readonly chatRpcService: ChatRpcConfigurable['chatRpcService'];
  readonly store?: InMemoryStore;
  readonly writer?: (chunk: unknown) => void;
}): ToolRuntime {
  return {
    toolCallId: 'tc-use-skill',
    store: options.store,
    writer: options.writer,
    configurable: {
      chatRpcService: options.chatRpcService,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- LangGraph uses snake_case for configurable thread id.
      thread_id: chatId,
    },
  } as unknown as ToolRuntime;
}

describe('useSkillToolDefinition', () => {
  it('should tell the agent not to use read_file for skill activation', () => {
    expect(useSkillToolDefinition.description).toContain('use this tool');
    expect(useSkillToolDefinition.description).toContain('Do not use read_file to activate a skill');
    expect(useSkillToolDefinition.description).toContain('records skill usage through the use_skill tool call');
    expect(useSkillToolDefinition.description).not.toContain('stream event');
  });
});

describe('createUseSkillTool', () => {
  it('should read the resolved .agents skill markdown without read_file gutters and persist recent-skill metadata', async () => {
    const chatRpcService = mock<ChatRpcConfigurable['chatRpcService']>();
    chatRpcService.sendRpcRequest.mockImplementation(async (request) => {
      if (request.rpcName === rpcName.resolveSkill) {
        return {
          success: true,
          skillName: 'woodworking',
          description: 'Woodworking help',
          source: 'user',
          enabled: true,
          resourceUri: 'file:.agents/skills/woodworking/SKILL.md',
          skillPath: '.agents/skills/woodworking/SKILL.md',
          baseDirectory: '.agents/skills/woodworking',
          fingerprint: 'woodhash',
          frontmatter: { name: 'woodworking', description: 'Wood' },
          content: '---\nname: woodworking\ndescription: Wood\n---\n\n# Woodworking',
          supportingFiles: ['.agents/skills/woodworking/references'],
        };
      }
      throw new Error(`Unexpected RPC ${String(request.rpcName)}`);
    });
    const writer = vi.fn();
    const store = new InMemoryStore();
    const tool = createUseSkillTool() as unknown as UseSkillInvoke;

    const result = await tool.invoke(
      { skillName: 'woodworking', reason: 'Need joinery guidance' },
      buildRuntime({ chatRpcService, store, writer }),
    );

    expect(result).toEqual(
      expect.objectContaining({
        skillName: 'woodworking',
        resourceUri: 'file:.agents/skills/woodworking/SKILL.md',
        skillPath: '.agents/skills/woodworking/SKILL.md',
        baseDirectory: '.agents/skills/woodworking',
        source: 'user',
        fingerprint: 'woodhash',
        content: '---\nname: woodworking\ndescription: Wood\n---\n\n# Woodworking',
        supportingFiles: ['.agents/skills/woodworking/references'],
      }),
    );
    expect((result as { content: string }).content).not.toContain('\t# Woodworking');
    expect(chatRpcService.sendRpcRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        rpcName: rpcName.resolveSkill,
        args: { skillName: 'woodworking' },
      }),
    );
    expect(writer).not.toHaveBeenCalled();
    const storedSkill = await store.get(namespace, 'woodworking');
    expect(storedSkill?.value).toEqual(
      expect.objectContaining({
        skillName: 'woodworking',
        resourceUri: 'file:.agents/skills/woodworking/SKILL.md',
        fingerprint: 'woodhash',
        content: '---\nname: woodworking\ndescription: Wood\n---\n\n# Woodworking',
      }),
    );
    const storedIndex = await store.get(namespace, recentSkillsIndexKey);
    expect(storedIndex?.value).toEqual({ names: ['woodworking'] });
  });

  it('should resolve a virtual system create-skill entry through resolve_skill', async () => {
    const chatRpcService = mock<ChatRpcConfigurable['chatRpcService']>();
    chatRpcService.sendRpcRequest.mockImplementation(async (request) => {
      if (request.rpcName === rpcName.resolveSkill) {
        return {
          success: true,
          skillName: 'create-skill',
          description: 'Create or update Tau agent skills',
          source: 'system',
          enabled: true,
          resourceUri: 'system:skills/create-skill/SKILL.md',
          version: '1.0.0',
          fingerprint: 'systemhash',
          frontmatter: { name: 'create-skill', source: 'system' },
          content:
            '---\nname: create-skill\ndescription: Create or update Tau agent skills\nsource: system\n---\n\n# Create Skill',
          supportingFiles: [],
        };
      }
      throw new Error(`Unexpected RPC ${String(request.rpcName)}`);
    });
    const writer = vi.fn();
    const tool = createUseSkillTool() as unknown as UseSkillInvoke;

    const result = await tool.invoke({ skillName: 'create-skill' }, buildRuntime({ chatRpcService, writer }));

    expect(result).toEqual(
      expect.objectContaining({
        skillName: 'create-skill',
        resourceUri: 'system:skills/create-skill/SKILL.md',
        source: 'system',
        fingerprint: 'systemhash',
        supportingFiles: [],
      }),
    );
    expect(chatRpcService.sendRpcRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        rpcName: rpcName.resolveSkill,
        args: { skillName: 'create-skill' },
      }),
    );
    expect(writer).not.toHaveBeenCalled();
  });

  it('should throw a typed tool error for an unknown skill resolved by RPC', async () => {
    const chatRpcService = mock<ChatRpcConfigurable['chatRpcService']>();
    chatRpcService.sendRpcRequest.mockResolvedValue({
      success: false,
      errorCode: rpcClientErrorCode.skillNotFound,
      message: 'Skill not found: missing',
    });
    const tool = createUseSkillTool() as unknown as UseSkillInvoke;

    try {
      await tool.invoke({ skillName: 'missing' }, buildRuntime({ chatRpcService }));
      expect.fail('Expected use_skill to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ToolError);
      expect((error as ToolError).data).toEqual(
        expect.objectContaining({
          errorCode: 'TOOL_EXECUTION_ERROR',
          message: 'Unknown skill: missing',
          toolName: 'use_skill',
          toolCallId: 'tc-use-skill',
        }),
      );
    }
    expect(chatRpcService.sendRpcRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        rpcName: rpcName.resolveSkill,
        args: { skillName: 'missing' },
      }),
    );
  });

  it('should reject disabled resolved skills without returning content to the model', async () => {
    const chatRpcService = mock<ChatRpcConfigurable['chatRpcService']>();
    chatRpcService.sendRpcRequest.mockResolvedValue({
      success: true,
      skillName: 'disabled',
      description: 'Nope',
      source: 'user',
      enabled: false,
      resourceUri: 'file:.agents/skills/disabled/SKILL.md',
      skillPath: '.agents/skills/disabled/SKILL.md',
      baseDirectory: '.agents/skills/disabled',
      frontmatter: { name: 'disabled' },
      content: '# Disabled',
      supportingFiles: [],
    });
    const tool = createUseSkillTool() as unknown as UseSkillInvoke;

    try {
      await tool.invoke({ skillName: 'disabled' }, buildRuntime({ chatRpcService }));
      expect.fail('Expected use_skill to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ToolError);
      expect((error as ToolError).data).toEqual(
        expect.objectContaining({
          errorCode: 'TOOL_EXECUTION_ERROR',
          message: 'Skill is disabled: disabled',
          toolName: 'use_skill',
        }),
      );
    }
  });
});
