/* eslint-disable @typescript-eslint/naming-convention -- Environment variables retain their wire names. */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, readdir, utimes, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { promisify } from 'node:util';

import {
  computeClosureIntegrity,
  detectHostIndicators,
  parsePluginDeployment,
  selectVariant,
} from '@taucad/runtime/preparation/node';
import { validateGlbData } from '@taucad/runtime-testing';
import { afterEach, expect, test } from 'vitest';

import { desktopE2EPackagedExecutable } from '#support/config.js';
import { authenticatePackagedDesktop, launchDesktopApp, removeDesktopRoot } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import { gatewayFixtureFinalText, gatewayFixtureModelName, startGatewayFixture } from '#support/gateway-fixture.js';
import type { GatewayFixture } from '#support/gateway-fixture.js';
import {
  expectFirstNativeRender,
  firstNativeRenderMilliseconds,
  nativeKernelDownloadNotice,
} from '#support/prepared-kernels.js';
import { deleteTauTestUser, seedTauTestUser, tauTestAccount } from '#support/tau-account.js';
import {
  connectPickedFolder,
  expectCount,
  expectSignedIn,
  expectVisible,
  selectChatModel,
  selectKernel,
  submitPrompt,
  waitForProjectOnDisk,
} from '#support/scenario.js';

/**
 * Desktop first-use download (charter W6 phase 2, blueprint DS-C): the packaged app ships no kernel closure, so the
 * first Build123d model on an empty payload store refuses with `KERNEL_NOT_PREPARED`, and the viewer downloads the
 * kernel at once through main's preparation, shows its progress, and renders the model when it is ready. The closure
 * lands sealed in the store, free of the quarantine flag a browser-style download would leave; a second launch runs
 * it without downloading again, and its startup collection removes the garbage and keeps the closure.
 */

const workspaceRoot = resolvePath(import.meta.dirname, '../../..');
const cliBinPath = resolvePath(workspaceRoot, 'packages/cli/dist/bin/tau.mjs');
const desktopRequire = createRequire(resolvePath(workspaceRoot, 'apps/desktop/package.json'));
const execFileAsync = promisify(execFile);

const build123dSource = `from dataclasses import dataclass
from build123d import Box, Color, Compound, Location

@dataclass(frozen=True)
class Params:
    width: float = 20.0

def main(params: Params):
    left = Box(params.width, 8, 10)
    left.label = "Left"
    left.color = Color("royalblue")
    right = Box(params.width, 8, 10).moved(Location((params.width + 4, 0, 0)))
    right.label = "Right"
    right.color = Color("orange")
    assembly = Compound(children=[left, right])
    assembly.label = "Assembly"
    return assembly
`;

/** A sealed closure's receipt, as far as this spec reads it. */
type ClosureReceipt = {
  readonly package: string;
  readonly closureIntegrity: string;
};

/** Main's `native.gc` report: what the startup collection removed (`GarbageReport` in `@taucad/runtime`). */
type GarbageReport = {
  readonly dryRun: boolean;
  readonly closures: readonly string[];
  readonly staging: readonly string[];
  readonly links: readonly string[];
  readonly byteLength: number;
};

/** The JSON detail of one `desktop.log` line. */
const lineDetail = <T>(line: string): T => JSON.parse(line.slice(line.indexOf('{'))) as T;

/** The closure Build123d's `tau-plugin.json` pins for this host. */
const pinnedBuild123dClosure = async (): Promise<string> => {
  const indicators = detectHostIndicators();
  if (indicators === undefined) {
    throw new Error('This host selects no native variant.');
  }
  const deployment = parsePluginDeployment(
    JSON.parse(readFileSync(desktopRequire.resolve('@taucad/build123d/tau-plugin.json'), 'utf8')),
    '@taucad/build123d tau-plugin.json',
  );
  for (const variants of Object.values(deployment.dependencies)) {
    const selection = selectVariant(variants, indicators);
    if (selection.status === 'selected') {
      return computeClosureIntegrity(selection.variant.payloads);
    }
  }
  throw new Error('@taucad/build123d declares no variant for this host.');
};

/**
 * Leave in the store what startup collection exists to remove (D21): a link whose installation is gone, a sealed
 * closure only that link names, and a staging directory abandoned two days ago.
 * @returns The names the collection must report.
 */
const plantGarbage = async (
  store: string,
  root: string,
): Promise<{ link: string; closure: string; staging: string }> => {
  const closure = 'f'.repeat(64);
  const hostPath = join(root, 'uninstalled', 'Tau.app', 'Contents', 'MacOS', 'Tau');
  const link = `${createHash('sha256').update(hostPath).digest('hex')}.json`;
  await mkdir(join(store, 'closures', 'sha256', closure), { recursive: true });
  await writeFile(join(store, 'closures', 'sha256', closure, 'orphan.txt'), 'left by an uninstalled Tau\n');
  await mkdir(join(store, 'links'), { recursive: true });
  await writeFile(
    join(store, 'links', link),
    JSON.stringify({ schemaVersion: 1, hostPath, closures: { '@taucad/build123d python': closure } }),
  );
  const staging = 'prepare-abandoned';
  await mkdir(join(store, 'tmp', staging), { recursive: true });
  await writeFile(join(store, 'tmp', staging, 'partial.bin'), 'interrupted download\n');
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  await utimes(join(store, 'tmp', staging), twoDaysAgo, twoDaysAgo);
  return { link, closure, staging };
};

/** The sealed closure the store holds for `name`: its directory and its receipt. */
const storedClosureOf = async (
  closures: string,
  name: string,
): Promise<{ readonly root: string; readonly receipt: ClosureReceipt } | undefined> => {
  for (const key of await readdir(closures).catch(() => [])) {
    const root = join(closures, key);
    // oxlint-disable-next-line no-await-in-loop -- a few small receipts, read in order
    const text = await readFile(join(root, 'receipt.json'), 'utf8').catch(() => undefined);
    const receipt = text === undefined ? undefined : (JSON.parse(text) as ClosureReceipt);
    if (receipt?.package === name) {
      return { root, receipt };
    }
  }
  return undefined;
};

/** Read what this launch appended to `desktop.log`, from the byte offset the previous launches left it at. */
const launchLines = async (logPath: string, offset: number): Promise<readonly string[]> => {
  const log = new Uint8Array(await readFile(logPath).catch(() => new Uint8Array()));
  return new TextDecoder().decode(log.subarray(Math.min(offset, log.byteLength))).split('\n');
};

let session: DesktopSession | undefined;
let fixture: GatewayFixture | undefined;
let seededEmail: string | undefined;

afterEach(async () => {
  await session?.close();
  session = undefined;
  await fixture?.close();
  fixture = undefined;
  if (seededEmail) {
    await deleteTauTestUser(seededEmail);
    seededEmail = undefined;
  }
});

// 1200 s for two launches and a CLI export, plus `firstNativeRenderMilliseconds` for the download.
test('[completed-artifact] downloads Build123d on first use, renders the model, and keeps the sealed closure', async () => {
  const executable = desktopE2EPackagedExecutable();
  // The app ships no kernel closure: every native kernel comes from the store.
  expect(existsSync(resolvePath(dirname(executable), '../Resources/payloads'))).toBe(false);
  const pin = await pinnedBuild123dClosure();

  const account = tauTestAccount('first-use-download');
  seededEmail = account.email;
  const token = await seedTauTestUser(account);
  fixture = await startGatewayFixture({ targetFile: 'main.py', content: build123dSource });
  session = await launchDesktopApp({
    token,
    packaged: true,
    packagedExecutable: executable,
    preparedKernels: false,
    preserveProfile: true,
    env: { TAU_E2E_DISABLE_CREDENTIAL_PERSISTENCE: '1' },
  });
  const { configRoot, logPath } = session;
  const userData = dirname(configRoot);
  const store = join(configRoot, 'payloads');
  const closures = join(store, 'closures', 'sha256');
  try {
    expect(await readdir(closures).catch(() => [])).toEqual([]);
    const { page } = session;
    await fixture.routeThrough(page);
    await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
    await authenticatePackagedDesktop(session, token);
    await expectSignedIn(page);
    await selectKernel(page, 'Build123d');
    await connectPickedFolder(session);
    await selectChatModel(page, gatewayFixtureModelName);

    const slug = await submitPrompt(page, 'Create the labeled Build123d assembly.');
    const sourcePath = await waitForProjectOnDisk(session.pickedDirectory, slug, { extension: '.py' });
    await expect.poll(() => readFileSync(sourcePath, 'utf8'), { timeout: 120_000 }).toBe(build123dSource);
    await expectVisible(page.getByText(gatewayFixtureFinalText, { exact: true }), 420_000);

    // The viewer starts the download by itself and says what it is doing, with its progress and a way out.
    const notice = nativeKernelDownloadNotice(page);
    await expectVisible(notice, 180_000);
    expect(await notice.first().textContent()).toMatch(/^Downloading the build123d kernel runtime/u);
    await expectVisible(notice.getByRole('progressbar', { name: 'Download progress' }));
    await expectVisible(notice.getByRole('button', { name: 'Cancel', exact: true }));
    await expectCount(notice, 0, firstNativeRenderMilliseconds);
    await expectCount(page.getByRole('button', { name: 'Retry', exact: true }), 0);

    // Ready, the model renders again without anyone asking.
    await expectFirstNativeRender(page);
    await expectVisible(page.getByTestId('cad-viewer-canvas-region').locator('canvas'), 120_000);
    await expectCount(page.getByRole('alert', { name: 'CAD runtime error' }), 0);
    await page.keyboard.press('Control+a');
    await expectVisible(page.getByText('Model', { exact: true }), 30_000);
    await expectVisible(page.getByRole('button', { name: 'Left', exact: true }), 60_000);
    await expectVisible(page.getByRole('button', { name: 'Right', exact: true }), 60_000);

    // The closure is sealed in the store, as the manifest pins it, and nothing in it carries the quarantine flag.
    const prepared = await storedClosureOf(closures, '@taucad/build123d');
    expect(prepared?.receipt.closureIntegrity).toBe(pin);
    if (prepared === undefined) {
      throw new Error('The store holds no sealed Build123d closure.');
    }
    if (process.platform === 'darwin') {
      await expect(execFileAsync('xattr', ['-p', 'com.apple.quarantine', prepared.root])).rejects.toThrow();
      const { stdout } = await execFileAsync('xattr', ['-r', prepared.root], { maxBuffer: 256 * 1024 * 1024 });
      expect(stdout.split('\n').filter((line) => line.includes('com.apple.quarantine'))).toEqual([]);
    }
    const preparedKey = prepared.root.slice(closures.length + 1);
    await session.close();
    session = undefined;

    // A second launch runs the closure without downloading again, and its startup collection removes what an
    // uninstalled Tau and an interrupted download left behind, and nothing this installation uses.
    const garbage = await plantGarbage(store, userData);
    const earlierLog = await readFile(logPath).catch(() => new Uint8Array());
    const logOffset = earlierLog.byteLength;
    session = await launchDesktopApp({
      token,
      packaged: true,
      packagedExecutable: executable,
      preparedKernels: false,
      profileRoot: userData,
      preserveProfile: true,
      env: { TAU_E2E_DISABLE_CREDENTIAL_PERSISTENCE: '1' },
    });
    let garbageLine: string | undefined;
    await expect
      .poll(
        async () => {
          const lines = await launchLines(logPath, logOffset);
          garbageLine = lines.find((line) => / native\.gc /u.test(line));
          return garbageLine !== undefined;
        },
        { timeout: 240_000 },
      )
      .toBe(true);
    const relaunch = await launchLines(logPath, logOffset);
    const storeLine = relaunch.find((line) => / native\.store /u.test(line));
    expect(storeLine === undefined ? undefined : lineDetail<{ kernels?: string[] }>(storeLine).kernels).toContain(
      'build123d',
    );
    expect(relaunch.filter((line) => / native\.prepare /u.test(line))).toEqual([]);
    const report = lineDetail<GarbageReport>(garbageLine ?? '');
    expect(report).toMatchObject({
      dryRun: false,
      closures: [garbage.closure],
      links: [garbage.link],
      staging: [garbage.staging],
    });
    expect(report.byteLength).toBeGreaterThan(0);
    expect(existsSync(join(closures, garbage.closure))).toBe(false);
    expect(existsSync(join(store, 'links', garbage.link))).toBe(false);
    expect(existsSync(join(store, 'tmp', garbage.staging))).toBe(false);
    expect(existsSync(join(closures, preparedKey, 'receipt.json'))).toBe(true);
    await session.close();
    session = undefined;

    // Every Tau host on the machine shares the store: the CLI evaluates `.py` from the closure the app downloaded,
    // with a closed mirror and no fallback, so nothing else could supply it.
    expect(existsSync(cliBinPath), `${cliBinPath} is built by cli:build`).toBe(true);
    const project = join(userData, 'cli-project');
    await mkdir(project, { recursive: true });
    const input = join(project, 'main.py');
    const output = join(userData, 'model.glb');
    await writeFile(input, build123dSource);
    await execFileAsync(
      process.execPath,
      ['--import', '@oxc-node/core/register', cliBinPath, 'export', input, '--ext=glb', `--output=${output}`, '--json'],
      {
        cwd: workspaceRoot,
        env: {
          HOME: userData,
          PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
          TMPDIR: `${userData}/`,
          TAU_CONFIG_DIR: configRoot,
          TAU_PAYLOAD_MIRROR: 'http://127.0.0.1:1',
          TAU_PAYLOAD_MIRROR_NO_FALLBACK: '1',
          TAU_SECRET_VAULT: 'file',
          NX_PREFER_NODE_STRIP_TYPES: 'true',
        },
        maxBuffer: 64 * 1024 * 1024,
        timeout: 240_000,
      },
    );
    validateGlbData(new Uint8Array(await readFile(output)));
  } catch (error) {
    await session?.capture('first-use-download-failure');
    throw error;
  } finally {
    await session?.close();
    session = undefined;
    await removeDesktopRoot(userData);
  }
}, 1_800_000);
