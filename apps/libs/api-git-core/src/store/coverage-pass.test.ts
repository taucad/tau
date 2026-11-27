import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { commitBits, hasBit } from '#store/attestation.js';
import { coverageBudgetMilliseconds, coveragePass } from '#store/coverage-pass.js';
import type { CoverageResult } from '#store/coverage-pass.js';

/**
 * The commit phase's coverage pass (blueprint D3, R3-2) over a real repository: what a push first brought, each
 * commit's bits against the grant's inputs, the anonymity mark that replaces the old substring scan (Q3), and the
 * failed forms that admit instead of refusing.
 */

const scratch: string[] = [];

afterAll(() => {
  for (const directory of scratch) {
    rmSync(directory, { recursive: true, force: true });
  }
});

/* eslint-disable @typescript-eslint/naming-convention -- process environment names */
const isolated = {
  PATH: process.env['PATH'] ?? '/usr/bin:/bin',
  HOME: '/nonexistent',
  LANG: 'C',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_COMMITTER_NAME: 'Tau',
  GIT_COMMITTER_EMAIL: 'noreply@tau.new',
} as unknown as NodeJS.ProcessEnv;
/* eslint-enable @typescript-eslint/naming-convention -- end of the process environment map */

const git = (cwd: string, ...args: readonly string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8', env: isolated, stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** A repository and a way to commit on `main` as an author. */
const newRepository = (): { directory: string; commit: (author: string) => string } => {
  const directory = mkdtempSync(path.join(tmpdir(), 'tau-coverage-pass-'));
  scratch.push(directory);
  git(directory, 'init', '--quiet', '--initial-branch=main', '.');
  let count = 0;
  return {
    directory,
    commit: (author) => {
      count += 1;
      writeFileSync(path.join(directory, 'main.scad'), `cube(${String(count)});\n`);
      git(directory, 'add', '.');
      git(directory, 'commit', '--quiet', '--author', author, '-m', `save ${String(count)}`);
      return git(directory, 'rev-parse', 'HEAD');
    },
  };
};

const person = 'Ada <user_ada@users.noreply.tau.new>';
const anonymous = 'Anonymous <anon:3fa9c1d2@users.noreply.tau.new>';
const handle = 'ada <ada@users.noreply.tau.new>';
const inputs = { pusher: 'user_pusher', identities: [] };
const budget = 120_000;
const main = (oid: string) => ({ 'refs/heads/main': { oid } });

const complete = (result: CoverageResult) => {
  if (result.coverage !== 'complete') {
    throw new Error(`coverage ${result.coverage}`);
  }
  return result;
};

describe('coveragePass (D3)', () => {
  it('should mark a push anonymous for a pseudonymous commit anywhere among what it first brought', async () => {
    const { directory, commit } = newRepository();
    const first = commit(person);
    commit(anonymous);
    const tip = commit(person);
    const result = complete(
      await coveragePass({ directory, before: main(first), after: main(tip), inputs, budgetMilliseconds: budget }),
    );
    expect(result.anonymous).toBe(true);
    expect(result.commits).toHaveLength(2);
    expect(result.commits.filter((entry) => hasBit(entry, commitBits.pseudonymous))).toHaveLength(1);
  });

  it('should not count a pseudonymous commit the server already held, nor a record ref', async () => {
    const { directory, commit } = newRepository();
    const held = commit(anonymous);
    const tip = commit(person);
    const result = complete(
      await coveragePass({
        directory,
        before: main(held),
        after: { ...main(tip), 'refs/tau/chats/x': { oid: held } },
        inputs,
        budgetMilliseconds: budget,
      }),
    );
    expect(result.anonymous).toBe(false);
    expect(result.commits.map(([oid]) => oid)).toStrictEqual([tip]);
  });

  it('should read a first push in full, and a push that adds no tip as empty', async () => {
    const { directory, commit } = newRepository();
    const tip = commit(anonymous);
    expect(
      complete(await coveragePass({ directory, before: {}, after: main(tip), inputs, budgetMilliseconds: budget }))
        .anonymous,
    ).toBe(true);
    expect(
      await coveragePass({ directory, before: main(tip), after: main(tip), inputs, budgetMilliseconds: budget }),
    ).toStrictEqual({ coverage: 'complete', commits: [], anonymous: false, unreadable: 0 });
  });

  it('should not mistake a name that mentions anon for the pseudonym', async () => {
    const { directory, commit } = newRepository();
    const tip = commit('anon:fan <user_fan@users.noreply.tau.new>');
    expect(
      complete(await coveragePass({ directory, before: {}, after: main(tip), inputs, budgetMilliseconds: budget }))
        .anonymous,
    ).toBe(false);
  });

  it('should lift the mark when the inline claim covers the pseudonym, and record the claimable handle', async () => {
    const { directory, commit } = newRepository();
    const pseudonymous = commit(anonymous);
    const tip = commit(handle);
    const claimed = complete(
      await coveragePass({
        directory,
        before: {},
        after: main(tip),
        inputs: { pusher: 'user_pusher', identities: ['anon:3fa9c1d2', 'ada'] },
        budgetMilliseconds: budget,
      }),
    );
    expect(claimed.anonymous).toBe(false);
    expect(claimed.commits).toStrictEqual([
      [tip, commitBits.claim, 'ada'],
      [pseudonymous, commitBits.claim + commitBits.pseudonymous, 'anon:3fa9c1d2'],
    ]);
  });

  it('should set the address, forge and foreign bits from the grant inputs and carry no address', async () => {
    const { directory, commit } = newRepository();
    const verified = commit('Ada <ada@example.com>');
    const forge = commit('ada <4242+ada@users.noreply.github.com>');
    const tip = commit('Grace <grace@example.org>');
    const result = complete(
      await coveragePass({
        directory,
        before: {},
        after: main(tip),
        inputs: { pusher: 'user_pusher', identities: [], verifiedEmail: 'ADA@example.com', forgeId: '4242' },
        budgetMilliseconds: budget,
      }),
    );
    const byOid = new Map(result.commits.map((entry) => [entry[0], entry]));
    expect(hasBit(byOid.get(verified) ?? ['', 0], commitBits.address)).toBe(true);
    expect(hasBit(byOid.get(forge) ?? ['', 0], commitBits.forge)).toBe(true);
    /* This repository's committer is Tau's, so a foreign author is also a Tau-written foreign address. */
    expect(byOid.get(tip)?.[1]).toBe(commitBits.foreignAddress + commitBits.tauWrittenAddress);
    expect(JSON.stringify(result)).not.toContain('@');
  });

  it('should fail towards hiding, and never throw, when the walk cannot run or has no budget', async () => {
    const { directory, commit } = newRepository();
    const tip = commit(person);
    expect(
      await coveragePass({
        directory,
        before: {},
        after: main('f'.repeat(40)),
        inputs,
        budgetMilliseconds: budget,
      }),
    ).toStrictEqual({ coverage: 'failed', anonymous: true, reason: 'walk_failed' });
    expect(
      await coveragePass({ directory, before: {}, after: main(tip), inputs, budgetMilliseconds: 0 }),
    ).toStrictEqual({ coverage: 'failed', anonymous: true, reason: 'budget_exceeded' });
    expect(coverageBudgetMilliseconds(1_000_000, 0)).toBe(120_000);
    expect(coverageBudgetMilliseconds(100_000, 0)).toBe(40_000);
  });
});
