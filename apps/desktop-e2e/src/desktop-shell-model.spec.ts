import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { validateGlbData } from '@taucad/runtime-testing';
import { testModelOutputSchema } from '@taucad/chat/schemas/tools/test-model';
import { shellOutputSchema } from '@taucad/chat/schemas/tools/shell';
import { launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import {
  failedGatewayToolResults,
  gatewayFixtureFinalText,
  gatewayFixtureModelName,
  gatewayToolResults,
  startGatewayFixture,
} from '#support/gateway-fixture.js';
import type { GatewayFixture } from '#support/gateway-fixture.js';
import { deleteTauTestUser, seedTauTestUser, tauTestAccount } from '#support/tau-account.js';
import {
  activeChatId,
  connectPickedFolder,
  expectLauncher2Turn,
  expectSignedIn,
  expectVisible,
  selectChatModel,
  selectKernel,
  submitPrompt,
} from '#support/scenario.js';

const modelSource = 'cube([10, 10, 10]);\n';
const checksSource = `import { it, expectGeo } from 'geospec';
import { loadModel } from 'geospec/model';
it('matches the shell-authored cube volume', async () => {
  const model = await loadModel({ file: 'main.scad', format: 'glb' });
  expectGeo(model).toHaveVolume({ value: 1000, tolerance: 0.001 });
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

it('should evaluate, test, capture and export shell-authored bytes through one real desktop turn', async () => {
  const account = tauTestAccount('shell-model');
  seededEmail = account.email;
  const token = await seedTauTestUser(account);
  fixture = await startGatewayFixture({
    toolCalls: [
      { name: 'create_file', input: { targetFile: 'main.scad', content: 'cube([5, 5, 5]);\n' } },
      { name: 'create_file', input: { targetFile: 'checks.geospec.ts', content: checksSource } },
      {
        name: 'shell',
        input: { command: "cat > main.scad <<'MODEL'\ncube([10, 10, 10]);\nMODEL\nprintf shell-authored" },
      },
      { name: 'evaluate_model', input: { targetFile: 'main.scad' } },
      { name: 'test_model', input: { files: ['checks.geospec.ts'] } },
      { name: 'screenshot', input: { targetFile: 'main.scad', mode: 'single' } },
      { name: 'export_model', input: { targetFile: 'main.scad', to: 'glb' } },
    ],
  });
  session = await launchDesktopApp({ token });
  const { page } = session;
  await fixture.routeThrough(page);
  try {
    await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
    await expectSignedIn(page);
    await selectKernel(page, 'OpenSCAD');
    await connectPickedFolder(session);
    await selectChatModel(page, gatewayFixtureModelName);
    const slug = await submitPrompt(
      page,
      'Use shell to change the cube to 10 mm, evaluate it, test its volume, capture it and export GLB.',
    );
    await expectVisible(page.getByText(gatewayFixtureFinalText, { exact: true }), 600_000);
    const root = join(session.pickedDirectory, slug);
    expect(await readFile(join(root, 'main.scad'), 'utf8')).toBe(modelSource);
    await expectLauncher2Turn(session.logPath, root, activeChatId(page));
    expect(failedGatewayToolResults(fixture.gatewayRequests.slice(-1))).toEqual([]);
    const results = gatewayToolResults(fixture.gatewayRequests.slice(-1));
    expect(results.map(({ name }) => name)).toEqual([
      'create_file',
      'create_file',
      'shell',
      'evaluate_model',
      'test_model',
      'screenshot',
      'export_model',
    ]);
    const shell = shellOutputSchema.parse(JSON.parse(results[2]!.text));
    expect(shell).toMatchObject({ status: 'completed', exitCode: 0 });
    expect(results[2]!.text).toContain('shell-authored');
    const tested = testModelOutputSchema.omit({ passes: true }).parse(JSON.parse(results[4]!.text));
    expect(tested).toMatchObject({ passed: 1, total: 1 });
    const entries = await readdir(root, { recursive: true });
    const exported = entries.find((entry) => /^\.tau\/artifacts\/.+\.glb$/u.test(entry));
    expect(exported, 'export_model must persist the requested artifact').toBeDefined();
    validateGlbData(new Uint8Array(await readFile(join(root, exported!))));
    await page.getByRole('button', { name: 'Captured images', exact: true }).click();
    await page.getByRole('button', { name: /Captured 1 screenshot of main\.scad/u }).click();
    const image = page.getByRole('img', { name: 'isometric view', exact: true });
    await expectVisible(image);
    await expect
      .poll(async () =>
        image.evaluate((element) => {
          if (!(element instanceof HTMLImageElement) || !element.complete || element.naturalWidth < 32) {
            return 0;
          }
          const canvas = document.createElement('canvas');
          canvas.width = 32;
          canvas.height = 32;
          const context = canvas.getContext('2d');
          if (!context) {
            return 0;
          }
          context.drawImage(element, 0, 0, 32, 32);
          const pixels = context.getImageData(0, 0, 32, 32).data;
          const colors = new Set<string>();
          for (let index = 0; index < pixels.length; index += 4) {
            colors.add(`${String(pixels[index])},${String(pixels[index + 1])},${String(pixels[index + 2])}`);
          }
          return colors.size;
        }),
      )
      .toBeGreaterThan(4);
    const marker = page.locator('[role="status"][aria-label="Turn revision status"]');
    await expect.poll(async () => marker.allTextContents()).toEqual([expect.stringMatching(/^Rev \d+ saved/u)]);
    const eventsPath = join(root, '.tau/chats', activeChatId(page), 'events.jsonl');
    const events = await readFile(eventsPath, 'utf8');
    const settlements = events.split('\n').filter((line) => line.includes('"type":"turn.finalized"'));
    expect(settlements).toHaveLength(1);
    const requests = fixture.gatewayRequests.length;
    await page.reload();
    await expectVisible(page.getByText(gatewayFixtureFinalText, { exact: true }));
    expect(await readFile(join(root, 'main.scad'), 'utf8')).toBe(modelSource);
    const replayedEvents = await readFile(eventsPath, 'utf8');
    expect(replayedEvents.split('\n').filter((line) => line.includes('"type":"turn.finalized"'))).toEqual(settlements);
    expect(fixture.gatewayRequests).toHaveLength(requests);
  } catch (error) {
    await session.capture('shell-model-failure');
    throw error;
  }
});
