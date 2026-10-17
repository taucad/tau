import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { projectTaskSchema, projectTaskSnapshotSchema } from '@taucad/agent-host/wire';
import type { ModelStreamEvent, ProviderMessage } from '@taucad/agent-host';
import type { ProjectTask } from '@taucad/agent-host/wire';
import { reduceEventLog } from '@taucad/agent-host';
import { createProjectTasksHarness } from '#project-tasks-harness.fixture.js';
import type { ProjectTasksHarness } from '#project-tasks-harness.fixture.js';
import type { AcpAdapter } from '#acp/registry.js';
import type { McpToolResult } from '#acp/fixtures/mcp-fetch-client.js';

const fixtureAgent: AcpAdapter = {
  id: 'codex',
  package: 'scripted-project-tasks-fixture',
  version: '0.0.0',
  configEnv: [],
  displayName: 'Scripted ACP fixture',
  modulePath: new URL('acp/fixtures/project-tasks-agent.ts', import.meta.url).pathname,
};
const harnesses: ProjectTasksHarness[] = [];
const ownedDirectories: string[] = [];
afterEach(async () => {
  for (const harness of harnesses.splice(0).reverse()) {
    // oxlint-disable-next-line no-await-in-loop -- close owning hosts before their filesystem authority.
    await harness.close();
  }
  await Promise.all(
    ownedDirectories.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true })),
  );
}, 30_000);
const assistantText = (message: ProviderMessage): string => {
  if (message.role !== 'assistant') {
    return '';
  }
  if (typeof message.content === 'string') {
    return message.content;
  }
  if (!Array.isArray(message.content)) {
    return '';
  }
  return message.content
    .flatMap((block: unknown): string[] => {
      if (typeof block !== 'object' || block === null || !('text' in block)) {
        return [];
      }
      const text: unknown = block.text;
      return typeof text === 'string' ? [text] : [];
    })
    .join('');
};
const resultValue = (result: McpToolResult): unknown => {
  const text = result.content?.find((content) => content.type === 'text')?.text;
  if (result.structuredContent !== undefined) {
    return result.structuredContent;
  }
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
};
const spawn = async (input: {
  harness: ProjectTasksHarness;
  parent: ProjectTask;
  requestId: string;
  title: string;
  prompt?: string;
}): Promise<ProjectTask> => {
  const result = await input.harness.invokeTaskTool({
    chatId: input.parent.chatId,
    runId: input.parent.attempts.at(-1)?.runId ?? '',
    tool: 'task_spawn',
    arguments: {
      requestId: input.requestId,
      title: input.title,
      prompt: input.prompt ?? 'PROJECT_TASK_FIXTURE:hold',
      provider: { id: 'codex' },
    },
  });
  expect(result.isError, JSON.stringify(resultValue(result))).not.toBe(true);
  return projectTaskSchema.parse(resultValue(result));
};
const waitStatus = async (harness: ProjectTasksHarness, taskId: string, status: string): Promise<void> => {
  await expect
    .poll(
      async () => {
        const snapshot = await harness.tasks.read();
        return snapshot.tasks.find((task) => task.id === taskId)?.attempts.at(-1)?.status;
      },
      { timeout: 20_000 },
    )
    .toBe(status);
};
const startRoot = async (input: {
  harness: ProjectTasksHarness;
  suffix: string;
  prompt?: string;
}): Promise<ProjectTask> => {
  const chatId = `root-chat-${input.suffix}`;
  const runId = `root-run-${input.suffix}`;
  const answer = await input.harness.host.launcher.execute({
    type: 'start',
    commandId: `start-${input.suffix}`,
    payload: {
      chatId,
      runId,
      trigger: 'submit',
      message: { id: `message-${input.suffix}`, role: 'user', content: input.prompt ?? 'PROJECT_TASK_FIXTURE:hold' },
      config: { agent: { kind: 'acp', id: 'codex' }, systemPrompt: '', toolChoice: 'auto' },
    },
  });
  expect(answer).toMatchObject({ status: 'applied' });
  await expect
    .poll(
      async () => {
        const snapshot = await input.harness.tasks.read();
        if (!snapshot.tasks.some((task) => task.chatId === chatId)) {
          const events = await input.harness.readLog(chatId).catch(() => []);
          const failed = events.findLast((event) => event.type === 'run.lifecycle' && event.state === 'failed');
          if (failed) {
            throw new Error(JSON.stringify(failed));
          }
        }
        return snapshot.tasks.some((task) => task.chatId === chatId);
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  const snapshot = await input.harness.tasks.read();
  const task = snapshot.tasks.find((entry) => entry.chatId === chatId);
  if (!task) {
    throw new Error('Root task missing.');
  }
  return task;
};
const cancelRoot = async (harness: ProjectTasksHarness, root: ProjectTask): Promise<void> => {
  await harness.host.launcher.execute({
    type: 'cancel',
    commandId: `cancel-${root.id}`,
    payload: { chatId: root.chatId, runId: root.attempts[0]?.runId ?? '' },
  });
};

describe('project tasks through real host authority, revisions and scripted ACP', () => {
  it('should refuse a composer start on a delegated chat and preserve its task on message and resume', async () => {
    const harness = await createProjectTasksHarness({ agents: [fixtureAgent] });
    harnesses.push(harness);
    await startRoot({ harness, suffix: 'delegated-start', prompt: 'PROJECT_TASK_FIXTURE:root' });
    await expect
      .poll(
        async () => {
          const snapshot = await harness.tasks.read();
          return snapshot.tasks.map((task) => task.attempts.at(-1)?.status);
        },
        { timeout: 45_000 },
      )
      .toEqual(['completed', 'completed', 'completed']);
    const before = await harness.tasks.read();
    const child = before.tasks[1];
    if (!child) {
      throw new Error('Delegated child missing.');
    }
    const placementBefore = harness.host.revisions.status().branches;
    const answer = await harness.host.launcher.execute({
      type: 'start',
      commandId: 'start-delegated-chat',
      payload: {
        chatId: child.chatId,
        runId: 'new-root-on-child',
        trigger: 'submit',
        message: { id: 'follow-up-message', role: 'user', content: 'Work in this child chat' },
        config: { agent: { kind: 'acp', id: 'codex' }, systemPrompt: '', toolChoice: 'auto' },
      },
    });
    expect(answer).toMatchObject({ status: 'refused', effect: 'not-applied', code: 'TASK_FORBIDDEN' });
    expect(await harness.tasks.read()).toEqual(before);
    expect(harness.host.revisions.status().branches).toEqual(placementBefore);
    expect(JSON.stringify(await harness.readLog(child.chatId))).not.toContain('new-root-on-child');
    await expect(readFile(join(harness.workspaceRoot, 'child.txt'), 'utf8')).rejects.toThrow('ENOENT');

    const sent = await harness.tasks.send({
      taskId: child.id,
      requestId: 'delegated-follow-up',
      text: 'DELEGATED_FOLLOW_UP_NONCE',
    });
    const resumed = await harness.host.projectTasks.request({
      operation: 'resume',
      input: { taskId: child.id, requestId: 'resume-delegated-follow-up' },
    });
    expect(resumed).toMatchObject({ kind: 'task', task: { id: child.id, chatId: child.chatId } });
    await waitStatus(harness, child.id, 'completed');
    const after = await harness.tasks.read();
    const continued = after.tasks.find((task) => task.id === child.id);
    expect(continued).toMatchObject({
      parentTaskId: child.parentTaskId,
      depth: child.depth,
      provider: child.provider,
      chatId: child.chatId,
    });
    expect(continued?.attempts).toHaveLength(2);
    expect(continued?.attempts[1]).toMatchObject({
      source: child.attempts[0]?.source,
      toolGrant: child.attempts[0]?.toolGrant,
    });
    expect(continued?.attempts[1]?.candidateCheckoutId).not.toBe(child.attempts[0]?.candidateCheckoutId);
    expect(after.messages).toContainEqual(sent);
    expect(JSON.stringify(await harness.readLog(child.chatId))).toContain('DELEGATED_FOLLOW_UP_NONCE');
    await expect(readFile(join(harness.workspaceRoot, 'child.txt'), 'utf8')).rejects.toThrow('ENOENT');
  }, 90_000);

  it('should isolate nested candidates in an adopted repository without capturing ignored files or touching user worktrees', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tau-adopted-project-tasks-'));
    ownedDirectories.push(directory);
    const workspaceRoot = join(directory, 'project');
    const checkoutsDirectory = join(directory, 'checkouts');
    const userWorktree = join(directory, 'mine');
    await mkdir(join(workspaceRoot, '.tau'), { recursive: true });
    await writeFile(join(workspaceRoot, '.gitignore'), 'dist/\n.env\n');
    await writeFile(join(workspaceRoot, 'main.scad'), 'cube(10);\n');
    await writeFile(join(workspaceRoot, '.tau', 'AGENTS.md'), 'Project instruction nonce: INHERITED_CONTEXT_NONCE.\n');
    const git = (args: readonly string[]): string =>
      execFileSync('git', ['-C', workspaceRoot, '-c', 'user.name=Ada', '-c', 'user.email=ada@example.com', ...args], {
        encoding: 'utf8',
      }).trim();
    git(['init', '--quiet', '--initial-branch=main']);
    git(['add', '--all']);
    git(['commit', '--quiet', '-m', 'Initial']);
    git(['worktree', 'add', '--quiet', '-b', 'side', userWorktree]);
    await writeFile(join(userWorktree, 'unrelated.scad'), 'sphere(1);\n');
    await mkdir(join(workspaceRoot, 'dist'));
    await writeFile(join(workspaceRoot, 'dist', 'bundle.js'), 'private build\n');
    await writeFile(join(workspaceRoot, '.env'), 'PRIVATE_NONCE=1\n');
    await writeFile(join(workspaceRoot, 'main.scad'), 'cube(11);\n');
    const userWorktreeBefore = git(['-C', userWorktree, 'rev-parse', 'HEAD']);
    const harness = await createProjectTasksHarness({
      agents: [fixtureAgent],
      reopen: { workspaceRoot, checkoutsDirectory },
    });
    harnesses.push(harness);
    await startRoot({ harness, suffix: 'adopted', prompt: 'PROJECT_TASK_FIXTURE:root' });
    await expect
      .poll(
        async () => {
          const snapshot = await harness.tasks.read();
          return snapshot.tasks.map((task) => task.attempts.at(-1)?.status);
        },
        { timeout: 45_000 },
      )
      .toEqual(['completed', 'completed', 'completed']);
    const snapshot = await harness.tasks.read();
    const [root, child, grandchild] = snapshot.tasks;
    if (!root || !child || !grandchild) {
      throw new Error('Nested adopted task lineage missing.');
    }
    expect(child.attempts[0]?.source.revisionId).toBe(root.attempts[0]?.source.revisionId);
    expect(grandchild.attempts[0]?.source.revisionId).toBe(root.attempts[0]?.source.revisionId);
    const { branches } = harness.host.revisions.status();
    const childRoot = branches.find((branch) => branch.name.startsWith(`task-${child.id}-`))?.checkoutRoot;
    const grandchildRoot = branches.find((branch) => branch.name.startsWith(`task-${grandchild.id}-`))?.checkoutRoot;
    if (!childRoot || !grandchildRoot) {
      throw new Error('Adopted candidates missing.');
    }
    expect(childRoot).not.toBe(grandchildRoot);
    for (const candidate of [childRoot, grandchildRoot]) {
      // oxlint-disable-next-line no-await-in-loop -- each candidate must omit the private files independently.
      await expect(readFile(join(candidate, '.env'), 'utf8')).rejects.toThrow('ENOENT');
      // oxlint-disable-next-line no-await-in-loop -- each candidate must omit the ignored build output independently.
      await expect(readFile(join(candidate, 'dist', 'bundle.js'), 'utf8')).rejects.toThrow('ENOENT');
      // oxlint-disable-next-line no-await-in-loop -- each candidate must start from the same frozen source.
      expect(await readFile(join(candidate, 'main.scad'), 'utf8')).toBe('cube(11);\n');
    }
    expect(await readFile(join(workspaceRoot, 'main.scad'), 'utf8')).toBe('cube(11);\n');
    expect(git(['worktree', 'list', '--porcelain'])).toContain('branch refs/heads/side');
    expect(git(['-C', userWorktree, 'rev-parse', 'HEAD'])).toBe(userWorktreeBefore);
    expect(git(['show', 'HEAD:main.scad'])).toBe('cube(11);');
    expect(git(['ls-tree', '-r', '--name-only', 'HEAD'])).not.toMatch(/(?:^|\n)(?:\.env|dist\/|\.tau\/chats\/)/u);
    expect(git(['status', '--porcelain', '--', '.env', 'dist', 'main.scad'])).toBe('');
    expect(await readFile(join(userWorktree, 'unrelated.scad'), 'utf8')).toBe('sphere(1);\n');
    await harness.close({ preserve: true });
    const reopened = await createProjectTasksHarness({
      agents: [fixtureAgent],
      reopen: { workspaceRoot, checkoutsDirectory },
    });
    harnesses.push(reopened);
    expect(await reopened.tasks.read()).toEqual({
      ...snapshot,
      cursor: snapshot.cursor + 1,
      nextCursor: snapshot.nextCursor + 1,
    });
    expect(git(['worktree', 'list', '--porcelain'])).toContain('branch refs/heads/side');
    expect(git(['-C', userWorktree, 'rev-parse', 'HEAD'])).toBe(userWorktreeBefore);
  }, 90_000);

  it('should dispatch parent-child-grandchild tools, isolate files and recover durable mailbox without replaying tools', async () => {
    const harness = await createProjectTasksHarness({ agents: [fixtureAgent] });
    harnesses.push(harness);
    await startRoot({ harness, suffix: 'nested', prompt: 'PROJECT_TASK_FIXTURE:root' });
    await expect
      .poll(
        async () => {
          const snapshot = await harness.tasks.read();
          return snapshot.tasks.map((task) => task.attempts.at(-1)?.status);
        },
        { timeout: 45_000 },
      )
      .toEqual(['completed', 'completed', 'completed']);
    const snapshot = await harness.tasks.read();
    const [root, child, grandchild] = snapshot.tasks;
    if (!root || !child || !grandchild) {
      throw new Error('Nested task lineage missing.');
    }
    expect(snapshot.tasks.map((task) => ({ depth: task.depth, parent: task.parentTaskId }))).toEqual([
      { depth: 0, parent: undefined },
      { depth: 1, parent: root.id },
      { depth: 2, parent: child.id },
    ]);
    expect(
      snapshot.messages.map((message) => ({
        from: message.senderTaskId,
        to: message.recipientTaskId,
        text: message.text,
      })),
    ).toEqual([
      { from: child.id, to: root.id, text: 'CHILD_READY_NONCE' },
      { from: root.id, to: child.id, text: 'PARENT_REPLY_NONCE' },
      { from: grandchild.id, to: child.id, text: 'GRANDCHILD_TOOL_NONCE' },
      { from: child.id, to: root.id, text: 'GRANDCHILD_TOOL_NONCE' },
    ]);
    expect(new Set(snapshot.messages.map((message) => message.sequence)).size).toBe(4);
    expect(child.attempts[0]?.source.revisionId).toBe(root.attempts[0]?.source.revisionId);
    expect(grandchild.attempts[0]?.source.revisionId).toBe(root.attempts[0]?.source.revisionId);
    const { branches } = harness.host.revisions.status();
    expect(branches).toHaveLength(3);
    const childRoot = branches.find((branch) => branch.name.startsWith(`task-${child.id}-`))?.checkoutRoot;
    const grandchildRoot = branches.find((branch) => branch.name.startsWith(`task-${grandchild.id}-`))?.checkoutRoot;
    if (!childRoot || !grandchildRoot) {
      throw new Error('Candidate roots missing.');
    }
    expect(childRoot).not.toBe(grandchildRoot);
    expect(await readFile(join(childRoot, 'child.txt'), 'utf8')).toBe('isolated-child\n');
    expect(await readFile(join(grandchildRoot, 'grandchild.txt'), 'utf8')).toBe('isolated-grandchild\n');
    await expect(readFile(join(grandchildRoot, 'child.txt'), 'utf8')).rejects.toThrow('ENOENT');
    await expect(readFile(join(harness.workspaceRoot, 'child.txt'), 'utf8')).rejects.toThrow('ENOENT');
    await expect(readFile(join(harness.workspaceRoot, 'grandchild.txt'), 'utf8')).rejects.toThrow('ENOENT');
    expect(await readFile(join(harness.workspaceRoot, 'main.scad'), 'utf8')).toBe('cube(10);\n');
    for (const task of snapshot.tasks) {
      // oxlint-disable-next-line no-await-in-loop -- verify every independently owned provider transcript.
      const messages = reduceEventLog(await harness.readLog(task.chatId));
      expect(messages.some((message) => message.role === 'tool-input')).toBe(true);
      expect(messages.some((message) => message.role === 'tool-output')).toBe(true);
      expect(
        messages.some(
          (message) => message.role === 'assistant' && JSON.stringify(message.content).includes('Completed'),
        ),
      ).toBe(true);
    }
    const transcripts = await Promise.all(snapshot.tasks.map(async (task) => harness.readLog(task.chatId)));
    await harness.close({ preserve: true });
    const reopened = await createProjectTasksHarness({
      agents: [fixtureAgent],
      reopen: { workspaceRoot: harness.workspaceRoot, checkoutsDirectory: harness.checkoutsDirectory },
    });
    harnesses.push(reopened);
    expect(await reopened.tasks.read()).toEqual({
      ...snapshot,
      cursor: snapshot.cursor + 1,
      nextCursor: snapshot.nextCursor + 1,
    });
    expect(await Promise.all(snapshot.tasks.map(async (task) => reopened.readLog(task.chatId)))).toEqual(transcripts);
    const request = { requestId: 'post-restart-message', taskId: child.id, text: 'RECOVERED_INBOX_NONCE' };
    const [sent, duplicate] = await Promise.all([reopened.tasks.send(request), reopened.tasks.send(request)]);
    expect(duplicate).toEqual(sent);
    expect(sent.sequence).toBeGreaterThan(snapshot.cursor);
    const recoveredInbox = await reopened.tasks.read({ taskId: child.id });
    expect(
      recoveredInbox.messages.filter((message) => message.recipientTaskId === child.id).map((message) => message.text),
    ).toEqual(['PARENT_REPLY_NONCE', 'GRANDCHILD_TOOL_NONCE', 'RECOVERED_INBOX_NONCE']);
  }, 60_000);

  it('should deny unrelated mailbox, forged run binding and model-supplied caller identity', async () => {
    const harness = await createProjectTasksHarness({ agents: [fixtureAgent] });
    harnesses.push(harness);
    const root = await startRoot({ harness, suffix: 'first' });
    const unrelated = await startRoot({ harness, suffix: 'unrelated' });
    const binding = { chatId: root.chatId, runId: root.attempts[0]?.runId ?? '' };
    const denied = await harness.invokeTaskTool({
      ...binding,
      tool: 'task_send',
      arguments: { requestId: 'unrelated-message', taskId: unrelated.id, text: 'FORGED_NONCE' },
    });
    expect(denied.isError).toBe(true);
    expect(JSON.stringify(resultValue(denied))).toContain('TASK_FORBIDDEN');
    const forged = await harness.invokeTaskTool({
      chatId: root.chatId,
      runId: 'forged-run',
      tool: 'task_send',
      arguments: { requestId: 'forged-run-message', taskId: root.id, text: 'FORGED_NONCE' },
    });
    expect(forged.isError).toBe(true);
    expect(JSON.stringify(resultValue(forged))).toContain('TOOL_NOT_ALLOWED');
    const injected = await harness.invokeTaskTool({
      ...binding,
      tool: 'task_spawn',
      arguments: {
        requestId: 'forged-caller',
        title: 'Denied',
        prompt: 'PROJECT_TASK_FIXTURE:hold',
        provider: { id: 'codex' },
        caller: { taskId: unrelated.id },
      },
    });
    expect(injected.isError).toBe(true);
    const snapshot = await harness.tasks.read();
    expect(snapshot.messages).toEqual([]);
    expect(snapshot.tasks.map((task) => task.id)).toEqual([root.id, unrelated.id]);
    await cancelRoot(harness, root);
    await cancelRoot(harness, unrelated);
  }, 45_000);

  it('should cancel a permission-blocked child, resolve its own interrupt and preserve partial candidate files', async () => {
    const harness = await createProjectTasksHarness({ agents: [fixtureAgent] });
    harnesses.push(harness);
    const root = await startRoot({ harness, suffix: 'permission-parent' });
    const child = await spawn({
      harness,
      parent: root,
      requestId: 'permission-child',
      title: 'Permission child',
      prompt: 'PROJECT_TASK_FIXTURE:permission',
    });
    await expect
      .poll(
        async () => {
          const events = await harness.readLog(child.chatId).catch(() => []);
          return events.some((event) => event.type === 'interrupt.recorded' && event.phase === 'requested');
        },
        { timeout: 20_000 },
      )
      .toBe(true);
    const result = await harness.invokeTaskTool({
      chatId: root.chatId,
      runId: root.attempts[0]?.runId ?? '',
      tool: 'task_cancel',
      arguments: { taskId: child.id, requestId: 'cancel-permission' },
    });
    expect(result.isError).not.toBe(true);
    expect(projectTaskSchema.parse(resultValue(result)).closed).toBe(true);
    await waitStatus(harness, child.id, 'cancelled');
    const events = await harness.readLog(child.chatId);
    const requested = events.find((event) => event.type === 'interrupt.recorded' && event.phase === 'requested');
    if (requested?.type !== 'interrupt.recorded') {
      throw new Error('Permission record missing.');
    }
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'interrupt.recorded',
        phase: 'resolved',
        interruptId: requested.interruptId,
        reason: 'cancelled',
      }),
    );
    const { branches } = harness.host.revisions.status();
    const candidate = branches.find((branch) => branch.name.startsWith(`task-${child.id}-`))?.checkoutRoot;
    if (!candidate) {
      throw new Error('Cancelled candidate missing.');
    }
    expect(await readFile(join(candidate, 'partial-work.txt'), 'utf8')).toBe('preserved-before-permission\n');
    await expect(readFile(join(harness.workspaceRoot, 'partial-work.txt'), 'utf8')).rejects.toThrow('ENOENT');
    await cancelRoot(harness, root);
  }, 60_000);

  it('should refuse depth and global capacity without orphan branches and admit after subtree cancellation', async () => {
    const harness = await createProjectTasksHarness({ agents: [fixtureAgent] });
    harnesses.push(harness);
    const root = await startRoot({ harness, suffix: 'budget-parent' });
    const nested: ProjectTask[] = [];
    let parent = root;
    for (let depth = 1; depth <= 4; depth += 1) {
      // oxlint-disable-next-line no-await-in-loop -- a descendant must execute under its own parent's active binding.
      const child = await spawn({ harness, parent, requestId: `depth-${depth}`, title: `Depth ${depth}` });
      nested.push(child);
      // oxlint-disable-next-line no-await-in-loop -- serialize actual revision allocation before another spawn.
      await waitStatus(harness, child.id, 'running');
      parent = child;
    }
    const beforeDepth = await harness.tasks.read();
    const deniedDepth = await harness.invokeTaskTool({
      chatId: parent.chatId,
      runId: parent.attempts[0]?.runId ?? '',
      tool: 'task_spawn',
      arguments: {
        requestId: 'too-deep',
        title: 'Denied',
        prompt: 'PROJECT_TASK_FIXTURE:hold',
        provider: { id: 'codex' },
      },
    });
    expect(deniedDepth.isError).toBe(true);
    expect(JSON.stringify(resultValue(deniedDepth))).toContain('TASK_DEPTH');
    expect(await harness.tasks.read()).toEqual(beforeDepth);
    for (let sibling = 0; sibling < 3; sibling += 1) {
      // oxlint-disable-next-line no-await-in-loop -- independently fill the global active budget with real candidates.
      const child = await spawn({
        harness,
        parent: root,
        requestId: `sibling-${sibling}`,
        title: `Sibling ${sibling}`,
      });
      // oxlint-disable-next-line no-await-in-loop -- each admitted candidate must be running before another allocation.
      await waitStatus(harness, child.id, 'running');
    }
    const beforeCapacity = await harness.tasks.read();
    const branchesBefore = harness.host.revisions.status().branches.map((branch) => branch.name);
    const deniedCapacity = await harness.invokeTaskTool({
      chatId: root.chatId,
      runId: root.attempts[0]?.runId ?? '',
      tool: 'task_spawn',
      arguments: {
        requestId: 'too-many',
        title: 'Denied',
        prompt: 'PROJECT_TASK_FIXTURE:hold',
        provider: { id: 'codex' },
      },
    });
    expect(deniedCapacity.isError).toBe(true);
    expect(JSON.stringify(resultValue(deniedCapacity))).toContain('TASK_CAPACITY');
    expect(await harness.tasks.read()).toEqual(beforeCapacity);
    expect(harness.host.revisions.status().branches.map((branch) => branch.name)).toEqual(branchesBefore);
    const subtree = nested[0];
    if (!subtree) {
      throw new Error('Nested subtree missing.');
    }
    await harness.tasks.cancel({ taskId: subtree.id, requestId: 'cancel-nested-budget' });
    await expect
      .poll(
        async () => {
          const snapshot = await harness.tasks.read();
          return snapshot.tasks
            .filter((task) => nested.some((entry) => entry.id === task.id))
            .map((task) => task.attempts.at(-1)?.status);
        },
        { timeout: 25_000 },
      )
      .toEqual(['cancelled', 'cancelled', 'cancelled', 'cancelled']);
    const replacement = await spawn({ harness, parent: root, requestId: 'capacity-released', title: 'Replacement' });
    await waitStatus(harness, replacement.id, 'running');
    await harness.tasks.cancel({ taskId: root.id, requestId: 'cancel-all-budget' });
    await cancelRoot(harness, root);
  }, 150_000);
});

describe('nested Tau CAD execution through actual ACP and runtime', () => {
  it('should execute actual CAD tools in the Tau child candidate and return the result to its ACP parent', async () => {
    const execFileAsync = promisify(execFile);
    const result = await execFileAsync(
      process.execPath,
      [
        fileURLToPath(import.meta.resolve('tsx/cli')),
        fileURLToPath(new URL('fixtures/project-tasks-cad-probe.ts', import.meta.url)),
      ],
      { timeout: 150_000, maxBuffer: 2 * 1024 * 1024 },
    );
    const line = result.stdout.split('\n').find((entry) => entry.startsWith('TASK_CAD_PROOF '));
    if (!line) {
      throw new Error(`CAD qualification proof missing: ${result.stderr.slice(-2000)}`);
    }
    const proof = JSON.parse(line.slice('TASK_CAD_PROOF '.length)) as {
      model: string;
      runtime: string;
      part: string;
      livePartAbsent: boolean;
      taskContext: {
        projectId: string;
        taskId: string;
        parentTaskId: string;
        attemptId: string;
        attemptNumber: number;
        candidateCheckoutId: string;
        sourceRevisionId: string;
        sourceCheckoutId: string;
      };
      toolInputs: string[];
      protocol: Array<{ direction: string; method?: string; update?: string }>;
      cadResult: unknown;
      tasks: Array<{ id: string; provider: string; depth: number; status: string }>;
      messages: Array<{ text: string }>;
    };
    expect(proof.model).toBe('scripted');
    expect(proof.runtime).toBe('actual CLI CAD runtime');
    expect(proof.part).toBe('cube(12);\n');
    expect(proof.livePartAbsent).toBe(true);
    expect(proof.taskContext).toMatchObject({ projectId: 'project-task-integration' });
    expect(proof.taskContext.taskId).toBe(proof.tasks.find((task) => task.depth === 1)?.id);
    expect(proof.taskContext.parentTaskId).toBe(proof.tasks.find((task) => task.depth === 0)?.id);
    expect(proof.taskContext.attemptNumber).toBe(1);
    expect(proof.taskContext.candidateCheckoutId).toBeTruthy();
    expect(proof.taskContext.sourceRevisionId).toBeTruthy();
    expect(proof.taskContext.sourceCheckoutId).toBeTruthy();
    expect(proof.toolInputs).toEqual(['task_read', 'create_file', 'evaluate_model', 'task_send']);
    expect(proof.tasks.map((task) => ({ provider: task.provider, depth: task.depth, status: task.status }))).toEqual([
      { provider: 'codex', depth: 0, status: 'completed' },
      { provider: 'tau', depth: 1, status: 'completed' },
    ]);
    expect(proof.messages.map((message) => message.text)).toEqual(['CAD_READY_NONCE']);
    expect(proof.protocol.filter((frame) => frame.direction === 'client->agent').map((frame) => frame.method)).toEqual(
      expect.arrayContaining(['initialize', 'session/new', 'session/prompt']),
    );
    expect(
      proof.protocol.some(
        (frame) =>
          frame.direction === 'agent->client' && frame.method === 'session/update' && frame.update === 'tool_call',
      ),
    ).toBe(true);
    expect(JSON.stringify(proof.cadResult)).toContain('"status":"ready"');
    const evidence = new URL('../../../out/test-results/host/project-tasks/cad-proof.json', import.meta.url);
    await mkdir(new URL('./', evidence), { recursive: true });
    await writeFile(evidence, JSON.stringify(proof, null, 2) + '\n');
  }, 160_000);
});

describe('current project instructions and immutable task source', () => {
  it('should give the Tau model its admitted identity and candidate before it reads itself and messages its parent', async () => {
    let step = 0;
    let context:
      | {
          projectId: string;
          taskId: string;
          parentTaskId: string;
          attemptId: string;
          attemptNumber: number;
          candidateCheckoutId: string;
          sourceRevisionId: string;
          sourceCheckoutId: string;
        }
      | undefined;
    const harness = await createProjectTasksHarness({
      agents: [fixtureAgent],
      model: { id: 'scripted-context', contextWindow: 200_000 },
      modelTransport: {
        funding: { type: 'unfunded' },
        async *stream(request): AsyncGenerator<ModelStreamEvent> {
          step += 1;
          const lastTool = request.messages.findLast((message) => message.role === 'tool-output');
          if (lastTool?.role === 'tool-output' && lastTool.isError) {
            throw new Error(`Task tool failed: ${JSON.stringify(lastTool.content)}`);
          }
          switch (step) {
            case 1: {
              const prompt = request.messages
                .map((message) =>
                  typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
                )
                .join('\n');
              const envelope = /Task execution context: (\{[^\n]+\})/u.exec(prompt)?.[1];
              if (!envelope || !prompt.includes('File tools and CAD execution are rooted in the assigned candidate')) {
                throw new Error('Actual Tau model request omitted its task context.');
              }
              context = JSON.parse(envelope) as typeof context;
              if (!context?.taskId || !context.parentTaskId) {
                throw new Error('Actual Tau model request omitted task lineage.');
              }
              yield {
                type: 'tool-input',
                toolCallId: 'identity-self-read',
                toolName: 'task_read',
                input: { taskId: context.taskId },
              };
              break;
            }
            case 2: {
              const snapshot = projectTaskSnapshotSchema.parse(lastTool?.content);
              if (!snapshot.tasks.some((task) => task.id === context?.taskId)) {
                throw new Error('Host-supplied task ID did not permit a self read.');
              }
              yield {
                type: 'tool-input',
                toolCallId: 'identity-candidate-write',
                toolName: 'create_file',
                input: { targetFile: 'identity.txt', content: 'candidate-only\n' },
              };
              break;
            }
            case 3: {
              if (!context?.parentTaskId) {
                throw new Error('Host-supplied parent identity missing.');
              }
              yield {
                type: 'tool-input',
                toolCallId: 'identity-parent-send',
                toolName: 'task_send',
                input: {
                  requestId: 'identity-parent-send',
                  taskId: context.parentTaskId,
                  text: 'IDENTITY_READY_NONCE',
                },
              };
              break;
            }
            default: {
              yield { type: 'text-delta', text: 'Identity and candidate verified.' };
              yield { type: 'completed', stopReason: 'stop' };
              return;
            }
          }
          yield { type: 'completed', stopReason: 'toolUse' };
        },
      },
    });
    harnesses.push(harness);
    const parent = await startRoot({ harness, suffix: 'tau-identity' });
    const result = await harness.invokeTaskTool({
      chatId: parent.chatId,
      runId: parent.attempts[0]?.runId ?? '',
      tool: 'task_spawn',
      arguments: {
        requestId: 'tau-identity-child',
        title: 'Tau identity child',
        prompt: 'Read your own task, write identity.txt, and message your parent.',
        provider: { id: 'tau' },
      },
    });
    expect(result.isError, JSON.stringify(resultValue(result))).not.toBe(true);
    const child = projectTaskSchema.parse(resultValue(result));
    await waitStatus(harness, child.id, 'completed');
    const snapshot = await harness.tasks.read();
    const settled = snapshot.tasks.find((task) => task.id === child.id);
    const attempt = settled?.attempts[0];
    expect(context).toEqual({
      projectId: child.projectId,
      taskId: child.id,
      parentTaskId: parent.id,
      attemptId: attempt?.id,
      attemptNumber: attempt?.number,
      candidateCheckoutId: attempt?.candidateCheckoutId,
      sourceRevisionId: attempt?.source.revisionId,
      sourceCheckoutId: attempt?.source.checkoutId,
    });
    const candidate = harness.host.revisions
      .status()
      .branches.find((branch) => branch.checkoutId === attempt?.candidateCheckoutId)?.checkoutRoot;
    if (!candidate) {
      throw new Error('Tau candidate root missing.');
    }
    expect(await readFile(join(candidate, 'identity.txt'), 'utf8')).toBe('candidate-only\n');
    await expect(readFile(join(harness.workspaceRoot, 'identity.txt'), 'utf8')).rejects.toThrow('ENOENT');
    expect(snapshot.messages.map((message) => message.text)).toContain('IDENTITY_READY_NONCE');
    await cancelRoot(harness, parent);
  }, 45_000);

  it('should give a new child current canonical instructions while preserving the parent admitted code revision', async () => {
    const harness = await createProjectTasksHarness({ agents: [fixtureAgent] });
    harnesses.push(harness);
    const root = await startRoot({ harness, suffix: 'instruction-parent' });
    await writeFile(
      join(harness.workspaceRoot, '.tau', 'AGENTS.md'),
      'Current project instruction: CURRENT_INSTRUCTION_NONCE.\n',
    );
    await writeFile(join(harness.workspaceRoot, 'main.scad'), 'cube(99);\n');
    const child = await spawn({
      harness,
      parent: root,
      requestId: 'current-context-child',
      title: 'Current context child',
      prompt: 'PROJECT_TASK_FIXTURE:context',
    });
    await waitStatus(harness, child.id, 'completed');
    const messages = reduceEventLog(await harness.readLog(child.chatId));
    const response = messages
      .filter((message) => message.role === 'assistant')
      .map((message) => JSON.stringify(message.content))
      .join('\n');
    expect(response).toContain('currentInstruction');
    const text = messages.map((message) => assistantText(message)).filter(Boolean);
    const structured = text.map(
      (content) => JSON.parse(content) as { source: string; currentInstruction: boolean; staleInstruction: boolean },
    );
    expect(structured).toContainEqual({ source: 'cube(10);\n', currentInstruction: true, staleInstruction: false });
    expect(await readFile(join(harness.workspaceRoot, 'main.scad'), 'utf8')).toBe('cube(99);\n');
    expect(child.attempts[0]?.source.revisionId).toBe(root.attempts[0]?.source.revisionId);
    await cancelRoot(harness, root);
  }, 45_000);
});

describe('native task continuation after actual process loss', () => {
  it('should retain source, restricted tools and frozen native context while admitting a child after restart', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tau-native-task-recovery-'));
    ownedDirectories.push(directory);
    const workspaceRoot = join(directory, 'project');
    const checkoutsDirectory = join(directory, 'checkouts');
    await mkdir(join(workspaceRoot, '.tau'), { recursive: true });
    await writeFile(join(workspaceRoot, 'main.scad'), 'cube(10);\n');
    await writeFile(
      join(workspaceRoot, '.tau', 'AGENTS.md'),
      'Original project instruction: INHERITED_CONTEXT_NONCE.\n',
    );
    const execFileAsync = promisify(execFile);
    const seeded = await execFileAsync(
      process.execPath,
      [
        fileURLToPath(import.meta.resolve('tsx/cli')),
        fileURLToPath(new URL('fixtures/project-tasks-cad-probe.ts', import.meta.url)),
        '--seed-native-resume',
        workspaceRoot,
        checkoutsDirectory,
      ],
      { timeout: 30_000, maxBuffer: 1024 * 1024 },
    );
    const seedLine = seeded.stdout.split('\n').find((line) => line.startsWith('NATIVE_TASK_SEED '));
    if (!seedLine) {
      throw new Error('Native paused journal was not seeded.');
    }
    const seedSnapshot = JSON.parse(seedLine.slice('NATIVE_TASK_SEED '.length)) as {
      tasks: ProjectTask[];
      resolution: { status: string };
    };
    expect(seedSnapshot.resolution.status).toBe('applied');
    const original = seedSnapshot.tasks[0];
    if (!original) {
      throw new Error('Native task identity missing.');
    }
    await writeFile(
      join(workspaceRoot, '.tau', 'AGENTS.md'),
      'Current project instruction: CURRENT_INSTRUCTION_NONCE.\n',
    );
    await writeFile(join(workspaceRoot, 'main.scad'), 'cube(99);\n');
    let modelCalls = 0;
    const frozenContexts: string[] = [];
    const entered = Promise.withResolvers<void>();
    const permitCompletion = Promise.withResolvers<void>();
    const harness = await createProjectTasksHarness({
      agents: [fixtureAgent],
      reopen: { workspaceRoot, checkoutsDirectory },
      model: { id: 'scripted-native-resume', contextWindow: 200_000 },
      modelTransport: {
        funding: { type: 'unfunded' },
        async *stream(request): AsyncGenerator<ModelStreamEvent> {
          modelCalls += 1;
          frozenContexts.push(request.systemPrompt + '\n' + JSON.stringify(request.messages));
          if (modelCalls === 1) {
            yield { type: 'tool-input', toolCallId: 'resumed-read', toolName: 'task_read', input: {} };
            yield { type: 'completed', stopReason: 'toolUse' };
            return;
          }
          if (modelCalls === 2) {
            yield {
              type: 'tool-input',
              toolCallId: 'resumed-spawn',
              toolName: 'task_spawn',
              input: {
                requestId: 'resumed-child',
                title: 'Resumed child',
                prompt: 'PROJECT_TASK_FIXTURE:context',
                provider: { id: 'codex' },
              },
            };
            yield { type: 'completed', stopReason: 'toolUse' };
            return;
          }
          entered.resolve();
          await Promise.race([
            permitCompletion.promise,
            new Promise<void>((resolve) => {
              if (request.signal.aborted) {
                resolve();
                return;
              }
              request.signal.addEventListener(
                'abort',
                () => {
                  resolve();
                },
                { once: true },
              );
            }),
          ]);
          request.signal.throwIfAborted();
          yield { type: 'text-delta', text: 'Native continuation and child tools completed.' };
          yield { type: 'completed', stopReason: 'stop' };
        },
      },
    });
    harnesses.push(harness);
    const recovered = await harness.tasks.read();
    expect(recovered.tasks[0]?.id).toBe(original.id);
    expect(recovered.tasks[0]?.attempts[0]?.status).toBe('interrupted');
    const resumed = await harness.host.launcher.execute({
      type: 'resume',
      commandId: 'native-resume-after-restart',
      payload: { chatId: 'native-recovery', runId: 'native-recovery-run' },
    });
    expect(resumed.status, JSON.stringify(resumed)).toBe('applied');
    await entered.promise;
    const banned = await harness.invokeTaskTool({
      chatId: 'native-recovery',
      runId: 'native-recovery-run',
      tool: 'export_model',
      arguments: { targetFile: 'main.scad', to: 'glb' },
    });
    expect(banned.isError).toBe(true);
    expect(JSON.stringify(resultValue(banned))).toContain('TOOL_NOT_ALLOWED');
    permitCompletion.resolve();
    await expect
      .poll(
        async () => {
          const snapshot = await harness.tasks.read();
          return snapshot.tasks.map((task) => task.attempts.at(-1)?.status);
        },
        { timeout: 25_000 },
      )
      .toEqual(['completed', 'completed']);
    const final = await harness.tasks.read();
    const [parent, child] = final.tasks;
    if (!parent || !child) {
      throw new Error('Native resumed lineage missing.');
    }
    expect(parent.id).toBe(original.id);
    expect(parent.chatId).toBe(original.chatId);
    expect(parent.attempts).toHaveLength(2);
    expect(parent.attempts[1]?.runId).toBe('native-recovery-run');
    expect(parent.attempts[1]?.source).toEqual(original.attempts[0]?.source);
    expect(parent.attempts[1]?.toolGrant).toEqual(original.attempts[0]?.toolGrant);
    expect(child.parentTaskId).toBe(parent.id);
    expect(child.attempts[0]?.source.revisionId).toBe(original.attempts[0]?.source.revisionId);
    expect(frozenContexts.length).toBe(3);
    expect(
      frozenContexts.every(
        (context) => context.includes('INHERITED_CONTEXT_NONCE') && !context.includes('CURRENT_INSTRUCTION_NONCE'),
      ),
      JSON.stringify(frozenContexts),
    ).toBe(true);
    const messages = reduceEventLog(await harness.readLog(child.chatId));
    expect(JSON.stringify(messages)).toContain('currentInstruction');
    expect(JSON.stringify(messages)).toContain('cube(10)');
    const nativeEvents = await harness.readLog(parent.chatId);
    expect(nativeEvents.filter((event) => event.type === 'run.lifecycle' && event.state === 'admitted')).toHaveLength(
      1,
    );
    expect(
      nativeEvents.filter((event) => event.type === 'message.appended' && event.message.role === 'tool-input'),
    ).toHaveLength(2);
  }, 90_000);
});

describe('project host close across delayed native child settlement', () => {
  it('should keep draining while a child remains active after its root has completed', async () => {
    const harness = await createProjectTasksHarness({ agents: [fixtureAgent] });
    harnesses.push(harness);
    const root = await startRoot({
      harness,
      suffix: 'drain-held-child',
      prompt: 'PROJECT_TASK_FIXTURE:spawn-hold',
    });
    await waitStatus(harness, root.id, 'completed');
    const snapshot = await harness.tasks.read();
    const child = snapshot.tasks.find((task) => task.parentTaskId === root.id);
    if (!child) {
      throw new Error('Fixture child was not admitted.');
    }
    await waitStatus(harness, child.id, 'running');

    let drained = false;
    const drain = (async () => {
      await harness.drained(AbortSignal.timeout(10_000));
      drained = true;
    })();
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 100);
    });
    expect(drained).toBe(false);
    await harness.tasks.cancel({ taskId: child.id, requestId: 'cancel-held-child-after-root' });
    await drain;
    expect(drained).toBe(true);
  }, 30_000);

  it('should wait through task close timeout, drain the existing launcher and release the task writer on retry', async () => {
    const entered = Promise.withResolvers<void>();
    const cancelled = Promise.withResolvers<void>();
    const releaseProvider = Promise.withResolvers<void>();
    let providerDelay: ReturnType<typeof setTimeout> | undefined;
    let calls = 0;
    let closeFinished = false;
    const harness = await createProjectTasksHarness({
      agents: [fixtureAgent],
      model: { id: 'scripted-late-provider', contextWindow: 200_000 },
      modelTransport: {
        funding: { type: 'unfunded' },
        async *stream(request): AsyncGenerator<ModelStreamEvent> {
          calls += 1;
          if (calls > 1) {
            yield { type: 'completed', stopReason: 'stop' };
            return;
          }
          request.signal.addEventListener(
            'abort',
            () => {
              cancelled.resolve();
              providerDelay = setTimeout(() => {
                releaseProvider.resolve();
              }, 12_000);
            },
            { once: true },
          );
          entered.resolve();
          yield { type: 'text-delta', text: 'The disposable provider is holding its iterator.' };
          // Deliberately model an uncooperative provider: the actual host must fence late tool effects after abort.
          await releaseProvider.promise;
          yield {
            type: 'tool-input',
            toolCallId: 'late-write',
            toolName: 'create_file',
            input: { targetFile: 'late-side-effect.txt', content: 'must never be written' },
          };
          yield { type: 'completed', stopReason: 'toolUse' };
        },
      },
    });
    harnesses.push(harness);
    try {
      const parent = await startRoot({ harness, suffix: 'delayed-close-parent' });
      const started = await harness.invokeTaskTool({
        chatId: parent.chatId,
        runId: parent.attempts[0]?.runId ?? '',
        tool: 'task_spawn',
        arguments: {
          requestId: 'delayed-native-child',
          title: 'Delayed native child',
          prompt: 'Hold this disposable native test turn.',
          provider: { id: 'tau' },
        },
      });
      expect(started.isError).not.toBe(true);
      const child = projectTaskSchema.parse(resultValue(started));
      await entered.promise;
      await waitStatus(harness, child.id, 'running');
      const candidate = harness.host.revisions
        .status()
        .branches.find((branch) => branch.name.startsWith(`task-${child.id}-`))?.checkoutRoot;
      if (!candidate) {
        throw new Error('Admitted delayed child candidate missing.');
      }
      expect(await readFile(join(candidate, 'main.scad'), 'utf8')).toBe('cube(10);\n');
      const closeStarted = Date.now();
      const close = async (): Promise<void> => {
        await harness.host.close();
        closeFinished = true;
      };
      const closing = close();
      await cancelled.promise;
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 10_500);
      });
      expect(closeFinished).toBe(false);
      await closing;
      expect(Date.now() - closeStarted).toBeGreaterThanOrEqual(12_000);
      expect(Date.now() - closeStarted).toBeLessThan(25_000);
      await harness.close({ preserve: true });
      await harness.host.close();
      const reopened = await createProjectTasksHarness({
        agents: [fixtureAgent],
        reopen: { workspaceRoot: harness.workspaceRoot, checkoutsDirectory: harness.checkoutsDirectory },
      });
      harnesses.push(reopened);
      const snapshot = await reopened.tasks.read();
      expect(snapshot.tasks).toHaveLength(2);
      expect(
        snapshot.tasks.every(
          (task) => !['allocating', 'running', 'cancelling'].includes(task.attempts.at(-1)?.status ?? ''),
        ),
      ).toBe(true);
      expect(await readFile(join(candidate, 'main.scad'), 'utf8')).toBe('cube(10);\n');
      await expect(readFile(join(candidate, 'late-side-effect.txt'), 'utf8')).rejects.toThrow('ENOENT');
      await expect(readFile(join(reopened.workspaceRoot, 'late-side-effect.txt'), 'utf8')).rejects.toThrow('ENOENT');
      const leases = await readdir(join(reopened.workspaceRoot, '.tau', 'runs'));
      const leaseRecords = await Promise.all(
        leases
          .filter((path) => path.endsWith('.json'))
          .map(async (path) => {
            const content = await readFile(join(reopened.workspaceRoot, '.tau', 'runs', path), 'utf8');
            return { path, record: JSON.parse(content) as unknown };
          }),
      );
      const childEvents = await reopened.readLog(child.chatId);
      const evidence = new URL('../../../out/test-results/host/project-tasks/late-close-proof.json', import.meta.url);
      await mkdir(new URL('./', evidence), { recursive: true });
      await writeFile(
        evidence,
        JSON.stringify(
          {
            elapsed: Date.now() - closeStarted,
            tasks: snapshot.tasks,
            leaseRecords,
            childEvents: childEvents.slice(-8),
          },
          null,
          2,
        ) + '\n',
      );
      expect(
        leases.filter((path) => path.endsWith('.json')),
        JSON.stringify(leaseRecords),
      ).toEqual([]);
    } finally {
      if (providerDelay) {
        clearTimeout(providerDelay);
      }
      releaseProvider.resolve();
    }
  }, 45_000);
});
