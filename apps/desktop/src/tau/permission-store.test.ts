/**
 * The permission store's identity, defaults, persistence and durable log (blueprint D19, D25; A19, A25), and the
 * shell's per-call mode read through it: the real store, the real shell service over the deterministic fake provider.
 * Nothing here proves containment.
 */
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { HostToolApproval, InterruptResolution } from '@taucad/agent-host';
import { createShellService } from '@taucad/host';
import type { ShellCheckout, ShellInput } from '@taucad/host';
import { createFakeShellProvider } from '@taucad/native-process-core/shell';

import { createPermissionStore, permissionModeOfRun, recordShellCall } from '#tau/permission-store.js';
import type { PermissionLogEntry } from '#tau/permission-store.js';

let base = '';
let directory = '';
let project = '';
let copied = '';

beforeEach(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), 'tau-permissions-')));
  directory = join(base, 'user-data', 'permissions');
  project = join(base, 'projects', 'bracket');
  copied = join(base, 'projects', 'bracket-copy');
  for (const root of [project, copied]) {
    // oxlint-disable-next-line no-await-in-loop -- fixture setup.
    await mkdir(join(root, '.tau'), { recursive: true });
    /* The same project id in both, as a copied or hostile project would carry. */
    // oxlint-disable-next-line no-await-in-loop -- fixture setup.
    await writeFile(join(root, 'tau.json'), JSON.stringify({ id: 'project-same' }));
  }
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

const logOf = async (): Promise<PermissionLogEntry[]> => {
  const text = await readFile(join(directory, 'permission-log.jsonl'), 'utf8');
  return text
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as PermissionLogEntry);
};

describe('permission store (D19, D25)', () => {
  it('reads Ask for a chat with no entry, whatever the default (A25)', async () => {
    const store = createPermissionStore({ directory });
    expect(await store.defaultMode()).toBe('ask');
    await store.setDefaultMode('bypass');
    expect(await store.modeOf(project, 'chat-unseeded')).toBe('ask');
  });

  it('copies the default into a new chat only at seed, and a later default change leaves it alone (A19)', async () => {
    const store = createPermissionStore({ directory });
    expect(await store.seed(project, 'chat-1')).toBe('ask');
    await store.setDefaultMode('bypass');
    expect(await store.modeOf(project, 'chat-1')).toBe('ask');
    expect(await store.seed(project, 'chat-2')).toBe('bypass');
    /* A second seed keeps the entry rather than re-copying the default. */
    await store.setDefaultMode('ask');
    expect(await store.seed(project, 'chat-2')).toBe('bypass');
  });

  it('keys by the admitted root, so a project reusing another project id inherits nothing (A25)', async () => {
    const store = createPermissionStore({ directory });
    await store.setChatMode(project, 'chat-1', 'bypass');
    expect(await store.modeOf(project, 'chat-1')).toBe('bypass');
    expect(await store.modeOf(copied, 'chat-1')).toBe('ask');
  });

  it('canonicalises the root, so a symlinked spelling reads the same entry', async () => {
    const link = join(base, 'link');
    await symlink(project, link);
    const store = createPermissionStore({ directory });
    await store.setChatMode(link, 'chat-1', 'bypass');
    expect(await store.modeOf(project, 'chat-1')).toBe('bypass');
  });

  it('survives a restart, and keeps nothing in the project folder (A19)', async () => {
    const first = createPermissionStore({ directory });
    await first.setChatMode(project, 'chat-1', 'bypass');
    await first.setDefaultMode('bypass');
    const second = createPermissionStore({ directory });
    expect(await second.modeOf(project, 'chat-1')).toBe('bypass');
    expect(await second.defaultMode()).toBe('bypass');
    const file = JSON.parse(await readFile(join(directory, 'permission-modes.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(file['version']).toBe(1);
    expect(await readFile(join(project, 'tau.json'), 'utf8')).toBe(JSON.stringify({ id: 'project-same' }));
  });

  it('reads a corrupt, foreign-version or tampered file as Ask, never as Bypass', async () => {
    await mkdir(directory, { recursive: true });
    const path = join(directory, 'permission-modes.json');
    const onError = vi.fn();
    await writeFile(path, '{ not json');
    expect(await createPermissionStore({ directory, onError }).modeOf(project, 'chat-1')).toBe('ask');
    expect(onError).toHaveBeenCalledWith('permissions.store-unreadable', expect.any(String));
    await writeFile(
      path,
      JSON.stringify({ version: 2, defaultMode: 'bypass', chats: { [project]: { 'chat-1': 'bypass' } } }),
    );
    const foreign = createPermissionStore({ directory });
    expect(await foreign.modeOf(project, 'chat-1')).toBe('ask');
    expect(await foreign.defaultMode()).toBe('ask');
    await writeFile(
      path,
      JSON.stringify({ version: 1, defaultMode: 'yolo', chats: { [project]: { 'chat-1': true } } }),
    );
    const tampered = createPermissionStore({ directory });
    expect(await tampered.modeOf(project, 'chat-1')).toBe('ask');
    expect(await tampered.defaultMode()).toBe('ask');
  });

  it('treats `__proto__` as an ordinary chat id', async () => {
    const store = createPermissionStore({ directory });
    await store.setChatMode(project, '__proto__', 'bypass');
    expect(await store.modeOf(project, '__proto__')).toBe('bypass');
    expect(await store.modeOf(project, 'constructor')).toBe('ask');
    expect(await createPermissionStore({ directory }).modeOf(project, '__proto__')).toBe('bypass');
  });

  it('removes a deleted chat, so its entry never outlives it', async () => {
    const store = createPermissionStore({ directory });
    await store.setChatMode(project, 'chat-1', 'bypass');
    expect(await store.remove(project, 'chat-1')).toBe('ask');
    expect(await store.modeOf(project, 'chat-1')).toBe('ask');
    const file = JSON.parse(await readFile(join(directory, 'permission-modes.json'), 'utf8')) as {
      chats: Record<string, unknown>;
    };
    expect(file.chats).toEqual({});
  });

  it('logs every change with who, when and from/to, and every seed and removal (A19)', async () => {
    const at = new Date('2026-10-24T21:00:00.000Z');
    const store = createPermissionStore({ directory, now: () => at });
    await store.seed(project, 'chat-1');
    await store.setChatMode(project, 'chat-1', 'bypass');
    await store.setDefaultMode('bypass');
    await store.remove(project, 'chat-1');
    expect(await logOf()).toEqual([
      { at: at.toISOString(), event: 'chat-seeded', projectRoot: project, chatId: 'chat-1', mode: 'ask' },
      {
        at: at.toISOString(),
        event: 'mode-changed',
        scope: 'chat',
        projectRoot: project,
        chatId: 'chat-1',
        from: 'ask',
        to: 'bypass',
        by: 'person',
      },
      { at: at.toISOString(), event: 'mode-changed', scope: 'default', from: 'ask', to: 'bypass', by: 'person' },
      { at: at.toISOString(), event: 'chat-removed', projectRoot: project, chatId: 'chat-1', mode: 'bypass' },
    ]);
  });

  it('serialises concurrent writes, so none is lost', async () => {
    const store = createPermissionStore({ directory });
    await Promise.all(
      Array.from({ length: 20 }, async (_, index) => store.setChatMode(project, `chat-${String(index)}`, 'bypass')),
    );
    const reopened = createPermissionStore({ directory });
    for (let index = 0; index < 20; index += 1) {
      // oxlint-disable-next-line no-await-in-loop -- one read each.
      expect(await reopened.modeOf(project, `chat-${String(index)}`)).toBe('bypass');
    }
  });
});

describe('the shell reads the mode per call through the store (D25, A19, A25)', () => {
  const widening: ShellInput = {
    command: 'npm install',
    access: { reason: 'It is safe', domains: ['registry.npmjs.org'] },
  };
  const resolved = (outcome: InterruptResolution['outcome']): InterruptResolution => ({
    interruptId: 'interrupt-1',
    outcome,
  });

  const setup = (chats: ReadonlyMap<string, string>) => {
    const store = createPermissionStore({ directory });
    const provider = createFakeShellProvider(() => ({ status: 'started', stdout: 'ok\n', exit: { exitCode: 0 } }));
    const checkouts = new Map<string, ShellCheckout>([
      ['run-1', { cwd: project, admission: 'admission-1' }],
      ['run-orphan', { cwd: project, admission: 'admission-2' }],
    ]);
    const service = createShellService({
      provider,
      executable: { kind: 'bash', path: '/bin/bash', realPath: '/bin/bash', digest: 'sha256:00' },
      identity: { platform: 'linux', kind: 'bash', shellVersion: '5.2', shellDigest: 'sha256:00', provider: 'fake' },
      checkouts,
      appDataRoots: [join(base, 'user-data')],
      projectRoots: () => [project, copied],
      platform: 'linux',
      home: join(base, 'home'),
      // eslint-disable-next-line @typescript-eslint/naming-convention -- an environment variable keeps its platform name.
      environment: { PATH: '/usr/bin' },
      sessionDirectory: base,
      permissionModeOf: permissionModeOfRun(store, project, (runId) => chats.get(runId)),
    });
    const call = (runId: string, approve?: HostToolApproval) => ({
      toolCallId: `call-${runId}`,
      runId,
      signal: new AbortController().signal,
      approve,
      input: widening,
    });
    return { store, service, provider, call };
  };

  it('applies a switch from the next call, and a run with no chat reads Ask', async () => {
    const { store, service, call } = setup(new Map([['run-1', 'chat-1']]));
    const ask = Object.assign(
      vi.fn(async () => resolved('denied')),
      { recall: vi.fn(async () => undefined) },
    );
    expect(await service.run(call('run-1', ask))).toMatchObject({ status: 'not-started', code: 'access-denied' });
    expect(ask).toHaveBeenCalledTimes(1);
    await store.setChatMode(project, 'chat-1', 'bypass');
    expect(await service.run(call('run-1', ask))).toMatchObject({
      status: 'completed',
      approval: { approvedBy: 'bypass', mode: 'bypass' },
    });
    expect(ask).toHaveBeenCalledTimes(1);
    /* A run the host cannot map to a chat never inherits that chat's Bypass. */
    expect(await service.run(call('run-orphan', ask))).toMatchObject({ status: 'not-started', code: 'access-denied' });
    await store.setChatMode(project, 'chat-1', 'ask');
    expect(await service.run(call('run-1', ask))).toMatchObject({ status: 'not-started', code: 'access-denied' });
    const log = await logOf();
    const consulted = log.filter((entry) => entry.event === 'mode-consulted');
    expect(consulted.map((entry) => [entry.runId, entry.chatId, entry.mode])).toEqual([
      ['run-1', 'chat-1', 'ask'],
      ['run-1', 'chat-1', 'bypass'],
      ['run-orphan', undefined, 'ask'],
      ['run-1', 'chat-1', 'ask'],
    ]);
  });

  it('spends a recalled Allow once under Bypass, and records it as the person’s (A25)', async () => {
    const { store, service, call } = setup(new Map([['run-1', 'chat-1']]));
    await store.setChatMode(project, 'chat-1', 'bypass');
    const steps: string[] = [];
    let waiting: InterruptResolution | undefined = resolved('approved');
    const approve = Object.assign(
      vi.fn(async () => {
        steps.push('ask');
        return resolved('denied');
      }),
      {
        recall: vi.fn(async () => {
          steps.push('recall');
          /* The host spends a recalled answer as it returns it (D23). */
          const answer = waiting;
          waiting = undefined;
          return answer === undefined ? undefined : { payload: {}, resolution: answer };
        }),
      },
    );
    expect(await service.run(call('run-1', approve))).toMatchObject({
      approval: { approvedBy: 'person', mode: 'bypass' },
    });
    /* Back to Ask: the spent answer is gone, so the identical request asks. */
    await store.setChatMode(project, 'chat-1', 'ask');
    expect(await service.run(call('run-1', approve))).toMatchObject({ code: 'access-denied' });
    expect(steps).toEqual(['recall', 'recall', 'ask']);
  });

  it('a mode change while a request waits neither answers nor cancels it (A25)', async () => {
    const { store, service, call } = setup(new Map([['run-1', 'chat-1']]));
    const pending = Promise.withResolvers<InterruptResolution>();
    const approve = Object.assign(
      vi.fn(async () => pending.promise),
      { recall: vi.fn(async () => undefined) },
    );
    let settled = false;
    const running = (async () => {
      try {
        return await service.run(call('run-1', approve));
      } finally {
        settled = true;
      }
    })();
    await vi.waitFor(() => {
      expect(approve).toHaveBeenCalledTimes(1);
    });
    await store.setChatMode(project, 'chat-1', 'bypass');
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 20);
    });
    expect(settled).toBe(false);
    pending.resolve(resolved('denied'));
    expect(await running).toMatchObject({ status: 'not-started', code: 'access-denied' });
  });

  it('logs each finished call with the mode in force and who decided', async () => {
    const { store, service, call } = setup(new Map([['run-1', 'chat-1']]));
    const denied = await service.run(
      call(
        'run-1',
        Object.assign(
          vi.fn(async () => resolved('denied')),
          { recall: vi.fn(async () => undefined) },
        ),
      ),
    );
    await recordShellCall(store, {
      projectRoot: project,
      chatId: 'chat-1',
      runId: 'run-1',
      toolCallId: 'call-run-1',
      widened: true,
      output: denied,
    });
    await store.setChatMode(project, 'chat-1', 'bypass');
    const granted = await service.run(call('run-1'));
    await recordShellCall(store, {
      projectRoot: project,
      chatId: 'chat-1',
      runId: 'run-1',
      toolCallId: 'call-run-1',
      widened: true,
      output: granted,
    });
    const log = await logOf();
    const calls = log.filter((entry) => entry.event === 'shell-call');
    expect(calls).toMatchObject([
      { mode: 'ask', decision: { outcome: 'denied', deniedBy: 'person' }, status: 'not-started' },
      { mode: 'bypass', decision: { outcome: 'granted', approvedBy: 'bypass' }, status: 'completed' },
    ]);
  });
});
