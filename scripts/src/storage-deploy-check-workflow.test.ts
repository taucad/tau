import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

/* eslint-disable @typescript-eslint/naming-convention -- environment variable names and Fly's JSON keys are exact external names. */

/*
 * Runs `deploy.yml`'s storage check against a stubbed `flyctl`. A storage deploy must leave tau-api's
 * Machines untouched (DC1), but deploy queues are per app, so another push's API deploy can land during
 * it; that failed 6 of 36 staging storage deploys (CI audit 2026-11-12, F17). The check now passes a
 * change a tau-api release made since the snapshot accounts for, and still fails a non-API image on a
 * tau-api Machine or a change with no release behind it.
 */

const root = resolve(import.meta.dirname, '../..');
type Step = { readonly name?: string; readonly run?: string };
const deploy = load(readFileSync(resolve(root, '.github/workflows/deploy.yml'), 'utf8')) as {
  readonly jobs: { readonly deploy: { readonly steps: readonly Step[] } };
};
const script = (name: string): string => deploy.jobs.deploy.steps.find((step) => step.name === name)?.run ?? '';
const snapshot = script('Snapshot the API Machines before a storage deploy');
const verify = script('Verify the storage app is private and the API untouched');

const api = 'tau-api-staging';
const machine = (id: string, instance: string, image = `registry.fly.io/${api}:aaaa`) => ({
  id,
  instance_id: instance,
  config: { image },
});
const before = [machine('m1', 'i1'), machine('m2', 'i2')];

type Scenario = {
  readonly after: readonly unknown[];
  readonly releases?: readonly unknown[];
};

const run = ({ after, releases = [] }: Scenario) => {
  const directory = mkdtempSync(join(tmpdir(), 'tau-storage-check-'));
  try {
    const output = join(directory, 'output');
    writeFileSync(join(directory, 'before.json'), JSON.stringify(before));
    writeFileSync(join(directory, 'after.json'), JSON.stringify(after));
    writeFileSync(join(directory, 'releases.json'), JSON.stringify(releases));
    writeFileSync(join(directory, 'storage.json'), JSON.stringify([{ id: 's1', state: 'started' }]));
    writeFileSync(join(directory, 'ips.json'), JSON.stringify([{ Type: 'private_v6' }]));
    writeFileSync(join(directory, 'phase'), 'before');
    writeFileSync(
      join(directory, 'flyctl'),
      [
        '#!/bin/sh',
        'case "$*" in',
        '  "ips list"*) cat "$STUBS/ips.json" ;;',
        `  "machines list --app ${api} --json") cat "$STUBS/$(cat "$STUBS/phase").json" ;;`,
        '  "machines list"*) cat "$STUBS/storage.json" ;;',
        '  "releases"*) cat "$STUBS/releases.json" ;;',
        '  *) echo "unexpected flyctl $*" >&2; exit 2 ;;',
        'esac',
        '',
      ].join('\n'),
      { mode: 0o700 },
    );
    const env = {
      ...process.env,
      PATH: `${directory}:${process.env['PATH'] ?? ''}`,
      STUBS: directory,
      RUNNER_TEMP: directory,
      FLY_APP: 'tau-storage-staging',
      API_APP: api,
      FLY_API_TOKEN: 'read',
      FLY_STORAGE_TOKEN: 'storage',
      FLY_API_READ_TOKEN: 'read',
      GITHUB_OUTPUT: output,
    };
    const first = spawnSync('bash', ['-c', snapshot], { encoding: 'utf8', env });
    expect(first.status, first.stderr).toBe(0);
    writeFileSync(join(directory, 'phase'), 'after');
    const since = readFileSync(join(directory, 'api-machines-before.at'), 'utf8').trim();
    // A release the stub reports one second after the snapshot, or one from an hour before it.
    const stamp = (offsetSeconds: number): string =>
      new Date(Date.parse(`${since}Z`) + offsetSeconds * 1000).toISOString();
    writeFileSync(
      join(directory, 'releases.json'),
      JSON.stringify(
        releases.map((release) => {
          const { offset, ...rest } = release as { offset: number };
          return { ...rest, CreatedAt: stamp(offset) };
        }),
      ),
    );
    const result = spawnSync('bash', ['-c', verify], { encoding: 'utf8', env });
    return { status: result.status, out: `${result.stdout}${result.stderr}` };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

describe('storage deploy check of the API Machines', () => {
  it('should pass when the API Machines are unchanged', () => {
    const { status, out } = run({ after: before });
    expect(status, out).toBe(0);
    expect(out).toContain('API Machines unchanged: 2');
  });

  it('should pass, naming the release, when an API release made during the deploy changed them', () => {
    const after = [
      machine('m1', 'i3', `registry.fly.io/${api}:bbbb`),
      machine('m3', 'i4', `registry.fly.io/${api}:bbbb`),
    ];
    const { status, out } = run({ after, releases: [{ Version: 42, Status: 'complete', offset: 1 }] });
    expect(status, out).toBe(0);
    expect(out).toContain('release(s) v42 (complete)');
  });

  it('should fail when the Machines changed and no API release since the snapshot accounts for it', () => {
    const after = [machine('m1', 'i3'), machine('m2', 'i2')];
    const { status, out } = run({ after, releases: [{ Version: 41, Status: 'complete', offset: -3600 }] });
    expect(status, out).toBe(1);
    expect(out).toContain('no tau-api-staging release since');
  });

  it('should fail when a tau-api Machine runs an image from outside the API repository, release or not', () => {
    const after = [machine('m1', 'i3', 'registry.fly.io/tau-storage-staging:aaaa'), machine('m2', 'i2')];
    const { status, out } = run({ after, releases: [{ Version: 42, Status: 'complete', offset: 1 }] });
    expect(status, out).toBe(1);
    expect(out).toContain('Machine(s) m1 run an image from outside registry.fly.io/tau-api-staging');
  });
});

/* eslint-enable @typescript-eslint/naming-convention -- end of the external names. */
