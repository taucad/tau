/* eslint-disable @typescript-eslint/naming-convention -- Subprocess environment keys must match infra-retry.sh variables. */
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { load } from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/*
 * APT-1: every apt install on a runner, Playwright's browser system dependencies included, goes through
 * `.github/actions/apt-install`, which retries with backoff and falls back from the hosted runners' Azure mirror to
 * the Ubuntu archive (merge-queue jobs 135562329370, 135559657198 and 135539446511 failed on that mirror with exit
 * 100 on 2026-11-19). Nothing calls apt without it, and `playwright install --with-deps` is gone.
 */

const root = resolve(import.meta.dirname, '../..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');
const actionDirectory = '.github/actions/apt-install';
const script = resolve(root, actionDirectory, 'apt-install.sh');

type Step = {
  readonly name?: string;
  readonly if?: string;
  readonly uses?: string;
  readonly run?: string;
  readonly with?: Record<string, string>;
};
type StepList = { readonly steps?: readonly Step[] };
type Workflow = { readonly jobs?: Record<string, StepList> };
type Action = { readonly runs?: StepList };

/** Every workflow job and composite action, as `<file>#<job>` and its steps. */
const stepLists = (): Array<[string, readonly Step[]]> => {
  const lists: Array<[string, readonly Step[]]> = [];
  for (const file of readdirSync(resolve(root, '.github/workflows')).filter((name) => /\.ya?ml$/u.test(name))) {
    const path = `.github/workflows/${file}`;
    const workflow = load(read(path)) as Workflow;
    for (const [job, { steps = [] }] of Object.entries(workflow.jobs ?? {})) {
      lists.push([`${path}#${job}`, steps]);
    }
  }
  for (const directory of readdirSync(resolve(root, '.github/actions'))) {
    const path = `.github/actions/${directory}/action.yml`;
    const action = load(read(path)) as Action;
    lists.push([path, action.runs?.steps ?? []]);
  }
  return lists;
};

/** An apt or Playwright system-dependency install written into a `run` line. */
const directInstall = /\bapt(?:-get)?\s.*\b(?:install|update)\b|--with-deps|\binstall-deps\b/u;

/**
 * Lines that call apt inside a container or a remote machine, where the runner's Azure mirror is not involved
 * and the installer is not mounted: a `docker run` line, and these two, which build the command for one.
 */
const containerInstalls = [
  {
    file: '.github/workflows/dv1-staging.yml',
    line: 'apt-get install -y -qq git',
    reason: 'runs inside the Fly machine `flyctl machine run node:24-bookworm` starts',
  },
  {
    file: '.github/workflows/spike-w1-linux-s17.yml',
    line: 'apt-get -qq install -y libgl1',
    reason: 'the install command handed to the debian:10 container of the next `docker run`',
  },
] as const;

/** A GitHub Actions `${{ … }}` expression, built so the source holds no template-like string literal. */
const expression = (body: string): string => ['$', '{{ ', body, ' }}'].join('');

const isAptInstall = (step: Step): boolean => step.uses?.replace(/^\.\/\.tau-ci\//u, './') === `./${actionDirectory}`;

describe('apt installs in workflows and composite actions', () => {
  const lists = stepLists();

  it('should call apt or install Playwright system dependencies only through the apt-install action', () => {
    const direct: string[] = [];
    const used = new Set<string>();
    for (const [where, steps] of lists) {
      for (const step of steps) {
        for (const line of (step.run ?? '').split('\n')) {
          if (!directInstall.test(line) || line.includes('docker run')) {
            continue;
          }
          const allowed = containerInstalls.find(
            (entry) => where.startsWith(`${entry.file}#`) && line.includes(entry.line),
          );
          if (allowed === undefined) {
            direct.push(`${where}: ${line.trim()}`);
          } else {
            used.add(allowed.file);
          }
        }
      }
    }
    expect(direct).toEqual([]);
    expect([...used].sort()).toEqual(containerInstalls.map((entry) => entry.file).sort());
  });

  it('should install every apt-install step’s Playwright browsers later in the same job', () => {
    let steps = 0;
    for (const [where, list] of lists) {
      for (const [index, step] of list.entries()) {
        if (!isAptInstall(step)) {
          continue;
        }
        steps++;
        expect(`${step.with?.['packages'] ?? ''}${step.with?.['playwright-browsers'] ?? ''}`.trim(), where).not.toBe(
          '',
        );
        const browsers = step.with?.['playwright-browsers'];
        if (browsers === undefined) {
          continue;
        }
        const later = list.slice(index + 1).map((candidate) => candidate.run ?? '');
        const install = /playwright install (?!--with-deps)(?!-deps)/u;
        expect(
          later.some((run) => install.test(run)),
          `${where}: ${browsers}`,
        ).toBe(true);
      }
    }
    // The sandbox action, the lavapipe and tool installs, and every former `--with-deps` site.
    expect(steps).toBeGreaterThanOrEqual(30);
  });

  it('should take the installer from the workflow’s own commit in a job that checks out another commit', () => {
    const sparseCopy = (step: Step): boolean =>
      step.uses?.startsWith('actions/checkout@') === true &&
      step.with?.['path'] === '.tau-ci' &&
      step.with['sparse-checkout'] === actionDirectory &&
      String(step.with['sparse-checkout-cone-mode']) === 'false';
    const ownCommit = expression('github.sha');
    const sideLoaded: string[] = [];
    for (const [where, steps] of lists.filter(([where]) => where.includes('#'))) {
      const installs = steps.filter((step) => isAptInstall(step));
      if (installs.length === 0) {
        continue;
      }
      // The job's Tau checkout at the workspace root: none when the workspace is another repository's.
      const workspace = steps.find(
        (step) =>
          step.uses?.startsWith('actions/checkout@') === true &&
          step.with?.['path'] === undefined &&
          step.with?.['repository'] === undefined,
      );
      if (workspace !== undefined && (workspace.with?.['ref'] ?? '') === '') {
        // The installer is the checked-out commit's own; no copy beside it.
        expect(
          installs.map((step) => step.uses),
          where,
        ).toEqual(installs.map(() => `./${actionDirectory}`));
        continue;
      }
      sideLoaded.push(where);
      const copy = steps.findIndex((step) => sparseCopy(step));
      expect(copy, `${where}: a sparse checkout of ${actionDirectory} at .tau-ci`).toBeGreaterThanOrEqual(0);
      const copyStep = steps[copy];
      // Another repository's workspace leaves checkout's default, the workflow's own commit.
      if (workspace !== undefined) {
        expect(copyStep?.with?.['ref'], where).toBe(ownCommit);
      }
      for (const step of installs) {
        expect(step.uses, where).toBe(`./.tau-ci/${actionDirectory}`);
        expect(steps.indexOf(step), where).toBeGreaterThan(copy);
      }
    }
    // The release gate, the rehearsal gate, viewer parity (called with the candidate), the nightly rows, the
    // release build, the staging harness, the publish spike and PicoVoxel's own workspaces.
    expect(sideLoaded.length).toBeGreaterThanOrEqual(12);
  });

  it('should run the installer from the action, with apt retries and timeouts', () => {
    const action = load(read(`${actionDirectory}/action.yml`)) as Action;
    expect(action.runs?.steps?.map((step) => step.run ?? '').join('\n')).toContain(
      '"$GITHUB_ACTION_PATH/apt-install.sh"',
    );
    const source = read(`${actionDirectory}/apt-install.sh`);
    for (const option of [
      'Acquire::Retries=5',
      'Acquire::http::Timeout=',
      'Acquire::https::Timeout=',
      'timeout --kill-after=',
    ]) {
      expect(source).toContain(option);
    }
  });
});

/*
 * FQ-3 / RT-6 (Brain `research/ci-flake-quarantine-blueprint.md`, #2792): the other infrastructure downloads (the
 * Playwright browsers, Pandoc, pnpm through corepack and its install) retry through `infra-retry.sh` beside the
 * installer, and every retry is an `infra-retry` annotation the CI health report counts. Never a test step.
 */
describe('infrastructure step retries in workflows and composite actions', () => {
  const lists = stepLists();
  const retried =
    /(?:^|\s)(?:bash "\$GITHUB_ACTION_PATH\/\.\.\/apt-install\/|\.\/(?:\.tau-ci\/)?\.github\/actions\/apt-install\/)infra-retry\.sh (\S+) /u;

  it('should install every Playwright browser and download Pandoc through infra-retry.sh', () => {
    const bare: string[] = [];
    let wrapped = 0;
    for (const [where, steps] of lists) {
      const sideLoaded = steps.some((step) => step.uses?.startsWith('./.tau-ci/') === true);
      for (const step of steps) {
        for (const line of (step.run ?? '').split('\n')) {
          if (!/playwright install (?!-)|curl \S+ -o "\$RUNNER_TEMP\/pandoc\.deb"/u.test(line)) {
            continue;
          }
          if (!retried.test(line)) {
            bare.push(`${where}: ${line.trim()}`);
            continue;
          }
          wrapped++;
          // A job whose workspace is another commit runs the copy it side-loaded with the installer.
          expect(line.includes('./.tau-ci/.github/actions/apt-install/infra-retry.sh'), `${where}: ${line}`).toBe(
            sideLoaded,
          );
        }
      }
    }
    expect(bare).toEqual([]);
    expect(wrapped).toBeGreaterThanOrEqual(20);
  });

  it('should download pnpm and install dependencies through infra-retry.sh in setup-nx', () => {
    const action = load(read('.github/actions/setup-nx/action.yml')) as Action;
    const runs = (action.runs?.steps ?? []).map((step) => step.run ?? '');
    expect(runs.some((run) => run.includes('infra-retry.sh" pnpm-download pnpm --version'))).toBe(true);
    expect(runs.some((run) => run.includes('infra-retry.sh" pnpm-install pnpm install --frozen-lockfile'))).toBe(true);
  });

  it('should never retry a test step', () => {
    const tests: string[] = [];
    for (const [where, steps] of lists) {
      for (const step of steps) {
        const match = retried.exec(step.run ?? '');
        if (
          match &&
          !['playwright-install', 'pandoc-download', 'pnpm-download', 'pnpm-install'].includes(match[1] ?? '')
        ) {
          tests.push(`${where}: ${match[1] ?? ''}`);
        }
      }
    }
    expect(tests).toEqual([]);
  });
});

describe('infra-retry.sh', () => {
  const retryScript = resolve(root, actionDirectory, 'infra-retry.sh');
  const retry = (args: readonly string[], env: Record<string, string> = {}) => {
    const result = spawnSync('bash', [retryScript, ...args], {
      encoding: 'utf8',
      env: { ...process.env, INFRA_RETRY_BACKOFF: '0', ...env },
    });
    return { status: result.status, output: `${result.stdout}${result.stderr}` };
  };

  it('should run a command that succeeds once, with no retry event', () => {
    const { status, output } = retry(['demo', 'bash', '-c', 'echo fine']);
    expect(status).toBe(0);
    expect(output).not.toContain('infra-retry');
  });

  it('should retry with a stable signature per failed attempt and pass the first success', () => {
    const counter = join(mkdtempSync(join(tmpdir(), 'tau-infra-retry-')), 'count');
    const { status, output } = retry([
      'playwright-install',
      'bash',
      '-c',
      `n=$(( $(cat ${counter} 2>/dev/null || echo 0) + 1 )); echo $n > ${counter}; [ $n -ge 3 ] || { echo 'Error: read ECONNRESET'; exit 1; }`,
    ]);
    expect(status, output).toBe(0);
    expect(output.match(/^::warning title=infra-retry::.*$/gmu)).toEqual([
      '::warning title=infra-retry::playwright-install attempt 1 of 3 failed: connection-reset; retrying in 0s',
      '::warning title=infra-retry::playwright-install attempt 2 of 3 failed: connection-reset; retrying in 0s',
    ]);
  });

  it('should fail with the last status and an error event after every attempt fails', () => {
    const { status, output } = retry(
      ['pandoc-download', 'bash', '-c', 'echo "Could not resolve host: github.com"; exit 6'],
      {
        INFRA_RETRY_ATTEMPTS: '2',
      },
    );
    expect(status).toBe(6);
    expect(output).toContain('::warning title=infra-retry::pandoc-download attempt 1 of 2 failed: dns; retrying in 0s');
    expect(output).toContain('::error title=infra-retry::pandoc-download failed after 2 attempts: dns');
  });

  it('should stop an attempt past its deadline and sign it as a timeout', () => {
    const { status, output } = retry(['pnpm-install', 'sleep', '30'], {
      INFRA_RETRY_ATTEMPTS: '1',
      INFRA_RETRY_ATTEMPT_SECONDS: '1',
    });
    expect(status).toBe(124);
    expect(output).toContain('::error title=infra-retry::pnpm-install failed after 1 attempts: timeout');
  }, 30_000);

  it('should refuse a command-less call', () => {
    expect(retry(['demo']).status).toBe(1);
  });
});

describe('apt-install.sh', () => {
  let sandbox: string;

  /** An executable stub on the PATH the script runs with. */
  const stub = (name: string, body: string): void => {
    const path = join(sandbox, 'bin', name);
    writeFileSync(path, `#!/usr/bin/env bash\n${body}\n`);
    chmodSync(path, 0o755);
  };

  type Env = ReadonlyArray<readonly [string, string]>;

  const run = (args: readonly string[], env: Env = []) => {
    const result = spawnSync('bash', [script, ...args], {
      cwd: sandbox,
      encoding: 'utf8',
      env: {
        ...process.env,
        ...Object.fromEntries([
          ['PATH', `${join(sandbox, 'bin')}:${process.env['PATH'] ?? ''}`],
          ['STUB', sandbox],
          ['APT_INSTALL_ETC', join(sandbox, 'etc')],
          ['APT_INSTALL_BACKOFF_SECONDS', '0'],
          ['APT_INSTALL_FALLBACK_URI', 'http://archive.ubuntu.com/ubuntu/'],
          ...env,
        ]),
      },
    });
    return {
      status: result.status,
      output: `${result.stdout}${result.stderr}`,
    };
  };

  const calls = (): string[] => {
    try {
      return readFileSync(join(sandbox, 'apt.log'), 'utf8').trim().split('\n');
    } catch {
      return [];
    }
  };
  const sources = (): string => readFileSync(join(sandbox, 'etc/sources.list.d/ubuntu.sources'), 'utf8');

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'tau-apt-install-'));
    mkdirSync(join(sandbox, 'bin'));
    mkdirSync(join(sandbox, 'etc/sources.list.d'), { recursive: true });
    writeFileSync(
      join(sandbox, 'etc/sources.list.d/ubuntu.sources'),
      'Types: deb\nURIs: mirror+file:/etc/apt/apt-mirrors.txt\nSuites: resolute resolute-updates\n',
    );
    // `sudo` runs its command as is, so the stub apt-get on PATH is the one called.
    stub('sudo', 'exec "$@"');
    // Logs each dpkg repair, so a test can see one ran before a retry.
    stub('dpkg', 'echo "dpkg $*" >> "$STUB/apt.log"');
    // Fails its first $APT_FAILS calls (update or install alike), logging each.
    stub(
      'apt-get',
      [
        'echo "$*" >> "$STUB/apt.log"',
        'count=$(( $(cat "$STUB/apt.count" 2>/dev/null || echo 0) + 1 ))',
        'echo "$count" > "$STUB/apt.count"',
        `[ "$count" -gt "$\{APT_FAILS:-0}" ]`,
      ].join('\n'),
    );
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('should retry after two failures, switch the Azure mirror sources to the archive, then succeed', () => {
    const { status, output } = run(['socat', 'ripgrep'], [['APT_FAILS', '2']]);
    expect(status, output).toBe(0);
    expect(calls().map((call) => call.replace(/^(?:-o \S+ )+/u, ''))).toEqual([
      'update',
      'dpkg --configure -a',
      'update',
      'dpkg --configure -a',
      'update',
      'install -y --download-only socat ripgrep',
      'install -y socat ripgrep',
    ]);
    expect(calls()[0]).toContain('-o Acquire::Retries=5');
    expect(sources()).toContain('URIs: http://archive.ubuntu.com/ubuntu/');
    expect(sources()).not.toContain('mirror+file:');
    expect(output).toContain('Switching apt sources from the Azure mirror');
    // Each retry is a job-level `infra-retry` event (FQ-3); the stub fails with no output, so the exit status signs it.
    expect(output.match(/^::warning title=infra-retry::.*$/gmu)).toEqual([
      '::warning title=infra-retry::apt-install attempt 1 of 4 failed: exit-1; retrying in 0s',
      '::warning title=infra-retry::apt-install attempt 2 of 4 failed: exit-1; retrying in 0s',
    ]);
  });

  it('should stop an apt-get call that stalls past its deadline and retry on the archive', () => {
    // The first call hangs, as `apt-get update` did for 58 minutes in jobs 136044021730 and 136044058038.
    stub(
      'apt-get',
      [
        'echo "$*" >> "$STUB/apt.log"',
        'count=$(( $(cat "$STUB/apt.count" 2>/dev/null || echo 0) + 1 ))',
        'echo "$count" > "$STUB/apt.count"',
        '[ "$count" -ne 1 ] || exec sleep 60',
      ].join('\n'),
    );
    const started = Date.now();
    const { status, output } = run(['socat'], [['APT_INSTALL_CALL_TIMEOUT_SECONDS', '1']]);
    expect(status, output).toBe(0);
    expect(Date.now() - started).toBeLessThan(30_000);
    expect(calls().map((call) => call.replace(/^(?:-o \S+ )+/u, ''))).toEqual([
      'update',
      'dpkg --configure -a',
      'update',
      'install -y --download-only socat',
      'install -y socat',
    ]);
    expect(output).toContain('apt-get update did not finish within 1s');
    expect(sources()).toContain('URIs: http://archive.ubuntu.com/ubuntu/');
  });

  it('should put the deadline on the download only, never on the install that runs dpkg', () => {
    // Job 136328471853: a 108 kB/s download used the 300 s, the kill landed mid-unpack, and every retry then
    // failed with "dpkg was interrupted". The download is the stopped step now, and the retry repairs dpkg first.
    stub(
      'apt-get',
      [
        'echo "$*" >> "$STUB/apt.log"',
        'count=$(( $(cat "$STUB/apt.count" 2>/dev/null || echo 0) + 1 ))',
        'echo "$count" > "$STUB/apt.count"',
        '[ "$count" -ne 2 ] || exec sleep 60',
        // The install that unpacks takes longer than the deadline, and must still finish.
        'case "$*" in *--download-only*) ;; *" install "*) sleep 2 ;; esac',
      ].join('\n'),
    );
    const { status, output } = run(['socat'], [['APT_INSTALL_CALL_TIMEOUT_SECONDS', '1']]);
    expect(status, output).toBe(0);
    expect(calls().map((call) => call.replace(/^(?:-o \S+ )+/u, ''))).toEqual([
      'update',
      'install -y --download-only socat',
      'dpkg --configure -a',
      'update',
      'install -y --download-only socat',
      'install -y socat',
    ]);
    expect(output).toContain('apt-get install did not finish within 1s');
  });

  it('should refuse a deadline that is not a positive whole number of seconds', () => {
    const { status, output } = run(['socat'], [['APT_INSTALL_CALL_TIMEOUT_SECONDS', '0']]);
    expect(status).toBe(1);
    expect(output).toContain('APT_INSTALL_CALL_TIMEOUT_SECONDS must be a positive integer');
    expect(calls()).toEqual([]);
  });

  it('should leave the sources alone when the first attempt succeeds', () => {
    const { status } = run(['socat']);
    expect(status).toBe(0);
    expect(calls()).toHaveLength(3);
    expect(sources()).toContain('mirror+file:');
  });

  it('should fail after every attempt fails, never skipping the install', () => {
    const { status, output } = run(
      ['socat'],
      [
        ['APT_FAILS', '99'],
        ['APT_INSTALL_ATTEMPTS', '3'],
      ],
    );
    expect(status).not.toBe(0);
    expect(calls().filter((call) => call.endsWith(' update'))).toHaveLength(3);
    expect(calls().filter((call) => call === 'dpkg --configure -a')).toHaveLength(2);
    expect(output).toContain('::error::apt-get update and install socat failed after 3 attempts');
    expect(output).toContain('::error title=infra-retry::apt-install failed after 3 attempts: exit-1');
  });

  it('should refuse to run with nothing to install', () => {
    const { status, output } = run([]);
    expect(status).toBe(1);
    expect(output).toContain('needs packages or APT_INSTALL_PLAYWRIGHT_BROWSERS');
    expect(calls()).toEqual([]);
  });

  describe('with Playwright browsers', () => {
    /** A stub Playwright whose dry run reports `first` and, on every later call, `then`. */
    const playwright = (first: string, then: string, statuses: { first: number; later: number }): void => {
      writeFileSync(join(sandbox, 'first.txt'), first);
      writeFileSync(join(sandbox, 'then.txt'), then);
      stub(
        'playwright',
        [
          'echo "$*" >> "$STUB/playwright.log"',
          `if [ -e "$STUB/playwright.seen" ]; then cat "$STUB/then.txt"; exit ${String(statuses.later)}; fi`,
          'touch "$STUB/playwright.seen"',
          'cat "$STUB/first.txt"',
          `exit ${String(statuses.first)}`,
        ].join('\n'),
      );
    };
    const missing = 'Missing system dependencies (3):\n  libgbm1\n  libgstreamer1.0-0\n  libnss3\n';
    const none = 'All system dependencies are installed.\n';
    const env: Env = [
      ['APT_INSTALL_PLAYWRIGHT', 'playwright'],
      ['APT_INSTALL_PLAYWRIGHT_BROWSERS', 'chromium,firefox'],
    ];

    it('should install exactly the packages the dry run reports missing, through the retried path', () => {
      playwright(missing, none, { first: 1, later: 0 });
      const { status, output } = run([], [...env, ['APT_FAILS', '2']]);
      expect(status, output).toBe(0);
      expect(calls().map((call) => call.replace(/^(?:-o \S+ )+/u, ''))).toEqual([
        'update',
        'dpkg --configure -a',
        'update',
        'dpkg --configure -a',
        'update',
        'update',
        'install -y --download-only --no-install-recommends libgbm1 libgstreamer1.0-0 libnss3',
        'install -y --no-install-recommends libgbm1 libgstreamer1.0-0 libnss3',
      ]);
      expect(readFileSync(join(sandbox, 'playwright.log'), 'utf8')).toBe(
        'install-deps --dry-run chromium firefox\ninstall-deps --dry-run chromium firefox\n',
      );
    });

    it('should install nothing more when the dry run reports nothing missing', () => {
      playwright(none, none, { first: 0, later: 0 });
      const { status } = run(['xvfb'], env);
      expect(status).toBe(0);
      expect(calls().map((call) => call.replace(/^(?:-o \S+ )+/u, ''))).toEqual([
        'update',
        'install -y --download-only xvfb',
        'install -y xvfb',
      ]);
    });

    it('should fail when Playwright still reports packages missing after the install', () => {
      playwright(missing, missing, { first: 1, later: 1 });
      const { status, output } = run([], env);
      expect(status).not.toBe(0);
      expect(output).toContain('Playwright still misses system packages after the install');
    });

    it('should fail on a dry run it cannot read rather than install nothing', () => {
      playwright('Cannot install dependencies for ubuntu99.04-x64 with Playwright 9.9.9!\n', none, {
        first: 0,
        later: 0,
      });
      const { status, output } = run([], env);
      expect(status).not.toBe(0);
      expect(output).toContain('did not report the missing packages');
      expect(calls().map((call) => call.replace(/^(?:-o \S+ )+/u, ''))).toEqual(['update']);
    });
  });
});
