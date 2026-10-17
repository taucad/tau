/* oxlint-disable no-await-in-loop -- The diagnostics log is polled sequentially until main reports. */
/* eslint-disable @typescript-eslint/naming-convention -- Environment variables retain their wire names. */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import {
  appendFile,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve as resolvePath } from 'node:path';
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
import { launchDesktopApp, removeDesktopRoot } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import { expectVisible } from '#support/scenario.js';

/**
 * Charter W6 phase 1 (D10, D24, ruling X30): the packaged app seeds the payload store from the sealed closures it
 * ships under `Contents/Resources/payloads`, by clonefile, with no network. The mirror is a closed port and the
 * fallback is off, so a closure that did not come from the app could not be prepared at all.
 */

const workspaceRoot = resolvePath(import.meta.dirname, '../../..');
const cliBinPath = resolvePath(workspaceRoot, 'packages/cli/dist/bin/tau.mjs');
const desktopRequire = createRequire(resolvePath(workspaceRoot, 'apps/desktop/package.json'));
/** How long one launch may take to seed and collect the store before the spec gives up on it. */
const launchDeadlineMilliseconds = 240_000;

type SeedOutcome = {
  readonly package: string;
  readonly dependency: string;
  readonly closureIntegrity?: string;
  readonly status: string;
  readonly copy?: string;
  readonly files?: readonly string[];
  readonly message?: string;
};

/** Main's `native.gc` report: what the startup collection removed (`GarbageReport` in `@taucad/runtime`). */
type GarbageReport = {
  readonly dryRun: boolean;
  readonly closures: readonly string[];
  readonly staging: readonly string[];
  readonly links: readonly string[];
  readonly byteLength: number;
};

/** What a launch logged about the store: its seeding outcomes and its garbage collection. */
type StoreLaunch = {
  readonly seeding: readonly SeedOutcome[];
  readonly garbage: GarbageReport;
  readonly lines: readonly string[];
};

/** The JSON detail of one `desktop.log` line. */
const lineDetail = <T>(line: string): T => JSON.parse(line.slice(line.indexOf('{'))) as T;

/**
 * Leave in the store what startup collection exists to remove (D21): a link whose installation is gone, a sealed
 * closure only that link names, and a staging directory abandoned two days ago.
 * @returns The names the collection must report.
 */
const plantGarbage = async (
  store: string,
  runRoot: string,
): Promise<{ link: string; closure: string; staging: string }> => {
  const closure = 'f'.repeat(64);
  const hostPath = join(runRoot, 'uninstalled', 'Tau.app', 'Contents', 'MacOS', 'Tau');
  const link = `${createHash('sha256').update(hostPath).digest('hex')}.json`;
  await mkdir(join(store, 'closures', 'sha256', closure), { recursive: true });
  await writeFile(join(store, 'closures', 'sha256', closure, 'orphan.txt'), 'left by an uninstalled Tau\n');
  await writeFile(
    join(store, 'links', link),
    JSON.stringify({ schemaVersion: 1, hostPath, closures: { '@taucad/build123d python': closure } }),
  );
  const staging = 'seed-abandoned';
  await mkdir(join(store, 'tmp', staging), { recursive: true });
  await writeFile(join(store, 'tmp', staging, 'partial.bin'), 'interrupted copy\n');
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  await utimes(join(store, 'tmp', staging), twoDaysAgo, twoDaysAgo);
  return { link, closure, staging };
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

/** Write a piece of evidence beside the run's other logs, when the workflow names a directory for it. */
const recordEvidence = async (evidence: string | undefined, name: string, content: string): Promise<void> => {
  if (evidence !== undefined) {
    await mkdir(evidence, { recursive: true });
    await writeFile(join(evidence, name), content);
  }
};

/**
 * Launch the packaged app until main has seeded the store and collected it, then stop it; returns what it logged.
 * The app is stopped with `app.exit`, as the suite's fixture does: `close()` quits through the renderer's quit hold,
 * which a window that never signed in can leave waiting. Whatever happens, the app's output and `desktop.log` are kept
 * as evidence under `label`.
 */
const launchUntilCollected = async ({
  executable,
  userData,
  environment,
  evidence,
  label,
}: {
  readonly executable: string;
  readonly userData: string;
  readonly environment: Record<string, string>;
  readonly evidence: string | undefined;
  readonly label: string;
}): Promise<StoreLaunch> => {
  const logPath = join(userData, 'logs/desktop.log');
  const readLog = async (): Promise<Uint8Array<ArrayBuffer>> => {
    try {
      return new Uint8Array(await readFile(logPath));
    } catch {
      return new Uint8Array();
    }
  };
  /* Every launch of this profile appends to one `desktop.log`: only what this launch wrote is its report. */
  const earlierLog = await readLog();
  const logOffset = earlierLog.byteLength;
  const started = performance.now();
  const output: string[] = [];
  let collected = false;
  const application = await electron.launch({
    executablePath: executable,
    args: [`--user-data-dir=${userData}`],
    cwd: userData,
    env: environment,
    timeout: 120_000,
  });
  const child = application.process();
  child.stdout?.on('data', (chunk: unknown) => output.push(String(chunk)));
  child.stderr?.on('data', (chunk: unknown) => output.push(String(chunk)));
  try {
    const deadline = Date.now() + launchDeadlineMilliseconds;
    for (;;) {
      const log = await readLog();
      const lines = new TextDecoder().decode(log.byteLength < logOffset ? log : log.subarray(logOffset)).split('\n');
      const failure = lines.find((line) => / native\.store /u.test(line));
      if (failure !== undefined) {
        throw new Error(`Main could not open the payload store: ${failure}`);
      }
      const seedLine = lines.find((line) => / native\.seed /u.test(line));
      const garbageLine = lines.find((line) => / native\.gc /u.test(line));
      if (seedLine !== undefined && garbageLine !== undefined) {
        const detail = lineDetail<{ seeding: SeedOutcome[] }>(seedLine);
        console.info(
          'STORE SEED',
          label,
          JSON.stringify({ elapsedMilliseconds: Math.round(performance.now() - started) }),
        );
        collected = true;
        return {
          seeding: detail.seeding,
          garbage: lineDetail<GarbageReport>(garbageLine),
          lines: lines.filter((line) => / native\./u.test(line)),
        };
      }
      if (Date.now() > deadline) {
        throw new Error(
          `Main reported no seeding within ${launchDeadlineMilliseconds / 1000} s:\n${lines.slice(-40).join('\n')}`,
        );
      }
      await new Promise((resolve) => {
        setTimeout(resolve, 500);
      });
    }
  } finally {
    const exited =
      child.exitCode === null && child.signalCode === null
        ? new Promise<void>((resolve) => {
            child.once('exit', () => {
              resolve();
            });
          })
        : Promise.resolve();
    await Promise.race([
      application
        .evaluate(({ app }) => {
          app.exit(0);
        })
        .catch(() => undefined),
      new Promise((resolve) => {
        setTimeout(resolve, 5000);
      }),
    ]);
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
    }
    await exited;
    const desktopLog = await readFile(logPath, 'utf8').catch(() => '(no desktop.log)');
    await recordEvidence(evidence, `${label}.desktop.log`, desktopLog);
    await recordEvidence(evidence, `${label}.output.log`, output.join(''));
    if (!collected) {
      /* The job log is the evidence a reader can always reach. */
      console.info(
        'STORE SEED FAILURE',
        label,
        `\n--- desktop.log (tail) ---\n${desktopLog.split('\n').slice(-60).join('\n')}`,
        `\n--- process output (tail) ---\n${output.join('').slice(-6000)}`,
      );
    }
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
      /* As the suite's fixture runs the app: secrets in the throwaway profile, never a login keychain this HOME lacks,
       * and no window on screen. */
      TAU_SECRET_VAULT: 'file',
      TAU_E2E_HIDE_WINDOW: '1',
      TAU_E2E_KEEP_PATH: '1',
    };
    const pins = await pinnedClosures();
    const shippedEntries = await readdir(shipped);
    const shippedKeys = shippedEntries.toSorted();

    const first = await launchUntilCollected({ executable, userData, environment, evidence, label: 'first-launch' });

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

    // A second launch finds every closure ready and copies nothing, and its startup collection removes what an
    // uninstalled Tau and an interrupted copy left behind, and nothing this installation links.
    const garbage = await plantGarbage(store, runRoot);
    const second = await launchUntilCollected({ executable, userData, environment, evidence, label: 'second-launch' });
    expect(second.garbage).toMatchObject({
      dryRun: false,
      closures: [garbage.closure],
      links: [garbage.link],
      staging: [garbage.staging],
    });
    expect(second.garbage.byteLength).toBeGreaterThan(0);
    expect(existsSync(join(store, 'closures', 'sha256', garbage.closure))).toBe(false);
    expect(existsSync(join(store, 'links', garbage.link))).toBe(false);
    expect(existsSync(join(store, 'tmp', garbage.staging))).toBe(false);
    expect(await readdir(join(store, 'links'))).toHaveLength(1);
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
      {
        cwd: workspaceRoot,
        env: { ...environment, NX_PREFER_NODE_STRIP_TYPES: 'true' },
        maxBuffer: 64 * 1024 * 1024,
        timeout: 240_000,
      },
    );
    validateGlbData(new Uint8Array(await readFile(output)));

    await recordEvidence(
      evidence,
      'store-seed.json',
      `${JSON.stringify({ pins, shippedKeys, first, second, export: exported.stdout.trim() }, undefined, 2)}\n`,
    );
  } finally {
    await rm(runRoot, { recursive: true, force: true });
  }
}, 900_000);

/** A bundled closure's receipt, as far as this spec reads it. */
type BundledReceipt = {
  readonly package: string;
  readonly files: ReadonlyArray<{ readonly path: string; readonly byteLength: number }>;
};

/** The closure the app bundles for `name`: its directory and its receipt. */
const bundledClosureOf = async (
  closures: string,
  name: string,
): Promise<{ readonly root: string; readonly receipt: BundledReceipt }> => {
  for (const key of await readdir(closures)) {
    const root = join(closures, key);
    const receipt = JSON.parse(await readFile(join(root, 'receipt.json'), 'utf8')) as BundledReceipt;
    if (receipt.package === name) {
      return { root, receipt };
    }
  }
  throw new Error(`The app bundles no closure for ${name}.`);
};

test('[completed-artifact] refuses a damaged bundled closure, installs nothing from it, and names the damage when a .py opens', async () => {
  const executable = desktopE2EPackagedExecutable();
  const runRoot = await realpath(await mkdtemp(join(tmpdir(), 'tau-store-refusal-')));
  let session: DesktopSession | undefined;
  try {
    /* A clone of the app (APFS, so no new blocks) with one byte added to one bundled build123d file: the damage a
     * disk error or a hand edit would leave. The app's own signature is not what refuses it; seeding is. */
    const copy = join(runRoot, 'Tau.app');
    await promisify(execFile)('/bin/cp', ['-c', '-R', resolvePath(executable, '../../..'), copy]);
    const { root, receipt } = await bundledClosureOf(
      join(copy, 'Contents/Resources/payloads/closures/sha256'),
      '@taucad/build123d',
    );
    const [damaged] = receipt.files
      .filter(({ path, byteLength }) => path.endsWith('.py') && byteLength > 0)
      .toSorted((left, right) => left.byteLength - right.byteLength);
    if (damaged === undefined) {
      throw new Error('The bundled build123d closure lists no Python source to damage.');
    }
    await chmod(join(root, damaged.path), 0o644);
    await appendFile(join(root, damaged.path), '\n# damaged after sealing\n');

    session = await launchDesktopApp({
      token: 'unused',
      packaged: true,
      packagedExecutable: join(copy, 'Contents/MacOS/Tau'),
      useProductionEndpointDefaults: true,
      env: {
        TAU_E2E_DISABLE_CREDENTIAL_PERSISTENCE: '1',
        /* Nothing may stand in for the refused closure: a closed mirror and no fallback. */
        TAU_PAYLOAD_MIRROR: 'http://127.0.0.1:1',
        TAU_PAYLOAD_MIRROR_NO_FALLBACK: '1',
      },
    });
    const { logPath, page } = session;
    let seeding: readonly SeedOutcome[] | undefined;
    await expect
      .poll(
        async () => {
          const log = await readFile(logPath, 'utf8').catch(() => '');
          const line = log.split('\n').find((candidate) => / native\.seed /u.test(candidate));
          seeding = line === undefined ? undefined : lineDetail<{ seeding: SeedOutcome[] }>(line).seeding;
          return seeding !== undefined;
        },
        { timeout: launchDeadlineMilliseconds },
      )
      .toBe(true);
    const build123d = seeding?.find((outcome) => outcome.package === '@taucad/build123d');
    expect(build123d).toMatchObject({ status: 'refused', files: [damaged.path] });
    expect(build123d?.message).toBe(
      `The @taucad/build123d closure in this app differs from its receipt (${damaged.path}); it was not installed. Reinstall Tau.`,
    );
    expect(seeding?.find((outcome) => outcome.package === '@taucad/picogk')).toMatchObject({ status: 'seeded' });
    const store = join(dirname(session.homeRoot), 'config', 'payloads');
    const sealed = await readdir(join(store, 'closures', 'sha256'));
    expect(sealed).not.toContain(basename(root));
    expect(await readdir(join(store, 'tmp')).catch(() => [])).toEqual([]);

    // The refusal reaches the person where they meet it: a .py they open names the damage and the remedy.
    const project = join(runRoot, 'project');
    await mkdir(project);
    await writeFile(join(project, 'main.py'), model);
    await page.goto('app://tau/import', { waitUntil: 'domcontentloaded' });
    await page
      .locator('input[type="file"][accept]')
      .last()
      .setInputFiles([join(project, 'main.py')]);
    await expectVisible(page.getByText('Review import', { exact: true }), 60_000);
    const alert = page.getByRole('alert', { name: 'CAD runtime error' }).first();
    await expect
      .poll(async () => ((await alert.count()) > 0 ? ((await alert.textContent()) ?? '') : ''), { timeout: 180_000 })
      .toContain(`differs from its receipt (${damaged.path})`);
    expect(await alert.textContent()).toContain('Reinstall Tau.');
  } catch (error) {
    await session?.capture('store-refusal-failure');
    throw error;
  } finally {
    await session?.close();
    await removeDesktopRoot(runRoot);
  }
}, 600_000);
