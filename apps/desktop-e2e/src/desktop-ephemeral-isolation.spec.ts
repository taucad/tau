import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import type { Page } from 'playwright';
import { afterEach, expect, test } from 'vitest';

import { captureNextDesktopDownload, launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import { declineCookieBanner } from '#support/scenario.js';

const workspaceRoot = resolve(import.meta.dirname, '../../..');
const cubePath = join(workspaceRoot, 'packages/plugins/gltf/src/fixtures/cube.glb');
const dracoCubePath = join(workspaceRoot, 'packages/plugins/gltf/src/fixtures/cube-draco.glb');
let session: DesktopSession | undefined;

afterEach(async (context) => {
  if (context.task.result?.state === 'fail') {
    await session?.capture('ephemeral-isolation-failure');
  }
  await session?.close();
  session = undefined;
});

const directorySnapshot = async (root: string): Promise<readonly string[]> => {
  const entries = await readdir(root, { recursive: true }).catch(() => []);
  return entries.map(String).sort();
};

const openConverter = async (page: Page): Promise<void> => {
  await page.goto('app://tau/convert', { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '3D Model Converter' }).waitFor({ state: 'visible' });
  await declineCookieBanner(page);
  await page
    .getByText(/^[1-9]\d* formats supported$/u)
    .filter({ visible: true })
    .waitFor({ state: 'visible', timeout: 120_000 });
};

const uploadNamedCube = async (page: Page, bytes: Uint8Array<ArrayBuffer>): Promise<void> => {
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({
      buffer: Buffer.from(bytes),
      mimeType: 'model/gltf-binary',
      name: 'same-name.glb',
    });
  await page.getByText('same-name.glb', { exact: true }).waitFor({ state: 'visible', timeout: 120_000 });
  await page.locator('canvas').first().waitFor({ state: 'visible' });
};

const cubeObject = (halfExtent: number): Uint8Array<ArrayBuffer> =>
  new TextEncoder().encode(`v -${halfExtent} -${halfExtent} -${halfExtent}
v ${halfExtent} -${halfExtent} -${halfExtent}
v ${halfExtent} ${halfExtent} -${halfExtent}
v -${halfExtent} ${halfExtent} -${halfExtent}
v -${halfExtent} -${halfExtent} ${halfExtent}
v ${halfExtent} -${halfExtent} ${halfExtent}
v ${halfExtent} ${halfExtent} ${halfExtent}
v -${halfExtent} ${halfExtent} ${halfExtent}
f 1 2 3 4
f 5 8 7 6
f 1 5 6 2
f 2 6 7 3
f 3 7 8 4
f 5 1 4 8
`);

const uploadObject = async (page: Page, bytes: Uint8Array<ArrayBuffer>): Promise<void> => {
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({
      buffer: Buffer.from(bytes),
      mimeType: 'model/obj',
      name: 'same-name.obj',
    });
  await page.getByText('same-name.obj', { exact: true }).waitFor({ state: 'visible', timeout: 120_000 });
  await page.locator('canvas').first().waitFor({ state: 'visible' });
};

const downloadGlb = async (
  desktopSession: DesktopSession,
  page: Page,
  name: string,
): Promise<Uint8Array<ArrayBuffer>> => {
  const format = page.getByLabel(/\(GLB\)$/u);
  await format.waitFor({ state: 'visible', timeout: 60_000 });
  const selectedFormats = page.locator('[id^="format-"][data-state="checked"]');
  // oxlint-disable-next-line no-await-in-loop -- The condition observes the controlled selection after each click.
  while ((await selectedFormats.count()) > 0) {
    // oxlint-disable-next-line no-await-in-loop -- Each click updates the controlled selection before the next query.
    await selectedFormats.first().click();
  }
  await format.click();
  const secondaryFormat = page.getByLabel(/\(OBJ\)$/u);
  await secondaryFormat.click();
  const zipPreference = page.getByLabel('Download as ZIP file', { exact: true });
  await zipPreference.waitFor({ state: 'visible' });
  if (await zipPreference.isChecked()) {
    await zipPreference.click();
  }
  await secondaryFormat.click();
  const path = join(dirname(desktopSession.homeRoot), `.e2e-${name}.glb`);
  const download = await captureNextDesktopDownload(desktopSession, path, async () =>
    page.getByRole('button', { name: 'Download', exact: true }).click(),
  );
  expect(download.filename).toMatch(/\.glb$/u);
  return Uint8Array.from(await readFile(path));
};

const glbPositionExtent = (bytes: Uint8Array<ArrayBuffer>): readonly number[] => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength))) as {
    accessors: ReadonlyArray<{ readonly max?: readonly number[]; readonly min?: readonly number[] }>;
    meshes: ReadonlyArray<{
      readonly primitives: ReadonlyArray<{ readonly attributes: { readonly POSITION: number } }>;
    }>;
  };
  const accessor = json.accessors[json.meshes[0]!.primitives[0]!.attributes.POSITION]!;
  if (!accessor.min || !accessor.max) {
    throw new Error('Converted GLB position accessor has no bounds');
  }
  return accessor.max.map((maximum, index) => maximum - accessor.min![index]!);
};

const readFixture = async (path: string): Promise<Uint8Array<ArrayBuffer>> => Uint8Array.from(await readFile(path));

const utilityProcesses = async (desktopSession: DesktopSession): Promise<ReadonlySet<number>> =>
  new Set(
    await desktopSession.application.evaluate(({ app }) =>
      app
        .getAppMetrics()
        .filter((metric) => metric.type === 'Utility' && metric.name === 'tau-kernel-host')
        .map((metric) => metric.pid),
    ),
  );

const waitForNewUtility = async (desktopSession: DesktopSession, before: ReadonlySet<number>): Promise<number> => {
  let added: number | undefined;
  await expect
    .poll(
      async () => {
        added = [...(await utilityProcesses(desktopSession))].find((pid) => !before.has(pid));
        return added;
      },
      { timeout: 60_000 },
    )
    .toBeDefined();
  if (added === undefined) {
    throw new Error('Packaged Electron application did not launch an owned runtime utility process');
  }
  return added;
};

test('[completed-artifact] isolates simultaneous converter clients with identical entry names', async () => {
  session = await launchDesktopApp({ packaged: true, token: 'simultaneous-ephemeral-probe' });
  const homeBefore = await directorySnapshot(session.homeRoot);
  const pickedBefore = await directorySnapshot(session.pickedDirectory);
  const utilitiesBeforeFirst = await utilityProcesses(session);
  await openConverter(session.page);
  const firstRuntimePid = await waitForNewUtility(session, utilitiesBeforeFirst);

  const bootstrap = await session.page.evaluate(() => {
    const shell = globalThis.window as unknown as {
      readonly ENV: Record<string, string>;
      readonly tau: { readonly nodeFs: { readonly homeRoot: string }; readonly runtimeKernelIds: readonly string[] };
    };
    return { env: shell.ENV, homeRoot: shell.tau.nodeFs.homeRoot, runtimeKernelIds: shell.tau.runtimeKernelIds };
  });
  const mainWindowBounds = await session.application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!.getBounds(),
  );
  const utilitiesBeforeSecond = await utilityProcesses(session);
  const nextWindow = session.application.waitForEvent('window');
  await session.application.evaluate(
    async ({ app, BrowserWindow }, options) => {
      const window = new BrowserWindow({
        height: options.bounds.height,
        show: true,
        width: options.bounds.width,
        webPreferences: {
          additionalArguments: [`--tau-bootstrap=${JSON.stringify(options.rendererBootstrap)}`],
          contextIsolation: true,
          nodeIntegration: false,
          preload: `${app.getAppPath()}/dist/preload/preload.mjs`,
          sandbox: false,
        },
      });
      await window.loadURL('app://tau/convert');
    },
    { bounds: mainWindowBounds, rendererBootstrap: bootstrap },
  );
  const secondPage = await nextWindow;
  secondPage.setDefaultTimeout(60_000);
  await secondPage.getByRole('heading', { name: '3D Model Converter' }).waitFor({ state: 'visible' });
  await declineCookieBanner(secondPage);
  await secondPage
    .getByText(/^[1-9]\d* formats supported$/u)
    .filter({ visible: true })
    .waitFor({ state: 'visible', timeout: 120_000 });
  const secondRuntimePid = await waitForNewUtility(session, utilitiesBeforeSecond);

  await Promise.all([uploadObject(session.page, cubeObject(1)), uploadObject(secondPage, cubeObject(3))]);
  const smallGlb = await downloadGlb(session, session.page, 'small');
  const largeGlb = await downloadGlb(session, secondPage, 'large');
  expect(glbPositionExtent(smallGlb)).toEqual([2, 2, 2]);
  expect(glbPositionExtent(largeGlb)).toEqual([6, 6, 6]);
  expect(await directorySnapshot(session.homeRoot)).toEqual(homeBefore);
  expect(await directorySnapshot(session.pickedDirectory)).toEqual(pickedBefore);
  await secondPage.close();
  await expect
    .poll(
      async () => {
        const utilities = await utilityProcesses(session!);
        return !utilities.has(secondRuntimePid);
      },
      { timeout: 60_000 },
    )
    .toBe(true);
  await session.page.goto('app://tau/');
  await expect
    .poll(
      async () => {
        const utilities = await utilityProcesses(session!);
        return !utilities.has(firstRuntimePid);
      },
      { timeout: 60_000 },
    )
    .toBe(true);
});

test('[completed-artifact] recovers a converter session after its utility process crashes', async () => {
  session = await launchDesktopApp({ packaged: true, token: 'ephemeral-crash-probe' });
  const utilitiesBefore = await utilityProcesses(session);
  await openConverter(session.page);
  await uploadNamedCube(session.page, await readFixture(cubePath));

  let runtimePid: number | undefined;
  await expect
    .poll(
      async () => {
        runtimePid = [...(await utilityProcesses(session!))].find((pid) => !utilitiesBefore.has(pid));
        return runtimePid;
      },
      { timeout: 60_000 },
    )
    .toBeDefined();
  if (runtimePid === undefined) {
    throw new Error('Packaged Electron application did not launch a runtime utility process');
  }
  const killedPid = runtimePid;
  process.kill(killedPid, 'SIGKILL');
  await expect
    .poll(
      async () => {
        const utilities = await utilityProcesses(session!);
        return utilities.has(killedPid);
      },
      { timeout: 60_000 },
    )
    .toBe(false);
  const utilitiesAfterCrash = await utilityProcesses(session);
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 2e3);
  });
  expect(await utilityProcesses(session)).toEqual(utilitiesAfterCrash);

  await session.page.goto('app://tau/');
  await openConverter(session.page);
  await uploadNamedCube(session.page, await readFixture(dracoCubePath));
  const recoveredGlb = await downloadGlb(session, session.page, 'recovered');
  expect(recoveredGlb.byteLength).toBeGreaterThan(500);
  expect(glbPositionExtent(recoveredGlb).every((extent) => extent > 0)).toBe(true);
});
