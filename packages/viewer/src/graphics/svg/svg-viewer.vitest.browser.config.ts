import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

/** Real Chromium acceptance of the authored SVG viewer and its isolated styles. */
export default defineConfig({
  root: fileURLToPath(new URL('../../..', import.meta.url)),
  plugins: [tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 5196,
    fs: { allow: [fileURLToPath(new URL('../../../../..', import.meta.url))] },
  },
  test: {
    include: ['src/graphics/svg/svg-viewer.browser.test.tsx', 'src/graphics/svg/svg-viewer-pan-zoom.browser.test.tsx'],
    fileParallelism: false,
    browser: {
      enabled: true,
      headless: true,
      screenshotDirectory: '../../out/tscircuit-closeout/browser-failures',
      provider: playwright({ launchOptions: { channel: 'chromium' } }),
      commands: {
        // Drives the real mouse; `move` takes a point in the test page's CSS pixels.
        async svgMouse(
          { page, frame },
          action: 'move' | 'down' | 'up' | 'wheel',
          options: { x?: number; y?: number; button?: 'left' | 'right'; deltaY?: number; pinch?: boolean } = {},
        ) {
          if (action === 'move') {
            const testFrame = await frame();
            const frameElement = await testFrame.frameElement();
            const offset = await frameElement.boundingBox();
            const dimensions = await testFrame.evaluate(() => ({ width: innerWidth, height: innerHeight }));
            await page.mouse.move(
              (offset?.x ?? 0) + ((options.x ?? 0) * (offset?.width ?? dimensions.width)) / dimensions.width,
              (offset?.y ?? 0) + ((options.y ?? 0) * (offset?.height ?? dimensions.height)) / dimensions.height,
            );
          } else if (action === 'wheel') {
            // A trackpad pinch reaches the page as a wheel with the control key down.
            if (options.pinch) {
              await page.keyboard.down('Control');
            }
            await page.mouse.wheel(0, options.deltaY ?? 0);
            if (options.pinch) {
              await page.keyboard.up('Control');
            }
          } else {
            await page.mouse[action]({ button: options.button ?? 'left' });
          }
        },
      },
      instances: [{ browser: 'chromium' }],
    },
  },
});
