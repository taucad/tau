/** Real project host, filesystem authority, revisions and loopback MCP composition for task qualification. */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel } from 'node:worker_threads';

import { createGatewayModelTransport } from '@taucad/agent-host';
import type { AgentLogEvent } from '@taucad/agent-host';
import { NodeFsChannel, NodeFsProviderClient } from '@taucad/filesystem/backend';
import { NodeFsAuthorityHost, serveNodeFsProvider, toNodeFsPort } from '@taucad/filesystem/backend/node';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';

import { openProjectHost } from '#project-host.js';
import type { ProjectHost, ProjectHostOptions, ProjectHostRuntimeClient } from '#project-host.js';
import { projectTaskChannelAnswerSchema } from '@taucad/agent-host/wire';
import type {
  ProjectTaskRead,
  ProjectTaskSnapshot,
  ProjectTaskSend,
  ProjectTaskAction,
  ProjectTaskMessage,
  ProjectTask,
  ProjectTaskChannelRequest,
  ProjectTaskChannelAnswer,
} from '@taucad/agent-host/wire';
import { connectMcpOverFetch } from '#acp/fixtures/mcp-fetch-client.js';
import type { McpToolResult } from '#acp/fixtures/mcp-fetch-client.js';
import type { AcpAdapter } from '#acp/registry.js';
import type { HostRevisionEvent } from '#revisions.js';

/** Harness retains revision facts and actual authored files until explicit close. */
export type ProjectTasksHarness = Readonly<{
  host: ProjectHost;
  drained: (signal: AbortSignal) => Promise<void>;
  workspaceRoot: string;
  checkoutsDirectory: string;
  revisions: HostRevisionEvent[];
  readLog: (chatId: string) => Promise<readonly AgentLogEvent[]>;
  tasks: Readonly<{
    read: (input?: ProjectTaskRead) => Promise<ProjectTaskSnapshot>;
    send: (input: ProjectTaskSend) => Promise<ProjectTaskMessage>;
    cancel: (input: ProjectTaskAction) => Promise<ProjectTask>;
  }>;
  invokeTaskTool: (
    input: Readonly<{ chatId: string; runId: string; tool: string; arguments: Record<string, unknown> }>,
  ) => Promise<McpToolResult>;
  close: (options?: Readonly<{ preserve?: boolean }>) => Promise<void>;
}>;

/**
 * Open the same rooted authority and project composition as a desktop host.
 * @param options - Real adapters and optional existing project paths.
 * @returns The owning host and deterministic cleanup.
 */
export const createProjectTasksHarness = async (
  options: Readonly<{
    agents: readonly AcpAdapter[];
    runtimeClient?: ProjectHostOptions['runtimeClient'];
    modelTransport?: ProjectHostOptions['modelTransport'];
    model?: ProjectHostOptions['model'];
    tauAcp?: ProjectHostOptions['tauAcp'];
    reopen?: { workspaceRoot: string; checkoutsDirectory: string };
  }>,
): Promise<ProjectTasksHarness> => {
  const sandbox = await mkdtemp(join(tmpdir(), 'tau-project-tasks-'));
  const workspaceRoot = options.reopen?.workspaceRoot ?? join(sandbox, 'project');
  const checkoutsDirectory = options.reopen?.checkoutsDirectory ?? join(sandbox, 'checkouts');
  await mkdir(workspaceRoot, { recursive: true });
  if (!options.reopen) {
    await writeFile(join(workspaceRoot, 'main.scad'), 'cube(10);\n');
    await mkdir(join(workspaceRoot, '.tau'), { recursive: true });
    await writeFile(
      join(workspaceRoot, '.tau', 'AGENTS.md'),
      'Project instruction nonce: INHERITED_CONTEXT_NONCE. Preserve the cube.\n',
    );
  }
  const authorityDirectory = join(sandbox, 'authority');
  await mkdir(authorityDirectory);
  const authority = new NodeFsAuthorityHost({
    authorityDirectory: () => authorityDirectory,
    authorityIdentity: () => 'project-task-integration',
  });
  const admissions = new Map<string, number>([[workspaceRoot, 1]]);
  const ports = new MessageChannel();
  const stop = serveNodeFsProvider(toNodeFsPort(ports.port1), {
    authority,
    allowRoot: (root) => (admissions.get(root) ?? 0) > 0,
    policy: tauPathPolicy,
  });
  const channel = new NodeFsChannel(toNodeFsPort(ports.port2));
  const runtime: ProjectHostRuntimeClient = {
    capabilities: undefined,
    connect: async () => undefined,
    open: () => {
      throw new Error('CAD runtime is not configured in this task-only harness.');
    },
    transcode: async () => {
      throw new Error('CAD runtime is not configured in this task-only harness.');
    },
    describe: async () => ({
      success: false,
      kernelId: undefined,
      issues: [
        {
          code: 'SEMANTICS_UNRESOLVED',
          message: 'No CAD parameter declarations in this fixture.',
          severity: 'error',
        },
      ],
    }),
  };
  const hostRef: { current?: ProjectHost } = {};
  const server = createServer((request, response) => {
    const handle = async (): Promise<void> => {
      try {
        if (!hostRef.current?.mcp) {
          response.writeHead(503).end();
          return;
        }
        await hostRef.current.mcp.handle(request, response);
      } catch {
        if (!response.headersSent) {
          response.writeHead(500);
        }
        response.end();
      }
    };
    // async-iife: bootstrap -- the HTTP server owns each request response lifetime.
    void handle();
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (typeof address !== 'object' || address === null) {
    throw new Error('MCP server did not open a port.');
  }
  const revisions: HostRevisionEvent[] = [];
  const opened = openProjectHost({
    workspaceRoot,
    checkoutsDirectory,
    projectId: 'project-task-integration',
    fileSystem: {
      open: (root) => new NodeFsProviderClient(channel, root),
      admit: (root) => {
        admissions.set(root, (admissions.get(root) ?? 0) + 1);
        return () => {
          admissions.set(root, Math.max(0, (admissions.get(root) ?? 0) - 1));
        };
      },
      mutate: async (target, mutation) =>
        authority.run({ root: target.parentRoot, paths: [target.targetPath] }, mutation),
    },
    runtimeClient: options.runtimeClient ?? (async () => runtime),
    geospecRunner: async () => {
      throw new Error('No GeoSpec runner in this task-only harness.');
    },
    apiBaseUrl: 'http://127.0.0.1:1',
    systemPrompt: 'You are working in a disposable task qualification project.',
    tauAcp: options.tauAcp,
    model: options.model,
    modelTransport:
      options.modelTransport ??
      createGatewayModelTransport({
        baseUrl: 'http://127.0.0.1:1/',
        projectId: 'project-task-integration',
      }),
    credential: () => ({ mode: 'session' }),
    externalAgents: {
      agents: options.agents,
      mcpUrl: () => `http://127.0.0.1:${address.port}/mcp`,
    },
    onRevisionEvent: (event) => {
      revisions.push(event);
    },
  });
  const project = opened.host;
  hostRef.current = project;
  const request = async (input: ProjectTaskChannelRequest): Promise<ProjectTaskChannelAnswer> => {
    const answer = projectTaskChannelAnswerSchema.parse(await project.projectTasks.request(input));
    if (answer.kind === 'refused') {
      throw Object.assign(new Error(answer.message), { name: 'ProjectTaskChannelError', code: answer.code });
    }
    return answer;
  };
  await request({ operation: 'read', input: {} });
  let closed = false;
  return {
    host: project,
    drained: opened.drained,
    workspaceRoot,
    checkoutsDirectory,
    revisions,
    tasks: {
      read: async (input = {}) => {
        const answer = await request({ operation: 'read', input });
        if (answer.kind !== 'snapshot') {
          throw new Error('Task channel returned the wrong answer.');
        }
        return answer.snapshot;
      },
      send: async (input) => {
        const answer = await request({ operation: 'send', input });
        if (answer.kind !== 'message') {
          throw new Error('Task channel returned the wrong answer.');
        }
        return answer.message;
      },
      cancel: async (input) => {
        const answer = await request({ operation: 'cancel', input });
        if (answer.kind !== 'task') {
          throw new Error('Task channel returned the wrong answer.');
        }
        return answer.task;
      },
    },
    invokeTaskTool: async (input) => {
      if (!project.mcp) {
        throw new Error('Task MCP endpoint is unavailable.');
      }
      const capability = project.mcp.mint({ chatId: input.chatId, runId: input.runId });
      const release = project.mcp.activate({
        token: capability.token,
        chatId: input.chatId,
        runId: input.runId,
        signal: new AbortController().signal,
      });
      try {
        const client = await connectMcpOverFetch({
          url: `http://127.0.0.1:${address.port}/mcp`,
          headers: { authorization: `Bearer ${capability.token}` },
        });
        return await client.callTool(input.tool, input.arguments);
      } finally {
        await release();
      }
    },
    readLog: async (chatId) => {
      const raw = await readFile(join(workspaceRoot, '.tau', 'chats', chatId, 'events.jsonl'), 'utf8');
      return raw
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as AgentLogEvent);
    },
    close: async (closeOptions) => {
      if (closed) {
        if (!closeOptions?.preserve) {
          await rm(sandbox, { recursive: true, force: true });
        }
        return;
      }
      await project.close();
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
        server.closeAllConnections();
      });
      channel.close();
      await stop();
      closed = true;
      if (!closeOptions?.preserve) {
        await rm(sandbox, { recursive: true, force: true });
      }
    },
  };
};
