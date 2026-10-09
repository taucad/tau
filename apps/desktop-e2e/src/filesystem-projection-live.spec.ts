import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { desktopE2ECompletedArtifact } from '#support/config.js';
import { authenticatePackagedDesktop, launchDesktopApp } from '#support/desktop-app.js';
import {
  installProjectionDeliveryControl,
  holdProjectionDelivery,
  restoreProjectionDelivery,
  projectionDeliveryEvidence,
} from '#support/filesystem-projection-delivery.js';
import type { DesktopSession } from '#support/desktop-app.js';
import { gatewayFixtureModelName, startGatewayFixture } from '#support/gateway-fixture.js';
import type { GatewayFixture } from '#support/gateway-fixture.js';
import { deleteTauTestUser, seedTauTestUser, tauTestAccount } from '#support/tau-account.js';
import {
  activeChatId,
  connectPickedFolder,
  expectCount,
  expectSignedIn,
  expectVisible,
  selectChatModel,
  stopButtonOf,
  submitPrompt,
} from '#support/scenario.js';

let session: DesktopSession | undefined;
let fixture: GatewayFixture | undefined;
let seededEmail: string | undefined;
let releaseOutput: (() => void) | undefined;

afterEach(async () => {
  try {
    releaseOutput?.();
  } finally {
    releaseOutput = undefined;
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
        if (email !== undefined) {
          await deleteTauTestUser(email);
        }
      }
    }
  }
});

/* Current-turn DOM is inspected before provider completion and without route changes. */
test.each([1280, 390])('shows independently held live output without navigation at width %i', async (width) => {
  const second = Promise.withResolvers<void>();
  const finish = Promise.withResolvers<void>();
  const third = Promise.withResolvers<void>();
  releaseOutput = () => {
    second.resolve();
    third.resolve();
    finish.resolve();
  };
  const firstText = 'Filesystem projection first held paragraph.';
  const secondText = 'Filesystem projection second held paragraph.';
  const thirdText = 'Filesystem projection delivery control final paragraph.';
  fixture = await startGatewayFixture({
    toolCalls: [],
    textChunks: [firstText, secondText, thirdText],
    beforeTextChunk: async (index) => {
      if (index === 1) {
        await second.promise;
      }
      if (index === 2) {
        await third.promise;
      }
    },
    beforeFinish: async () => finish.promise,
  });
  const account = tauTestAccount(`filesystem-live-${String(width)}`);
  seededEmail = account.email;
  const token = await seedTauTestUser(account);
  session = await launchDesktopApp({ token });
  const { page } = session;
  await page.setViewportSize({ width, height: 900 });
  await fixture.routeThrough(page);
  await installProjectionDeliveryControl(page);
  await page.reload();
  await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
  if (desktopE2ECompletedArtifact) {
    await authenticatePackagedDesktop(session, token);
  }
  await expectSignedIn(page);
  await selectChatModel(page, gatewayFixtureModelName);
  const slug = await submitPrompt(page, 'Explain the filesystem projection in three paragraphs.');
  const route = page.url();
  let navigations = 0;
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      navigations++;
    }
  });
  const paragraph = page.getByText(firstText, { exact: true }).last();
  await expectVisible(paragraph, 120_000);
  const element = await paragraph.elementHandle();
  expect(element).not.toBeNull();
  expect(await page.getByText(secondText, { exact: false }).count()).toBe(0);
  await expectVisible(stopButtonOf(page));
  expect(fixture.gatewayRequests).toHaveLength(1);
  second.resolve();
  await expect
    .poll(async () => element.evaluate((node) => node.textContent), { timeout: 15_000 })
    .toContain(secondText);
  expect(await element.evaluate((node) => node.isConnected)).toBe(true);
  await expectVisible(stopButtonOf(page));
  expect(page.url()).toBe(route);
  expect(navigations).toBe(0);
  expect(fixture.gatewayRequests).toHaveLength(1);
  await session.capture(`filesystem-live-held-${String(width)}`);
  const chatId = activeChatId(page);
  await holdProjectionDelivery(page, chatId);
  third.resolve();
  finish.resolve();
  const logPath = join(session.homeRoot, slug, '.tau/chats', chatId, 'events.jsonl');
  await expect.poll(async () => readFile(logPath, 'utf8'), { timeout: 30_000 }).toContain(thirdText);
  await expect
    .poll(
      async () => {
        const evidence = await projectionDeliveryEvidence(page);
        return evidence.held;
      },
      { timeout: 15_000 },
    )
    .toBeGreaterThan(0);
  expect(await page.getByText(thirdText, { exact: false }).count()).toBe(0);
  expect(await element.evaluate((node) => node.isConnected)).toBe(true);
  await expect
    .poll(
      async () => {
        const evidence = await projectionDeliveryEvidence(page);
        return evidence.keepalives;
      },
      { timeout: 10_000 },
    )
    .toBeGreaterThan(0);
  const held = await projectionDeliveryEvidence(page);
  expect(held.chats).toEqual([chatId]);
  expect(held.ports.length).toBeGreaterThan(0);
  expect(
    held.frames.every(
      (frame) =>
        frame.chatId === chatId &&
        (frame.kind === 'rs' || frame.kind === 'sn' || frame.kind === 'sc' || frame.kind === 'se'),
    ),
  ).toBe(true);
  expect(held.unrelatedResponses).toBeGreaterThan(0);
  await session.capture(`filesystem-delivery-held-${String(width)}`);
  await restoreProjectionDelivery(page);
  await expectCount(stopButtonOf(page), 0, 120_000);
  expect(await page.getByText(firstText + secondText + thirdText, { exact: true }).count()).toBe(1);
  expect(await element.evaluate((node) => node.isConnected)).toBe(true);
  const restoredDelivery = await projectionDeliveryEvidence(page);
  expect(restoredDelivery.restored).toBe(held.held);
  expect(page.url()).toBe(route);
  expect(navigations).toBe(0);
});

test.skipIf(process.env['TAU_E2E_NATIVE_CORE_MANUAL'] !== 'true')(
  'manual native candidate for actual Send Stop Resume gestures',
  async () => {
    const names = ['first', 'second', 'resumed'] as const;
    const pending = new Map<string, () => void>();
    let closing = false;
    const gate = async (name: string): Promise<void> => {
      if (closing) {
        return;
      }
      const held = Promise.withResolvers<void>();
      pending.set(name, () => {
        pending.delete(name);
        held.resolve();
      });
      await held.promise;
    };
    releaseOutput = () => {
      closing = true;
      for (const release of pending.values()) {
        release();
      }
    };
    fixture = await startGatewayFixture({
      toolCalls: [],
      textChunks: (request: number) => {
        const name = names[request];
        if (!name) {
          throw new Error(`Unexpected manual provider request ${request}`);
        }
        return [`Native manual ${name} alpha.`, ` Native manual ${name} beta.`, ` Native manual ${name} gamma.`];
      },
      beforeTextChunk: async (chunk: number, request: number) => {
        if (chunk > 0) {
          await gate(`${names[request] ?? request}:chunk-${chunk + 1}`);
        }
      },
      beforeFinish: async (request: number) => {
        await gate(`${names[request] ?? request}:finish`);
      },
    });
    const account = tauTestAccount('filesystem-native-core-manual');
    seededEmail = account.email;
    const token = await seedTauTestUser(account);
    const windowTitle = 'Tau native core manual · Send Stop Resume';
    session = await launchDesktopApp({ token, visible: true, windowTitle });
    const { page } = session;
    await fixture.routeThrough(page);
    await installProjectionDeliveryControl(page);
    await page.reload();
    await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
    if (desktopE2ECompletedArtifact) {
      await authenticatePackagedDesktop(session, token);
    }
    await expectSignedIn(page);
    await connectPickedFolder(session);
    await selectChatModel(page, gatewayFixtureModelName);
    const specBytes = await readFile(new URL('filesystem-projection-live.spec.ts', import.meta.url));
    const launcherBytes = await readFile(
      new URL('../../../packages/agent-host/src/launchers/agent-launcher.ts', import.meta.url),
    );
    const specSha256 = createHash('sha256').update(specBytes).digest('hex');
    const sourceSha256 = createHash('sha256').update(launcherBytes).digest('hex');
    const identity = await page.evaluate(() => {
      const state = { actions: [] as Array<{ kind: 'release' | 'capture' | 'end'; name: string }> };
      Object.assign(globalThis, { __tauNativeCoreManual: state });
      document.title = 'Tau native core manual · Send Stop Resume';
      const controls = document.createElement('aside');
      controls.setAttribute('aria-label', 'Native core fixture controls');
      controls.style.cssText =
        'position:fixed;top:8px;right:8px;z-index:2147483647;background:white;color:black;padding:8px;border:1px solid black';
      const name = document.createElement('input');
      name.setAttribute('aria-label', 'Fixture request name');
      name.placeholder = 'Gate or gesture checkpoint name';
      controls.append(name);
      for (const kind of ['release', 'capture', 'end'] as const) {
        const button = document.createElement('button');
        button.textContent =
          kind === 'release'
            ? 'Release named held chunk'
            : kind === 'capture'
              ? 'Capture named checkpoint'
              : 'End native manual fixture';
        button.addEventListener('click', () => {
          if (kind !== 'end' && !name.value.trim()) {
            name.focus();
            return;
          }
          if (state.actions.length < 16) {
            state.actions.push({ kind, name: name.value.trim().slice(0, 160) });
          }
        });
        controls.append(button);
      }
      document.body.append(controls);
      return { href: location.href, title: document.title, timeOrigin: performance.timeOrigin };
    });
    const readyAt = Date.now();
    const receipt = {
      identity,
      windowTitle,
      readyAt,
      deadline: readyAt + 300_000,
      homeRoot: session.homeRoot,
      pickedRoot: session.pickedDirectory,
      electronPid: session.application.process().pid,
      logPath: session.logPath,
      sourceSha256,
      specSha256,
      projectStatus: 'First actual Principal Send creates the project in the connected picked root.',
      instructions:
        'Principal sends first prompt; capture held alpha. Release first:chunk-2, first:chunk-3, first:finish. Principal sends second prompt, then Stop while second:chunk-2 held. Principal clicks Resume; third response is distinct resumed alpha. Release resumed:chunk-2, resumed:chunk-3, resumed:finish. Capture named checkpoints after gestures. Never release abandoned second gates as a substitute for Resume.',
    };
    await writeFile(join(session.homeRoot, 'native-core-manual-ready.json'), JSON.stringify(receipt, null, 2));
    console.info('NATIVE CORE MANUAL READY', JSON.stringify(receipt));
    const releases: Array<{ name: string; status: string; releasedAt: number }> = [];
    const checkpoints: unknown[] = [];
    let ended = false;
    while (!ended && Date.now() < receipt.deadline) {
      // oxlint-disable-next-line no-await-in-loop -- Only explicit bounded fixture flags are polled after READY.
      const actions = await page.evaluate(() => {
        const state = (
          globalThis as typeof globalThis & {
            __tauNativeCoreManual: { actions: Array<{ kind: 'release' | 'capture' | 'end'; name: string }> };
          }
        ).__tauNativeCoreManual;
        return state.actions.splice(0);
      });
      for (const action of actions) {
        if (action.kind === 'end') {
          ended = true;
          break;
        }
        if (action.kind === 'release') {
          const release = pending.get(action.name);
          release?.();
          releases.push({
            name: action.name,
            status: release ? 'released' : 'no matching held gate',
            releasedAt: Date.now(),
          });
        } else {
          const capturedAt = Date.now();
          // oxlint-disable-next-line no-await-in-loop -- Principal explicitly requested a named exact PNG/source/log checkpoint.
          const directory = await session.capture(`native-core-manual-${checkpoints.length + 1}`);
          const screenshotFile = join(directory, 'screenshot.png');
          // oxlint-disable-next-line no-await-in-loop -- Hash the exact saved PNG; missing capture fails.
          const screenshotBytes = await readFile(screenshotFile);
          const currentUrl = page.url();
          const current = new URL(currentUrl);
          const slug = current.pathname.startsWith('/w/') ? current.pathname.split('/').at(-1) : undefined;
          const chatId = current.searchParams.get('chat') ?? undefined;
          const projectRoot = slug ? join(session.pickedDirectory, slug) : undefined;
          const physicalLogPath =
            projectRoot && chatId ? join(projectRoot, '.tau/chats', chatId, 'events.jsonl') : undefined;
          // oxlint-disable-next-line no-await-in-loop -- Explicit checkpoint reads only the actual current rooted log, never product-state polling.
          const physicalLog = physicalLogPath ? await readFile(physicalLogPath) : undefined;
          const logFile = physicalLog ? join(directory, 'events.jsonl') : undefined;
          if (physicalLog && logFile) {
            // oxlint-disable-next-line no-await-in-loop -- Persist the exact source log paired with this operator checkpoint.
            await writeFile(logFile, physicalLog);
          }
          const checkpoint = {
            ...receipt,
            name: action.name,
            capturedAt,
            currentUrl,
            projectRoot,
            chatId,
            screenshotFile,
            screenshotSha256: createHash('sha256').update(screenshotBytes).digest('hex'),
            screenshotBytes: screenshotBytes.byteLength,
            physicalLogPath,
            logFile,
            logSha256: physicalLog ? createHash('sha256').update(physicalLog).digest('hex') : undefined,
            pendingGates: [...pending.keys()],
          };
          checkpoints.push(checkpoint);
          // oxlint-disable-next-line no-await-in-loop -- Immediate durable paired checkpoint receipt.
          await writeFile(join(directory, 'checkpoint.json'), JSON.stringify(checkpoint, null, 2));
        }
      }
      // oxlint-disable-next-line no-await-in-loop -- Bounded fixture-only cadence; no composer/product polling or gestures.
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 100);
      });
    }
    await writeFile(
      join(session.homeRoot, 'native-core-manual-result.json'),
      JSON.stringify({ ...receipt, ended, releases, checkpoints, requests: fixture.gatewayRequests }, null, 2),
    );
    expect(ended).toBe(true);
    expect(fixture.gatewayRequests).toHaveLength(3);
    expect(checkpoints.length).toBeGreaterThan(0);
  },
);
