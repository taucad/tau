import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it, vi } from 'vitest';
import { createProjectTaskStore } from '#project-tasks/store.js';
import type { ProjectTaskStorage } from '#project-tasks/store.js';
import { classify } from '@taucad/filesystem/path-registry';
import { createNodeProjectTaskStore } from '#project-tasks/node-store.js';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true }))));
it('reuses exclusive record authority, repairs torn tails only at append and replays ordered records', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tau-task-store-'));
  roots.push(root);
  const first = await createNodeProjectTaskStore({ workspaceRoot: root, projectId: 'project' });
  await first.transaction(async (view) => view.append({ tasks: [] }));
  await expect(createNodeProjectTaskStore({ workspaceRoot: root, projectId: 'project' })).rejects.toMatchObject({
    code: 'WRITER_LOCKED',
  });
  await first.close();
  const path = join(root, '.tau', 'chats', '.project-tasks', 'records.jsonl');
  const valid = await readFile(path, 'utf8');
  await writeFile(path, `${valid}{"partial":`);
  const recovered = await createNodeProjectTaskStore({ workspaceRoot: root, projectId: 'project' });
  expect(await readFile(path, 'utf8')).toBe(`${valid}{"partial":`);
  await recovered.transaction(async (view) => {
    expect(view.sequence).toBe(1);
    await view.append({ tasks: [] });
  });
  await recovered.close();
  const complete = await readFile(path, 'utf8');
  const records = complete
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as { sequence: number });
  expect(records.map((record) => record.sequence)).toEqual([1, 2]);
  const reopened = await createNodeProjectTaskStore({ workspaceRoot: root, projectId: 'project' });
  expect(await reopened.transaction(async (view) => view.sequence)).toBe(2);
  await reopened.close();
});

it('refuses wrong project and complete invalid rows without losing writer ownership', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tau-task-store-'));
  roots.push(root);
  const first = await createNodeProjectTaskStore({ workspaceRoot: root, projectId: 'project' });
  await first.transaction(async (view) => view.append({ tasks: [] }));
  await first.close();
  await expect(createNodeProjectTaskStore({ workspaceRoot: root, projectId: 'foreign' })).rejects.toMatchObject({
    code: 'TASK_STORAGE_INVALID',
  });
  const path = join(root, '.tau', 'chats', '.project-tasks', 'records.jsonl');
  await writeFile(path, '{"complete":"invalid"}\n');
  await expect(createNodeProjectTaskStore({ workspaceRoot: root, projectId: 'project' })).rejects.toMatchObject({
    code: 'TASK_STORAGE_INVALID',
  });
  await writeFile(path, '');
  const recovered = await createNodeProjectTaskStore({ workspaceRoot: root, projectId: 'project' });
  await recovered.close();
});

it('keeps task sidecar in the non-versioned agent-read-only records family', () => {
  const classification = classify('.tau/chats/.project-tasks/records.jsonl');
  expect(classification.versioned).toBe(false);
  expect(classification.agentAccess).toBe('read-only');
});

it('releases authority after initial read failures and invalid complete UTF-8', async () => {
  const close = vi.fn(async () => undefined);
  const storage: ProjectTaskStorage = {
    read: async () => {
      throw new Error('Injected initial read failure');
    },
    append: async () => undefined,
    truncate: async () => undefined,
    size: async () => 0,
    exclusive: async (section) => section(),
    close,
  };
  await expect(createProjectTaskStore({ projectId: 'project', storage })).rejects.toThrow(
    'Injected initial read failure',
  );
  expect(close).toHaveBeenCalledTimes(1);
  const root = await mkdtemp(join(tmpdir(), 'tau-task-store-'));
  roots.push(root);
  const first = await createNodeProjectTaskStore({ workspaceRoot: root, projectId: 'project' });
  await first.close();
  const path = join(root, '.tau', 'chats', '.project-tasks', 'records.jsonl');
  await writeFile(path, new Uint8Array([255, 10]));
  await expect(createNodeProjectTaskStore({ workspaceRoot: root, projectId: 'project' })).rejects.toThrow();
  await writeFile(path, '');
  const corrected = await createNodeProjectTaskStore({ workspaceRoot: root, projectId: 'project' });
  await corrected.close();
});
