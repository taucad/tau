/** Actual Codex models must choose task tools and operate on distinct revision candidates; opt-in quota spend. */
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';
import { reduceEventLog } from '@taucad/agent-host';

import { discoverAcpAgents } from '#acp/registry.js';
import { createProjectTasksHarness } from '#project-tasks-harness.fixture.js';
import type { ProjectTasksHarness } from '#project-tasks-harness.fixture.js';

const liveEnabled = process.env['TAU_PROJECT_TASKS_LIVE'] === '1';
const codexModel = process.env['TAU_ACP_LIVE_CODEX_MODEL'];
const codexProvider = JSON.stringify({ id: 'codex', ...(codexModel === undefined ? {} : { model: codexModel }) });
const discovery = liveEnabled
  ? await discoverAcpAgents({
      resolveFrom: process.env['TAU_ACP_LIVE_RESOLVE_FROM'] ?? import.meta.url,
    })
  : { agents: [], refused: [] };
const codex = discovery.agents.find((agent) => agent.id === 'codex');
const harnesses: ProjectTasksHarness[] = [];
afterAll(async () => {
  for (const harness of harnesses.splice(0).reverse()) {
    // oxlint-disable-next-line no-await-in-loop -- close each owning host before its authority.
    await harness.close();
  }
}, 30_000);

describe.skipIf(!liveEnabled)('real Codex nested project task qualification', () => {
  it('should choose parent-child-grandchild tools and exchange durable nonces across isolated candidates', async () => {
    expect(codex, JSON.stringify(discovery.refused)).toBeDefined();
    if (!codex) {
      throw new Error('The explicitly selected real Codex adapter is unavailable.');
    }
    const harness = await createProjectTasksHarness({ agents: [codex] });
    harnesses.push(harness);
    const { tasks } = harness;
    const ready = `CHILD_READY_${randomUUID()}`;
    const reply = `PARENT_REPLY_${randomUUID()}`;
    const proof = `GRANDCHILD_PROOF_${randomUUID()}`;
    const grandchildPrompt = `You are a disposable live integration grandchild. Use native filesystem/shell tools to write grandchild-proof.txt containing exactly ${proof}. Read it back with a tool. Do not modify main.scad. Use mcp.tau.task_read to find your task (title Live grandchild) and parentTaskId, then mcp.tau.task_send to send the actual read-back contents to your parent with requestId grandchild-proof. Report the inherited project instruction nonce and stop.`;
    const childPrompt = `You are a disposable live integration child. Use native tools to write child-proof.txt containing exactly ${ready} and read it back. Do not modify main.scad. Use mcp.tau.task_read to find your task (title Live child) and parentTaskId. Send the read-back contents to your parent using mcp.tau.task_send requestId child-ready. Wait for message ${reply} by bounded mcp.tau.task_read/task_wait polling. After observing it, invoke mcp.tau.task_spawn with requestId spawn-grandchild, title Live grandchild, provider ${codexProvider}, and this exact prompt: ${JSON.stringify(grandchildPrompt)}. Wait until your inbox contains ${proof}. Forward that exact result to your parent using mcp.tau.task_send requestId child-forward. Report the inherited project instruction nonce and stop. Do not invent results; every operation must use actual tools.`;
    const parentPrompt = `This is an authorized disposable live integration test. Use mcp.tau.task_spawn to create one child: requestId spawn-child, title Live child, provider ${codexProvider}, exact prompt ${JSON.stringify(childPrompt)}. Keep the returned child task ID. Use mcp.tau.task_read to find your root task by chatId live-root-chat. Wait for inbox message ${ready}, then send ${reply} to your child using mcp.tau.task_send requestId parent-reply. Wait until your inbox contains ${proof}, then report exactly that proof and the project instruction nonce. Do not edit files or spawn extra children. Every spawn, send and read must invoke the tool; do not merely narrate them.`;
    const accepted = await harness.host.launcher.execute({
      type: 'start',
      commandId: 'live-root-start',
      payload: {
        chatId: 'live-root-chat',
        runId: 'live-root-run',
        trigger: 'submit',
        message: {
          id: 'live-root-message',
          role: 'user',
          content: parentPrompt,
        },
        config: {
          agent: { kind: 'acp', id: 'codex', ...(codexModel === undefined ? {} : { model: codexModel }) },
          systemPrompt: '',
          toolChoice: 'auto',
        },
      },
    });
    expect(accepted).toMatchObject({ status: 'applied' });
    await expect
      .poll(
        async () => {
          const snapshot = await tasks.read();
          return snapshot.tasks.map((task) => task.attempts.at(-1)?.status);
        },
        { timeout: 600_000, interval: 250 },
      )
      .toEqual(['completed', 'completed', 'completed']);
    const snapshot = await tasks.read();
    const [parent, child, grandchild] = snapshot.tasks;
    if (!parent || !child || !grandchild) {
      throw new Error('Actual nested lineage missing.');
    }
    expect(child.parentTaskId).toBe(parent.id);
    expect(grandchild.parentTaskId).toBe(child.id);
    expect(snapshot.tasks.map((task) => task.depth)).toEqual([0, 1, 2]);
    if (codexModel !== undefined) {
      expect(snapshot.tasks.map((task) => task.provider.model)).toEqual([codexModel, codexModel, codexModel]);
    }
    expect(
      snapshot.messages.map((message) => ({
        from: message.senderTaskId,
        to: message.recipientTaskId,
        text: message.text,
      })),
    ).toEqual([
      { from: child.id, to: parent.id, text: ready },
      { from: parent.id, to: child.id, text: reply },
      { from: grandchild.id, to: child.id, text: proof },
      { from: child.id, to: parent.id, text: proof },
    ]);
    const { branches } = harness.host.revisions.status();
    const childRoot = branches.find((branch) => branch.name.startsWith(`task-${child.id}-`))?.checkoutRoot;
    const grandchildRoot = branches.find((branch) => branch.name.startsWith(`task-${grandchild.id}-`))?.checkoutRoot;
    if (!childRoot || !grandchildRoot) {
      throw new Error('Actual candidate filesystem roots missing.');
    }
    expect(await readFile(join(childRoot, 'child-proof.txt'), 'utf8')).toBe(ready);
    expect(await readFile(join(grandchildRoot, 'grandchild-proof.txt'), 'utf8')).toBe(proof);
    await expect(readFile(join(harness.workspaceRoot, 'child-proof.txt'), 'utf8')).rejects.toThrow('ENOENT');
    await expect(readFile(join(harness.workspaceRoot, 'grandchild-proof.txt'), 'utf8')).rejects.toThrow('ENOENT');
    await expect(readFile(join(grandchildRoot, 'child-proof.txt'), 'utf8')).rejects.toThrow('ENOENT');
    expect(await readFile(join(harness.workspaceRoot, 'main.scad'), 'utf8')).toBe('cube(10);\n');
    const transcriptEvidence: Array<{ taskId: string; tools: string[]; sourceRevision: string | undefined }> = [];
    for (const task of snapshot.tasks) {
      // oxlint-disable-next-line no-await-in-loop -- verify all three actual provider transcripts independently.
      const messages = reduceEventLog(await harness.readLog(task.chatId));
      const tools = messages.filter((message) => message.role === 'tool-input');
      transcriptEvidence.push({
        taskId: task.id,
        tools: tools.map((message) => message.toolName),
        sourceRevision: task.attempts[0]?.source.revisionId,
      });
      expect(tools.some((message) => JSON.stringify(message).includes('task_send'))).toBe(true);
      if (task.depth < 2) {
        expect(tools.some((message) => JSON.stringify(message).includes('task_spawn'))).toBe(true);
      }
      expect(
        messages
          .filter((message) => message.role === 'assistant')
          .some((message) => JSON.stringify(message.content).includes('INHERITED_CONTEXT_NONCE')),
      ).toBe(true);
    }
    const evidence = new URL('../../../../out/test-results/host/project-tasks/live-codex-proof.json', import.meta.url);
    await mkdir(new URL('./', evidence), { recursive: true });
    await writeFile(
      evidence,
      JSON.stringify(
        {
          kind: 'actual Codex model qualification',
          adapter: { package: codex.package, version: codex.version },
          model: codexModel ?? 'CLI default',
          node: process.versions.node,
          nonces: { ready, reply, proof },
          tasks: snapshot.tasks.map((task) => ({
            id: task.id,
            chatId: task.chatId,
            parentTaskId: task.parentTaskId,
            depth: task.depth,
            attempts: task.attempts,
          })),
          messages: snapshot.messages,
          transcripts: transcriptEvidence,
          files: {
            childSha256: createHash('sha256').update(ready).digest('hex'),
            grandchildSha256: createHash('sha256').update(proof).digest('hex'),
          },
        },
        null,
        2,
      ) + '\n',
    );
  }, 660_000);
});
