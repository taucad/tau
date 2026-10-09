import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { authenticatePackagedDesktop, launchDesktopApp } from '#support/desktop-app.js';
import { desktopE2ECompletedArtifact } from '#support/config.js';
import { gatewayFixtureModelName, startGatewayFixture } from '#support/gateway-fixture.js';
import { deleteTauTestUser, seedTauTestUser, tauTestAccount } from '#support/tau-account.js';
import { expectSignedIn, expectVisible, selectChatModel } from '#support/scenario.js';

const manualMode = process.env['TAU_E2E_ONE_SHOT_MANUAL'];
const manualEnabled = manualMode === 'fix' || manualMode === 'linked' || manualMode === 'thumbnail';

const sourcePath = 'public/models/honeycomb.js';
const previousSource = 'export default function main() { throw new Error("native-one-shot-previous-source"); }\n';
const currentSource = 'export default function main() { throw new Error("native-one-shot-current-source"); }\n';

test('native Fix with AI reads current rooted bytes after an external filesystem replacement', async () => {
  const fixture = await startGatewayFixture({ toolCalls: [], textChunks: ['Native current source received.'] });
  const account = tauTestAccount('filesystem-one-shot-fix');
  let session: Awaited<ReturnType<typeof launchDesktopApp>> | undefined;
  try {
    const token = await seedTauTestUser(account);
    session = await launchDesktopApp({
      token,
      visible: manualEnabled,
      windowTitle: manualEnabled ? `Tau native one-shot manual · ${manualMode}` : undefined,
    });
    const { page } = session;
    await fixture.routeThrough(page);
    await page.reload();
    if (desktopE2ECompletedArtifact) {
      await authenticatePackagedDesktop(session, token);
    }
    await expectSignedIn(page);
    await page.goto('app://tau/__e2e/project-file-tree?chat=1');
    await page.waitForURL(/\/w\/[^/]+\/[^/]+/u, { timeout: 60_000 });
    const slug = new URL(page.url()).pathname.split('/').at(-1);
    if (!slug) {
      throw new Error('The native seed did not create a rooted project.');
    }
    const nativeSource = join(session.homeRoot, slug, sourcePath);
    await selectChatModel(page, gatewayFixtureModelName);
    if (manualEnabled) {
      const root = join(session.homeRoot, slug);
      const manifest = JSON.parse(await readFile(join(root, 'tau.json'), 'utf8')) as { id: string };
      const checkoutRoot = join(session.homeRoot, '.tau/checkouts', manifest.id);
      const identity = await page.evaluate(installOneShotManualControls);
      const sourceSha256 = createHash('sha256')
        .update(await readFile(new URL('filesystem-projection-one-shot.spec.ts', import.meta.url)))
        .digest('hex');
      const deadline = Date.now() + 240_000;
      const receipt = {
        identity,
        mode: manualMode,
        root,
        checkoutRoot,
        homeRoot: session.homeRoot,
        electronPid: session.application.process().pid,
        logPath: session.logPath,
        sourceSha256,
        deadline,
        instructions:
          'Principal owns Fix with AI, branch placement/Send and Update thumbnail gestures. Previous/current are explicit fixed-path mutations. Capture records actual rooted checkout inventory and thumbnail bytes. End finishes. No product gestures after READY.',
      };
      await writeFile(join(session.homeRoot, 'one-shot-manual-ready.json'), JSON.stringify(receipt, null, 2));
      console.info('ONE SHOT MANUAL READY', JSON.stringify(receipt));
      let ended = false;
      let checkpoint = 0;
      while (!ended && Date.now() < deadline) {
        // oxlint-disable-next-line no-await-in-loop -- Only explicit bounded operator controls after handoff.
        const requests = await page.evaluate(takeOneShotManualRequests);
        for (const { action, gesture } of requests) {
          if (action === 'end') {
            ended = true;
            break;
          }
          if (action === 'previous' || action === 'current') {
            // oxlint-disable-next-line no-await-in-loop -- Fixed actual source mutation requested by Principal.
            await writeFile(nativeSource, action === 'previous' ? previousSource : currentSource);
          } else {
            const capturedAt = Date.now();
            // oxlint-disable-next-line no-await-in-loop -- Explicit named checkpoint only.
            const directory = await session.capture(`one-shot-manual-${++checkpoint}`);
            const screenshotFile = join(directory, 'screenshot.png');
            // oxlint-disable-next-line no-await-in-loop -- Exact saved screenshot bytes.
            const bytes = await readFile(screenshotFile);
            // oxlint-disable-next-line no-await-in-loop -- Actual rooted source; no synthetic materialization.
            const source = await readFile(nativeSource);
            let checkoutFiles: string[] = [];
            try {
              // oxlint-disable-next-line no-await-in-loop -- Passive actual checkout inventory at explicit capture only.
              checkoutFiles = await readdir(checkoutRoot, { recursive: true });
            } catch (error) {
              if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
                throw error;
              }
            }
            const checkoutSources: Array<{ path: string; sha256: string }> = [];
            for (const path of checkoutFiles.filter((path) => path.endsWith(sourcePath)).slice(0, 16)) {
              // oxlint-disable-next-line no-await-in-loop -- Bounded passive byte identity of actual materialized source copies.
              const checkoutBytes = await readFile(join(checkoutRoot, path));
              checkoutSources.push({ path, sha256: createHash('sha256').update(checkoutBytes).digest('hex') });
            }
            let thumbnailSha256: string | undefined;
            try {
              // oxlint-disable-next-line no-await-in-loop -- Passive exact output receipt after Principal Update thumbnail.
              const thumbnailBytes = await readFile(join(root, 'thumbnail.webp'));
              thumbnailSha256 = createHash('sha256').update(thumbnailBytes).digest('hex');
            } catch (error) {
              if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
                throw error;
              }
            }
            // oxlint-disable-next-line no-await-in-loop -- Pair exact source/root/output and gesture with screenshot.
            await writeFile(
              join(directory, 'screenshot-receipt.json'),
              JSON.stringify(
                {
                  ...receipt,
                  gesture,
                  capturedAt,
                  screenshotFile,
                  screenshotSha256: createHash('sha256').update(bytes).digest('hex'),
                  currentSourceSha256: createHash('sha256').update(source).digest('hex'),
                  checkoutFiles: checkoutFiles.slice(0, 128),
                  checkoutFileCount: checkoutFiles.length,
                  checkoutSources,
                  thumbnailSha256,
                  gatewayRequests: fixture.gatewayRequests.length,
                  currentSourceInGateway: JSON.stringify(fixture.gatewayRequests).includes(
                    'native-one-shot-current-source',
                  ),
                  previousSourceInGateway: JSON.stringify(fixture.gatewayRequests).includes(
                    'native-one-shot-previous-source',
                  ),
                },
                null,
                2,
              ),
            );
          }
        }
        // oxlint-disable-next-line no-await-in-loop -- Bounded fixture cadence, not product-state polling.
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 100);
        });
      }
      expect(ended).toBe(true);
      return;
    }
    await writeFile(nativeSource, previousSource);
    const issues = page.getByRole('button', { name: /^Build failed\. Issues:/u }).first();
    await expectVisible(issues, 180_000);
    await issues.click();
    await expectVisible(page.getByText('native-one-shot-previous-source', { exact: false }), 60_000);
    await writeFile(nativeSource, currentSource);
    await expectVisible(page.getByText('native-one-shot-current-source', { exact: false }), 180_000);
    expect(await readFile(nativeSource, 'utf8')).toBe(currentSource);
    expect(fixture.gatewayRequests).toHaveLength(0);
    await page.getByRole('button', { name: 'Fix with AI', exact: true }).first().click();
    await expectVisible(page.getByText('Native current source received.', { exact: true }), 120_000);
    expect(fixture.gatewayRequests).toHaveLength(1);
    const request = fixture.gatewayRequests[0] as { readonly messages?: unknown };
    expect(JSON.stringify(request.messages)).toContain(JSON.stringify(currentSource.trim()).slice(1, -1));
    expect(JSON.stringify(request.messages)).not.toContain('native-one-shot-previous-source');
    await session.capture('one-shot-native-current-source-fix');
  } finally {
    try {
      await session?.close();
    } finally {
      try {
        await fixture.close();
      } finally {
        await deleteTauTestUser(account.email);
      }
    }
  }
});

type OneShotManualAction = 'previous' | 'current' | 'capture' | 'end';
const installOneShotManualControls = () => {
  const state = { requests: [] as Array<{ action: OneShotManualAction; gesture: string }> };
  Object.assign(globalThis, { __tauOneShotManual: state });
  document.title = 'Tau one-shot manual';
  const panel = document.createElement('aside');
  panel.setAttribute('aria-label', 'One-shot fixture controls');
  panel.style.cssText =
    'position:fixed;top:8px;right:8px;z-index:2147483647;background:white;color:black;padding:8px;border:1px solid black';
  const name = document.createElement('input');
  name.setAttribute('aria-label', 'Gesture checkpoint name');
  panel.append(name);
  const actions: OneShotManualAction[] = ['previous', 'current', 'capture', 'end'];
  for (const action of actions) {
    const button = document.createElement('button');
    button.textContent = `Fixture ${action}`;
    button.addEventListener('click', () => {
      if (action === 'capture' && !name.value.trim()) {
        name.focus();
        return;
      }
      if (state.requests.length < 16) {
        state.requests.push({ action, gesture: name.value.trim().slice(0, 160) });
      }
    });
    panel.append(button);
  }
  document.body.append(panel);
  return { href: location.href, title: document.title, timeOrigin: performance.timeOrigin };
};
const takeOneShotManualRequests = () =>
  (
    globalThis as typeof globalThis & {
      __tauOneShotManual: { requests: Array<{ action: OneShotManualAction; gesture: string }> };
    }
  ).__tauOneShotManual.requests.splice(0);
