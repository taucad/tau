import { createHash } from 'node:crypto';
import { base64ToUint8Array } from 'uint8array-extras';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { launchDesktopApp } from '#support/desktop-app.js';
import { activeChatId, expectVisible } from '#support/scenario.js';

test('projects independent native manifest and chat metadata while the workspace remains mounted', async () => {
  const session = await launchDesktopApp({ token: 'offline-metadata' });
  try {
    const { page } = session;
    let navigationReceipts = 0;
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame() && navigationReceipts < 12) {
        navigationReceipts += 1;
        const url = new URL(frame.url());
        console.info(
          'NATIVE METADATA NAVIGATION',
          JSON.stringify({ event: 'navigated', protocol: url.protocol, host: url.host, pathname: url.pathname }),
        );
      }
    });
    page.on('requestfailed', (request) => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame() && navigationReceipts < 12) {
        navigationReceipts += 1;
        const url = new URL(request.url());
        console.info(
          'NATIVE METADATA NAVIGATION',
          JSON.stringify({
            event: 'failed',
            protocol: url.protocol,
            host: url.host,
            pathname: url.pathname,
            failure: request.failure()?.errorText,
          }),
        );
      }
    });
    await page.goto('app://tau/__e2e/project-file-tree?chat=1');
    await page.waitForURL(/\/w\//u, { timeout: 60_000 });
    await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]').last());
    const slug = new URL(page.url()).pathname.split('/').at(-1);
    if (!slug) {
      throw new Error('The native metadata fixture has no rooted project.');
    }
    const root = join(session.homeRoot, slug);
    const manifestPath = join(root, 'tau.json');
    const chatPath = join(root, '.tau/chats', activeChatId(page), 'chat.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>;
    const chat = JSON.parse(await readFile(chatPath, 'utf8')) as Record<string, unknown>;
    const identity = await page.evaluate(() => ({ href: location.href, timeOrigin: performance.timeOrigin }));
    const name = 'Native filesystem metadata current project';
    const chatName = 'Native filesystem metadata current chat';
    await writeFile(manifestPath, JSON.stringify({ ...manifest, name }));
    await writeFile(chatPath, JSON.stringify({ ...chat, name: chatName }));
    await expectVisible(page.getByText(name, { exact: true }).first());
    await expectVisible(page.getByText(chatName, { exact: true }).first());
    expect(await page.evaluate(() => ({ href: location.href, timeOrigin: performance.timeOrigin }))).toEqual(identity);
    expect(JSON.parse(await readFile(manifestPath, 'utf8'))).toMatchObject({ name });
    expect(JSON.parse(await readFile(chatPath, 'utf8'))).toMatchObject({ name: chatName });
    await session.capture('projection-native-metadata');
  } catch (error) {
    console.error(
      'NATIVE METADATA FAILURE',
      error instanceof Error ? error.message.slice(0, 1000) : 'Unknown navigation failure',
    );
    try {
      await session.capture('projection-native-metadata-startup-failure');
    } catch (captureError) {
      console.error(
        'NATIVE METADATA CAPTURE FAILURE',
        captureError instanceof Error ? captureError.name : 'Unknown capture failure',
      );
    }
    throw error;
  } finally {
    await session.close();
  }
});

test('updates decoded native thumbnails and deletion fallback in the mounted library', async () => {
  const session = await launchDesktopApp({ token: 'offline-thumbnail' });
  try {
    const { page } = session;
    await page.goto('app://tau/__e2e/project-file-tree?chat=1');
    await page.waitForURL(/\/w\//u, { timeout: 60_000 });
    const slug = new URL(page.url()).pathname.split('/').at(-1);
    if (!slug) {
      throw new Error('The native thumbnail fixture has no rooted project.');
    }
    const root = join(session.homeRoot, slug);
    const manifest = JSON.parse(await readFile(join(root, 'tau.json'), 'utf8')) as { name: string };
    await page.goto('app://tau/projects');
    const card = page
      .locator('[data-slot="card"]')
      .filter({ has: page.getByRole('link', { name: `Open ${manifest.name}`, exact: true }) });
    const thumbnail = card.locator('img');
    await expectVisible(thumbnail);
    await thumbnail.evaluate((element) => {
      element.dataset['projectionThumbnail'] = 'retained';
    });
    const identity = await page.evaluate(() => ({ href: location.href, timeOrigin: performance.timeOrigin }));
    const image = async (color: string): Promise<Uint8Array<ArrayBuffer>> =>
      base64ToUint8Array(
        await page.evaluate((fill) => {
          const canvas = document.createElement('canvas');
          canvas.width = 16;
          canvas.height = 16;
          const context = canvas.getContext('2d');
          if (!context) {
            throw new Error('The native renderer canvas is unavailable.');
          }
          context.fillStyle = fill;
          context.fillRect(0, 0, 16, 16);
          return canvas.toDataURL('image/webp').split(',')[1]!;
        }, color),
      );
    const current = async (): Promise<{ source: string; width: number }> =>
      thumbnail.evaluate((element) => {
        const image = element as HTMLImageElement;
        return { source: image.currentSrc || image.src, width: image.naturalWidth };
      });
    const path = join(root, 'thumbnail.webp');
    await writeFile(path, await image('#c026d3'));
    await expect
      .poll(async () => {
        const state = await current();
        return state.width;
      })
      .toBe(16);
    const first = await current();
    expect(first.source.startsWith('blob:')).toBe(true);
    await writeFile(path, await image('#0891b2'));
    await expect
      .poll(async () => {
        const state = await current();
        return state.source;
      })
      .not.toBe(first.source);
    await expect
      .poll(async () => {
        const state = await current();
        return state.width;
      })
      .toBe(16);
    expect(await thumbnail.getAttribute('data-projection-thumbnail')).toBe('retained');
    await rm(path);
    await expect
      .poll(async () => {
        const state = await current();
        return state.source;
      })
      .toContain('/placeholder.svg');
    expect(await page.evaluate(() => ({ href: location.href, timeOrigin: performance.timeOrigin }))).toEqual(identity);
    await session.capture('projection-native-thumbnail');
  } finally {
    await session.close();
  }
});

type MetadataManualAction = 'project' | 'chat' | 'thumbnail-a' | 'thumbnail-b' | 'delete-thumbnail' | 'capture' | 'end';
const installMetadataManualControls = () => {
  const state = { requests: [] as Array<{ action: MetadataManualAction; gesture: string }> };
  Object.assign(globalThis, { __tauMetadataManual: state });
  document.title = 'Tau metadata manual';
  const panel = document.createElement('aside');
  panel.setAttribute('aria-label', 'Metadata fixture controls');
  panel.style.cssText =
    'position:fixed;top:8px;right:8px;z-index:2147483647;background:white;color:black;padding:8px;border:1px solid black';
  const name = document.createElement('input');
  name.setAttribute('aria-label', 'Gesture checkpoint name');
  panel.append(name);
  const actions: MetadataManualAction[] = [
    'project',
    'chat',
    'thumbnail-a',
    'thumbnail-b',
    'delete-thumbnail',
    'capture',
    'end',
  ];
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
const takeMetadataManualRequests = () =>
  (
    globalThis as typeof globalThis & {
      __tauMetadataManual: { requests: Array<{ action: MetadataManualAction; gesture: string }> };
    }
  ).__tauMetadataManual.requests.splice(0);
const metadataManualImage = (color: string): string => {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('The actual metadata renderer canvas is unavailable.');
  }
  context.fillStyle = color;
  context.fillRect(0, 0, 16, 16);
  return canvas.toDataURL('image/webp').split(',')[1]!;
};

// The automated cases above remain unchanged; this opt-in handoff owns its own visible session.
test.skipIf(process.env['TAU_E2E_METADATA_MANUAL'] !== 'true')(
  'manual native metadata inventory and thumbnails',
  async () => {
    const windowTitle = 'Tau native metadata inventory manual';
    const session = await launchDesktopApp({ token: 'offline-metadata', visible: true, windowTitle });
    try {
      const { page } = session;
      await page.goto('app://tau/__e2e/project-file-tree?chat=1');
      await page.waitForURL(/\/w\//u, { timeout: 60_000 });
      const slug = new URL(page.url()).pathname.split('/').at(-1);
      if (!slug) {
        throw new Error('The manual metadata fixture has no rooted project.');
      }
      const root = join(session.homeRoot, slug);
      const manifestPath = join(root, 'tau.json');
      const chatPath = join(root, '.tau/chats', activeChatId(page), 'chat.json');
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>;
      const chat = JSON.parse(await readFile(chatPath, 'utf8')) as Record<string, unknown>;
      const thumbnailA = base64ToUint8Array(await page.evaluate(metadataManualImage, '#c026d3'));
      const thumbnailB = base64ToUint8Array(await page.evaluate(metadataManualImage, '#0891b2'));
      const identity = await page.evaluate(installMetadataManualControls);
      const sourceSha256 = createHash('sha256')
        .update(await readFile(new URL('filesystem-projection-metadata.spec.ts', import.meta.url)))
        .digest('hex');
      const deadline = Date.now() + 240_000;
      const receipt = {
        identity,
        windowTitle,
        root,
        homeRoot: session.homeRoot,
        manifestPath,
        chatPath,
        electronPid: session.application.process().pid,
        logPath: session.logPath,
        sourceSha256,
        deadline,
        instructions:
          'Principal owns all workspace/library/chat/command-palette gestures. Only explicit fixed-path mutation, named capture and End are executed by the driver. No automated mutation occurs before READY.',
      };
      await writeFile(join(session.homeRoot, 'metadata-manual-ready.json'), JSON.stringify(receipt, null, 2));
      console.info('METADATA MANUAL READY', JSON.stringify(receipt));
      let ended = false;
      let checkpoint = 0;
      while (!ended && Date.now() < deadline) {
        // oxlint-disable-next-line no-await-in-loop -- Only explicit bounded fixture requests after handoff.
        const requests = await page.evaluate(takeMetadataManualRequests);
        for (const { action, gesture } of requests) {
          if (action === 'end') {
            ended = true;
            break;
          }
          switch (action) {
            case 'capture': {
              const capturedAt = Date.now();
              // oxlint-disable-next-line no-await-in-loop -- Actual Principal navigation receipt, no driver product gesture.
              const currentIdentity = await page.evaluate(() => ({
                href: location.href,
                title: document.title,
                timeOrigin: performance.timeOrigin,
              }));
              // oxlint-disable-next-line no-await-in-loop -- Principal explicitly requests this named checkpoint.
              const directory = await session.capture(`metadata-manual-${++checkpoint}`);
              const screenshotFile = join(directory, 'screenshot.png');
              // oxlint-disable-next-line no-await-in-loop -- Hash exact saved PNG bytes; absent screenshot fails.
              const bytes = await readFile(screenshotFile);
              // oxlint-disable-next-line no-await-in-loop -- Pair source/root/gesture with this screenshot.
              await writeFile(
                join(directory, 'screenshot-receipt.json'),
                JSON.stringify(
                  {
                    ...receipt,
                    gesture,
                    capturedAt,
                    currentIdentity,
                    screenshotFile,
                    screenshotSha256: createHash('sha256').update(bytes).digest('hex'),
                    bytes: bytes.byteLength,
                  },
                  null,
                  2,
                ),
              );
              break;
            }
            case 'project': {
              // oxlint-disable-next-line no-await-in-loop -- Explicit fixed rooted manifest mutation.
              await writeFile(manifestPath, JSON.stringify({ ...manifest, name: 'Manual native current project' }));
              break;
            }
            case 'chat': {
              // oxlint-disable-next-line no-await-in-loop -- Explicit fixed rooted chat metadata mutation.
              await writeFile(chatPath, JSON.stringify({ ...chat, name: 'Manual native current chat' }));
              break;
            }
            case 'delete-thumbnail': {
              // oxlint-disable-next-line no-await-in-loop -- Explicit fixed rooted thumbnail deletion.
              await rm(join(root, 'thumbnail.webp'), { force: true });
              break;
            }
            default: {
              // oxlint-disable-next-line no-await-in-loop -- Actual native bytes; never a forged change event.
              await writeFile(join(root, 'thumbnail.webp'), action === 'thumbnail-a' ? thumbnailA : thumbnailB);
              break;
            }
          }
        }
        // oxlint-disable-next-line no-await-in-loop -- Bounded fixture cadence, no product navigation or state polling.
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 100);
        });
      }
      expect(ended).toBe(true);
    } finally {
      await session.close();
    }
  },
);
