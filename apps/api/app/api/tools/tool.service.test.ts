// @vitest-environment node
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import type { ToolName } from '@taucad/chat';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { toolName } from '@taucad/chat/constants';
import { ToolService } from '#api/tools/tool.service.js';

describe('ToolService.getTools', () => {
  let service: ToolService;
  let module: TestingModule;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [ToolService, { provide: ConfigService, useValue: { get: vi.fn(() => 'fake-tavily-key') } }],
    }).compile();
    service = moduleRef.get<ToolService>(ToolService);
    module = moduleRef;
  });

  afterEach(async () => {
    await module.close();
  });

  describe('per-kernel cache', () => {
    it('returns the same tool instance across repeated calls for the same kernel', () => {
      const a = service.getTools('auto', 'openscad').tools[toolName.testModel];
      const b = service.getTools('auto', 'openscad').tools[toolName.testModel];
      expect(a).toBeDefined();
      expect(a).toBe(b);
    });

    it('returns distinct tool instances for different kernels', () => {
      const openscadTool = service.getTools('auto', 'openscad').tools[toolName.testModel];
      const replicadTool = service.getTools('auto', 'replicad').tools[toolName.testModel];
      expect(openscadTool).toBeDefined();
      expect(replicadTool).toBeDefined();
      expect(openscadTool).not.toBe(replicadTool);
    });

    it('should not expose the legacy edit_tests tool in the active agent toolbelt', () => {
      const { tools } = service.getTools('auto', 'replicad');
      expect(Object.hasOwn(tools, 'edit_tests')).toBe(false);
    });
  });

  describe('selection passthrough', () => {
    it('returns resolvedToolChoice for plain choice values', () => {
      const { resolvedToolChoice } = service.getTools('auto', 'openscad');
      expect(resolvedToolChoice).toBe('auto');
    });

    it('filters tools when an array choice is provided', () => {
      const { tools, resolvedToolChoice } = service.getTools([toolName.testModel], 'openscad');
      expect(Object.keys(tools)).toEqual([toolName.testModel]);
      expect(resolvedToolChoice).toBe('required');
    });

    it('should ignore legacy edit_tests if it is requested explicitly', () => {
      const { tools, resolvedToolChoice } = service.getTools(['edit_tests' as ToolName], 'openscad');
      expect(tools).toEqual({});
      expect(resolvedToolChoice).toBe('required');
    });
  });
});
