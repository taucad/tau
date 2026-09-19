/* oxlint-disable no-await-in-loop -- A sustained rate is a sequence of pushes by definition. */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { localDatabaseName } from '@taucad/utils/worktree-database';
import { gitE2EApiUrl, gitE2ESecondaryApiUrl } from '#git/config.js';
import {
  basicAuthorization,
  deleteTauCloudOwner,
  gitE2EProjectId,
  queryDatabase,
  registerProject,
  runGit,
  seedProPlan,
  seedTauCloudOwner,
} from '#git/tau-cloud-fixture.js';
import type { TauCloudOwner } from '#git/tau-cloud-fixture.js';

/**
 * Charter W10 item 5 and success criterion S9: a sustained push rate across
 * two workers on one machine, with the Postgres authorization load that rate
 * produces, and R1's read-time derivation cost measured beside it.
 *
 * **This is a correctness and headroom check, not a capacity number.** The
 * charter says so (S9), and this machine is a developer laptop running the
 * two API processes, PostgreSQL, MinIO and the `git` children all at once.
 *
 * **Where the rate comes from.** W0a measured the push path as three store
 * round trips plus a flat ~100 ms of `receive-pack`: 121–305 ms end to end at
 * zero injected latency, which is what MinIO on loopback is. Rule 9 debounces
 * every minted revision by two seconds, so one actively edited project offers
 * at most one push every two seconds; the default 4 pushes/second is therefore
 * eight projects being edited continuously, and it is roughly a third of what
 * two workers at W0a's per-push cost could absorb. Rule 20's binding budget is
 * "mint → push request issued" at 2.1 s — the debounce plus 100 ms — so the
 * server's share of it is the push latency measured here.
 *
 * Kept off CI by `TAU_E2E_GIT_LOCAL`; the charter files S9 under "local,
 * recorded".
 */

const local = process.env['TAU_E2E_GIT_LOCAL'] === 'true';

const pushesPerSecond = Number(process.env['TAU_E2E_GIT_RATE'] ?? '4');
const durationSeconds = Number(process.env['TAU_E2E_GIT_SECONDS'] ?? '45');
/** Distinct repositories in the rotation, so no two pushes in flight share a manifest key. */
const projectCount = Number(process.env['TAU_E2E_GIT_PROJECTS'] ?? '8');
/**
 * Pushes allowed in flight at once.
 *
 * A single-threaded driver cannot offer four pushes a second when one push
 * takes 600 ms — it offers 1.6, and the number measures the driver. Four in
 * flight is the same eight-project picture from the other side: each project
 * is one client, and clients do not wait for each other.
 */
const concurrency = Number(process.env['TAU_E2E_GIT_CONCURRENCY'] ?? '4');

const scratchPaths: string[] = [];
const owners: TauCloudOwner[] = [];

const percentile = (values: readonly number[], fraction: number): number => {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
  return sorted[index] ?? 0;
};

const expectGit = async (args: readonly string[], cwd: string): Promise<string> => {
  const outcome = await runGit(args, cwd);
  expect(outcome.code, `git ${args.join(' ')}: ${outcome.stderr}`).toBe(0);
  return outcome.stdout;
};

const remoteUrl = (base: string, projectId: string): string => `${base}/v1/git/${projectId}.git`;

type Lane = { readonly projectId: string; readonly tree: string; revision: number };

const seedLane = async (owner: TauCloudOwner, index: number): Promise<Lane> => {
  const projectId = gitE2EProjectId();
  await registerProject(owner, projectId);
  const tree = await mkdtemp(join(tmpdir(), `tau-git-rate-${index.toString()}-`));
  scratchPaths.push(tree);
  await expectGit(['init', '-q', '--initial-branch=main', '.'], tree);
  await expectGit(['config', 'user.email', 'w10@example.test'], tree);
  await expectGit(['config', 'user.name', 'W10 Sustained Rate'], tree);
  /* Deliberately not `cube([1, 1, 1])`: the first measured push writes that,
   * and an identical tree makes `git commit` exit 1 with nothing to say. */
  await writeFile(join(tree, 'model.scad'), 'cube([0, 0, 0]);\n', 'utf8');
  await expectGit(['add', '.'], tree);
  await expectGit(['commit', '-q', '-m', 'seed'], tree);
  return { projectId, tree, revision: 0 };
};

/** One chat-turn-sized push: a few bytes changed, one commit, one pack. */
const pushOnce = async (
  lane: Lane,
  base: string,
  token: string,
): Promise<{ readonly milliseconds: number; readonly ok: boolean; readonly stderr: string }> => {
  lane.revision += 1;
  await writeFile(join(lane.tree, 'model.scad'), `cube([1, 1, ${lane.revision.toString()}]);\n`, 'utf8');
  await expectGit(['add', '.'], lane.tree);
  await expectGit(['commit', '-q', '-m', `revision ${lane.revision.toString()}`], lane.tree);
  const started = Date.now();
  const outcome = await runGit(
    [
      '-c',
      `http.extraHeader=Authorization: ${basicAuthorization(token)}`,
      'push',
      '-q',
      remoteUrl(base, lane.projectId),
      'HEAD:refs/heads/main',
    ],
    lane.tree,
  );
  return { milliseconds: Date.now() - started, ok: outcome.code === 0, stderr: outcome.stderr };
};

const transactionCount = async (): Promise<number> =>
  Number(await queryDatabase(`SELECT xact_commit FROM pg_stat_database WHERE datname = '${localDatabaseName()}';`));

describe.skipIf(!local)('a sustained push rate across two workers (W10 item 5, S9)', () => {
  let owner: TauCloudOwner;
  let lanes: Lane[];

  beforeAll(async () => {
    owner = await seedTauCloudOwner('rate-owner');
    owners.push(owner);
    await seedProPlan(owner);
    lanes = [];
    for (let index = 0; index < projectCount; index += 1) {
      lanes.push(await seedLane(owner, index));
    }
    /* One warm push per lane and per worker, so the measured window is not
     * measuring a cold hydrate it was not asked about (W0a owns that figure). */
    for (const lane of lanes) {
      for (const base of [gitE2EApiUrl, gitE2ESecondaryApiUrl]) {
        const warm = await pushOnce(lane, base, owner.token);
        expect(warm.ok, `warm-up push: ${warm.stderr}`).toBe(true);
      }
    }
  }, 900_000);

  afterAll(async () => {
    for (const account of owners) {
      await deleteTauCloudOwner(account);
    }
    for (const directory of scratchPaths) {
      await rm(directory, { recursive: true, force: true });
    }
  }, 300_000);

  it('holds the push latency and records the authorization load it produces', async () => {
    const pushInterval = 1000 / pushesPerSecond;
    const target = Math.round(pushesPerSecond * durationSeconds);
    const latencies: number[] = [];
    const failures: string[] = [];

    const transactionsBefore = await transactionCount();
    const started = Date.now();
    /* Each lane is its own client: it pushes on its own schedule and never
     * waits for another lane, which is what a *rate* means. `concurrency`
     * lanes run at once, each taking the next slot in the global schedule, so
     * the offered rate is the schedule's and not one driver's round trip. */
    let next = 0;
    const driver = async (laneIndex: number): Promise<void> => {
      /* The lane is the driver's own for the whole run: two drivers committing
       * in one working tree would be a git bug, not a server measurement. */
      const lane = lanes[laneIndex];
      for (;;) {
        const index = next;
        next += 1;
        if (index >= target || lane === undefined) {
          return;
        }
        const base = index % 2 === 0 ? gitE2EApiUrl : gitE2ESecondaryApiUrl;
        const wait = started + index * pushInterval - Date.now();
        if (wait > 0) {
          await new Promise<void>((resolve) => {
            setTimeout(resolve, wait);
          });
        }
        const outcome = await pushOnce(lane, base, owner.token);
        latencies.push(outcome.milliseconds);
        if (!outcome.ok) {
          failures.push(outcome.stderr.slice(0, 200));
        }
      }
    };
    /* One lane per driver at most: two pushes racing the same manifest key is
     * D4's lost race, which `fault-injection.spec.ts` owns and which would
     * make this a race test rather than a rate test. */
    await Promise.all(Array.from({ length: Math.min(concurrency, lanes.length) }, async (_, index) => driver(index)));
    const wallSeconds = (Date.now() - started) / 1000;
    const transactionsAfter = await transactionCount();

    const report = {
      pushes: latencies.length,
      failures: failures.length,
      requestedRate: pushesPerSecond,
      concurrency,
      achievedRate: Number((latencies.length / wallSeconds).toFixed(2)),
      wallSeconds: Number(wallSeconds.toFixed(1)),
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
      max: Math.max(...latencies),
      postgresTransactions: transactionsAfter - transactionsBefore,
      postgresTransactionsPerSecond: Number(((transactionsAfter - transactionsBefore) / wallSeconds).toFixed(1)),
    };
    // oxlint-disable-next-line no-console -- the numbers are this case's whole product.
    console.log(`S9 sustained rate: ${JSON.stringify(report)}`);
    if (failures.length > 0) {
      // oxlint-disable-next-line no-console -- a refusal's own sentence is evidence.
      console.log(`S9 failures: ${JSON.stringify(failures.slice(0, 5))}`);
    }

    expect(failures, 'no push in a sustained run may be refused').toEqual([]);
    /* Rule 20 budgets "mint → push request issued" at 2.1 s. The server's share
     * of that is this latency; a p95 at or beyond the whole budget would mean
     * the server alone has spent it. */
    expect(report.p95).toBeLessThan(2100);
  });

  it('measures what a second worker pays to re-derive after the first one pushed (R1)', async () => {
    const lane = lanes[0];
    expect(lane).toBeDefined();
    if (lane === undefined) {
      return;
    }

    /* Push through one worker, then advertise through the other. The second
     * worker's `project_git.derived_generation` is behind, so this read is the
     * one that re-derives (D19), and W4's review R1 asked for its cost. */
    const pushed = await pushOnce(lane, gitE2EApiUrl, owner.token);
    expect(pushed.ok, pushed.stderr).toBe(true);

    const advertise = async (base: string): Promise<number> => {
      const started = Date.now();
      const outcome = await runGit(
        [
          '-c',
          `http.extraHeader=Authorization: ${basicAuthorization(owner.token)}`,
          'ls-remote',
          remoteUrl(base, lane.projectId),
        ],
        lane.tree,
      );
      expect(outcome.code, outcome.stderr).toBe(0);
      return Date.now() - started;
    };

    const stale = await advertise(gitE2ESecondaryApiUrl);
    const warm = await advertise(gitE2ESecondaryApiUrl);
    const sameWorker = await advertise(gitE2EApiUrl);

    // oxlint-disable-next-line no-console -- the numbers are this case's whole product.
    console.log(
      `R1 read-time derivation (milliseconds): ${JSON.stringify({ staleAdvertise: stale, warmAdvertise: warm, pusherAdvertise: sameWorker })}`,
    );
    /* Rule 9 gives an open three seconds before the first tree render, and an
     * advertisement is the first thing in it. */
    expect(stale).toBeLessThan(3000);
  });
});
