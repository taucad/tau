import { MessageChannel } from 'node:worker_threads';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { createChannelServer } from '@taucad/rpc';
import type { ChannelServer } from '@taucad/rpc';
import { agentChannelPort } from '#channel/endpoint.js';
import { agentWireCompatSchemas } from '#channel/wire-v1.js';
import type { AgentWireCompatProtocol } from '#channel/wire-v1.js';
import { agentWireVersion } from '#wire/frames.schema.js';
import type { AgentLauncher } from '#launchers/agent-launcher.js';
import { serveAgentChannel } from '#launchers/agent-channel.js';
import { createAgentChannelClient } from '#channel/agent-channel-client.js';
import type { ProjectTaskChannelPort } from '#wire/project-task-channel.schema.js';

describe('project tasks on the existing project channel', () => {
  it('never dispatches an unknown task method to an older owner with the same wire version', async () => {
    const ports = new MessageChannel();
    const implementation = mock<ChannelServer<AgentWireCompatProtocol>>();
    const server = createChannelServer<AgentWireCompatProtocol>({
      port: agentChannelPort(ports.port1),
      sessionKey: 'legacy-owner',
      hello: { wire: agentWireVersion, build: 'old-same-wire' },
      protocolSchemas: agentWireCompatSchemas,
      impl: implementation,
    });
    const client = createAgentChannelClient({ connect: () => ports.port2 });
    try {
      expect(await client.projectTasks({ operation: 'read', input: {} })).toMatchObject({
        kind: 'refused',
        code: 'TASK_UNAVAILABLE',
      });
      expect(implementation.call).not.toHaveBeenCalled();
    } finally {
      client.close();
      server.dispose('test finished');
      ports.port1.close();
      ports.port2.close();
    }
  });
  it('routes project controls separately from chat commands and rejects forged authority fields', async () => {
    const launcher = mock<AgentLauncher>();
    const projectTasks = mock<ProjectTaskChannelPort>();
    projectTasks.request.mockResolvedValue({
      kind: 'snapshot',
      snapshot: { tasks: [], messages: [], cursor: 4, nextCursor: 4, hasMore: false },
    });
    const ports = new MessageChannel();
    const server = serveAgentChannel(ports.port1, launcher, { build: 'test', projectTasks });
    const client = createAgentChannelClient({ connect: () => ports.port2 });
    try {
      const result = await client.projectTasks({ operation: 'read', input: {} });
      expect(result).toMatchObject({ kind: 'snapshot', snapshot: { cursor: 4 } });
      expect(projectTasks.request).toHaveBeenCalledWith({ operation: 'read', input: {} }, expect.any(AbortSignal));
      expect(launcher.execute).not.toHaveBeenCalled();
      const forged = {
        operation: 'send',
        input: { taskId: 'child', requestId: 'message', text: 'hello', senderTaskId: 'other' },
      } as const;
      await expect(client.projectTasks(forged)).rejects.toThrow();
      expect(projectTasks.request).toHaveBeenCalledTimes(1);
    } finally {
      client.close();
      server.dispose('test finished');
      ports.port1.close();
      ports.port2.close();
    }
  });
  it('returns an explicit unavailable result from owners without task authority', async () => {
    const ports = new MessageChannel();
    const server = serveAgentChannel(ports.port1, mock<AgentLauncher>(), { build: 'test' });
    const client = createAgentChannelClient({ connect: () => ports.port2 });
    try {
      expect(await client.projectTasks({ operation: 'read', input: {} })).toMatchObject({
        kind: 'refused',
        code: 'TASK_UNAVAILABLE',
      });
    } finally {
      client.close();
      server.dispose('test finished');
      ports.port1.close();
      ports.port2.close();
    }
  });
});
