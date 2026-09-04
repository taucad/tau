/* eslint-disable @typescript-eslint/naming-convention -- Environment variables retain their wire names. */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import process from 'node:process';
import type { Page } from 'playwright';
import { afterEach, expect, test } from 'vitest';
import { getBoundingBoxFromInspect, getInspectReport, glbToDocument, validateGlbData } from '@taucad/runtime-testing';

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
  expectSignedIn,
  expectVisible,
  fileTreeItemOf,
  geometryCacheEntries,
  geometryCacheSnapshot,
  selectChatModel,
  selectKernel,
  submitPrompt,
  waitForProjectOnDisk,
} from '#support/scenario.js';

const modelEntry = 'model.obj';
const blockedMaterialEntry = 'materials/blocked.mtl';
const recoveredMaterialEntry = 'materials/recovered.mtl';
const finalMaterialEntry = 'materials/final.mtl';
const nativeBackendLog = 'libassimp backend=native addon=darwin-arm64-napi8';

const materialSource = `newmtl TauBlue
Ka 0 0 0
Kd 0 0 1
Ks 0 0 0
d 1
illum 1
`;

const objectSource = (size: number, material: string): string => `mtllib ${material}
o TauTriangle
usemtl TauBlue
v 0 0 0
v ${String(size)} 0 0
v 0 ${String(size)} 0
vn 0 0 1
f 1//1 2//1 3//1
`;

const waitForNewGeometry = async (sourcePath: string, before: ReadonlySet<string>): Promise<void> => {
  await expect
    .poll(() => geometryCacheEntries(sourcePath).some(({ actionDigest }) => !before.has(actionDigest)), {
      timeout: 120_000,
    })
    .toBe(true);
};

const openInViewer = async (page: Page, entryPath: string): Promise<void> => {
  await ensureFilesPane(page);
  const segments = entryPath.split('/');
  for (let index = 1; index < segments.length; index += 1) {
    const folder = fileTreeItemOf(page, segments.slice(0, index).join('/'));
    // oxlint-disable-next-line no-await-in-loop -- Nested folders must be expanded in order.
    await expectVisible(folder, 60_000);
    // oxlint-disable-next-line no-await-in-loop -- Each child is unavailable until its parent expands.
    if ((await folder.getAttribute('aria-expanded')) !== 'true') {
      // oxlint-disable-next-line no-await-in-loop -- React must publish each folder before the next lookup.
      await folder.click({ position: { x: 8, y: 14 } });
    }
  }

  const item = fileTreeItemOf(page, entryPath);
  await expectVisible(item, 60_000);
  await item.hover();
  await page.getByRole('button', { name: `Actions for ${basename(entryPath)}`, exact: true }).click();
  await page.getByRole('menuitem', { name: 'Open in Viewer', exact: true }).click();
  await expectVisible(page.locator(`.dv-tab[aria-label="${entryPath}"]`), 60_000);
};

type ExportExtension = 'glb' | 'ply';

const exportToProject = async (
  page: Page,
  projectRoot: string,
  options: Readonly<{ sourceEntry: string; extension: ExportExtension }>,
): Promise<string> => {
  const { extension, sourceEntry } = options;
  const exportRoot = join(projectRoot, 'exports');
  const fingerprint = (path: string): string =>
    `${String(statSync(path).mtimeMs)}:${createHash('sha256').update(readFileSync(path)).digest('hex')}`;
  const previous = new Map(
    existsSync(exportRoot)
      ? readdirSync(exportRoot)
          .filter((name) => name.endsWith(`.${extension}`))
          .map((name) => {
            const path = join(exportRoot, name);
            return [path, fingerprint(path)] as const;
          })
      : [],
  );

  const exportButton = page.getByRole('button', { name: 'Export', exact: true });
  if (await exportButton.isVisible().catch(() => false)) {
    await exportButton.click();
  }
  const source = page.getByRole('region', { name: 'Source' });
  await expectVisible(source, 30_000);
  const sourceSelector = source.getByRole('button').first();
  const selectedSource = await sourceSelector.textContent();
  if (!selectedSource?.includes(sourceEntry)) {
    await sourceSelector.click();
    await page.getByRole('option', { name: sourceEntry, exact: true }).click();
    await expect.poll(async () => sourceSelector.textContent()).toContain(sourceEntry);
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
        path = existsSync(exportRoot)
          ? (readdirSync(exportRoot)
              .filter((name) => name.endsWith(`.${extension}`))
              .map((name) => join(exportRoot, name))
              .find((candidate) => previous.get(candidate) !== fingerprint(candidate)) ?? '')
          : '';
        return path;
      },
      { timeout: 120_000 },
    )
    .not.toBe('');
  return path;
};

const openPendingFifoWriter = async (path: string): Promise<number> => {
  let descriptor: number | undefined;
  await expect
    .poll(
      () => {
        try {
          // oxlint-disable-next-line no-bitwise -- POSIX open flags are a bitmask.
          descriptor = openSync(path, constants.O_WRONLY | constants.O_NONBLOCK);
          return true;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENXIO') {
            return false;
          }
          throw error;
        }
      },
      { interval: 50, timeout: 120_000 },
    )
    .toBe(true);
  if (descriptor === undefined) {
    throw new Error(`Assimp never opened its filesystem sidecar: ${path}`);
  }
  return descriptor;
};

const expectTriangleGlb = async (path: string, size: number, color?: readonly number[]): Promise<void> => {
  const bytes = Uint8Array.from(readFileSync(path));
  validateGlbData(bytes);
  const document = await glbToDocument(bytes);
  const meshes = document.getRoot().listMeshes();
  expect(meshes).toHaveLength(1);
  const primitives = meshes[0]!.listPrimitives();
  expect(primitives).toHaveLength(1);
  const primitive = primitives[0]!;
  expect(primitive.getAttribute('POSITION')?.getCount()).toBe(3);
  expect(primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION')?.getCount()).toBe(3);
  if (color !== undefined) {
    expect(primitive.getMaterial()?.getBaseColorFactor()).toEqual(color);
  }
  expect(getBoundingBoxFromInspect(await getInspectReport(bytes))).toEqual({
    size: [size, size, 0],
    center: [size / 2, size / 2, 0],
  });
};

const openConsole = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  const search = page.getByPlaceholder('Search projects, chats, and actions...');
  await search.fill('Open console');
  await page.getByText('Open console', { exact: true }).click();
};

const expectLiveRuntime = async (page: Page): Promise<void> => {
  await expectCount(page.getByText('RuntimeClient has been terminated.', { exact: true }), 0);
  await expectCount(
    page.getByText(
      'The isolated runtime host did not recover from an operation timeout and was terminated. Create a new RuntimeClient before issuing more work.',
      { exact: true },
    ),
    0,
  );
  await expectCount(page.getByRole('alert', { name: 'CAD runtime error' }), 0, 120_000);
};

let session: DesktopSession | undefined;
let fixture: GatewayFixture | undefined;
let seededEmail: string | undefined;
let fifoWriter: number | undefined;

const closeFifoWriter = (): void => {
  if (fifoWriter === undefined) {
    return;
  }
  closeSync(fifoWriter);
  fifoWriter = undefined;
};

afterEach(async () => {
  closeFifoWriter();
  await session?.close();
  session = undefined;
  await fixture?.close();
  fixture = undefined;
  if (seededEmail) {
    await deleteTauTestUser(seededEmail);
    seededEmail = undefined;
  }
});

test.skipIf(process.platform !== 'darwin' || process.arch !== 'arm64')(
  'should keep packaged Assimp alive across async sidecar cancellation, native exports, and reconnect',
  async () => {
    const account = tauTestAccount('assimp');
    seededEmail = account.email;
    const token = await seedTauTestUser(account);
    session = await launchDesktopApp({
      token,
      packaged: true,
      env: {
        PATH: '/usr/bin:/bin',
        TAU_DEBUG: 'true',
        TAU_E2E_DISABLE_CREDENTIAL_PERSISTENCE: '1',
      },
    });
    const { page } = session;
    fixture = await installGatewayFixture(page);

    try {
      await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
      await declineCookieBanner(page);
      await authenticatePackagedDesktop(session, token);
      await expectSignedIn(page);
      await selectKernel(page, 'OpenSCAD');
      await connectPickedFolder(session);
      await selectChatModel(page, gatewayFixtureModelName);

      const slug = await submitPrompt(page, 'Create the project used for the packaged Assimp regression.');
      const scaffoldPath = await waitForProjectOnDisk(session.pickedDirectory, slug, { extension: '.scad' });
      const projectRoot = dirname(scaffoldPath);
      await expectVisible(page.getByText(gatewayFixtureFinalText, { exact: true }), 420_000);

      const materialsRoot = join(projectRoot, 'materials');
      const modelPath = join(projectRoot, modelEntry);
      const blockedMaterialPath = join(projectRoot, blockedMaterialEntry);
      mkdirSync(materialsRoot);
      writeFileSync(join(projectRoot, recoveredMaterialEntry), materialSource, 'utf8');
      writeFileSync(join(projectRoot, finalMaterialEntry), materialSource, 'utf8');
      const fifo = spawnSync('/usr/bin/mkfifo', [blockedMaterialPath], { encoding: 'utf8' });
      expect(fifo.status, fifo.stderr).toBe(0);
      writeFileSync(modelPath, objectSource(1, blockedMaterialEntry), 'utf8');

      await openInViewer(page, modelEntry);
      // A nonblocking FIFO writer succeeds only after Tau's Node filesystem has
      // opened the read side. Keeping it open with no bytes holds that Promise.
      fifoWriter = await openPendingFifoWriter(blockedMaterialPath);

      const beforeRecovery = geometryCacheSnapshot(modelPath);
      // Watcher supersession aborts the held conversion. The new render and
      // export must complete while the cancelled filesystem read is still held.
      writeFileSync(modelPath, objectSource(2, recoveredMaterialEntry), 'utf8');
      await waitForNewGeometry(modelPath, beforeRecovery);

      const recoveredGlbPath = await exportToProject(page, projectRoot, {
        sourceEntry: modelEntry,
        extension: 'glb',
      });
      expect(recoveredGlbPath).toBe(join(projectRoot, 'exports/model.glb'));
      await expectTriangleGlb(recoveredGlbPath, 2, [0, 0, 1, 1]);
      const firstPlyPath = await exportToProject(page, projectRoot, {
        sourceEntry: modelEntry,
        extension: 'ply',
      });
      expect(firstPlyPath).toBe(join(projectRoot, 'exports/result.ply'));
      const firstPly = readFileSync(firstPlyPath);

      // EOF now settles the cancelled resolver late. The next conversion proves
      // that settlement neither resumes stale work nor poisons the client.
      closeFifoWriter();
      unlinkSync(blockedMaterialPath);
      const beforeRepeat = geometryCacheSnapshot(modelPath);
      writeFileSync(modelPath, objectSource(3, finalMaterialEntry), 'utf8');
      await waitForNewGeometry(modelPath, beforeRepeat);
      const repeatedPlyPath = await exportToProject(page, projectRoot, {
        sourceEntry: modelEntry,
        extension: 'ply',
      });
      expect(repeatedPlyPath).toBe(firstPlyPath);
      expect(readFileSync(repeatedPlyPath)).not.toEqual(firstPly);
      await expectLiveRuntime(page);

      await openConsole(page);
      const modelConsole = page.getByRole('button', { name: modelEntry, exact: true });
      await expectVisible(modelConsole, 60_000);
      if ((await modelConsole.getAttribute('aria-expanded')) !== 'true') {
        await modelConsole.click();
      }
      const modelLog = page.getByRole('log', { name: `Console logs for ${modelEntry}` });
      await expectVisible(modelLog, 60_000);
      await expectCount(modelLog.getByText(nativeBackendLog, { exact: true }), 1);
      await expectCount(modelLog.getByText('Transcoding glb -> ply', { exact: true }), 2);
      await expectCount(modelLog.getByText('Successfully transcoded to ply', { exact: true }), 2);

      // The cache is project-wide; nested exports do not own an exports/.tau cache.
      const beforePlyOpen = geometryCacheSnapshot(modelPath);
      await openInViewer(page, 'exports/result.ply');
      await waitForNewGeometry(modelPath, beforePlyOpen);
      await page.reload();
      await expectVisible(page.locator('.dv-tab[aria-label="exports/result.ply"]'), 60_000);
      await expectVisible(page.getByTestId('cad-viewer-canvas-region').locator('canvas').first(), 120_000);
      const roundTripGlbPath = await exportToProject(page, projectRoot, {
        sourceEntry: 'exports/result.ply',
        extension: 'glb',
      });
      expect(roundTripGlbPath).toBe(join(projectRoot, 'exports/model.glb'));
      await expectTriangleGlb(roundTripGlbPath, 3);

      await expectLiveRuntime(page);
      expect(session.application.windows()).toHaveLength(1);
      await session.capture('assimp-packaged-success');
    } catch (error) {
      await session.capture('assimp-packaged-failure');
      throw error;
    }
  },
  900_000,
);
