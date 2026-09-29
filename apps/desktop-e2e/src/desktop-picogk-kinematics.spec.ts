import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import { gatewayFixtureFinalText, gatewayFixtureModelName, startGatewayFixture } from '#support/gateway-fixture.js';
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
  waitForProjectOnDisk,
} from '#support/scenario.js';

const exampleRoot = resolve(import.meta.dirname, '../../../libs/tau-examples/src/kernels/picogk/turbofan');
const source = readFileSync(join(exampleRoot, 'main.cs'), 'utf8');
const assembly = readFileSync(join(exampleRoot, 'assembly.json'), 'utf8');
const unitId = 'file:main.cs';

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
  }
  seededEmail = undefined;
});

test.skipIf(process.platform !== 'darwin' || process.arch !== 'arm64')(
  'animates the named PicoGK turbofan in a built desktop app',
  async () => {
    const account = tauTestAccount('picogk-kinematics');
    seededEmail = account.email;
    const token = await seedTauTestUser(account);
    fixture = await startGatewayFixture({
      toolCalls: [
        { name: 'create_file', input: { targetFile: 'assembly.json', content: assembly } },
        { name: 'create_file', input: { targetFile: 'main.cs', content: source } },
      ],
    });
    session = await launchDesktopApp({ token });
    await fixture.routeThrough(session.page);
    const { page } = session;
    try {
      await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
      await expectSignedIn(page);
      await selectKernel(page, 'PicoGK');
      await connectPickedFolder(session);
      await selectChatModel(page, gatewayFixtureModelName);
      const slug = await submitPrompt(page, 'Create the two-spool turbofan from this local reference.');
      const sourcePath = await waitForProjectOnDisk(session.pickedDirectory, slug, { extension: '.cs' });
      await expect.poll(() => readFileSync(sourcePath, 'utf8'), { timeout: 120_000 }).toBe(source);
      await expectVisible(page.getByText(gatewayFixtureFinalText, { exact: true }), 420_000);
      await expectVisible(page.getByTestId('cad-viewer-canvas-region').locator('canvas'), 180_000);
      await expectCount(page.getByRole('alert', { name: 'CAD runtime error' }), 0, 180_000);

      await page.keyboard.press('Control+m');
      await expectVisible(page.getByTestId('kinematics-pane'), 60_000);
      await expect
        .poll(async () => page.locator('[data-testid^="kinematics-dof-"]').count(), { timeout: 60_000 })
        .toBe(2);
      const bridge = async () =>
        page.evaluate((id) => {
          const api = (
            globalThis as typeof globalThis & {
              __TAU_KINEMATICS_TEST__?: {
                getState(unit: string): { revision: number; coordinates: Record<string, number> } | undefined;
                getComponentWorldMatrix(unit: string, component: string): number[] | undefined;
                projectComponent(unit: string, component: string): { x: number; y: number } | undefined;
              };
            }
          ).__TAU_KINEMATICS_TEST__;
          return {
            state: api?.getState(id),
            fixed: api?.getComponentWorldMatrix(id, 'component:picogk-1'),
            lp: api?.getComponentWorldMatrix(id, 'component:picogk-5'),
            hp: api?.getComponentWorldMatrix(id, 'component:picogk-322'),
            hoverPoint: api?.projectComponent(id, 'component:picogk-5'),
          };
        }, unitId);
      await expect
        .poll(
          async () => {
            const current = await bridge();
            return current.hp;
          },
          { timeout: 60_000 },
        )
        .toBeDefined();
      const before = await bridge();
      expect(before.fixed).toBeDefined();
      expect(before.lp).toBeDefined();

      await page.getByRole('button', { name: /^Animation:/u }).click();
      await page.getByRole('option', { name: 'Two spool rotation' }).click();
      const play = page.getByTestId('kinematics-play');
      if ((await play.count()) > 0) {
        await play.click();
      }
      await expectVisible(page.getByTestId('kinematics-pause'), 10_000);
      await expect
        .poll(
          async () => {
            const current = await bridge();
            return current.state?.revision ?? 0;
          },
          { timeout: 30_000 },
        )
        .toBeGreaterThan(before.state?.revision ?? 0);
      const after = await bridge();
      const changed = (a: number[], b: number[]): number =>
        Math.max(...a.map((value, index) => Math.abs(value - b[index]!)));
      expect(changed(after.lp!, before.lp!)).toBeGreaterThan(1e-5);
      expect(changed(after.hp!, before.hp!)).toBeGreaterThan(1e-5);
      expect(changed(after.fixed!, before.fixed!)).toBeLessThan(1e-6);
      expect(after.state?.coordinates['lowPressureSpin']).not.toBe(0);
      expect(after.state?.coordinates['highPressureSpin']).not.toBe(0);

      if (after.hoverPoint) {
        await page.mouse.move(after.hoverPoint.x, after.hoverPoint.y);
        await expectVisible(page.getByTestId('model-component-name-badge'), 10_000);
        expect(await page.getByTestId('model-component-name-badge').textContent()).toContain('fan/rearRetainer #001');
      } else {
        throw new Error('PicoGK fan surface was not projected into the viewport.');
      }
      await session.capture('picogk-turbofan-kinematics-playback');
    } catch (error) {
      await session.capture('picogk-turbofan-kinematics-failure');
      throw error;
    }
  },
  900_000,
);
