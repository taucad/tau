/**
 * E1 (cloud backup admission blueprint, WP2a): the reported first backup, end to end through a real
 * `git push`, `git-receive-pack` and the `pre-receive` hook the API writes into every repository.
 *
 * On 2026-11-26 a desktop 1.17.65 device backed up a project that had only ever lived on the device. Its `main`
 * held ten commits a build from before blueprint A1 wrote, each with a version 1 `Tau-Metadata` record naming the
 * device's operating-system login, authored at that login's Tau no-reply address and committed by Tau, and one
 * version 2 commit by the account on top. The client pushed its two operation-log refs in one receive-pack and
 * `main` in a second; the hook refused all ten old commits with `GIT_PUSH_RECORD_UNREADABLE` (and, behind that,
 * would have refused them as `GIT_PUSH_ACTOR_NOT_PUSHER`). Incidents `2026-11-12-prod-cloud-backup-push-refused`
 * and `2026-11-26-staging-first-backup-refused` record the class.
 *
 * The fixtures are built from the evidence pack's headers with the login redacted as `LOCAL-HANDLE` and a
 * synthetic account id of the same 32-character shape. No real address or login is written here.
 *
 * After WP2a the hook judges no authorship, so the same push is admitted from the build the customer runs.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { preReceiveHookScript } from '#git.constants.js';

/** The device's operating-system login, redacted the way the evidence pack writes it. */
const localHandle = 'LOCAL-HANDLE';
/** A synthetic account id with the earlier generator's 32-character shape (the evidence's account has one). */
const accountId = 'e1Acct0000000000000000000000Shape';
const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();

/** The ten version 1 records, in the order the device wrote them (oldest first), from the evidence headers. */
const versionOneRecords = (parents: readonly string[], index: number): Record<string, unknown> => {
  const createdAt = 1_790_748_379_276 + index * 1000;
  if (index === 0) {
    /* The root (e36f491): an agent turn's base recorded as the login itself. */
    return {
      version: 1,
      parents,
      provenance: {
        source: 'agent',
        actorId: localHandle,
        runId: 'req_NrSRNvea1Ua45E2yCxnaH',
        attempt: 1,
        turnCut: 'base',
        turnId: 'msg_gUYKjg4eu9KCMerbusOpZ',
        actor: { kind: 'user', id: localHandle, name: localHandle },
        trigger: 'turn',
        createdAt,
      },
      summary: { generated: 'Agent turn msg_gUYKjg4eu9KCMerbusOpZ' },
    };
  }
  if (index < 7) {
    /* Agent turn results on behalf of the login (b1e2e34 and its siblings). */
    return {
      version: 1,
      parents,
      provenance: {
        source: 'agent',
        actorId: 'agent',
        runId: 'req_wsUovSiowOmOVf8kSFKxK',
        attempt: 1,
        turnCut: 'result',
        turnId: `msg_51KDSpXqQUf5YgosFPgE${String(index)}`,
        actor: {
          kind: 'agent',
          id: 'agent',
          runId: 'req_wsUovSiowOmOVf8kSFKxK',
          onBehalfOf: { kind: 'user', id: localHandle, name: localHandle },
        },
        trigger: 'turn',
        createdAt,
      },
      summary: { generated: `Agent turn msg_51KDSpXqQUf5YgosFPgE${String(index)}` },
    };
  }
  /* Autosaves (f0c552f, 85e6f95, f063a05). */
  return {
    version: 1,
    parents,
    provenance: {
      source: 'user',
      actorId: localHandle,
      actor: { kind: 'user', id: localHandle, name: localHandle },
      trigger: 'idle',
      createdAt,
    },
    summary: { generated: 'Saved changes (idle)' },
  };
};

describe('E1: the reported first backup through receive-pack and the installed hook', () => {
  let root: string;
  let device: string;
  let remote: string;
  let environment: Record<string, string>;

  const git = (cwd: string, ...args: readonly string[]): string =>
    execFileSync(realGit, [...args], {
      cwd,
      env: environment as unknown as NodeJS.ProcessEnv,
      encoding: 'utf8',
    }).trim();

  /** One raw commit object in the device repository. */
  const commit = async (
    args: Readonly<{ tree: string; parents: readonly string[]; author: string; at: number; message: string }>,
  ): Promise<string> => {
    const file = path.join(root, `commit-${String(Math.random()).slice(2)}`);
    await writeFile(
      file,
      [
        `tree ${args.tree}`,
        ...args.parents.map((parent) => `parent ${parent}`),
        `author ${args.author} ${String(args.at)} +0000`,
        `committer Tau <noreply@tau.new> ${String(args.at)} +0000`,
        '',
        args.message,
      ].join('\n'),
      'utf8',
    );
    return git(device, 'hash-object', '-t', 'commit', '-w', file);
  };

  /** A `git push` from the device as the storage worker admits it: the hook's environment rides on the spawn. */
  const push = (...refspecs: readonly string[]): { status: number | undefined; stderr: string } => {
    const result = spawnSync(realGit, ['push', '--porcelain', remote, ...refspecs], {
      cwd: device,
      encoding: 'utf8',
      env: {
        ...environment,
        /* eslint-disable @typescript-eslint/naming-convention -- process environment names */
        TAU_GIT_PUSH_ADMITTED: '1',
        TAU_GIT_PUSHER: accountId,
        TAU_GIT_NODE: process.execPath,
        TAU_GIT_QUOTA_REMAINING_BYTES: String(100 * 1024 ** 3),
        TAU_GIT_CEILING_REMAINING_BYTES: String(1024 ** 3),
        /* eslint-enable @typescript-eslint/naming-convention -- end of the process environment map */
      } as unknown as NodeJS.ProcessEnv,
    });
    return { status: result.status ?? undefined, stderr: `${result.stdout}\n${result.stderr}` };
  };

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'tau-e1-first-backup-'));
    device = path.join(root, 'device');
    remote = path.join(root, 'remote.git');
    await mkdir(device);
    /* eslint-disable @typescript-eslint/naming-convention -- process environment names */
    environment = {
      PATH: process.env['PATH'] ?? '/usr/bin:/bin',
      HOME: root,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_SYSTEM: '/dev/null',
      GIT_AUTHOR_NAME: 'Tau',
      GIT_AUTHOR_EMAIL: 'noreply@tau.new',
      GIT_COMMITTER_NAME: 'Tau',
      GIT_COMMITTER_EMAIL: 'noreply@tau.new',
    };
    /* eslint-enable @typescript-eslint/naming-convention -- end of the process environment map */

    /* The remote: a lease's receive settings (`store/lease.ts`) and the hook the API installs. */
    git(root, 'init', '--quiet', '--bare', remote);
    for (const [key, value] of [
      ['transfer.unpackLimit', '1'],
      ['receive.denyDeletes', 'true'],
      ['receive.denyNonFastForwards', 'true'],
      ['receive.fsckObjects', 'true'],
    ] as const) {
      git(remote, 'config', key, value);
    }
    await writeFile(path.join(remote, 'hooks', 'pre-receive'), preReceiveHookScript, 'utf8');
    await chmod(path.join(remote, 'hooks', 'pre-receive'), 0o755);

    /* The device: a PicoGK project whose large files are LFS pointers. */
    git(device, 'init', '--quiet', '--initial-branch=main', '.');
    await writeFile(path.join(device, 'engine.cs'), 'namespace Radial;\n', 'utf8');
    await writeFile(
      path.join(device, 'crank.stl'),
      `version https://git-lfs.github.com/spec/v1\noid sha256:${'a'.repeat(64)}\nsize 4194304\n`,
      'utf8',
    );
    git(device, 'add', '.');
    const tree = git(device, 'write-tree');

    let parents: string[] = [];
    let at = 1_790_748_379;
    for (let index = 0; index < 10; index += 1) {
      const record = versionOneRecords(parents.length === 0 ? [] : parents, index);
      const provenance = record['provenance'] as Record<string, unknown>;
      // oxlint-disable-next-line no-await-in-loop -- a linear history, one commit at a time
      const oid = await commit({
        tree,
        parents,
        author: `${localHandle} <${localHandle}@users.noreply.tau.new>`,
        at,
        message: [
          String((record['summary'] as Record<string, unknown>)['generated']),
          '',
          `Tau-Metadata: ${JSON.stringify(record)}`,
          provenance['source'] === 'agent' && provenance['actorId'] === 'agent'
            ? `Tau-Actor: agent agent run ${String(provenance['runId'])} for ${localHandle}`
            : `Tau-Actor: user ${localHandle}`,
          `Tau-Trigger: ${String(provenance['trigger'])}`,
          '',
        ].join('\n'),
      });
      parents = [oid];
      at += 86_400;
    }
    /* The one version 2 commit (a807ad1), by the account, on top. */
    const tip = await commit({
      tree,
      parents,
      author: `Someone <${accountId}@users.noreply.tau.new>`,
      at,
      message: [
        'Fix this engine',
        '',
        `Tau-Metadata: ${JSON.stringify({
          version: 2,
          parents,
          provenance: {
            source: 'agent',
            capture: 'turn',
            via: 'desktop',
            actor: { kind: 'agent', runId: 'req_e1', onBehalfOf: { kind: 'user', id: accountId } },
            createdAt: at * 1000,
          },
          summary: { generated: 'Fix this engine' },
        })}`,
        '',
      ].join('\n'),
    });
    git(device, 'update-ref', 'refs/heads/main', tip);

    /* The two operation-log refs, each a device's append-only `events/` segment. */
    for (const device_ of ['0f0e0d0c-0b0a-4908-8706-050403020100', '1f1e1d1c-1b1a-4918-8716-151413121110']) {
      const segment = path.join(root, `segment-${device_}`);
      // oxlint-disable-next-line no-await-in-loop -- two refs, one after the other
      await writeFile(segment, '{"n":1}\n', 'utf8');
      const blob = git(device, 'hash-object', '-w', segment);
      const eventsTree = execFileSync(realGit, ['mktree'], {
        cwd: device,
        env: environment as unknown as NodeJS.ProcessEnv,
        input: `100644 blob ${blob}\t${device_}.jsonl\n`,
        encoding: 'utf8',
      }).trim();
      const opsTree = execFileSync(realGit, ['mktree'], {
        cwd: device,
        env: environment as unknown as NodeJS.ProcessEnv,
        input: `040000 tree ${eventsTree}\tevents\n`,
        encoding: 'utf8',
      }).trim();
      // oxlint-disable-next-line no-await-in-loop -- two refs
      const ops = await commit({ tree: opsTree, parents: [], author: 'Tau <noreply@tau.new>', at, message: 'ops\n' });
      git(device, 'update-ref', `refs/tau/ops/${device_}`, ops);
    }
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('admits the record refs, then main with its ten version 1 commits, from the build the customer runs', () => {
    /* 1.17.65's first receive-pack: the record refs alone (`revision-effects.ts` pushes the branch separately). */
    const records = push('refs/tau/ops/*:refs/tau/ops/*');
    expect(records.status, records.stderr).toBe(0);

    /* The second: `main` as a creation, which today's hook refused ten times over. */
    const history = push(`refs/heads/main:refs/heads/main`);
    expect(history.stderr).not.toContain('Tau: refused');
    expect(history.stderr).not.toContain('Tau-Code:');
    expect(history.status, history.stderr).toBe(0);
    expect(git(remote, 'rev-list', '--count', 'refs/heads/main')).toBe('11');
  });
});
