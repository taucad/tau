import { base64ToUint8Array, uint8ArrayToBase64 } from 'uint8array-extras';
import { expect, inject, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { PublishedPartReference } from '@taucad/runtime/types';
import * as target from '#support/external-target.js';
import { expandPath, treeItem } from '#support/file-tree.js';
import {
  createFlatOccurrenceActionsAssembly,
  flatActionNativeOracle,
  flatActionPlacements,
} from '#support/parts-assemblies-occurrence-actions.js';
import { getMotionBodyCandidate, installMotionExactWorkerObservation } from '#support/parts-assemblies-motion.js';
import type { MotionExactObservationWindow, AssemblyTestBridgeApi } from '#support/parts-assemblies-motion.js';

type SectionTaggedCounts = Readonly<{
  objectCount: number;
  geometryCount: number;
  materialCount: number;
  attributeHandleCount: number;
  bufferCount: number;
  backingBytes: number;
  payloadBytes: number;
}>;
type ActionsWindow = typeof globalThis & {
  __TAU_SECTION_VIEW_TEST__?: AssemblyTestBridgeApi & {
    getTaggedResourceInventory():
      | Readonly<{ sectionViewHelper: SectionTaggedCounts; union: SectionTaggedCounts }>
      | undefined;
  };
};
const authoredPath = 'parity/flat-actions.assembly.json';
const orderedIds = flatActionPlacements.map(({ id }) => id);
const decode = (base64: string): Uint8Array<ArrayBuffer> => base64ToUint8Array(base64);
const encode = (text: string) => uint8ArrayToBase64(new TextEncoder().encode(text));

async function openCommand(name: string): Promise<void> {
  await target.click(selectors.getByRole('button', { name: 'Search', exact: true }));
  await target.fill(selectors.getByPlaceholder('Search projects, chats, and actions…'), name);
  await target.click(selectors.getByRole('option', { name, exact: true }));
}
async function readState() {
  return target.evaluate(() => {
    const api = (globalThis as ActionsWindow).__TAU_SECTION_VIEW_TEST__;
    const subject = api?.getCommittedAssembly();
    const draw = api?.getCommittedDrawInventory();
    if (
      !api ||
      !subject?.assemblyDisplay ||
      !subject.isCurrent() ||
      !draw ||
      draw.key !== subject.assemblyDisplay.root.digest
    ) {
      throw new Error('The actual committed assembly/draw authority is absent.');
    }
    const active = document.activeElement;
    return {
      root: subject.assemblyDisplay.root,
      diagnostics: subject.diagnostics,
      draw,
      camera: api.getCamera(),
      frame: api.getRenderFrame(),
      visibility: api.getModelVisibility(),
      renderer: api.getRendererIdentity(),
      focusedElement:
        active instanceof HTMLElement
          ? {
              tag: active.tagName,
              role: active.getAttribute('role'),
              label: active.getAttribute('aria-label'),
              slot: active.dataset['slot'],
              value:
                active instanceof HTMLInputElement && active.getAttribute('role') === 'spinbutton'
                  ? active.value
                  : undefined,
            }
          : undefined,
    };
  });
}
type ActionState = Awaited<ReturnType<typeof readState>>;
const held = (state: ActionState) => ({
  root: state.root,
  unit: state.draw.unitId,
  pose: state.draw.poseRevision,
  scene: state.draw.candidateSceneId,
  revision: state.draw.presentationRevision,
});
async function readCurrentSectionTaggedResources(expected: ReturnType<typeof held>) {
  return target.evaluate((expected) => {
    const api = (globalThis as ActionsWindow).__TAU_SECTION_VIEW_TEST__;
    const subject = api?.getCommittedAssembly();
    const draw = api?.getCommittedDrawInventory();
    if (
      !api ||
      !subject?.assemblyDisplay ||
      !subject.isCurrent() ||
      !draw ||
      subject.assemblyDisplay.root.digest !== expected.root.digest ||
      draw.key !== expected.root.digest ||
      draw.candidateSceneId !== expected.scene ||
      draw.presentationRevision !== expected.revision ||
      draw.unitId !== expected.unit ||
      draw.poseRevision !== expected.pose
    ) {
      throw new Error('The section helper census has no matching current committed draw.');
    }
    const tagged = api.getTaggedResourceInventory();
    const current = api.getCommittedDrawInventory();
    if (
      !tagged ||
      !subject.isCurrent() ||
      current?.key !== draw.key ||
      current.candidateSceneId !== draw.candidateSceneId ||
      current.presentationRevision !== draw.presentationRevision ||
      current.unitId !== draw.unitId ||
      current.poseRevision !== draw.poseRevision ||
      (globalThis as ActionsWindow).__TAU_SECTION_VIEW_TEST__ !== api
    ) {
      throw new Error('The section helper census retired during observation.');
    }
    return tagged;
  }, expected);
}
async function waitCurrent(path: string, priorKey?: string) {
  let qualified: ActionState | undefined;
  await expect
    .poll(
      async () => {
        try {
          const state = await readState();
          const current =
            state.diagnostics.sourceEntryPath === path &&
            state.diagnostics.outcome === 'success' &&
            state.diagnostics.presentedKey === state.root.digest &&
            state.diagnostics.requestedKey === state.root.digest &&
            state.diagnostics.requestedRevision === state.diagnostics.presentedRevision &&
            state.diagnostics.requestedRenderId === state.diagnostics.settledRenderId &&
            (!priorKey || state.root.digest !== priorKey);
          if (current) {
            qualified = state;
          }
          return current;
        } catch {
          return false;
        }
      },
      { timeout: 120_000 },
    )
    .toBe(true);
  if (!qualified) {
    throw new Error('No actual current assembly state was observed.');
  }
  return qualified;
}

/** Read only actual managed root/reader bytes. No facade or published reference is reconstructed. */
async function readPin() {
  return target.evaluate(async () => {
    const capture = (globalThis as ActionsWindow).__TAU_SECTION_VIEW_TEST__?.getCommittedAssembly();
    const display = capture?.assemblyDisplay;
    if (!capture || !display || !capture.isCurrent()) {
      throw new Error('Actual captured pin is absent.');
    }
    const sha = async (bytes: Uint8Array<ArrayBuffer>) =>
      `sha256:${[...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
    const rootBytes = await capture.readRawBytes(display.root.path);
    if (rootBytes.byteLength !== display.root.byteLength || (await sha(rootBytes)) !== display.root.digest) {
      throw new Error('Actual root digest/length changed.');
    }
    const graph = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(rootBytes)) as {
      parts: Record<string, PublishedPartReference>;
    };
    const assets: Array<{ part: string; variant: string; glb: string; exact?: string }> = [];
    for (const [part, record] of Object.entries(display.admitted.publication.parts)) {
      for (const [variant, recipe] of Object.entries(record.variants)) {
        // oxlint-disable-next-line no-await-in-loop -- Each actual admitted immutable asset is checked before the pin observation returns.
        const bytes = await display.admitted.readAsset(recipe.glb.digest);
        // oxlint-disable-next-line no-await-in-loop -- The real reader's bytes must match the public asset address.
        if (bytes.byteLength !== recipe.glb.byteLength || (await sha(bytes)) !== recipe.glb.digest) {
          throw new Error('Admitted GLB changed.');
        }
        if (recipe.exact) {
          // oxlint-disable-next-line no-await-in-loop -- Exact bytes are read from this actual admitted facade, never a source/kernel fallback.
          const native = await display.admitted.readAsset(recipe.exact.asset.digest);
          // oxlint-disable-next-line no-await-in-loop -- Reader integrity is fenced together with actual display bytes.
          const nativeDigest = await sha(native);
          if (native.byteLength !== recipe.exact.asset.byteLength || nativeDigest !== recipe.exact.asset.digest) {
            throw new Error('Admitted native bytes changed.');
          }
        }
        assets.push({ part, variant, glb: recipe.glb.digest, exact: recipe.exact?.asset.digest });
      }
    }
    if (!capture.isCurrent()) {
      throw new Error('The current root changed during its read.');
    }
    return { root: display.root, parts: graph.parts, assets };
  });
}
async function reveal(path: string): Promise<void> {
  await openCommand('Open files');
  const parents = path.split('/').slice(0, -1).join('/');
  if (parents) {
    await expandPath(parents);
  }
  await target.expectVisible(treeItem(path));
  await target.scrollIntoView(treeItem(path));
}
async function download(path: string) {
  await reveal(path);
  await target.click(treeItem(path), { button: 'right' });
  return target.download(selectors.getByRole('menuitem', { name: 'Download', exact: true }));
}
async function upload(reference: PublishedPartReference, order: readonly string[], replace: boolean) {
  const text = JSON.stringify(createFlatOccurrenceActionsAssembly(reference, order), undefined, 2);
  await openCommand('Open files');
  await expandPath('parity');
  await target.click(treeItem('parity'), { button: 'right' });
  await target.chooseFile(selectors.getByRole('menuitem', { name: 'Upload Files', exact: true }), {
    name: 'flat-actions.assembly.json',
    mimeType: 'application/json',
    base64: encode(text),
  });
  if (replace) {
    const dialog = selectors.getByRole('alertdialog');
    await target.expectVisible(dialog.getByText(`Replace '${authoredPath}'?`, { exact: true }));
    await target.click(dialog.getByRole('button', { name: 'Replace', exact: true }));
  }
  await target.expectVisible(treeItem(authoredPath));
  const awaitedResult1 = await download(authoredPath);
  expect(decode(awaitedResult1.base64)).toEqual(new TextEncoder().encode(text));
  if (!replace) {
    await target.click(treeItem(authoredPath), { button: 'right' });
    await target.click(selectors.getByRole('menuitem', { name: 'Open in Viewer', exact: true }));
  }
  return text;
}
const row = (id: string) =>
  selectors.getByCss(`[data-model-component-row][data-model-component-id=${JSON.stringify(id)}]`);
async function menu(id: string, action?: string): Promise<void> {
  await target.click(row(id).getByCss('button[aria-label^="Actions for "]'));
  if (action) {
    await target.click(selectors.getByRole('menuitem', { name: action, exact: true }));
  }
}
async function catalog() {
  const value = await target.evaluate(() => (globalThis as ActionsWindow).__TAU_SECTION_VIEW_TEST__?.getMeasureState());
  if (!value) {
    throw new Error('Actual measurement catalog is absent.');
  }
  return value;
}
async function select(label: string, value: string): Promise<void> {
  await target.evaluate(
    ({ label: field, value: next }) => {
      const element = [...document.querySelectorAll<HTMLSelectElement>('select')].find(
        (item) => item.getAttribute('aria-label') === field,
      );
      if (!element || ![...element.options].some((option) => option.value === next)) {
        throw new Error('Actual measurement option is unavailable.');
      }
      element.value = next;
      element.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { label, value },
  );
}
async function prepareMeasure(operation: 'extent-x' | 'minimum-distance'): Promise<void> {
  const awaitedResult2 = await catalog();
  if (!awaitedResult2.isMeasureActive) {
    await target.click(selectors.getByRole('button', { name: /^measure$/iu, pressed: false }));
  }
  await target.click(selectors.getByRole('button', { name: /^Targets:/u }));
  await select('Feature filter', 'body');
  await select('Measurement operation', operation);
  await target.focus(selectors.getByRole('combobox', { name: 'Choose target', exact: true }));
  await expect
    .poll(async () => {
      const awaitedResult3 = await catalog();
      return awaitedResult3.candidates.length;
    })
    .toBeGreaterThan(0);
}
async function choose(id: string) {
  const awaitedResult4 = await readState();
  const surface = awaitedResult4.draw.surfaces.find(({ componentId }) => componentId === id);
  if (!surface) {
    throw new Error('Actual canonical body has no installed draw owner.');
  }
  const awaitedResult5 = await catalog();
  const candidate = getMotionBodyCandidate(surface, awaitedResult5.candidates);
  await select('Choose target', candidate);
  await target.click(selectors.getByRole('button', { name: 'Use target', exact: true }));
  return candidate;
}
async function closeMeasure(): Promise<void> {
  await target.click(selectors.getByRole('button', { name: /^measure$/iu, pressed: true }));
}
async function newMeasure(prior: ReadonlySet<string>) {
  await expect
    .poll(
      async () => {
        const awaitedResult6 = await catalog();
        return awaitedResult6.measurements.find(({ id }) => !prior.has(id))?.status;
      },
      { timeout: 120_000 },
    )
    .toBe('current');
  const awaitedResult7 = await catalog();
  const result = awaitedResult7.measurements.find(({ id }) => !prior.has(id));
  if (!result) {
    throw new Error('The real consumer produced no settled measurement.');
  }
  return result;
}
function canonicalIds(state: ActionState, order: readonly string[]) {
  return order.map((authored) => {
    const matching = state.draw.canonicalComponents.filter(
      ({ ancestry, component }) =>
        ancestry.length === 1 &&
        ancestry[0] === authored &&
        state.draw.surfaces.some(({ componentId }) => componentId === component.id),
    );
    if (matching.length !== 1 || !matching[0]) {
      throw new Error('The finite leaf lacks one actual canonical surface binding.');
    }
    return matching[0].component.id;
  });
}
const geometrySignature = (state: ActionState, id: string) =>
  state.draw.surfaces
    .filter(({ componentId }) => componentId === id)
    .map(({ canonicalGeometryId, indexVersion, attributeVersions }) => ({
      canonicalGeometryId,
      indexVersion,
      attributeVersions,
    }));
async function pointerSamples(id: string) {
  return target.evaluate((componentId) => {
    const api = (globalThis as ActionsWindow).__TAU_SECTION_VIEW_TEST__;
    const surface = api?.getCommittedDrawInventory()?.surfaces.find((item) => item.componentId === componentId);
    if (!api || !surface?.projection.finiteProjection || !surface.projection.intersectsFrustum) {
      throw new Error('The actual slot has no finite camera footprint.');
    }
    const { corners } = surface.projection;
    if (corners.length !== 8) {
      throw new Error('Expected actual projected placed bounds, not source object placement.');
    }
    const rect = api.getViewportCanvas().getBoundingClientRect();
    const center = {
      x: corners.reduce((sum, point) => sum + point.x, 0) / 8 + rect.left,
      y: corners.reduce((sum, point) => sum + point.y, 0) / 8 + rect.top,
    };
    return [
      center,
      ...corners.map((point) => ({
        x: center.x * 0.2 + (point.x + rect.left) * 0.8,
        y: center.y * 0.2 + (point.y + rect.top) * 0.8,
      })),
    ];
  }, id);
}
async function hover() {
  return target.evaluate(() => (globalThis as ActionsWindow).__TAU_SECTION_VIEW_TEST__?.getModelHoverState());
}
async function setCut(offset: number): Promise<readonly string[]> {
  const ids = await target.evaluate((value) => {
    const api = (globalThis as ActionsWindow).__TAU_SECTION_VIEW_TEST__;
    if (!api) {
      throw new Error('Actual section owner is absent.');
    }
    const added = api.setSectionCuts([{ kind: 'plane', plane: 'yz', offset: value, isFlipped: false }]);
    api.setSectionViewActive(true);
    return added;
  }, offset);
  expect(ids).toHaveLength(1);
  try {
    await target.waitFor(
      ({ ids, offset }) => {
        const state = (globalThis as ActionsWindow).__TAU_SECTION_VIEW_TEST__?.getSectionState();
        const matches = (cuts: NonNullable<typeof state>['cuts']) =>
          cuts.length === 1 &&
          cuts.every(
            (cut) =>
              cut.id === ids[0] &&
              cut.kind === 'plane' &&
              cut.plane === 'yz' &&
              cut.offset === offset &&
              !cut.isFlipped,
          );
        return state?.isActive === true && state.isCommitted && matches(state.cuts) && matches(state.committedCuts);
      },
      { ids, offset },
      { timeout: 30_000 },
    );
  } catch (error) {
    const actual = await target
      .evaluate(() => (globalThis as ActionsWindow).__TAU_SECTION_VIEW_TEST__?.getSectionState())
      .catch(() => undefined);
    await target
      .writeArtifact(
        's13-section-cut-adoption-failure.json',
        JSON.stringify(
          {
            requested: { ids, offset },
            actual,
          },
          undefined,
          2,
        ),
      )
      .catch(() => undefined);
    throw error;
  }
  return ids;
}

/* oxlint-disable no-await-in-loop -- These finite actions intentionally serialize real gestures on one shared viewport and source path. */
for (const backend of ['webgl', 'webgpu'] as const) {
  test(`S13 translated batch occurrences should retain canonical actions and deny retired slots on ${backend}`, async () => {
    const worker = inject('motionExactWorkerAsset');
    if (worker === undefined) {
      throw new Error('Native motion proof requires the source-qualified current production worker manifest.');
    }
    await target.addInitScript(installMotionExactWorkerObservation, worker.path);
    await target.setViewport({ width: 1920, height: 1080 });
    await target.navigate(`/__e2e/project-file-tree?main=s13-parity&chat=1&graphicsBackend=${backend}`);
    await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 120_000);
    await target
      .click(selectors.getByRole('button', { name: /^decline$/iu }), { timeout: 5000 })
      .catch(() => undefined);
    await target.expectGeometryFramed();
    const grouped = await waitCurrent('parity/assembly.json');
    const original = await readPin();
    expect(original.root).toEqual(grouped.root);
    const originalAuthoredFiles = new Map<string, string>();
    for (const path of [
      'parity/parts/opaque.js',
      'parity/parts/glass.js',
      'parity/parts/alpha.js',
      'parity/assembly.json',
    ]) {
      const awaitedResult8 = await download(path);
      originalAuthoredFiles.set(path, awaitedResult8.base64);
    }
    const reference = original.parts['opaque'];
    if (!reference) {
      throw new Error('The accepted finite fixture lacks its actual opaque reference.');
    }
    // The selected nested source now has the accepted exact STEP route; capability presence does not claim exported bytes.
    await openCommand('Export');
    const nestedExport = selectors.getByCss('[data-slot="export-panel-body"]');
    await target.expectVisible(
      nestedExport
        .getByRole('region', { name: 'Source', exact: true })
        .getByText('parity/assembly.json', { exact: true }),
    );
    await target.expectVisible(nestedExport.getByRole('button', { name: /^step$/iu }), 15_000);
    await target.expectVisible(nestedExport.getByRole('button', { name: /^glb$/iu }), 15_000);
    const exportPin = await readPin();
    expect(exportPin).toEqual(original);
    await target.keyboardPress('Escape');
    const authoredBytes = await upload(reference, orderedIds, false);
    const initial = await waitCurrent(authoredPath);
    expect(initial.root.digest).not.toBe(grouped.root.digest);
    expect(initial.renderer.api).toBe(backend);
    const pin = await readPin();
    expect(pin.root).toEqual(initial.root);
    expect(pin.parts).toEqual({ opaque: reference });
    expect(pin.assets).toEqual(original.assets.filter(({ part }) => part === 'opaque'));
    const ids = canonicalIds(initial, orderedIds);
    const [firstId, secondId] = ids;
    if (ids.length !== 4 || firstId === undefined || secondId === undefined) {
      throw new Error('The finite four-body fixture lacks its canonical measurement pair.');
    }
    expect(new Set(ids).size).toBe(4);
    expect(initial.draw.surfaces).toHaveLength(4);
    expect(initial.draw.surfaces.every(({ instanceId }) => instanceId !== undefined)).toBe(true);
    expect(new Set(initial.draw.surfaces.map(({ objectUuid }) => objectUuid)).size).toBe(1);
    expect(new Set(initial.draw.surfaces.map(({ canonicalGeometryId }) => canonicalGeometryId)).size).toBe(1);
    const { camera } = initial;
    const chatTokens = new Set<string>();
    const actions: Array<{ id: string; extent: number; pointer: { x: number; y: number }; mandatoryEdges: number }> =
      [];
    for (const [index, id] of ids.entries()) {
      await openCommand('Open model structure');
      const label = initial.draw.canonicalComponents.find(({ component }) => component.id === id)?.component.name;
      if (!label) {
        throw new Error('The actual canonical occurrence has no row label.');
      }
      await target.fill(selectors.getByRole('searchbox', { name: 'Filter parts' }), label);
      await target.expectVisible(row(id));
      const before = await readState();
      const neighbors = before.draw.surfaces.filter(({ componentId }) => componentId !== id);
      await target.click(row(id).getByCss('button[aria-label^="Hide "]'));
      await expect
        .poll(async () =>
          target.evaluate(
            (componentId) =>
              (globalThis as ActionsWindow).__TAU_SECTION_VIEW_TEST__
                ?.getModelVisibility()
                .hiddenComponentIds.includes(componentId),
            id,
          ),
        )
        .toBe(true);
      const neighborSemantics = (state: ActionState) =>
        state.draw.surfaces
          .filter(({ componentId }) => componentId !== id)
          .map(({ componentId, visible, canonicalGeometryId, drawMatrixWorld, materialOpacities, drawTriangles }) => ({
            componentId,
            visible,
            canonicalGeometryId,
            drawMatrixWorld,
            materialOpacities,
            drawTriangles,
          }))
          .sort((a, b) => a.componentId.localeCompare(b.componentId));
      try {
        await expect
          .poll(async () => {
            const state = await readState();
            const targetSurfaces = state.draw.surfaces.filter(
              ({ componentId, visible }) => componentId === id && visible,
            );
            const targetEdges = state.draw.edges.filter(
              ({ segments, visible }) =>
                visible && segments.some(({ componentId, count }) => componentId === id && count > 0),
            );
            const currentNeighbors = state.draw.surfaces.filter(({ componentId }) => componentId !== id);
            return (
              state.renderer.frame > before.renderer.frame &&
              state.diagnostics.requestedRevision === state.diagnostics.presentedRevision &&
              state.draw.presentationRevision === state.diagnostics.presentedRevision &&
              state.draw.canonicalComponents.some(({ component }) => component.id === id) &&
              state.visibility.hiddenComponentIds.includes(id) &&
              targetSurfaces.length === 0 &&
              targetEdges.length === 0 &&
              currentNeighbors.length === 3 &&
              currentNeighbors.every(({ visible, drawTriangles }) => visible && drawTriangles > 0)
            );
          })
          .toBe(true);
      } catch (error) {
        const [actual] = await Promise.allSettled([readState()]);
        if (actual.status === 'fulfilled') {
          await target
            .writeArtifact(
              `s13-${backend}-hidden-occurrence-failure.json`,
              JSON.stringify(
                {
                  id,
                  before,
                  actual: actual.value,
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
      const afterHide = await readState();
      expect(neighborSemantics(before)).toHaveLength(3);
      expect(neighborSemantics(afterHide)).toEqual(neighborSemantics(before));
      expect(afterHide.root).toEqual(before.root);
      expect(afterHide.draw.unitId).toBe(before.draw.unitId);
      expect(afterHide.draw.poseRevision).toBe(before.draw.poseRevision);
      expect(afterHide.camera).toEqual(before.camera);
      expect(afterHide.frame).toEqual(before.frame);
      expect(afterHide.draw.canvas).toEqual(before.draw.canvas);
      await target.writeArtifact(
        `s13-${backend}-hidden-${index}.json`,
        JSON.stringify(
          {
            id,
            residentNeighborCount: 3,
            before,
            after: afterHide,
          },
          undefined,
          2,
        ),
      );
      await target.click(row(id).getByCss('button[aria-label^="Show "]'));
      try {
        await expect
          .poll(async () => {
            const state = await readState();
            return (
              state.root.digest === afterHide.root.digest &&
              state.draw.unitId === afterHide.draw.unitId &&
              state.draw.poseRevision === afterHide.draw.poseRevision &&
              state.renderer.frame > afterHide.renderer.frame &&
              !state.visibility.hiddenComponentIds.includes(id) &&
              state.draw.surfaces.some(
                (surface) => surface.componentId === id && surface.visible && surface.drawTriangles > 0,
              ) &&
              state.draw.edges.some(({ segments }) =>
                segments.some((segment) => segment.componentId === id && segment.count > 0),
              )
            );
          })
          .toBe(true);
      } catch (error) {
        const [actual] = await Promise.allSettled([readState()]);
        if (actual.status === 'fulfilled') {
          await target
            .writeArtifact(
              `s13-${backend}-show-occurrence-failure.json`,
              JSON.stringify(
                {
                  id,
                  before: afterHide,
                  actual: actual.value,
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
      await menu(id);
      await target.fill(selectors.getByRole('spinbutton', { name: 'Opacity', exact: true }), '40');
      await target.keyboardPress('Enter');
      await target.keyboardPress('Escape');
      await expect
        .poll(async () => {
          const awaitedResult12 = await readState();
          const values = awaitedResult12.draw.surfaces
            .filter(({ componentId }) => componentId === id)
            .flatMap(({ materialOpacities }) => materialOpacities);
          return values.length > 0 && values.every((value) => Math.abs(value - 0.4) < 1e-8);
        })
        .toBe(true);
      const translucent = await readState();
      expect(
        translucent.draw.surfaces
          .filter(({ componentId }) => componentId === id)
          .every(({ instanceId }) => instanceId === undefined),
      ).toBe(true);
      expect(
        translucent.draw.surfaces
          .filter(({ componentId }) => componentId !== id)
          .map(({ componentId, materialOpacities }) => ({ componentId, materialOpacities })),
      ).toEqual(neighbors.map(({ componentId, materialOpacities }) => ({ componentId, materialOpacities })));
      await menu(id, 'Reset opacity');
      try {
        await expect
          .poll(async () => {
            const state = await readState();
            const rows = state.draw.surfaces.filter(({ componentId }) => componentId === id);
            return (
              rows.length > 0 &&
              rows.every(
                ({ materialOpacities, instanceId }) =>
                  materialOpacities.length > 0 &&
                  materialOpacities.every((value) => value === 1) &&
                  instanceId !== undefined,
              )
            );
          })
          .toBe(true);
      } catch (error) {
        const [actual] = await Promise.allSettled([readState()]);
        if (actual.status === 'fulfilled') {
          await target
            .writeArtifact(
              `s13-${backend}-reset-occurrence-failure.json`,
              JSON.stringify(
                {
                  id,
                  before: translucent,
                  actual: actual.value,
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
      await menu(id, 'Isolate');
      try {
        await expect
          .poll(async () => {
            const awaitedResult14 = await readState();
            return [
              ...new Set(
                awaitedResult14.draw.surfaces.filter(({ visible }) => visible).map(({ componentId }) => componentId),
              ),
            ];
          })
          .toEqual([id]);
      } catch (error) {
        const [actual] = await Promise.allSettled([readState()]);
        if (actual.status === 'fulfilled') {
          await target
            .writeArtifact(
              `s13-${backend}-isolated-occurrence-failure.json`,
              JSON.stringify(
                {
                  id,
                  before: translucent,
                  actual: actual.value,
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
      const chatHeld = held(await readState());
      await menu(id, 'Add to chat');
      const composer = selectors.getByRole('textbox', { name: 'Ask Tau to build anything...', exact: true }).first();
      await target.focus(composer);
      await target.keyboardPress('ControlOrMeta+a');
      const chip = await target.evaluateLocator(composer, (editor) => {
        const clipboard = new DataTransfer();
        editor.dispatchEvent(new ClipboardEvent('copy', { bubbles: true, cancelable: true, clipboardData: clipboard }));
        const document = new DOMParser().parseFromString(clipboard.getData('text/html'), 'text/html');
        const chips = document.querySelectorAll<HTMLElement>('[data-type="context-chip"][data-chip-type="geometry"]');
        if (chips.length !== 1 || !chips[0]) {
          throw new Error('Actual draft did not contain one canonical reference.');
        }
        const value: unknown = JSON.parse(chips[0].dataset['geometryReference'] ?? 'null');
        if (
          !value ||
          typeof value !== 'object' ||
          !('componentId' in value) ||
          !('filePath' in value) ||
          !('geometryHash' in value)
        ) {
          throw new Error('Actual reference lacks canonical file/root fields.');
        }
        return {
          componentId: value.componentId,
          filePath: value.filePath,
          geometryHash: value.geometryHash,
          token: chips[0].dataset['referenceToken'],
          text: clipboard.getData('text/plain'),
        };
      });
      const token = `@cad[${authoredPath}#${id}]`;
      expect(chip).toMatchObject({ componentId: id, filePath: authoredPath, geometryHash: initial.root.digest, token });
      expect(chip.text).toContain(token);
      expect(chatTokens.has(token)).toBe(false);
      chatTokens.add(token);
      await target.keyboardPress('Backspace');
      await expect.poll(async () => target.evaluateLocator(composer, (editor) => editor.textContent.trim())).toBe('');
      expect(held(await readState())).toEqual(chatHeld);
      const beforeFocus = await readState();
      await menu(id, 'Focus on part');
      const afterFocus = await readState();
      const samples = await pointerSamples(id);
      const pointerObservations: Array<
        Readonly<{ sample: (typeof samples)[number]; state: Awaited<ReturnType<typeof hover>> }>
      > = [];
      let pointer: (typeof samples)[number] | undefined;
      for (const sample of samples) {
        await target.mouseMove(sample.x, sample.y);
        const state = await hover();
        pointerObservations.push({ sample, state });
        if (
          state?.hoveredComponentId === id &&
          state.rayParity?.stockComponentId === id &&
          state.rayParity.tauComponentId === id &&
          !state.rayParity.clippingEnabled
        ) {
          pointer = sample;
          break;
        }
      }
      await target.writeArtifact(
        `s13-${backend}-placed-pick-${index}.json`,
        JSON.stringify(
          {
            id,
            beforeFocus,
            afterFocus,
            pointerObservations,
            after: await readState(),
          },
          undefined,
          2,
        ),
      );
      if (!pointer) {
        throw new Error('No actual stock/Tau slot hit at its placed footprint.');
      }
      const selectedBeforeClick = await hover();
      expect(selectedBeforeClick?.selectedComponentIds).toEqual([id]);
      await target.mouseDown();
      await target.mouseUp();
      await expect.poll(hover).toMatchObject({ selectedComponentIds: [] });
      await target.mouseDown();
      await target.mouseUp();
      await expect.poll(hover).toMatchObject({ selectedComponentIds: [id] });
      await prepareMeasure('extent-x');
      const awaitedResult15 = await catalog();
      const prior = new Set(awaitedResult15.measurements.map(({ id: measurementId }) => measurementId));
      await choose(id);
      const extent = await newMeasure(prior);
      expect(extent).toMatchObject({ operation: 'extent-x', quality: 'mesh' });
      expect(extent.distance).toBeCloseTo(0.02, 6); // Independent makeBaseBox(20,14,4), translated proper-rigid O; no output-derived expectation.
      await closeMeasure();
      const sectionHeld = await readState();
      const cutOffset = flatActionPlacements[index]!.x;
      const cutIds = await setCut(cutOffset);
      let capObservation: unknown;
      await expect
        .poll(async () => {
          const state = await readState();
          expect(held(state)).toEqual(held(sectionHeld));
          expect(state.camera).toEqual(sectionHeld.camera);
          const observed = await target.evaluate(() => {
            const api = (globalThis as ActionsWindow).__TAU_SECTION_VIEW_TEST__;
            if (!api) {
              throw new Error('Actual section owner is absent.');
            }
            return { section: api.getSectionState(), cap: api.getSectionCapCompleteness() };
          });
          const matches = (cuts: typeof observed.section.cuts) =>
            cuts.length === 1 &&
            cuts.every(
              (cut) =>
                cut.id === cutIds[0] &&
                cut.kind === 'plane' &&
                cut.plane === 'yz' &&
                cut.offset === cutOffset &&
                !cut.isFlipped,
            );
          capObservation = { requested: { cutIds, cutOffset }, state, observed };
          return {
            currentCut:
              observed.section.isActive &&
              observed.section.isCommitted &&
              matches(observed.section.cuts) &&
              matches(observed.section.committedCuts),
            frameAdvanced: state.renderer.frame > sectionHeld.renderer.frame,
            cap: observed.cap,
          };
        })
        .toMatchObject({
          currentCut: true,
          frameAdvanced: true,
          cap: {
            status: 'complete',
            trueCutComponentCount: 1,
            cappedTrueCutComponentCount: 1,
            unsupportedSourceCount: 0,
          },
        });
      if (backend === 'webgl' && index === 0) {
        const tagged = await readCurrentSectionTaggedResources(held(sectionHeld));
        const section = tagged.sectionViewHelper;
        expect(section.geometryCount).toBeGreaterThan(0);
        expect(section.materialCount).toBeGreaterThan(0);
        expect(section.attributeHandleCount).toBeGreaterThan(0);
        expect(section.bufferCount).toBeGreaterThan(0);
        expect(section.payloadBytes).toBeGreaterThan(0);
        expect(section.backingBytes).toBeGreaterThanOrEqual(section.payloadBytes);
        expect(tagged.union.geometryCount).toBeGreaterThanOrEqual(section.geometryCount);
        expect(tagged.union.payloadBytes).toBeGreaterThanOrEqual(section.payloadBytes);
      }
      await target.writeArtifact(
        `s13-${backend}-partial-cap-${index}.json`,
        JSON.stringify(capObservation, undefined, 2),
      );
      let retained: (typeof samples)[number] | undefined;
      for (const sample of samples) {
        await target.mouseMove(sample.x, sample.y);
        const state = await hover();
        if (
          state?.hoveredComponentId === id &&
          state.rayParity?.stockComponentId === id &&
          state.rayParity.tauComponentId === id &&
          state.rayParity.clippingEnabled
        ) {
          retained = sample;
          break;
        }
      }
      if (!retained) {
        throw new Error('The actual partial cut has no retained stock/Tau hit.');
      }
      await setCut(flatActionPlacements[index]!.x - 0.012);
      await target.mouseMove(retained.x + 0.5, retained.y);
      await target.mouseMove(retained.x, retained.y);
      await expect
        .poll(async () => {
          const state = await hover();
          if (!state?.rayParity) {
            throw new Error('Actual full-cut hover parity is absent.');
          }
          return {
            hoveredComponentId: state.hoveredComponentId,
            rayParity: {
              candidateSceneId: state.rayParity.candidateSceneId,
              clippingEnabled: state.rayParity.clippingEnabled,
              unclippedStockComponentId: state.rayParity.unclippedStockComponentId,
              stockComponentId: state.rayParity.stockComponentId,
              tauComponentId: state.rayParity.tauComponentId,
            },
          };
        })
        .toMatchObject({
          hoveredComponentId: undefined,
          rayParity: {
            candidateSceneId: sectionHeld.draw.candidateSceneId,
            clippingEnabled: true,
            unclippedStockComponentId: id,
            stockComponentId: undefined,
            tauComponentId: undefined,
          },
        });
      expect(held(await readState())).toEqual(held(sectionHeld));
      const awaitedResult16 = await readState();
      expect(awaitedResult16.camera).toEqual(sectionHeld.camera);
      const cameraRequest = await target.evaluate((nextCamera) => {
        const api = (globalThis as ActionsWindow).__TAU_SECTION_VIEW_TEST__;
        if (!api) {
          throw new Error('Existing camera owner is absent.');
        }
        const before = api.getCamera();
        api.setSectionCuts([]);
        api.setSectionViewActive(false);
        api.setCamera(nextCamera);
        return { before, accepted: api.getCamera() };
      }, camera);
      if (camera.fov === undefined || camera.zoom === undefined) {
        throw new Error('Actual restoration requires the supplied perspective camera controls.');
      }
      const offset: readonly [number, number, number] = [
        camera.position[0] - camera.target[0],
        camera.position[1] - camera.target[1],
        camera.position[2] - camera.target[2],
      ];
      // oxlint-disable-next-line unicorn/prefer-modern-math-apis -- Match Three.Vector3.length() reference arithmetic exactly; Math.hypot changes this setter request's IEEE result.
      const distance = Math.sqrt(offset[0] * offset[0] + offset[1] * offset[1] + offset[2] * offset[2]);
      expect(distance).toBeGreaterThan(0);
      const normalized = (vector: readonly number[]) => {
        const length = Math.hypot(...vector);
        return vector.map((value) => value / length);
      };
      // The setCamera owner converts the supplied offset with Three, then the actual setView/FOV events validate each control.
      const requestedDirection = normalized(normalized(offset.map((value) => value * (1 / distance))));
      const preferredUp = cameraRequest.before.up;
      expect(preferredUp).toEqual(camera.up);
      // oxlint-disable unicorn/prefer-modern-math-apis -- Match Three.Vector3.normalize() reference length arithmetic exactly for the authored preferred-up conversion.
      const upLength = Math.sqrt(
        preferredUp[0] * preferredUp[0] + preferredUp[1] * preferredUp[1] + preferredUp[2] * preferredUp[2],
      );
      // oxlint-enable unicorn/prefer-modern-math-apis
      expect(upLength).toBeGreaterThan(0);
      const requestedUp = normalized(normalized(preferredUp.map((value) => value * (1 / upLength))));
      expect(
        (offset[1] * preferredUp[2] - offset[2] * preferredUp[1]) ** 2 +
          (offset[2] * preferredUp[0] - offset[0] * preferredUp[2]) ** 2 +
          (offset[0] * preferredUp[1] - offset[1] * preferredUp[0]) ** 2,
      ).toBeGreaterThan(0);
      const acceptedControls = {
        bounds: cameraRequest.accepted.bounds,
        target: cameraRequest.accepted.target,
        direction: cameraRequest.accepted.direction,
        up: cameraRequest.accepted.up,
        verticalSpan: cameraRequest.accepted.verticalSpan,
        requestedFov: cameraRequest.accepted.requestedFov,
        requestedPerspectiveZoom: cameraRequest.accepted.requestedPerspectiveZoom,
      };
      const requestedControls = {
        bounds: camera.bounds,
        target: camera.target,
        direction: requestedDirection,
        up: requestedUp,
        verticalSpan: (2 * distance * Math.tan((camera.fov * Math.PI) / 360)) / camera.zoom,
        requestedFov: camera.fov,
        requestedPerspectiveZoom: camera.zoom,
      };
      const acceptedNativePose = {
        position: cameraRequest.accepted.position,
        quaternion: cameraRequest.accepted.quaternion,
      };
      let edgeTriangles = 0;
      try {
        expect(cameraRequest.accepted).toMatchObject({
          actorStatus: 'active',
          projection: camera.projection,
          fov: camera.fov,
          zoom: camera.zoom,
          aspect: camera.aspect,
        });
        expect(acceptedControls).toEqual(requestedControls);
        await expect
          .poll(async () => {
            const state = await readState();
            expect({
              root: state.root,
              diagnostics: state.diagnostics,
              unit: state.draw.unitId,
              pose: state.draw.poseRevision,
              revision: state.draw.presentationRevision,
            }).toEqual({
              root: sectionHeld.root,
              diagnostics: sectionHeld.diagnostics,
              unit: sectionHeld.draw.unitId,
              pose: sectionHeld.draw.poseRevision,
              revision: sectionHeld.draw.presentationRevision,
            });
            const section = await target.evaluate(() => {
              const api = (globalThis as ActionsWindow).__TAU_SECTION_VIEW_TEST__;
              if (!api) {
                throw new Error('Actual section owner is absent.');
              }
              return api.getSectionState();
            });
            expect(section).toMatchObject({ isActive: false, isCommitted: true, cuts: [], committedCuts: [] });
            expect({
              bounds: state.camera.bounds,
              target: state.camera.target,
              direction: state.camera.direction,
              up: state.camera.up,
              verticalSpan: state.camera.verticalSpan,
              requestedFov: state.camera.requestedFov,
              requestedPerspectiveZoom: state.camera.requestedPerspectiveZoom,
            }).toEqual(acceptedControls);
            expect({ position: state.camera.position, quaternion: state.camera.quaternion }).toEqual(
              acceptedNativePose,
            );
            expect(state.camera).toMatchObject({
              actorStatus: 'active',
              projection: camera.projection,
              fov: camera.fov,
              zoom: camera.zoom,
              aspect: camera.aspect,
            });
            expect(state.renderer.frame).toBeGreaterThan(awaitedResult16.renderer.frame);
            edgeTriangles = state.draw.edges
              .filter(({ visible, segments }) => visible && segments.some(({ componentId }) => componentId === id))
              .reduce((sum, edge) => sum + edge.mandatoryTriangles, 0);
            return edgeTriangles;
          })
          .toBeGreaterThan(0);
      } catch (error) {
        const [actual] = await Promise.allSettled([
          target.evaluate(() => {
            const api = (globalThis as ActionsWindow).__TAU_SECTION_VIEW_TEST__;
            const subject = api?.getCommittedAssembly();
            const draw = api?.getCommittedDrawInventory();
            return {
              bridgePresent: Boolean(api),
              assemblyPresent: Boolean(subject?.assemblyDisplay),
              subjectCurrent: subject?.isCurrent(),
              root: subject?.assemblyDisplay?.root,
              diagnostics: subject?.diagnostics,
              drawPresent: Boolean(draw),
              drawKeyMatchesRoot: Boolean(
                draw && subject?.assemblyDisplay && draw.key === subject.assemblyDisplay.root.digest,
              ),
              draw: draw
                ? {
                    key: draw.key,
                    unit: draw.unitId,
                    pose: draw.poseRevision,
                    revision: draw.presentationRevision,
                    scene: draw.candidateSceneId,
                    surfaceCount: draw.surfaces.length,
                    edgeCount: draw.edges.length,
                  }
                : undefined,
              section: api?.getSectionState(),
              camera: api?.getCamera(),
              renderer: api?.getRendererIdentity(),
            };
          }),
        ]);
        if (actual.status === 'fulfilled') {
          await target
            .writeArtifact(
              `s13-${backend}-restoration-readiness-${index}-failure.json`,
              JSON.stringify(
                {
                  id,
                  expected: {
                    root: sectionHeld.root,
                    diagnostics: sectionHeld.diagnostics,
                    unit: sectionHeld.draw.unitId,
                    pose: sectionHeld.draw.poseRevision,
                    revision: sectionHeld.draw.presentationRevision,
                    camera,
                    acceptedControls,
                    requestedControls,
                    acceptedNativePose,
                    priorFrame: awaitedResult16.renderer.frame,
                  },
                  actual: actual.value,
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
      expect(edgeTriangles).toBeGreaterThan(0);
      if (backend === 'webgl' && index === 0) {
        const tagged = await readCurrentSectionTaggedResources(held(sectionHeld));
        const section = tagged.sectionViewHelper;
        expect(section.geometryCount).toBe(0);
        expect(section.materialCount).toBe(0);
        expect(section.attributeHandleCount).toBe(0);
        expect(section.bufferCount).toBe(0);
        expect(section.payloadBytes).toBe(0);
        expect(section.backingBytes).toBe(0);
      }
      actions.push({ id, extent: extent.distance, pointer, mandatoryEdges: edgeTriangles });
      await menu(id, 'Remove isolation');
      await expect
        .poll(async () => {
          const awaitedResult18 = await readState();
          return awaitedResult18.draw.surfaces.filter(({ visible }) => visible).length;
        })
        .toBe(4);
      expect(await readPin()).toEqual(pin);
      const emptyPointer = await target.evaluate(() => {
        const api = (globalThis as ActionsWindow).__TAU_SECTION_VIEW_TEST__;
        if (!api) {
          throw new Error('The actual viewport owner is absent.');
        }
        const canvas = api.getViewportCanvas();
        const region = canvas.closest('[data-testid="cad-viewer-canvas-region"]');
        if (
          region?.getAttribute('role') !== 'application' ||
          region.getAttribute('aria-label') !== 'CAD canvas' ||
          !region.contains(canvas)
        ) {
          throw new Error('The actual renderer canvas has no matching CAD pointer event region.');
        }
        const rect = canvas.getBoundingClientRect();
        const point = { x: rect.left + rect.width / 8, y: rect.top + rect.height / 8 };
        if (document.elementFromPoint(point.x, point.y) !== region) {
          throw new Error('The empty-space gesture point is not on the actual CAD pointer event region.');
        }
        return point;
      });
      await target.mouseMove(emptyPointer.x, emptyPointer.y);
      await expect
        .poll(async () => {
          const state = await readState();
          const pointerState = await hover();
          return (
            pointerState?.activeUnitId === state.draw.unitId &&
            pointerState.rayParity?.candidateSceneId === state.draw.candidateSceneId &&
            !pointerState.rayParity.clippingEnabled &&
            pointerState.rayParity.stockComponentId === undefined &&
            pointerState.rayParity.unclippedStockComponentId === undefined &&
            pointerState.rayParity.tauComponentId === undefined &&
            pointerState.hoveredComponentId === undefined
          );
        })
        .toBe(true);
      const beforeMiss = await readState();
      await target.mouseDown();
      await target.mouseUp();
      await expect
        .poll(async () => {
          const state = await readState();
          const pointerState = await hover();
          expect({
            root: state.root,
            diagnostics: state.diagnostics,
            unit: state.draw.unitId,
            pose: state.draw.poseRevision,
            revision: state.draw.presentationRevision,
          }).toEqual({
            root: beforeMiss.root,
            diagnostics: beforeMiss.diagnostics,
            unit: beforeMiss.draw.unitId,
            pose: beforeMiss.draw.poseRevision,
            revision: beforeMiss.draw.presentationRevision,
          });
          expect(state.visibility).toEqual({ hiddenComponentIds: [], isolatedComponentIds: [] });
          expect(pointerState?.selectedComponentIds).toEqual([]);
          return (
            state.renderer.frame > beforeMiss.renderer.frame &&
            state.draw.surfaces.length === 4 &&
            state.draw.surfaces.every(
              ({ componentId, visible, drawTriangles, materialOpacities, instanceId }) =>
                ids.includes(componentId) &&
                visible &&
                drawTriangles > 0 &&
                instanceId !== undefined &&
                materialOpacities.length > 0 &&
                materialOpacities.every((opacity) => opacity === 1),
            )
          );
        })
        .toBe(true);
      expect(await readPin()).toEqual(pin);
    }

    for (const [path, base64] of originalAuthoredFiles) {
      const awaitedResult19 = await download(path);
      expect(awaitedResult19.base64).toBe(base64);
    }
    const awaitedResult20 = await download(authoredPath);
    expect(decode(awaitedResult20.base64)).toEqual(new TextEncoder().encode(authoredBytes));
    // Root changes retire real pending feature evidence; same-count reorder may never reuse its old target address.
    await prepareMeasure('minimum-distance');
    const retired = await choose(firstId);
    await expect
      .poll(async () => {
        const awaitedResult21 = await catalog();
        return awaitedResult21.currentStart;
      })
      .toBeDefined();
    const beforeReorder = await readState();
    const awaitedResult22 = await catalog();
    const measuresBeforeReorder = awaitedResult22.measurements.map(({ id }) => id);
    await upload(reference, ['flat-d', 'flat-b', 'flat-a', 'flat-c'], true);
    const reordered = await waitCurrent(authoredPath, beforeReorder.root.digest);
    expect(reordered.draw.unitId).toBe(initial.draw.unitId);
    expect(canonicalIds(reordered, orderedIds)).toEqual(ids);
    expect(reordered.draw.candidateSceneId).not.toBe(beforeReorder.draw.candidateSceneId);
    await expect
      .poll(async () => {
        const awaitedResult23 = await catalog();
        return awaitedResult23.currentStart;
      })
      .toBeUndefined();
    await expect
      .poll(async () => {
        const awaitedResult24 = await catalog();
        return awaitedResult24.candidates.some(({ id }) => id === retired);
      })
      .toBe(false);
    await expect
      .poll(async () => {
        const awaitedResult25 = await catalog();
        return awaitedResult25.lockedTargetId;
      })
      .toBeUndefined();
    const awaitedResult26 = await catalog();
    expect(awaitedResult26.measurements.map(({ id }) => id)).toEqual(measuresBeforeReorder);
    // Storage order is an owner policy: keeping canonical slots stable through authored reorder is valid.
    const slotsBeforeReorder = beforeReorder.draw.surfaces.map(({ componentId, objectUuid, instanceId }) => ({
      componentId,
      objectUuid,
      instanceId,
    }));
    const slotsAfterReorder = reordered.draw.surfaces.map(({ componentId, objectUuid, instanceId }) => ({
      componentId,
      objectUuid,
      instanceId,
    }));
    expect(reordered.draw.surfaces).toHaveLength(4);
    expect(new Set(slotsAfterReorder.map(({ componentId }) => componentId)).size).toBe(4);
    for (const id of ids) {
      expect(geometrySignature(reordered, id)).toEqual(geometrySignature(initial, id));
      expect(reordered.draw.surfaces.find(({ componentId }) => componentId === id)?.drawMatrixWorld).toEqual(
        initial.draw.surfaces.find(({ componentId }) => componentId === id)?.drawMatrixWorld,
      );
    }
    // Genuine freshly selected canonical body remains usable; the old pending start did not silently bind its new slot.
    await closeMeasure();
    await prepareMeasure('minimum-distance');
    const compactedTarget = await choose(secondId);
    const awaitedResult27 = await catalog();
    const measuresBeforeCompaction = awaitedResult27.measurements.map(({ id }) => id);
    await expect
      .poll(async () => {
        const awaitedResult28 = await catalog();
        return awaitedResult28.currentStart;
      })
      .toBeDefined();
    await upload(reference, ['flat-d', 'flat-a', 'flat-c'], true);
    const compacted = await waitCurrent(authoredPath, reordered.root.digest);
    expect(canonicalIds(compacted, ['flat-a', 'flat-c', 'flat-d'])).toEqual([ids[0], ids[2], ids[3]]);
    expect(compacted.draw.surfaces).toHaveLength(3);
    expect(compacted.draw.surfaces.some(({ componentId }) => componentId === ids[1])).toBe(false);
    const slotsAfterCompaction = compacted.draw.surfaces.map(({ componentId, objectUuid, instanceId }) => ({
      componentId,
      objectUuid,
      instanceId,
    }));
    expect(new Set(slotsAfterCompaction.map(({ componentId }) => componentId)).size).toBe(3);
    expect(
      compacted.draw.surfaces
        .map(({ instanceId }) => instanceId)
        .sort((left, right) => {
          const leftText = String(left);
          const rightText = String(right);
          return leftText < rightText ? -1 : leftText > rightText ? 1 : 0;
        }),
    ).toEqual([0, 1, 2]);
    await expect
      .poll(async () => {
        const awaitedResult29 = await catalog();
        return awaitedResult29.currentStart;
      })
      .toBeUndefined();
    await expect
      .poll(async () => {
        const awaitedResult30 = await catalog();
        return awaitedResult30.candidates.some(({ id }) => id === compactedTarget);
      })
      .toBe(false);
    await expect
      .poll(async () => {
        const awaitedResult31 = await catalog();
        return awaitedResult31.lockedTargetId;
      })
      .toBeUndefined();
    const awaitedResult32 = await catalog();
    expect(awaitedResult32.measurements.map(({ id }) => id)).toEqual(measuresBeforeCompaction);
    for (const id of [ids[0]!, ids[2]!, ids[3]!]) {
      expect(geometrySignature(compacted, id)).toEqual(geometrySignature(initial, id));
      expect(compacted.draw.surfaces.find(({ componentId }) => componentId === id)?.drawMatrixWorld).toEqual(
        initial.draw.surfaces.find(({ componentId }) => componentId === id)?.drawMatrixWorld,
      );
    }
    await closeMeasure();
    await upload(reference, orderedIds, true);
    const restored = await waitCurrent(authoredPath, compacted.root.digest);
    expect(canonicalIds(restored, orderedIds)).toEqual(ids);
    expect(restored.root.digest).not.toBe(compacted.root.digest);
    const restoredPin = await readPin();
    expect(restoredPin.parts).toEqual(pin.parts);
    expect(restoredPin.assets).toEqual(pin.assets);
    const awaitedResult33 = await download(authoredPath);
    expect(decode(awaitedResult33.base64)).toEqual(new TextEncoder().encode(authoredBytes));

    // Reopen the genuine managed pin before removing authors. The selected actor never observes deleted source failures.
    await reveal(restored.root.path);
    await target.click(treeItem(restored.root.path), { button: 'right' });
    await target.click(selectors.getByRole('menuitem', { name: 'Open in Viewer', exact: true }));
    const managed = await waitCurrent(restored.root.path);
    expect(managed.root).toEqual(restored.root);
    for (const path of [
      'parity/parts/opaque.js',
      'parity/parts/glass.js',
      'parity/parts/alpha.js',
      'parity/assembly.json',
      authoredPath,
    ]) {
      const originalDownload = await download(path);
      const expectedBase64 = path === authoredPath ? encode(authoredBytes) : originalAuthoredFiles.get(path);
      if (!expectedBase64) {
        throw new Error('A source escaped the bounded frozen authored inventory.');
      }
      expect(originalDownload.base64).toBe(expectedBase64);
      await target.click(treeItem(path), { button: 'right' });
      await target.click(selectors.getByRole('menuitem', { name: 'Delete', exact: true }));
      const dialog = selectors.getByRole('alertdialog');
      await target.expectVisible(dialog);
      await target.click(dialog.getByRole('button', { name: /^Delete/u }));
      await target.expectCount(treeItem(path), 0);
    }
    expect(await readPin()).toEqual(restoredPin);
    const exactHeld = await readState();
    const exactIds = canonicalIds(exactHeld, orderedIds);
    const [firstExactId, secondExactId] = exactIds;
    if (exactIds.length !== 4 || firstExactId === undefined || secondExactId === undefined) {
      throw new Error('The source-free four-body fixture lacks its canonical exact pair.');
    }
    await target.evaluate(
      (binding) => {
        const observer = (globalThis as MotionExactObservationWindow).__TAU_C6_EXACT_OBSERVATION__;
        if (!observer) {
          throw new Error('Actual exact worker observer is absent.');
        }
        observer.arm(binding);
      },
      {
        key: exactHeld.draw.key,
        unitId: exactHeld.draw.unitId,
        poseRevision: exactHeld.draw.poseRevision,
        candidateSceneId: exactHeld.draw.candidateSceneId,
        names: [firstExactId, secondExactId] as const,
      },
    );
    await prepareMeasure('minimum-distance');
    const awaitedResult34 = await catalog();
    const previous = new Set(awaitedResult34.measurements.map(({ id }) => id));
    await choose(firstExactId);
    await expect
      .poll(async () => {
        const awaitedResult35 = await catalog();
        return awaitedResult35.currentStart;
      })
      .toBeDefined();
    await choose(secondExactId);
    const minimum = await newMeasure(previous);
    expect(minimum).toMatchObject({ operation: 'minimum-distance', quality: 'cad', status: 'current' });
    expect(minimum.distance).toBeCloseTo(0.01, 8);
    const observation = await target.evaluate(() =>
      (globalThis as MotionExactObservationWindow).__TAU_C6_EXACT_OBSERVATION__?.read(),
    );
    if (!observation || Boolean(observation.failure) || !observation.response || observation.bytes.length === 0) {
      throw new Error(observation?.failure ?? 'Actual successful exact worker request/response bytes are absent.');
    }
    expect(observation.response.id).toBe(observation.id);
    expect(observation.binding).toEqual({
      key: exactHeld.draw.key,
      unitId: exactHeld.draw.unitId,
      poseRevision: exactHeld.draw.poseRevision,
      candidateSceneId: exactHeld.draw.candidateSceneId,
      names: [exactIds[0], exactIds[1]],
    });
    expect(observation.response.distanceMeters).toBeCloseTo(minimum.distance, 10);
    expect(held(await readState())).toEqual(held(exactHeld));
    const native = await target.motionNativeOracle({
      observation,
      expected: flatActionNativeOracle(
        exactHeld.draw.canonicalComponents.filter(({ component }) => exactIds.includes(component.id)),
      ),
      expectedBodyCount: 4,
    });
    expect(held(await readState())).toEqual(held(exactHeld));
    expect(await readPin()).toEqual(restoredPin);
    await target.writeArtifact(
      `s13-occurrence-actions-${backend}.json`,
      JSON.stringify(
        {
          actions,
          originalRoot: original.root,
          flatRoot: pin.root,
          restoredRoot: restoredPin.root,
          parts: pin.parts,
          assets: pin.assets,
          reordered: held(reordered),
          actualSlots: {
            beforeReorder: slotsBeforeReorder,
            afterReorder: slotsAfterReorder,
            afterCompaction: slotsAfterCompaction,
          },
          compacted: held(compacted),
          managed: held(exactHeld),
          minimum,
          worker,
          observedRequest: { id: observation.id, binding: observation.binding, response: observation.response },
          native,
          classification: {
            api: backend,
            hardware: 'UNQUALIFIED',
            gpuUploads: 'UNMEASURED',
            liveBvhObjectIdentity: 'NOT TRANSPORTED',
          },
        },
        undefined,
        2,
      ),
    );
    await closeMeasure();
    const imageBefore = await readState();
    await target.screenshot(selectors.getByCss('body'), `s13-occurrence-actions-${backend}.png`);
    const imageAfter = await readState();
    expect(held(imageAfter)).toEqual(held(imageBefore));
    expect(imageAfter.camera).toEqual(imageBefore.camera);
    expect(imageAfter.frame).toEqual(imageBefore.frame);
    expect(await readPin()).toEqual(restoredPin);
  });
}
/* oxlint-enable no-await-in-loop */

declare module 'vitest' {
  /* eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Vitest's ProvidedContext requires interface declaration merging. */ /* oxlint-disable-next-line typescript/consistent-type-definitions -- Vitest's ProvidedContext requires interface declaration merging. */
  export interface ProvidedContext {
    motionExactWorkerAsset?: Readonly<{ path: string; sha256: string; sourceMapSha256: string }>;
  }
}
