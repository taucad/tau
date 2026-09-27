import { expect, inject, test } from 'vitest';
import { page as selectors, server } from 'vitest/browser';
import { base64ToUint8Array, uint8ArrayToHex } from 'uint8array-extras';
import * as target from '#support/external-target.js';

/*
 * PicoVoxel in the browser (T2.9). With COOP/COEP the 'auto' wasm option serves the
 * fast lane from the multi-threaded build, whose pthreads show up as `pico-multi`
 * workers; without them it degrades to the serial build and says why. Either way
 * the exact STL export replays on the serial build and carries no fast-lane header.
 */
const fixtureRoute = '/__e2e/example-fixture?locator=picovoxel.sphere-minus-beams';
const isolated = inject('crossOriginIsolation');

const openCommand = async (name: string): Promise<void> => {
  await target.click(selectors.getByRole('button', { name: 'Search', exact: true }));
  await target.fill(selectors.getByPlaceholder('Search projects, chats, and actions...'), name);
  await target.click(selectors.getByRole('option', { name: new RegExp(`^${name}(?:\\s|$)`, 'u') }));
};

test('renders PicoVoxel on the variant its isolation allows and exports exact STL', async () => {
  const headers = await target.navigate(fixtureRoute);
  if (isolated) {
    expect(headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(headers['cross-origin-embedder-policy']).toBe('require-corp');
    expect(headers['cross-origin-resource-policy']).toBe('same-origin');
  }
  expect(await target.evaluate(() => globalThis.crossOriginIsolated)).toBe(isolated);

  await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 60_000);
  await target.expectVisible(selectors.getByTestId('cad-viewer-canvas-region').getByCss('canvas').first(), 120_000);
  await target.click(selectors.getByRole('button', { name: /^decline$/iu }), { timeout: 5000 }).catch(() => undefined);
  await target.expectGeometryFramed();

  const variant = isolated ? 'multi' : 'serial';
  await openCommand('Open console');
  const log = selectors.getByRole('log', { name: 'Console logs for main.ts' });
  await target.expectVisible(log, 60_000);
  await target.expectVisible(log.getByText(`PicoVoxel fast-lane WASM variant: ${variant}`, { exact: false }), 60_000);
  if (!isolated) {
    await target.expectVisible(log.getByText('Cross-origin isolation degraded', { exact: false }), 60_000);
  }
  await target.expectCount(log.getByText('PICO_WASM_INIT_FAILED', { exact: false }), 0);

  // Only Chromium reports the kernel worker's nested pthread workers to Playwright.
  if (server.browser === 'chromium') {
    const pthreads = await target.workers('pico-multi');
    if (isolated) {
      expect(pthreads.length).toBeGreaterThan(1);
    } else {
      expect(pthreads).toHaveLength(0);
    }
  }

  await openCommand('Export');
  const panel = selectors.getByCss('[data-slot="export-panel-body"]');
  await target.expectVisible(panel, 15_000);
  const stl = panel.getByRole('button', { name: /^stl$/iu });
  if ((await target.getAttribute(stl, 'aria-pressed')) !== 'true') {
    await target.click(stl);
  }
  const file = await target.download(panel.getByRole('button', { name: /^Export STL$/iu }));
  expect(file.suggestedFilename).toMatch(/\.stl$/u);
  const bytes = base64ToUint8Array(file.base64);
  const header = new TextDecoder().decode(bytes.subarray(0, 80)).replace(/[\0 ]+$/u, '');
  expect(header).toBe('PicoGK UNITS=mm');

  // DP18: the exact bytes are the serial build's in every host, so they equal the pin a Node
  // serial export of the same example asserts in runtime-e2e.
  const hex = uint8ArrayToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
  await target.writeArtifact(`picovoxel-exact-stl-${server.browser}.sha256`, `${hex}  ${bytes.byteLength}\n`);
  expect({ sha256: hex, bytes: bytes.byteLength }).toEqual(inject('picovoxelExactStlPin'));
});
