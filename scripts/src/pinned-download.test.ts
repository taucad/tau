/* eslint-disable @typescript-eslint/naming-convention -- Subprocess environment keys must match download.sh variables. */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { load } from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/*
 * Every file a CI runner downloads with curl goes through `.github/actions/apt-install/download.sh`, which retries
 * a failed name resolution (and every other transport or HTTP failure) for about two minutes, checks the pinned
 * digest and renames only a verified file into place. Merge-queue job 136608512967 failed on 2026-11-20 with
 * `curl: (6) Could not resolve host: release-assets.githubusercontent.com` downloading Pandoc; job 138868659888
 * failed its kernel seeds on `ENOTFOUND` on 2026-11-24 (the in-process path, @taucad/archive-core's
 * `unattendedFetchRetry`, takes the same schedule).
 */

const root = resolve(import.meta.dirname, '../..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');
const script = resolve(root, '.github/actions/apt-install/download.sh');

type Step = { readonly uses?: string; readonly run?: string; readonly with?: Record<string, string> };
type StepList = { readonly steps?: readonly Step[] };

/** Every workflow job and composite action, as `<file>#<job>` and its steps. */
const stepLists = (): Array<[string, readonly Step[]]> => {
  const lists: Array<[string, readonly Step[]]> = [];
  for (const file of readdirSync(resolve(root, '.github/workflows')).filter((name) => /\.ya?ml$/u.test(name))) {
    const path = `.github/workflows/${file}`;
    const workflow = load(read(path)) as { readonly jobs?: Record<string, StepList> };
    for (const [job, { steps = [] }] of Object.entries(workflow.jobs ?? {})) {
      lists.push([`${path}#${job}`, steps]);
    }
  }
  for (const directory of readdirSync(resolve(root, '.github/actions'))) {
    const path = `.github/actions/${directory}/action.yml`;
    const action = load(read(path)) as { readonly runs?: StepList };
    lists.push([path, action.runs?.steps ?? []]);
  }
  return lists;
};

/**
 * Commands of curl that write a file but cannot take the helper, each retrying every error itself instead: these jobs
 * check out no copy of this workflow's `.github/actions` (a mirror job) or run the release tag's own tree.
 */
const selfRetried = [
  {
    where: '.github/workflows/release-build.yml#picogk-layer-mirror',
    reason: 'reads back the layer it just uploaded; the job checks nothing out',
  },
  {
    where: '.github/workflows/release-build.yml#serve-ui-layer-mirror',
    reason: 'reads back the layer it just uploaded; the job checks nothing out',
  },
  {
    where: '.github/workflows/release-build.yml#desktop-ota',
    reason: 'runs from the release tag it checks out, which can predate the helper',
  },
] as const;

/** Spike experiments, run only on `workflow_dispatch` and frozen with the evidence they recorded. */
const frozenSpike = /^\.github\/workflows\/spike-[\w-]+\.yml#/u;

/** A curl command line that writes its body to a file other than /dev/null. */
const fileDownload = /\bcurl\b.*(?:\s-[a-zA-Z]*o\s+|\s--output\s+)(?!\/dev\/null)\S/u;

describe('pinned downloads in workflows and composite actions', () => {
  const helper = /(?:^|\s)\.\/(?:\.tau-ci\/)?\.github\/actions\/apt-install\/download\.sh \S+ /u;

  it('should download every pinned file through download.sh', () => {
    const bare: string[] = [];
    let helped = 0;
    for (const [where, steps] of stepLists()) {
      if (frozenSpike.test(where)) {
        continue;
      }
      // A job whose workspace is another commit runs the copy it side-loaded at `.tau-ci`.
      const sideLoaded = steps.some((step) => step.with?.['path'] === '.tau-ci');
      for (const step of steps) {
        const lines = (step.run ?? '').replaceAll(/\\\n\s*/gu, ' ').split('\n');
        for (const line of lines) {
          if (helper.test(line)) {
            helped++;
            expect(line.includes('./.tau-ci/.github/actions/apt-install/download.sh'), `${where}: ${line}`).toBe(
              sideLoaded,
            );
            continue;
          }
          if (!fileDownload.test(line)) {
            continue;
          }
          const exempt = selfRetried.some((entry) => entry.where === where) && line.includes('--retry-all-errors');
          if (!exempt) {
            bare.push(`${where}: ${line.trim()}`);
          }
        }
      }
    }
    expect(bare).toEqual([]);
    // Pandoc (ci.yml, e2e-nightly, release-gate), the .NET SDK (native-darwin), the floor Node (native-hosts).
    expect(helped).toBeGreaterThanOrEqual(5);
  });

  it('should keep the self-retried exceptions real', () => {
    const lists = new Map(stepLists());
    for (const { where } of selfRetried) {
      const runs = (lists.get(where) ?? []).map((step) => step.run ?? '').join('\n');
      expect(runs, where).toMatch(/curl .*--retry-all-errors/u);
    }
  });
});

describe('download.sh', () => {
  let sandbox: string;
  const body = 'pinned release asset\n';
  const sha256 = createHash('sha256').update(body).digest('hex');
  const sha512 = createHash('sha512').update(body).digest('hex');
  const url = 'https://github.com/example/tool/releases/download/v1/tool.deb';

  /**
   * A curl stand-in that fails as an unresolvable host does (exit 6) until its call number exceeds `$FAILURES`, then
   * writes `$BODY` to its `--output`. With `$PARTIAL` set, a failing call first writes half a body to its output.
   */
  const curl = `#!/usr/bin/env bash
n=$(( $(cat "$STUB/count" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$STUB/count"
while [ $# -gt 0 ]; do
  case "$1" in --output) output="$2"; shift 2 ;; --connect-timeout|--speed-limit|--speed-time) shift 2 ;; *) last="$1"; shift ;; esac
done
echo "$last" >> "$STUB/urls"
if [ "$n" -le "\${FAILURES:-0}" ]; then
  [ -z "\${PARTIAL:-}" ] || printf 'half' > "$output"
  echo "\${MESSAGE:-curl: (6) Could not resolve host: release-assets.githubusercontent.com}" >&2
  exit "\${STATUS:-6}"
fi
printf '%s' "$BODY" > "$output"
`;

  const run = (args: readonly string[], env: Record<string, string> = {}) => {
    const result = spawnSync('bash', [script, ...args], {
      encoding: 'utf8',
      env: {
        ...process.env,
        STUB: sandbox,
        BODY: body,
        DOWNLOAD_CURL: join(sandbox, 'curl'),
        DOWNLOAD_BACKOFF: '0',
        ...env,
      },
    });
    return { status: result.status, output: `${result.stdout}${result.stderr}` };
  };
  const calls = (): number => Number(readFileSync(join(sandbox, 'count'), 'utf8'));
  const output = (): string => join(sandbox, 'out', 'tool.deb');
  const leftovers = (): string[] => (existsSync(join(sandbox, 'out')) ? readdirSync(join(sandbox, 'out')) : []);

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'tau-download-'));
    writeFileSync(join(sandbox, 'curl'), curl);
    chmodSync(join(sandbox, 'curl'), 0o755);
    mkdirSync(join(sandbox, 'out'));
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('should download and keep a file that matches its pin, with no retry event', () => {
    const { status, output: log } = run(['pandoc-download', url, output(), `sha256:${sha256}`]);
    expect(status, log).toBe(0);
    expect(readFileSync(output(), 'utf8')).toBe(body);
    expect(log).not.toContain('infra-retry');
    expect(readFileSync(join(sandbox, 'urls'), 'utf8').trim()).toBe(url);
  });

  it('should retry a failed name resolution that recovers, as dns retry events, and keep only the verified file', () => {
    const { status, output: log } = run(['pandoc-download', url, output(), `sha256:${sha256}`], {
      FAILURES: '3',
      PARTIAL: '1',
    });
    expect(status, log).toBe(0);
    expect(calls()).toBe(4);
    expect(log.match(/^::warning title=infra-retry::.*$/gmu)).toEqual([
      '::warning title=infra-retry::pandoc-download attempt 1 of 8 failed: dns; retrying in 0s',
      '::warning title=infra-retry::pandoc-download attempt 2 of 8 failed: dns; retrying in 0s',
      '::warning title=infra-retry::pandoc-download attempt 3 of 8 failed: dns; retrying in 0s',
    ]);
    expect(readFileSync(output(), 'utf8')).toBe(body);
    // The partial bodies of the failed attempts never reach the output and are not left beside it.
    expect(leftovers()).toEqual(['tool.deb']);
  });

  it('should fail with curl’s status after every attempt fails, writing nothing', () => {
    const { status, output: log } = run(['pandoc-download', url, output(), `sha256:${sha256}`], {
      FAILURES: '99',
      PARTIAL: '1',
    });
    expect(status).toBe(6);
    expect(calls()).toBe(8);
    expect(log).toContain('::error title=infra-retry::pandoc-download failed after 8 attempts: dns');
    expect(leftovers()).toEqual([]);
  });

  it('should refuse a file that does not match its pin, even after a clean transfer', () => {
    const { status, output: log } = run(['pandoc-download', url, output(), `sha256:${'0'.repeat(64)}`]);
    expect(status).toBe(1);
    expect(calls()).toBe(1);
    expect(log).toContain(`::error title=pinned-download::pandoc-download: ${url} has sha256 ${sha256}`);
    expect(leftovers()).toEqual([]);
  });

  it('should retry an origin 5xx as an http-server-error event', () => {
    const { status, output: log } = run(['pandoc-download', url, output(), `sha256:${sha256}`], {
      FAILURES: '1',
      MESSAGE: 'curl: (22) The requested URL returned error: 502',
      STATUS: '22',
    });
    expect(status, log).toBe(0);
    expect(log).toContain(
      '::warning title=infra-retry::pandoc-download attempt 1 of 8 failed: http-server-error; retrying in 0s',
    );
  });

  it('should check a sha512 pin', () => {
    expect(run(['dotnet-sdk-download', url, output(), `sha512:${sha512}`]).status).toBe(0);
    expect(readFileSync(output(), 'utf8')).toBe(body);
  });

  it('should wait 2 s before the first retry by default', () => {
    const { status, output: log } = run(['pandoc-download', url, output(), `sha256:${sha256}`], {
      FAILURES: '1',
      DOWNLOAD_BACKOFF: '',
    });
    expect(status, log).toBe(0);
    expect(log).toContain('::warning title=infra-retry::pandoc-download attempt 1 of 8 failed: dns; retrying in 2s');
  }, 15_000);

  it('should outlast two minutes of failed resolution by default and no more: waits of 2, 4, 8, 16, 30, 30, 30 s', () => {
    const source = readFileSync(script, 'utf8');
    const attempts = Number(/DOWNLOAD_ATTEMPTS:-(\d+)/u.exec(source)?.[1]);
    const backoff = (/DOWNLOAD_BACKOFF:-([\d ]+)\}/u.exec(source)?.[1] ?? '').split(' ').map(Number);
    const waits = Array.from({ length: attempts - 1 }, (_, index) => backoff[Math.min(index, backoff.length - 1)]);
    expect(waits).toEqual([2, 4, 8, 16, 30, 30, 30]);
    expect(waits.reduce((sum = 0, wait = 0) => sum + wait, 0)).toBe(120);
  });

  it.each([
    [['pandoc-download', url, 'out.deb']],
    [['pandoc-download', url, 'out.deb', `md5:${'0'.repeat(32)}`]],
    [['pandoc-download', url, 'out.deb', `sha256:${'0'.repeat(63)}`]],
    [['pandoc-download', url, 'out.deb', `sha256:${'A'.repeat(64)}`]],
  ])('should refuse bad arguments %j before any request', (args) => {
    expect(run(args).status).toBe(1);
    expect(existsSync(join(sandbox, 'count'))).toBe(false);
  });
});
