import { describe, expect, it, vi } from 'vitest';
import type { FastifyReply } from 'fastify';
import type { ChatTurnRequest } from '@taucad/chat/schemas';
import { ChatController } from '#api/chat/chat.controller.js';
import type { ChatService } from '#api/chat/chat.service.js';

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
  execution: { workspaceId: 'workspace_1', baseRevisionId: 'rev_1', hostId: 'host_1' },
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
  const value = { header: vi.fn(), status: vi.fn(), send: vi.fn() };
  value.header.mockReturnValue(value);
  value.status.mockReturnValue(value);
  value.send.mockReturnValue(value);
  return value as unknown as FastifyReply;
};

/** The one shape `sendSimpleModelStream` consumes off a `streamText` result. */
const streamResult = () => ({
  toUIMessageStream: vi.fn(
    () =>
      new ReadableStream({
        start(controller) {
          controller.close();
        },
      }),
  ),
});

const harness = () => {
  const chatService = {
    getBuildNameGenerator: vi.fn(streamResult),
    getCommitMessageGenerator: vi.fn(streamResult),
  };
  return { controller: new ChatController(chatService as unknown as ChatService), chatService };
};

describe('ChatController after the API chat plane deletion', () => {
  it('streams the project-name generator', async () => {
    const { controller, chatService } = harness();

    await controller.createChat(generatorBody('project_name'), 'user_1', reply());

    expect(chatService.getBuildNameGenerator).toHaveBeenCalledOnce();
    expect(chatService.getCommitMessageGenerator).not.toHaveBeenCalled();
  });

  it('streams the commit-message generator', async () => {
    const { controller, chatService } = harness();

    await controller.createChat(generatorBody('commit_name'), 'user_1', reply());

    expect(chatService.getCommitMessageGenerator).toHaveBeenCalledOnce();
    expect(chatService.getBuildNameGenerator).not.toHaveBeenCalled();
  });

  it.each([
    ['tau', { kind: 'tau', model: 'openai-gpt-5.5' }],
    ['paseo', { kind: 'paseo', connectionId: 'connection_1', agentId: 'agent_1' }],
    ['acp', { kind: 'acp', hostId: 'origin', agentId: 'codex' }],
  ] as const)('refuses a %s CAD turn with a typed placement error', async (_kind, execution) => {
    const { controller, chatService } = harness();
    const request = cadBody();
    if (request.agent.profile !== 'cad') {
      throw new Error('Expected a CAD agent request');
    }
    request.agent.execution = execution;

    await expect(controller.createChat(request, 'user_1', reply())).rejects.toMatchObject({
      status: 400,
      response: { code: 'CHAT_CAD_NOT_API_PLACED' },
    });
    expect(chatService.getBuildNameGenerator).not.toHaveBeenCalled();
    expect(chatService.getCommitMessageGenerator).not.toHaveBeenCalled();
  });

  it('exposes no run-directory, stream, or cancellation route', () => {
    const { controller } = harness();
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(controller)).filter(
      (name) => name !== 'constructor',
    );

    expect(methods).toEqual(['createChat']);
  });
});
