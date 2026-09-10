/* eslint-disable @typescript-eslint/naming-convention -- Environment variables retain their wire names. */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';

import { authenticatePackagedDesktop, captureNextDesktopDownload, launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import { gatewayFixtureModelName, startGatewayFixture } from '#support/gateway-fixture.js';
import type { GatewayFixture } from '#support/gateway-fixture.js';
import { deleteTauTestUser, seedTauTestUser, tauTestAccount } from '#support/tau-account.js';
import {
  connectPickedFolder,
  declineCookieBanner,
  expectSignedIn,
  expectVisible,
  selectChatModel,
  selectKernel,
  submitPrompt,
  waitForProjectOnDisk,
} from '#support/scenario.js';

const account = tauTestAccount('thumbnail-lifecycle');
const glbSource = `import { makeBox } from 'replicad';
export default function main() { return makeBox([0, 0, 0], [18, 12, 7]); }
`;
const svgSource = `import { draw } from 'replicad';
export default function main() { return draw().hLine(24).vLine(18).hLine(-24).close(); }
`;

let token = '';
let session: DesktopSession | undefined;
let fixture: GatewayFixture | undefined;

beforeAll(async () => {
  token = await seedTauTestUser(account);
});

afterEach(async () => {
  await session?.close();
  session = undefined;
  await fixture?.close();
  fixture = undefined;
});

afterAll(async () => {
  await deleteTauTestUser(account.email);
});

const openCommand = async (desktopSession: DesktopSession, label: string): Promise<void> => {
  await desktopSession.page
    .getByRole('button', { name: /Search/u })
    .first()
    .click();
  const search = desktopSession.page.getByPlaceholder('Search projects, chats, and actions...');
  await search.fill(label);
  const command = desktopSession.page.getByRole('option', { name: label, exact: true });
  await command.waitFor({ state: 'visible' });
  await expect
    .poll(async () => command.evaluate((element) => element.dataset['disabled']), { timeout: 180_000 })
    .toBe('false');
  if ((await command.evaluate((element) => element.dataset['selected'])) !== 'true') {
    await search.press('ArrowDown');
  }
  await expect.poll(async () => command.evaluate((element) => element.dataset['selected'])).toBe('true');
  await search.press('Enter');
};

const expectPng = (bytes: Uint8Array<ArrayBuffer>): void => {
  expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  expect(bytes.byteLength).toBeGreaterThan(100);
};

const expectWebp = (bytes: Uint8Array<ArrayBuffer>): void => {
  expect(new TextDecoder().decode(bytes.subarray(0, 4))).toBe('RIFF');
  expect(new TextDecoder().decode(bytes.subarray(8, 12))).toBe('WEBP');
  expect(bytes.byteLength).toBeGreaterThan(100);
};

const launchProject = async (source: string, prompt: string, geometry: 'glb' | 'svg'): Promise<string> => {
  fixture = await startGatewayFixture({ targetFile: 'main.ts', content: source });
  session = await launchDesktopApp({
    packaged: true,
    token,
    env: {
      TAU_E2E_DISABLE_CREDENTIAL_PERSISTENCE: '1',
    },
  });
  await fixture.routeThrough(session.page);
  await expectVisible(session.page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
  await declineCookieBanner(session.page);
  await authenticatePackagedDesktop(session, token);
  await expectSignedIn(session.page);
  await selectKernel(session.page, 'Replicad');
  await connectPickedFolder(session);
  await selectChatModel(session.page, gatewayFixtureModelName);
  const slug = await submitPrompt(session.page, prompt);
  const sourcePath = await waitForProjectOnDisk(session.pickedDirectory, slug, { extension: '.ts' });
  await expectVisible(
    geometry === 'glb'
      ? session.page.getByTestId('cad-viewer-canvas-region').locator('canvas')
      : session.page.locator("svg #panzoom-root g[data-slot='geometry'] path"),
    180_000,
  );
  return dirname(sourcePath);
};

test('[completed-artifact] generates automatic and manual GLB thumbnails and downloads a real PNG', async () => {
  const projectRoot = await launchProject(glbSource, 'Create the packaged GLB thumbnail fixture.', 'glb');
  const thumbnailPath = join(projectRoot, 'thumbnail.webp');
  await expect.poll(() => existsSync(thumbnailPath), { timeout: 180_000 }).toBe(true);
  expectWebp(new Uint8Array(readFileSync(thumbnailPath)));

  const automaticMtime = statSync(thumbnailPath).mtimeMs;
  await openCommand(session!, 'Update thumbnail');
  await expectVisible(session!.page.getByText('Thumbnail updated', { exact: true }), 180_000);
  await expect.poll(() => statSync(thumbnailPath).mtimeMs, { timeout: 180_000 }).toBeGreaterThan(automaticMtime);
  expectWebp(new Uint8Array(readFileSync(thumbnailPath)));

  const downloadPath = join(dirname(session!.homeRoot), '.e2e-glb-thumbnail.png');
  const download = await captureNextDesktopDownload(session!, downloadPath, async () =>
    openCommand(session!, 'Download PNG'),
  );
  expect(download.filename).toMatch(/\.png$/u);
  expectPng(new Uint8Array(await readFile(download.path)));
});

test('[completed-artifact] generates automatic and manual SVG thumbnails and downloads a real PNG', async () => {
  const projectRoot = await launchProject(svgSource, 'Create the packaged SVG image fixture.', 'svg');
  const thumbnailPath = join(projectRoot, 'thumbnail.webp');
  await expect.poll(() => existsSync(thumbnailPath), { timeout: 180_000 }).toBe(true);
  expectWebp(new Uint8Array(readFileSync(thumbnailPath)));

  const automaticMtime = statSync(thumbnailPath).mtimeMs;
  await openCommand(session!, 'Update thumbnail');
  await expectVisible(session!.page.getByText('Thumbnail updated', { exact: true }), 180_000);
  await expect.poll(() => statSync(thumbnailPath).mtimeMs, { timeout: 180_000 }).toBeGreaterThan(automaticMtime);
  expectWebp(new Uint8Array(readFileSync(thumbnailPath)));

  const downloadPath = join(dirname(session!.homeRoot), '.e2e-svg-thumbnail.png');
  const download = await captureNextDesktopDownload(session!, downloadPath, async () =>
    openCommand(session!, 'Download PNG'),
  );
  expect(download.filename).toMatch(/\.png$/u);
  expectPng(new Uint8Array(await readFile(download.path)));
});
