import { spawnSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import type { Page } from 'playwright';
import { afterEach, expect, test } from 'vitest';

import { captureNextDesktopDownload, launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';

const workspaceRoot = resolve(import.meta.dirname, '../../..');
const glbFixture = join(workspaceRoot, 'packages/plugins/gltf/src/fixtures/cube.glb');
const stepFixture = join(workspaceRoot, 'packages/plugins/brep/src/fixtures/cube.step');
const textureFixture = join(workspaceRoot, 'apps/ui/public/favicon-96x96.png');
const cubeObject = `mtllib cube.mtl
usemtl tau-blue
v -1 -1 -1
v 1 -1 -1
v 1 1 -1
v -1 1 -1
v -1 -1 1
v 1 -1 1
v 1 1 1
v -1 1 1
vt 0 0
vt 1 0
vt 1 1
vt 0 1
f 1/1 2/2 3/3 4/4
f 5/1 8/2 7/3 6/4
f 1/1 5/2 6/3 2/4
f 2/1 6/2 7/3 3/4
f 3/1 7/2 8/3 4/4
f 5/1 1/2 4/3 8/4
`;
const cubeMtl = `newmtl tau-blue
Kd 0.12 0.36 0.82
map_Kd tau-texture.png
`;

let session: DesktopSession | undefined;

afterEach(async (context) => {
  if (context.task.result?.state === 'fail') {
    await session?.capture('converter-failure');
  }
  await session?.close();
  session = undefined;
});

const directorySnapshot = async (root: string): Promise<readonly string[]> => {
  const entries = await readdir(root, { recursive: true }).catch(() => []);
  return entries.map(String).sort();
};

const openRoute = async (page: Page, path: string): Promise<void> => {
  await page.goto(new URL(path, 'app://tau').href, { waitUntil: 'domcontentloaded' });
};

const visibleCount = async (locator: ReturnType<Page['getByText']>): Promise<number> => {
  const candidates = await locator.all();
  const visibility = await Promise.all(candidates.map(async (candidate) => candidate.isVisible()));
  return visibility.filter(Boolean).length;
};

const waitForConverterReady = async (page: Page): Promise<void> => {
  await expect
    .poll(async () => visibleCount(page.getByText(/^[1-9]\d* formats supported$/u)), { timeout: 120_000 })
    .toBeGreaterThan(0);
};

const expectUsdzDownload = async (path: string, expectTexture: boolean): Promise<void> => {
  const bytes = await readFile(path);
  expect(bytes.byteLength).toBeGreaterThan(500);
  expect(bytes.subarray(0, 4).toString('binary')).toBe('PK\u0003\u0004');
  const archiveTest = spawnSync('/usr/bin/unzip', ['-t', path], { encoding: 'utf8' });
  expect(archiveTest.status, archiveTest.stderr).toBe(0);
  const members = spawnSync('/usr/bin/unzip', ['-Z1', path], { encoding: 'utf8' });
  expect(members.status, members.stderr).toBe(0);
  const memberNames = members.stdout.split('\n');
  const usdMember = memberNames.find((name) => /\.usd[ac]?$/u.test(name));
  expect(usdMember).toBeDefined();
  const usd = spawnSync('/usr/bin/unzip', ['-p', path, usdMember!]);
  expect(usd.status, usd.stderr.toString()).toBe(0);
  const isUsda = usd.stdout.subarray(0, 5).toString() === '#usda';
  const isUsdc = usd.stdout.subarray(0, 8).toString() === 'PXR-USDC';
  expect(isUsda || isUsdc).toBe(true);
  if (expectTexture) {
    expect(isUsda).toBe(true);
    const textureReference = /asset inputs:file = @\.\/([^@]+)@/u.exec(usd.stdout.toString())?.[1];
    expect(textureReference).toBeDefined();
    const textureMember = memberNames.find((name) => name === textureReference);
    expect(textureMember).toBeDefined();
    const texture = spawnSync('/usr/bin/unzip', ['-p', path, textureMember!]);
    expect(texture.status, texture.stderr.toString()).toBe(0);
    expect([...texture.stdout.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(texture.stdout.byteLength).toBeGreaterThan(100);
  }
};

const expectCapabilityParity = async (page: Page): Promise<void> => {
  await expect.poll(async () => visibleCount(page.getByText(/^[1-9]\d* formats supported$/u))).toBeGreaterThan(0);
  for (const format of ['GLB', 'OBJ', 'STEP', 'USDZ']) {
    // oxlint-disable-next-line no-await-in-loop -- Each required route must be represented in the capability lists.
    expect(await visibleCount(page.getByText(format, { exact: true }))).toBeGreaterThan(0);
  }
};

const utilityProcesses = async (desktopSession: DesktopSession): Promise<ReadonlySet<number>> =>
  new Set(
    await desktopSession.application.evaluate(({ app }) =>
      app
        .getAppMetrics()
        .filter((metric) => metric.type === 'Utility' && metric.name === 'tau-kernel-host')
        .map((metric) => metric.pid),
    ),
  );

const chooseUsdzAndDownload = async (
  desktopSession: DesktopSession,
  page: Page,
  options: { readonly expectTexture?: boolean; readonly name: string },
): Promise<void> => {
  const format = page.getByLabel(/\(USDZ\)$/u);
  const glbFormat = page.getByLabel(/\(GLB\)$/u);
  await format.waitFor({ state: 'visible', timeout: 60_000 });
  if ((await format.getAttribute('data-state')) !== 'checked') {
    await format.click();
  }
  if ((await glbFormat.getAttribute('data-state')) !== 'checked') {
    await glbFormat.click();
  }
  const zipOption = page.getByLabel('Download as ZIP file', { exact: true });
  await zipOption.waitFor({ state: 'visible' });
  if (await zipOption.isChecked()) {
    await zipOption.click();
  }
  await glbFormat.click();
  const path = join(dirname(desktopSession.homeRoot), `.e2e-${options.name}.usdz`);
  const download = await captureNextDesktopDownload(desktopSession, path, async () =>
    page.getByRole('button', { name: 'Download', exact: true }).click(),
  );
  expect(download.filename).toMatch(/\.usdz$/u);
  await expectUsdzDownload(path, options.expectTexture ?? false);
};

test('[completed-artifact] converts GLB, OBJ sidecars, and STEP to USDZ without persisting scratch projects', async () => {
  session = await launchDesktopApp({
    packaged: true,
    token: 'converter-package-probe',
  });
  const homeBefore = await directorySnapshot(session.homeRoot);
  const pickedBefore = await directorySnapshot(session.pickedDirectory);

  await openRoute(session.page, '/convert');
  const heading = session.page.getByRole('heading', {
    name: '3D Model Converter',
  });
  await heading.waitFor({ state: 'visible' });
  expect(await heading.isVisible()).toBe(true);
  await waitForConverterReady(session.page);
  await expectCapabilityParity(session.page);
  await session.page.locator('input[type="file"]').first().setInputFiles(glbFixture);
  const glbName = session.page.getByText('cube.glb', { exact: true });
  await glbName.waitFor({ state: 'visible', timeout: 120_000 });
  expect(await glbName.isVisible()).toBe(true);
  const firstCanvas = session.page.locator('canvas').first();
  await firstCanvas.waitFor({ state: 'visible' });
  expect(await firstCanvas.isVisible()).toBe(true);
  await session.page.getByLabel(/\(GLB\)$/u).click();
  await session.page.getByLabel(/\(USDZ\)$/u).click();
  const zipOption = session.page.getByLabel('Download as ZIP file', { exact: true });
  await zipOption.waitFor({ state: 'visible' });
  expect(await zipOption.isChecked()).toBe(true);
  await zipOption.click();
  expect(await zipOption.isChecked()).toBe(false);
  await session.page.getByRole('button', { name: 'Reset', exact: true }).click();
  await chooseUsdzAndDownload(session, session.page, { name: 'glb' });

  // Unmounting the route terminates its ephemeral converter client. A second
  // mount must create an independent scratch filesystem and retain sidecars.
  await openRoute(session.page, '/');
  await openRoute(session.page, '/convert');
  await waitForConverterReady(session.page);
  await session.page
    .locator('input[type="file"]')
    .first()
    .setInputFiles([
      {
        buffer: Buffer.from(cubeObject),
        mimeType: 'model/obj',
        name: 'cube.obj',
      },
      { buffer: Buffer.from(cubeMtl), mimeType: 'model/mtl', name: 'cube.mtl' },
      { buffer: await readFile(textureFixture), mimeType: 'image/png', name: 'tau-texture.png' },
    ]);
  const objectName = session.page.getByText('cube.obj', { exact: true });
  await objectName.waitFor({ state: 'visible', timeout: 120_000 });
  expect(await objectName.isVisible()).toBe(true);
  const secondCanvas = session.page.locator('canvas').first();
  await secondCanvas.waitFor({ state: 'visible' });
  expect(await secondCanvas.isVisible()).toBe(true);
  await chooseUsdzAndDownload(session, session.page, { expectTexture: true, name: 'obj' });

  await openRoute(session.page, '/');
  await openRoute(session.page, '/convert');
  await waitForConverterReady(session.page);
  await session.page.locator('input[type="file"]').first().setInputFiles(stepFixture);
  const stepName = session.page.getByText('cube.step', { exact: true });
  await stepName.waitFor({ state: 'visible', timeout: 120_000 });
  expect(await stepName.isVisible()).toBe(true);
  const thirdCanvas = session.page.locator('canvas').first();
  await thirdCanvas.waitFor({ state: 'visible' });
  expect(await thirdCanvas.isVisible()).toBe(true);
  await chooseUsdzAndDownload(session, session.page, { name: 'step' });

  expect(await directorySnapshot(session.homeRoot)).toEqual(homeBefore);
  expect(await directorySnapshot(session.pickedDirectory)).toEqual(pickedBefore);
});

test('[completed-artifact] releases an in-flight conversion utility on unmount and recovers with a fresh utility', async () => {
  session = await launchDesktopApp({ packaged: true, token: 'converter-cancellation-probe' });
  const utilitiesBefore = await utilityProcesses(session);
  await openRoute(session.page, '/convert');
  await waitForConverterReady(session.page);
  let converterPid: number | undefined;
  await expect
    .poll(
      async () => {
        converterPid = [...(await utilityProcesses(session!))].find((pid) => !utilitiesBefore.has(pid));
        return converterPid;
      },
      { timeout: 60_000 },
    )
    .toBeDefined();

  const slowObject = `v 0 0 0\nv 1 0 0\nv 0 1 0\n${'f 1 2 3\n'.repeat(500_000)}`;
  await session.page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({
      buffer: Buffer.from(slowObject),
      mimeType: 'model/obj',
      name: 'slow.obj',
    });
  await session.page.getByText('Converting file...', { exact: true }).waitFor({ state: 'visible', timeout: 60_000 });
  await openRoute(session.page, '/');
  await expect
    .poll(
      async () => {
        const utilities = await utilityProcesses(session!);
        return utilities.has(converterPid!);
      },
      { timeout: 60_000 },
    )
    .toBe(false);

  await openRoute(session.page, '/convert');
  await waitForConverterReady(session.page);
  await session.page.locator('input[type="file"]').first().setInputFiles(glbFixture);
  await session.page.getByText('cube.glb', { exact: true }).waitFor({ state: 'visible', timeout: 120_000 });
  await chooseUsdzAndDownload(session, session.page, { name: 'after-cancel' });
});
