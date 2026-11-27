/**
 * H33: the Node writer marker records the boot its pid ran under, so a pid from an earlier boot is never read as a live
 * writer, and a second process never takes a live writer's run over.
 */
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as FilesystemNode from '@taucad/filesystem/backend/node';
import { createNodeEventLog } from '#node.js';
import type { ToolRegistry } from '#waist/ports.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

const model = { id: 'fixture-model', providerKind: 'vertexai', contextWindow: 200_000, maxTokens: 4096 } as const;
const emptyTools: ToolRegistry = { list: () => [], invoke: async () => ({ content: 'no tools', isError: true }) };

/** A workspace whose chat holds a run left `running`. */
const seedRunningChat = async (): Promise<{ readonly root: string; readonly logPath: string }> => {
  const root = await mkdtemp(join(tmpdir(), 'tau-boot-identity-'));
  roots.push(root);
  const directory = join(root, '.tau', 'chats', 'chat');
  await mkdir(directory, { recursive: true });
  const base = { version: 1, leaderEpoch: 'previous-term', recordedAt: new Date().toISOString(), runId: 'run-1' };
  const rows = [
    { ...base, sequence: 0, epoch: 1, type: 'run.lifecycle', state: 'admitted' },
    {
      ...base,
      sequence: 1,
      epoch: 1,
      type: 'turn.history-projection-committed',
      retainedMessageIds: [],
      message: { id: 'user-1', role: 'user', content: 'hello' },
      context: {
        version: 1,
        systemPrompt: 'You are Tau.',
        model,
        toolChoice: 'auto',
        initialMessages: [],
        postCompactionMessages: [],
      },
    },
    { ...base, sequence: 2, epoch: 1, type: 'run.lifecycle', state: 'running' },
  ];
  const logPath = join(directory, 'events.jsonl');
  await writeFile(logPath, rows.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');
  return { root, logPath: join(await realpath(directory), 'events.jsonl') };
};

/** The boot line a writer in this process records. */
const thisBoot = async (): Promise<string> => {
  const { logPath } = await seedRunningChat();
  const log = await createNodeEventLog({ filePath: logPath, access: 'write' });
  const marker = await readFile(`${logPath}.lock`, 'utf8');
  await log.close();
  return marker.split('\n')[2]!;
};

/** A boot that is not this one, of the same kind. */
const otherBoot = (boot: string): string =>
  /^\d+$/u.test(boot) ? String(Number(boot) - 3600) : '00000000-0000-4000-8000-000000000000';

describe('Node writer marker boot identity (H33)', () => {
  it('should record its pid, log path and boot', async () => {
    const { logPath } = await seedRunningChat();
    const log = await createNodeEventLog({ filePath: logPath, access: 'write' });
    try {
      const marker = await readFile(`${logPath}.lock`, 'utf8');
      const [pid, path, boot, rest] = marker.split('\n');
      expect([pid, path, rest]).toEqual([String(process.pid), logPath, '']);
      expect(boot).toMatch(/^(?:\d+|[\da-f-]{36})$/u);
    } finally {
      await log.close();
    }
  });

  it('should take over a marker whose pid is alive now but was recorded under an earlier boot', async () => {
    const boot = await thisBoot();
    const { logPath } = await seedRunningChat();
    // After a reboot the recorded pid names some unrelated live process: here, this one.
    await writeFile(`${logPath}.lock`, `${process.pid}\n${logPath}\n${otherBoot(boot)}\n`);

    const log = await createNodeEventLog({ filePath: logPath, access: 'write' });
    await log.close();
  });

  it('should still fence a live pid recorded under this boot, or with no or an unrecognised boot', async () => {
    const boot = await thisBoot();
    const { logPath } = await seedRunningChat();
    for (const marker of [
      `${process.pid}\n${logPath}\n${boot}\n`,
      `${process.pid}\n${logPath}\n`,
      `${process.pid}\n`,
      `${process.pid}\n${logPath}\nnot a boot\n`,
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- one marker at a time on one log.
      await writeFile(`${logPath}.lock`, marker);
      // oxlint-disable-next-line no-await-in-loop -- see above.
      await expect(createNodeEventLog({ filePath: logPath, access: 'write' })).rejects.toMatchObject({
        code: 'WRITER_LOCKED',
      });
    }
  });

  /* H32 with H33's marker: B holds no kernel lock, so A's marker alone fences, and B reports no takeover. */
  it("should never report a takeover of another process's live run", async () => {
    const { root, logPath } = await seedRunningChat();
    const script = join(root, 'holder.mts');
    const nodeEntry = fileURLToPath(new URL('../node.ts', import.meta.url));
    await writeFile(
      script,
      [
        `import { createNodeEventLog } from ${JSON.stringify(nodeEntry)};`,
        `globalThis.held = await createNodeEventLog({ filePath: ${JSON.stringify(logPath)}, access: 'write' });`,
        `process.stdout.write('ready\\n');`,
        'setInterval(() => undefined, 1000);',
      ].join('\n'),
    );
    const holder = spawn(process.execPath, ['--import', 'tsx', script], { stdio: ['ignore', 'pipe', 'inherit'] });
    vi.resetModules();
    vi.doMock('@taucad/filesystem/backend/node', async (original) => {
      const actual = await original<typeof FilesystemNode>();
      return {
        ...actual,
        acquireNodeAuthorityWriter: async () => {
          throw new actual.NodeAuthorityWriterError('AUTHORITY_LOCK_UNSUPPORTED', 'no kernel lock here');
        },
      };
    });
    try {
      await once(holder.stdout, 'data');
      const held = await readFile(`${logPath}.lock`, 'utf8');
      expect(held.split('\n')[2]).toBe(await thisBoot());
      const { createNodeLauncher } = await import('#launchers/node-launcher.fixture.js');
      const onClaimRefused = vi.fn();
      const launcher = createNodeLauncher({
        workspaceRoot: root,
        model,
        systemPrompt: 'You are Tau.',
        toolRegistry: emptyTools,
        onClaimRefused,
      });
      try {
        const answer = await launcher.execute({ type: 'attach', commandId: 'attach-1', payload: { chatId: 'chat' } });
        expect(answer).toMatchObject({ status: 'applied', details: { takeover: false } });
        expect(onClaimRefused).toHaveBeenCalledWith('chat', 'WRITER_LOCKED');
        expect(await readFile(logPath, 'utf8')).not.toContain('"state":"failed"');
      } finally {
        await launcher.close();
      }
    } finally {
      vi.doUnmock('@taucad/filesystem/backend/node');
      vi.resetModules();
      holder.kill('SIGKILL');
      await once(holder, 'exit');
    }
  }, 30_000);
});
