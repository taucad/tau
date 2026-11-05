/**
 * Viewer parity, WASM pass (Tau Brain `research/nanoraster-viewer-parity-charter.md`, W6): renders each fixture
 * through nanoraster's WASM build, the build the web app ships. The app's image worker imports `nanoraster` through
 * a browser bundle, which resolves the universal entry: no native addon is installed there, so every render goes
 * through the WASM artifact on the page's WebGPU device (SwiftShader in CI). This pass loads that same entry in
 * Chromium, renders with the options the Node gate sends for the viewer's camera, and writes the PNGs the Node gate
 * scores beside its native renders. It runs before the gate in `vitest.viewer-parity.config.ts`; inputs are documented
 * in `viewer-parity.gate.test.ts`.
 */

import { describe, expect, inject, it } from 'vitest';
import { commands } from 'vitest/browser';
import {
  viewerParityReferenceName,
  viewerParityRenderName,
  viewerParityWasmRecordName,
} from '#scripts/viewer-parity-files.js';
import { buildViewerParityImageOptions, renderViewerParityImage } from '#scripts/viewer-parity-render.js';
import type { ViewerParityCameraState, ViewerParityNanorasterModule } from '#scripts/viewer-parity-render.js';

/** What the config hands the WASM pass. */
type ViewerParityWasmConfig = (
  | Readonly<{
      /** Absolute path of nanoraster's universal entry. */
      entry: string;
      /** `package nanoraster@<version>` or `checkout <path>`. */
      source: string;
    }>
  | Readonly<{
      /** Why the entry did not resolve. */
      unavailable: string;
    }>
) &
  Readonly<{
    viewerDirectory: string;
    outDirectory: string;
    fixtures: ReadonlyArray<Readonly<{ name: string; glb: string }>>;
  }>;

declare module 'vitest' {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- Vitest's ProvidedContext is an interface to merge.
  interface ProvidedContext {
    viewerParityWasm: ViewerParityWasmConfig;
  }
}

const config = inject('viewerParityWasm');
if ('unavailable' in config) {
  throw new Error(config.unavailable);
}
// Vite serves the entry and its imports from the file system, as it would bundle them for the image worker.
const renderer = (await import(/* @vite-ignore */ `/@fs${config.entry}`)) as ViewerParityNanorasterModule;
const adapter = await renderer.describeAdapter();

/** Bytes as a latin1 string, one character per byte, for `commands.writeFile(…, 'latin1')`. */
const toLatin1 = (bytes: Uint8Array<ArrayBuffer>): string => {
  let latin1 = '';
  const chunk = 0x80_00;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    latin1 += String.fromCodePoint(...bytes.subarray(offset, offset + chunk));
  }
  return latin1;
};

const renderAndWrite = async (
  fixture: Readonly<{ name: string }>,
  glb: Uint8Array<ArrayBuffer>,
  ao: boolean,
): Promise<void> => {
  const reference = JSON.parse(
    await commands.readFile(`${config.viewerDirectory}/${fixture.name}/${viewerParityReferenceName(ao)}`),
  ) as { camera: ViewerParityCameraState };
  const png = await renderViewerParityImage(
    renderer,
    glb,
    buildViewerParityImageOptions({ camera: reference.camera, ao }),
  );
  await commands.writeFile(
    `${config.outDirectory}/${fixture.name}/${viewerParityRenderName('wasm', ao)}`,
    toLatin1(png),
    'latin1',
  );
};

describe(`viewer parity renders through nanoraster WASM (${config.source})`, () => {
  it.each(config.fixtures)('should render $name at the viewer camera with AO on and off', async (fixture) => {
    const response = await fetch(`/@fs${fixture.glb}`);
    expect(response.ok, `${fixture.name}: GLB ${fixture.glb}`).toBe(true);
    const glb = new Uint8Array(await response.arrayBuffer());
    // The renderer serializes calls on its one renderer, so the two renders still run one after the other.
    await Promise.all([true, false].map(async (ao) => renderAndWrite(fixture, glb, ao)));
    await commands.writeFile(
      `${config.outDirectory}/${fixture.name}/${viewerParityWasmRecordName}`,
      `${JSON.stringify({ nanoraster: config.source, adapter, userAgent: navigator.userAgent }, undefined, 2)}\n`,
    );
  });
});
