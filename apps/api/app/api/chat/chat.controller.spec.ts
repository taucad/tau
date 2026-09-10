import { describe, expect, it } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { Reflector } from '@nestjs/core';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ChatTurnRequest } from '@taucad/chat/schemas';
import { ChatController } from '#api/chat/chat.controller.js';
import type { ChatService } from '#api/chat/chat.service.js';

/** Nest's own `METHOD_METADATA` key: `@nestjs/common/constants` is not an exported subpath of the installed package. */
const methodMetadataKey = 'method';

const generatorBody = (profile: 'project_name' | 'commit_name'): ChatTurnRequest => ({
  id: 'chat_1',
  projectId: 'proj_1',
  admission: { version: 1, idempotencyKey: 'request_chat_1_00000000' },
  messages: [{ id: 'msg_1', role: 'user', parts: [{ type: 'text', text: 'hello' }] }],
  agent: { profile },
});

const cadBody = (): ChatTurnRequest => ({
  id: 'chat_1',
  projectId: 'proj_1',
  execution: { hostId: 'host_1', mode: 'direct', workspaceId: 'workspace_1', baseRevisionId: 'rev_1' },
  admission: { version: 1, idempotencyKey: 'request_chat_1_00000000' },
  messages: [{ id: 'msg_1', role: 'user', parts: [{ type: 'text', text: 'hello' }] }],
  agent: {
    profile: 'cad',
    execution: { kind: 'tau', model: 'openai-gpt-5.5' },
    kernel: 'replicad',
    mode: 'agent',
    toolChoice: 'auto',
    testingEnabled: true,
  },
});

const reply = (): FastifyReply => {
  const value = mockDeep<FastifyReply>();
  Object.defineProperty(value.raw, 'writableFinished', { value: false });
  value.header.mockReturnThis();
  value.status.mockReturnThis();
  value.send.mockReturnThis();
  value.raw.once.mockReturnThis();
  return value;
};
const fastifyRequest = (): FastifyRequest => {
  const value = mockDeep<FastifyRequest>();
  Object.defineProperty(value, 'query', { value: {} });
  value.raw.once.mockReturnThis();
  return value;
};

const streamResult = () =>
  ({
    state: 'streaming',
    operationId: 'operation',
    response: new Response(
      new ReadableStream({
        start(controller) {
          controller.close();
        },
      }),
      { status: 200, headers: { 'content-type': 'text/event-stream' } },
    ),
    completion: Promise.resolve(),
  }) as const;

const harness = () => {
  const chatService = mockDeep<ChatService>();
  chatService.getBuildNameGenerator.mockResolvedValue(streamResult());
  chatService.getCommitMessageGenerator.mockResolvedValue(streamResult());
  return { controller: new ChatController(chatService), chatService };
};

describe('ChatController after the API chat plane deletion', () => {
  it('streams the project-name generator', async () => {
    const { controller, chatService } = harness();
    const response = reply();

    await controller.createChat(generatorBody('project_name'), 'user_1', fastifyRequest(), response);

    expect(chatService.getBuildNameGenerator).toHaveBeenCalledOnce();
    expect(chatService.getCommitMessageGenerator).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.send).toHaveBeenCalledOnce();
  });

  it('streams the commit-message generator', async () => {
    const { controller, chatService } = harness();
    const response = reply();

    await controller.createChat(generatorBody('commit_name'), 'user_1', fastifyRequest(), response);

    expect(chatService.getCommitMessageGenerator).toHaveBeenCalledOnce();
    expect(chatService.getBuildNameGenerator).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.send).toHaveBeenCalledOnce();
  });

  it.each([
    ['tau', { kind: 'tau', model: 'openai-gpt-5.5' }],
    ['acp', { kind: 'acp', hostId: 'origin', agentId: 'codex' }],
  ] as const)('refuses a %s CAD turn with a typed placement error', async (_kind, execution) => {
    const { controller, chatService } = harness();
    const request = cadBody();
    if (request.agent.profile !== 'cad') {
      throw new Error('Expected a CAD agent request');
    }
    request.agent.execution = execution;

    await expect(controller.createChat(request, 'user_1', fastifyRequest(), reply())).rejects.toMatchObject({
      status: 400,
      response: { code: 'CHAT_CAD_NOT_API_PLACED' },
    });
    expect(chatService.getBuildNameGenerator).not.toHaveBeenCalled();
    expect(chatService.getCommitMessageGenerator).not.toHaveBeenCalled();
  });

  it('exposes no run-directory, stream, or cancellation route', () => {
    const { controller } = harness();
    const prototype = Object.getPrototypeOf(controller) as Record<string, unknown>;
    const reflector = new Reflector();
    const methods = Object.getOwnPropertyNames(prototype).filter(
      (name) =>
        typeof prototype[name] === 'function' && reflector.get(methodMetadataKey, prototype[name]) !== undefined,
    );

    expect(methods).toEqual(['createChat']);
  });
});
