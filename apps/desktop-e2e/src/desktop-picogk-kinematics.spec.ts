import { readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
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
const manualKinematics = process.env['TAU_E2E_KINEMATICS_MANUAL'] === 'true';
const manualWindowTitle = manualKinematics ? 'Tau native PicoGK turbofan manual' : undefined;

let session: DesktopSession | undefined;
let fixture: GatewayFixture | undefined;
let seededEmail: string | undefined;

afterEach(async () => {
  try {
    await session?.close();
  } finally {
    session = undefined;
    try {
      await fixture?.close();
    } finally {
      fixture = undefined;
      const email = seededEmail;
      seededEmail = undefined;
      if (email) {
        await deleteTauTestUser(email);
      }
    }
  }
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
    session = await launchDesktopApp({ token, visible: manualKinematics, windowTitle: manualWindowTitle });
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

      if (manualKinematics) {
        const projectRoot = dirname(sourcePath);
        await expect
          .poll(() => readFileSync(join(projectRoot, 'assembly.json'), 'utf8'), { timeout: 60_000 })
          .toBe(assembly);
        const specBytes = await readFile(new URL('desktop-picogk-kinematics.spec.ts', import.meta.url));
        const sourceSha256 = createHash('sha256').update(source).digest('hex');
        const assemblySha256 = createHash('sha256').update(assembly).digest('hex');
        const specSha256 = createHash('sha256').update(specBytes).digest('hex');
        const identity = await page.evaluate(() => {
          const state = { requests: [] as Array<{ action: 'screenshot' | 'end'; gesture: string }> };
          Object.assign(globalThis, { __tauKinematicsManual: state });
          document.title = 'Tau native PicoGK turbofan manual';
          const controls = document.createElement('aside');
          controls.setAttribute('aria-label', 'Kinematics fixture controls');
          controls.style.cssText =
            'position:fixed;top:8px;right:8px;z-index:2147483647;background:white;color:black;padding:8px;border:1px solid black';
          const gesture = document.createElement('input');
          gesture.setAttribute('aria-label', 'Gesture checkpoint name');
          gesture.placeholder = 'Gesture checkpoint name';
          controls.append(gesture);
          for (const action of ['screenshot', 'end'] as const) {
            const button = document.createElement('button');
            button.textContent = `Fixture ${action}`;
            button.addEventListener('click', () => {
              if (action === 'screenshot' && !gesture.value.trim()) {
                gesture.focus();
                return;
              }
              if (state.requests.length < 16) {
                state.requests.push({ action, gesture: gesture.value.trim().slice(0, 160) });
              }
            });
            controls.append(button);
          }
          document.body.append(controls);
          return { href: location.href, title: document.title, timeOrigin: performance.timeOrigin };
        });
        const deadline = Date.now() + 240_000;
        const receipt = {
          identity,
          windowTitle: manualWindowTitle,
          deadline,
          projectRoot,
          sourcePath,
          homeRoot: session.homeRoot,
          pickedDirectory: session.pickedDirectory,
          electronPid: session.application.process().pid,
          logPath: session.logPath,
          sourceSha256,
          assemblySha256,
          specSha256,
          unitId,
          instructions:
            'Principal opens kinematics (Control+m), selects Two spool rotation, plays/pauses, adjusts coordinates and hovers rotor. Driver performs only explicit named screenshots/end; no physical print.',
        };
        await writeFile(join(session.homeRoot, 'kinematics-manual-ready.json'), JSON.stringify(receipt, null, 2));
        console.info('KINEMATICS MANUAL READY', JSON.stringify(receipt));
        let ended = false;
        let checkpoint = 0;
        while (!ended && Date.now() < deadline) {
          // oxlint-disable-next-line no-await-in-loop -- Poll only explicit bounded fixture requests after READY.
          const requests = await page.evaluate(() => {
            const state = (
              globalThis as typeof globalThis & {
                __tauKinematicsManual: { requests: Array<{ action: 'screenshot' | 'end'; gesture: string }> };
              }
            ).__tauKinematicsManual;
            return state.requests.splice(0);
          });
          for (const request of requests) {
            if (request.action === 'end') {
              ended = true;
              break;
            }
            const capturedAt = Date.now();
            // oxlint-disable-next-line no-await-in-loop -- Principal explicitly requested this named screenshot.
            const directory = await session.capture(`kinematics-manual-${++checkpoint}`);
            const screenshotFile = join(directory, 'screenshot.png');
            // oxlint-disable-next-line no-await-in-loop -- Hash actual saved PNG bytes; a missing screenshot fails.
            const bytes = await readFile(screenshotFile);
            const screenshotSha256 = createHash('sha256').update(bytes).digest('hex');
            // oxlint-disable-next-line no-await-in-loop -- Paired screenshot/source/root/operator gesture receipt.
            await writeFile(
              join(directory, 'screenshot-receipt.json'),
              JSON.stringify(
                {
                  ...receipt,
                  screenshotFile,
                  screenshotSha256,
                  bytes: bytes.byteLength,
                  gesture: request.gesture,
                  capturedAt,
                },
                null,
                2,
              ),
            );
          }
          // oxlint-disable-next-line no-await-in-loop -- Bounded fixture-only cadence, never product state polling.
          await new Promise<void>((resolve) => {
            setTimeout(resolve, 100);
          });
        }
        expect(ended).toBe(true);
        return;
      }

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
      if (!manualKinematics) {
        await session.capture('picogk-turbofan-kinematics-failure');
      }
      throw error;
    }
  },
  900_000,
);
