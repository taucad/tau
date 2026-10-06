import { spawnSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import type { Page } from 'playwright';
import { afterEach, expect, test } from 'vitest';

import {
  captureNextDesktopDownload,
  desktopRuntimeLeases,
  expectDesktopRuntimeLeaseExit,
  launchDesktopApp,
  observeDesktopRuntimeLeases,
  waitForDesktopRuntimeLease,
} from '#support/desktop-app.js';
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
  const failed = context.task.result?.state === 'fail';
  if (failed) {
    await Promise.allSettled([session?.capture(`converter-failure-${context.task.id}`)]);
  }
  const [closed] = await Promise.allSettled([session?.close()]);
  session = undefined;
  if (!failed && closed.status === 'rejected') {
    const error: unknown = closed.reason;
    throw error;
  }
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
  const inputFormats = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Input formats', exact: true }),
  });
  await expect
    .poll(async () => visibleCount(inputFormats.getByRole('listitem')), { timeout: 120_000 })
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
  const inputFormats = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Input formats', exact: true }),
  });
  await expect.poll(async () => visibleCount(inputFormats.getByRole('listitem'))).toBeGreaterThan(0);
  for (const format of ['GLB', 'OBJ', 'STEP', 'USDZ']) {
    // oxlint-disable-next-line no-await-in-loop -- Each required route must be represented in the capability lists.
    expect(await visibleCount(inputFormats.getByText(format, { exact: true }))).toBeGreaterThan(0);
  }
};

const chooseUsdzAndDownload = async (
  desktopSession: DesktopSession,
  page: Page,
  options: { readonly expectTexture?: boolean; readonly name: string },
): Promise<void> => {
  const format = page.getByLabel(/\(USDZ\)$/u);
  await format.waitFor({ state: 'visible', timeout: 60_000 });
  const reset = page.getByRole('button', { name: 'Reset', exact: true });
  if (await reset.isVisible()) {
    await reset.click();
  }
  await format.click();
  await expect.poll(async () => format.isChecked()).toBe(true);
  const path = join(dirname(desktopSession.homeRoot), `.e2e-${options.name}.usdz`);
  const button = page.getByRole('button', { name: 'Download USDZ', exact: true });
  await button.waitFor({ state: 'visible' });
  const download = await captureNextDesktopDownload(desktopSession, path, async () => button.click());
  expect(download.filename).toMatch(/\.usdz$/u);
  await expectUsdzDownload(path, options.expectTexture ?? false);
};

test('[completed-artifact] should fullscreen the viewer with settings and restore its existing canvas', async () => {
  session = await launchDesktopApp({ packaged: true, token: 'fullscreen-package-probe' });
  const { page, application } = session;
  await openRoute(page, '/convert');
  const input = page.locator('input[type="file"]').first();
  await expect.poll(async () => input.isEnabled(), { timeout: 120_000 }).toBe(true);
  await input.setInputFiles(glbFixture);
  const viewer = page.locator('[data-viewer-frame]');
  await viewer.locator('canvas').first().waitFor({ state: 'visible' });
  const canvas = await viewer.locator('canvas').first().elementHandle();
  expect(canvas).not.toBeNull();
  const originalSize = await viewer.boundingBox();
  // The suite normally hides its windows; native fullscreen must exercise a visible window.
  await application.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]!;
    window.show();
    window.focus();
  });
  const nativeFullscreen = async (): Promise<boolean> =>
    application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isFullScreen());
  // On macOS isFullScreen updates before its transition completes; await the native event before interacting again.
  const fullscreenTransition = async (event: 'enter-full-screen' | 'leave-full-screen'): Promise<void> =>
    application.evaluate(
      async ({ BrowserWindow }, transition) =>
        new Promise<void>((resolve) => {
          const window = BrowserWindow.getAllWindows()[0]!;
          if (transition === 'enter-full-screen') {
            window.once('enter-full-screen', resolve);
          } else {
            window.once('leave-full-screen', resolve);
          }
        }),
      event,
    );

  let transition = fullscreenTransition('enter-full-screen');
  await page.getByRole('button', { name: 'Enter fullscreen', exact: true }).click();
  await transition;
  await expect.poll(nativeFullscreen, { timeout: 15_000 }).toBe(true);
  expect(await viewer.evaluate((element) => document.fullscreenElement === element)).toBe(true);
  expect(
    await viewer.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return bounds.width === window.innerWidth && bounds.height === window.innerHeight;
    }),
  ).toBe(true);
  expect(await canvas.evaluate((element) => element.isConnected && element === document.querySelector('canvas'))).toBe(
    true,
  );

  transition = fullscreenTransition('leave-full-screen');
  await page.getByRole('button', { name: 'Exit fullscreen', exact: true }).click();
  await transition;
  await expect.poll(nativeFullscreen, { timeout: 15_000 }).toBe(false);
  expect(await page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await expect.poll(async () => viewer.boundingBox(), { timeout: 15_000 }).toEqual(originalSize);

  transition = fullscreenTransition('enter-full-screen');
  await page.getByRole('button', { name: 'Enter fullscreen', exact: true }).click();
  await transition;
  await expect.poll(nativeFullscreen, { timeout: 15_000 }).toBe(true);
  await page.getByRole('button', { name: 'Viewer settings', exact: true }).click();
  const menu = page.getByRole('menu');
  await menu.waitFor({ state: 'visible' });
  expect(await menu.evaluate((element) => document.fullscreenElement?.contains(element))).toBe(true);
  await page.screenshot({ path: join(workspaceRoot, 'out/test-results/desktop-e2e/viewer-fullscreen.png') });
  await page.keyboard.press('Escape');
  await menu.waitFor({ state: 'hidden' });
  transition = fullscreenTransition('leave-full-screen');
  await page.getByRole('button', { name: 'Exit fullscreen', exact: true }).click();
  await transition;
  await expect.poll(nativeFullscreen, { timeout: 15_000 }).toBe(false);
  expect(await page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  expect(await canvas.evaluate((element) => element.isConnected && element === document.querySelector('canvas'))).toBe(
    true,
  );
  await expect.poll(async () => viewer.boundingBox(), { timeout: 15_000 }).toEqual(originalSize);
});

test('[completed-artifact] converts GLB, OBJ sidecars, and STEP to USDZ without persisting scratch projects', async () => {
  session = await launchDesktopApp({
    packaged: true,
    token: 'converter-package-probe',
  });
  const homeBefore = await directorySnapshot(session.homeRoot);
  const pickedBefore = await directorySnapshot(session.pickedDirectory);

  await openRoute(session.page, '/convert');
  const heading = session.page.getByRole('heading', {
    name: 'Convert',
    exact: true,
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
  await observeDesktopRuntimeLeases(session);
  await openRoute(session.page, '/convert');
  await waitForConverterReady(session.page);
  const converterLease = await waitForDesktopRuntimeLease(session, session.page, { leaseTimeout: 60_000 });

  const slowObject = `v 0 0 0\nv 1 0 0\nv 0 1 0\n${'f 1 2 3\n'.repeat(500_000)}`;
  await session.page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({
      buffer: Buffer.from(slowObject),
      mimeType: 'model/obj',
      name: 'slow.obj',
    });
  const openingModel = session.page.getByRole('status', { name: 'Opening model', exact: true });
  await openingModel.waitFor({ state: 'visible', timeout: 60_000 });
  expect(await openingModel.getAttribute('aria-busy')).toBe('true');
  await openRoute(session.page, '/');
  await expectDesktopRuntimeLeaseExit(session, converterLease, { released: true });

  const priorLeases = await desktopRuntimeLeases(session);
  const previousRequestIds = priorLeases.map(({ requestId }) => requestId);
  await openRoute(session.page, '/convert');
  await waitForConverterReady(session.page);
  const recoveredLease = await waitForDesktopRuntimeLease(session, session.page, {
    previousRequestIds,
    leaseTimeout: 60_000,
  });
  expect(recoveredLease.hostId).not.toBe(converterLease.hostId);
  expect(recoveredLease.pid).not.toBe(converterLease.pid);
  await session.page.locator('input[type="file"]').first().setInputFiles(glbFixture);
  await session.page.getByText('cube.glb', { exact: true }).waitFor({ state: 'visible', timeout: 120_000 });
  await chooseUsdzAndDownload(session, session.page, { name: 'after-cancel' });
});
