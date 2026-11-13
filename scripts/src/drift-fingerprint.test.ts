import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { load } from 'js-yaml';
import { afterAll, describe, expect, it } from 'vitest';

import type { Fingerprint } from '#drift-fingerprint.js';
import {
  compare,
  driftWorkflows,
  guestDistros,
  guestPackages,
  guestScript,
  parseFingerprint,
  run,
  runnerWorkflows,
} from '#drift-fingerprint.js';

const root = resolve(import.meta.dirname, '../..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');

type Step = { readonly name?: string; readonly run?: string; readonly if?: string };
type Job = {
  readonly 'runs-on'?: string;
  readonly needs?: readonly string[];
  readonly permissions?: Record<string, string>;
  readonly strategy?: { readonly matrix?: { readonly runner?: readonly string[] } };
  readonly steps?: readonly Step[];
};
const workflow = load(read('.github/workflows/drift-check.yml')) as {
  readonly on: Record<string, unknown> & { readonly schedule?: ReadonlyArray<{ readonly cron: string }> };
  readonly jobs: Record<string, Job>;
};

const baseline: Fingerprint = {
  runners: {
    'ubuntu-24.04': 'ubuntu24 20261102.1',
    'ubuntu-24.04-arm': 'ubuntu24 20261102.2',
    'macos-26': 'macos26 20261101.1',
    'macos-26-intel': 'macos26 20261101.2',
  },
  guests: { ubuntu: 'a'.repeat(64), ubuntu2604: 'b'.repeat(64), debian: 'c'.repeat(64) },
};

describe('guestPackages', () => {
  it('should read every distribution package the shell guest installs, arrays included, and no local .deb', () => {
    const packages = guestPackages(read(guestScript));
    for (const name of ['bubblewrap', 'socat', 'ripgrep', 'docker.io', 'dbus-user-session', 'libgtk-3-0t64']) {
      expect(packages).toContain(name);
    }
    // `docker_client_packages` is set per distribution; both values are fingerprinted.
    expect(packages).toEqual(expect.arrayContaining(['docker-compose-v2', 'docker-cli', 'docker-compose']));
    expect(packages.some((name) => name.includes('/') || name.includes('$') || name.startsWith('-'))).toBe(false);
    expect(packages).toEqual([...packages].sort());
  });

  it('should follow continuation lines and skip comments', () => {
    const script = [
      '# apt-get install commented-out',
      'extra=(one two)',
      'sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \\',
      '  alpha beta \\',
      `  "${'$'}{extra[@]}" "$HOME"/fixture/local_amd64.deb`,
      'apt-get install -y gamma',
    ].join('\n');
    expect(guestPackages(script)).toEqual(['alpha', 'beta', 'gamma', 'one', 'two']);
  });
});

describe('compare', () => {
  it('should dispatch nothing on a quiet day', () => {
    expect(compare(baseline, baseline)).toEqual({ dispatch: [], changes: [] });
  });

  it('should set the baseline by dispatching every workflow when there is no earlier green fingerprint', () => {
    expect(compare(undefined, baseline).dispatch).toEqual(['shell-conformance.yml', 'native-hosts.yml']);
  });

  it.each([
    ['ubuntu-24.04', ['shell-conformance.yml', 'native-hosts.yml']],
    ['ubuntu-24.04-arm', ['native-hosts.yml']],
    ['macos-26', ['shell-conformance.yml']],
    ['macos-26-intel', ['shell-conformance.yml', 'native-hosts.yml']],
  ])('should dispatch the workflows whose rows run on %s when its image moves', (runner, expected) => {
    const current = { ...baseline, runners: { ...baseline.runners, [runner]: 'moved 1' } };
    const drift = compare(baseline, current);
    expect(drift.dispatch).toEqual(expected);
    expect(drift.changes).toEqual([`runner ${runner}: ${baseline.runners[runner]} -> moved 1`]);
  });

  it('should dispatch only the shell rows when a guest package moves', () => {
    const current = { ...baseline, guests: { ...baseline.guests, debian: 'd'.repeat(64) } };
    expect(compare(baseline, current)).toEqual({
      dispatch: ['shell-conformance.yml'],
      changes: ['guest debian packages: cccccccccccc -> dddddddddddd'],
    });
  });

  it('should refuse a runner that feeds no drift workflow', () => {
    const current = { ...baseline, runners: { ...baseline.runners, 'windows-2025': 'x' } };
    expect(() => compare(baseline, current)).toThrow('runner windows-2025 feeds no drift workflow');
  });

  it('should refuse a fingerprint with an empty value', () => {
    expect(() => parseFingerprint({ runners: { 'macos-26': '' }, guests: {} })).toThrow('non-empty string maps');
  });
});

describe('the drift-fingerprint command line', () => {
  const directory = mkdtempSync(join(tmpdir(), 'tau-drift-'));
  afterAll(() => {
    rmSync(directory, { recursive: true, force: true });
  });
  const current = join(directory, 'current.json');
  const previous = join(directory, 'previous.json');
  writeFileSync(previous, JSON.stringify(baseline));
  writeFileSync(current, JSON.stringify({ ...baseline, guests: { ...baseline.guests, ubuntu: 'e'.repeat(64) } }));

  it('should compare two fingerprint files, and treat an empty --previous as no baseline', () => {
    expect(JSON.parse(run(['compare', '--current', current, '--previous', previous]).output)).toMatchObject({
      dispatch: ['shell-conformance.yml'],
    });
    expect(JSON.parse(run(['compare', '--current', current, '--previous', '']).output)).toMatchObject({
      dispatch: [...driftWorkflows],
    });
  });

  it('should exit 2 on a usage error and 1 on a bad fingerprint', () => {
    expect(run(['compare']).code).toBe(2);
    expect(run(['other']).code).toBe(2);
    const bad = join(directory, 'bad.json');
    writeFileSync(bad, '{"runners": {}}');
    expect(run(['compare', '--current', bad]).code).toBe(1);
  });
});

describe('drift-check.yml', () => {
  it('should run daily and on dispatch only', () => {
    expect(Object.keys(workflow.on).sort()).toEqual(['schedule', 'workflow_dispatch']);
    expect(workflow.on.schedule).toEqual([{ cron: '17 6 * * *' }]);
  });

  it('should read the image on every runner the drift map knows, and nothing else', () => {
    expect([...(workflow.jobs['runner-image']?.strategy?.matrix?.runner ?? [])].sort()).toEqual(
      Object.keys(runnerWorkflows).sort(),
    );
  });

  it('should resolve every guest distribution the shell rows boot', () => {
    const resolveStep = workflow.jobs['guests']?.steps?.find(
      (step) => step.name === "Resolve the guests' package versions",
    );
    for (const guest of guestDistros) {
      expect(resolveStep?.run).toMatch(new RegExp(`\\b${guest}=`, 'u'));
    }
    // The fingerprint names the same guests the shell VM script boots.
    const vm = read('libs/sandbox/scripts/shell-conformance-vm.sh');
    for (const guest of guestDistros) {
      expect(vm).toContain(`  ${guest})`);
    }
  });

  it('should dispatch only from the compare job, wait for each run and fail on a red one', () => {
    const job = workflow.jobs['compare'];
    expect(job?.needs).toEqual(['runner-image', 'guests']);
    expect(job?.permissions).toEqual({ contents: 'read', actions: 'write' });
    const dispatch = job?.steps?.find((step) => step.name === 'Dispatch and wait')?.run ?? '';
    expect(dispatch).toContain('gh workflow run "$workflow" --repo "$GITHUB_REPOSITORY" --ref main');
    expect(dispatch).toContain('[ "$conclusion" = success ] || status=1');
    // Only a green run's fingerprint is read back as the baseline.
    const previous = job?.steps?.find((step) => step.name === 'Read the last green fingerprint')?.run ?? '';
    expect(previous).toContain('actions/workflows/drift-check.yml/runs?branch=main&status=success&per_page=1');
    for (const name of driftWorkflows) {
      expect(read(`.github/workflows/${name}`)).toMatch(/^ {2}workflow_dispatch:/mu);
    }
  });
});
