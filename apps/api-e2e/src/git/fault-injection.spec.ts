/* eslint-disable @typescript-eslint/naming-convention -- Process environment names keep their wire spelling. */
/* oxlint-disable no-await-in-loop -- Every loop here drives one `git` child, or one fault, after another on purpose. */
import type { ChildProcess } from 'node:child_process';
import type { Dirent, WriteStream } from 'node:fs';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startApi } from '#git/api-process.js';
import { gitE2EApiUrl, gitE2EFrontendUrl } from '#git/config.js';
import { startFaultProxy } from '#git/fault-proxy.js';
import type { FaultProxy } from '#git/fault-proxy.js';
import {
  basicAuthorization,
  deleteTauCloudOwner,
  gitE2EProjectId,
  registerProject,
  runGit,
  seedProPlan,
  seedTauCloudOwner,
} from '#git/tau-cloud-fixture.js';
import type { TauCloudOwner } from '#git/tau-cloud-fixture.js';

/**
 * Charter W10, items 4 and 6: fault injection and chaos, in real processes.
 *
 * `apps/api/app/api/git/store/commit.integration.test.ts` already crashes the
 * committer at each of `fault-points.ts`'s five points **inside one process**,
 * with the callback the commit protocol awaits. This suite is the other half:
 * the worker is a real operating-system process, the fault is on the wire
 * between it and the store, and the recovery is performed by a *different*
 * process that never shared its memory or its disk.
 *
 * Kept off CI's `test:git` by `TAU_E2E_GIT_LOCAL`: the charter files S1's
 * chaos and the fault matrix under "local, recorded", and each case here kills
 * and reboots an API process (about 4 s), which is not what the git tier should
 * spend on every pull request.
 *
 * Run it with:
 * `TAU_E2E_GIT_LOCAL=true pnpm nx run api-e2e:test:git`
 */

const local = process.env['TAU_E2E_GIT_LOCAL'] === 'true';

/** The proxied API this suite owns, kills and reboots. `:4018` is free in both e2e tiers. */
const victimUrl = 'http://localhost:4018';
const proxyPort = 9100;
const minioOrigin = process.env['TAU_S3_ENDPOINT'] ?? 'http://localhost:9000';

const leaseRoot = join(tmpdir(), 'tau-git-leases');

/**
 * Lease directories present now, so a case can prove it left none behind.
 *
 * Leases live under `tau-git-leases/<pid>/` (W10 defect 2's fix), so the census
 * is one level deeper than the worker directories: a *running* worker's own
 * parent is not a leak, and an empty one is nothing at all. Anything that is
 * not a pid directory is counted as itself — that is the pre-fix layout, whose
 * leftovers are exactly what this census was written to see.
 */
const leaseDirectories = async (): Promise<readonly string[]> => {
  let workers: Dirent[];
  try {
    workers = await readdir(leaseRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  const found = await Promise.all(
    workers.map(async (worker): Promise<readonly string[]> => {
      if (!worker.isDirectory() || !/^\d+$/u.test(worker.name)) {
        return [worker.name];
      }
      try {
        const leases = await readdir(join(leaseRoot, worker.name));
        return leases.map((lease) => `${worker.name}/${lease}`);
      } catch {
        /* The worker cleaned up between the two reads. */
        return [];
      }
    }),
  );
  return found.flat();
};

const scratchPaths: string[] = [];
const owners: TauCloudOwner[] = [];

const scratch = async (label: string): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), `tau-git-fault-${label}-`));
  scratchPaths.push(directory);
  return directory;
};

const expectGit = async (args: readonly string[], cwd: string): Promise<string> => {
  const outcome = await runGit(args, cwd);
  expect(outcome.code, `git ${args.join(' ')}: ${outcome.stderr}`).toBe(0);
  return outcome.stdout;
};

const remoteUrl = (base: string, projectId: string): string => `${base}/v1/git/${projectId}.git`;

/** A tree with one commit on `main`, ready to push. */
const seedTree = async (label: string, content: string): Promise<string> => {
  const tree = await scratch(label);
  await expectGit(['init', '-q', '--initial-branch=main', '.'], tree);
  await expectGit(['config', 'user.email', 'w10@example.test'], tree);
  await expectGit(['config', 'user.name', 'W10 Fault Injection'], tree);
  await writeFile(join(tree, 'model.scad'), content, 'utf8');
  await expectGit(['add', '.'], tree);
  await expectGit(['commit', '-m', 'first revision'], tree);
  return tree;
};

/** One more commit on an existing tree. */
const addCommit = async (tree: string, content: string): Promise<string> => {
  await writeFile(join(tree, 'model.scad'), content, 'utf8');
  await expectGit(['add', '.'], tree);
  await expectGit(['commit', '-m', `revision ${content.length.toString()}`], tree);
  const revision = await expectGit(['rev-parse', 'HEAD'], tree);
  return revision.trim();
};

const push = async (
  target: Readonly<{ base: string; projectId: string; token: string }>,
  tree: string,
  refspec = 'HEAD:refs/heads/main',
): Promise<{ readonly code: number; readonly stdout: string; readonly stderr: string }> =>
  runGit(
    [
      '-c',
      `http.extraHeader=Authorization: ${basicAuthorization(target.token)}`,
      'push',
      remoteUrl(target.base, target.projectId),
      refspec,
    ],
    tree,
  );

/** The refs the Hosted Remote advertises, read through a process that is up. */
const advertisedReferences = async (
  target: Readonly<{ base: string; projectId: string; token: string }>,
  cwd: string,
): Promise<string> => {
  const outcome = await runGit(
    [
      '-c',
      `http.extraHeader=Authorization: ${basicAuthorization(target.token)}`,
      'ls-remote',
      remoteUrl(target.base, target.projectId),
    ],
    cwd,
  );
  return outcome.code === 0 ? outcome.stdout : '';
};

/** A fresh clone through the survivor, `fsck --strict` clean or not. */
const cloneAndFsck = async (
  target: Readonly<{ base: string; projectId: string; token: string }>,
  label: string,
): Promise<{ readonly head: string; readonly fsck: { code: number; stderr: string }; readonly path: string }> => {
  const parent = await scratch(`clone-${label}`);
  await expectGit(
    [
      '-c',
      `http.extraHeader=Authorization: ${basicAuthorization(target.token)}`,
      'clone',
      '-q',
      remoteUrl(target.base, target.projectId),
      'clone',
    ],
    parent,
  );
  const clone = join(parent, 'clone');
  const headOutput = await expectGit(['rev-parse', 'HEAD'], clone);
  const head = headOutput.trim();
  const fsck = await runGit(['fsck', '--strict'], clone);
  return { head, fsck: { code: fsck.code, stderr: fsck.stderr }, path: clone };
};

const leakedLeases: string[] = [];
/** Which fault points the proxy actually managed to kill the worker at. */
const killedAt: string[] = [];

let proxy: FaultProxy;
let victim: { child: ChildProcess; log: WriteStream } | undefined;
let owner: TauCloudOwner;

/** Boot (or reboot) the proxied API this suite is allowed to kill. */
const bootVictim = async (label: string): Promise<void> => {
  victim = await startApi({
    url: victimUrl,
    label: `w10-${label}`,
    frontendUrl: gitE2EFrontendUrl,
    overrides: { TAU_S3_ENDPOINT: `http://localhost:${proxyPort.toString()}` },
  });
};

const killVictim = async (): Promise<void> => {
  if (victim !== undefined) {
    victim.child.kill('SIGKILL');
    victim.log.end();
    victim = undefined;
  }
};

describe.skipIf(!local)('object-store faults in a real worker (W10 item 4)', () => {
  beforeAll(async () => {
    proxy = await startFaultProxy(proxyPort, minioOrigin);
    owner = await seedTauCloudOwner('fault-owner');
    owners.push(owner);
    await seedProPlan(owner);
    await bootVictim('faults');
  }, 300_000);

  afterAll(async () => {
    await killVictim();
    await proxy.close();
    for (const account of owners) {
      await deleteTauCloudOwner(account);
    }
    for (const directory of scratchPaths) {
      await rm(directory, { recursive: true, force: true });
    }
  }, 300_000);

  it('answers 503 and leaves no ref when the conditional manifest write is refused with 412', async () => {
    const projectId = gitE2EProjectId();
    await registerProject(owner, projectId);
    const target = { base: victimUrl, projectId, token: owner.token };
    const tree = await seedTree('412', 'cube([1, 1, 1]);\n');
    const before = await leaseDirectories();

    proxy.arm([
      {
        method: 'PUT',
        keyIncludes: 'manifest.json',
        times: 1,
        action: {
          kind: 'status',
          status: 412,
          code: 'PreconditionFailed',
          message: 'At least one of the pre-conditions you specified did not hold',
        },
      },
    ]);
    const refused = await push(target, tree);

    expect(refused.code, 'a refused conditional write must not be acknowledged').not.toBe(0);
    expect(`${refused.stdout}${refused.stderr}`).toMatch(/503|unavailable/iu);
    expect(proxy.pending(), 'the 412 rule must have been consumed').toBe(0);

    /* I1: nothing acknowledged, so nothing may be advertised. Read through the
     * tier's own process, which shares only the store. */
    const references = await advertisedReferences({ base: gitE2EApiUrl, projectId, token: owner.token }, tree);
    expect(references, 'an unacknowledged push must leave no ref').not.toMatch(/refs\/heads\/main/u);

    /* The retry is the client's, and it is the same push. */
    const retried = await push(target, tree);
    expect(retried.code, retried.stderr).toBe(0);
    const after = await advertisedReferences({ base: gitE2EApiUrl, projectId, token: owner.token }, tree);
    expect(after).toMatch(/refs\/heads\/main/u);

    expect(await leaseDirectories(), 'no lease directory may be left behind').toEqual(before);
  });

  it('retries a 429 twice and succeeds, then answers 503 when the bound is exhausted', async () => {
    const projectId = gitE2EProjectId();
    await registerProject(owner, projectId);
    const target = { base: victimUrl, projectId, token: owner.token };
    const tree = await seedTree('429', 'cube([2, 2, 2]);\n');

    /* Three 429s exhaust the AWS SDK's own attempt budget for one
     * `commitManifest` call (standard retry mode, three attempts), so the
     * protocol sees one rate-limited failure, waits 200 ms and wins on its
     * second attempt. `retry-after: 5` is what R2 sends (W0b, D5). */
    proxy.arm([
      {
        method: 'PUT',
        keyIncludes: 'manifest.json',
        times: 3,
        action: {
          kind: 'status',
          status: 429,
          code: 'SlowDown',
          message: 'Reduce your concurrent request rate for the same object.',
          headers: { 'retry-after': '5' },
        },
      },
    ]);
    const started = Date.now();
    const survived = await push(target, tree);
    const elapsed = Date.now() - started;

    expect(survived.code, survived.stderr).toBe(0);
    expect(proxy.pending()).toBe(0);
    expect(elapsed, 'the SDK backoff plus the protocol 200 ms must be visible').toBeGreaterThanOrEqual(200);
    // oxlint-disable-next-line no-console -- the cost of a rate-limited manifest write is the number W10 owes.
    console.log(`429 retried and won after ${elapsed.toString()} ms with 3 refusals`);

    /* Nine exhaust the whole budget — three SDK attempts inside each of the
     * protocol's three `manifestWriteAttempts` — and an exhausted rate limit is
     * a lost race for the client's purposes, not a 500. */
    const head = await addCommit(tree, 'cube([3, 3, 3]);\n');
    proxy.arm([
      {
        method: 'PUT',
        keyIncludes: 'manifest.json',
        times: 9,
        action: {
          kind: 'status',
          status: 429,
          code: 'SlowDown',
          message: 'Reduce your concurrent request rate for the same object.',
          headers: { 'retry-after': '5' },
        },
      },
    ]);
    const exhaustedStarted = Date.now();
    const exhausted = await push(target, tree);
    const exhaustedElapsed = Date.now() - exhaustedStarted;
    // oxlint-disable-next-line no-console -- how long a wedged manifest key holds a push is the number W10 owes.
    console.log(
      `429 exhausted the retry budget after ${exhaustedElapsed.toString()} ms and ${(9 - proxy.pending()).toString()} refusals`,
    );
    expect(exhausted.code, 'an exhausted rate limit is refused, not acknowledged').not.toBe(0);
    expect(`${exhausted.stdout}${exhausted.stderr}`).toMatch(/503|unavailable/iu);

    const references = await advertisedReferences({ base: gitE2EApiUrl, projectId, token: owner.token }, tree);
    expect(references, 'the refused head must not be advertised').not.toContain(head);
  });

  it('refuses the push and leaves no lease when the store is unreachable mid-push', async () => {
    const projectId = gitE2EProjectId();
    await registerProject(owner, projectId);
    const target = { base: victimUrl, projectId, token: owner.token };
    const tree = await seedTree('outage', 'cube([4, 4, 4]);\n');
    const before = await leaseDirectories();

    /* Everything the store attempts is dropped on the socket: the outage a
     * stopped MinIO produces, without stopping the MinIO the other three
     * processes are using. */
    proxy.arm([
      { method: 'PUT', times: 40, action: { kind: 'drop' } },
      { method: 'GET', times: 40, action: { kind: 'drop' } },
      { method: 'HEAD', times: 40, action: { kind: 'drop' } },
    ]);
    const outage = await push(target, tree);
    expect(outage.code, 'a push through an unreachable store must not be acknowledged').not.toBe(0);

    proxy.arm([]);
    const references = await advertisedReferences({ base: gitE2EApiUrl, projectId, token: owner.token }, tree);
    expect(references).not.toMatch(/refs\/heads\/main/u);

    /* The store is back: the same push, retried, is the recovery. */
    const recovered = await push(target, tree);
    expect(recovered.code, recovered.stderr).toBe(0);
    expect(await leaseDirectories()).toEqual(before);
  });

  it('keeps admitting leases after every fault above', async () => {
    /* `#inFlightLeases` is process-private, so the observable is admission
     * itself: at 2.5 GiB reserved per in-flight lease (D33), a counter that
     * leaked once per fault in this file would refuse the next push long
     * before the disk did. */
    const projectId = gitE2EProjectId();
    await registerProject(owner, projectId);
    const target = { base: victimUrl, projectId, token: owner.token };
    const tree = await seedTree('admission', 'cube([5, 5, 5]);\n');
    for (let index = 0; index < 4; index += 1) {
      await addCommit(tree, `cube([5, 5, ${index.toString()}]);\n`);
      const outcome = await push(target, tree);
      expect(outcome.code, `push ${index.toString()}: ${outcome.stderr}`).toBe(0);
    }
  });
});

describe.skipIf(!local)('a worker killed at each store fault point (W10 item 6, S1)', () => {
  beforeAll(async () => {
    proxy = await startFaultProxy(proxyPort, minioOrigin);
    owner = await seedTauCloudOwner('chaos-owner');
    owners.push(owner);
    await seedProPlan(owner);
  }, 300_000);

  afterAll(async () => {
    await killVictim();
    await proxy.close();
    for (const account of owners) {
      await deleteTauCloudOwner(account);
    }
    for (const directory of scratchPaths) {
      await rm(directory, { recursive: true, force: true });
    }
  }, 300_000);

  /**
   * One chaos case: boot the victim, kill it on the wire at `point`, then let
   * the surviving process answer the next request.
   */
  const killAt = async (
    point: string,
    rules: Parameters<FaultProxy['arm']>[0],
    prepare?: (target: { base: string; projectId: string; token: string }, tree: string) => Promise<void>,
  ): Promise<void> => {
    const projectId = gitE2EProjectId();
    await registerProject(owner, projectId);
    const tree = await seedTree(point, `cube([${point.length.toString()}]);\n`);
    const victimTarget = { base: victimUrl, projectId, token: owner.token };
    const survivorTarget = { base: gitE2EApiUrl, projectId, token: owner.token };
    const leasesBefore = await leaseDirectories();

    await bootVictim(point);
    if (prepare !== undefined) {
      proxy.arm([]);
      await prepare(victimTarget, tree);
    }

    /* The last head the client was told about. Earlier heads are ancestors of
     * it, not refs, so the ref map is the wrong place to look for them. */
    const beforeFault = await runGit(['rev-parse', 'HEAD'], tree);
    const acknowledgedBefore = beforeFault.stdout.trim();
    proxy.onFault = killVictim;
    proxy.arm(rules);

    const head = await addCommit(tree, `cube([${point.length.toString()}, 2]);\n`);
    const killed = await push(victimTarget, tree);
    proxy.onFault = undefined;
    const reached = victim === undefined;
    if (reached) {
      killedAt.push(point);
    }
    // oxlint-disable-next-line no-console -- whether the fault fired is the case's first fact.
    console.log(`chaos ${point}: worker killed=${String(reached)}, push acknowledged=${String(killed.code === 0)}`);
    proxy.arm([]);
    await killVictim();

    /* I1, the only direction that matters: a push the client was told
     * succeeded must be there. A push it was never told about may be either. */
    if (killed.code === 0) {
      const references = await advertisedReferences(survivorTarget, tree);
      expect(references, `${point}: an acknowledged push must survive the worker`).toContain(head);
    }
    /* The next request through the survivor repairs whatever derived state the
     * dead worker left behind (D19) and must succeed on its own terms. */
    const repaired = await push(survivorTarget, tree);
    expect(repaired.code, `${point}: the surviving worker must accept the retry: ${repaired.stderr}`).toBe(0);

    const { head: clonedHead, fsck, path: clonePath } = await cloneAndFsck(survivorTarget, point);
    expect(clonedHead, `${point}: the clone must carry the retried head`).toBe(head);
    expect(fsck.code, `${point}: fsck --strict on a fresh clone: ${fsck.stderr}`).toBe(0);
    expect(fsck.stderr).not.toMatch(/missing|broken|dangling commit/iu);

    /* I1 the other way round: everything the client was acknowledged for
     * before the kill is still reachable from what the store serves now. */
    if (acknowledgedBefore !== '') {
      const ancestor = await runGit(['merge-base', '--is-ancestor', acknowledgedBefore, clonedHead], clonePath);
      expect(ancestor.code, `${point}: an acknowledged push must stay reachable: ${ancestor.stderr}`).toBe(0);
    }

    /* Recorded, not asserted here: a SIGKILLed worker cannot unlink its own
     * lease, and nothing else ever does (W10 defect 2). The pin below is the
     * charter's requirement; this collects the evidence for it. */
    const leasesAfter = await leaseDirectories();
    const leaked = leasesAfter.filter((entry) => !leasesBefore.includes(entry));
    leakedLeases.push(...leaked.map((entry) => `${point}: ${entry}`));
  };

  it('after-pack-upload: dies with its packs in the store and no manifest naming them', async () => {
    await killAt('after-pack-upload', [
      { method: 'PUT', keyExcludes: 'manifest.json', times: 1, action: { kind: 'kill-after' } },
    ]);
  });

  it('before-manifest-commit: dies with the conditional write about to go out', async () => {
    await killAt('before-manifest-commit', [
      { method: 'PUT', keyIncludes: 'manifest.json', times: 1, action: { kind: 'kill-before' } },
    ]);
  });

  it('after-manifest-commit: dies with the manifest durable and the client unacknowledged', async () => {
    await killAt('after-manifest-commit', [
      { method: 'PUT', keyIncludes: 'manifest.json', times: 1, action: { kind: 'kill-after' } },
    ]);
  });

  it('mid-compaction: dies while the pack bound is being restored', async () => {
    await killAt(
      'mid-compaction',
      [{ method: 'PUT', keyExcludes: 'manifest.json', times: 1, action: { kind: 'kill-after' } }],
      async (target, tree) => {
        /* One pack per push (D17), so the bound of eight is reached by pushing
         * eight times; the ninth is the compacting commit this case kills. */
        for (let index = 0; index < 8; index += 1) {
          await addCommit(tree, `cube([9, 9, ${index.toString()}]);\n`);
          const outcome = await push(target, tree);
          expect(outcome.code, `seed push ${index.toString()}: ${outcome.stderr}`).toBe(0);
        }
      },
    );
  });

  it('mid-sweep: dies after the commit, with some of its retired keys deleted', async () => {
    await killAt(
      'mid-sweep',
      [
        { method: 'DELETE', times: 1, action: { kind: 'kill-after' } },
        { method: 'POST', keyIncludes: 'delete', times: 1, action: { kind: 'kill-after' } },
      ],
      async (target, tree) => {
        for (let index = 0; index < 8; index += 1) {
          await addCommit(tree, `cube([7, 7, ${index.toString()}]);\n`);
          const outcome = await push(target, tree);
          expect(outcome.code, `seed push ${index.toString()}: ${outcome.stderr}`).toBe(0);
        }
      },
    );
  });
  /**
   * **Red pin on W10 defect 2.** `git.service.ts:167` builds every lease under
   * `os.tmpdir()/tau-git-leases` and `:659` reads that directory's free bytes
   * for admission, but nothing ever removes a lease a dead worker left: a
   * SIGKILLed process cannot unlink its own, and there is no boot sweep. On a
   * Fly Machine that restarts in place, every crash mid-push permanently
   * reduces that worker's admission headroom by up to D33's 2.5 GiB. Unpinning
   * this is `git.service.ts`'s owner, not W10's.
   */
  it('leaves no lease directory behind when a worker is killed', () => {
    expect(leakedLeases, 'every killed worker leaked its lease directory').toEqual([]);
  });

  /**
   * A fault that never fired is not a green case. Recorded rather than
   * asserted point by point, because which of the five are reachable from
   * outside the process is itself the finding: `mid-sweep` deletes nothing in
   * the local corpus, so only `commit.integration.test.ts`'s in-process
   * injector reaches it.
   */
  it('names the fault points this tier actually reached', () => {
    // oxlint-disable-next-line no-console -- the list is the case's product.
    console.log(`chaos points reached: ${JSON.stringify(killedAt)}`);
    expect(killedAt).toContain('after-pack-upload');
    expect(killedAt).toContain('before-manifest-commit');
    expect(killedAt).toContain('after-manifest-commit');
    expect(killedAt).toContain('mid-compaction');
  });
});
