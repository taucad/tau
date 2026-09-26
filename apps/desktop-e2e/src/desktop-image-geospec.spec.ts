import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, expect, test } from 'vitest';
import { validateGlbData } from '@taucad/runtime-testing';

import { authenticatePackagedDesktop, launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import {
  failedGatewayToolResults,
  gatewayFixtureFinalText,
  gatewayFixtureModelName,
  startGatewayFixture,
} from '#support/gateway-fixture.js';
import type { GatewayFixture } from '#support/gateway-fixture.js';
import { deleteTauTestUser, seedTauTestUser, tauTestAccount } from '#support/tau-account.js';
import {
  connectPickedFolder,
  expectCount,
  expectSignedIn,
  expectVisible,
  selectChatModel,
  selectKernel,
  submitPrompt,
} from '#support/scenario.js';

const solidSource = `import { drawCircle } from 'replicad';
export default function main() {
  return drawCircle(10).sketchOnPlane().extrude(10);
}
`;
const disableCredentialPersistenceVariable = 'TAU_E2E_DISABLE_CREDENTIAL_PERSISTENCE';
const drawingSource = `import { draw } from 'replicad';
export default function main() {
  return draw().hLine(24).vLine(18).hLine(-24).close();
}
`;
const geoSpecSource = `import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('packaged desktop geometry', () => {
  it('keeps the cylinder watertight', async () => {
    const model = await loadModel({ file: 'main.ts', format: 'glb' });
    expectGeo(model).toBeWatertight();
  });

  it('reports an intentionally impossible volume', async () => {
    const model = await loadModel({ file: 'main.ts', format: 'glb' });
    expectGeo(model).toHaveVolume({ value: 1, tolerance: 0 });
  });
});
`;

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

test('[completed-artifact] captures SVG and GLB geometry and reports GeoSpec pass and failure evidence', async () => {
  const account = tauTestAccount('image-geospec');
  seededEmail = account.email;
  const token = await seedTauTestUser(account);
  fixture = await startGatewayFixture({
    toolCalls: [
      { name: 'create_file', input: { targetFile: 'main.ts', content: solidSource } },
      { name: 'create_file', input: { targetFile: 'drawing.ts', content: drawingSource } },
      { name: 'create_file', input: { targetFile: 'checks.geospec.ts', content: geoSpecSource } },
      { name: 'get_kernel_result', input: { targetFile: 'main.ts' } },
      { name: 'get_kernel_result', input: { targetFile: 'drawing.ts' } },
      { name: 'export_geometry', input: { targetFile: 'main.ts', format: 'glb' } },
      { name: 'screenshot', input: { targetFile: 'main.ts', mode: 'single' } },
      { name: 'screenshot', input: { targetFile: 'drawing.ts', mode: 'single' } },
      { name: 'test_model', input: { files: ['checks.geospec.ts'] } },
    ],
  });
  session = await launchDesktopApp({
    packaged: true,
    token,
    env: {
      [disableCredentialPersistenceVariable]: '1',
    },
  });
  await session.page.addInitScript(() => {
    Object.defineProperty(navigator, 'gpu', { configurable: true, value: undefined });
  });
  await session.page.reload({ waitUntil: 'domcontentloaded' });
  await fixture.routeThrough(session.page);

  const { page } = session;
  try {
    expect(await page.evaluate(() => (navigator as Navigator & { gpu?: unknown }).gpu)).toBeUndefined();
    await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
    await authenticatePackagedDesktop(session, token);
    await expectSignedIn(page);
    await selectKernel(page, 'Replicad');
    await connectPickedFolder(session);
    await selectChatModel(page, gatewayFixtureModelName);
    const slug = await submitPrompt(page, 'Create and verify the packaged image capture fixtures.');

    await expectVisible(page.getByText(gatewayFixtureFinalText, { exact: true }), 600_000);
    const failedTools = failedGatewayToolResults(fixture.gatewayRequests.slice(-1));
    if (failedTools.length > 0) {
      throw new Error(`Packaged agent tools failed: ${failedTools.join('\n')}`);
    }
    const screenshotActivities = page.getByRole('button', { name: 'Captured images', exact: true });
    for (const activity of await screenshotActivities.all()) {
      // oxlint-disable-next-line no-await-in-loop -- Each disclosure must open before its child result is queried.
      await activity.click();
    }
    const glbCapture = page.getByRole('button', { name: /Captured 1 screenshot of main\.ts/u });
    const svgCapture = page.getByRole('button', { name: /Captured 1 screenshot of drawing\.ts/u });
    await expectVisible(glbCapture);
    await expectVisible(svgCapture);
    await glbCapture.click();
    await svgCapture.click();
    const isometricCapture = page.getByRole('img', { name: 'isometric view' });
    const drawingCapture = page.getByRole('img', { name: 'drawing view' });
    await expectCount(isometricCapture, 1);
    await expectCount(drawingCapture, 1);
    expect(
      await isometricCapture.or(drawingCapture).evaluateAll((images) =>
        images.every((image) => {
          const element = image as HTMLImageElement;
          return (
            element.complete &&
            element.naturalWidth >= 32 &&
            element.naturalHeight >= 32 &&
            element.currentSrc.length > 100
          );
        }),
      ),
    ).toBe(true);
    await page.getByRole('button', { name: 'Ran tests', exact: true }).click();
    await expectVisible(page.getByText('Tested 2 requirements', { exact: true }), 300_000);
    const results = page.locator('[data-target-file="checks.geospec.ts"]');
    const passingRequirement = results.getByText(/keeps the cylinder watertight$/u);
    const failingRequirement = results.getByText(/reports an intentionally impossible volume$/u);
    await expectVisible(passingRequirement);
    await expectVisible(failingRequirement);
    await expectCount(
      passingRequirement.locator('xpath=ancestor::div[contains(@class, "items-start")][1]').locator('.lucide-check'),
      1,
    );
    await expectCount(
      failingRequirement.locator('xpath=ancestor::div[contains(@class, "items-start")][1]').locator('.lucide-x'),
      1,
    );
    await expectCount(page.getByText(/Volume is .*does not satisfy 1 within 0\./u), 1);
    expect(fixture.gatewayRequests.length).toBeGreaterThanOrEqual(10);
    const projectRoot = join(session.pickedDirectory, slug);
    const projectEntries = await readdir(projectRoot, { recursive: true });
    const exportedGlb = projectEntries.map(String).find((entry) => /^\.tau\/artifacts\/.+\.glb$/u.test(entry));
    if (!exportedGlb) {
      throw new Error('export_geometry did not persist a GLB under .tau/artifacts.');
    }
    validateGlbData(new Uint8Array(await readFile(join(projectRoot, exportedGlb))));
    const offeredToolNames = fixture.gatewayRequests.flatMap((request) => {
      const tools = (request as { readonly tools?: ReadonlyArray<{ readonly name?: unknown }> }).tools ?? [];
      return tools.flatMap((tool) => (typeof tool.name === 'string' ? [tool.name] : []));
    });
    expect(offeredToolNames).toEqual(
      expect.arrayContaining(['get_kernel_result', 'export_geometry', 'screenshot', 'test_model']),
    );
    const gatewayRequestCount = fixture.gatewayRequests.length;

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expectVisible(page.getByText(gatewayFixtureFinalText, { exact: true }), 120_000);
    const replayedScreenshotActivities = page.getByRole('button', { name: 'Captured images', exact: true });
    for (const activity of await replayedScreenshotActivities.all()) {
      // oxlint-disable-next-line no-await-in-loop -- Each disclosure must open before its child result is queried.
      await activity.click();
    }
    await expectVisible(page.getByRole('button', { name: /Captured 1 screenshot of main\.ts/u }));
    await expectVisible(page.getByRole('button', { name: /Captured 1 screenshot of drawing\.ts/u }));
    await page.getByRole('button', { name: 'Ran tests', exact: true }).click();
    const replayedResults = page.locator('[data-target-file="checks.geospec.ts"]');
    await expectVisible(replayedResults.getByText(/keeps the cylinder watertight$/u));
    await expectVisible(replayedResults.getByText(/reports an intentionally impossible volume$/u));
    expect(fixture.gatewayRequests).toHaveLength(gatewayRequestCount);
  } catch (error) {
    await session.capture('image-geospec-packaged-failure');
    throw error;
  }
});
