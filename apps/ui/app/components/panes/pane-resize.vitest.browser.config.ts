import { fileURLToPath } from 'node:url';
import type { CDPSession, Page } from 'playwright';
import tailwindcss from '@tailwindcss/vite';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';
import { tauRuntime } from '@taucad/runtime/vite';

const emulationSessions = new WeakMap<Page, CDPSession>();

/** Real-browser pane resize acceptance with the shipped styles. */
export default defineConfig({
  root: fileURLToPath(new URL('../../..', import.meta.url)),
  define: { tauCloudBuildEnabled: 'false' },
  plugins: [tailwindcss(), tauRuntime()],
  server: {
    host: '127.0.0.1',
    fs: { allow: [fileURLToPath(new URL('../../../../..', import.meta.url))] },
  },
  test: {
    include: ['app/components/panes/pane-resize.browser.test.tsx'],
    fileParallelism: false,
    browser: {
      enabled: true,
      headless: true,
      screenshotDirectory: fileURLToPath(new URL('../../../../../out/test-results/pane-resize', import.meta.url)),
      provider: playwright({ launchOptions: { channel: 'chromium' } }),
      commands: {
        async resizePointer({ page, frame }, phase: 'down' | 'move' | 'up', point: { x: number; y: number }) {
          if (phase === 'up') {
            await page.mouse.up();
            return;
          }
          const testFrame = await frame();
          const frameElement = await testFrame.frameElement();
          const offset = await frameElement.boundingBox();
          const dimensions = await testFrame.evaluate(() => ({ width: innerWidth, height: innerHeight }));
          await page.mouse.move(
            (offset?.x ?? 0) + (point.x * (offset?.width ?? dimensions.width)) / dimensions.width,
            (offset?.y ?? 0) + (point.y * (offset?.height ?? dimensions.height)) / dimensions.height,
          );
          if (phase === 'down') {
            await page.mouse.down();
          }
        },
        async resizeTouch({ page, frame, context }, phase: 'start' | 'cancel', point: { x: number; y: number }) {
          let session = emulationSessions.get(page);
          if (!session) {
            session = await context.newCDPSession(page);
            emulationSessions.set(page, session);
          }
          const testFrame = await frame();
          const frameElement = await testFrame.frameElement();
          const offset = await frameElement.boundingBox();
          const dimensions = await testFrame.evaluate(() => ({ width: innerWidth, height: innerHeight }));
          const x = (offset?.x ?? 0) + (point.x * (offset?.width ?? dimensions.width)) / dimensions.width;
          const y = (offset?.y ?? 0) + (point.y * (offset?.height ?? dimensions.height)) / dimensions.height;
          await session.send('Input.dispatchTouchEvent', {
            type: phase === 'start' ? 'touchStart' : 'touchCancel',
            touchPoints: phase === 'start' ? [{ x, y, id: 1 }] : [],
          });
        },
        async resizeEnvironment({ page, context }, reduced: boolean, coarse: boolean) {
          await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
          let session = emulationSessions.get(page);
          if (!session) {
            session = await context.newCDPSession(page);
            emulationSessions.set(page, session);
          }
          await session.send('Emulation.setTouchEmulationEnabled', { enabled: coarse, maxTouchPoints: 1 });
        },
      },
      instances: [{ browser: 'chromium' }],
    },
  },
});
