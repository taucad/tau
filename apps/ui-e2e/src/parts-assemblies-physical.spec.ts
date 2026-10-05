/* eslint-disable no-await-in-loop -- Product actions and immutable closure reads are deliberately ordered. */
import { expect, test } from 'vitest';
import { base64ToUint8Array } from 'uint8array-extras';
import { page as selectors } from 'vitest/browser';
import type { AdmittedAssembly, PublishedPartAsset, PublishedPartReference } from '@taucad/runtime/types';
import * as target from '#support/external-target.js';
import { expandPath, treeItem } from '#support/file-tree.js';

const authoredPath = 'physical/assembly.json';
const sourcePath = 'public/models/physical-inspection.js';
const deliveredAssets = [
  { name: 'replicad_single.wasm', digest: 'sha256:9eecb79da12acf0c6270d36548feb6595191640d87bb7f7931e90da12262ccc9' },
  { name: 'replicad_single.mjs', digest: 'sha256:cfc514722fddc9295b93da66c9ceca8627edcf22edf463db5fd316d4bb155e27' },
];

type CommittedCapture = Readonly<{
  assemblyDisplay: Readonly<{ root: PublishedPartAsset; admitted: AdmittedAssembly }> | undefined;
  isCurrent(): boolean;
  readRawBytes(path: string): Promise<Uint8Array<ArrayBuffer>>;
}>;
type PhysicalBridge = { getCommittedAssembly(): CommittedCapture; isGeometryFramed(): boolean };

const command = async (name: string): Promise<void> => {
  await target.click(selectors.getByRole('button', { name: 'Search', exact: true }));
  await target.fill(selectors.getByPlaceholder('Search projects, chats, and actions…'), name);
  await target.click(selectors.getByRole('option', { name, exact: true }));
};
const exportStep = async (): Promise<target.TargetDownload> => {
  await command('Export');
  const panel = selectors.getByCss('[data-slot="export-panel-body"]');
  try {
    await target.expectVisible(panel, 60_000);
    const stepFormat = panel.getByRole('button', { name: 'step', exact: true });
    await target.expectVisible(stepFormat, 60_000);
    for (const { format, name } of [
      { format: 'STL', name: 'stl' },
      { format: 'GLB', name: 'glb' },
      { format: 'OBJ', name: 'obj' },
      { format: 'PLY', name: 'ply' },
      { format: 'USDZ', name: 'usdz' },
      { format: 'STEP', name: 'step' },
    ]) {
      const button = panel.getByRole('button', { name, exact: true });
      if (await target.isVisible(button)) {
        const selected = (await target.getAttribute(button, 'aria-pressed')) === 'true';
        if (selected !== (format === 'STEP')) {
          await target.click(button);
        }
      }
    }
    expect(await target.getAttribute(stepFormat, 'aria-pressed')).toBe('true');
    return await target.download(panel.getByRole('button', { name: 'Export STEP', exact: true }));
  } catch (error) {
    const accessibility = await target.read(panel, { accessibility: true });
    const state = await target.evaluate(() => ({
      text: document.querySelector('[data-slot="export-panel-body"]')?.textContent,
      buttons: [...document.querySelectorAll('[data-slot="export-panel-body"] button')].map((button) => ({
        text: button.textContent,
        disabled: button.hasAttribute('disabled'),
        selected: button.getAttribute('aria-pressed'),
      })),
    }));
    const events = await target.events();
    await target.writeArtifact(
      'c3-browser-export-failure.json',
      JSON.stringify({ state, accessibility, events }, null, 2),
    );
    await target.screenshot(selectors.getByRole('main'), 'c3-browser-export-failure.png');
    throw new Error(`Actual source-free export failed: ${JSON.stringify({ state, events })}`, { cause: error });
  }
};

// The existing physical-inspection test owns ordinary-source scrub behavior.
// This distinct product gate uses a real authored pin and exports after its sources are removed.
test('delivers custom native physical facts and a source-free browser pin for Electron', async () => {
  await target.setViewport({ width: 1440, height: 900 });
  await target.navigate('/__e2e/project-file-tree?main=physical-assembly');
  await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 60_000);
  await target.click(selectors.getByRole('button', { name: /^decline$/iu }), { timeout: 5000 }).catch(() => undefined);
  const servedAssets = await target.evaluate(async (assets) => {
    const hash = async (bytes: Uint8Array<ArrayBuffer>): Promise<string> =>
      `sha256:${[...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
    const servedAssets = [];
    for (const asset of assets) {
      const url = `/assets/engines/replicad/density-single-v1/${asset.name}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Delivered asset unavailable: ${url}`);
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      const digest = await hash(bytes);
      if (digest !== asset.digest) {
        throw new Error(`Delivered asset identity changed: ${url}`);
      }
      servedAssets.push({ ...asset, url: new URL(url, location.href).href, byteLength: bytes.byteLength });
    }
    return servedAssets;
  }, deliveredAssets);
  try {
    await target.waitFor(
      () => {
        const bridge = (globalThis as typeof globalThis & { __TAU_SECTION_VIEW_TEST__?: PhysicalBridge })
          .__TAU_SECTION_VIEW_TEST__;
        const capture = bridge?.getCommittedAssembly();
        return Boolean(bridge?.isGeometryFramed() && capture?.assemblyDisplay && capture.isCurrent());
      },
      undefined,
      { timeout: 120_000 },
    );
  } catch (error) {
    const state = await target.evaluate(() => {
      const bridge = (globalThis as typeof globalThis & { __TAU_SECTION_VIEW_TEST__?: PhysicalBridge })
        .__TAU_SECTION_VIEW_TEST__;
      const capture = bridge?.getCommittedAssembly();
      return {
        url: location.href,
        text: document.body.textContent,
        bridgeAvailable: Boolean(bridge),
        framed: bridge?.isGeometryFramed(),
        current: capture?.isCurrent(),
        root: capture?.assemblyDisplay?.root,
        diagnostics: capture && 'diagnostics' in capture ? capture.diagnostics : undefined,
      };
    });
    const events = await target.events();
    await target.writeArtifact('c3-browser-physical-wait-failure.json', JSON.stringify({ state, events }, null, 2));
    await target.screenshot(selectors.getByRole('main'), 'c3-browser-physical-wait-failure.png');
    throw new Error(`Physical assembly did not commit and frame: ${JSON.stringify({ state, events })}`, {
      cause: error,
    });
  }

  const closure = await target.evaluate(async (servedAssets) => {
    const bridge = (globalThis as typeof globalThis & { __TAU_SECTION_VIEW_TEST__?: PhysicalBridge })
      .__TAU_SECTION_VIEW_TEST__;
    const capture = bridge?.getCommittedAssembly();
    const display = capture?.assemblyDisplay;
    if (!capture || !display || !capture.isCurrent()) {
      throw new Error('Actual committed physical pin is unavailable.');
    }
    const hash = async (bytes: Uint8Array<ArrayBuffer>): Promise<string> =>
      `sha256:${[...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
    // Keep this callback self-contained: it is serialized into the actual app page.
    const base64 = async (bytes: Uint8Array<ArrayBuffer>): Promise<string> =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.addEventListener(
          'load',
          () => {
            const { result } = reader;
            const prefix = 'data:application/octet-stream;base64,';
            if (typeof result !== 'string' || !result.startsWith(prefix)) {
              reject(new Error('Physical closure byte encoding returned an invalid data URL.'));
              return;
            }
            resolve(result.slice(prefix.length));
          },
          { once: true },
        );
        reader.addEventListener(
          'error',
          () => {
            reject(reader.error ?? new Error('Physical closure byte encoding failed.'));
          },
          { once: true },
        );
        reader.addEventListener(
          'abort',
          () => {
            reject(new Error('Physical closure byte encoding aborted.'));
          },
          { once: true },
        );
        reader.readAsDataURL(new Blob([bytes], { type: 'application/octet-stream' }));
      });
    const parent = display.root.path.slice(0, display.root.path.lastIndexOf('/') + 1);
    if (!/^\.tau\/artifacts\/reusable-parts\/[0-9a-f]{64}\/$/u.test(parent)) {
      throw new Error('Managed physical pin parent is invalid.');
    }
    const files = new Map<string, { path: string; digest: string; byteLength: number; base64: string }>();
    const retain = async (asset: {
      path: string;
      digest: string;
      byteLength?: number;
    }): Promise<Uint8Array<ArrayBuffer>> => {
      if (!capture.isCurrent() || !asset.path.startsWith(parent) || asset.path.includes('..')) {
        throw new Error('Physical closure subject/path changed.');
      }
      const bytes = await capture.readRawBytes(asset.path);
      if (
        (asset.byteLength !== undefined && bytes.byteLength !== asset.byteLength) ||
        (await hash(bytes)) !== asset.digest ||
        !capture.isCurrent()
      ) {
        throw new Error(`Physical closure identity failed: ${asset.path}`);
      }
      const previous = files.get(asset.path);
      if (previous && (previous.digest !== asset.digest || previous.byteLength !== bytes.byteLength)) {
        throw new Error('Physical closure has conflicting identities.');
      }
      const encoded = await base64(bytes);
      if (!capture.isCurrent()) {
        throw new Error('Physical closure retired during byte encoding.');
      }
      files.set(asset.path, {
        path: asset.path,
        digest: asset.digest,
        byteLength: bytes.byteLength,
        base64: encoded,
      });
      return bytes;
    };
    const rootBytes = await retain(display.root);
    const decode = (bytes: Uint8Array<ArrayBuffer>): unknown =>
      JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    const pointer = decode(rootBytes) as {
      schemaVersion: number;
      generation: number;
      manifest: PublishedPartAsset;
    };
    const storagePath = (digest: string, extension: string): string =>
      `${parent}roots/sha256/${digest.slice('sha256:'.length)}.${extension}`;
    if (
      rootBytes.byteLength > 4096 ||
      pointer.schemaVersion !== 2 ||
      !Number.isSafeInteger(pointer.generation) ||
      pointer.generation < 1 ||
      pointer.manifest.path !== storagePath(pointer.manifest.digest, 'json') ||
      pointer.manifest.byteLength < 1 ||
      pointer.manifest.byteLength > 1_048_576
    ) {
      throw new Error('Physical root pointer is invalid.');
    }
    const manifest = decode(await retain(pointer.manifest)) as {
      schemaVersion: number;
      content: { digest: string; byteLength: number };
      chunks: PublishedPartAsset[];
    };
    if (
      manifest.schemaVersion !== 1 ||
      !Number.isSafeInteger(manifest.content.byteLength) ||
      manifest.content.byteLength < 1 ||
      manifest.content.byteLength > 32 * 1_048_576 ||
      manifest.chunks.length !== Math.ceil(manifest.content.byteLength / 1_048_576)
    ) {
      throw new Error('Physical root manifest is invalid.');
    }
    const content = new Uint8Array(manifest.content.byteLength);
    let offset = 0;
    for (const chunk of manifest.chunks) {
      const length = Math.min(1_048_576, content.byteLength - offset);
      if (chunk.path !== storagePath(chunk.digest, 'chunk') || chunk.byteLength !== length) {
        throw new Error('Physical root chunk order or length changed.');
      }
      content.set(await retain(chunk), offset);
      offset += length;
    }
    if ((await hash(content)) !== manifest.content.digest || !capture.isCurrent()) {
      throw new Error('Physical logical root digest or subject changed.');
    }
    // Project references from checked logical bytes, never reconstruct a publication.
    const root = decode(content) as {
      schemaVersion: number;
      generation: number;
      parts: Record<string, PublishedPartReference>;
    };
    if (root.schemaVersion !== 1 || root.generation !== pointer.generation) {
      throw new Error('Physical logical root generation changed.');
    }
    const names = Object.keys(display.admitted.publication.parts);
    if (names.length !== Object.keys(root.parts).length || names.some((name) => !Object.hasOwn(root.parts, name))) {
      throw new Error('Incomplete actual part references.');
    }
    for (const name of names) {
      await retain(root.parts[name]!);
      for (const variant of Object.values(display.admitted.publication.parts[name]!.variants)) {
        await retain(variant.glb);
        const admittedBytes = await display.admitted.readAsset(variant.glb.digest);
        if ((await hash(admittedBytes)) !== variant.glb.digest || admittedBytes.byteLength !== variant.glb.byteLength) {
          throw new Error('Actual admitted reader differs from rooted bytes.');
        }
        if (!variant.exact) {
          throw new Error('App custom physical producer omitted its native snapshot.');
        }
        await retain(variant.exact.asset);
      }
    }
    if (!capture.isCurrent()) {
      const fresh = bridge?.getCommittedAssembly();
      throw new Error(
        `Physical presentation changed during closure collection: ${JSON.stringify({ capturedRoot: display.root, capturedDiagnostics: 'diagnostics' in capture ? capture.diagnostics : undefined, freshRoot: fresh?.assemblyDisplay?.root, freshCurrent: fresh?.isCurrent(), freshDiagnostics: fresh && 'diagnostics' in fresh ? fresh.diagnostics : undefined })}`,
      );
    }
    return {
      root: display.root,
      publication: display.admitted.publication,
      partRecords: root.parts,
      files: [...files.values()],
      servedAssets,
    };
  }, servedAssets);
  expect(Object.keys(closure.publication.parts)).toEqual(['inspection']);
  const variant = closure.publication.parts['inspection']!.variants['default']!;
  expect(variant.exact?.kernelId).toBe('replicad');
  expect(variant.exact?.codecVersion).toBe('2');
  expect(variant.exact?.unit).toBe('millimeter');
  const descriptor = JSON.parse(variant.exact!.providerVersion) as {
    wasmVariant: string;
    assets: string[];
    kernelVersion: string;
  };
  expect(descriptor.wasmVariant).toBe('custom');
  expect(descriptor.assets).toEqual(deliveredAssets.map(({ digest }) => digest));
  expect(descriptor.kernelVersion).toBe('1.4.2');

  await command('Open model structure');
  const parts = selectors.getByRole('list', { name: `Model components for ${authoredPath}` });
  await target.expectVisible(parts, 60_000);
  await target.expectVisible(selectors.getByText('Weight · 1 of 3 parts known', { exact: true }), 60_000);
  await target.click(parts.getByRole('button', { name: 'Known housing', exact: true }));
  const physical = selectors.getByRole('region', { name: 'Physical facts', exact: true });
  await target.expectVisible(physical.getByText('12.48 cm³', { exact: true }));
  await target.expectVisible(physical.getByText('1.55 g/cm³', { exact: true }));
  await target.expectVisible(physical.getByText('19.34 g', { exact: true }));
  await target.click(parts.getByRole('button', { name: 'Unknown density', exact: true }));
  await target.expectVisible(physical.getByText('0.48 cm³', { exact: true }));
  await target.expectCount(physical.getByText('Unknown', { exact: true }), 2);
  await target.click(parts.getByRole('button', { name: 'Open face', exact: true }));
  await target.expectCount(physical.getByText('Unavailable', { exact: true }), 2);
  await target.screenshot(selectors.getByRole('main'), 'c3-pinned-physical-custom.png');

  await target.writeArtifact(
    'c3-browser-physical-before-scrub.json',
    JSON.stringify({ status: 'actual closure before source removal; product gate incomplete', ...closure }, null, 2),
  );
  await command('Open files');
  for (const path of [sourcePath, authoredPath]) {
    await expandPath(path.slice(0, path.lastIndexOf('/')));
    await target.click(treeItem(path), { button: 'right' });
    await target.click(selectors.getByRole('menuitem', { name: 'Delete', exact: true }));
    const dialog = selectors.getByRole('alertdialog');
    await target.click(dialog.getByRole('button', { name: /^Delete/u }));
    await target.expectCount(treeItem(path), 0, 60_000);
  }
  try {
    await command('Open files');
    await target.expectVisible(selectors.getByRole('region', { name: /^Files for /u }).first());
    for (const path of [sourcePath, authoredPath]) {
      await target.expectCount(treeItem(path), 0, 60_000);
    }
    await expandPath(closure.root.path.slice(0, closure.root.path.lastIndexOf('/')));
    await target.hover(treeItem(closure.root.path));
    await target.click(selectors.getByRole('button', { name: 'More actions for scene.json', exact: true }));
    await target.click(selectors.getByRole('menuitem', { name: 'Open in Viewer', exact: true }));
  } catch (error) {
    const state = await target.evaluate(() => {
      const bridge = (globalThis as typeof globalThis & { __TAU_SECTION_VIEW_TEST__?: PhysicalBridge })
        .__TAU_SECTION_VIEW_TEST__;
      const capture = bridge?.getCommittedAssembly();
      return {
        url: location.href,
        text: document.body.textContent,
        root: capture?.assemblyDisplay?.root,
        current: capture?.isCurrent(),
        diagnostics: capture && 'diagnostics' in capture ? capture.diagnostics : undefined,
        rows: [...document.querySelectorAll<HTMLElement>('[data-file-tree-path]')].map((row) => ({
          path: row.dataset['fileTreePath'],
          expanded: row.getAttribute('aria-expanded'),
        })),
        panes: [...document.querySelectorAll<HTMLElement>('[data-file-pane-id]')].map((pane) => ({
          id: pane.dataset['filePaneId'],
          text: pane.textContent,
          actions: [...pane.querySelectorAll('button')].map((button) => ({
            label: button.getAttribute('aria-label'),
            pressed: button.getAttribute('aria-pressed'),
            controls: button.getAttribute('aria-controls'),
          })),
        })),
        workbench: [...document.querySelectorAll<HTMLElement>('.dv-dockview')].map((dockview) => ({
          html: dockview.outerHTML,
        })),
      };
    });
    const events = await target.events();
    await target.writeArtifact('c3-browser-sourcefree-tree-failure.json', JSON.stringify({ state, events }, null, 2));
    await target.screenshot(selectors.getByRole('main'), 'c3-browser-sourcefree-tree-failure.png');
    throw new Error(`Actual source-free tree open failed: ${JSON.stringify({ state, events })}`, { cause: error });
  }
  await target.waitFor(
    (digest) => {
      const capture = (
        globalThis as typeof globalThis & { __TAU_SECTION_VIEW_TEST__?: PhysicalBridge }
      ).__TAU_SECTION_VIEW_TEST__?.getCommittedAssembly();
      return capture?.assemblyDisplay?.root.digest === digest && capture.isCurrent();
    },
    closure.root.digest,
    { timeout: 120_000 },
  );
  await command('Open model structure');
  const reopenedParts = selectors.getByRole('list', { name: `Model components for ${closure.root.path}` });
  await target.expectVisible(reopenedParts, 60_000);
  await target.click(reopenedParts.getByRole('button', { name: 'Known housing', exact: true }));
  await target.expectVisible(physical.getByText('12.48 cm³', { exact: true }));
  await target.expectVisible(physical.getByText('19.34 g', { exact: true }));
  await target.expectVisible(selectors.getByText('Weight · 1 of 3 parts known', { exact: true }));
  const step = await exportStep();
  expect(step.suggestedFilename).toMatch(/\.(?:step|stp)$/iu);
  expect(new TextDecoder().decode(base64ToUint8Array(step.base64))).toContain('ISO-10303-21');
  await target.writeArtifact('c3-browser-physical.step.base64', step.base64);
  await target.writeArtifact(
    'c3-browser-physical-closure.json',
    JSON.stringify(
      {
        ...closure,
        sourceFree: { removed: [sourcePath, authoredPath] },
        independentPhysicalOracle: {
          knownVolumeMm3: 12_480,
          densityGramsPerCubicCentimeter: 1.55,
          knownMassG: 19.344,
          unknownVolumeMm3: 480,
          massCoverage: '1/3',
          volumeCoverage: '2/3',
        },
        excludedClaims: [
          'ordinary-source scrub (separate existing test)',
          'independent STEP units/bounds oracle',
          'performance/corpus qualification',
        ],
      },
      undefined,
      2,
    ),
  );
});
