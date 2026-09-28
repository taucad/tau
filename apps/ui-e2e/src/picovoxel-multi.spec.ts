import { expect, inject, test } from 'vitest';
import { page as selectors, server } from 'vitest/browser';
import { base64ToUint8Array, uint8ArrayToHex } from 'uint8array-extras';
import * as target from '#support/external-target.js';

/*
 * PicoVoxel in the browser (T2.9). With COOP/COEP the 'auto' wasm option serves the
 * fast lane from the multi-threaded build, whose pthreads show up as `pico-multi`
 * workers; without them it degrades to the serial build and says why. Either way
 * the exact STL and GLB exports replay on the serial build and equal the DP18 pins.
 */
const fixtureRoute = '/__e2e/example-fixture?locator=picovoxel.sphere-minus-beams';
const isolated = inject('crossOriginIsolation');

const openCommand = async (name: string): Promise<void> => {
  await target.click(selectors.getByRole('button', { name: 'Search', exact: true }));
  await target.fill(selectors.getByPlaceholder('Search projects, chats, and actions…'), name);
  await target.click(selectors.getByRole('option', { name: new RegExp(`^${name}(?:\\s|$)`, 'u') }));
};

test('renders PicoVoxel on the variant its isolation allows and exports the pinned exact STL and GLB', async () => {
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
  const formatToggle = (format: 'stl' | 'glb') => panel.getByRole('button', { name: new RegExp(`^${format}$`, 'iu') });
  // Formats are multi-select; export exactly one so the download is that file, not an archive.
  const exportExact = async (format: 'stl' | 'glb'): Promise<ReturnType<typeof base64ToUint8Array>> => {
    for (const each of ['stl', 'glb'] as const) {
      const toggle = formatToggle(each);
      // oxlint-disable-next-line no-await-in-loop -- toggles change the shared selection one at a time
      if (((await target.getAttribute(toggle, 'aria-pressed')) === 'true') !== (each === format)) {
        // oxlint-disable-next-line no-await-in-loop -- as above
        await target.click(toggle);
      }
    }
    const file = await target.download(panel.getByRole('button', { name: new RegExp(`^Export ${format}$`, 'iu') }));
    expect(file.suggestedFilename).toMatch(new RegExp(`\\.${format}$`, 'u'));
    return base64ToUint8Array(file.base64);
  };
  const pinOf = async (format: 'stl' | 'glb', bytes: ReturnType<typeof base64ToUint8Array>) => {
    const hex = uint8ArrayToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
    await target.writeArtifact(`picovoxel-exact-${format}-${server.browser}.sha256`, `${hex}  ${bytes.byteLength}\n`);
    return { sha256: hex, bytes: bytes.byteLength };
  };
  const pins = inject('picovoxelExactPins');

  const stl = await exportExact('stl');
  const header = new TextDecoder().decode(stl.subarray(0, 80)).replace(/[\0 ]+$/u, '');
  expect(header).toBe('PicoGK UNITS=mm');
  // DP18: the exact bytes are the serial build's in every host, so they equal the pins a Node
  // serial export of the same example asserts in runtime-e2e. The GLB adds normals computed in
  // JavaScript with the correctly rounded `Math.sqrt`, so they match across engines too.
  expect(await pinOf('stl', stl)).toEqual(pins.stl);
  expect(await pinOf('glb', await exportExact('glb'))).toEqual(pins.glb);
});
