/* oxlint-disable no-await-in-loop -- The diagnostics log is polled sequentially until main reports. */
/* eslint-disable @typescript-eslint/naming-convention -- Environment variables retain their wire names. */
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { promisify } from 'node:util';

import {
  computeClosureIntegrity,
  detectHostIndicators,
  parsePluginDeployment,
  selectVariant,
} from '@taucad/runtime/preparation/node';
import { validateGlbData } from '@taucad/runtime-testing';
import { _electron as electron } from 'playwright';
import { expect, test } from 'vitest';

import { desktopE2EPackagedExecutable } from '#support/config.js';

/**
 * Charter W6 phase 1 (D10, D24, ruling X30): the packaged app seeds the payload store from the sealed closures it
 * ships under `Contents/Resources/payloads`, by clonefile, with no network. The mirror is a closed port and the
 * fallback is off, so a closure that did not come from the app could not be prepared at all.
 */

const workspaceRoot = resolvePath(import.meta.dirname, '../../..');
const cliBinPath = resolvePath(workspaceRoot, 'packages/cli/dist/bin/tau.mjs');
const desktopRequire = createRequire(resolvePath(workspaceRoot, 'apps/desktop/package.json'));

type SeedOutcome = {
  readonly package: string;
  readonly dependency: string;
  readonly closureIntegrity?: string;
  readonly status: string;
  readonly copy?: string;
};

const model = `from dataclasses import dataclass

from build123d import Box


@dataclass(frozen=True)
class Params:
    width: float = 10.0


def main(params: Params):
    return Box(params.width, 20, 30)
`;

/** The closure each native kernel's `tau-plugin.json` pins for this Mac, keyed by package. */
const pinnedClosures = async (): Promise<Record<string, string>> => {
  const indicators = detectHostIndicators();
  if (indicators === undefined) {
    throw new Error('This host selects no native variant.');
  }
  const pins: Record<string, string> = {};
  for (const name of ['@taucad/build123d', '@taucad/picogk']) {
    const deployment = parsePluginDeployment(
      JSON.parse(readFileSync(desktopRequire.resolve(`${name}/tau-plugin.json`), 'utf8')),
      `${name} tau-plugin.json`,
    );
    for (const variants of Object.values(deployment.dependencies)) {
      const selection = selectVariant(variants, indicators);
      if (selection.status === 'selected') {
        pins[name] = await computeClosureIntegrity(selection.variant.payloads);
      }
    }
  }
  return pins;
};

/** Launch the packaged app until main has seeded the store and collected it, then quit; returns what it logged. */
const launchUntilCollected = async (
  executable: string,
  userData: string,
  environment: Record<string, string>,
): Promise<{ readonly seeding: readonly SeedOutcome[]; readonly lines: readonly string[] }> => {
  const logPath = join(userData, 'logs/desktop.log');
  const application = await electron.launch({
    executablePath: executable,
    args: [`--user-data-dir=${userData}`],
    cwd: userData,
    env: environment,
  });
  try {
    const deadline = Date.now() + 300_000;
    for (;;) {
      const text = await readFile(logPath, 'utf8').catch(() => '');
      const lines = text.split('\n');
      const failure = lines.find((line) => / native\.store /u.test(line));
      if (failure !== undefined) {
        throw new Error(`Main could not open the payload store: ${failure}`);
      }
      const seedLine = lines.find((line) => / native\.seed /u.test(line));
      if (seedLine !== undefined && lines.some((line) => / native\.gc /u.test(line))) {
        const detail = JSON.parse(seedLine.slice(seedLine.indexOf('{'))) as { seeding: SeedOutcome[] };
        return { seeding: detail.seeding, lines: lines.filter((line) => / native\./u.test(line)) };
      }
      if (Date.now() > deadline) {
        throw new Error(`Main reported no seeding within 300 s:\n${lines.slice(-40).join('\n')}`);
      }
      await new Promise((resolve) => {
        setTimeout(resolve, 500);
      });
    }
  } finally {
    await application.close();
  }
};

test('[completed-artifact] seeds the payload store from the app offline, copies nothing again, and evaluates .py from it', async () => {
  const executable = desktopE2EPackagedExecutable();
  const shipped = resolvePath(dirname(executable), '../Resources/payloads/closures/sha256');
  const runRoot = await realpath(await mkdtemp(join(tmpdir(), 'tau-store-seed-')));
  const evidence = process.env['TAU_E2E_STORE_SEED_EVIDENCE'];
  try {
    const config = join(runRoot, 'config');
    const store = join(config, 'payloads');
    const userData = join(runRoot, 'user-data');
    await mkdir(userData, { recursive: true });
    const environment: Record<string, string> = {
      HOME: runRoot,
      PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
      TMPDIR: `${runRoot}/`,
      TAU_CONFIG_DIR: config,
      TAU_PAYLOAD_MIRROR: 'http://127.0.0.1:1',
      TAU_PAYLOAD_MIRROR_NO_FALLBACK: '1',
    };
    const pins = await pinnedClosures();
    const shippedEntries = await readdir(shipped);
    const shippedKeys = shippedEntries.toSorted();

    const first = await launchUntilCollected(executable, userData, environment);

    // Every closure this Mac selects was seeded by clone from the app, and its receipt names the manifest's pins.
    const firstSelected = first.seeding.filter(({ status }) => status !== 'unsupported');
    expect(
      firstSelected.map(({ package: name, status, copy, closureIntegrity }) => ({
        name,
        status,
        copy,
        closureIntegrity,
      })),
    ).toEqual(
      Object.entries(pins).map(([name, closureIntegrity]) => ({
        name,
        status: 'seeded',
        copy: 'clone',
        closureIntegrity,
      })),
    );
    const storedEntries = await readdir(join(store, 'closures', 'sha256'));
    const storedKeys = storedEntries.toSorted();
    expect(storedKeys).toEqual(shippedKeys);
    for (const key of storedKeys) {
      const receipt = JSON.parse(await readFile(join(store, 'closures', 'sha256', key, 'receipt.json'), 'utf8')) as {
        readonly package: string;
        readonly closureIntegrity: string;
      };
      expect(receipt.closureIntegrity).toBe(pins[receipt.package]);
    }
    expect(await readdir(join(store, 'tmp'))).toEqual([]);
    expect(await readdir(join(store, 'links'))).toHaveLength(1);

    // A second launch finds every closure ready and copies nothing.
    const second = await launchUntilCollected(executable, userData, environment);
    expect(second.seeding.filter(({ status }) => status !== 'unsupported').map(({ status }) => status)).toEqual(
      Object.keys(pins).map(() => 'present'),
    );
    const relaunchedEntries = await readdir(join(store, 'closures', 'sha256'));
    expect(relaunchedEntries.toSorted()).toEqual(shippedKeys);

    // The first `.py` evaluation runs from the seeded closure: the closed mirror means nothing else could supply it.
    expect(existsSync(cliBinPath), `${cliBinPath} is built by cli:build`).toBe(true);
    await mkdir(join(runRoot, 'project'));
    const input = join(runRoot, 'project', 'main.py');
    const output = join(runRoot, 'model.glb');
    await writeFile(input, model);
    const exported = await promisify(execFile)(
      process.execPath,
      ['--import', '@oxc-node/core/register', cliBinPath, 'export', input, '--ext=glb', `--output=${output}`, '--json'],
      { cwd: workspaceRoot, env: { ...environment, NX_PREFER_NODE_STRIP_TYPES: 'true' }, maxBuffer: 64 * 1024 * 1024 },
    );
    validateGlbData(new Uint8Array(await readFile(output)));

    if (evidence !== undefined) {
      await mkdir(evidence, { recursive: true });
      await writeFile(
        join(evidence, 'store-seed.json'),
        `${JSON.stringify({ pins, shippedKeys, first, second, export: exported.stdout.trim() }, undefined, 2)}\n`,
      );
    }
  } finally {
    await rm(runRoot, { recursive: true, force: true });
  }
});
