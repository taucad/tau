/* eslint-disable @typescript-eslint/naming-convention -- Environment variables retain their wire names. */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import type { Locator, Page } from 'playwright';
import { getBoundingBoxFromInspect, getInspectReport, validateGlbData } from '@taucad/runtime-testing';
import type { TauSceneManifest } from '@taucad/runtime/types';

import { authenticatePackagedDesktop, launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import { gatewayFixtureFinalText, gatewayFixtureModelName, installGatewayFixture } from '#support/gateway-fixture.js';
import type { GatewayFixture } from '#support/gateway-fixture.js';
import { deleteTauTestUser, seedTauTestUser, tauTestAccount } from '#support/tau-account.js';
import {
  connectPickedFolder,
  declineCookieBanner,
  ensureFilesPane,
  expectCount,
  expectGeometryFramed,
  expectSignedIn,
  expectVisible,
  fileTreeItemOf,
  geometryCacheEntries,
  geometryCacheSnapshot,
  parameterCacheContents,
  selectChatModel,
  selectKernel,
  submitPrompt,
  waitForProjectOnDisk,
} from '#support/scenario.js';

const build123dSource = `from dataclasses import dataclass
from build123d import Box, Color, Compound, Location

@dataclass(frozen=True)
class Params:
    width: float = 20.0
    depth: float = 8.0
    height: float = 10.0
    gap: float = 4.0

def main(params: Params):
    left = Box(params.width, params.depth, params.height)
    left.label = "Left"
    left.color = Color("royalblue")
    right = Box(params.width, params.depth, params.height).moved(Location((params.width + params.gap, 0, 0)))
    right.label = "Right"
    right.color = Color("orange")
    assembly = Compound(children=[left, right])
    assembly.label = "Assembly"
    return assembly
`;

const replicadSource = `import { makeCylinder } from 'replicad';

export const defaultParams = {
  radius: 10,
  height: 24,
};

export default function main(params = defaultParams) {
  return makeCylinder(params.radius, params.height);
}
`;

const failureSentinel = 'desktop CAD failure parity sentinel';
const failingBuild123dSource = `from dataclasses import dataclass

@dataclass(frozen=True)
class Params:
    width: float = 20.0

def main(params: Params):
    raise RuntimeError(${JSON.stringify(failureSentinel)})
`;

const dependentSource = `from dataclasses import dataclass
from build123d import Box, Color, Compound, Location
from dimensions import depth

__tau__ = {"dependencies": ["dimensions.py"]}

@dataclass(frozen=True)
class Params:
    width: float = 20.0
    height: float = 10.0
    gap: float = 4.0

def main(params: Params):
    left = Box(params.width, depth(), params.height)
    left.label = "Left"
    left.color = Color("royalblue")
    right = Box(params.width, depth(), params.height).moved(Location((params.width + params.gap, 0, 0)))
    right.label = "Right"
    right.color = Color("orange")
    assembly = Compound(children=[left, right])
    assembly.label = "Assembly"
    return assembly
`;

const picogkSource = `using System.ComponentModel.DataAnnotations;
using System.Numerics;
using PicoGK;
Library.Go(Params.VoxelSizeMm, () =>
{
    var radius = Params.RadiusMm;
    Library.oViewer().SetGroupMaterial(0, "3159cf", 0f, 0.7f);
    Library.oViewer().SetGroupMaterial(1, "f2b134", 0f, 0.7f);
    Library.oViewer().Add(Utils.mshCreateCube(new Vector3(radius, radius * 0.5f, radius * 0.25f)), 0);
    Library.oViewer().Add(Voxels.voxSphere(new Vector3(radius * 2f, 0, 0), radius * 0.5f), 1);
});

public static class Params
{
    [Range(0.05, 5.0)]
    [Display(Name = "Voxel size", Order = 0)]
    public static float VoxelSizeMm { get; set; } = 1f;

    [Range(1.0, 100.0)]
    [Display(Name = "Radius", Order = 1)]
    public static float RadiusMm { get; set; } = 12f;
}
`;

const picogkDependentSource = `using PicoGK;
Library.Go(1f, () => ShapeFactory.Build(12f));
`;

const picogkHelperSource = (offset: number): string => `using System.Globalization;
using System.IO;
using System.Numerics;
using PicoGK;

public static class ShapeFactory
{
    public static void Build(float radius)
    {
        var scale = float.Parse(File.ReadAllText("radius-scale.txt"), CultureInfo.InvariantCulture);
        Library.oViewer().SetGroupMaterial(0, "3159cf", 0f, 0.7f);
        Library.oViewer().SetGroupMaterial(1, "f2b134", 0f, 0.7f);
        Library.oViewer().Add(Utils.mshCreateCube(new Vector3(radius, radius * 0.5f, radius * 0.25f)), 0);
        Library.oViewer().Add(Voxels.voxSphere(new Vector3(radius * ${String(offset)}f, 0, 0), radius * scale), 1);
    }
}
`;

const picogkRuntimeFailure = 'PicoGK packaged runtime failure sentinel';
const failingPicogkRuntimeSource = `using PicoGK;
Library.Go(1f, () => throw new System.InvalidOperationException("${picogkRuntimeFailure}"));
`;
const slowPicogkSource = `using System.Numerics;
using PicoGK;
Library.Go(1f, () =>
{
    System.Threading.Thread.Sleep(30000);
    Library.oViewer().Add(Voxels.voxSphere(Vector3.Zero, 12f));
});
`;

const progressivePicogkSource = `using System.Numerics;
using System.Threading;
using PicoGK;
Library.Go(1f, () =>
{
    Library.oViewer().Add(Utils.mshCreateCube(new Vector3(12f, 6f, 3f)), 0);
    Thread.Sleep(1500);
    Library.oViewer().Add(Voxels.voxSphere(new Vector3(24f, 0, 0), 6f), 1);
    Thread.Sleep(8000);
});
`;

const workspaceRoot = resolve(import.meta.dirname, '../../..');

type NativeWorker = {
  readonly pid: number;
  readonly temporaryRoot: string;
};

const nativeWorkers = (): readonly NativeWorker[] => {
  if (process.platform === 'win32') {
    return [];
  }
  const result = spawnSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
  const workerCommand = /^\s*(\d+)\s+.*\/worker\.py --workspace (\S+) --artifacts (\S+) --parent-pid \d+$/u;
  return result.stdout.split('\n').flatMap((line) => {
    const match = workerCommand.exec(line);
    const pid = match?.[1];
    const workspace = match?.[2];
    const artifacts = match?.[3];
    if (!pid || !workspace || !artifacts || dirname(workspace) !== dirname(artifacts)) {
      return [];
    }
    return [{ pid: Number(pid), temporaryRoot: dirname(workspace) }];
  });
};

const picogkWorkers = (): readonly NativeWorker[] => {
  if (process.platform === 'win32') {
    return [];
  }
  const result = spawnSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
  const workerCommand = /^\s*(\d+)\s+.*Tau\.PicoGK\.Worker --workspace (\S+) --artifacts (\S+) --parent-pid \d+$/u;
  return result.stdout.split('\n').flatMap((line) => {
    const match = workerCommand.exec(line);
    const pid = match?.[1];
    const workspace = match?.[2];
    const artifacts = match?.[3];
    if (!pid || !workspace || !artifacts || dirname(workspace) !== dirname(artifacts)) {
      return [];
    }
    return [{ pid: Number(pid), temporaryRoot: dirname(workspace) }];
  });
};

const waitForNewGeometry = async (sourcePath: string, before: ReadonlySet<string>): Promise<void> => {
  await expect
    .poll(() => geometryCacheEntries(sourcePath).some(({ actionDigest }) => !before.has(actionDigest)), {
      timeout: 120_000,
    })
    .toBe(true);
};

const assertOneNewSettledGeometry = async (sourcePath: string, before: ReadonlySet<string>): Promise<void> => {
  await waitForNewGeometry(sourcePath, before);
  await new Promise((resolve) => {
    setTimeout(resolve, 1500);
  });
  const newBuildEntries = geometryCacheEntries(sourcePath).filter(({ actionDigest }) => !before.has(actionDigest));
  const settledDigests = new Set(newBuildEntries.map(({ contentDigest }) => contentDigest));

  // The authoring agent and viewer each own a runtime client and therefore a
  // dependency cache key. One filesystem revision must still settle to one
  // geometry result across those consumers.
  expect(newBuildEntries.length).toBeGreaterThan(0);
  expect(settledDigests.size).toBe(1);
};

const exportToProject = async (page: Page, projectRoot: string, extension: 'glb' | 'stl'): Promise<string> => {
  const exportRoot = join(projectRoot, 'exports');
  const digest = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');
  const previous = new Map(
    existsSync(exportRoot)
      ? readdirSync(exportRoot)
          .filter((name) => name.endsWith(`.${extension}`))
          .map((name) => {
            const path = join(exportRoot, name);
            return [path, digest(path)] as const;
          })
      : [],
  );
  const exportButton = page.getByRole('button', { name: 'Export', exact: true });
  if (await exportButton.isVisible().catch(() => false)) {
    await exportButton.click();
  }
  const formats = page.getByRole('region', { name: 'Formats' });
  await expectVisible(formats, 30_000);
  const requestedFormat = formats.getByRole('button', { name: extension, exact: true });
  for (const selected of await formats.locator('button[aria-pressed="true"]').all()) {
    // oxlint-disable-next-line no-await-in-loop -- React must observe each toggle before the next click.
    const selectedText = await selected.textContent();
    if (selectedText?.trim().toLowerCase() !== extension) {
      // oxlint-disable-next-line no-await-in-loop -- See the sequencing rationale above.
      await selected.click();
    }
  }
  if ((await requestedFormat.getAttribute('aria-pressed')) !== 'true') {
    await requestedFormat.click();
  }
  const download = page.getByLabel('Download to disk');
  if (await download.isChecked()) {
    await download.click();
  }
  const save = page.getByLabel('Save to project');
  if (!(await save.isChecked())) {
    await save.click();
  }
  await page.getByRole('button', { name: `Export ${extension.toUpperCase()}`, exact: true }).click();
  let path = '';
  await expect
    .poll(
      () => {
        const matches = existsSync(exportRoot)
          ? readdirSync(exportRoot).filter((name) => name.endsWith(`.${extension}`))
          : [];
        path =
          matches
            .map((name) => join(exportRoot, name))
            .find((candidate) => {
              const currentDigest = digest(candidate);
              return !previous.has(candidate) || previous.get(candidate) !== currentDigest;
            }) ?? '';
        return path;
      },
      { timeout: 120_000 },
    )
    .not.toBe('');
  return path;
};

const hasDependentParameterSchema = (sourcePath: string): boolean =>
  parameterCacheContents(sourcePath).some((content) => {
    const parsed = JSON.parse(content) as {
      readonly data?: { readonly defaultParameters?: Readonly<Record<string, unknown>> };
    };
    const parameters = parsed.data?.defaultParameters;
    return (
      parameters?.['width'] === 20 && parameters['height'] === 10 && parameters['gap'] === 4 && !('depth' in parameters)
    );
  });

const validateStep = (path: string): readonly number[] => {
  const resourceRoot = resolve(workspaceRoot, `apps/desktop/resources/python/${process.platform}-${process.arch}`);
  const manifest = JSON.parse(readFileSync(join(resourceRoot, 'tau-runtime-manifest.json'), 'utf8')) as {
    readonly pythonRelativePath: string;
  };
  const python = resolve(resourceRoot, manifest.pythonRelativePath);
  const script =
    'import json,sys;from build123d import import_step;s=import_step(sys.argv[1]);b=s.bounding_box();print(json.dumps({"valid":s.is_valid,"size":[b.size.X,b.size.Y,b.size.Z]}))';
  const result = spawnSync(python, ['-I', '-B', '-c', script, path], {
    encoding: 'utf8',
    env: { LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' },
  });
  expect(result.status, result.stderr).toBe(0);
  const parsed = JSON.parse(result.stdout) as { readonly valid: boolean; readonly size: readonly number[] };
  expect(parsed.valid).toBe(true);
  return parsed.size;
};

const openFirstProjectCardPreview = async (page: Page): Promise<Locator> => {
  await page.getByRole('link', { name: 'Projects', exact: true }).click();
  await page.waitForURL((url) => url.pathname === '/projects', { timeout: 60_000 });
  await expectVisible(page.getByPlaceholder('Search projects...'), 60_000);
  const card = page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByRole('button', { name: 'Preview model' }) })
    .first();
  const toggle = card.getByRole('button', { name: 'Preview model' });
  await expectVisible(toggle, 60_000);
  await toggle.click();
  return card;
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

test('boots the packaged desktop app with no endpoint environment', async () => {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    return;
  }
  session = await launchDesktopApp({
    token: 'unused',
    packaged: true,
    useProductionEndpointDefaults: true,
    env: { TAU_E2E_DISABLE_CREDENTIAL_PERSISTENCE: '1' },
  });
  const environment = await session.page.evaluate(
    () => (globalThis as typeof globalThis & { readonly ENV?: Readonly<Record<string, string>> }).ENV,
  );
  expect(environment).toMatchObject({
    TAU_API_URL: 'https://api.tau.new',
    TAU_WEBSOCKET_URL: 'wss://api.tau.new',
    TAU_FRONTEND_URL: 'https://tau.new',
  });
  await expectCount(session.page.getByText('Application Error', { exact: true }), 0);
});

test('runs the Build123d filesystem, parameter, topology, watcher, viewer, and STEP loop', async () => {
  const existingWorkerPids = new Set(nativeWorkers().map(({ pid }) => pid));
  const account = tauTestAccount('build123d');
  seededEmail = account.email;
  const token = await seedTauTestUser(account);
  session = await launchDesktopApp({ token, env: { TAU_E2E_TRUST_NATIVE_CODE: '1' } });
  const { page } = session;
  const rendererErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      rendererErrors.push(message.text());
    }
  });
  fixture = await installGatewayFixture(page, { targetFile: 'main.py', content: build123dSource });

  try {
    await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
    await declineCookieBanner(page);
    await expectSignedIn(page);
    await selectKernel(page, 'Build123d');
    await connectPickedFolder(session);
    await selectChatModel(page, gatewayFixtureModelName);

    const slug = await submitPrompt(page, 'Create the labeled Build123d assembly.');
    const sourcePath = await waitForProjectOnDisk(session.pickedDirectory, slug, { extension: '.py' });
    const projectRoot = join(session.pickedDirectory, slug);
    await expect.poll(() => readFileSync(sourcePath, 'utf8'), { timeout: 120_000 }).toBe(build123dSource);
    await expectVisible(page.getByText(gatewayFixtureFinalText, { exact: true }), 420_000);
    await expectCount(page.getByText(/ROOT_UNAVAILABLE/u), 0);
    await expectCount(page.getByText('File not found', { exact: true }), 0);
    await expectVisible(page.getByText('Native code enabled', { exact: true }), 120_000);
    await expectVisible(page.getByTestId('cad-viewer-canvas-region').locator('canvas'), 120_000);
    await expectGeometryFramed(page);

    writeFileSync(sourcePath, failingBuild123dSource, 'utf8');
    const editorFailure = page.getByText(failureSentinel, { exact: true });
    await expectVisible(editorFailure, 120_000);
    await expectCount(editorFailure, 1);
    await expectCount(page.getByRole('alert', { name: 'CAD runtime error' }), 0);
    await expectVisible(page.getByTestId('cad-viewer-canvas-region').locator('canvas'), 30_000);

    const card = await openFirstProjectCardPreview(page);
    await expectVisible(card.getByRole('alert', { name: 'CAD runtime error' }).getByText(failureSentinel), 120_000);
    writeFileSync(sourcePath, build123dSource, 'utf8');
    await expectVisible(card.locator('canvas'), 120_000);
    await expectCount(card.getByRole('alert', { name: 'CAD runtime error' }), 0, 120_000);
    const projectLink = card.getByRole('link');
    await projectLink.focus();
    await projectLink.press('Enter');
    await page.waitForURL(/\/w\/[^/]+\/[^/?]+/u, { timeout: 60_000 });
    await expectVisible(page.getByTestId('cad-viewer-canvas-region').locator('canvas'), 120_000);

    await ensureFilesPane(page);
    await expectVisible(fileTreeItemOf(page, 'main.py'), 60_000);

    await page.keyboard.press('Control+x');
    await expectVisible(page.getByText('Parameters', { exact: true }), 30_000);
    const width = page.getByLabel('Input for Width').first();
    await expectVisible(width, 60_000);
    await expectVisible(page.getByLabel('Input for Depth').first(), 60_000);
    const beforeParameter = geometryCacheSnapshot(sourcePath);
    await width.fill('30');
    await width.press('Tab');
    await waitForNewGeometry(sourcePath, beforeParameter);
    await expectGeometryFramed(page);

    await page.keyboard.press('Control+a');
    await expectVisible(page.getByText('Model', { exact: true }), 30_000);
    await expectVisible(page.getByRole('button', { name: 'Left', exact: true }), 60_000);
    await expectVisible(page.getByRole('button', { name: 'Right', exact: true }), 60_000);

    writeFileSync(join(projectRoot, 'dimensions.py'), 'def depth():\n    return 8.0\n', 'utf8');
    const beforeDependency = geometryCacheSnapshot(sourcePath);
    writeFileSync(sourcePath, dependentSource, 'utf8');
    await expect.poll(() => hasDependentParameterSchema(sourcePath), { timeout: 60_000 }).toBe(true);
    await waitForNewGeometry(sourcePath, beforeDependency);
    await expectGeometryFramed(page);

    const beforeImportedEdit = geometryCacheSnapshot(sourcePath);
    writeFileSync(join(projectRoot, 'dimensions.py'), 'def depth():\n    return 12.0\n', 'utf8');
    await waitForNewGeometry(sourcePath, beforeImportedEdit);
    await expectGeometryFramed(page);

    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await expectVisible(page.getByRole('region', { name: 'Formats' }), 30_000);
    await page.getByRole('button', { name: /^step$/iu }).click();
    await expectVisible(page.getByText('STEP options', { exact: true }), 30_000);
    expect(await page.getByText(/unsafe-eval/u).allTextContents()).toEqual([]);
    expect(rendererErrors.some((message) => message.includes('unsafe-eval'))).toBe(false);
    await page.getByLabel('Download to disk').click();
    await page.getByLabel('Save to project').click();
    await page.getByRole('button', { name: 'Export STEP', exact: true }).click();
    const stepPath = join(projectRoot, 'exports/assembly.step');
    await expect
      .poll(() => (existsSync(stepPath) ? readFileSync(stepPath).subarray(0, 13).toString() : ''), { timeout: 120_000 })
      .toBe('ISO-10303-21;');
    const size = validateStep(stepPath);
    expect(size[0]).toBeCloseTo(64, 7);
    expect(size[1]).toBeCloseTo(12, 7);
    expect(size[2]).toBeCloseTo(10, 7);

    if (process.platform !== 'win32') {
      const workers = nativeWorkers().filter(({ pid }) => !existingWorkerPids.has(pid));
      expect(workers.length).toBeGreaterThan(0);
      await session.close();
      session = undefined;
      await expect
        .poll(() => workers.every(({ pid }) => !nativeWorkers().some((worker) => worker.pid === pid)), {
          timeout: 10_000,
        })
        .toBe(true);
      await expect
        .poll(() => workers.every(({ temporaryRoot }) => !existsSync(temporaryRoot)), { timeout: 10_000 })
        .toBe(true);
    }
  } catch (error) {
    await session?.capture('build123d-failure');
    throw error;
  }
});

test('renders a persisted Replicad project card without relaxing the Electron CSP', async () => {
  const account = tauTestAccount('replicad-preview');
  seededEmail = account.email;
  const token = await seedTauTestUser(account);
  session = await launchDesktopApp({ token });
  const { page } = session;
  const rendererErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      rendererErrors.push(message.text());
    }
  });
  fixture = await installGatewayFixture(page, { targetFile: 'main.ts', content: replicadSource });

  try {
    await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
    await declineCookieBanner(page);
    await expectSignedIn(page);
    await selectKernel(page, 'Replicad');
    await connectPickedFolder(session);
    await selectChatModel(page, gatewayFixtureModelName);

    const slug = await submitPrompt(page, 'Create the Replicad cylinder.');
    const sourcePath = await waitForProjectOnDisk(session.pickedDirectory, slug, { extension: '.ts' });
    await expect.poll(() => readFileSync(sourcePath, 'utf8'), { timeout: 120_000 }).toBe(replicadSource);
    await expectVisible(page.getByText(gatewayFixtureFinalText, { exact: true }), 420_000);
    await expectVisible(page.getByTestId('cad-viewer-canvas-region').locator('canvas'), 120_000);

    const card = await openFirstProjectCardPreview(page);
    await expectVisible(card.locator('canvas'), 120_000);
    expect(rendererErrors.some((message) => message.includes('unsafe-eval'))).toBe(false);
    await expectCount(card.getByRole('alert', { name: 'CAD runtime error' }), 0);
  } catch (error) {
    await session.capture('replicad-preview-failure');
    throw error;
  }
});

test('runs packaged PicoGK C# through filesystem, topology, failures, export, trust, and cleanup', async () => {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    return;
  }
  const existingWorkerPids = new Set(picogkWorkers().map(({ pid }) => pid));
  const account = tauTestAccount('picogk');
  seededEmail = account.email;
  const token = await seedTauTestUser(account);
  session = await launchDesktopApp({
    token,
    packaged: true,
    env: {
      PATH: '/usr/bin:/bin',
      TAU_DEBUG: 'true',
      /* An ad-hoc package signature cannot access Electron's prior Keychain
       * item unattended. Memory-only custody still exercises the production
       * loopback exchange without weakening or replacing safeStorage. */
      TAU_E2E_DISABLE_CREDENTIAL_PERSISTENCE: '1',
    },
  });
  const { page } = session;
  const rendererErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      rendererErrors.push(message.text());
    }
  });
  fixture = await installGatewayFixture(page, { targetFile: 'main.cs', content: picogkSource });

  try {
    await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
    await declineCookieBanner(page);
    await authenticatePackagedDesktop(session, token);
    await expectSignedIn(page);
    await selectKernel(page, 'PicoGK');
    await connectPickedFolder(session);
    await selectChatModel(page, gatewayFixtureModelName);

    const slug = await submitPrompt(page, 'Create the asymmetric PicoGK assembly.');
    const sourcePath = await waitForProjectOnDisk(session.pickedDirectory, slug, { extension: '.cs' });
    const projectRoot = join(session.pickedDirectory, slug);
    await expect.poll(() => readFileSync(sourcePath, 'utf8'), { timeout: 120_000 }).toBe(picogkSource);
    await expectVisible(page.getByText(gatewayFixtureFinalText, { exact: true }), 420_000);
    await expectVisible(page.getByText('Native code enabled', { exact: true }), 120_000);
    await expectVisible(page.getByTestId('cad-viewer-canvas-region').locator('canvas'), 120_000);
    await expectGeometryFramed(page);

    await ensureFilesPane(page);
    const sourceItem = fileTreeItemOf(page, 'main.cs');
    await expectVisible(sourceItem, 60_000);
    await sourceItem.click();
    await expectVisible(page.locator('.monaco-editor'), 60_000);
    await expect
      .poll(
        async () =>
          page
            .locator('.monaco-editor .view-line span[class*="mtk"]')
            .evaluateAll((tokens: HTMLElement[]) => new Set(tokens.map((token) => token.getAttribute('class'))).size),
        { timeout: 30_000 },
      )
      .toBeGreaterThan(1);

    await page.keyboard.press('Control+x');
    await expectVisible(page.getByText('Parameters', { exact: true }), 30_000);
    const radius = page.getByLabel('Input for Radius').first();
    await expectVisible(radius, 60_000);
    await expectVisible(page.getByLabel('Input for Voxel size').first(), 60_000);
    const beforeParameter = geometryCacheSnapshot(sourcePath);
    await radius.fill('16');
    await radius.press('Tab');
    await assertOneNewSettledGeometry(sourcePath, beforeParameter);

    await page.keyboard.press('Control+a');
    const body = page.getByRole('button', { name: 'group-0-object-1', exact: true });
    const sphere = page.getByRole('button', { name: 'group-1-object-2', exact: true });
    await expectVisible(body, 60_000);
    await expectVisible(sphere, 60_000);
    const bodyMaterial = await body.locator('[data-testid="component-color-icon"]').getAttribute('style');
    expect(bodyMaterial).toContain('fill');
    await sphere.click();
    await expect.poll(async () => sphere.getAttribute('aria-pressed')).toBe('true');

    const beforeProgressive = geometryCacheSnapshot(sourcePath);
    await page.evaluate(() => {
      const target = globalThis as typeof globalThis & {
        __tauPicoGkStates?: string[];
        __tauPicoGkObserver?: MutationObserver;
      };
      const states: string[] = [];
      target.__tauPicoGkStates = states;
      let previous = 'idle';
      const capture = (): void => {
        const status = [...document.querySelectorAll('span')].find((element) => {
          const text = element.textContent.trim().toLowerCase();
          return text === 'buffering...' || text === 'rendering...';
        });
        const state = status?.textContent.trim().toLowerCase();
        const next = state ?? 'idle';
        if (next !== previous) {
          states.push(next);
          previous = next;
        }
      };
      target.__tauPicoGkObserver?.disconnect();
      target.__tauPicoGkObserver = new MutationObserver(capture);
      target.__tauPicoGkObserver.observe(document.body, { childList: true, characterData: true, subtree: true });
      capture();
    });
    writeFileSync(sourcePath, progressivePicogkSource, 'utf8');
    const sceneTimeline = page.getByRole('slider', { name: 'Scene timeline' });
    // One frame has nothing to scrub; the control appears when the second frame arrives.
    await expectCount(sceneTimeline, 0, 30_000);
    await expectVisible(sceneTimeline, 120_000);
    await expect.poll(async () => sceneTimeline.getAttribute('aria-valuetext')).toBe('Frame 2 of 2: Frame 2. Live.');
    expect(geometryCacheSnapshot(sourcePath)).toEqual(beforeProgressive);

    const beforeScrub = geometryCacheSnapshot(sourcePath);
    await sceneTimeline.focus();
    await sceneTimeline.press('Home');
    await expect.poll(async () => sceneTimeline.getAttribute('aria-valuetext')).toMatch(/^Frame 1 of 2:/u);
    await page.getByRole('button', { name: 'Return to live scene' }).click();
    await expect.poll(async () => sceneTimeline.getAttribute('aria-valuetext')).toMatch(/^Frame 2 of 2:/u);
    expect(geometryCacheSnapshot(sourcePath)).toEqual(beforeScrub);

    await assertOneNewSettledGeometry(sourcePath, beforeProgressive);
    const progressiveStates = await page.evaluate(() => {
      const target = globalThis as typeof globalThis & {
        __tauPicoGkStates?: string[];
        __tauPicoGkObserver?: MutationObserver;
      };
      target.__tauPicoGkObserver?.disconnect();
      return target.__tauPicoGkStates ?? [];
    });
    expect(progressiveStates).toEqual(['buffering...', 'rendering...', 'idle']);

    const beforeStageSave = geometryCacheSnapshot(sourcePath);
    await page.getByRole('button', { name: 'Save selected preview stage to project' }).click();
    // Sequence zero is the empty reset, so visible frame two is protocol stage three.
    const stageRoot = join(projectRoot, 'stages', 'main-stage-3');
    const stagePath = join(stageRoot, 'scene.json');
    await expect.poll(() => existsSync(stagePath), { timeout: 30_000 }).toBe(true);
    const savedStage = JSON.parse(readFileSync(stagePath, 'utf8')) as TauSceneManifest;
    const stageGeometry = Object.values(savedStage.nodes).flatMap((node) => (node.geometry ? [node.geometry] : []));
    expect(stageGeometry).toHaveLength(2);
    for (const asset of stageGeometry) {
      const bytes = readFileSync(join(stageRoot, `${encodeURIComponent(asset.contentDigest)}.glb`));
      validateGlbData(Uint8Array.from(bytes));
      expect(bytes.byteLength).toBe(asset.byteLength);
      expect(`sha256:${createHash('sha256').update(bytes).digest('hex')}`).toBe(asset.contentDigest);
    }
    await expectVisible(page.getByText('Saved preview stage as stages/main-stage-3/scene.json', { exact: true }));
    await page.waitForTimeout(1500);
    expect(geometryCacheSnapshot(sourcePath)).toEqual(beforeStageSave);

    // Observe a fresh lifecycle before restoring bytes: the previous scene is
    // already idle, and its material remains visible while native work runs.
    await page.evaluate(() => {
      const target = globalThis as typeof globalThis & {
        __tauPicoGkStates?: string[];
        __tauPicoGkObserver?: MutationObserver;
      };
      if (!target.__tauPicoGkStates || !target.__tauPicoGkObserver) {
        throw new Error('PicoGK render lifecycle observer was not installed.');
      }
      target.__tauPicoGkStates.length = 0;
      target.__tauPicoGkObserver.observe(document.body, { childList: true, characterData: true, subtree: true });
    });
    writeFileSync(sourcePath, picogkSource, 'utf8');
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const target = globalThis as typeof globalThis & { __tauPicoGkStates?: string[] };
            const states = target.__tauPicoGkStates ?? [];
            return states.some((state) => state !== 'idle') && states.at(-1) === 'idle';
          }),
        { timeout: 120_000 },
      )
      .toBe(true);
    await page.evaluate(() => {
      const target = globalThis as typeof globalThis & { __tauPicoGkObserver?: MutationObserver };
      target.__tauPicoGkObserver?.disconnect();
    });
    await expect
      .poll(async () => body.locator('[data-testid="component-color-icon"]').getAttribute('style'))
      .toBe(bodyMaterial);
    await expectGeometryFramed(page);

    const initialGlbPath = await exportToProject(page, projectRoot, 'glb');
    const initialGlb = Uint8Array.from(readFileSync(initialGlbPath));
    validateGlbData(initialGlb);
    const initialBounds = getBoundingBoxFromInspect(await getInspectReport(initialGlb));
    expect(initialBounds).toBeDefined();

    const beforeDependencySetup = geometryCacheSnapshot(sourcePath);
    writeFileSync(join(projectRoot, 'ShapeFactory.cs'), picogkHelperSource(2), 'utf8');
    writeFileSync(join(projectRoot, 'radius-scale.txt'), '0.5\n', 'utf8');
    writeFileSync(sourcePath, picogkDependentSource, 'utf8');
    await waitForNewGeometry(sourcePath, beforeDependencySetup);
    await new Promise((resolve) => {
      setTimeout(resolve, 1500);
    });
    await expectCount(page.getByRole('alert', { name: 'CAD runtime error' }), 0, 120_000);
    const dependentGeometry = geometryCacheSnapshot(sourcePath);
    writeFileSync(join(projectRoot, 'ShapeFactory.cs'), picogkHelperSource(3), 'utf8');
    await assertOneNewSettledGeometry(sourcePath, dependentGeometry);
    const assetGeometry = geometryCacheSnapshot(sourcePath);
    writeFileSync(join(projectRoot, 'radius-scale.txt'), '0.75\n', 'utf8');
    await assertOneNewSettledGeometry(sourcePath, assetGeometry);

    writeFileSync(
      join(projectRoot, 'ShapeFactory.cs'),
      picogkHelperSource(3).replace('radius * scale', 'MissingPicoGkSymbol * scale'),
      'utf8',
    );
    const compileFailure = page.getByText("The name 'MissingPicoGkSymbol' does not exist in the current context", {
      exact: true,
    });
    await expectVisible(compileFailure, 120_000);
    await expectCount(compileFailure, 1);
    await expectCount(page.getByText(/ShapeFactory\.cs:\d+:\d+/u), 1);
    const card = await openFirstProjectCardPreview(page);
    await expectVisible(
      card.getByRole('alert', { name: 'CAD runtime error' }).getByText('MissingPicoGkSymbol'),
      120_000,
    );
    writeFileSync(join(projectRoot, 'ShapeFactory.cs'), picogkHelperSource(3), 'utf8');
    await expectVisible(card.locator('canvas'), 120_000);
    await expectCount(card.getByRole('alert', { name: 'CAD runtime error' }), 0, 120_000);
    await card.getByRole('link').focus();
    await card.getByRole('link').press('Enter');
    await page.waitForURL(/\/w\/[^/]+\/[^/?]+/u, { timeout: 60_000 });
    await expectVisible(page.getByTestId('cad-viewer-canvas-region').locator('canvas'), 120_000);

    writeFileSync(sourcePath, failingPicogkRuntimeSource, 'utf8');
    const runtimeFailure = page.getByText(picogkRuntimeFailure, { exact: true });
    await expectVisible(runtimeFailure, 120_000);
    await expectCount(runtimeFailure, 1);
    writeFileSync(sourcePath, picogkSource, 'utf8');
    await expectCount(runtimeFailure, 0, 120_000);
    await expectGeometryFramed(page);

    const stlPath = await exportToProject(page, projectRoot, 'stl');
    expect(readFileSync(stlPath).byteLength).toBeGreaterThan(84);

    const workersBeforeRevoke = picogkWorkers().filter(({ pid }) => !existingWorkerPids.has(pid));
    expect(workersBeforeRevoke).not.toHaveLength(0);
    const renderingStatus = page.getByText('rendering...', { exact: true });
    await expectCount(renderingStatus, 0, 120_000);
    writeFileSync(sourcePath, slowPicogkSource, 'utf8');
    await expectVisible(renderingStatus, 120_000);
    const revoke = page.getByRole('button', { name: 'Revoke', exact: true });
    await revoke.focus();
    await revoke.press('Enter');
    await expect
      .poll(() => workersBeforeRevoke.every(({ pid }) => !picogkWorkers().some((worker) => worker.pid === pid)), {
        timeout: 15_000,
      })
      .toBe(true);
    const trustFailure = page.getByText(/Native-code trust was revoked|not trusted to run native code/u);
    await expectVisible(trustFailure, 30_000);
    await expectCount(trustFailure, 1);

    writeFileSync(sourcePath, picogkSource, 'utf8');
    await page.reload();
    await expectVisible(page.getByText('Native code enabled', { exact: true }), 120_000);
    await expectVisible(page.getByTestId('cad-viewer-canvas-region').locator('canvas'), 120_000);
    await expectGeometryFramed(page);
    const workersAfterRegrant = picogkWorkers().filter(({ pid }) => !existingWorkerPids.has(pid));
    expect(workersAfterRegrant.some(({ pid }) => workersBeforeRevoke.every((worker) => worker.pid !== pid))).toBe(true);
    expect(session.application.windows()).toHaveLength(1);
    expect(spawnSync('ps', ['-axo', 'command='], { encoding: 'utf8' }).stdout).not.toMatch(/PicoGK.*Viewer/u);
    expect(rendererErrors.some((message) => message.includes('unsafe-eval'))).toBe(false);

    await session.capture('picogk-packaged-success');
    const workers = picogkWorkers().filter(({ pid }) => !existingWorkerPids.has(pid));
    await session.close();
    session = undefined;
    await expect
      .poll(() => workers.every(({ pid }) => !picogkWorkers().some((worker) => worker.pid === pid)), {
        timeout: 15_000,
      })
      .toBe(true);
    await expect
      .poll(() => workers.every(({ temporaryRoot }) => !existsSync(temporaryRoot)), { timeout: 15_000 })
      .toBe(true);
  } catch (error) {
    await session?.capture('picogk-packaged-failure');
    throw error;
  }
}, 900_000);
