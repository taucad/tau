/* eslint-disable @typescript-eslint/naming-convention -- Environment variables retain their wire names. */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { Page } from 'playwright';
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { getBoundingBoxFromInspect, getInspectReport, validateGlbData } from '@taucad/runtime-testing';

import { authenticatePackagedDesktop, launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import { gatewayFixtureFinalText, gatewayFixtureModelName, startGatewayFixture } from '#support/gateway-fixture.js';
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

type KernelCase = Readonly<{
  extension: 'scad' | 'ts';
  kernel: 'OpenRSCAD' | 'JSCAD' | 'Manifold' | 'Replicad';
  source: string;
  size: readonly [number, number, number];
}>;

const cases: readonly KernelCase[] = [
  { kernel: 'OpenRSCAD', extension: 'scad', source: 'cube([12, 8, 6]);', size: [0.012, 0.006, 0.008] },
  {
    kernel: 'JSCAD',
    extension: 'ts',
    source: `import { primitives } from '@jscad/modeling';
export default function main() { return primitives.cuboid({ size: [14, 9, 5] }); }
`,
    size: [0.014, 0.005, 0.009],
  },
  {
    kernel: 'Manifold',
    extension: 'ts',
    source: `import { Manifold } from 'manifold-3d/manifoldCAD';
export default function main() { return Manifold.cube([16, 10, 7], true); }
`,
    size: [0.016, 0.007, 0.01],
  },
  {
    kernel: 'Replicad',
    extension: 'ts',
    source: `import { makeBox } from 'replicad';
export default function main() { return makeBox([0, 0, 0], [18, 11, 8]); }
`,
    size: [0.018, 0.008, 0.011],
  },
];

let session: DesktopSession | undefined;
let fixture: GatewayFixture | undefined;
const account = tauTestAccount('main-editor-kernels');
let token = '';

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

const exportGlbToProject = async (page: Page, projectRoot: string): Promise<Uint8Array<ArrayBuffer>> => {
  const exportRoot = join(projectRoot, 'exports');
  const digest = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');
  const previous = new Map(
    existsSync(exportRoot)
      ? readdirSync(exportRoot)
          .filter((name) => name.endsWith('.glb'))
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
  const glb = formats.getByRole('button', { name: 'glb', exact: true });
  for (const selected of await formats.locator('button[aria-pressed="true"]').all()) {
    // oxlint-disable-next-line no-await-in-loop -- The format toggles update sequential React state.
    const selectedFormat = await selected.textContent();
    if (selectedFormat?.trim().toLowerCase() !== 'glb') {
      // oxlint-disable-next-line no-await-in-loop -- Each toggle must settle before export.
      await selected.click();
    }
  }
  if ((await glb.getAttribute('aria-pressed')) !== 'true') {
    await glb.click();
  }
  const download = page.getByLabel('Download to disk');
  if (await download.isChecked()) {
    await download.click();
  }
  const save = page.getByLabel('Save to project');
  if (!(await save.isChecked())) {
    await save.click();
  }
  await page.getByRole('button', { name: 'Export GLB', exact: true }).click();
  let path = '';
  await expect
    .poll(
      () => {
        path = existsSync(exportRoot)
          ? (readdirSync(exportRoot)
              .filter((name) => name.endsWith('.glb'))
              .map((name) => join(exportRoot, name))
              .find((candidate) => !previous.has(candidate) || previous.get(candidate) !== digest(candidate)) ?? '')
          : '';
        return path;
      },
      { timeout: 120_000 },
    )
    .not.toBe('');
  return new Uint8Array(readFileSync(path));
};

const expectNativeOpenRscadEngine = async (logPath: string): Promise<void> => {
  await expect
    .poll(
      async () => {
        const log = await readFile(logPath, 'utf8').catch(() => '');
        const entries = log.split('\n').filter((entry) => entry.includes('kernel.engine'));
        for (const entry of entries) {
          const engine = JSON.parse(entry.slice(entry.indexOf('{'))) as {
            readonly backend?: string;
            readonly kernelId?: string;
            readonly native?: boolean;
            readonly version?: string;
          };
          if (engine.kernelId === 'openrscad') {
            return engine.backend === 'native' && engine.native === true && Boolean(engine.version?.trim());
          }
        }
        return false;
      },
      { timeout: 120_000 },
    )
    .toBe(true);
};

test.for(cases)(
  '[completed-artifact] renders and exports $kernel in the main editor',
  async (kernelCase: KernelCase) => {
    fixture = await startGatewayFixture({ targetFile: `main.${kernelCase.extension}`, content: kernelCase.source });
    session = await launchDesktopApp({
      packaged: true,
      token,
      env: { TAU_E2E_DISABLE_CREDENTIAL_PERSISTENCE: '1' },
    });
    await fixture.routeThrough(session.page);

    const { page } = session;
    try {
      await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
      await declineCookieBanner(page);
      await authenticatePackagedDesktop(session, token);
      await expectSignedIn(page);
      await selectKernel(page, kernelCase.kernel === 'OpenRSCAD' ? 'OpenSCAD' : kernelCase.kernel);
      await connectPickedFolder(session);
      await selectChatModel(page, gatewayFixtureModelName);
      const slug = await submitPrompt(page, `Create the ${kernelCase.kernel} main-editor fixture.`);
      const sourcePath = await waitForProjectOnDisk(session.pickedDirectory, slug, {
        extension: `.${kernelCase.extension}`,
      });
      await expectVisible(page.getByText(gatewayFixtureFinalText, { exact: true }), 420_000);
      await expectVisible(page.getByTestId('cad-viewer-canvas-region').locator('canvas'), 120_000);

      const bytes = await exportGlbToProject(page, dirname(sourcePath));
      validateGlbData(bytes);
      const size = getBoundingBoxFromInspect(await getInspectReport(bytes))?.size;
      expect(size).toBeDefined();
      for (const [index, expected] of kernelCase.size.entries()) {
        expect(size![index]).toBeCloseTo(expected, 6);
      }
      if (kernelCase.kernel === 'OpenRSCAD') {
        await expectNativeOpenRscadEngine(session.logPath);
      }
    } catch (error) {
      await session.capture(`main-editor-${kernelCase.kernel.toLowerCase()}-failure`);
      throw error;
    }
  },
);
