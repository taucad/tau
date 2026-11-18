import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkProject } from '#check.js';
import { dealRuns, parseShard, readRunSeconds, weightOf } from '#shard.js';

const table = readRunSeconds();
const names = Object.keys(table.seconds);

/** The wall time of one runner that runs its runs heaviest first on two JVMs (FM-R15). */
const twoJvmWall = (seconds: readonly number[]): number => {
  const jvms = [0, 0];
  for (const run of seconds) {
    const free = jvms[0]! <= jvms[1]! ? 0 : 1;
    jvms[free]! += run;
  }
  return Math.max(...jvms);
};

describe('parseShard', () => {
  it('should read k/N with 1 ≤ k ≤ N and refuse anything else', () => {
    expect(parseShard('2/4')).toEqual({ index: 2, count: 4 });
    expect(parseShard('1/1')).toEqual({ index: 1, count: 1 });
    for (const text of ['0/4', '5/4', '1/0', '1', '1/2/3', 'a/b', '-1/2', '']) {
      expect(parseShard(text), text).toBeUndefined();
    }
  });
});

describe('dealRuns', () => {
  it.each([1, 2, 3, 4, 7, 60])('should give every run to exactly one of %i shards', (count) => {
    const dealt = dealRuns(names, count, table);

    expect(dealt).toHaveLength(count);
    expect(dealt.flat().toSorted((left, right) => left - right)).toEqual(names.map((_name, index) => index));
  });

  it('should deal the same names the same way whatever their order', () => {
    const reversed = names.toReversed();
    const named = (dealt: number[][], from: readonly string[]): string[][] =>
      dealt.map((shard) => shard.map((index) => from[index]!).toSorted());

    expect(named(dealRuns(reversed, 4, table), reversed)).toEqual(named(dealRuns(names, 4, table), names));
  });

  it('should list each shard heaviest first and weigh an unmeasured run at the default', () => {
    const extra = [...names, 'packages/example/specs/New.cfg'];
    for (const shard of dealRuns(extra, 4, table)) {
      const seconds = shard.map((index) => weightOf(extra[index]!, table));
      expect(seconds).toEqual(seconds.toSorted((left, right) => right - left));
    }
    expect(weightOf('packages/example/specs/New.cfg', table)).toBe(table.defaultSeconds);
  });

  it("should hold agent-host's measured nightly runs on four runners to the longest run", () => {
    const seconds = Object.values(table.seconds);
    const longest = Math.max(...seconds);
    const walls = dealRuns(names, 4, table).map((shard) =>
      twoJvmWall(shard.map((index) => table.seconds[names[index]!]!)),
    );

    // 46 runs, 2,797 JVM-seconds measured on one runner (job 134332529778); dealt to four runners the
    // slowest runs only the 392 s config, against about 1,400 s of wall time on one.
    expect(names).toHaveLength(46);
    expect(Math.max(...walls)).toBe(longest);
    expect(twoJvmWall(seconds.toSorted((left, right) => right - left))).toBeGreaterThan(1350);
  });
});

describe('checkProject --shard', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('should run every nightly run in exactly one shard, with the verdicts of an unsharded check', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'formal-shard-'));
    roots.push(root);
    const projectRoot = path.join(root, 'packages/example');
    const specs = path.join(projectRoot, 'specs');
    mkdirSync(specs, { recursive: true });
    const configs = Object.fromEntries(
      Array.from({ length: 9 }, (_unused, index) => [
        `Model.c${String(index)}.cfg`,
        { tier: 'nightly', expect: 'pass' },
      ]),
    );
    writeFileSync(path.join(specs, 'expected.json'), JSON.stringify({ configs }));
    writeFileSync(path.join(specs, 'Model.tla'), '---- MODULE Model ----\n====\n');
    for (const config of Object.keys(configs)) {
      writeFileSync(path.join(specs, config), '');
    }
    // A stand-in JVM: TLC's pass line for whatever config it is given.
    const java = path.join(root, 'java');
    writeFileSync(java, '#!/bin/sh\necho "Model checking completed. No error has been found."\n');
    chmodSync(java, 0o755);
    const tools = { java: { bin: java, major: 25 }, tlc: { jar: 'tla2tools.jar', community: 'community.jar' } };
    const context = { root, env: {} };
    const summary = (directory: string): { readonly runs: ReadonlyArray<{ name: string; actual: string }> } =>
      JSON.parse(
        readFileSync(path.join(root, 'out/reports/formal/packages/example/nightly', directory, 'summary.json'), 'utf8'),
      ) as { readonly runs: ReadonlyArray<{ name: string; actual: string }> };
    const lines: string[] = [];
    const log = (line: string): void => {
      lines.push(line);
    };

    expect(await checkProject(context, { tier: 'nightly', projectRoot, tools, log })).toBe(0);
    const statuses = await Promise.all(
      [1, 2, 3].map(async (index) =>
        checkProject(context, { tier: 'nightly', projectRoot, tools, log, shard: { index, count: 3 } }),
      ),
    );

    expect(statuses).toEqual([0, 0, 0]);
    const whole = summary('').runs.map((run) => `${run.name} ${run.actual}`);
    const shards = [1, 2, 3].map((index) =>
      summary(`shard-${String(index)}-of-3`).runs.map((run) => `${run.name} ${run.actual}`),
    );
    expect(whole).toHaveLength(9);
    expect(shards.flat().toSorted()).toEqual(whole.toSorted());
    expect(shards.map((runs) => runs.length)).toEqual([3, 3, 3]);
    expect(lines).toContain(
      'packages/example:formal:nightly: shard 2/3: 3 of 9 runs, 0 failures; out/reports/formal/packages/example/nightly/shard-2-of-3/summary.json',
    );
  });
});
