import { base64ToUint8Array } from 'uint8array-extras';
/* eslint-disable no-await-in-loop -- Each paired case uses the same real project and is restored before the next consumer operation. */
import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { PublishedPartReference } from '@taucad/runtime/types';
import * as target from '#support/external-target.js';
import { dismissCookies } from '#support/chat-attachments.js';
import { expandPath, treeItem } from '#support/file-tree.js';
import { compareScalePngFrames } from '#support/parts-assemblies-scale.js';
import {
  assertOrdinaryParityDiagnostics,
  emittedParitySurfaceMaterials,
  emittedParitySurfaceNormals,
  parityDrawFrameEvidence,
} from '#support/parts-assemblies-parity.js';
import type { AssemblyTestBridgeApi } from '#support/parts-assemblies-motion.js';

type ParityWindow = typeof globalThis & { __TAU_SECTION_VIEW_TEST__?: AssemblyTestBridgeApi };
const scenarios = [
  'opaque-positive',
  'effective-ancestor-opacity',
  'source-transmission',
  'source-transparent',
  'composed-shear',
  'mirror',
] as const;
const assemblyPath = 'parity/assembly.json';
const ordinaryPath = 'parity/parity-baseline.glb';
const decode = (base64: string): Uint8Array<ArrayBuffer> => base64ToUint8Array(base64);
const digest = async (bytes: Uint8Array<ArrayBuffer>): Promise<string> =>
  `sha256:${[...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((value) => value.toString(16).padStart(2, '0')).join('')}`;

async function openCommand(name: string): Promise<void> {
  await target.click(selectors.getByRole('button', { name: 'Search', exact: true }));
  await target.fill(selectors.getByPlaceholder('Search projects, chats, and actions…'), name);
  await target.click(selectors.getByRole('option', { name, exact: true }));
}
async function readState(includeRenderDevice = false) {
  return target.evaluate((includeRenderDevice) => {
    const bridge = (globalThis as ParityWindow).__TAU_SECTION_VIEW_TEST__;
    if (!bridge) {
      throw new Error('Actual mounted parity bridge is unavailable.');
    }
    const subject = bridge.getCommittedAssembly();
    const canvas = bridge.getViewportCanvas();
    const rect = canvas.getBoundingClientRect();
    return {
      diagnostics: subject.diagnostics,
      root: subject.assemblyDisplay?.root,
      assemblyCurrent: subject.isCurrent(),
      draw: bridge.getCommittedDrawInventory(),
      camera: bridge.getCamera(),
      renderFrame: bridge.getRenderFrame(),
      renderer: bridge.getRendererIdentity(includeRenderDevice ? { includeRenderDevice: true } : undefined),
      unitId: bridge.getModelHoverState().activeUnitId,
      models: bridge.getModelComponents(),
      canvas: { cssWidth: rect.width, cssHeight: rect.height, bufferWidth: canvas.width, bufferHeight: canvas.height },
    };
  }, includeRenderDevice);
}
type ParityState = Awaited<ReturnType<typeof readState>>;
const identity = (state: ParityState) => ({
  diagnostics: state.diagnostics,
  root: state.root,
  unitId: state.unitId,
  camera: state.camera,
  renderFrame: state.renderFrame,
  canvas: state.canvas,
  backend: state.renderer.api,
  drawIdentity: state.draw && {
    key: state.draw.key,
    revision: state.draw.presentationRevision,
    scene: state.draw.candidateSceneId,
    unit: state.draw.unitId,
    pose: state.draw.poseRevision,
  },
  models: state.models.map(({ id }) => id).sort(),
});
async function waitCurrent(kind: 'assembly' | 'ordinary') {
  await expect
    .poll(
      async () => {
        try {
          const value = await readState();
          if (!value.unitId || value.models.length === 0) {
            return false;
          }
          if (kind === 'ordinary') {
            assertOrdinaryParityDiagnostics(value.diagnostics, ordinaryPath);
            return value.root === undefined && !value.assemblyCurrent && value.draw === undefined;
          }
          return Boolean(
            value.root &&
            value.assemblyCurrent &&
            value.draw?.key === value.root.digest &&
            value.diagnostics.outcome === 'success' &&
            value.diagnostics.requestedKey === value.diagnostics.presentedKey &&
            value.diagnostics.requestedRevision === value.diagnostics.presentedRevision &&
            value.diagnostics.requestedRenderId === value.diagnostics.settledRenderId,
          );
        } catch {
          return false;
        }
      },
      { timeout: 60_000 },
    )
    .toBe(true);
  return readState();
}

/** Only the actual admitted closure grants reads; every raw/reader byte is checked before transport. */
async function readPin() {
  return target.evaluate(async () => {
    const bridge = (globalThis as ParityWindow).__TAU_SECTION_VIEW_TEST__;
    const capture = bridge?.getCommittedAssembly();
    const display = capture?.assemblyDisplay;
    if (!capture || !display || !capture.isCurrent()) {
      throw new Error('Actual parity pin is unavailable.');
    }
    const sha = async (bytes: Uint8Array<ArrayBuffer>) =>
      `sha256:${[...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
    const files = new Map<string, { path: string; digest: string; byteLength: number }>();
    const parent = display.root.path.slice(0, display.root.path.lastIndexOf('/') + 1);
    if (!/^\.tau\/artifacts\/reusable-parts\/[0-9a-f]{64}\/$/u.test(parent)) {
      throw new Error('Parity pin has no canonical managed parent.');
    }
    const retain = async (asset: { path: string; digest: string; byteLength?: number }) => {
      if (!capture.isCurrent() || !asset.path.startsWith(parent) || asset.path.split('/').includes('..')) {
        throw new Error('Parity pin or managed path changed before raw read.');
      }
      const bytes = await capture.readRawBytes(asset.path);
      if (
        (asset.byteLength !== undefined && asset.byteLength !== bytes.byteLength) ||
        (await sha(bytes)) !== asset.digest ||
        !capture.isCurrent()
      ) {
        throw new Error('Raw parity asset changed.');
      }
      const previous = files.get(asset.path);
      if (previous && (previous.digest !== asset.digest || previous.byteLength !== bytes.byteLength)) {
        throw new Error('Parity closure has conflicting immutable identities.');
      }
      files.set(asset.path, { path: asset.path, digest: asset.digest, byteLength: bytes.byteLength });
      return bytes;
    };
    const rootBytes = await retain(display.root);
    const decodeRoot = (bytes: Uint8Array<ArrayBuffer>): unknown =>
      JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    const pointer = decodeRoot(rootBytes) as {
      schemaVersion: number;
      generation: number;
      manifest: { path: string; digest: string; byteLength: number };
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
      throw new Error('Parity pointer is not a bounded immutable root.');
    }
    const manifest = decodeRoot(await retain(pointer.manifest)) as {
      schemaVersion: number;
      content: { digest: string; byteLength: number };
      chunks: Array<{ path: string; digest: string; byteLength: number }>;
    };
    if (
      manifest.schemaVersion !== 1 ||
      !Number.isSafeInteger(manifest.content.byteLength) ||
      manifest.content.byteLength < 1 ||
      manifest.content.byteLength > 32 * 1_048_576 ||
      manifest.chunks.length !== Math.ceil(manifest.content.byteLength / 1_048_576)
    ) {
      throw new Error('Parity root manifest is invalid.');
    }
    const content = new Uint8Array(manifest.content.byteLength);
    let offset = 0;
    for (const chunk of manifest.chunks) {
      const length = Math.min(1_048_576, content.byteLength - offset);
      if (chunk.path !== storagePath(chunk.digest, 'chunk') || chunk.byteLength !== length) {
        throw new Error('Parity root chunk order or length changed.');
      }
      content.set(await retain(chunk), offset);
      offset += length;
    }
    if ((await sha(content)) !== manifest.content.digest || !capture.isCurrent()) {
      throw new Error('Parity logical root digest or subject changed.');
    }
    const root = decodeRoot(content) as {
      schemaVersion: number;
      generation: number;
      parts: Readonly<Record<string, PublishedPartReference>>;
    };
    if (root.schemaVersion !== 1 || root.generation !== pointer.generation) {
      throw new Error('Parity logical root generation changed.');
    }
    const sources: Array<{ part: string; variant: string; digest: string; base64: string }> = [];
    if (Object.keys(root.parts).length !== 3 || Object.keys(display.admitted.publication.parts).length !== 3) {
      throw new Error('Finite parity publication must contain the three actual definitions.');
    }
    for (const [part, record] of Object.entries(display.admitted.publication.parts)) {
      const reference = root.parts[part];
      if (!reference) {
        throw new Error('Admitted part is missing from actual root bytes.');
      }
      await retain(reference);
      for (const [variant, value] of Object.entries(record.variants)) {
        const bytes = await retain(value.glb);
        const reader = await display.admitted.readAsset(value.glb.digest);
        if (
          reader.byteLength !== bytes.byteLength ||
          (await sha(reader)) !== value.glb.digest ||
          !capture.isCurrent()
        ) {
          throw new Error('Actual admitted reader changed.');
        }
        sources.push({
          part,
          variant,
          digest: value.glb.digest,
          base64: await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.addEventListener(
              'load',
              () => {
                const { result } = reader;
                if (typeof result !== 'string' || !result.includes(',')) {
                  reject(new Error('Existing binary reader omitted its data URL.'));
                  return;
                }
                resolve(result.slice(result.indexOf(',') + 1));
              },
              { once: true },
            );
            reader.addEventListener(
              'error',
              () => {
                reject(reader.error ?? new Error('Binary read failed.'));
              },
              { once: true },
            );
            reader.addEventListener(
              'abort',
              () => {
                reject(new Error('Binary read was aborted.'));
              },
              { once: true },
            );
            reader.readAsDataURL(new Blob([bytes]));
          }),
        });
        if (value.exact) {
          await retain(value.exact.asset);
        }
      }
    }
    if (!capture.isCurrent()) {
      throw new Error('Pin retired during closure capture.');
    }
    return { root: display.root, files: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)), sources };
  });
}

async function revealFile(path: string): Promise<void> {
  await openCommand('Open files');
  await expandPath('parity');
  await target.expectVisible(treeItem(path));
  await target.scrollIntoView(treeItem(path));
}
async function openInViewer(path: string): Promise<void> {
  await revealFile(path);
  await target.click(treeItem(path), { button: 'right' });
  await target.click(selectors.getByRole('menuitem', { name: 'Open in Viewer', exact: true }));
  await openCommand('Open model structure');
}
async function exportGlb() {
  await openCommand('Export');
  const panel = selectors.getByCss('[data-slot="export-panel-body"]');
  await target.expectVisible(panel);
  const toggles = await target.evaluate(() =>
    [...document.querySelectorAll<HTMLButtonElement>('[aria-label="Formats"] button[aria-pressed]')].map((button) => ({
      name: (button.querySelector(':scope > span')?.textContent ?? '').trim(),
      selected: button.getAttribute('aria-pressed') === 'true',
    })),
  );
  expect(toggles.some(({ name }) => name.toLowerCase() === 'glb')).toBe(true);
  for (const toggle of toggles) {
    if (toggle.selected !== (toggle.name.toLowerCase() === 'glb')) {
      await target.click(panel.getByRole('button', { name: toggle.name, exact: true }));
    }
  }
  const result = await target.download(panel.getByRole('button', { name: /^Export glb$/iu }));
  expect(result.suggestedFilename.toLowerCase()).toMatch(/\.glb$/u);
  expect(result.base64.length).toBeGreaterThan(0);
  return result;
}
const row = (id: string, entryPath: string) =>
  selectors
    .getByRole('list', { name: `Model components for ${entryPath}`, exact: true })
    .getByCss(`[data-model-component-row][data-model-component-id=${JSON.stringify(id)}]`);
async function setOpacity(
  id: string,
  name: string,
  { reset, entryPath }: { reset: boolean; entryPath: string },
): Promise<void> {
  await target.fill(selectors.getByRole('searchbox', { name: 'Filter parts' }), name);
  await target.expectVisible(row(id, entryPath));
  await target.click(row(id, entryPath).getByCss('button[aria-label^="Actions for "]'));
  if (reset) {
    await target.click(selectors.getByRole('menuitem', { name: 'Reset opacity', exact: true }));
  } else {
    await target.focus(selectors.getByRole('spinbutton', { name: 'Opacity', exact: true }));
    await target.fill(selectors.getByRole('spinbutton', { name: 'Opacity', exact: true }), '40');
    await target.keyboardPress('Enter');
    await target.keyboardPress('Escape');
  }
  await target.fill(selectors.getByRole('searchbox', { name: 'Filter parts' }), '');
}
async function frame(name: string, held: ParityState, priorFrame?: number) {
  if (priorFrame !== undefined) {
    await expect
      .poll(async () => {
        const awaitedResult1 = await readState();
        return awaitedResult1.renderer.frame;
      })
      .toBeGreaterThan(priorFrame);
  }
  await target.mouseMove(0, 0);
  await target.waitFor(() => document.querySelectorAll('[data-sonner-toast]').length === 0);
  const toastsBefore = await target.evaluate(() => document.querySelectorAll('[data-sonner-toast]').length);
  expect(toastsBefore).toBe(0);
  const before = await readState(true);
  expect(identity(before)).toEqual(identity(held));
  const image = await target.screenshot(selectors.getByTestId('cad-viewer-canvas-region'), name);
  const toastsAfter = await target.evaluate(() => document.querySelectorAll('[data-sonner-toast]').length);
  expect(toastsAfter).toBe(0);
  const after = await readState(true);
  expect(identity(after)).toEqual(identity(held));
  expect(after.renderer.renderDevice).toEqual(before.renderer.renderDevice);
  await target.writeArtifact(
    `${name}-mounted-render-device.json`,
    JSON.stringify(
      {
        before: { subject: identity(before), renderer: before.renderer, toastCount: toastsBefore },
        after: { subject: identity(after), renderer: after.renderer, toastCount: toastsAfter },
        hardwareQualification: 'UNQUALIFIED_ACTUAL_RENDER_DEVICE_GATE_NOT_RUN',
        status: 'UNTIMED_NATIVE_IDENTITY_OBSERVATION_REQUIRES_HARDWARE_REVIEW',
      },
      undefined,
      2,
    ),
  );
  return image;
}
async function presentation(surfaces: boolean, lines: boolean) {
  const before = await readState();
  await target.evaluate(
    (value) => {
      const bridge = (globalThis as ParityWindow).__TAU_SECTION_VIEW_TEST__;
      if (!bridge) {
        throw new Error('Mounted parity viewport disappeared.');
      }
      bridge.setPresentation(value);
    },
    { surfaces, lines },
  );
  return { state: await readState(), priorFrame: before.renderer.frame };
}

for (const backend of ['webgl', 'webgpu'] as const) {
  test(`S13 parity compares actual admitted and exported ordinary pixels on ${backend}`, async () => {
    await target.navigate(`/__e2e/project-file-tree?main=s13-parity&chat=1&graphicsBackend=${backend}`);
    await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 120_000);
    await dismissCookies();
    await target.expectGeometryFramed();
    await openCommand('Open model structure');
    await waitCurrent('assembly');
    const pin = await readPin();
    const sourceEvidence = await Promise.all(
      pin.sources.map(async ({ base64, ...source }) => ({
        ...source,
        materials: await emittedParitySurfaceMaterials(decode(base64)),
        normals: await emittedParitySurfaceNormals(decode(base64)),
      })),
    );
    expect(
      sourceEvidence
        .find(({ part }) => part === 'glass')
        ?.materials.every(({ alphaMode, transmissionFactor }) => alphaMode === 'OPAQUE' && transmissionFactor > 0),
    ).toBe(true);
    expect(
      sourceEvidence.find(({ part }) => part === 'alpha')?.materials.every(({ alphaMode }) => alphaMode === 'BLEND'),
    ).toBe(true);
    expect(
      sourceEvidence
        .find(({ part }) => part === 'opaque')
        ?.materials.every(({ alphaMode, transmissionFactor }) => alphaMode === 'OPAQUE' && transmissionFactor === 0),
    ).toBe(true);
    const original = await readState();
    const { draw } = original;
    if (!draw) {
      throw new Error('Actual admitted draw inventory is missing.');
    }
    const cases = scenarios.map((name, index) => {
      const groups = draw.canonicalComponents.filter(({ ancestry }) => ancestry.length === 1 && ancestry[0] === name);
      const children = draw.canonicalComponents.filter(
        ({ ancestry, component }) =>
          ancestry.length === 2 &&
          ancestry[0] === name &&
          draw.surfaces.some(({ componentId }) => componentId === component.id),
      );
      if (groups.length !== 1 || children.length !== 2) {
        throw new Error('Actual canonical parity ancestry is not the finite two-leaf case.');
      }
      const group = groups[0];
      if (!group) {
        throw new Error('Actual wrapper component is missing.');
      }
      return {
        name,
        index,
        id: group.component.id,
        label: original.models.find(({ id }) => id === group.component.id)?.name,
        childIds: children.map(({ component }) => component.id),
      };
    });
    expect(new Set(cases.flatMap(({ childIds }) => childIds)).size).toBe(12);
    const captures = new Map<
      string,
      { image: string; edges: string; faces?: string; state: ParityState; proof: unknown }
    >();
    for (const branch of ['assembly', 'ordinary', 'return'] as const) {
      if (branch === 'ordinary') {
        await target.evaluate(() => {
          const bridge = (globalThis as ParityWindow).__TAU_SECTION_VIEW_TEST__;
          if (!bridge) {
            throw new Error('Viewport retired before export.');
          }
          bridge.resetModelVisibility();
        });
        const awaitedResult2 = await readPin();
        expect(awaitedResult2.files).toEqual(pin.files);
        const exported = await exportGlb();
        const artifactHash = await digest(decode(exported.base64));
        const artifactMaterials = await emittedParitySurfaceMaterials(decode(exported.base64));
        expect(
          artifactMaterials.some(
            ({ alphaMode, transmissionFactor }) => alphaMode === 'OPAQUE' && transmissionFactor > 0,
          ),
        ).toBe(true);
        expect(artifactMaterials.some(({ alphaMode }) => alphaMode === 'BLEND')).toBe(true);
        await revealFile(assemblyPath);
        await target.click(treeItem('parity'), { button: 'right' });
        await target.chooseFile(selectors.getByRole('menuitem', { name: 'Upload Files', exact: true }), {
          base64: exported.base64,
          mimeType: 'model/gltf-binary',
          name: 'parity-baseline.glb',
        });
        await openCommand('Open files');
        await target.expectVisible(treeItem(ordinaryPath));
        await target.click(treeItem(ordinaryPath), { button: 'right' });
        const verified = await target.download(selectors.getByRole('menuitem', { name: 'Download', exact: true }));
        expect(verified.base64).toBe(exported.base64);
        expect(await digest(decode(verified.base64))).toBe(artifactHash);
        const awaitedResult3 = await readPin();
        expect(awaitedResult3.files).toEqual(pin.files);
        await openInViewer(ordinaryPath);
        const ordinary = await waitCurrent('ordinary');
        const importedHash = assertOrdinaryParityDiagnostics(ordinary.diagnostics, ordinaryPath);
        expect(ordinary.models.map(({ id }) => id)).toEqual(
          expect.arrayContaining(cases.flatMap(({ id, childIds }) => [id, ...childIds])),
        );
        const denials = await target.evaluate(async () => {
          const bridge = (globalThis as ParityWindow).__TAU_SECTION_VIEW_TEST__;
          if (!bridge) {
            throw new Error('Ordinary viewport disappeared.');
          }
          const subject = bridge.getCommittedAssembly();
          let readerDenied = false;
          let backendDenied = false;
          try {
            await subject.readRawBytes('ordinary-reader-is-not-authorized');
          } catch {
            readerDenied = true;
          }
          try {
            await bridge.observeBackendBindings();
          } catch {
            backendDenied = true;
          }
          return {
            current: subject.isCurrent(),
            readerDenied,
            backendDenied,
            admitted: subject.assemblyDisplay !== undefined,
          };
        });
        expect(denials).toEqual({ current: false, readerDenied: true, backendDenied: true, admitted: false });
        await target.writeArtifact(
          `s13-${backend}-ordinary-artifact.json`,
          JSON.stringify(
            {
              rootHash: pin.root.digest,
              artifactHash,
              importedHash,
              uploadByteLength: decode(verified.base64).byteLength,
              diagnostics: ordinary.diagnostics,
              artifactMaterials,
              denials,
            },
            undefined,
            2,
          ),
        );
      }
      if (branch === 'return') {
        await openInViewer(assemblyPath);
        await waitCurrent('assembly');
        const returnedPin = await readPin();
        expect(returnedPin.root).toEqual(pin.root);
        expect(returnedPin.files).toEqual(pin.files);
        expect(returnedPin.sources).toEqual(pin.sources);
      }
      for (const scenario of cases) {
        const priorState = await readState();
        const priorFrame = priorState.renderer.frame;
        await target.evaluate(
          ({ id, renderFrame }) => {
            const bridge = (globalThis as ParityWindow).__TAU_SECTION_VIEW_TEST__;
            if (!bridge) {
              throw new Error('Parity viewport retired.');
            }
            bridge.resetModelVisibility();
            bridge.setRenderFrame(renderFrame);
            bridge.isolateModelComponent(id);
            bridge.setPostProcessingEnabled(false);
          },
          { ...scenario, renderFrame: original.renderFrame },
        );
        // Isolation changes fitted bounds; let its committed frame settle before placing the comparison camera.
        await target.waitFor(
          ({ id, priorFrame }) => {
            const bridge = (globalThis as ParityWindow).__TAU_SECTION_VIEW_TEST__;
            return Boolean(
              bridge?.getModelVisibility().isolatedComponentIds.includes(id) &&
              bridge.getRendererIdentity().frame > priorFrame,
            );
          },
          { id: scenario.id, priorFrame },
          { timeout: 30_000 },
        );
        if (scenario.name === 'effective-ancestor-opacity') {
          if (!scenario.label) {
            throw new Error('Actual opacity ancestor label is unavailable.');
          }
          let opacityBaseline: ParityState | undefined;
          if (branch !== 'ordinary') {
            await expect
              .poll(async () =>
                target.evaluate(async () => {
                  const bridge = (globalThis as ParityWindow).__TAU_SECTION_VIEW_TEST__;
                  return Boolean(bridge && (await bridge.isViewRecordApplied()));
                }),
              )
              .toBe(true);
            await target.evaluate((camera) => {
              const bridge = (globalThis as ParityWindow).__TAU_SECTION_VIEW_TEST__;
              if (!bridge) {
                throw new Error('The broad opacity-control camera owner is unavailable.');
              }
              bridge.setCamera({
                position: camera.position,
                target: camera.target,
                bounds: camera.bounds,
                fov: camera.requestedFov,
                zoom: camera.zoom,
              });
            }, original.camera);
            await expect
              .poll(async () => {
                const current = await readState();
                const surfaces = current.draw?.surfaces;
                return Boolean(
                  surfaces?.length === cases.flatMap(({ childIds }) => childIds).length &&
                  surfaces
                    .filter(({ componentId }) => scenario.childIds.includes(componentId))
                    .every(({ visible }) => visible) &&
                  surfaces
                    .filter(({ componentId }) => !scenario.childIds.includes(componentId))
                    .every(({ visible }) => !visible),
                );
              })
              .toBe(true);
            opacityBaseline = await readState();
          }
          await setOpacity(scenario.id, scenario.label, {
            reset: false,
            entryPath: branch === 'ordinary' ? ordinaryPath : assemblyPath,
          });
          if (opacityBaseline) {
            await expect
              .poll(async () => {
                const current = await readState();
                const selected = current.draw?.surfaces.filter(({ componentId }) =>
                  scenario.childIds.includes(componentId),
                );
                return Boolean(
                  selected?.length === 2 &&
                  selected.every(
                    ({ materialOpacities }) =>
                      materialOpacities.length > 0 &&
                      materialOpacities.every((opacity) => Math.abs(opacity - 0.4) < 1e-8),
                  ),
                );
              })
              .toBe(true);
            const afterOpacity = await readState();
            const neighbors = (state: ParityState) =>
              state.draw?.surfaces
                .filter(({ componentId }) => !scenario.childIds.includes(componentId))
                .map(({ componentId, materialOpacities }) => ({ componentId, materialOpacities }))
                .sort((a, b) => a.componentId.localeCompare(b.componentId));
            const beforeNeighbors = neighbors(opacityBaseline);
            expect(beforeNeighbors?.length).toBeGreaterThan(0);
            expect(neighbors(afterOpacity)).toEqual(beforeNeighbors);
            expect(afterOpacity.camera).toEqual(opacityBaseline.camera);
            expect(afterOpacity.root).toEqual(opacityBaseline.root);
            expect(afterOpacity.canvas).toEqual(opacityBaseline.canvas);
            expect(afterOpacity.unitId).toBe(opacityBaseline.unitId);
            await target.writeArtifact(
              `s13-${backend}-${branch}-opacity-neighbors.json`,
              JSON.stringify(
                {
                  residentNeighborCount: beforeNeighbors?.length,
                  before: { subject: identity(opacityBaseline), neighbors: beforeNeighbors },
                  after: { subject: identity(afterOpacity), neighbors: neighbors(afterOpacity) },
                },
                undefined,
                2,
              ),
            );
          }
        }
        const comparisonBounds = captures.get(scenario.name)?.state.camera.bounds;
        await expect
          .poll(async () =>
            target.evaluate(async () => {
              const bridge = (globalThis as ParityWindow).__TAU_SECTION_VIEW_TEST__;
              return Boolean(bridge && (await bridge.isViewRecordApplied()));
            }),
          )
          .toBe(true);
        await target.evaluate(
          ({ index, bounds }) => {
            const bridge = (globalThis as ParityWindow).__TAU_SECTION_VIEW_TEST__;
            if (!bridge) {
              throw new Error('The settled parity camera owner is unavailable.');
            }
            bridge.setCamera({
              position: [index * 0.05 + 0.04, -0.08, 0.07],
              ...(bounds ? { bounds } : {}),
              target: [index * 0.05 + 0.004, 0, 0],
              fov: 30,
              zoom: 1,
            });
          },
          { ...scenario, bounds: comparisonBounds },
        );
        try {
          await target.waitFor(
            ({ index }) => {
              const camera = (globalThis as ParityWindow).__TAU_SECTION_VIEW_TEST__?.getCamera();
              const position = [index * 0.05 + 0.04, -0.08, 0.07];
              const focal = [index * 0.05 + 0.004, 0, 0];
              return Boolean(
                camera?.requestedFov === 30 &&
                camera.position.every((value, axis) => Math.abs(value - (position[axis] ?? Infinity)) < 1e-6) &&
                camera.target.every((value, axis) => Math.abs(value - (focal[axis] ?? Infinity)) < 1e-6),
              );
            },
            scenario,
            { timeout: 30_000 },
          );
        } catch (error) {
          const [actual] = await Promise.allSettled([readState()]);
          if (actual.status === 'fulfilled') {
            await target
              .writeArtifact(
                `s13-${backend}-${branch}-${scenario.name}-camera-mismatch.json`,
                JSON.stringify(
                  {
                    scenario,
                    branch,
                    state: actual.value,
                  },
                  undefined,
                  2,
                ),
              )
              .catch(() => undefined);
          }
          const original: unknown = error;
          throw original;
        }
        await waitCurrent(branch === 'ordinary' ? 'ordinary' : 'assembly');
        if (branch !== 'ordinary') {
          try {
            await expect
              .poll(async () => {
                const current = await readState();
                const surfaces = current.draw?.surfaces;
                const selected = surfaces?.filter(({ componentId }) => scenario.childIds.includes(componentId));
                return Boolean(
                  selected?.length === 2 &&
                  selected.every(({ visible }) => visible) &&
                  surfaces
                    ?.filter(({ componentId }) => !scenario.childIds.includes(componentId))
                    .every(({ visible }) => !visible),
                );
              })
              .toBe(true);
          } catch (error) {
            const [actual] = await Promise.allSettled([readState()]);
            if (actual.status === 'fulfilled') {
              await target
                .writeArtifact(
                  `s13-${backend}-${branch}-${scenario.name}-draw-mismatch.json`,
                  JSON.stringify({ scenario, branch, state: actual.value }, undefined, 2),
                )
                .catch(() => undefined);
            }
            throw error;
          }
        }
        const settled = await readState();
        expect(settled.renderer.api).toBe(backend);
        const surfaces = settled.draw?.surfaces.filter(({ componentId }) => scenario.childIds.includes(componentId));
        let proof: unknown;
        if (branch === 'ordinary') {
          const actual = await target.evaluate((ids) => {
            const bridge = (globalThis as ParityWindow).__TAU_SECTION_VIEW_TEST__;
            if (!bridge) {
              throw new Error('Ordinary model consumer disappeared.');
            }
            return ids.map((id) => ({ id, state: bridge.getRenderedModelComponentState(id) }));
          }, scenario.childIds);
          expect(actual.every(({ state }) => state.visibleMeshCount > 0)).toBe(true);
          proof = { actual, sourceEvidence };
          const previous = captures.get(scenario.name);
          if (!previous) {
            throw new Error('Paired admitted image is missing.');
          }
          expect(settled.camera).toEqual(previous.state.camera);
          expect(settled.renderFrame).toEqual(previous.state.renderFrame);
          expect(settled.canvas).toEqual(previous.state.canvas);
        } else {
          expect(settled.root).toEqual(pin.root);
          if (surfaces?.length !== 2) {
            throw new Error('Both actual occurrence surfaces must remain present.');
          }
          expect(
            surfaces.every(
              ({ visible, projection }) => visible && projection.intersectsFrustum && projection.finiteProjection,
            ),
          ).toBe(true);
          expect(
            settled.draw?.surfaces
              .filter(({ componentId }) => !scenario.childIds.includes(componentId))
              .every(({ visible }) => !visible),
          ).toBe(true);
          expect(
            surfaces.every(({ instanceId }) =>
              scenario.name === 'opaque-positive' ? instanceId !== undefined : instanceId === undefined,
            ),
          ).toBe(true);
          const part =
            scenario.name === 'source-transmission'
              ? 'glass'
              : scenario.name === 'source-transparent'
                ? 'alpha'
                : 'opaque';
          const emitted = sourceEvidence.find((source) => source.part === part);
          if (!emitted) {
            throw new Error('Actual referenced definition normal evidence is unavailable.');
          }
          const [left, right] = surfaces;
          if (!left || !right) {
            throw new Error('Actual overlap pair is missing.');
          }
          expect(
            [0, 1, 2].every(
              (axis) =>
                Math.min(
                  left.canonicalRenderBounds.max[axis] ?? -Infinity,
                  right.canonicalRenderBounds.max[axis] ?? -Infinity,
                ) >
                Math.max(
                  left.canonicalRenderBounds.min[axis] ?? Infinity,
                  right.canonicalRenderBounds.min[axis] ?? Infinity,
                ),
            ),
          ).toBe(true);
          const frames = surfaces.map(({ drawMatrixWorld }) =>
            parityDrawFrameEvidence(drawMatrixWorld, emitted.normals),
          );
          if (scenario.name === 'opaque-positive') {
            expect(
              frames.every(
                ({ determinant, normalizedDot, normalCorrectionDistance }) =>
                  determinant > 0 &&
                  normalizedDot <= 64 * Number.EPSILON &&
                  normalCorrectionDistance <= 64 * Number.EPSILON,
              ),
            ).toBe(true);
          }
          if (scenario.name === 'composed-shear') {
            expect(
              frames.every(
                ({ determinant, normalizedDot, normalCorrectionDistance }) =>
                  determinant > 0 && normalizedDot > 0.5 && normalCorrectionDistance > 0.1,
              ),
            ).toBe(true);
          }
          if (scenario.name === 'mirror') {
            expect(frames.every(({ determinant }) => determinant < 0)).toBe(true);
          }
          if (scenario.name === 'effective-ancestor-opacity') {
            expect(
              surfaces.every(
                ({ materialOpacities }) =>
                  materialOpacities.length > 0 && materialOpacities.every((opacity) => Math.abs(opacity - 0.4) < 1e-8),
              ),
            ).toBe(true);
          }
          expect(settled.draw?.residentMandatoryEdgeTriangles).toBeGreaterThan(0);
          proof = { surfaces, frames, mandatoryEdges: settled.draw?.edges, sourceEvidence };
        }
        const edgeMaterialState = await target.evaluate((ids) => {
          const bridge = (globalThis as ParityWindow).__TAU_SECTION_VIEW_TEST__;
          if (!bridge) {
            throw new Error('The optical material owner retired.');
          }
          return ids.map((id) => ({ id, materials: bridge.getRenderedModelComponentState(id).edgeMaterials }));
        }, scenario.childIds);
        if (backend === 'webgpu') {
          expect(edgeMaterialState.every(({ materials }) => materials.some(({ visible }) => visible))).toBe(true);
        }
        const backgroundState = await presentation(false, false);
        const background = await frame(
          `s13-${backend}-${branch}-${scenario.name}-background.png`,
          backgroundState.state,
          backgroundState.priorFrame,
        );
        const edgesState = await presentation(false, true);
        const edges = await frame(
          `s13-${backend}-${branch}-${scenario.name}-edges.png`,
          edgesState.state,
          edgesState.priorFrame,
        );
        let faces: string | undefined;
        let repeatedFaces: Awaited<ReturnType<typeof compareScalePngFrames>> | undefined;
        if (scenario.name === 'opaque-positive' || scenario.name === 'source-transmission') {
          const facesState = await presentation(true, false);
          faces = await frame(
            `s13-${backend}-${branch}-${scenario.name}-faces.png`,
            facesState.state,
            facesState.priorFrame,
          );
          const facesRepeatState = await presentation(true, false);
          const facesRepeat = await frame(
            `s13-${backend}-${branch}-${scenario.name}-faces-repeat.png`,
            facesRepeatState.state,
            facesRepeatState.priorFrame,
          );
          repeatedFaces = await compareScalePngFrames(faces, facesRepeat);
        }
        const enabledState = await presentation(true, true);
        const image = await frame(
          `s13-${backend}-${branch}-${scenario.name}-surface-edges.png`,
          enabledState.state,
          enabledState.priorFrame,
        );
        const repeatState = await presentation(true, true);
        expect(identity(repeatState.state)).toEqual(identity(enabledState.state));
        const repeated = await frame(
          `s13-${backend}-${branch}-${scenario.name}-repeat.png`,
          repeatState.state,
          repeatState.priorFrame,
        );
        const visibleRaster = await compareScalePngFrames(background, image);
        const edgeRaster = await compareScalePngFrames(background, edges);
        expect(visibleRaster.changedPixels).toBeGreaterThan(0);
        expect(edgeRaster.changedPixels).toBeGreaterThan(0);
        const facesOnlyRaster = faces ? await compareScalePngFrames(background, faces) : undefined;
        if (facesOnlyRaster) {
          expect(facesOnlyRaster.changedPixels).toBeGreaterThan(0);
        }
        const evidence = {
          branch,
          name: scenario.name,
          state: identity(enabledState.state),
          proof,
          edgeMaterialState,
          visibleRaster,
          edgeRaster,
          repeatedRaster: await compareScalePngFrames(image, repeated),
          facesOnlyRaster,
          repeatedFacesOnlyRaster: repeatedFaces,
          acceptedPixelTolerance: undefined,
          hardwareQualification: 'UNQUALIFIED_ACTUAL_RENDER_DEVICE_GATE_NOT_RUN',
          backendClassification: 'ACTUAL_VIEWPORT_API_AND_PIXELS_ONLY',
          status: 'MEASURED_IMAGES_REQUIRE_REVIEW_NO_INVENTED_TOLERANCE',
        };
        if (branch === 'assembly') {
          captures.set(scenario.name, { image, edges, ...(faces ? { faces } : {}), state: enabledState.state, proof });
        } else {
          const previous = captures.get(scenario.name);
          if (!previous) {
            throw new Error('Admitted parity evidence disappeared.');
          }
          if (branch === 'return') {
            expect(enabledState.state.camera).toEqual(previous.state.camera);
            expect(enabledState.state.renderFrame).toEqual(previous.state.renderFrame);
            expect(enabledState.state.canvas).toEqual(previous.state.canvas);
          }
          await target.writeArtifact(
            `s13-${backend}-${scenario.name}-${branch}-paired.json`,
            JSON.stringify(
              {
                ...evidence,
                admitted: { state: identity(previous.state), proof: previous.proof },
                surfaceEdgeDifference: await compareScalePngFrames(previous.image, image),
                facesOnlyDifference:
                  faces && previous.faces ? await compareScalePngFrames(previous.faces, faces) : undefined,
                mandatoryEdgeDifference: await compareScalePngFrames(previous.edges, edges),
              },
              undefined,
              2,
            ),
          );
        }
        if (scenario.name === 'effective-ancestor-opacity') {
          if (!scenario.label) {
            throw new Error('Actual opacity ancestor label is unavailable.');
          }
          await setOpacity(scenario.id, scenario.label, {
            reset: true,
            entryPath: branch === 'ordinary' ? ordinaryPath : assemblyPath,
          });
        }
      }
    }
    const returned = await readPin();
    expect(returned.root).toEqual(pin.root);
    expect(returned.files).toEqual(pin.files);
    expect(returned.sources).toEqual(pin.sources);
    await target.writeArtifact(
      `s13-${backend}-closure-invariance.json`,
      JSON.stringify(
        {
          before: pin,
          after: returned,
          state: identity(await readState()),
          measuredApiPixels: true,
          hardwareQualification: 'UNQUALIFIED_ACTUAL_RENDER_DEVICE_GATE_NOT_RUN',
          performanceAccepted: false,
        },
        undefined,
        2,
      ),
    );
  });
}

/* eslint-enable no-await-in-loop -- End the existing ordered consumer/publication closure scope. */
