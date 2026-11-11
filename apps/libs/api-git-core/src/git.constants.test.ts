import { execFileSync, spawn } from 'node:child_process';
import process from 'node:process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, onTestFinished } from 'vitest';
import {
  authorshipRefusals,
  ceilingRefusalMarker,
  gitLfsObjectKey,
  pktLine,
  preReceiveHookScript,
  projectIdFromRepository,
  quotaRefusalMarker,
  quotaRefusalSentence,
  serviceAdvertisementPrefix,
  versionNumberRefusals,
  versionNumberTakenMarker,
} from '#git.constants.js';
import { storageLimitBytesByTier } from '@taucad/billing';
import * as constants from '#git.constants.js';

/* eslint-disable @typescript-eslint/naming-convention -- process environment variable names, not identifiers */
const admittedEnvironment: Readonly<Record<string, string>> = {
  TAU_GIT_PUSH_ADMITTED: '1',
};
/* eslint-enable @typescript-eslint/naming-convention -- end of the process environment map */

const runHook = async (
  ref: string | readonly string[],
  environment: Readonly<Record<string, string>> = admittedEnvironment,
  cwd?: string,
): Promise<{ code: number | undefined; stderr: string }> =>
  new Promise((resolve) => {
    const child = spawn('sh', [hookPath], {
      env: environment as NodeJS.ProcessEnv,
      ...(cwd === undefined ? {} : { cwd }),
    });
    const stderr: Array<Uint8Array<ArrayBuffer>> = [];
    child.stderr.on('data', (chunk: Uint8Array<ArrayBuffer>) => stderr.push(chunk));
    child.stdin.on('error', (error: NodeJS.ErrnoException) => {
      /* A refusing hook can exit before it reads stdin; its exit code and stderr carry the verdict. */
      if (error.code !== 'EPIPE') {
        throw error;
      }
    });
    child.stdin.end(
      (typeof ref === 'string' ? [ref] : ref)
        /* A bare name is a ref *creation*; a caller that needs a particular
           old/new pair (a deletion, a rewind) writes the whole hook line. */
        .map((name) => (name.includes(' ') ? `${name}\n` : `${'0'.repeat(40)} ${'1'.repeat(40)} ${name}\n`))
        .join(''),
    );
    child.on('close', (code) => {
      resolve({
        code: code ?? undefined,
        stderr: Buffer.concat(stderr).toString('utf8'),
      });
    });
  });

let hookDirectory: string;
let hookPath: string;

/* Every stock git on PATH, resolved once: the shim below calls it by path. */
const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();

/*
 * A `git` in front of the real one that logs what the hook's first-parent walk
 * printed, or fails it on request — so a row can count the history a push read
 * (RV-W6 F4) and prove the walk fails closed.
 */
const revListShim = `#!/bin/sh
case " $* " in
  *" --first-parent "*)
    if [ "\${TAU_TEST_REVLIST_FAIL:-}" = "1" ]; then exit 128; fi
    out=$("$TAU_TEST_REAL_GIT" "$@") || exit $?
    [ -z "$out" ] || printf '%s\\n' "$out" | tee -a "$TAU_TEST_REVLIST_LOG"
    exit 0
    ;;
esac
exec "$TAU_TEST_REAL_GIT" "$@"
`;

/**
 * A real repository the installed hook runs in, with Tau's commit shape at hand:
 * the hook reads the commits a push brings, so a row's tips must exist.
 */
const hookRepository = async (options: Readonly<{ failWalk?: boolean }> = {}) => {
  const fixture = await mkdtemp(path.join(tmpdir(), 'tau-git-hook-repo-'));
  const shim = path.join(fixture, '.shim');
  await mkdir(shim);
  await writeFile(path.join(shim, 'git'), revListShim, 'utf8');
  await chmod(path.join(shim, 'git'), 0o755);
  const walkLog = path.join(fixture, '.walk.log');
  await writeFile(walkLog, '', 'utf8');
  /* eslint-disable @typescript-eslint/naming-convention -- process environment names */
  const environment: Record<string, string> = {
    PATH: `${shim}:${process.env['PATH'] ?? '/usr/bin:/bin'}`,
    HOME: fixture,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_AUTHOR_NAME: 'D14',
    GIT_AUTHOR_EMAIL: 'd14@tau.test',
    GIT_COMMITTER_NAME: 'D14',
    GIT_COMMITTER_EMAIL: 'd14@tau.test',
    TAU_TEST_REAL_GIT: realGit,
    TAU_TEST_REVLIST_LOG: walkLog,
    ...(options.failWalk === true ? { TAU_TEST_REVLIST_FAIL: '1' } : {}),
  };
  /* eslint-enable @typescript-eslint/naming-convention -- end of the process environment map */
  const git = async (...args: readonly string[]): Promise<string> =>
    new Promise((resolve, reject) => {
      const child = spawn(realGit, [...args], {
        cwd: fixture,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: environment as unknown as NodeJS.ProcessEnv,
      });
      const out: Array<Uint8Array<ArrayBuffer>> = [];
      child.stdout.on('data', (chunk: Uint8Array<ArrayBuffer>) => out.push(chunk));
      child.on('close', (code) => {
        if (code === 0) {
          resolve(Buffer.concat(out).toString('utf8').trim());
          return;
        }
        reject(new Error(`git ${args.join(' ')}`));
      });
    });
  /** One hook run over `<old> <new> <ref>` lines, as receive-pack feeds it. */
  const push = async (
    lines: string | readonly string[],
    extra: Readonly<Record<string, string>> = {},
  ): Promise<{ code: number | undefined; stderr: string }> =>
    // eslint-disable-next-line @typescript-eslint/naming-convention -- process environment names
    runHook(lines, { ...environment, TAU_GIT_PUSH_ADMITTED: '1', ...extra }, fixture);
  /** A commit object as Tau writes one, `jj:trees` and all, on the given parents. */
  const commit = async (parents: readonly string[], conflicted: boolean): Promise<string> => {
    const tree = await git('write-tree');
    const body = [
      `tree ${tree}`,
      ...parents.map((parent) => `parent ${parent}`),
      'author D14 <d14@tau.test> 1790000000 +0000',
      'committer D14 <d14@tau.test> 1790000000 +0000',
      ...(conflicted ? [`jj:trees ${tree} ${tree} ${tree}`] : []),
      '',
      conflicted ? 'Needs your decision' : `Plain ${String(Math.random())}`,
      '',
    ].join('\n');
    const file = path.join(fixture, '.git', `commit-${String(Math.random()).slice(2)}`);
    await writeFile(file, body, 'utf8');
    return git('hash-object', '-t', 'commit', '-w', '--literally', file);
  };
  /** How many commits the hook's first-parent walks printed so far. */
  const walked = async (): Promise<number> => {
    const log = await readFile(walkLog, 'utf8');
    return log.split('\n').filter(Boolean).length;
  };
  await git('init', '--quiet', '--initial-branch=main', '.');
  await git('commit', '--quiet', '--allow-empty', '-m', 'base');
  const base = await git('rev-parse', 'HEAD');
  return {
    git,
    push,
    commit,
    walked,
    base,
    dispose: async () => rm(fixture, { recursive: true, force: true }),
  };
};

const none = '0'.repeat(40);

describe('Tau Hosted Remote constants', () => {
  beforeAll(async () => {
    hookDirectory = await mkdtemp(path.join(tmpdir(), 'tau-git-hook-'));
    hookPath = path.join(hookDirectory, 'pre-receive');
    await writeFile(hookPath, preReceiveHookScript, 'utf8');
    await chmod(hookPath, 0o755);
  });

  afterAll(async () => {
    await rm(hookDirectory, { recursive: true, force: true });
  });

  it.each([104_857_600, 104_857_601])(
    'should enforce the inclusive 100 MiB Git blob ceiling for %i bytes',
    async (size) => {
      const repository = await hookRepository();
      const directory = await mkdtemp(path.join(tmpdir(), 'tau-file-limit-'));
      onTestFinished(async () => {
        await repository.dispose();
        await rm(directory, { recursive: true, force: true });
      });
      const file = path.join(directory, 'compressible.bin');
      await writeFile(file, Buffer.alloc(size));
      const oid = await repository.git('hash-object', '-w', file);
      await repository.git('update-index', '--add', '--cacheinfo', '100644', oid, 'compressible.bin');
      const commit = await repository.commit([repository.base], false);
      const outcome = await repository.push(`${repository.base} ${commit} refs/heads/main`);
      expect(outcome.code, outcome.stderr).toBe(size === 104_857_600 ? 0 : 1);
      if (size > 104_857_600) {
        expect(outcome.stderr).toContain('100 MiB');
      }
    },
  );

  it('accepts only the pushable ref namespaces (A39), as the installed hook itself', async () => {
    /* The hook reads what a new ref points at, so its tip is a real commit. */
    const repository = await hookRepository();
    onTestFinished(repository.dispose);
    for (const ref of [
      'refs/heads/main',
      'refs/tags/v1',
      'refs/tau/chats/chat_1',
      'refs/tau/evidence/e1',
      'refs/tau/artifacts/a1',
      /* A device's operation log is a Records ref that travels (D15). */
      'refs/tau/ops/0f0e0d0c-0b0a-4908-8706-050403020100',
      /* A conflict line is a branch that travels (D14); `sync/` is no longer host-local (I14). */
      'refs/heads/conflicts/main/device-a',
      'refs/heads/sync/tau/main',
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- one hook run per ref, by design
      const accepted = await repository.push(`${none} ${repository.base} ${ref}`);
      expect(accepted.code, `${ref}: ${accepted.stderr}`).toBe(0);
    }

    for (const ref of [
      'refs/tau/owners/o1',
      'refs/tau/workspaces/w1',
      'refs/tau/revisions/r1',
      'refs/tau/transactions/t1',
      'refs/tau/retention/records/r1',
      'refs/tau/head',
      'refs/remotes/origin/main',
      'refs/heads/',
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- one hook run per ref, by design
      const refused = await runHook(ref);
      expect(refused.code, ref).toBe(1);
      expect(refused.stderr).toContain(ref === 'refs/heads/' ? 'host-local' : ref);
    }
  });

  /**
   * Ruling OQ4: no ref family is deletable, and the hook is the only place that
   * can say so. `receive.denyDeletes` is set on the spawn as well, but git
   * applies it to `refs/heads/*` alone — measured against git 2.55, a tag and a
   * `refs/tau/chats/*` ref were both deletable with it on (review C25).
   */
  it('refuses a deletion of every pushable ref family', async () => {
    for (const ref of [
      'refs/heads/main',
      'refs/tags/v1',
      'refs/tau/chats/chat_1',
      'refs/tau/artifacts/a1',
      'refs/tau/ops/0f0e0d0c-0b0a-4908-8706-050403020100',
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- one hook run per ref, by design
      const refused = await runHook(`${'1'.repeat(40)} ${'0'.repeat(40)} ${ref}`);
      expect(refused.code, `${ref} was deletable: ${refused.stderr}`).toBe(1);
      expect(refused.stderr).toContain('never deletes a ref');
    }
  });

  it('refuses a push that did not come through the API admission check', async () => {
    const refused = await runHook('refs/heads/main', {});
    expect(refused.code).toBe(1);
    expect(refused.stderr).toContain('only through the Tau API');
  });

  it('rejects a mixed push atomically when one ref is host-local', async () => {
    const refused = await runHook(['refs/heads/main', 'refs/remotes/origin/main']);
    expect(refused.code).toBe(1);
    expect(refused.stderr).toContain('refs/remotes/origin/main');
  });

  it('installs the same allow-list into the pre-receive hook', () => {
    for (const prefix of ['refs/heads/*', 'refs/tags/*', 'refs/tau/chats/*']) {
      expect(preReceiveHookScript).toContain(prefix);
    }
    expect(preReceiveHookScript).toContain('TAU_GIT_PUSH_ADMITTED');
    expect(preReceiveHookScript).toContain('GIT_QUARANTINE_PATH');
    expect(preReceiveHookScript.startsWith('#!/bin/sh\n')).toBe(true);
  });

  /**
   * D12: dumb HTTP is gone, and so is the hook that kept its layout current.
   * There is no `post-receive` at all — materialization is derived from the
   * committed ref-map difference (D9/D19), never spooled by a hook.
   */
  it('installs no post-receive hook and never runs update-server-info', () => {
    expect(preReceiveHookScript).not.toContain('update-server-info');
    expect(Object.keys(constants)).not.toContain('postReceiveHookScript');
    expect(Object.keys(constants)).not.toContain('publishedTagSpoolFile');
    expect(Object.keys(constants)).not.toContain('isDumbHttpPath');
    expect(Object.keys(constants)).not.toContain('dumbHttpContentType');
  });

  /**
   * D20, measured through the hook rather than reasoned about: a push that
   * would take the repository past its ceiling is refused *with the files it
   * brings*, because "your repository is too large" is not something a person
   * can act on and "remove these three" is.
   *
   * The ceiling is the lease's remaining headroom, which the service computes
   * from the manifest's live pack bytes and passes in; the hook only compares
   * it against the quarantine `receive-pack` has already written.
   *
   * D17 / L6-F2: the plan's quota refusal carries the same list and the
   * caller's sentence. A free allowance equals the D20 ceiling and the quota is
   * tested first, so without it a free owner would never see a file named.
   */
  it.each<{
    bound: string;
    environment: Readonly<Record<string, string>>;
    opener: string;
    sentence: string | undefined;
  }>([
    {
      bound: 'the D20 ceiling',
      /* eslint-disable-next-line @typescript-eslint/naming-convention -- process environment name */
      environment: { TAU_GIT_CEILING_REMAINING_BYTES: '16' },
      opener: ceilingRefusalMarker,
      sentence: undefined,
    },
    {
      bound: 'the plan quota, addressed to the caller',
      environment: {
        /* eslint-disable @typescript-eslint/naming-convention -- process environment names */
        TAU_GIT_QUOTA_REMAINING_BYTES: '16',
        TAU_GIT_QUOTA_SENTENCE: quotaRefusalSentence('owner', storageLimitBytesByTier.free),
        /* eslint-enable @typescript-eslint/naming-convention -- end of the process environment map */
      },
      opener: quotaRefusalMarker,
      sentence: 'your 1 GB storage plan',
    },
  ])(
    'should refuse a push past $bound and name the largest files it adds',
    async ({ environment, opener, sentence }) => {
      const fixture = await mkdtemp(path.join(tmpdir(), 'tau-git-ceiling-'));
      const quarantine = await mkdtemp(path.join(tmpdir(), 'tau-git-quarantine-'));
      try {
        /* eslint-disable @typescript-eslint/naming-convention -- process environment names */
        const fixtureEnvironment = {
          PATH: process.env['PATH'] ?? '/usr/bin:/bin',
          HOME: fixture,
          GIT_CONFIG_GLOBAL: '/dev/null',
          GIT_CONFIG_SYSTEM: '/dev/null',
        } as unknown as NodeJS.ProcessEnv;
        /* eslint-enable @typescript-eslint/naming-convention -- end of the process environment map */
        const git = async (...args: readonly string[]): Promise<void> =>
          new Promise((resolve, reject) => {
            const child = spawn('git', [...args], {
              cwd: fixture,
              stdio: ['ignore', 'pipe', 'pipe'],
              env: fixtureEnvironment,
            });
            child.on('close', (code) => {
              if (code === 0) {
                resolve();
                return;
              }
              reject(new Error(`git ${args.join(' ')}`));
            });
          });
        const read = async (...args: readonly string[]): Promise<string> =>
          new Promise((resolve) => {
            const child = spawn('git', [...args], {
              cwd: fixture,
              stdio: ['ignore', 'pipe', 'ignore'],
              env: fixtureEnvironment,
            });
            const out: Array<Uint8Array<ArrayBuffer>> = [];
            child.stdout.on('data', (chunk: Uint8Array<ArrayBuffer>) => out.push(chunk));
            child.on('close', () => {
              resolve(Buffer.concat(out).toString('utf8').trim());
            });
          });

        await git('init', '--quiet', '--initial-branch=main', '.');
        await git('config', 'user.email', 'w4@tau.test');
        await git('config', 'user.name', 'W4');
        await writeFile(path.join(fixture, 'huge.bin'), Buffer.alloc(64 * 1024, 7));
        await writeFile(path.join(fixture, 'part.ts'), 'export const width = 10;\n', 'utf8');
        await git('add', '.');
        await git('commit', '--quiet', '-m', 'over the ceiling');
        const head = await read('rev-parse', 'HEAD');
        /* The refs a push carries are not reachable from the repository's own
         refs yet, which is what `--not --all` means; dropping the branch is how
         a fixture stands in for the quarantine's unreferenced objects. */
        await git('update-ref', '-d', 'refs/heads/main');
        await writeFile(path.join(quarantine, 'pack'), Buffer.alloc(4096, 1));

        const refused = await runHook(
          `${'0'.repeat(40)} ${head} refs/heads/main`,
          {
            /* eslint-disable @typescript-eslint/naming-convention -- process environment names */
            PATH: process.env['PATH'] ?? '/usr/bin:/bin',
            TAU_GIT_PUSH_ADMITTED: '1',
            ...environment,
            GIT_QUARANTINE_PATH: quarantine,
            /* eslint-enable @typescript-eslint/naming-convention -- end of the process environment map */
          },
          fixture,
        );

        expect(refused.code, refused.stderr).toBe(1);
        /* The refusal *opens* with the marker, which is what lets the client
         classify a status-less `pre-receive` refusal as the D20 ceiling
         (`packages/revisions/src/remotes.ts`) while showing these same words. */
        expect(refused.stderr.startsWith(opener), refused.stderr).toBe(true);
        if (sentence !== undefined) {
          expect(refused.stderr).toContain(sentence);
        }
        expect(refused.stderr).toContain('huge.bin');
        expect(refused.stderr).toContain('part.ts');
        expect(refused.stderr).toContain('nothing was written');
        /* Largest first, so the first name in the list is the one worth removing. */
        expect(refused.stderr.indexOf('huge.bin')).toBeLessThan(refused.stderr.indexOf('part.ts'));
      } finally {
        await rm(fixture, { recursive: true, force: true });
        await rm(quarantine, { recursive: true, force: true });
      }
    },
  );

  /**
   * I9 (D22, L6-F13): a chat ref fast-forwards only when every device's
   * segment the old tip holds is a byte prefix of the same path in the new tip.
   * The hook runs over a real repository, because the rule is a blob
   * comparison and a stub would only prove the shell parsed.
   */
  /* Ruling R4 (W7): the operation log `refs/tau/ops/<device>` has the chat segment's shape and the same rule. */
  it.each([
    ['refs/tau/chats/chat_1', 'chat log only grows'],
    ['refs/tau/ops/device-a', 'operation log only grows'],
  ] as const)(
    'passes an ordinary append to %s and refuses a rewritten, truncated or dropped segment',
    async (ref, sentence) => {
      const fixture = await mkdtemp(path.join(tmpdir(), 'tau-git-segments-'));
      try {
        /* eslint-disable @typescript-eslint/naming-convention -- process environment names */
        const environment = {
          PATH: process.env['PATH'] ?? '/usr/bin:/bin',
          HOME: fixture,
          GIT_CONFIG_GLOBAL: '/dev/null',
          GIT_CONFIG_SYSTEM: '/dev/null',
          GIT_AUTHOR_NAME: 'I9',
          GIT_AUTHOR_EMAIL: 'i9@tau.test',
          GIT_COMMITTER_NAME: 'I9',
          GIT_COMMITTER_EMAIL: 'i9@tau.test',
        } as unknown as NodeJS.ProcessEnv;
        /* eslint-enable @typescript-eslint/naming-convention -- end of the process environment map */
        const git = async (...args: readonly string[]): Promise<string> =>
          new Promise((resolve, reject) => {
            const child = spawn('git', [...args], {
              cwd: fixture,
              stdio: ['ignore', 'pipe', 'pipe'],
              env: environment,
            });
            const out: Array<Uint8Array<ArrayBuffer>> = [];
            child.stdout.on('data', (chunk: Uint8Array<ArrayBuffer>) => out.push(chunk));
            child.on('close', (code) => {
              if (code === 0) {
                resolve(Buffer.concat(out).toString('utf8').trim());
                return;
              }
              reject(new Error(`git ${args.join(' ')}`));
            });
          });
        /** Commits the working tree's `events/` exactly as given, on top of HEAD. */
        const commit = async (segments: Readonly<Record<string, string>>): Promise<string> => {
          await rm(path.join(fixture, 'events'), { recursive: true, force: true });
          await mkdir(path.join(fixture, 'events'));
          for (const [name, contents] of Object.entries(segments)) {
            // oxlint-disable-next-line no-await-in-loop -- a handful of fixture files
            await writeFile(path.join(fixture, 'events', name), contents, 'utf8');
          }
          await git('add', '-A', '.');
          await git('commit', '--quiet', '--allow-empty', '-m', 'segments');
          return git('rev-parse', 'HEAD');
        };
        const push = async (from: string, to: string): Promise<{ code: number | undefined; stderr: string }> =>
          runHook(
            `${from} ${to} ${ref}`,
            // eslint-disable-next-line @typescript-eslint/naming-convention -- process environment names
            { ...(environment as Record<string, string>), TAU_GIT_PUSH_ADMITTED: '1' },
            fixture,
          );

        await git('init', '--quiet', '--initial-branch=main', '.');
        const base = await commit({
          'device-a.jsonl': '{"n":1}\n',
          'device-b.jsonl': '{"n":1}\n',
          'device-c.jsonl': '',
        });

        /* Both devices append, and a third device's first segment arrives. */
        const appended = await commit({
          'device-a.jsonl': '{"n":1}\n{"n":2}\n',
          'device-b.jsonl': '{"n":1}\n{"n":3}\n',
          'device-c.jsonl': '{"n":1}\n',
          'device-d.jsonl': '{"n":1}\n',
        });
        const accepted = await push(base, appended);
        expect(accepted.code, accepted.stderr).toBe(0);

        for (const [label, segments] of [
          ['a rewritten byte', { 'device-a.jsonl': '{"n":9}\n{"n":2}\n', 'device-b.jsonl': '{"n":1}\n{"n":3}\n' }],
          ['a truncation', { 'device-a.jsonl': '{"n":1}\n', 'device-b.jsonl': '{"n":1}\n{"n":3}\n' }],
          ['a dropped segment', { 'device-a.jsonl': '{"n":1}\n{"n":2}\n' }],
        ] as const) {
          // oxlint-disable-next-line no-await-in-loop -- each tampered tip builds on the accepted one
          await git('reset', '--quiet', '--hard', appended);
          // oxlint-disable-next-line no-await-in-loop -- as above
          const tampered = await commit({ ...segments, 'device-c.jsonl': '{"n":1}\n', 'device-d.jsonl': '{"n":1}\n' });
          // oxlint-disable-next-line no-await-in-loop -- as above
          const refused = await push(appended, tampered);
          expect(refused.code, `${label}: ${refused.stderr}`).toBe(1);
          expect(refused.stderr).toContain(sentence);
        }
      } finally {
        await rm(fixture, { recursive: true, force: true });
      }
    },
  );

  /**
   * Charter D14: a conflicted revision travels only on its conflict line. On
   * `main`, or any other ref, it is refused in words; the merge that lands a
   * decision — the conflicted revision as its second parent — is admitted.
   */
  it('admits a conflicted revision on a conflict line only, and the merge that decides it on main', async () => {
    const { git, push, commit, base, dispose } = await hookRepository();
    onTestFinished(dispose);
    const other = await commit([base], false);
    const conflicted = await commit([other, base], true);

    const onLine = await push(`${none} ${conflicted} refs/heads/conflicts/main/device-a`);
    expect(onLine.code, onLine.stderr).toBe(0);
    /* The server now holds the line: what it reaches must not hide the revision from the walk. */
    await git('update-ref', 'refs/heads/conflicts/main/device-a', conflicted);

    for (const [label, from, to, ref] of [
      ['a conflicted tip on main', base, conflicted, 'refs/heads/main'],
      ['a child of it on main', base, await commit([conflicted], false), 'refs/heads/main'],
      ['a new branch at it', none, conflicted, 'refs/heads/feature'],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop -- one hook run per case, by design
      const refused = await push(`${from} ${to} ${ref}`);
      expect(refused.code, label).toBe(1);
      expect(refused.stderr, label).toContain(`Tau: refused ${ref} — ${constants.conflictedRevisionRefusal}`);
    }

    /* The decision: main's tip first, the conflicted revision among the later parents. */
    const decided = await commit([base, conflicted], false);
    const landed = await push(`${base} ${decided} refs/heads/main`);
    expect(landed.code, landed.stderr).toBe(0);
  });

  /* RV-W6 F4: the walk reads only what a push brings, stops at what other refs reach, and fails closed. */
  it('reads no history for N new tags at main, and only the new commits for a branch', async () => {
    const { git, push, commit, walked, base, dispose } = await hookRepository();
    onTestFinished(dispose);
    let tip = base;
    for (let depth = 0; depth < 40; depth += 1) {
      // oxlint-disable-next-line no-await-in-loop -- a deep first-parent line, one commit at a time
      tip = await commit([tip], false);
    }
    await git('update-ref', 'refs/heads/main', tip);

    const tags = await push(Array.from({ length: 20 }, (_, index) => `${none} ${tip} refs/tags/v${String(index)}`));
    expect(tags.code, tags.stderr).toBe(0);
    expect(await walked(), 'N tags at main walk no history').toBe(0);

    const next = await commit([tip], false);
    const branch = await push(`${none} ${next} refs/heads/feature`);
    expect(branch.code, branch.stderr).toBe(0);
    expect(await walked(), 'a new branch reads only its own new commit').toBe(1);
  });

  it('refuses a new ref at a conflicted revision a decision already holds, and admits one at the decision', async () => {
    const { git, push, commit, base, dispose } = await hookRepository();
    onTestFinished(dispose);
    const other = await commit([base], false);
    const conflicted = await commit([other, base], true);
    const decided = await commit([base, conflicted], false);
    await git('update-ref', 'refs/heads/main', decided);
    await git('update-ref', 'refs/heads/conflicts/main/device-a', conflicted);

    const atConflict = await push(`${none} ${conflicted} refs/heads/feature`);
    expect(atConflict.code).toBe(1);
    expect(atConflict.stderr).toContain(constants.conflictedRevisionRefusal);
    const atDecision = await push(`${none} ${decided} refs/tags/decided`);
    expect(atDecision.code, atDecision.stderr).toBe(0);
  });

  it('stops at a refused non-fast-forward, and refuses when the walk itself fails', async () => {
    const repository = await hookRepository();
    onTestFinished(repository.dispose);
    const ahead = await repository.commit([repository.base], false);
    const sideways = await repository.commit([repository.base], true);
    await repository.git('update-ref', 'refs/heads/main', ahead);
    const rewound = await repository.push(`${ahead} ${sideways} refs/heads/main`);
    expect(rewound.code).toBe(1);
    expect(rewound.stderr).toContain('does not fast-forward');
    expect(rewound.stderr).not.toContain(constants.conflictedRevisionRefusal);
    expect(await repository.walked()).toBe(0);

    const failing = await hookRepository({ failWalk: true });
    onTestFinished(failing.dispose);
    const refused = await failing.push(`${none} ${failing.base} refs/heads/feature`);
    expect(refused.code).toBe(1);
    expect(refused.stderr).toContain('could not be checked');
  });

  /* RV-W6 F8: a bare `conflicts` would shadow every device's lines. */
  it('keeps refs/heads/conflicts for lines of the form conflicts/<branch>/<device>', async () => {
    const { push, base, dispose } = await hookRepository();
    onTestFinished(dispose);
    for (const ref of ['refs/heads/conflicts', 'refs/heads/conflicts/main']) {
      // oxlint-disable-next-line no-await-in-loop -- one hook run per ref, by design
      const refused = await push(`${none} ${base} ${ref}`);
      expect(refused.code, ref).toBe(1);
      expect(refused.stderr).toContain('conflicts/ is kept for decisions that travel between devices');
    }
    const line = await push(`${none} ${base} refs/heads/conflicts/main/device-a`);
    expect(line.code, line.stderr).toBe(0);
  });

  /**
   * Review F6: a bound that cannot measure what is arriving has not been
   * satisfied. The admission flag above it already fails closed; these two now
   * do too, so a git without object quarantine refuses rather than waving a
   * push past both the plan and D20.
   */
  it('refuses a bounded push it cannot measure, rather than passing it', async () => {
    const { push, base, dispose } = await hookRepository();
    onTestFinished(dispose);
    // eslint-disable-next-line @typescript-eslint/naming-convention -- process environment names
    const refused = await push(`${none} ${base} refs/heads/next`, { TAU_GIT_QUOTA_REMAINING_BYTES: '4096' });

    expect(refused.code, refused.stderr).toBe(1);
    expect(refused.stderr).toContain('cannot be measured');
    expect(refused.stderr).toContain('nothing was written');
  });

  /** An unbounded push — no plan figure, no ceiling — is not measured and not refused. */
  it('passes a push no bound was set for', async () => {
    const { push, base, dispose } = await hookRepository();
    onTestFinished(dispose);
    const accepted = await push(`${none} ${base} refs/heads/next`);

    expect(accepted.code, accepted.stderr).toBe(0);
  });

  it('spells one LFS object path the way packages/revisions does', () => {
    const oid = `${'ab'}${'cd'}${'0'.repeat(60)}`;
    expect(gitLfsObjectKey('proj_1', oid)).toBe(`git-lfs/proj_1/lfs/objects/ab/cd/${oid}`);
  });

  it('reads a repository name with or without the .git suffix, and refuses a traversal', () => {
    expect(projectIdFromRepository('proj_abc.git')).toBe('proj_abc');
    expect(projectIdFromRepository('proj_abc')).toBe('proj_abc');
    expect(projectIdFromRepository('../../etc/passwd')).toBeUndefined();
    expect(projectIdFromRepository('a/b.git')).toBeUndefined();
    expect(projectIdFromRepository('')).toBeUndefined();
  });

  it('frames the service advertisement as git does', () => {
    expect(pktLine('a\n')).toBe('0006a\n');
    expect(serviceAdvertisementPrefix('git-upload-pack')).toBe('001e# service=git-upload-pack\n0000');
    expect(serviceAdvertisementPrefix('git-receive-pack')).toBe('001f# service=git-receive-pack\n0000');
  });

  /*
   * D17: one sentence per relationship. The owner who can grow the plan hears
   * its size; the owner at the top tier is told what to do instead; a
   * collaborator is sent to the owner and never told the owner's plan.
   */
  it('should address a quota refusal to the caller and name the allowance only to its owner', () => {
    const { free } = storageLimitBytesByTier;
    expect(quotaRefusalSentence('owner', free)).toContain('your 1 GB storage plan');
    expect(quotaRefusalSentence('ownerAtTopTier', storageLimitBytesByTier.enterprise)).toMatch(
      /your 1 TB storage plan.*Remove or stop tracking the largest files/u,
    );
    const collaborator = quotaRefusalSentence('collaborator', free);
    expect(collaborator).toContain('Ask the owner to make room.');
    expect(collaborator).not.toMatch(/\bGB\b|\byour\b.*plan/u);
  });

  it('should spell the quota marker the way packages/revisions matches it', () => {
    expect(quotaRefusalMarker).toBe('Tau: storage quota exceeded');
  });

  /* W13e: one account's desktop and browser share the per-project key, and their
     busiest measured minute was 123 after W13d. The controller's D22 row proves
     the last request of the budget passes and the next is a `429`. */
  it('budgets 240 smart-HTTP requests per account and project a minute, and leaves LFS and the account total', () => {
    expect(constants.gitRequestWindowSeconds).toBe(60);
    expect(constants.gitRequestsPerWindow).toEqual({ rpc: 240, lfs: 1200 });
    expect(constants.gitRequestsPerUserPerWindow).toBe(2400);
  });
});

/**
 * B4 (blueprint A3, Q11; Revisions Policy rule 19): every commit new to a
 * project's history names the account pushing it, whatever its Tau record's
 * version, through the installed hook itself. The pusher's own record is the
 * shape `revisionCommitMessage` and `revisionAuthorSignature` write today.
 */
describe('pre-receive authorship check (B4)', () => {
  const pusher = 'user_b4_pusher';
  const other = 'user_b4_other';
  const noreply = (id: string): string => `${id}@users.noreply.tau.new`;

  let authorshipHookDirectory: string;
  let authorshipHookPath: string;

  beforeAll(async () => {
    authorshipHookDirectory = await mkdtemp(path.join(tmpdir(), 'tau-git-authorship-hook-'));
    authorshipHookPath = path.join(authorshipHookDirectory, 'pre-receive');
    await writeFile(authorshipHookPath, preReceiveHookScript, 'utf8');
    await chmod(authorshipHookPath, 0o755);
  });

  afterAll(async () => {
    await rm(authorshipHookDirectory, { recursive: true, force: true });
  });

  /** A Tau record in the current trailer shape, with the readable trailer beside it. */
  const recorded = (provenance: Readonly<Record<string, unknown>>, title = 'Saved'): string =>
    [
      title,
      '',
      `Tau-Metadata: ${JSON.stringify({
        version: 1,
        parents: [],
        provenance: { source: 'user', createdAt: 1_790_000_000_000, ...provenance },
        summary: { generated: title },
      })}`,
      'Tau-Actor: user Someone',
      '',
    ].join('\n');

  /** A repository with the base commit on `main`, and a writer of one raw commit on it. */
  const authorshipRepository = async () => {
    const fixture = await mkdtemp(path.join(tmpdir(), 'tau-git-authorship-repo-'));
    /* eslint-disable @typescript-eslint/naming-convention -- process environment names */
    const environment: Record<string, string> = {
      PATH: process.env['PATH'] ?? '/usr/bin:/bin',
      HOME: fixture,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_SYSTEM: '/dev/null',
      GIT_AUTHOR_NAME: 'Base',
      GIT_AUTHOR_EMAIL: 'base@tau.test',
      GIT_COMMITTER_NAME: 'Base',
      GIT_COMMITTER_EMAIL: 'base@tau.test',
    };
    /* eslint-enable @typescript-eslint/naming-convention -- end of the process environment map */
    const git = (...args: readonly string[]): string =>
      execFileSync(realGit, [...args], {
        cwd: fixture,
        env: environment as NodeJS.ProcessEnv,
        encoding: 'utf8',
      }).trim();
    git('init', '--quiet', '--initial-branch=main', '.');
    git('commit', '--quiet', '--allow-empty', '-m', 'base');
    const base = git('rev-parse', 'HEAD');
    const tree = git('rev-parse', 'HEAD^{tree}');
    /** One commit on `parent`, authored at `email`, with `message`. */
    const commit = async (email: string, message: string, parent = base): Promise<string> => {
      const file = path.join(fixture, '.git', `commit-${String(Math.random()).slice(2)}`);
      await writeFile(
        file,
        [
          `tree ${tree}`,
          `parent ${parent}`,
          `author Someone <${email}> 1790000000 +0000`,
          'committer Tau <noreply@tau.new> 1790000000 +0000',
          '',
          message,
        ].join('\n'),
        'utf8',
      );
      return git('hash-object', '-t', 'commit', '-w', file);
    };
    /** One hook run moving `ref` to `tip` (from the base for `main`, else creating it), pushed by {@link pusher}. */
    const push = async (
      tip: string,
      extra: Readonly<Record<string, string>> = {},
      ref = 'refs/heads/main',
    ): Promise<{ code: number | undefined; stderr: string }> =>
      new Promise((resolve) => {
        const child = spawn('sh', [authorshipHookPath], {
          cwd: fixture,
          env: {
            ...environment,
            /* eslint-disable @typescript-eslint/naming-convention -- process environment names */
            TAU_GIT_PUSH_ADMITTED: '1',
            TAU_GIT_PUSHER: pusher,
            TAU_GIT_NODE: process.execPath,
            /* eslint-enable @typescript-eslint/naming-convention -- end of the process environment map */
            ...extra,
          } as unknown as NodeJS.ProcessEnv,
        });
        const stderr: Array<Uint8Array<ArrayBuffer>> = [];
        child.stderr.on('data', (chunk: Uint8Array<ArrayBuffer>) => stderr.push(chunk));
        child.stdin.end(`${ref === 'refs/heads/main' ? base : none} ${tip} ${ref}\n`);
        child.on('close', (code) => {
          resolve({ code: code ?? undefined, stderr: Buffer.concat(stderr).toString('utf8') });
        });
      });
    return { git, commit, push, base, dispose: async () => rm(fixture, { recursive: true, force: true }) };
  };

  it("passes the pusher's own revision, and an agent's on the pusher's behalf", async () => {
    const repository = await authorshipRepository();
    onTestFinished(repository.dispose);
    const own = await repository.commit(
      noreply(pusher),
      recorded({ actorId: pusher, actor: { kind: 'user', id: pusher, name: 'Pusher' }, trigger: 'save' }),
    );
    const agent = await repository.commit(
      noreply(pusher),
      recorded({
        source: 'agent',
        actorId: 'agent',
        runId: 'run_1',
        actor: { kind: 'agent', id: 'agent', runId: 'run_1', onBehalfOf: { kind: 'user', id: pusher } },
        trigger: 'turn',
      }),
      own,
    );
    const outcome = await repository.push(agent);
    expect(outcome.code, outcome.stderr).toBe(0);
  });

  it('refuses B pushing a revision recorded as A, and never repeats what A recorded', async () => {
    const repository = await authorshipRepository();
    onTestFinished(repository.dispose);
    const forged = await repository.commit(
      noreply(other),
      recorded({ actorId: other, actor: { kind: 'user', id: other, name: 'Other Person' } }),
    );
    const outcome = await repository.push(forged);
    expect(outcome.code).toBe(1);
    expect(outcome.stderr).toContain(
      `Tau: refused commit ${forged.slice(0, 12)} — ${authorshipRefusals.GIT_PUSH_ACTOR_NOT_PUSHER}`,
    );
    expect(outcome.stderr).toContain('nothing was written');
    expect(outcome.stderr).not.toContain(other);
    expect(outcome.stderr).not.toContain('Other Person');
  });

  it.each<{ label: string; email: string; provenance: Readonly<Record<string, unknown>> }>([
    {
      label: 'an agent acting for A',
      email: noreply(other),
      provenance: { actorId: 'agent', actor: { kind: 'agent', id: 'agent', onBehalfOf: { kind: 'user', id: other } } },
    },
    {
      label: 'an agent acting for nobody',
      email: noreply('agent'),
      provenance: { actorId: 'agent', actor: { kind: 'agent', id: 'agent' } },
    },
    {
      label: 'a record naming the pusher under the address of A',
      email: noreply(other),
      provenance: { actorId: pusher, actor: { kind: 'user', id: pusher } },
    },
    { label: 'an older record with only a host id', email: noreply('tau-host'), provenance: { actorId: 'tau-host' } },
    {
      label: 'a machine login name',
      email: noreply('root'),
      provenance: { actorId: 'root', actor: { kind: 'user', id: 'root' } },
    },
  ])('refuses $label as not naming the pusher', async ({ email, provenance }) => {
    const repository = await authorshipRepository();
    onTestFinished(repository.dispose);
    const outcome = await repository.push(await repository.commit(email, recorded(provenance)));
    expect(outcome.code).toBe(1);
    expect(outcome.stderr).toContain(authorshipRefusals.GIT_PUSH_ACTOR_NOT_PUSHER);
  });

  it('passes an older record whose bare actor id is the pusher, and an anonymous revision', async () => {
    const repository = await authorshipRepository();
    onTestFinished(repository.dispose);
    const legacy = await repository.commit(noreply(pusher), recorded({ actorId: pusher }));
    const anonymous = await repository.commit(
      noreply('anon:3fa9c1d2'),
      recorded({ actorId: 'anon:3fa9c1d2', actor: { kind: 'user', id: 'anon:3fa9c1d2', anonymous: true } }),
      legacy,
    );
    const outcome = await repository.push(anonymous);
    expect(outcome.code, outcome.stderr).toBe(0);
  });

  it('refuses a Tau-written revision carrying an environment email with its own reason (Q11)', async () => {
    const repository = await authorshipRepository();
    onTestFinished(repository.dispose);
    const leaked = await repository.commit(
      'person@example.com',
      recorded({ actorId: pusher, actor: { kind: 'user', id: pusher, email: 'person@example.com' } }),
    );
    const outcome = await repository.push(leaked);
    expect(outcome.code).toBe(1);
    expect(outcome.stderr).toContain(authorshipRefusals.GIT_PUSH_AUTHOR_ADDRESS);
    expect(outcome.stderr).not.toContain(authorshipRefusals.GIT_PUSH_ACTOR_NOT_PUSHER);
    expect(outcome.stderr).not.toContain('person@example.com');
  });

  it('passes a commit Tau did not record only on a project linked to GitHub', async () => {
    const repository = await authorshipRepository();
    onTestFinished(repository.dispose);
    const outside = await repository.commit('someone@example.com', 'Edited on GitHub\n');
    const unlinked = await repository.push(outside);
    expect(unlinked.code).toBe(1);
    expect(unlinked.stderr).toContain(authorshipRefusals.GIT_PUSH_NOT_RECORDED_BY_TAU);
    expect(unlinked.stderr).not.toContain('someone@example.com');
    // eslint-disable-next-line @typescript-eslint/naming-convention -- process environment names
    const linked = await repository.push(outside, { TAU_GIT_FORGE: 'github' });
    expect(linked.code, linked.stderr).toBe(0);
  });

  it("takes GitHub's no-reply address for the pusher's revision on a linked project only", async () => {
    const repository = await authorshipRepository();
    onTestFinished(repository.dispose);
    const revision = await repository.commit(
      '583231+octocat@users.noreply.github.com',
      recorded({ actorId: pusher, actor: { kind: 'user', id: pusher } }),
    );
    // eslint-disable-next-line @typescript-eslint/naming-convention -- process environment names
    const linked = await repository.push(revision, { TAU_GIT_FORGE: 'github' });
    expect(linked.code, linked.stderr).toBe(0);
    const unlinked = await repository.push(revision);
    expect(unlinked.code).toBe(1);
    expect(unlinked.stderr).toContain(authorshipRefusals.GIT_PUSH_AUTHOR_ADDRESS);
  });

  it('refuses a Tau record that does not parse or names no one', async () => {
    const repository = await authorshipRepository();
    onTestFinished(repository.dispose);
    for (const message of ['Saved\n\nTau-Metadata: {not json\n', 'Saved\n\nTau-Metadata: {"version":1}\n']) {
      // oxlint-disable-next-line no-await-in-loop -- one hook run per record, by design
      const outcome = await repository.push(await repository.commit(noreply(pusher), message));
      expect(outcome.code, message).toBe(1);
      expect(outcome.stderr).toContain(authorshipRefusals.GIT_PUSH_RECORD_UNREADABLE);
    }
  });

  it('reads the last Tau-Metadata line, as the client does', async () => {
    const repository = await authorshipRepository();
    onTestFinished(repository.dispose);
    const own = recorded({ actorId: pusher, actor: { kind: 'user', id: pusher } });
    const forged = recorded({ actorId: other, actor: { kind: 'user', id: other } });
    /* The forged record last: the client reads that one, so the hook must too. */
    const outcome = await repository.push(
      await repository.commit(noreply(pusher), `${own}${forged.split('\n').slice(2).join('\n')}`),
    );
    expect(outcome.code).toBe(1);
    expect(outcome.stderr).toContain(authorshipRefusals.GIT_PUSH_ACTOR_NOT_PUSHER);
  });

  it('checks what the history does not reach yet, including a commit a record ref carried first', async () => {
    const repository = await authorshipRepository();
    onTestFinished(repository.dispose);
    const forged = await repository.commit(noreply(other), recorded({ actorId: other }));
    /* Record refs are not history: an artifact ref is not checked… */
    const record = await repository.push(forged, {}, 'refs/tau/artifacts/a1');
    expect(record.code, record.stderr).toBe(0);
    repository.git('update-ref', 'refs/tau/artifacts/a1', forged);
    /* …but a branch that takes the commit in is, though the server already holds it. */
    const branch = await repository.push(forged);
    expect(branch.code).toBe(1);
    expect(branch.stderr).toContain(authorshipRefusals.GIT_PUSH_ACTOR_NOT_PUSHER);
    /* Once another branch holds it, it is no longer new to the history. */
    repository.git('update-ref', 'refs/heads/elsewhere', forged);
    const held = await repository.push(forged);
    expect(held.code, held.stderr).toBe(0);
  });

  it('fails closed when it cannot run the check, and checks nothing without a pusher', async () => {
    const repository = await authorshipRepository();
    onTestFinished(repository.dispose);
    const outside = await repository.commit('someone@example.com', 'Edited elsewhere\n');
    // eslint-disable-next-line @typescript-eslint/naming-convention -- process environment names
    const noNode = await repository.push(outside, { TAU_GIT_NODE: '' });
    expect(noNode.code).toBe(1);
    expect(noNode.stderr).toContain(authorshipRefusals.GIT_PUSH_RECORD_UNREADABLE);
    // eslint-disable-next-line @typescript-eslint/naming-convention -- process environment names
    const brokenNode = await repository.push(outside, { TAU_GIT_NODE: '/bin/false', TAU_GIT_FORGE: 'github' });
    expect(brokenNode.code).toBe(1);
    // eslint-disable-next-line @typescript-eslint/naming-convention -- process environment names
    const maintenance = await repository.push(outside, { TAU_GIT_PUSHER: '' });
    expect(maintenance.code, maintenance.stderr).toBe(0);
  });

  it('names at most ten refused commits and counts the rest', async () => {
    const repository = await authorshipRepository();
    onTestFinished(repository.dispose);
    let tip = repository.base;
    for (let index = 0; index < 12; index += 1) {
      // oxlint-disable-next-line no-await-in-loop -- a chain, each commit on the last
      tip = await repository.commit('someone@example.com', `Outside ${String(index)}\n`, tip);
    }
    const outcome = await repository.push(tip);
    expect(outcome.code).toBe(1);
    expect(outcome.stderr.match(/Tau: refused commit /gu)).toHaveLength(10);
    expect(outcome.stderr).toContain('and 2 more commits');
  });
});

describe('pre-receive version-number check (B6)', () => {
  const pusher = 'user_b6_pusher';

  let versionHookDirectory: string;
  let versionHookPath: string;

  beforeAll(async () => {
    versionHookDirectory = await mkdtemp(path.join(tmpdir(), 'tau-git-version-hook-'));
    versionHookPath = path.join(versionHookDirectory, 'pre-receive');
    await writeFile(versionHookPath, preReceiveHookScript, 'utf8');
    await chmod(versionHookPath, 0o755);
  });

  afterAll(async () => {
    await rm(versionHookDirectory, { recursive: true, force: true });
  });

  /** A repository with one commit, and a writer of version tags on it. */
  const versionRepository = async () => {
    const fixture = await mkdtemp(path.join(tmpdir(), 'tau-git-version-repo-'));
    /* eslint-disable @typescript-eslint/naming-convention -- process environment names */
    const environment: Record<string, string> = {
      PATH: process.env['PATH'] ?? '/usr/bin:/bin',
      HOME: fixture,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_SYSTEM: '/dev/null',
      GIT_AUTHOR_NAME: 'Base',
      GIT_AUTHOR_EMAIL: 'base@tau.test',
      GIT_COMMITTER_NAME: 'Base',
      GIT_COMMITTER_EMAIL: 'base@tau.test',
    };
    /* eslint-enable @typescript-eslint/naming-convention -- end of the process environment map */
    const git = (...args: readonly string[]): string =>
      execFileSync(realGit, [...args], {
        cwd: fixture,
        env: environment as NodeJS.ProcessEnv,
        encoding: 'utf8',
      }).trim();
    git('init', '--quiet', '--initial-branch=main', '.');
    git('commit', '--quiet', '--allow-empty', '-m', 'base');
    const base = git('rev-parse', 'HEAD');
    /** One annotated version tag on the base commit, recording `record` as its `Tau-Tag` trailer. */
    const tag = async (name: string, record: Readonly<Record<string, unknown>> | undefined): Promise<string> => {
      const file = path.join(fixture, '.git', `tag-${String(Math.random()).slice(2)}`);
      await writeFile(
        file,
        [
          `object ${base}`,
          'type commit',
          `tag ${name}`,
          `tagger Someone <${pusher}@users.noreply.tau.new> 1790000000 +0000`,
          '',
          name,
          ...(record === undefined ? [] : ['', `Tau-Tag: ${JSON.stringify({ version: 1, ...record })}`]),
          '',
        ].join('\n'),
        'utf8',
      );
      return git('hash-object', '-t', 'tag', '-w', file);
    };
    /** One hook run over `<old> <new> <ref>` lines, pushed by {@link pusher}. */
    const push = async (
      lines: readonly string[],
      extra: Readonly<Record<string, string>> = {},
    ): Promise<{ code: number | undefined; stderr: string }> =>
      new Promise((resolve) => {
        const child = spawn('sh', [versionHookPath], {
          cwd: fixture,
          env: {
            ...environment,
            /* eslint-disable @typescript-eslint/naming-convention -- process environment names */
            TAU_GIT_PUSH_ADMITTED: '1',
            TAU_GIT_PUSHER: pusher,
            TAU_GIT_NODE: process.execPath,
            /* eslint-enable @typescript-eslint/naming-convention -- end of the process environment map */
            ...extra,
          } as unknown as NodeJS.ProcessEnv,
        });
        const stderr: Array<Uint8Array<ArrayBuffer>> = [];
        child.stderr.on('data', (chunk: Uint8Array<ArrayBuffer>) => stderr.push(chunk));
        child.stdin.end(lines.map((line) => `${line}\n`).join(''));
        child.on('close', (code) => {
          resolve({ code: code ?? undefined, stderr: Buffer.concat(stderr).toString('utf8') });
        });
      });
    return { git, tag, push, dispose: async () => rm(fixture, { recursive: true, force: true }) };
  };

  it('refuses a version whose number another version holds, behind the marker the client matches', async () => {
    const repository = await versionRepository();
    onTestFinished(repository.dispose);
    repository.git('update-ref', 'refs/tags/Hinge', await repository.tag('Hinge', { number: 4 }));
    const outcome = await repository.push([`${none} ${await repository.tag('Lid', { number: 4 })} refs/tags/Lid`]);
    expect(outcome.code).toBe(1);
    expect(outcome.stderr).toContain(`${versionNumberTakenMarker} — refs/tags/Lid names V4`);
    expect(outcome.stderr).toContain(versionNumberRefusals.GIT_PUSH_VERSION_NUMBER_TAKEN);
    expect(outcome.stderr).toContain('Tau: nothing was written.');
  });

  it('refuses V1, which the Start entry holds, and two new versions with one number in one push', async () => {
    const repository = await versionRepository();
    onTestFinished(repository.dispose);
    const start = await repository.push([`${none} ${await repository.tag('First', { number: 1 })} refs/tags/First`]);
    expect(start.code).toBe(1);
    expect(start.stderr).toContain('names V1');
    const twice = await repository.push([
      `${none} ${await repository.tag('A', { number: 5 })} refs/tags/A`,
      `${none} ${await repository.tag('B', { number: 5 })} refs/tags/B`,
    ]);
    expect(twice.code).toBe(1);
    expect(twice.stderr.match(/version number taken/gu)).toHaveLength(2);
  });

  it('passes a free number, a tag written before numbers, and a tag Tau did not write', async () => {
    const repository = await versionRepository();
    onTestFinished(repository.dispose);
    repository.git('update-ref', 'refs/tags/Hinge', await repository.tag('Hinge', { number: 4 }));
    const outcome = await repository.push([
      `${none} ${await repository.tag('Lid', { number: 5, note: 'Lid fit' })} refs/tags/Lid`,
      `${none} ${await repository.tag('Older', { note: 'Before numbers' })} refs/tags/Older`,
      `${none} ${await repository.tag('v1.0.0', undefined)} refs/tags/v1.0.0`,
    ]);
    expect(outcome.code, outcome.stderr).toBe(0);
  });

  it('keeps a backed-up number: a moved version keeps it, and changing or dropping it is refused', async () => {
    const repository = await versionRepository();
    onTestFinished(repository.dispose);
    const held = await repository.tag('Hinge', { number: 4 });
    repository.git('update-ref', 'refs/tags/Hinge', held);
    const moved = await repository.tag('Hinge', { number: 4, note: 'Moved' });
    const kept = await repository.push([`${held} ${moved} refs/tags/Hinge`]);
    expect(kept.code, kept.stderr).toBe(0);
    for (const record of [{ number: 6 }, {}]) {
      // oxlint-disable-next-line no-await-in-loop -- two hook runs, each read alone.
      const changed = await repository.push([`${held} ${await repository.tag('Hinge', record)} refs/tags/Hinge`]);
      expect(changed.code).toBe(1);
      expect(changed.stderr).toContain(versionNumberRefusals.GIT_PUSH_VERSION_NUMBER_CHANGED);
    }
  });

  it('refuses a number it cannot read, and fails closed without a Node to read it with', async () => {
    const repository = await versionRepository();
    onTestFinished(repository.dispose);
    const odd = await repository.tag('Odd', { number: 2.5 });
    const unreadable = await repository.push([`${none} ${odd} refs/tags/Odd`]);
    expect(unreadable.code).toBe(1);
    expect(unreadable.stderr).toContain(authorshipRefusals.GIT_PUSH_RECORD_UNREADABLE);
    const lid = await repository.tag('Lid', { number: 5 });
    // eslint-disable-next-line @typescript-eslint/naming-convention -- process environment name
    const noNode = await repository.push([`${none} ${lid} refs/tags/Lid`], { TAU_GIT_NODE: '' });
    expect(noNode.code).toBe(1);
    expect(noNode.stderr).toContain(authorshipRefusals.GIT_PUSH_RECORD_UNREADABLE);
  });

  it('spells the taken-number marker the way packages/revisions matches it', () => {
    expect(versionNumberTakenMarker).toBe('Tau: version number taken');
  });
});
