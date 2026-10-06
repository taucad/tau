import { WebIO } from '@gltf-transform/core';
import { base64ToUint8Array, uint8ArrayToBase64 } from 'uint8array-extras';
import { expect, inject, onTestFinished, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type {
  AdmittedAssembly,
  PublishedPartAsset,
  PublishedPartReference,
  TelemetrySpanRecord,
} from '@taucad/runtime/types';
import * as target from '#support/external-target.js';
import { expandPath, treeItem } from '#support/file-tree.js';
import { classifyWebGpuAdapter } from '#support/webgpu-profile.js';
import { captureScalePinProgress, compareScalePngFrames } from '#support/parts-assemblies-scale.js';
import {
  publicationSpanKey as spanKey,
  capturedPublicationGraph,
  selectedPublicationGraph,
  pairedPublicationGraphs,
} from '#support/selected-publication-graph.js';
import { assertOrdinaryParityDiagnostics } from '#support/parts-assemblies-parity.js';
import type { AssemblyTestBridgeApi, AssemblyTestCamera } from '#support/parts-assemblies-motion.js';

// Forward the existing bridge inventory as opaque data; its rows are defined only by the producer owner.
const captureScaleViewportEvidenceInPage = (includeRenderDevice: boolean) => {
  const bridge = (
    globalThis as typeof globalThis & {
      __TAU_SECTION_VIEW_TEST__?: {
        getCommittedAssembly(): { assemblyDisplay: { root: { digest: string } } | undefined; isCurrent(): boolean };
        getCommittedDrawInventory(): unknown;
        getAssemblyResourceTelemetry(): readonly TelemetrySpanRecord[];
        getCadActivity(): unknown;
        getCamera(): unknown;
        getViewportCanvas(): HTMLCanvasElement;
        getRendererIdentity(
          options?: Readonly<{ includeRenderDevice?: boolean }>,
        ): ReturnType<AssemblyTestBridgeApi['getRendererIdentity']>;
      };
    }
  ).__TAU_SECTION_VIEW_TEST__;
  const subject = bridge?.getCommittedAssembly();
  if (!bridge || !subject?.assemblyDisplay || !subject.isCurrent()) {
    throw new Error('A coherent scale viewport is unavailable.');
  }
  const inventory = bridge.getCommittedDrawInventory();
  if (
    typeof inventory !== 'object' ||
    inventory === null ||
    !('key' in inventory) ||
    inventory.key !== subject.assemblyDisplay.root.digest ||
    !('candidateSceneId' in inventory) ||
    typeof inventory.candidateSceneId !== 'string' ||
    inventory.candidateSceneId.length === 0 ||
    !('presentationRevision' in inventory) ||
    typeof inventory.presentationRevision !== 'number' ||
    !('unitId' in inventory) ||
    typeof inventory.unitId !== 'string' ||
    !('poseRevision' in inventory) ||
    typeof inventory.poseRevision !== 'number'
  ) {
    throw new Error('The mounted producer has no current scale inventory.');
  }
  if (
    !('frustumSurfaceTriangleUpperBound' in inventory) ||
    typeof inventory.frustumSurfaceTriangleUpperBound !== 'number' ||
    !Number.isFinite(inventory.frustumSurfaceTriangleUpperBound) ||
    inventory.frustumSurfaceTriangleUpperBound < 0 ||
    !('residentMandatoryEdgeTriangles' in inventory) ||
    typeof inventory.residentMandatoryEdgeTriangles !== 'number' ||
    !Number.isFinite(inventory.residentMandatoryEdgeTriangles) ||
    inventory.residentMandatoryEdgeTriangles < 0
  ) {
    throw new Error('The mounted scale triangle inventory is unavailable.');
  }
  const resources = bridge.getAssemblyResourceTelemetry();
  const viewportIds = new Set(
    resources.flatMap(({ detail }) => {
      const id = detail?.['viewportActorSessionId'];
      return typeof id === 'string' && id.length > 0 ? [id] : [];
    }),
  );
  const [viewportActorSessionId] = viewportIds;
  if (viewportIds.size !== 1 || viewportActorSessionId === undefined) {
    throw new Error('The actual scale viewport actor authority is unavailable.');
  }
  const canvas = includeRenderDevice ? bridge.getViewportCanvas() : undefined;
  if (canvas && !canvas.isConnected) {
    throw new Error('Native scale identity requires the actual mounted canvas.');
  }
  const nativeIdentityStartedAt = includeRenderDevice ? performance.now() : undefined;
  const renderer = bridge.getRendererIdentity(includeRenderDevice ? { includeRenderDevice: true } : undefined);
  const nativeIdentityFinishedAt = includeRenderDevice ? performance.now() : undefined;
  if (includeRenderDevice && !renderer.renderDevice) {
    throw new Error('The opt-in scale native identity response is unavailable.');
  }
  const result = {
    identity: {
      root: subject.assemblyDisplay.root.digest,
      candidateSceneId: inventory.candidateSceneId,
      presentationRevision: inventory.presentationRevision,
      unitId: inventory.unitId,
      poseRevision: inventory.poseRevision,
      viewportActorSessionId,
      backend: renderer.api,
    },
    inventory,
    triangleUpperBound: inventory.frustumSurfaceTriangleUpperBound + inventory.residentMandatoryEdgeTriangles,
    camera: bridge.getCamera(),
    renderer,
    nativeIdentityWindow: includeRenderDevice
      ? {
          timeOrigin: performance.timeOrigin,
          startedAt: nativeIdentityStartedAt,
          finishedAt: nativeIdentityFinishedAt,
          semantics: 'Untimed native identity read; excluded from trusted-input and presented-frame timing.',
        }
      : undefined,
    resources,
    activity: bridge.getCadActivity(),
  };
  if (!subject.isCurrent()) {
    throw new Error('Scale presentation changed during evidence collection.');
  }
  if (includeRenderDevice) {
    const current = bridge.getCommittedDrawInventory();
    if (
      typeof current !== 'object' ||
      current === null ||
      !('key' in current) ||
      current.key !== inventory.key ||
      !('candidateSceneId' in current) ||
      current.candidateSceneId !== inventory.candidateSceneId ||
      !('presentationRevision' in current) ||
      current.presentationRevision !== inventory.presentationRevision ||
      !('unitId' in current) ||
      current.unitId !== inventory.unitId ||
      !('poseRevision' in current) ||
      current.poseRevision !== inventory.poseRevision ||
      !canvas?.isConnected ||
      bridge.getViewportCanvas() !== canvas ||
      (globalThis as typeof globalThis & { __TAU_SECTION_VIEW_TEST__?: unknown }).__TAU_SECTION_VIEW_TEST__ !== bridge
    ) {
      throw new Error('Scale candidate or native canvas changed during the untimed identity read.');
    }
  }
  return result;
};
const captureScaleViewportEvidence = async (includeRenderDevice = false) =>
  target.evaluate(captureScaleViewportEvidenceInPage, includeRenderDevice);

const writeWarehouseEvidencePart = async (name: string, value: unknown) => {
  const content = JSON.stringify(value, undefined, 2);
  const bytes = new TextEncoder().encode(content);
  // Include JSON escaping and leave room for Vitest's command envelope below ws's 100 MiB limit.
  if (new TextEncoder().encode(JSON.stringify([name, content])).byteLength > 100 * 1024 * 1024 - 64 * 1024) {
    throw new RangeError('Warehouse evidence part exceeds its WebSocket artifact bound.');
  }
  await target.writeArtifact(name, content);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return {
    path: name,
    byteLength: bytes.byteLength,
    sha256: Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(''),
  };
};

const readScaleCommittedPin = async (
  externalFiles: ReadonlyArray<{ path: string; digest: string; byteLength: number; bytes: readonly number[] }> = [],
) =>
  target.evaluate(async (externalFiles) => {
    const bridge = (
      globalThis as typeof globalThis & {
        __TAU_SECTION_VIEW_TEST__?: {
          getCommittedAssembly(): Readonly<{
            assemblyDisplay: Readonly<{ root: PublishedPartAsset; admitted: AdmittedAssembly }> | undefined;
            diagnostics: Readonly<{
              projectId: string | undefined;
              requestedKey: string | undefined;
              presentedKey: string | undefined;
            }>;
            isCurrent(): boolean;
            readRawBytes(path: string): Promise<Uint8Array<ArrayBuffer>>;
          }>;
        };
      }
    ).__TAU_SECTION_VIEW_TEST__;
    const capture = bridge?.getCommittedAssembly();
    const display = capture?.assemblyDisplay;
    const heldIsCurrentAtCapture = capture?.isCurrent();
    if (!capture || !display || !heldIsCurrentAtCapture) {
      throw new Error('Actual committed scale pin is unavailable.');
    }
    const progress = {
      status: 1,
      phase: 0,
      ordinal: 0,
      requested: 0,
      completed: 0,
      requestedByPhase: Array.from({ length: 10 }, () => 0),
      completedByPhase: Array.from({ length: 10 }, () => 0),
      awaitMillisecondsByPhase: Array.from({ length: 10 }, () => 0),
      timeOrigin: performance.timeOrigin,
      startedAt: performance.now(),
      requestedAt: 0,
      completedAt: 0,
    };
    (
      globalThis as typeof globalThis & { __TAU_SCALE_PIN_PROGRESS_TEST__?: typeof progress }
    ).__TAU_SCALE_PIN_PROGRESS_TEST__ = progress;
    const observe = async <Result>(phase: number, operation: () => Promise<Result>): Promise<Result> => {
      progress.phase = phase;
      progress.ordinal += 1;
      progress.requested += 1;
      progress.requestedByPhase[phase] = (progress.requestedByPhase[phase] ?? 0) + 1;
      const requestedAt = performance.now();
      progress.requestedAt = requestedAt;
      const result = await operation();
      progress.completed += 1;
      progress.completedByPhase[phase] = (progress.completedByPhase[phase] ?? 0) + 1;
      const completedAt = performance.now();
      progress.completedAt = completedAt;
      progress.awaitMillisecondsByPhase[phase] =
        (progress.awaitMillisecondsByPhase[phase] ?? 0) + completedAt - requestedAt;
      return result;
    };
    let managedReadPath = display.root.path;
    try {
      const digest = async (bytes: Uint8Array<ArrayBuffer>): Promise<string> =>
        `sha256:${[...new Uint8Array(await observe(8, async () => crypto.subtle.digest('SHA-256', bytes)))].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
      const parent = display.root.path.slice(0, display.root.path.lastIndexOf('/') + 1);
      if (!/^\.tau\/artifacts\/reusable-parts\/[0-9a-f]{64}\/$/u.test(parent)) {
        throw new Error('Scale pin has no canonical managed parent.');
      }
      const rootBytes = await observe(1, async () => capture.readRawBytes(display.root.path));
      if (
        rootBytes.byteLength > 4096 ||
        rootBytes.byteLength !== display.root.byteLength ||
        (await digest(rootBytes)) !== display.root.digest ||
        !capture.isCurrent()
      ) {
        throw new Error('Actual committed root bytes changed before scale preparation.');
      }
      const closureFiles = new Map<
        string,
        { digest: string; byteLength: number; kind: 'root' | 'manifest' | 'chunk' | 'record' | 'glb' | 'native' }
      >();
      closureFiles.set(display.root.path, {
        digest: display.root.digest,
        byteLength: rootBytes.byteLength,
        kind: 'root',
      });
      const decodeRoot = (bytes: Uint8Array<ArrayBuffer>): unknown =>
        JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      const pointer = decodeRoot(rootBytes) as {
        schemaVersion: number;
        generation: number;
        manifest: { path: string; digest: string; byteLength: number };
      };
      const storagePath = (contentDigest: string, extension: string): string =>
        `${parent}roots/sha256/${contentDigest.slice('sha256:'.length)}.${extension}`;
      if (
        pointer.schemaVersion !== 2 ||
        !Number.isSafeInteger(pointer.generation) ||
        pointer.generation < 1 ||
        pointer.manifest.path !== storagePath(pointer.manifest.digest, 'json') ||
        pointer.manifest.byteLength < 1 ||
        pointer.manifest.byteLength > 1_048_576
      ) {
        throw new Error('Scale root pointer is invalid.');
      }
      const readRootAsset = async (
        asset: { path: string; digest: string; byteLength: number },
        kind: 'manifest' | 'chunk',
      ): Promise<Uint8Array<ArrayBuffer>> => {
        if (!capture.isCurrent() || !asset.path.startsWith(parent) || asset.path.split('/').includes('..')) {
          throw new Error('Scale root subject or managed path changed.');
        }
        managedReadPath = asset.path;
        const bytes = await observe(kind === 'manifest' ? 2 : 3, async () => capture.readRawBytes(asset.path));
        if (bytes.byteLength !== asset.byteLength || (await digest(bytes)) !== asset.digest || !capture.isCurrent()) {
          throw new Error('Scale root immutable asset changed.');
        }
        const previous = closureFiles.get(asset.path);
        if (previous && (previous.digest !== asset.digest || previous.byteLength !== bytes.byteLength)) {
          throw new Error('Scale root has conflicting immutable asset identities.');
        }
        closureFiles.set(asset.path, { digest: asset.digest, byteLength: bytes.byteLength, kind });
        return bytes;
      };
      const manifest = decodeRoot(await readRootAsset(pointer.manifest, 'manifest')) as {
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
        throw new Error('Scale root manifest is invalid.');
      }
      const content = new Uint8Array(manifest.content.byteLength);
      let offset = 0;
      for (const chunk of manifest.chunks) {
        const length = Math.min(1_048_576, content.byteLength - offset);
        if (chunk.path !== storagePath(chunk.digest, 'chunk') || chunk.byteLength !== length) {
          throw new Error('Scale root chunk order or length changed.');
        }
        // oxlint-disable-next-line no-await-in-loop -- Bounded ordered chunks are checked under one captured authority.
        content.set(await readRootAsset(chunk, 'chunk'), offset);
        offset += length;
      }
      if ((await digest(content)) !== manifest.content.digest || !capture.isCurrent()) {
        throw new Error('Scale logical root digest or subject changed.');
      }
      // Project references only from checked logical bytes, then check each original asset before timing.
      const rootRecord = decodeRoot(content) as {
        readonly schemaVersion: number;
        readonly parts: Readonly<Record<string, PublishedPartReference>>;
        readonly generation: number;
      };
      if (rootRecord.schemaVersion !== 1 || rootRecord.generation !== pointer.generation) {
        throw new Error('Scale logical root generation changed.');
      }
      const rootReferences = rootRecord.parts;
      const retain = async (
        asset: { path: string; digest: string; byteLength?: number },
        kind: 'record' | 'glb' | 'native',
      ): Promise<void> => {
        if (!capture.isCurrent()) {
          throw new Error('Complete scale closure subject changed before read.');
        }
        const existing = closureFiles.get(asset.path);
        if (existing) {
          if (
            existing.digest !== asset.digest ||
            (asset.byteLength !== undefined && asset.byteLength !== existing.byteLength)
          ) {
            throw new Error('Conflicting scale closure identity.');
          }
          return;
        }
        let bytes: Uint8Array<ArrayBuffer>;
        if (asset.path.startsWith(parent)) {
          managedReadPath = asset.path;
          bytes = await observe(kind === 'record' ? 4 : kind === 'glb' ? 5 : 6, async () =>
            capture.readRawBytes(asset.path),
          );
        } else {
          const original = externalFiles.find((file) => file.path === asset.path);
          if (!original) {
            throw new Error('Original external closure Download is unavailable.');
          }
          bytes = Uint8Array.from(original.bytes);
          if (
            original.digest !== asset.digest ||
            original.byteLength !== bytes.byteLength ||
            (await digest(bytes)) !== original.digest
          ) {
            throw new Error('Original external closure Download differs from the admitted reference.');
          }
        }
        if (
          (asset.byteLength !== undefined && bytes.byteLength !== asset.byteLength) ||
          (await digest(bytes)) !== asset.digest ||
          !capture.isCurrent()
        ) {
          throw new Error('Complete scale closure byte identity changed.');
        }
        closureFiles.set(asset.path, { digest: asset.digest, byteLength: bytes.byteLength, kind });
      };
      const names = Object.keys(display.admitted.publication.parts);
      if (
        names.length !== Object.keys(rootReferences).length ||
        names.some((name) => !Object.hasOwn(rootReferences, name))
      ) {
        throw new Error('Complete scale root references differ from admitted parts.');
      }
      for (const name of names) {
        const reference = rootReferences[name];
        const record = display.admitted.publication.parts[name];
        if (!reference || !record) {
          throw new Error('Actual admitted scale record is unavailable.');
        }
        /* oxlint-disable-next-line no-await-in-loop -- Read the owned immutable closure sequentially with a current-subject fence and bounded retained bytes after each asset. */
        await retain(reference, 'record');
        for (const variant of Object.values(record.variants)) {
          /* oxlint-disable-next-line no-await-in-loop -- Read the owned immutable closure sequentially with a current-subject fence and bounded retained bytes after each asset. */
          await retain(variant.glb, 'glb');
          managedReadPath = variant.glb.path;
          /* oxlint-disable-next-line no-await-in-loop -- Read the owned immutable closure sequentially with a current-subject fence and bounded retained bytes after each asset. */
          const bytes = await observe(7, async () => display.admitted.readAsset(variant.glb.digest));
          /* oxlint-disable-next-line no-await-in-loop -- The current-subject byte check finishes before following the next original asset. */
          const actualDigest = await digest(bytes);
          const captureCurrent = capture.isCurrent();
          if (bytes.byteLength !== variant.glb.byteLength || actualDigest !== variant.glb.digest || !captureCurrent) {
            throw new Error(
              `Actual scale reader byte identity changed. ${JSON.stringify({
                expectedByteLength: variant.glb.byteLength,
                actualByteLength: bytes.byteLength,
                actualDigest,
                digestMatches: actualDigest === variant.glb.digest,
                captureCurrent,
              })}`,
            );
          }
          if (variant.exact) {
            /* oxlint-disable-next-line no-await-in-loop -- Read the owned immutable closure sequentially with a current-subject fence and bounded retained bytes after each asset. */
            await retain(variant.exact.asset, 'native');
          }
        }
      }
      const byteDenominators = {
        files: [...closureFiles.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([path, entry]) => ({ path, ...entry })),
        completeClosureBytes: [...closureFiles.values()].reduce((sum, entry) => sum + entry.byteLength, 0),
        allVariantGlbBytes: [...closureFiles.values()].reduce(
          (sum, entry) => sum + (entry.kind === 'glb' ? entry.byteLength : 0),
          0,
        ),
        partRecordBytes: [...closureFiles.values()].reduce(
          (sum, entry) => sum + (entry.kind === 'record' ? entry.byteLength : 0),
          0,
        ),
        allVariantExactBytes: [...closureFiles.values()].reduce(
          (sum, entry) => sum + (entry.kind === 'native' ? entry.byteLength : 0),
          0,
        ),
        rootBytes: content.byteLength,
        rootPointerBytes: rootBytes.byteLength,
        semantics:
          'unique checked immutable closure bytes, with logical root and pointer lengths separate; physical copy count/read-cache/metadata-object/WASM/GPU memory remains separate',
      };
      const parts = Object.values(display.admitted.publication.parts);
      const sample = Object.values(parts.at(-1)!.variants)[0]!.glb;
      managedReadPath = sample.path;
      const sampleBytes = await observe(9, async () => display.admitted.readAsset(sample.digest));
      if (
        sampleBytes.byteLength !== sample.byteLength ||
        (await digest(sampleBytes)) !== sample.digest ||
        !capture.isCurrent()
      ) {
        throw new Error('Actual admitted scale sample changed during preparation.');
      }
      progress.status = 2;
      return {
        root: display.root,
        generation: rootRecord.generation,
        byteDenominators,
        diagnostics: capture.diagnostics,
        definitions: parts.length,
        occurrences: display.admitted.publication.occurrences.length,
        sampledGlb: { digest: sample.digest, byteLength: sampleBytes.byteLength },
        proof:
          'complete immutable pointer/manifest/ordered-chunk and record/asset byte digest and length checks under the current admitted root; external original references use project-fenced actual Explorer Downloads; semantic admission belongs to the actual host facade',
      };
    } catch (error) {
      progress.status = 3;
      // Diagnostic acquisition must never replace the original rejection, including undefined.
      try {
        let current: ReturnType<NonNullable<typeof bridge>['getCommittedAssembly']> | undefined;
        let secondaryError: string | undefined;
        try {
          current = (
            globalThis as typeof globalThis & { __TAU_SECTION_VIEW_TEST__?: typeof bridge }
          ).__TAU_SECTION_VIEW_TEST__?.getCommittedAssembly();
        } catch (diagnosticError) {
          secondaryError = String(diagnosticError);
        }
        const heldRoot = capture.assemblyDisplay.root;
        const currentRoot = current?.assemblyDisplay?.root;
        let heldIsCurrent: boolean | undefined;
        let currentIsCurrent: boolean | undefined;
        try {
          heldIsCurrent = capture.isCurrent();
          currentIsCurrent = current?.isCurrent();
        } catch (diagnosticError) {
          secondaryError = `${secondaryError ?? ''} ${String(diagnosticError)}`.trim();
        }
        console.error(
          `Scale committed pin read failure ${JSON.stringify({
            managedReadPath,
            held: {
              diagnostics: capture.diagnostics,
              isCurrentAtCapture: heldIsCurrentAtCapture,
              root: { path: heldRoot.path, digest: heldRoot.digest, byteLength: heldRoot.byteLength },
              isCurrent: heldIsCurrent,
            },
            current: current
              ? {
                  diagnostics: current.diagnostics,
                  root: currentRoot && {
                    path: currentRoot.path,
                    digest: currentRoot.digest,
                    byteLength: currentRoot.byteLength,
                  },
                  isCurrent: currentIsCurrent,
                }
              : null,
            heldBridgeIsCurrentGlobal:
              (globalThis as typeof globalThis & { __TAU_SECTION_VIEW_TEST__?: unknown }).__TAU_SECTION_VIEW_TEST__ ===
              bridge,
            secondaryError,
          })}`,
        );
      } catch {
        // Diagnostic getters, serialization and console delivery remain secondary to the failed read.
      }
      throw error;
    }
  }, externalFiles);

// Product preparation controls; this file does not replace the frozen S16 timing/residency report.
for (const workload of [
  { name: 'scale-123', definitions: 123, occurrences: 123, expectedTriangles: 1476 },
  { name: 'scale-10k', definitions: 100, occurrences: 10_000, expectedTriangles: 120_000 },
  { name: 'scale-100k', definitions: 1000, occurrences: 100_000, expectedTriangles: 1_200_000 },
] as const) {
  test(`prepares ${workload.name} through real authored publication and keeps canonical selection`, async () => {
    await target.setViewport({ width: 1920, height: 1080 });
    await target.navigate(`/__e2e/project-file-tree?main=${workload.name}`);
    await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 60_000);
    await target
      .click(selectors.getByRole('button', { name: /^decline$/iu }), { timeout: 5000 })
      .catch(() => undefined);
    await target.waitFor(
      (count) => {
        const bridge = (
          globalThis as typeof globalThis & {
            __TAU_SECTION_VIEW_TEST__?: {
              isGeometryFramed(): boolean;
              getCommittedAssembly(): ReturnType<AssemblyTestBridgeApi['getCommittedAssembly']>;
              getRendererIdentity(): { frame: number };
            };
          }
        ).__TAU_SECTION_VIEW_TEST__;
        const subject = bridge?.getCommittedAssembly();
        return Boolean(
          bridge?.isGeometryFramed() &&
          subject?.isCurrent() &&
          subject.assemblyDisplay?.admitted.publication.occurrences.length === count &&
          bridge.getRendererIdentity().frame > 1,
        );
      },
      workload.occurrences,
      { timeout: 120_000 },
    );
    const pin = await readScaleCommittedPin();
    expect(pin.definitions).toBe(workload.definitions);
    expect(pin.occurrences).toBe(workload.occurrences);
    expect(pin.diagnostics.presentedKey).toBe(pin.root.digest);
    expect(pin.diagnostics.requestedKey).toBe(pin.root.digest);
    const namedCamera =
      workload.name === 'scale-123'
        ? { position: [0.2, 1, 0.2] as const, target: [0.2, 0, 0.2] as const, fov: 30, zoom: 1 }
        : { position: [1.98, 8, 1.98] as const, target: [1.98, 0, 1.98] as const, fov: 30, zoom: 1 };
    await target.evaluate((nextCamera) => {
      const bridge = (
        globalThis as typeof globalThis & {
          __TAU_SECTION_VIEW_TEST__?: {
            setCamera(camera: typeof nextCamera): void;
            setAssemblyDetailCalibration(calibration: unknown): void;
          };
        }
      ).__TAU_SECTION_VIEW_TEST__;
      if (!bridge) {
        throw new Error('The actual scale camera is unavailable.');
      }
      bridge.setAssemblyDetailCalibration(undefined);
      bridge.setCamera(nextCamera);
    }, namedCamera);
    await target.waitFor(
      (expected) => {
        const bridge = (
          globalThis as typeof globalThis & {
            __TAU_SECTION_VIEW_TEST__?: {
              getCommittedDrawInventory(): unknown;
              getCamera(): { position: readonly number[]; target: readonly number[]; requestedFov: number };
            };
          }
        ).__TAU_SECTION_VIEW_TEST__;
        const camera = bridge?.getCamera();
        return Boolean(
          camera &&
          bridge?.getCommittedDrawInventory() &&
          camera.requestedFov === expected.fov &&
          camera.position.every((value, index) => Math.abs(value - expected.position[index]!) < 1e-6) &&
          camera.target.every((value, index) => Math.abs(value - expected.target[index]!) < 1e-6),
        );
      },
      namedCamera,
      { timeout: 30_000 },
    );
    const namedView = await captureScaleViewportEvidence(true);
    expect(namedView.identity.root).toBe(pin.root.digest);
    expect(namedView.triangleUpperBound).toBeGreaterThan(0);
    if (workload.name === 'scale-100k') {
      expect(namedView.triangleUpperBound).toBeLessThanOrEqual(2_000_000);
    }
    await target.screenshot(
      selectors.getByTestId('cad-viewer-canvas-region'),
      `s16-${workload.name}-named-cell-full.png`,
    );
    // This first bounded recording freezes raw target/compositor/heap provenance. It is not a presented-frame verdict.
    const trajectoryBefore = await captureScaleViewportEvidence();
    expect(trajectoryBefore.identity.root).toBe(pin.root.digest);
    const profile10k = workload.name === 'scale-10k' && inject('scaleCpuDiagnostic');
    if (profile10k) {
      await target.startCpuProfile('primary');
    }
    let cpuProfile: string | undefined;
    let probeFailed = false;
    let probeFailure: unknown;
    let stopFailed = false;
    let stopFailure: unknown;
    let sampled: Awaited<ReturnType<typeof target.scalePresentationProbe>> | undefined;
    try {
      sampled = await target.scalePresentationProbe(
        `s16-${workload.name}-named-cell`,
        'primary',
        workload.name === 'scale-10k' ? { traceFormat: 'proto', inputLineage: true } : undefined,
      );
    } catch (error) {
      probeFailed = true;
      probeFailure = error;
    } finally {
      if (profile10k) {
        try {
          cpuProfile = await target.stopCpuProfile('s16-scale-10k-named-cell-ui.cpuprofile', 'primary');
        } catch (error) {
          stopFailed = true;
          stopFailure = error;
        }
      }
    }
    if (probeFailed) {
      throw probeFailure;
    }
    if (stopFailed) {
      throw stopFailure;
    }
    if (!sampled) {
      throw new Error('The scale presentation probe returned no result.');
    }
    const probe = sampled;
    expect(probe.traceBytes).toBeGreaterThan(0);
    expect(probe.dataLossOccurred).toBe(false);
    expect(probe.presentationQualification).toBe('raw-probe-only');
    // Trusted camera motion may replace a candidate at the same root/revision; reacquire the actual current bundle.
    const trajectoryView = await captureScaleViewportEvidence();
    expect(trajectoryView.identity.root).toBe(pin.root.digest);
    const { candidateSceneId: beforeCandidate, ...heldBefore } = trajectoryBefore.identity;
    const { candidateSceneId: afterCandidate, ...heldAfter } = trajectoryView.identity;
    expect(heldAfter).toEqual(heldBefore);
    await target.writeArtifact(
      `s16-${workload.name}-trajectory-current.json`,
      JSON.stringify(
        {
          probe,
          cpuProfileDiagnostic: profile10k
            ? {
                artifact: cpuProfile,
                scope: 'selected primary page isolate only; diagnostic sampling, not a memory or GPU verdict',
              }
            : undefined,
          trajectoryBefore,
          trajectoryView,
          candidateBoundary: { before: beforeCandidate, after: afterCandidate },
        },
        undefined,
        2,
      ),
    );
    await target.evaluate((nextCamera) => {
      const bridge = (
        globalThis as typeof globalThis & { __TAU_SECTION_VIEW_TEST__?: { setCamera(camera: typeof nextCamera): void } }
      ).__TAU_SECTION_VIEW_TEST__;
      if (!bridge) {
        throw new Error('Scale camera is unavailable after trusted trajectory.');
      }
      bridge.setCamera(nextCamera);
    }, namedCamera);
    await target.waitFor(
      (expected) => {
        const bridge = (
          globalThis as typeof globalThis & {
            __TAU_SECTION_VIEW_TEST__?: {
              getCamera(): { position: readonly number[]; target: readonly number[] };
              getCommittedDrawInventory(): unknown;
            };
          }
        ).__TAU_SECTION_VIEW_TEST__;
        const camera = bridge?.getCamera();
        return Boolean(
          camera &&
          bridge?.getCommittedDrawInventory() &&
          camera.position.every((value, index) => Math.abs(value - expected.position[index]!) < 1e-6) &&
          camera.target.every((value, index) => Math.abs(value - expected.target[index]!) < 1e-6),
        );
      },
      namedCamera,
      { timeout: 30_000 },
    );
    const afterNamedView = await captureScaleViewportEvidence(true);
    expect(afterNamedView.identity.root).toBe(namedView.identity.root);
    expect(afterNamedView.identity.unitId).toBe(namedView.identity.unitId);
    expect(afterNamedView.identity.poseRevision).toBe(namedView.identity.poseRevision);
    expect(afterNamedView.camera).toEqual(namedView.camera);
    await target.writeArtifact(
      `s16-${workload.name}-named-cell-full.json`,
      JSON.stringify(
        {
          status: 'finite named-view diagnostic; not timing, GPU-submission, raster-coverage or full S16 acceptance',
          workload,
          namedCamera,
          before: namedView,
          after: afterNamedView,
          renderDeviceQualification: 'UNQUALIFIED_ACTUAL_MOUNTED_RAW_IDENTITY_REQUIRES_REFERENCE_HARDWARE_REVIEW',
          nativeIdentitySemantics:
            'Native context/device reads occur only in the two named-view boundaries outside the raw trusted-input interval. Each fences its current candidate/canvas; camera demand may legitimately replace the candidate between boundaries.',
          triangleSemantics:
            'frustumSurfaceTriangleUpperBound plus all resident mandatory-edge triangles is conservative draw-eligible inventory; actual raster submissions/uploads remain unmeasured',
        },
        undefined,
        2,
      ),
    );
    if (workload.name === 'scale-123') {
      // Reuse the Model owner's explicit worker warm-up, then measure newly visible automatic demand.
      await target.click(selectors.getByRole('button', { name: 'Search', exact: true }));
      await target.fill(selectors.getByPlaceholder('Search projects, chats, and actions…'), 'Open model structure');
      await target.keyboardPress('Enter');
      const filter = selectors.getByRole('searchbox', { name: 'Filter parts' });
      await target.expectVisible(filter, 30_000);
      const previewDenominator = await target.evaluate((root) => {
        const bridge = (
          globalThis as typeof globalThis & {
            __TAU_SECTION_VIEW_TEST__?: {
              getCommittedAssembly(): ReturnType<AssemblyTestBridgeApi['getCommittedAssembly']>;
              getModelComponents(): Array<{
                id: string;
                name: string;
                kind: string | undefined;
                primitiveReferenceCount: number;
              }>;
            };
          }
        ).__TAU_SECTION_VIEW_TEST__;
        const subject = bridge?.getCommittedAssembly();
        const components = bridge?.getModelComponents() ?? [];
        const eligibleComponents = components.filter(
          ({ kind, primitiveReferenceCount }) => kind === 'part' && primitiveReferenceCount > 0,
        );
        const component = eligibleComponents.find(({ name }) => name === 'Shape 1');
        const wrapper = components.find(({ name }) => name === 'o000000');
        if (
          !subject?.isCurrent() ||
          subject.assemblyDisplay?.root.digest !== root ||
          subject.diagnostics.presentedKey !== root ||
          !component ||
          !wrapper
        ) {
          throw new Error('The authored scale definition preview is unavailable under the current pin.');
        }
        return {
          root,
          presentedKey: subject.diagnostics.presentedKey,
          components,
          eligibleComponentIds: eligibleComponents.map(({ id }) => id),
          modelComponentCount: components.length,
          eligibleComponentCount: eligibleComponents.length,
          component,
          wrapper,
        };
      }, pin.root.digest);
      await target.writeArtifact('s16-123-preview-denominator.json', JSON.stringify(previewDenominator, undefined, 2));
      expect(new Set(previewDenominator.components.map(({ id }) => id)).size).toBe(
        previewDenominator.modelComponentCount,
      );
      expect(previewDenominator.eligibleComponentCount).toBe(workload.occurrences);
      expect(previewDenominator.component.kind).toBe('part');
      expect(previewDenominator.component.primitiveReferenceCount).toBeGreaterThan(0);
      expect(previewDenominator.wrapper.kind).toBe('part');
      expect(previewDenominator.wrapper.primitiveReferenceCount).toBe(0);
      expect(previewDenominator.eligibleComponentIds).not.toContain(previewDenominator.wrapper.id);
      const previewComponentId = previewDenominator.component.id;
      const previewRow = selectors.getByCss(
        `[data-model-component-row][data-model-component-id=${JSON.stringify(previewComponentId)}]`,
      );
      await target.click(previewRow.getByCss('[data-model-part-button]'));
      await target.expectVisible(previewRow.getByCss('[data-slot="material-swatch"]'));
      await target.click(previewRow.getByRole('button', { name: 'Actions for Shape 1', exact: true }));
      await target.waitFor(
        (id) => {
          const row = [...document.querySelectorAll<HTMLElement>('[data-model-component-row]')].find(
            (element) => element.dataset['modelComponentId'] === id,
          );
          const image = row?.querySelector('img');
          const failed = document.querySelector('[role="alert"][aria-label="Preview status"]');
          return (
            (image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0) ||
            failed?.textContent.includes('Preview unavailable')
          );
        },
        previewComponentId,
        { timeout: 30_000 },
      );
      const previewDecoded = await target.evaluate((id) => {
        const row = [...document.querySelectorAll<HTMLElement>('[data-model-component-row]')].find(
          (element) => element.dataset['modelComponentId'] === id,
        );
        const image = row?.querySelector('img');
        return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
      }, previewComponentId);
      await (previewDecoded
        ? target.keyboardPress('Escape')
        : target.click(selectors.getByRole('menuitem', { name: 'Retry preview' })));
      await target.waitFor(
        (id) => {
          const row = [...document.querySelectorAll<HTMLElement>('[data-model-component-row]')].find(
            (element) => element.dataset['modelComponentId'] === id,
          );
          const image = row?.querySelector('img[src^="blob:"]');
          return (
            image instanceof HTMLImageElement &&
            image.complete &&
            image.naturalWidth === 1536 &&
            image.naturalHeight === 1536
          );
        },
        previewComponentId,
        { timeout: 30_000 },
      );
      await target.fill(filter, 'tau-s16-no-matching-row');
      const recording = target.evaluate(async (denominator) => {
        const bridge = (
          globalThis as typeof globalThis & {
            __TAU_SECTION_VIEW_TEST__?: {
              getCommittedAssembly(): ReturnType<AssemblyTestBridgeApi['getCommittedAssembly']>;
              getModelComponents(): Array<{
                id: string;
                name: string;
                kind: string | undefined;
                primitiveReferenceCount: number;
              }>;
            };
          }
        ).__TAU_SECTION_VIEW_TEST__;
        if (!bridge) {
          throw new Error('Actual Model preview denominator is unavailable.');
        }
        const componentIds = new Set(denominator.components.map(({ id }) => id));
        const eligibleIds = new Set(denominator.eligibleComponentIds);
        const input = document.querySelector<HTMLInputElement>('[aria-label="Filter parts"]');
        if (!input) {
          throw new Error('Actual Model filter is unavailable.');
        }
        performance.clearMarks('tau-s16-warm-ready');
        performance.clearMarks('tau-s16-warm-input');
        const abort = new AbortController();
        let raf = 0;
        let startedAt: number | undefined;
        const setupAt = performance.now();
        input.addEventListener(
          'input',
          (event) => {
            if (event.isTrusted && input.value === '') {
              startedAt = event.timeStamp;
              performance.mark('tau-s16-warm-input', { detail: { startedAt } });
            }
          },
          { signal: abort.signal },
        );
        performance.mark('tau-s16-warm-ready');
        try {
          return await new Promise<{
            decodedAt: number;
            startedAt: number;
            visibleRows: readonly string[];
            eligibleVisibleRows: readonly string[];
            excludedVisibleRows: readonly string[];
          }>((resolve, reject) => {
            const sample = (): void => {
              if (performance.now() - setupAt > 30_000) {
                reject(new Error('Actual warm visible rows did not decode.'));
                return;
              }
              const rows = [...document.querySelectorAll<HTMLElement>('[data-model-component-row]')].filter((row) => {
                const rect = row.getBoundingClientRect();
                const parent = row.closest('[role="list"]')?.getBoundingClientRect();
                return (
                  parent && rect.width > 0 && rect.height > 0 && rect.bottom > parent.top && rect.top < parent.bottom
                );
              });
              const visibleRows = rows.map((row) => row.dataset['modelComponentId'] ?? '');
              if (visibleRows.some((id) => !componentIds.has(id))) {
                reject(new Error('Actual visible Model row is outside the captured canonical components.'));
                return;
              }
              const eligibleRows = rows.filter((row) => eligibleIds.has(row.dataset['modelComponentId'] ?? ''));
              if (
                startedAt !== undefined &&
                eligibleRows.length > 0 &&
                eligibleRows.every((row) => {
                  const image = row.querySelector<HTMLImageElement>('img[src^="blob:"]');
                  return image?.complete && image.naturalWidth === 1536 && image.naturalHeight === 1536;
                })
              ) {
                const subject = bridge.getCommittedAssembly();
                const currentComponents = bridge.getModelComponents();
                if (
                  (globalThis as typeof globalThis & { __TAU_SECTION_VIEW_TEST__?: unknown })
                    .__TAU_SECTION_VIEW_TEST__ !== bridge ||
                  !subject.isCurrent() ||
                  subject.assemblyDisplay?.root.digest !== denominator.root ||
                  subject.diagnostics.presentedKey !== denominator.presentedKey ||
                  currentComponents.length !== denominator.components.length ||
                  currentComponents.some((component, index) => {
                    const captured = denominator.components[index];
                    return (
                      !captured ||
                      component.id !== captured.id ||
                      component.kind !== captured.kind ||
                      component.primitiveReferenceCount !== captured.primitiveReferenceCount
                    );
                  })
                ) {
                  reject(new Error('Actual Model preview denominator changed under the captured pin.'));
                  return;
                }
                resolve({
                  startedAt,
                  decodedAt: performance.now(),
                  visibleRows,
                  eligibleVisibleRows: eligibleRows.map((row) => row.dataset['modelComponentId'] ?? ''),
                  excludedVisibleRows: visibleRows.filter((id) => !eligibleIds.has(id)),
                });
                return;
              }
              raf = requestAnimationFrame(sample);
            };
            raf = requestAnimationFrame(sample);
          });
        } finally {
          cancelAnimationFrame(raf);
          abort.abort();
          performance.clearMarks('tau-s16-warm-ready');
        }
      }, previewDenominator);
      const observed = Promise.allSettled([recording]);
      await target.waitFor(() => performance.getEntriesByName('tau-s16-warm-ready').length > 0);
      await target.fill(filter, '');
      const [decoded] = await observed;
      if (decoded.status === 'rejected') {
        const error: unknown = decoded.reason;
        throw error;
      }
      await target.screenshot(
        selectors.getByRole('list', { name: /^Model components for /u }),
        's16-123-warm-visible-model.png',
      );
      const capturedAt = await target.evaluate(() => performance.now());
      const warmPreviewPixelCaptureUpperBoundMilliseconds = capturedAt - decoded.value.startedAt;
      await target.writeArtifact(
        's16-123-warm-visible-model.json',
        JSON.stringify(
          {
            ...previewDenominator,
            ...decoded.value,
            capturedAt,
            warmPreviewPixelCaptureUpperBoundMilliseconds,
            semantics:
              'trusted filter clear through all nonempty visible part rows with actual primitive references decoded at 1536px to completed screenshot; full visible and excluded canonical IDs retained under the current pin; screenshot content requires inspection; no cold-start claim',
          },
          undefined,
          2,
        ),
      );
      expect(warmPreviewPixelCaptureUpperBoundMilliseconds).toBeLessThanOrEqual(250);
    }
    const before = await target.evaluate(() => {
      const bridge = (
        globalThis as typeof globalThis & {
          __TAU_SECTION_VIEW_TEST__?: {
            getModelComponents(): Array<{ id: string; name: string }>;
            getCommittedAssembly(): ReturnType<AssemblyTestBridgeApi['getCommittedAssembly']>;
            getRendererIdentity(): { api: string; name: string; frame: number };
            isolateModelComponent(id: string): void;
            getCommittedDrawInventory(): ReturnType<AssemblyTestBridgeApi['getCommittedDrawInventory']>;
          };
        }
      ).__TAU_SECTION_VIEW_TEST__;
      if (!bridge) {
        throw new Error('Actual scale presentation is unavailable.');
      }
      const subject = bridge.getCommittedAssembly();
      if (!subject.isCurrent() || !subject.assemblyDisplay) {
        throw new Error('Actual scale publication is unavailable.');
      }
      const { occurrences } = subject.assemblyDisplay.admitted.publication;
      const components = bridge.getModelComponents();
      const draw = bridge.getCommittedDrawInventory();
      if (!draw || draw.key !== subject.assemblyDisplay.root.digest) {
        throw new Error('Actual scale draw is unavailable.');
      }
      const visibleSurfaceIds = new Set(
        draw.surfaces
          .filter(({ visible, projection }) => visible && projection.intersectsFrustum)
          .map(({ componentId }) => componentId),
      );
      const selected = components.find(({ id }) => visibleSurfaceIds.has(id));
      if (!selected) {
        throw new Error('Scale selection evidence is missing.');
      }
      bridge.isolateModelComponent(selected.id);
      return {
        count: occurrences.length,
        uniqueIds: new Set(occurrences.map(({ id }) => id)).size,
        hierarchyComponentCount: components.length,
        selectedId: selected.id,
        key: draw.key,
        unitId: draw.unitId,
        poseRevision: draw.poseRevision,
        renderer: bridge.getRendererIdentity(),
        dpr: devicePixelRatio,
      };
    });
    expect(before.count).toBe(workload.occurrences);
    expect(before.uniqueIds).toBe(workload.occurrences);
    expect(before.dpr).toBe(1);
    await target.waitFor((expected) => {
      const bridge = (globalThis as typeof globalThis & { __TAU_SECTION_VIEW_TEST__?: AssemblyTestBridgeApi })
        .__TAU_SECTION_VIEW_TEST__;
      const subject = bridge?.getCommittedAssembly();
      const draw = bridge?.getCommittedDrawInventory();
      if (
        !subject?.isCurrent() ||
        !draw ||
        draw.key !== expected.key ||
        draw.unitId !== expected.unitId ||
        draw.poseRevision !== expected.poseRevision
      ) {
        return false;
      }
      const visibleIds = [
        ...new Set(draw.surfaces.filter(({ visible }) => visible).map(({ componentId }) => componentId)),
      ];
      return visibleIds.length === 1 && visibleIds[0] === expected.selectedId;
    }, before);
    const selected = await target.evaluate((expected) => {
      const bridge = (
        globalThis as typeof globalThis & {
          __TAU_SECTION_VIEW_TEST__?: {
            getCommittedAssembly(): ReturnType<AssemblyTestBridgeApi['getCommittedAssembly']>;
            getCommittedDrawInventory(): ReturnType<AssemblyTestBridgeApi['getCommittedDrawInventory']>;
            resetModelVisibility(): void;
          };
        }
      ).__TAU_SECTION_VIEW_TEST__;
      if (!bridge) {
        throw new Error('Actual scale selection bridge is unavailable.');
      }
      try {
        const subject = bridge.getCommittedAssembly();
        const draw = bridge.getCommittedDrawInventory();
        if (
          !subject.isCurrent() ||
          !draw ||
          draw.key !== expected.key ||
          draw.unitId !== expected.unitId ||
          draw.poseRevision !== expected.poseRevision
        ) {
          throw new Error('Actual scale isolated draw retired.');
        }
        const surfaces = draw.surfaces.filter(({ componentId }) => componentId === expected.selectedId);
        return {
          surfaceCount: surfaces.length,
          visibleSurfaceCount: surfaces.filter(({ visible }) => visible).length,
          visibleIds: [
            ...new Set(draw.surfaces.filter(({ visible }) => visible).map(({ componentId }) => componentId)),
          ],
          key: draw.key,
          unitId: draw.unitId,
          poseRevision: draw.poseRevision,
        };
      } finally {
        bridge.resetModelVisibility();
      }
    }, before);
    expect(selected.surfaceCount).toBeGreaterThan(0);
    expect(selected.visibleSurfaceCount).toBeGreaterThan(0);
    expect(selected.visibleIds).toEqual([before.selectedId]);
    await target.writeArtifact(
      `s16-${workload.name}-preparation.json`,
      JSON.stringify(
        {
          status: 'product preparation only; actual immutable closure and qualification measurements still required',
          workload,
          committedPin: pin,
          presented: before,
          selected,
          viewport: [1920, 1080],
          profile: target.currentWebGpuProfile(),
          gates: {
            warm123VisiblePreviewMilliseconds: 250,
            frameP95Milliseconds: 16.7,
            inputP95Milliseconds: 50,
            maxVisibleTriangles: 2_000_000,
          },
          unmeasured: [
            'actual GLB triangles and bytes',
            'complete immutable record/digest closure (root and one actual-reader GLB sample checked)',
            'metadata/read-cache/current+candidate CPU/GPU bytes',
            'warm preview/frame/input timing',
            'warehouse cell eviction/LOD and selected full-evidence demand',
            'source-free restart and cross-host pin admission',
          ],
          excludedClaims: [
            'complex CAD corpus',
            'material/texture/translucency axes',
            'native/exact STEP',
            'mechanisms',
          ],
        },
        undefined,
        2,
      ),
    );
    await target.screenshot(selectors.getByTestId('cad-viewer-canvas-region'), `s16-${workload.name}-preparation.png`);
  });
}

// Actual product calibration is staged: collect real imagery first, then replay one explicitly reviewed policy
// on the complete warehouse. The fixture/config cannot turn a provisional policy into a production default.
type MixedOwnedActivity = Readonly<{
  telemetryEntries: readonly TelemetrySpanRecord[];
  lastRequestedRenderId: number;
  lastSettledRenderId: number;
  document?: Readonly<{
    documentId?: string;
    evaluationId: string;
    requestId: string;
    key: string;
    sourceFiles: Readonly<Record<string, string>>;
  }>;
  displayedDocument?: MixedOwnedActivity['document'];
  owner?: Readonly<{
    entryPath: string;
    actorSessionId: string;
    state: 'idle' | 'parked';
    fileSystemRoot: string;
    committedKey: string;
  }>;
}>;
type S15BridgeWindow = typeof globalThis & {
  __TAU_SECTION_VIEW_TEST__?: Omit<AssemblyTestBridgeApi, 'getCadActivity'> & {
    getCadActivity(options?: Readonly<{ entryPath: string }>): MixedOwnedActivity | undefined;
    getLiveAssemblyResourceInventory(): S16LiveAssemblyResources | undefined;
    armAssemblyAdmissionResourceInventory(): boolean;
    takeAssemblyAdmissionResourceInventory():
      | Readonly<{
          held: Readonly<{ key: string; sceneId: string; revision: number; unitId: string; poseRevision: number }>;
          resources: S16LiveAssemblyResources;
        }>
      | undefined;
    clearAssemblyAdmissionResourceInventory(): void;
    getRequestedAssemblyPreparation():
      | Readonly<{
          revision: number;
          phase: string;
          requestedAssetReads: number;
          completedAssetReads: number;
        }>
      | undefined;
    getTaggedResourceInventory():
      | Readonly<{
          measurementUi: S16TaggedResourceCounts;
          sectionViewHelper: S16TaggedResourceCounts;
          union: S16TaggedResourceCounts;
        }>
      | undefined;
  };
};
const readMixedCadSubject = async () =>
  target.evaluate(() => {
    const bridge = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__;
    const subject = bridge?.getCommittedAssembly();
    const activity = bridge?.getCadActivity();
    if (!bridge || !subject || !activity) {
      throw new Error('The mounted mixed CAD activity authority is unavailable.');
    }
    return {
      diagnostics: subject.diagnostics,
      activity,
      pairedActivity: {
        main: bridge.getCadActivity({ entryPath: 'main.ts' }),
        assembly: bridge.getCadActivity({ entryPath: 'assembly.json' }),
      },
      root: subject.assemblyDisplay?.root,
      publication: subject.assemblyDisplay?.admitted.publication,
      draw: bridge.getCommittedDrawInventory(),
      components: bridge.getModelComponents(),
      renderFrame: bridge.getRenderFrame(),
      assemblyCurrent: subject.isCurrent(),
      camera: bridge.getCamera(),
      renderer: bridge.getRendererIdentity(),
      timeOrigin: performance.timeOrigin,
      observedAt: performance.now(),
    };
  });

type S15Policy = Parameters<AssemblyTestBridgeApi['setAssemblyDetailCalibration']>[0];

const readS15State = async () =>
  target.evaluate(() => {
    const bridge = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__;
    const subject = bridge?.getCommittedAssembly();
    const inventory = bridge?.getCommittedDrawInventory();
    if (
      !bridge ||
      !subject?.assemblyDisplay ||
      !subject.isCurrent() ||
      !inventory ||
      inventory.key !== subject.assemblyDisplay.root.digest
    ) {
      throw new Error('S15 requires an actual coherent committed subject.');
    }
    const resources = bridge.getAssemblyResourceTelemetry();
    const matching = resources.filter(({ detail }) => detail?.['candidateSceneId'] === inventory.candidateSceneId);
    const components = bridge.getModelComponents();
    const surfaceIds = new Set(inventory.surfaces.map(({ componentId }) => componentId));
    const { canonicalComponents: _canonicalComponents, mechanism: _mechanism, ...drawInventory } = inventory;
    const result = {
      root: subject.assemblyDisplay.root,
      definitions: Object.keys(subject.assemblyDisplay.admitted.publication.parts).length,
      occurrences: subject.assemblyDisplay.admitted.publication.occurrences.length,
      componentCount: components.length,
      uniqueComponentCount: new Set(components.map(({ id }) => id)).size,
      componentNames: components.filter(({ id }) => surfaceIds.has(id)).map(({ id, name }) => ({ id, name })),
      inventory: drawInventory,
      camera: bridge.getCamera(),
      renderer: bridge.getRendererIdentity(),
      environment: {
        dpr: devicePixelRatio,
        userAgent: navigator.userAgent,
        hardwareConcurrency: navigator.hardwareConcurrency,
      },
      selected: bridge.getModelHoverState().selectedComponentIds ?? [],
      resources: matching,
    };
    const current = bridge.getCommittedDrawInventory();
    if (
      !subject.isCurrent() ||
      current?.candidateSceneId !== inventory.candidateSceneId ||
      current.unitId !== inventory.unitId ||
      current.poseRevision !== inventory.poseRevision
    ) {
      throw new Error('S15 subject/candidate/unit/pose changed while reading calibration evidence.');
    }
    return result;
  });
type S15State = Awaited<ReturnType<typeof readS15State>>;

const s15Number = (state: S15State, name: string): number => {
  const value = state.resources.at(-1)?.detail?.[name];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`S15 actual inventory is missing ${name}.`);
  }
  return value;
};
const s15Identity = (state: S15State) => ({
  root: state.root.digest,
  unit: state.inventory.unitId,
  pose: state.inventory.poseRevision,
});
const s15DrawIds = (state: S15State) =>
  state.inventory.surfaces
    .map(({ componentId, drawGeometryId }) => [componentId, drawGeometryId] as const)
    .sort(([a], [b]) => a.localeCompare(b));
const s15Edges = (state: S15State) =>
  state.inventory.edges
    .flatMap(({ segments }) => segments.map(({ componentId, count }) => [componentId, count]))
    .sort(([a], [b]) => String(a).localeCompare(String(b)));

function s15Footprint(state: S15State) {
  const rows = state.inventory.surfaces.filter(
    ({ visible, projection }) => visible && projection.intersectsFrustum && projection.finiteProjection,
  );
  const projected = rows.map(({ componentId, projection }) => {
    const minX = Math.max(0, Math.min(...projection.corners.map(({ x }) => x)));
    const minY = Math.max(0, Math.min(...projection.corners.map(({ y }) => y)));
    const maxX = Math.min(state.inventory.canvas.cssWidth, Math.max(...projection.corners.map(({ x }) => x)));
    const maxY = Math.min(state.inventory.canvas.cssHeight, Math.max(...projection.corners.map(({ y }) => y)));
    return {
      componentId,
      minX,
      minY,
      maxX,
      maxY,
      clippedAabbCssPixelArea: Math.max(0, maxX - minX) * Math.max(0, maxY - minY),
    };
  });
  expect(projected.some(({ clippedAabbCssPixelArea }) => clippedAabbCssPixelArea > 0)).toBe(true);
  return {
    canvas: state.inventory.canvas,
    projected,
    meaning: 'Actual current-camera canonical AABB footprint; neither raster coverage nor occlusion/submission proof.',
  };
}

async function waitS15Current(): Promise<void> {
  await target.waitFor(
    () => {
      const bridge = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__;
      const subject = bridge?.getCommittedAssembly();
      const inventory = bridge?.getCommittedDrawInventory();
      return Boolean(
        subject?.isCurrent() &&
        inventory &&
        bridge
          ?.getAssemblyResourceTelemetry()
          .some(({ detail }) => detail?.['candidateSceneId'] === inventory.candidateSceneId),
      );
    },
    undefined,
    { timeout: 120_000 },
  );
}
async function openS15(
  fixture: string | Readonly<{ completedDestination: string }>,
  backend: 'webgl' | 'webgpu',
  camera: AssemblyTestCamera,
): Promise<S15State> {
  await target.setViewport({ width: 1920, height: 1080 });
  await target.navigate(
    typeof fixture === 'string'
      ? `/__e2e/project-file-tree?main=${fixture}&graphicsBackend=${backend}`
      : fixture.completedDestination,
  );
  await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 60_000);
  await target.click(selectors.getByRole('button', { name: /^decline$/iu }), { timeout: 5000 }).catch(() => undefined);
  await target.expectGeometryFramed();
  await target.expectGraphicsBackend(backend);
  await target.evaluate((next) => {
    const bridge = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__;
    if (!bridge) {
      throw new Error('The existing S15 camera/calibration owner is unavailable.');
    }
    bridge.setAssemblyDetailCalibration(undefined);
    bridge.setCamera(next);
  }, camera);
  await target.waitFor(
    (expected) => {
      const bridge = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__;
      const actual = bridge?.getCamera();
      return Boolean(
        actual &&
        actual.requestedFov === expected.fov &&
        actual.position.every((value, axis) => Math.abs(value - expected.position[axis]!) < 1e-6) &&
        actual.target.every((value, axis) => Math.abs(value - expected.target![axis]!) < 1e-6),
      );
    },
    camera,
    { timeout: 30_000 },
  );
  await waitS15Current();
  const state = await readS15State();
  expect(state.environment.dpr).toBe(1);
  return state;
}
async function setS15Policy(policy: S15Policy, previous: S15State): Promise<S15State> {
  await target.evaluate((next) => {
    const bridge = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__;
    if (!bridge) {
      throw new Error('The actual private detail option owner is unavailable.');
    }
    bridge.setAssemblyDetailCalibration(next);
  }, policy);
  await target.waitFor(
    (old) => {
      const current = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__?.getCommittedDrawInventory();
      return Boolean(current && current.candidateSceneId !== old);
    },
    previous.inventory.candidateSceneId,
    { timeout: 60_000 },
  );
  await waitS15Current();
  const current = await readS15State();
  expect(s15Identity(current)).toEqual(s15Identity(previous));
  expect(current.camera).toEqual(previous.camera);
  expect(s15Edges(current)).toEqual(s15Edges(previous));
  return current;
}
async function captureS15Frame(name: string, held: S15State) {
  // Existing runtime-r20 concern invalidates one real frame and observes actual draw callbacks outside timing.
  // Its incomplete binding subset is retained as such, never treated as all uploads/resident GPU memory.
  const drawBarrier = await target.evaluate(async (expected) => {
    const bridge = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__;
    const capture = bridge?.getCommittedDrawInventory();
    if (!bridge || !capture || capture.candidateSceneId !== expected) {
      throw new Error('Screenshot candidate retired before actual draw observation.');
    }
    const observed = await bridge.observeBackendBindings();
    if (bridge.getCommittedDrawInventory()?.candidateSceneId !== expected) {
      throw new Error('Screenshot candidate retired during actual draw observation.');
    }
    return observed;
  }, held.inventory.candidateSceneId);
  await target.writeArtifact(
    name.replace(/\.png$/u, '.draw-observation.json'),
    JSON.stringify(drawBarrier, undefined, 2),
  );
  const image = await target.screenshot(selectors.getByTestId('cad-viewer-canvas-region'), name);
  const after = await readS15State();
  expect(s15Identity(after)).toEqual(s15Identity(held));
  expect(after.inventory.candidateSceneId).toBe(held.inventory.candidateSceneId);
  expect(after.camera).toEqual(held.camera);
  return image;
}
async function openS15ModelPane(): Promise<void> {
  await target.click(selectors.getByRole('button', { name: 'Search', exact: true }));
  await target.fill(selectors.getByPlaceholder('Search projects, chats, and actions…'), 'Open model structure');
  await target.click(selectors.getByText('Open model structure', { exact: true }));
  await target.waitFor(() => {
    const bridge = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__;
    const inventory = bridge?.getCommittedDrawInventory();
    return Boolean(
      bridge &&
      inventory &&
      Math.abs(bridge.getCamera().aspect - inventory.canvas.cssWidth / inventory.canvas.cssHeight) < 1e-6,
    );
  });
  await waitS15Current();
}
const s15Row = (id: string) =>
  selectors.getByCss(
    `[data-model-component-row][data-model-component-id=${JSON.stringify(id)}] button[data-model-part-button]`,
  );

const s15QualityCamera = { position: [0.15, -0.65, 0.45], target: [0.15, 0, 0], fov: 30, zoom: 1 } as const;
const s15DistantQualityCamera = { position: [0.15, -6.5, 4.5], target: [0.15, 0, 0], fov: 30, zoom: 1 } as const;
const s15WarehouseCamera = { position: [1.98, 8, 1.98], target: [1.98, 0, 1.98], fov: 30, zoom: 1 } as const;

for (const backend of ['webgl', 'webgpu'] as const) {
  test(`S15 calibration records real curved full-detail pixels and observed hysteresis on ${backend}`, async () => {
    await openS15('scale-detail-calibration', backend, s15QualityCamera);
    await openS15ModelPane();
    const full = await readS15State();
    const pin = await readScaleCommittedPin();
    expect(pin.root.digest).toBe(full.root.digest);
    expect(pin.definitions).toBe(2);
    expect(pin.occurrences).toBe(2);
    const originalGlbs = await target.evaluate(async (expected) => {
      const bridge = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__;
      const subject = bridge?.getCommittedAssembly();
      if (
        !subject?.assemblyDisplay ||
        !subject.isCurrent() ||
        subject.assemblyDisplay.root.digest !== expected.root.digest
      ) {
        throw new Error('Curved acquisition lost its exact admitted pin.');
      }
      const files = [];
      for (const file of expected.byteDenominators.files.filter(({ kind }) => kind === 'glb')) {
        // oxlint-disable-next-line no-await-in-loop -- Retain the two exact original assets sequentially under one captured authority.
        const bytes = await subject.readRawBytes(file.path);
        // oxlint-disable-next-line no-await-in-loop -- Each immutable byte digest is checked before retaining the next asset.
        const digest = `sha256:${[...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
        if (bytes.byteLength !== file.byteLength || digest !== file.digest || !subject.isCurrent()) {
          throw new Error('Curved original GLB bytes differ from the checked pin.');
        }
        files.push({ path: file.path, digest, byteLength: bytes.byteLength, bytes: [...bytes] });
      }
      if (!subject.isCurrent()) {
        throw new Error('Curved acquisition subject retired.');
      }
      return { root: expected.root, diagnostics: subject.diagnostics, files };
    }, pin);
    expect(originalGlbs.files).toHaveLength(2);
    const { projectId } = pin.diagnostics;
    if (!projectId) {
      throw new Error('Curved artifact acquisition lost its actual project identity.');
    }
    await target.writeArtifact(
      `s15-${backend}-${projectId}-curved-original-glbs.json`,
      JSON.stringify(
        {
          ...originalGlbs,
          files: originalGlbs.files.map(({ bytes, ...file }) => ({
            ...file,
            base64: uint8ArrayToBase64(Uint8Array.from(bytes)),
          })),
        },
        undefined,
        2,
      ),
    );
    expect(full.definitions).toBe(2);
    expect(full.occurrences).toBe(2);
    expect(
      full.inventory.surfaces.every(
        ({ canonicalGeometryId, drawGeometryId }) => canonicalGeometryId === drawGeometryId,
      ),
    ).toBe(true);
    expect(
      full.inventory.surfaces.some(({ projection }) => projection.intersectsFrustum && projection.finiteProjection),
    ).toBe(true);
    const first = await captureS15Frame(`s15-${backend}-curved-full.png`, full);
    const repeated = await captureS15Frame(`s15-${backend}-curved-full-repeat.png`, full);
    // Diagnostic bootstrap exposes every eligible derived level. It is explicitly not a quality tolerance/default.
    const pilotPolicy = {
      triangleRatio: 0.5,
      approximateRelativeError: 0.05,
      screenSpace: { maxApproximatePixelError: Number.MAX_VALUE, enterDetailRatio: 0.6 },
    };
    const pilot = await setS15Policy(pilotPolicy, full);
    const fullTriangles = full.inventory.surfaces.reduce((sum, { drawTriangles }) => sum + drawTriangles, 0);
    const detailTriangles = pilot.inventory.surfaces.reduce((sum, { drawTriangles }) => sum + drawTriangles, 0);
    expect(detailTriangles).toBeGreaterThan(0);
    expect(detailTriangles).toBeLessThan(fullTriangles); // Genuine simplifier work is mandatory; box identity cannot pass.
    expect(
      pilot.inventory.surfaces.some(
        ({ canonicalGeometryId, drawGeometryId }) => canonicalGeometryId !== drawGeometryId,
      ),
    ).toBe(true);
    const rawCalibration = pilot.resources.at(-1)?.detail?.['detailCalibrationJson'];
    if (typeof rawCalibration !== 'string') {
      throw new TypeError('Actual projected source error calibration was not transported.');
    }
    const calibration: unknown = JSON.parse(rawCalibration);
    if (
      !calibration ||
      typeof calibration !== 'object' ||
      !('maxProjectedApproximateErrorPixels' in calibration) ||
      typeof calibration.maxProjectedApproximateErrorPixels !== 'number' ||
      !Number.isFinite(calibration.maxProjectedApproximateErrorPixels) ||
      calibration.maxProjectedApproximateErrorPixels <= 0 ||
      !('projectionUnavailableCount' in calibration) ||
      calibration.projectionUnavailableCount !== 0
    ) {
      throw new Error('The real curved corpus must produce positive finite projected simplifier deviation.');
    }
    const projectedError = calibration.maxProjectedApproximateErrorPixels;
    const bandRatio = (1 + pilotPolicy.screenSpace.enterDetailRatio) / 2;
    const detailedImage = await captureS15Frame(`s15-${backend}-curved-detail.png`, pilot);
    const selectedCandidate = pilot.inventory.surfaces.find(
      ({ canonicalGeometryId, drawGeometryId }) => canonicalGeometryId !== drawGeometryId,
    );
    if (!selectedCandidate) {
      throw new Error('Real selected full-evidence control needs an actually reduced canonical body.');
    }
    const selectedName = pilot.componentNames.find(({ id }) => id === selectedCandidate.componentId)?.name;
    if (!selectedName) {
      throw new Error('Actual reduced body has no existing explorer label.');
    }
    await target.fill(selectors.getByRole('searchbox', { name: 'Filter parts' }), selectedName);
    const selectedRow = s15Row(selectedCandidate.componentId);
    await target.expectVisible(selectedRow, 30_000);
    await target.click(selectedRow);
    await target.waitFor(
      (id) => {
        const bridge = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__;
        const rows = bridge?.getCommittedDrawInventory()?.surfaces.filter(({ componentId }) => componentId === id);
        return Boolean(
          bridge?.getModelHoverState().selectedComponentIds?.includes(id) &&
          rows?.length &&
          rows.every(({ canonicalGeometryId, drawGeometryId }) => canonicalGeometryId === drawGeometryId),
        );
      },
      selectedCandidate.componentId,
      { timeout: 60_000 },
    );
    await waitS15Current();
    const promoted = await readS15State();
    expect(s15Identity(promoted)).toEqual(s15Identity(pilot));
    expect(promoted.camera).toEqual(pilot.camera);
    expect(s15Edges(promoted)).toEqual(s15Edges(pilot));
    expect(s15DrawIds(promoted).filter(([id]) => id !== selectedCandidate.componentId)).toEqual(
      s15DrawIds(pilot).filter(([id]) => id !== selectedCandidate.componentId),
    );
    const selectedFullImage = await captureS15Frame(`s15-${backend}-curved-selected-full.png`, promoted);
    await target.click(selectedRow);
    await target.waitFor(
      (ids) => {
        const bridge = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__;
        const rows = bridge?.getCommittedDrawInventory()?.surfaces;
        return Boolean(
          !bridge?.getModelHoverState().selectedComponentIds?.length &&
          rows &&
          ids.every(([id, geometry]) =>
            rows.some(({ componentId, drawGeometryId }) => componentId === id && drawGeometryId === geometry),
          ),
        );
      },
      s15DrawIds(pilot),
      { timeout: 60_000 },
    );
    await target.fill(selectors.getByRole('searchbox', { name: 'Filter parts' }), '');
    await waitS15Current();
    const released = await readS15State();
    expect(s15DrawIds(released)).toEqual(s15DrawIds(pilot));
    // Derive the hysteresis band from measured projected deviation at THIS actual frozen camera.
    const middlePolicy = {
      ...pilotPolicy,
      screenSpace: { maxApproximatePixelError: projectedError / bandRatio, enterDetailRatio: 0.6 },
    };
    const middleFromDetail = await setS15Policy(middlePolicy, released);
    expect(s15DrawIds(middleFromDetail)).toEqual(s15DrawIds(pilot));
    const tightPolicy = {
      ...pilotPolicy,
      screenSpace: { maxApproximatePixelError: projectedError * bandRatio, enterDetailRatio: 0.6 },
    };
    const tight = await setS15Policy(tightPolicy, middleFromDetail);
    expect(s15DrawIds(tight)).not.toEqual(s15DrawIds(pilot));
    const middleFromFull = await setS15Policy(middlePolicy, tight);
    expect(s15DrawIds(middleFromFull)).toEqual(s15DrawIds(tight));
    const restored = await setS15Policy(undefined, middleFromFull);
    expect(s15DrawIds(restored)).toEqual(s15DrawIds(full));
    const restoredImage = await captureS15Frame(`s15-${backend}-curved-full-restored.png`, restored);
    const [fullRepeatPixels, fullDetailPixels, fullRestorePixels, selectedFullPixels] = await Promise.all([
      compareScalePngFrames(first, repeated),
      compareScalePngFrames(first, detailedImage),
      compareScalePngFrames(first, restoredImage),
      compareScalePngFrames(detailedImage, selectedFullImage),
    ]);
    // Zero framebuffer differences are legitimate at this view; do not force visible damage with a new threshold.
    expect(fullDetailPixels.pixels).toBeGreaterThan(0);
    expect(fullDetailPixels.width).toBe(fullRepeatPixels.width);
    expect(fullDetailPixels.height).toBe(fullRestorePixels.height);
    await target.writeArtifact(
      `s15-${backend}-curved-calibration.json`,
      JSON.stringify(
        {
          status: 'MEASURED_CALIBRATION_CANDIDATE_REQUIRES_ACTUAL_PIXEL_REVIEW',
          completeCheckedPin: pin,
          footprint: s15Footprint(full),
          full,
          pilot,
          promoted,
          released,
          middleFromDetail,
          tight,
          middleFromFull,
          restored,
          actualTriangles: {
            full: fullTriangles,
            detail: detailTriangles,
            mandatoryEdges: pilot.inventory.residentMandatoryEdgeTriangles,
          },
          projectedError,
          policyCandidates: { pilotPolicy, middlePolicy, tightPolicy },
          pixels: { fullRepeatPixels, fullDetailPixels, fullRestorePixels, selectedFullPixels },
          qualityLimit: null,
          productionDefault: null,
          semantics:
            'Approximate source deviation projected to CSS pixels is not Hausdorff or raster displacement. Pixel captures/footprint/error and material/edge appearance require actual review before freezing one policy for the complete warehouse.',
        },
        undefined,
        2,
      ),
    );
    // The close unlimited pilot above is diagnostic only. This separate view must enter under a real 1 CSS px cap.
    await target.evaluate((camera) => {
      const bridge = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__;
      if (!bridge) {
        throw new Error('The existing distant curved camera owner is unavailable.');
      }
      bridge.setCamera(camera);
    }, s15DistantQualityCamera);
    await target.waitFor(
      (expected) => {
        const camera = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__?.getCamera();
        return Boolean(
          camera &&
          camera.requestedFov === expected.fov &&
          camera.zoom === expected.zoom &&
          camera.position.every((value, axis) => Math.abs(value - expected.position[axis]!) < 1e-6) &&
          camera.target.every((value, axis) => Math.abs(value - expected.target[axis]!) < 1e-6),
        );
      },
      s15DistantQualityCamera,
      { timeout: 30_000 },
    );
    await waitS15Current();
    const distantFull = await readS15State();
    expect(distantFull.root).toEqual(full.root);
    expect(distantFull.selected).toEqual([]);
    expect(
      distantFull.inventory.surfaces.every(
        ({ canonicalGeometryId, drawGeometryId }) => canonicalGeometryId === drawGeometryId,
      ),
    ).toBe(true);
    const conservativePolicy = {
      triangleRatio: 0.5,
      approximateRelativeError: 0.05,
      screenSpace: { maxApproximatePixelError: 1, enterDetailRatio: 0.6 },
    };
    const distantPrefix = `s15-${backend}-${projectId}-curved-one-pixel`;
    expect(distantFull.inventory.edges).toHaveLength(0);
    expect(distantFull.inventory.residentMandatoryEdgeTriangles).toBe(0);
    const distantFullImage = await captureS15Frame(`${distantPrefix}-full.png`, distantFull);
    const [hiddenResult] = await Promise.allSettled([
      (async () => {
        const frame = await target.evaluate(() => {
          const bridge = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__;
          if (!bridge) {
            throw new Error('The distant hidden-baseline owner is unavailable.');
          }
          const previousFrame = bridge.getRendererIdentity().frame;
          bridge.setPresentation({ surfaces: false, lines: false });
          return previousFrame;
        });
        await target.waitFor(
          (expected) => {
            const bridge = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__;
            const draw = bridge?.getCommittedDrawInventory();
            return Boolean(
              bridge &&
              draw?.candidateSceneId === expected.candidate &&
              draw.surfaces.every(({ visible }) => !visible) &&
              bridge.getRendererIdentity().frame > expected.frame,
            );
          },
          { candidate: distantFull.inventory.candidateSceneId, frame },
        );
        const hidden = await target.screenshot(
          selectors.getByTestId('cad-viewer-canvas-region'),
          `${distantPrefix}-hidden.png`,
        );
        const after = await readS15State();
        expect(s15Identity(after)).toEqual(s15Identity(distantFull));
        expect(after.inventory.candidateSceneId).toBe(distantFull.inventory.candidateSceneId);
        expect(after.camera).toEqual(distantFull.camera);
        return hidden;
      })(),
    ]);
    const [presentationRestore] = await Promise.allSettled([
      (async () => {
        const frame = await target.evaluate(() => {
          const bridge = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__;
          if (!bridge) {
            throw new Error('The distant full-presentation restoration owner is unavailable.');
          }
          const previousFrame = bridge.getRendererIdentity().frame;
          bridge.setPresentation({ surfaces: true, lines: true });
          return previousFrame;
        });
        await target.waitFor(
          (expected) => {
            const bridge = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__;
            const draw = bridge?.getCommittedDrawInventory();
            return Boolean(
              bridge &&
              draw?.candidateSceneId === expected.candidate &&
              draw.surfaces.every(({ visible }) => visible) &&
              bridge.getRendererIdentity().frame > expected.frame,
            );
          },
          { candidate: distantFull.inventory.candidateSceneId, frame },
        );
      })(),
    ]);
    if (hiddenResult.status === 'rejected') {
      const error: unknown = hiddenResult.reason;
      throw error;
    }
    if (presentationRestore.status === 'rejected') {
      const error: unknown = presentationRestore.reason;
      throw error;
    }
    const hiddenImage = hiddenResult.value;
    const distantDetail = await setS15Policy(conservativePolicy, distantFull);
    expect(distantDetail.inventory.canvas).toEqual(distantFull.inventory.canvas);
    expect(distantDetail.inventory.edges).toHaveLength(0);
    expect(distantDetail.inventory.residentMandatoryEdgeTriangles).toBe(0);
    const rawDistantCalibration = distantDetail.resources.at(-1)?.detail?.['detailCalibrationJson'];
    if (typeof rawDistantCalibration !== 'string') {
      throw new TypeError('The actual one-pixel calibration is unavailable.');
    }
    const distantCalibration: unknown = JSON.parse(rawDistantCalibration);
    await target.writeArtifact(
      `${distantPrefix}-projected-error.json`,
      JSON.stringify(
        { policy: conservativePolicy, camera: distantDetail.camera, calibration: distantCalibration },
        undefined,
        2,
      ),
    );
    if (
      !distantCalibration ||
      typeof distantCalibration !== 'object' ||
      !('maxProjectedApproximateErrorPixels' in distantCalibration) ||
      typeof distantCalibration.maxProjectedApproximateErrorPixels !== 'number' ||
      !Number.isFinite(distantCalibration.maxProjectedApproximateErrorPixels) ||
      distantCalibration.maxProjectedApproximateErrorPixels <= 0 ||
      !('projectionUnavailableCount' in distantCalibration) ||
      distantCalibration.projectionUnavailableCount !== 0
    ) {
      throw new Error('The distant actual curved projection must be positive finite and available.');
    }
    expect(distantCalibration.maxProjectedApproximateErrorPixels).toBeLessThanOrEqual(0.6);
    expect(distantDetail.inventory.surfaces).toHaveLength(distantFull.inventory.surfaces.length);
    expect(
      distantDetail.inventory.surfaces.every(
        ({ canonicalGeometryId, drawGeometryId }) => canonicalGeometryId !== drawGeometryId,
      ),
    ).toBe(true);
    expect(distantDetail.inventory.surfaces.reduce((sum, { drawTriangles }) => sum + drawTriangles, 0)).toBeLessThan(
      distantFull.inventory.surfaces.reduce((sum, { drawTriangles }) => sum + drawTriangles, 0),
    );
    const distantAppearance = [distantFull, distantDetail].map(({ inventory }) =>
      inventory.surfaces
        .map(({ componentId, canonicalGeometryId, materialIds, materialOpacities, attributeVersions }) => ({
          componentId,
          canonicalGeometryId,
          materialIds,
          materialOpacities,
          normalVersion: attributeVersions['normal'],
        }))
        .sort((a, b) => a.componentId.localeCompare(b.componentId)),
    );
    // Material IDs are volatile Three.js UUIDs; canonical material JSON is bound by the immutable source GLBs.
    // Live opacity/normal versions are checked here, while a GPU normal readback remains unqualified.
    expect(distantAppearance[1]?.map(({ materialIds: _materialIds, ...appearance }) => appearance)).toEqual(
      distantAppearance[0]?.map(({ materialIds: _materialIds, ...appearance }) => appearance),
    );
    const distantDetailImage = await captureS15Frame(`${distantPrefix}-detail.png`, distantDetail);
    const [distantFullDetailPixels, fullSurfacePixels, detailSurfacePixels] = await Promise.all([
      compareScalePngFrames(distantFullImage, distantDetailImage),
      compareScalePngFrames(hiddenImage, distantFullImage),
      compareScalePngFrames(hiddenImage, distantDetailImage),
    ]);
    expect(fullSurfacePixels.changedPixels).toBeGreaterThan(0);
    expect(detailSurfacePixels.changedPixels).toBeGreaterThan(0);
    const distantRestored = await setS15Policy(undefined, distantDetail);
    expect(s15DrawIds(distantRestored)).toEqual(s15DrawIds(distantFull));
    expect(distantRestored.inventory.canvas).toEqual(distantFull.inventory.canvas);
    expect(distantRestored.inventory.surfaces.every(({ visible }) => visible)).toBe(true);
    const distantFinalPin = await readScaleCommittedPin();
    expect(distantFinalPin.root).toEqual(pin.root);
    expect(distantFinalPin.byteDenominators).toEqual(pin.byteDenominators);
    await target.writeArtifact(
      `${distantPrefix}-calibration.json`,
      JSON.stringify(
        {
          status: 'ONE_PIXEL_POLICY_CANDIDATE_REQUIRES_SAME_CAMERA_PIXEL_AND_APPEARANCE_REVIEW',
          policy: conservativePolicy,
          namedCamera: s15DistantQualityCamera,
          completeCheckedPin: distantFinalPin,
          footprint: s15Footprint(distantFull),
          distantFull,
          distantDetail,
          distantAppearance,
          images: { full: distantFullImage, detail: distantDetailImage, hidden: hiddenImage },
          distantRestored,
          pixels: {
            fullDetail: distantFullDetailPixels,
            fullSurfacePixels,
            detailSurfacePixels,
          },
          mandatoryEdgeQualification: 'NO_AUTHORED_MANDATORY_EDGES_IN_THIS_CORPUS',
          sourceAppearanceEvidence: {
            originalGlbs: originalGlbs.files.map(({ bytes: _bytes, ...file }) => file),
            semantics:
              'Exact original GLBs plus normal-only CPU immutable array/material regression remain source evidence; live normal attribute versions/material identities/opacities and surface pixels are captured, not a GPU normal readback.',
          },
          productionDefault: null,
          qualityAccepted: false,
          semantics:
            'One CSS px deviation estimate enters at <=0.6 and retains at <=1; same-camera raw pixels and normal/material/mandatory-edge evidence need actual review. Close diagnostic pilot/faceting at ~3.94px is not accepted; zero authored edges here supplies no positive mandatory-edge quality proof.',
        },
        undefined,
        2,
      ),
    );
  });

  test(`S15 warehouse retains complete100k1000 selected evidence and reports candidate recovery on ${backend}`, async () => {
    const caseStarted = performance.now();
    const approved = inject('s15ReviewedCalibration')[backend];
    if (!approved || approved.backend !== backend || !/^[a-f0-9]{64}$/u.test(approved.qualityEvidenceSha256)) {
      throw new Error(
        'Run real curved calibration, review its actual imagery, and freeze the SAME policy/evidence before warehouse execution. No default or provisional policy is silently accepted.',
      );
    }
    await target.setViewport({ width: 1920, height: 1080 });
    // Same preparation lifetime: a failure can snapshot the real worker's completed spans before cleanup.
    await target.commands.uiCpuProfile('start', 's15-warehouse-preparation', 'primary');
    await target.navigate(`/__e2e/project-file-tree?main=scale-100k&prepare=1&graphicsBackend=${backend}`);
    const completedLink = selectors.getByRole('link', { name: 'Open completed warehouse' });
    // Preparation and loading share the original whole-case envelope; this is not another phase deadline.
    const remainingCaseMilliseconds = 300_000 - (performance.now() - caseStarted);
    if (remainingCaseMilliseconds <= 0) {
      throw new Error('Warehouse preparation exceeded the original whole-case envelope.');
    }
    let preparationAlertSha256: string | undefined;
    try {
      await target.waitFor(
        () => {
          const phase = document.querySelector('output[aria-label="Warehouse preparation phase"]');
          const alert = phase?.nextElementSibling;
          return (
            alert?.getAttribute('role') === 'alert' ||
            [...document.querySelectorAll('a')].some((link) => link.textContent.trim() === 'Open completed warehouse')
          );
        },
        undefined,
        { timeout: remainingCaseMilliseconds },
      );
      preparationAlertSha256 = await target.evaluate(async () => {
        const phase = document.querySelector('output[aria-label="Warehouse preparation phase"]');
        const alert = phase?.nextElementSibling;
        if (alert?.getAttribute('role') !== 'alert') {
          return undefined;
        }
        const bytes = new TextEncoder().encode(alert.textContent);
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
      });
      if (preparationAlertSha256 !== undefined) {
        throw new Error('Warehouse preparation reached its terminal error branch before completion.');
      }
      await target.expectVisible(completedLink, Math.max(1, 300_000 - (performance.now() - caseStarted)));
    } catch (error) {
      let phase: Awaited<ReturnType<typeof target.textContent>> | undefined;
      let observationError: string | undefined;
      let privateDiagnostic: unknown;
      try {
        phase = await target.textContent(selectors.getByRole('status', { name: 'Warehouse preparation phase' }));
      } catch (phaseError) {
        observationError = String(phaseError);
      }
      try {
        privateDiagnostic = await target.evaluate(() => {
          const bridge = (
            globalThis as typeof globalThis & {
              __TAU_WAREHOUSE_PREPARATION_TEST__?: { snapshot: () => unknown };
            }
          ).__TAU_WAREHOUSE_PREPARATION_TEST__;
          return bridge?.snapshot() ?? { status: 'unavailable' };
        });
      } catch (diagnosticError) {
        privateDiagnostic = { status: 'refused', reason: String(diagnosticError) };
      }
      try {
        await target.writeArtifact(
          `s15-${backend}-warehouse-preparation-failure.json`,
          JSON.stringify({
            phase,
            observationError,
            preparationAlertSha256,
            privateDiagnostic,
            semantics:
              'Single current owner snapshot before harness cleanup; the private fixture diagnostic captures the selected transport rejection before public classification and checks the same root authority before shutdown.',
          }),
        );
      } catch {
        // Diagnostic capture must preserve the original whole-case failure.
      }
      throw error;
    }
    await target.stopCpuProfile(`s15-${backend}-warehouse-preparation-primary.cpuprofile`);
    const completedDestination = await target.getAttribute(completedLink, 'href');
    const completionText = await target.textContent(
      selectors.getByRole('status', { name: 'Completed warehouse corpus' }),
    );
    if (!completedDestination || !completionText) {
      throw new Error('The real completed warehouse destination is unavailable.');
    }
    const completion: unknown = JSON.parse(completionText);
    if (
      typeof completion !== 'object' ||
      completion === null ||
      !('destination' in completion) ||
      completion.destination !== completedDestination ||
      !('corpus' in completion) ||
      typeof completion.corpus !== 'object' ||
      completion.corpus === null ||
      !('root' in completion.corpus) ||
      typeof completion.corpus.root !== 'object' ||
      completion.corpus.root === null ||
      !('digest' in completion.corpus.root) ||
      typeof completion.corpus.root.digest !== 'string' ||
      !/^sha256:[a-f\d]{64}$/u.test(completion.corpus.root.digest) ||
      !('definitions' in completion.corpus) ||
      completion.corpus.definitions !== 1000 ||
      !('occurrences' in completion.corpus) ||
      completion.corpus.occurrences !== 100_000 ||
      !('closureAssets' in completion.corpus) ||
      typeof completion.corpus.closureAssets !== 'number' ||
      completion.corpus.closureAssets < 1002 ||
      !('preparationMilliseconds' in completion) ||
      typeof completion.preparationMilliseconds !== 'number' ||
      !Number.isFinite(completion.preparationMilliseconds) ||
      completion.preparationMilliseconds < 0
    ) {
      throw new Error('The actual completed warehouse corpus or preparation timing is incomplete.');
    }
    const completedCorpusRoot = completion.corpus.root;
    onTestFinished(async () => {
      await captureScalePinProgress(
        async () =>
          target.evaluate((expectedDigest) => {
            const page = globalThis as typeof globalThis & {
              __TAU_SCALE_PIN_PROGRESS_TEST__?: {
                status: number;
                phase: number;
                ordinal: number;
                requested: number;
                completed: number;
                requestedByPhase: number[];
                completedByPhase: number[];
                awaitMillisecondsByPhase: number[];
                timeOrigin: number;
                startedAt: number;
                requestedAt: number;
                completedAt: number;
              };
              __TAU_SECTION_VIEW_TEST__?: {
                getCommittedAssembly(): {
                  assemblyDisplay: { root: { digest: string } } | undefined;
                  isCurrent(): boolean;
                };
              };
            };
            const progress = page.__TAU_SCALE_PIN_PROGRESS_TEST__;
            if (!progress) {
              return undefined;
            }
            const current = page.__TAU_SECTION_VIEW_TEST__?.getCommittedAssembly();
            if (!current?.isCurrent() || current.assemblyDisplay?.root.digest !== expectedDigest) {
              throw new Error('Scale pin progress no longer belongs to the current root.');
            }
            const hasFinitePhaseValues = (values: number[]): boolean =>
              Array.isArray(values) &&
              values.length === 10 &&
              values.every((value) => Number.isFinite(value) && value >= 0);
            if (
              ![1, 2, 3].includes(progress.status) ||
              !Number.isInteger(progress.phase) ||
              progress.phase < 0 ||
              progress.phase > 9 ||
              !Number.isSafeInteger(progress.ordinal) ||
              progress.ordinal !== progress.requested ||
              !Number.isSafeInteger(progress.completed) ||
              progress.completed > progress.requested ||
              !hasFinitePhaseValues(progress.requestedByPhase) ||
              !hasFinitePhaseValues(progress.completedByPhase) ||
              !hasFinitePhaseValues(progress.awaitMillisecondsByPhase) ||
              !progress.requestedByPhase.every(
                (value, phase) =>
                  Number.isSafeInteger(value) &&
                  Number.isSafeInteger(progress.completedByPhase[phase]) &&
                  (progress.completedByPhase[phase] ?? 0) <= value,
              ) ||
              progress.requestedByPhase.reduce((sum, value) => sum + value, 0) !== progress.requested ||
              progress.completedByPhase.reduce((sum, value) => sum + value, 0) !== progress.completed ||
              ![progress.timeOrigin, progress.startedAt, progress.requestedAt, progress.completedAt].every(
                (value) => Number.isFinite(value) && value >= 0,
              )
            ) {
              throw new Error('Scale pin progress has invalid numeric bounds.');
            }
            const capturedAt = performance.now();
            return {
              ...progress,
              capturedAt,
              pendingMilliseconds: progress.requested > progress.completed ? capturedAt - progress.requestedAt : 0,
            };
          }, completedCorpusRoot.digest),
        async (snapshot) =>
          target.writeArtifact(
            `s15-${backend}-warehouse-pin-progress.json`,
            JSON.stringify({
              ...snapshot,
              semantics:
                'Fixed numeric phase counters and completed same-realm await durations; pendingMilliseconds is current capturedAt minus requestedAt and is excluded from completed durations.',
            }),
          ),
      );
    });
    const preparationPhaseMilliseconds = performance.now() - caseStarted;
    const completedPreparationStages: unknown = await target.evaluate(() => {
      const diagnostic = (
        globalThis as typeof globalThis & { __TAU_WAREHOUSE_PREPARATION_TEST__?: { snapshot: () => unknown } }
      ).__TAU_WAREHOUSE_PREPARATION_TEST__?.snapshot();
      return diagnostic && typeof diagnostic === 'object' && 'preparationStages' in diagnostic
        ? diagnostic.preparationStages
        : undefined;
    });
    if (
      !completedPreparationStages ||
      typeof completedPreparationStages !== 'object' ||
      !('status' in completedPreparationStages) ||
      completedPreparationStages.status !== 'completed' ||
      !('completed' in completedPreparationStages) ||
      !Array.isArray(completedPreparationStages.completed) ||
      completedPreparationStages.completed.length === 0 ||
      !('calls' in completedPreparationStages) ||
      typeof completedPreparationStages.calls !== 'object' ||
      !('spans' in completedPreparationStages) ||
      !Array.isArray(completedPreparationStages.spans)
    ) {
      throw new Error('The completed warehouse preparation stage snapshot is unavailable.');
    }
    await target.writeArtifact(
      `s15-${backend}-warehouse-completed-corpus.json`,
      JSON.stringify(
        {
          completion,
          preparationPhaseMilliseconds,
          preparationStages: completedPreparationStages,
          preparationStageSemantics:
            'Monotonic completed stage intervals and exact owner call counters; allowlisted completed worker spans may overlap and are not a wall-time partition.',
          qualification:
            'Actual cold production and checked complete immutable closure; every owned authored source retired after producer shutdown. Preparation remains inside the original 300-second whole case.',
        },
        undefined,
        2,
      ),
    );
    const immutableLoadingStarted = performance.now();
    await target.commands.uiCpuProfile('start', 's15-warehouse-startup', 'primary');
    await target.writeArtifact(
      `s15-${backend}-warehouse-startup-profile.json`,
      JSON.stringify(
        {
          status: 'PROFILE_STARTED_BEFORE_WAREHOUSE_NAVIGATION',
          backend,
          definitions: 1000,
          occurrences: 100_000,
          qualityEvidenceSha256: approved.qualityEvidenceSha256,
          samplingIntervalMicroseconds: 100,
          completedCorpusRoot,
          preparationPhaseMilliseconds,
          qualification:
            'Diagnostic sampling overhead; not timed performance acceptance. Page isolate only, not all worker/native CPU.',
        },
        undefined,
        2,
      ),
    );
    try {
      await openS15({ completedDestination }, backend, s15WarehouseCamera);
    } catch (error) {
      // This requested-owner diagnostic remains available before any committed draw exists.
      const phase = await target
        .evaluate(() => (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__?.getRequestedAssemblyPreparation())
        .catch(() => undefined);
      await target
        .writeArtifact(
          `s15-${backend}-warehouse-requested-viewport-phase.json`,
          JSON.stringify({ phase: phase ?? null, qualification: 'REQUESTED_ONLY_NO_COMMITTED_DRAW_CLAIM' }),
        )
        .catch(() => undefined);
      throw error;
    }
    await target.stopCpuProfile(`s15-${backend}-warehouse-startup.cpuprofile`);
    // Freeze the existing Model pane before image baselines so selection does not change the canvas dimensions.
    await openS15ModelPane();
    const pin = await readScaleCommittedPin();
    const initial = await readS15State();
    expect(pin.root).toEqual(completedCorpusRoot);
    expect(pin.root.digest).toBe(initial.root.digest);
    expect(pin.definitions).toBe(1000);
    expect(pin.occurrences).toBe(100_000);
    expect(initial.definitions).toBe(1000);
    expect(initial.occurrences).toBe(100_000);
    expect(initial.componentCount).toBeGreaterThan(0);
    expect(initial.uniqueComponentCount).toBe(initial.componentCount);
    await target.writeArtifact(
      `s15-${backend}-warehouse-initial-phase-times.json`,
      JSON.stringify(
        {
          completedCorpusRoot,
          currentRoot: pin.root,
          preparationPhaseMilliseconds,
          immutableLoadingMilliseconds: performance.now() - immutableLoadingStarted,
          wholeCaseElapsedMilliseconds: performance.now() - caseStarted,
          originalWholeCaseBoundMilliseconds: 300_000,
          qualification:
            'Cold preparation and source-free SAME-pin loading are separate real phases within the unchanged whole-case envelope; diagnostic profiling is not performance acceptance.',
        },
        undefined,
        2,
      ),
    );
    const full = await captureS15Frame(`s15-${backend}-warehouse-full.png`, initial);
    const calibrated = await setS15Policy(approved.policy, initial);
    const visibleTriangles =
      calibrated.inventory.frustumSurfaceTriangleUpperBound + calibrated.inventory.residentMandatoryEdgeTriangles;
    expect(visibleTriangles).toBeGreaterThan(0);
    expect(visibleTriangles).toBeLessThanOrEqual(2_000_000);
    const detailImage = await captureS15Frame(`s15-${backend}-warehouse-reviewed-policy.png`, calibrated);
    const chosen = calibrated.inventory.surfaces.find(
      ({ visible, projection }) => visible && projection.intersectsFrustum && projection.finiteProjection,
    );
    if (!chosen) {
      throw new Error('Useful actual warehouse projection is unavailable.');
    }
    const label = calibrated.componentNames.find(({ id }) => id === chosen.componentId)?.name;
    if (!label) {
      throw new Error('Canonical warehouse row has no actual model label.');
    }
    await target.fill(selectors.getByRole('searchbox', { name: 'Filter parts' }), label);
    const row = s15Row(chosen.componentId);
    await target.expectVisible(row, 30_000);
    await target.scrollIntoView(row);
    await target.click(row);
    await target.waitFor(
      (id) =>
        (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__
          ?.getModelHoverState()
          .selectedComponentIds?.includes(id),
      chosen.componentId,
    );
    await waitS15Current();
    const selected = await readS15State();
    expect(s15Identity(selected)).toEqual(s15Identity(calibrated));
    const selectedRows = selected.inventory.surfaces.filter(({ componentId }) => componentId === chosen.componentId);
    expect(selectedRows.length).toBeGreaterThan(0);
    expect(
      selectedRows.every(({ canonicalGeometryId, drawGeometryId }) => canonicalGeometryId === drawGeometryId),
    ).toBe(true);
    const selectedImage = await captureS15Frame(`s15-${backend}-warehouse-selected-canonical.png`, selected);
    await target.click(row); // Existing row consumer releases selection; no actor injection.
    await target.waitFor(
      (id) =>
        !(globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__
          ?.getModelHoverState()
          .selectedComponentIds?.includes(id),
      chosen.componentId,
    );
    await target.fill(selectors.getByRole('searchbox', { name: 'Filter parts' }), '');
    const offscreen = { ...s15WarehouseCamera, position: [1.98, 8, -18.02], target: [1.98, 0, -18.02] } as const;
    await target.evaluate(
      (camera) => (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__?.setCamera(camera),
      offscreen,
    );
    await target.waitFor(
      () => {
        const bridge = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__;
        const inventory = bridge?.getCommittedDrawInventory();
        return Boolean(inventory?.surfaces.length === 0 && bridge?.getAssemblyResourceTelemetry().length);
      },
      undefined,
      { timeout: 60_000 },
    );
    const evicted = await readS15State();
    expect(s15Identity(evicted)).toEqual(s15Identity(initial));
    expect(evicted.definitions).toBe(1000);
    expect(evicted.occurrences).toBe(100_000);
    expect(evicted.inventory.edges).toHaveLength(0);
    expect(s15Number(evicted, 'residentOccurrenceCount')).toBe(0);
    expect(s15Number(evicted, 'exactResidentBufferCpuBytes')).toBeLessThan(
      s15Number(calibrated, 'exactResidentBufferCpuBytes'),
    );
    await target.evaluate(
      (camera) => (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__?.setCamera(camera),
      s15WarehouseCamera,
    );
    await target.waitFor(
      () =>
        Boolean(
          (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__?.getCommittedDrawInventory()?.surfaces.length,
        ),
      undefined,
      { timeout: 60_000 },
    );
    await waitS15Current();
    const recovered = await readS15State();
    expect(s15Identity(recovered)).toEqual(s15Identity(initial));
    expect(recovered.camera.position).toEqual(calibrated.camera.position);
    expect(recovered.camera.target).toEqual(calibrated.camera.target);
    expect(recovered.definitions).toBe(1000);
    expect(recovered.occurrences).toBe(100_000);
    expect(s15Edges(recovered)).toEqual(s15Edges(calibrated));
    expect(recovered.inventory.surfaces.map(({ componentId }) => componentId).sort()).toEqual(
      calibrated.inventory.surfaces.map(({ componentId }) => componentId).sort(),
    );
    const returned = await captureS15Frame(`s15-${backend}-warehouse-recovered.png`, recovered);
    const [warehousePixels, selectedPixels, recoveredPixels] = await Promise.all([
      compareScalePngFrames(full, detailImage),
      compareScalePngFrames(detailImage, selectedImage),
      compareScalePngFrames(detailImage, returned),
    ]);
    const phases = [initial, calibrated, selected, evicted, recovered];
    const knownExactBufferPeak = Math.max(
      ...phases.map((phase) => s15Number(phase, 'currentAndCandidateExactBufferCpuBytes')),
    );
    for (const phase of phases) {
      expect(s15Number(phase, 'currentAndCandidateExactBufferCpuBytes')).toBeGreaterThanOrEqual(
        s15Number(phase, 'exactResidentBufferCpuBytes'),
      );
    }
    const recoveryProbeBefore = await target.evaluateWarehouseRecoveryArtifact(
      captureScaleViewportEvidenceInPage,
      false,
      `s15-${backend}-warehouse-recovery-before.json`,
    );
    expect(recoveryProbeBefore.identity.root).toBe(pin.root.digest);
    const rawHeapAndPresentation = await target.scalePresentationProbe(`s15-${backend}-warehouse-recovery-raw`);
    const recoveryProbeAfter = await target.evaluateWarehouseRecoveryArtifact(
      captureScaleViewportEvidenceInPage,
      false,
      `s15-${backend}-warehouse-recovery-after.json`,
    );
    const { candidateSceneId: recoveryBeforeCandidate, ...recoveryHeldBefore } = recoveryProbeBefore.identity;
    const { candidateSceneId: recoveryAfterCandidate, ...recoveryHeldAfter } = recoveryProbeAfter.identity;
    expect(recoveryHeldAfter).toEqual(recoveryHeldBefore);
    expect(rawHeapAndPresentation.dataLossOccurred).toBe(false);
    expect(rawHeapAndPresentation.traceBytes).toBeGreaterThan(0);
    expect(rawHeapAndPresentation.presentationQualification).toBe('raw-probe-only');
    const pinArtifact = await writeWarehouseEvidencePart(`s15-${backend}-warehouse-checked-pin.json`, pin);
    const footprintArtifact = await writeWarehouseEvidencePart(
      `s15-${backend}-warehouse-footprint.json`,
      s15Footprint(calibrated),
    );
    const phaseNames = ['initial', 'calibrated', 'selected', 'evicted', 'recovered'] as const;
    const phaseArtifacts: Array<Awaited<ReturnType<typeof writeWarehouseEvidencePart>>> = [];
    for (const [index, phase] of phases.entries()) {
      const phaseName = phaseNames[index];
      if (phaseName === undefined) {
        throw new RangeError('Warehouse evidence has an unexpected phase.');
      }
      // Keep the five large RPC writes serial so one field cannot combine with another in flight.
      // oxlint-disable-next-line no-await-in-loop -- Each artifact must finish before the next bounded Vitest RPC.
      phaseArtifacts.push(await writeWarehouseEvidencePart(`s15-${backend}-warehouse-${phaseName}-phase.json`, phase));
    }
    await writeWarehouseEvidencePart(`s15-${backend}-warehouse-calibration-recovery.json`, {
      status: 'ACTUAL_PRODUCT_CONTROLS_WITH_PARTIAL_ACCOUNTING_NOT_FULL_S15_S16_ACCEPTANCE',
      reviewed: approved,
      publicationDenominator: { definitions: 1000, occurrences: 100_000 },
      completeCheckedPin: pinArtifact,
      footprint: footprintArtifact,
      phases: phaseArtifacts,
      visibleTriangles,
      pixels: { warehousePixels, selectedPixels, recoveredPixels },
      knownExactBufferPeak,
      rawHeapAndPresentation,
      recoveryProbe: {
        before: recoveryProbeBefore,
        after: recoveryProbeAfter,
        candidateBoundary: { before: recoveryBeforeCandidate, after: recoveryAfterCandidate },
      },
      budgets: { approvedCpuBytes: null, approvedGpuBytes: null, knownExactBufferPeak },
      memoryQualification:
        'CDP report contains target-isolate heapBefore/heapAfter and memory dumps. Those raw samples are not all-worker/WASM/GPU bytes and are not numeric recovery acceptance. Current/candidate unique-buffer telemetry is separate and its unmeasuredInventoryJson must remain explicit.',
      nextGate:
        'Review useful named warehouse imagery, full-denominator emitted triangles/mandatory edges, actual pixel quality, backend upload/disposal, reader/source/meta/WASM inventory, and measured budgets. Cuboid identity under this policy is not independent LOD calibration.',
    });
  });
}

declare module 'vitest' {
  /* eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Vitest's ProvidedContext requires interface declaration merging. */ /* oxlint-disable-next-line typescript/consistent-type-definitions -- Vitest's ProvidedContext requires interface declaration merging. */
  export interface ProvidedContext {
    scaleCpuDiagnostic: boolean;
    s15ReviewedCalibration: Readonly<
      Partial<
        Record<
          'webgl' | 'webgpu',
          Readonly<{
            backend: 'webgl' | 'webgpu';
            qualityEvidenceSha256: string;
            policy: Readonly<{
              triangleRatio: number;
              approximateRelativeError: number;
              screenSpace: Readonly<{ maxApproximatePixelError: number; enterDetailRatio: number }>;
            }>;
          }>
        >
      >
    >;
  }
}

type S16TaggedResourceCounts = Readonly<{
  objectCount: number;
  geometryCount: number;
  materialCount: number;
  attributeHandleCount: number;
  bufferCount: number;
  backingBytes: number;
  payloadBytes: number;
}>;

type S16ExactAssemblyCpu = Readonly<{ bufferCount: number; backingBytes: number; payloadBytes: number }>;
type S16LiveAssemblyResources = Readonly<{
  key: string;
  presentationRevision: number;
  candidateSceneId: string;
  unitId: string;
  current: S16ExactAssemblyCpu;
  candidate?: S16ExactAssemblyCpu & Readonly<{ key: string; revision: number; sceneId: string; unitId: string }>;
  union: S16ExactAssemblyCpu;
  retiredOwnerCount: number;
}>;

const readS16LiveAssemblyResources = async (surface: 'primary' | 'secondary' = 'primary') =>
  target.evaluate(
    () => {
      const bridge = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__;
      const subject = bridge?.getCommittedAssembly();
      const draw = bridge?.getCommittedDrawInventory();
      const resources = bridge?.getLiveAssemblyResourceInventory();
      const current = bridge?.getCommittedDrawInventory();
      if (
        !bridge ||
        !subject?.assemblyDisplay ||
        !subject.isCurrent() ||
        !draw ||
        !current ||
        !resources ||
        resources.key !== subject.assemblyDisplay.root.digest ||
        resources.key !== draw.key ||
        resources.candidateSceneId !== draw.candidateSceneId ||
        resources.presentationRevision !== draw.presentationRevision ||
        resources.unitId !== draw.unitId ||
        current.candidateSceneId !== draw.candidateSceneId ||
        current.poseRevision !== draw.poseRevision ||
        (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__ !== bridge
      ) {
        throw new Error('The live assembly census lost its current committed root, draw or viewport.');
      }
      return {
        projectId: subject.diagnostics.projectId,
        identity: {
          root: subject.assemblyDisplay.root.digest,
          sceneId: draw.candidateSceneId,
          revision: draw.presentationRevision,
          unitId: draw.unitId,
          poseRevision: draw.poseRevision,
        },
        resources,
        visibleSurfaces: draw.surfaces.filter(({ visible }) => visible).length,
      };
    },
    undefined,
    surface,
  );

/** Untimed mounted helper census, joined to the exact current committed draw on both sides of traversal. */
const readS16MountedHelperResources = async () =>
  target.evaluate(() => {
    const bridge = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__;
    const subject = bridge?.getCommittedAssembly();
    const draw = bridge?.getCommittedDrawInventory();
    if (
      !bridge ||
      !subject?.assemblyDisplay ||
      !subject.isCurrent() ||
      !draw ||
      draw.key !== subject.assemblyDisplay.root.digest
    ) {
      throw new Error('The current recovery helper census has no committed assembly draw.');
    }
    const taggedResources = bridge.getTaggedResourceInventory();
    const current = bridge.getCommittedDrawInventory();
    if (
      !taggedResources ||
      !subject.isCurrent() ||
      current?.key !== draw.key ||
      current.candidateSceneId !== draw.candidateSceneId ||
      current.presentationRevision !== draw.presentationRevision ||
      current.unitId !== draw.unitId ||
      current.poseRevision !== draw.poseRevision ||
      (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__ !== bridge
    ) {
      throw new Error('The recovery helper census changed its committed candidate during observation.');
    }
    return {
      identity: {
        root: subject.assemblyDisplay.root.digest,
        candidateSceneId: draw.candidateSceneId,
        presentationRevision: draw.presentationRevision,
        unitId: draw.unitId,
        poseRevision: draw.poseRevision,
      },
      taggedResources,
    };
  });

// This explicit untimed loss control uses the existing 123-part named view and real admitted S15 draw capture.
test.each(['WebGL', 'WebGPU'])(
  'S16 pinned viewport recovery %s should retire lost authority and restore the same pinned draw',
  async (backendName) => {
    const backend = backendName === 'WebGL' ? 'webgl' : 'webgpu';
    const captureVisibleGeometry = async (prefix: string, held: S15State) => {
      const capturePresentation = async (name: string, presentation: { surfaces: boolean; lines: boolean }) => {
        await target.evaluate((next) => {
          const bridge = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__;
          if (!bridge) {
            throw new Error('The current recovery presentation owner is unavailable.');
          }
          bridge.setPresentation(next);
        }, presentation);
        await target.waitFor(
          (expected) => {
            const inventory = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__?.getCommittedDrawInventory();
            return Boolean(
              inventory &&
              inventory.candidateSceneId === expected.candidate &&
              inventory.surfaces.every(({ visible }) => visible === expected.presentation.surfaces) &&
              inventory.edges.every(({ visible }) => visible === expected.presentation.lines),
            );
          },
          { candidate: held.inventory.candidateSceneId, presentation },
        );
        const frame = await target.evaluate((next) => {
          const bridge = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__;
          if (!bridge) {
            throw new Error('The settled recovery presentation owner is unavailable.');
          }
          const previousFrame = bridge.getRendererIdentity().frame;
          // The existing repeated gesture invalidates a genuine frame AFTER actual draw visibility settled.
          bridge.setPresentation(next);
          return previousFrame;
        }, presentation);
        // Hidden geometry has no qualifying model draw callback. Observe the actual demand-render frame instead;
        // this is a redraw barrier plus native canvas PNG, never a compositor-presentation timestamp.
        await target.waitFor((previousFrame) => {
          const bridge = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__;
          return Boolean(bridge && bridge.getRendererIdentity().frame > previousFrame);
        }, frame);
        const current = await readS15State();
        expect(s15Identity(current)).toEqual(s15Identity(held));
        expect(current.inventory.candidateSceneId).toBe(held.inventory.candidateSceneId);
        expect(current.camera).toEqual(held.camera);
        expect(current.selected).toEqual(held.selected);
        const hasModelDraw =
          presentation.surfaces || (presentation.lines && held.inventory.residentMandatoryEdgeTriangles > 0);
        const image = hasModelDraw
          ? await captureS15Frame(name, held)
          : await target.screenshot(selectors.getByTestId('cad-viewer-canvas-region'), name);
        const after = await readS15State();
        expect(s15Identity(after)).toEqual(s15Identity(held));
        expect(after.inventory.candidateSceneId).toBe(held.inventory.candidateSceneId);
        expect(after.camera).toEqual(held.camera);
        expect(after.selected).toEqual(held.selected);
        return image;
      };
      const [primary] = await Promise.allSettled([
        (async () => {
          const hidden = await capturePresentation(`${prefix}-geometry-hidden.png`, { surfaces: false, lines: false });
          const surfaces = await capturePresentation(`${prefix}-surface-only.png`, { surfaces: true, lines: false });
          const edges = await capturePresentation(`${prefix}-edge-only.png`, { surfaces: false, lines: true });
          const [surfacePixels, edgePixels] = await Promise.all([
            compareScalePngFrames(hidden, surfaces),
            compareScalePngFrames(hidden, edges),
          ]);
          // Nonempty emitted pixels reject two identical blank images; this is not a fidelity/quality tolerance.
          expect(surfacePixels.changedPixels).toBeGreaterThan(0);
          const mandatoryEdgeTriangles = held.inventory.residentMandatoryEdgeTriangles;
          expect(mandatoryEdgeTriangles).toBeGreaterThan(0);
          expect(edgePixels.changedPixels).toBeGreaterThan(0);
          return {
            hidden,
            surfaces,
            edges,
            surfacePixels,
            edgePixels,
            mandatoryEdgeTriangles,
            edgePixelsQualification:
              'Actual authored edge denominator is positive and its edge-only pixels differ from geometry-hidden reference.',
          };
        })(),
      ]);
      // Drain a full-presentation capture on either primary outcome before choosing which exact error to deliver.
      const [restoration] = await Promise.allSettled([
        capturePresentation(`${prefix}-full-restored.png`, { surfaces: true, lines: true }),
      ]);
      if (primary.status === 'rejected') {
        const error: unknown = primary.reason;
        throw error;
      }
      if (restoration.status === 'rejected') {
        const error: unknown = restoration.reason;
        throw error;
      }
      return primary.value;
    };
    await openS15('scale-123', backend, { position: [0.2, 1, 0.2], target: [0.2, 0, 0.2], fov: 30, zoom: 1 });
    await openS15ModelPane();
    const available = await readS15State();
    const [firstComponent] = available.inventory.surfaces;
    if (!firstComponent) {
      throw new Error('The actual 123-part recovery fixture has no selectable surface.');
    }
    await target.click(s15Row(firstComponent.componentId));
    await target.waitFor(
      (id) =>
        (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__
          ?.getModelHoverState()
          .selectedComponentIds?.includes(id) === true,
      firstComponent.componentId,
    );
    await waitS15Current();
    const before = await readS15State();
    const pinBefore = await readScaleCommittedPin();
    const viewportSession = before.resources.at(-1)?.detail?.['viewportActorSessionId'];
    if (typeof viewportSession !== 'string' || viewportSession.length === 0) {
      throw new TypeError('The current recovery viewport has no actual actor-session attribution.');
    }
    expect(before.definitions).toBe(123);
    expect(before.occurrences).toBe(123);
    expect(pinBefore.definitions).toBe(123);
    expect(pinBefore.occurrences).toBe(123);
    expect(before.inventory.residentMandatoryEdgeTriangles).toBeGreaterThan(0);
    expect(before.selected).toEqual([firstComponent.componentId]);
    expect(
      before.inventory.surfaces.every(
        ({ drawGeometryId, canonicalGeometryId }) => drawGeometryId === canonicalGeometryId,
      ),
    ).toBe(true);
    expect(before.inventory.surfaces.reduce((total, { drawTriangles }) => total + drawTriangles, 0)).toBeGreaterThan(0);
    const beforeImage = await captureS15Frame(`s16-${backend}-recovery-before.png`, before);
    const mountedBefore = await readS16MountedHelperResources();
    expect(mountedBefore.identity).toMatchObject({
      root: before.root.digest,
      candidateSceneId: before.inventory.candidateSceneId,
      presentationRevision: before.inventory.presentationRevision,
      unitId: before.inventory.unitId,
      poseRevision: before.inventory.poseRevision,
    });
    for (const counts of Object.values(mountedBefore.taggedResources)) {
      for (const value of Object.values(counts)) {
        expect(Number.isSafeInteger(value) && value >= 0).toBe(true);
      }
    }
    const beforeVisiblePixels = await captureVisibleGeometry(`s16-${backend}-recovery-before`, before);
    const nativeBefore = backend === 'webgpu' ? await captureScaleViewportEvidence(true) : undefined;
    if (nativeBefore) {
      expect(nativeBefore.identity).toMatchObject({
        root: before.root.digest,
        candidateSceneId: before.inventory.candidateSceneId,
        unitId: before.inventory.unitId,
        poseRevision: before.inventory.poseRevision,
        viewportActorSessionId: viewportSession,
        backend,
      });
      const { renderDevice } = nativeBefore.renderer;
      if (renderDevice?.status !== 'observed') {
        throw new Error('The actual mounted recovery device identity is unavailable.');
      }
      expect(
        classifyWebGpuAdapter({
          vendor: renderDevice.vendor,
          architecture: renderDevice.architecture,
          device: renderDevice.device,
          description: renderDevice.description,
          fallback: renderDevice.isFallbackAdapter,
        }),
      ).toBe('hardware');
      expect(renderDevice.canvasMatches).toBe(true);
      expect(renderDevice.source).toBe('mounted-webgpu-canvas-device');
      expect(renderDevice.configuredDeviceMatches).toBe(true);
      if (renderDevice.isFallbackAdapter !== undefined) {
        expect(renderDevice.isFallbackAdapter).toBe(false);
      }
    }

    // Immediate settlement observes native-event/recovery failures while DOM commands use the same owned page.
    // The held canvas/capture remain local to this bounded evaluation; no global registry or synthetic event is used.
    const observed = Promise.allSettled([
      backend === 'webgpu'
        ? target.crashGpuProcess({
            root: before.root.digest,
            rootPath: before.root.path,
            candidate: before.inventory.candidateSceneId,
            unit: before.inventory.unitId,
            pose: before.inventory.poseRevision,
          })
        : target.evaluate(
            async (expected) => {
              const bridge = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__;
              const subject = bridge?.getCommittedAssembly();
              const inventory = bridge?.getCommittedDrawInventory();
              if (
                !bridge ||
                !subject?.assemblyDisplay ||
                !subject.isCurrent() ||
                subject.assemblyDisplay.root.digest !== expected.root ||
                inventory?.candidateSceneId !== expected.candidate ||
                inventory.unitId !== expected.unit ||
                inventory.poseRevision !== expected.pose
              ) {
                throw new Error('The pinned viewport changed before native context loss.');
              }
              const canvas = bridge.getViewportCanvas();
              const gl = canvas.getContext('webgl2');
              const loss = gl?.getExtension('WEBGL_lose_context');
              if (!gl || !loss || bridge.getRendererIdentity().api !== 'webgl') {
                throw new Error('The actual mounted WebGL context does not expose native loss.');
              }
              const controller = new AbortController();
              // Milliseconds; bounds the complete native-event, retirement and user Retry observation, not a latency budget.
              const recoveryTimeoutError = new Error(
                'Native pinned viewport recovery did not finish within its observation deadline.',
              );
              const recoveryTimeoutTimer = setTimeout(() => {
                controller.abort(recoveryTimeoutError);
              }, 60_000);
              const waitUntil = async (predicate: () => boolean): Promise<void> =>
                new Promise<void>((resolve, reject) => {
                  let frame = 0;
                  const cleanup = (): void => {
                    cancelAnimationFrame(frame);
                    controller.signal.removeEventListener('abort', onAbort);
                  };
                  const onAbort = (): void => {
                    cleanup();
                    reject(recoveryTimeoutError);
                  };
                  const inspect = (): void => {
                    try {
                      if (predicate()) {
                        cleanup();
                        resolve();
                      } else {
                        frame = requestAnimationFrame(inspect);
                      }
                    } catch (error) {
                      cleanup();
                      // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- Preserve the exact predicate failure, including native/non-Error throws and undefined; wrapping would change the observed primary error.
                      reject(error);
                    }
                  };
                  if (controller.signal.aborted) {
                    onAbort();
                    return;
                  }
                  controller.signal.addEventListener('abort', onAbort, { once: true });
                  inspect();
                });
              const lossObservation: { event?: Event } = {};
              const onLoss = (event: Event): void => {
                lossObservation.event = event;
              };
              canvas.addEventListener('webglcontextlost', onLoss, { once: true });
              try {
                loss.loseContext();
                await waitUntil(
                  () => lossObservation.event !== undefined && !canvas.isConnected && !subject.isCurrent(),
                );
                if (
                  !lossObservation.event?.isTrusted ||
                  !lossObservation.event.defaultPrevented ||
                  !gl.isContextLost()
                ) {
                  throw new Error('Native context loss and the application preventDefault handler were not observed.');
                }
                if (bridge.getCommittedDrawInventory() !== undefined) {
                  throw new Error('The retired bridge still exposes a committed draw.');
                }
                if (bridge.getTaggedResourceInventory() !== undefined) {
                  throw new Error('The retired bridge still exposes mounted helper resources.');
                }
                let readDenied = false;
                try {
                  await subject.readRawBytes(subject.assemblyDisplay.root.path);
                } catch (error) {
                  if (!(error instanceof Error) || error.message !== 'Committed assembly changed before reading.') {
                    throw error;
                  }
                  readDenied = true;
                }
                if (!readDenied) {
                  throw new Error('The held retired capture still permits a managed-root read.');
                }
                await waitUntil(() => {
                  const current = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__;
                  const display = current?.getCommittedAssembly();
                  const draw = current?.getCommittedDrawInventory();
                  if (!display?.isCurrent()) {
                    return false;
                  }
                  if (display.assemblyDisplay?.root.digest !== expected.root) {
                    return false;
                  }
                  if (draw?.unitId !== expected.unit) {
                    return false;
                  }
                  if (draw.candidateSceneId === expected.candidate) {
                    return false;
                  }
                  if (draw.poseRevision !== expected.pose) {
                    return false;
                  }
                  const replacementCanvas = current?.getViewportCanvas();
                  if (!replacementCanvas || replacementCanvas === canvas) {
                    return false;
                  }
                  return replacementCanvas.isConnected;
                });
                return {
                  nativeEventTrusted: lossObservation.event.isTrusted,
                  nativeEventPrevented: lossObservation.event.defaultPrevented,
                  lostContext: gl.isContextLost(),
                  retiredCanvasDisconnected: !canvas.isConnected,
                  retiredSubjectCurrent: subject.isCurrent(),
                  retiredDrawUnavailable: bridge.getCommittedDrawInventory() === undefined,
                  retiredTaggedResourcesUnavailable: bridge.getTaggedResourceInventory() === undefined,
                  retiredReaderDenied: readDenied,
                  newCanvas: (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__?.getViewportCanvas() !== canvas,
                };
              } finally {
                clearTimeout(recoveryTimeoutTimer);
                canvas.removeEventListener('webglcontextlost', onLoss);
              }
            },
            {
              root: before.root.digest,
              candidate: before.inventory.candidateSceneId,
              unit: before.inventory.unitId,
              pose: before.inventory.poseRevision,
            },
          ),
    ]);
    try {
      await target.expectVisible(selectors.getByText('Graphics context lost', { exact: true }), 30_000);
      const retry = selectors
        .getByTestId('cad-viewer-canvas-region')
        .getByRole('button', { name: 'Retry', exact: true });
      await target.expectVisible(retry, 30_000);
      await target.click(retry);
      const [outcome] = await observed;
      if (outcome.status === 'rejected') {
        const error: unknown = outcome.reason;
        throw error;
      }
      const expectedRetirement = {
        retiredCanvasDisconnected: true,
        retiredSubjectCurrent: false,
        retiredDrawUnavailable: true,
        retiredTaggedResourcesUnavailable: true,
        retiredReaderDenied: true,
        newCanvas: true,
      };
      expect(outcome.value).toMatchObject(expectedRetirement);
      if (backend === 'webgpu') {
        if (!nativeBefore) {
          throw new Error('The held native recovery hardware identity is unavailable.');
        }
        expect(outcome.value).toMatchObject({
          nativeDeviceLoss: { reason: 'unknown' },
          renderDevice: nativeBefore.renderer.renderDevice,
        });
      } else {
        expect(outcome.value).toEqual({
          nativeEventTrusted: true,
          nativeEventPrevented: true,
          lostContext: true,
          ...expectedRetirement,
        });
      }
      await target.expectGraphicsBackend(backend);
      await waitS15Current();
      const restored = await readS15State();
      const pinAfter = await readScaleCommittedPin();
      expect(s15Identity(restored)).toEqual(s15Identity(before));
      expect(restored.root).toEqual(before.root);
      expect(restored.definitions).toBe(before.definitions);
      expect(restored.occurrences).toBe(before.occurrences);
      expect(restored.inventory.candidateSceneId).not.toBe(before.inventory.candidateSceneId);
      expect(restored.selected).toEqual(before.selected);
      expect(restored.camera).toEqual(before.camera);
      expect(restored.renderer.api).toBe(backend);
      expect(restored.resources.at(-1)?.detail?.['viewportActorSessionId']).toBe(viewportSession);
      expect(restored.componentNames).toEqual(before.componentNames);
      expect(restored.inventory.surfaces.map(({ componentId, drawTriangles }) => [componentId, drawTriangles])).toEqual(
        before.inventory.surfaces.map(({ componentId, drawTriangles }) => [componentId, drawTriangles]),
      );
      expect(
        restored.inventory.surfaces.every(
          ({ drawGeometryId, canonicalGeometryId }) => drawGeometryId === canonicalGeometryId,
        ),
      ).toBe(true);
      expect(s15Edges(restored)).toEqual(s15Edges(before));
      expect(restored.inventory.residentMandatoryEdgeTriangles).toBe(before.inventory.residentMandatoryEdgeTriangles);
      expect(pinAfter.root).toEqual(pinBefore.root);
      expect(pinAfter.byteDenominators).toEqual(pinBefore.byteDenominators);
      expect(pinAfter.sampledGlb).toEqual(pinBefore.sampledGlb);
      expect(pinAfter.diagnostics.projectId).toBe(pinBefore.diagnostics.projectId);
      const mountedAfter = await readS16MountedHelperResources();
      expect(mountedAfter.identity).toMatchObject({
        root: restored.root.digest,
        candidateSceneId: restored.inventory.candidateSceneId,
        presentationRevision: restored.inventory.presentationRevision,
        unitId: restored.inventory.unitId,
        poseRevision: restored.inventory.poseRevision,
      });
      expect(mountedAfter.identity.candidateSceneId).not.toBe(mountedBefore.identity.candidateSceneId);
      for (const counts of Object.values(mountedAfter.taggedResources)) {
        for (const value of Object.values(counts)) {
          expect(Number.isSafeInteger(value) && value >= 0).toBe(true);
        }
      }
      const nativeAfter = backend === 'webgpu' ? await captureScaleViewportEvidence(true) : undefined;
      if (nativeAfter) {
        expect(nativeAfter.identity).toMatchObject({
          root: restored.root.digest,
          candidateSceneId: restored.inventory.candidateSceneId,
          unitId: restored.inventory.unitId,
          poseRevision: restored.inventory.poseRevision,
          viewportActorSessionId: viewportSession,
          backend,
        });
        const { renderDevice } = nativeAfter.renderer;
        if (renderDevice?.status !== 'observed') {
          throw new Error('The actual replacement recovery device identity is unavailable.');
        }
        expect(
          classifyWebGpuAdapter({
            vendor: renderDevice.vendor,
            architecture: renderDevice.architecture,
            device: renderDevice.device,
            description: renderDevice.description,
            fallback: renderDevice.isFallbackAdapter,
          }),
        ).toBe('hardware');
        expect(renderDevice.canvasMatches).toBe(true);
        expect(renderDevice.source).toBe('mounted-webgpu-canvas-device');
        expect(renderDevice.configuredDeviceMatches).toBe(true);
        if (renderDevice.isFallbackAdapter !== undefined) {
          expect(renderDevice.isFallbackAdapter).toBe(false);
        }
      }
      const restoredImage = await captureS15Frame(`s16-${backend}-recovery-restored.png`, restored);
      const restoredVisiblePixels = await captureVisibleGeometry(`s16-${backend}-recovery-after`, restored);
      await target.writeArtifact(
        `s16-${backend}-pinned-viewport-recovery.json`,
        JSON.stringify(
          {
            backend,
            profile: target.currentWebGpuProfile(),
            nativeLoss: outcome.value,
            nativeBefore,
            nativeAfter,
            mountedHelperResources: {
              before: mountedBefore,
              restored: mountedAfter,
              semantics:
                'Current mounted tagged CPU views and handles only; detached worker, WASM, material textures, renderer and driver storage excluded.',
            },
            before,
            restored,
            pinBefore,
            pinAfter,
            beforeVisiblePixels,
            restoredVisiblePixels,
            footprintBefore: s15Footprint(before),
            footprintRestored: s15Footprint(restored),
            pixels: await compareScalePngFrames(beforeImage, restoredImage),
            qualification:
              'Actual untimed native viewport loss/DOM Retry, immutable pin/root/unit/pose/selection and canonical draw recovery, positive face and mandatory-edge pixels; no invented tolerance, recovery latency or complete GPU residency claim.',
          },
          undefined,
          2,
        ),
      );
    } finally {
      // Drain the already observed bounded evaluation even if a DOM action/assertion failed first.
      await observed;
    }
  },
);

test.each(['WebGL', 'WebGPU'])(
  'S16 live assembly CPU owners should release candidates and plateau across eviction with an isolated sibling on %s',
  async (backendName) => {
    const backend = backendName === 'WebGPU' ? 'webgpu' : 'webgl';
    const nearCamera = { position: [0.2, 1, 0.2], target: [0.2, 0, 0.2], fov: 30, zoom: 1 } as const;
    const farCamera = { ...nearCamera, position: [100, 1, 100], target: [100, 0, 100] } as const;
    await openS15('scale-123', backend, nearCamera);
    const initial = await readS16LiveAssemblyResources();
    expect(initial.visibleSurfaces).toBeGreaterThan(0);
    expect(initial.resources.current.bufferCount).toBeGreaterThan(0);
    expect(initial.resources.current.payloadBytes).toBeGreaterThan(0);
    expect(initial.resources.current.payloadBytes).toBeLessThanOrEqual(initial.resources.current.backingBytes);
    expect(initial.resources.candidate).toBeUndefined();
    expect(initial.resources.retiredOwnerCount).toBe(0);
    expect(initial.resources.union).toEqual(initial.resources.current);

    await target.openSecondary(`/__e2e/project-file-tree?main=scale-detail-calibration&graphicsBackend=${backend}`);
    let receipt: Readonly<Record<string, unknown>> | undefined;
    try {
      await target.setViewport({ width: 1920, height: 1080 }, 'secondary');
      await target.waitFor(
        () => {
          const bridge = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__;
          return Boolean(
            bridge?.getCommittedAssembly().isCurrent() &&
            bridge.getCommittedDrawInventory()?.surfaces.length &&
            bridge.getLiveAssemblyResourceInventory(),
          );
        },
        undefined,
        { surface: 'secondary', timeout: 60_000 },
      );
      const sibling = await readS16LiveAssemblyResources('secondary');
      expect(typeof initial.projectId).toBe('string');
      expect(typeof sibling.projectId).toBe('string');
      expect(sibling.projectId).not.toBe(initial.projectId);
      expect(sibling.identity.root).not.toBe(initial.identity.root);
      expect(sibling.resources.current.bufferCount).toBeGreaterThan(0);
      const unchangedPrimary = await readS16LiveAssemblyResources();
      expect(unchangedPrimary.resources).toEqual(initial.resources);

      const policy = {
        triangleRatio: 0.5,
        approximateRelativeError: 0.05,
        screenSpace: { maxApproximatePixelError: Number.MAX_VALUE, enterDetailRatio: 0.6 },
      };
      const overlap = await target.evaluate(async (next) => {
        const bridge = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__;
        const held = bridge?.getCommittedDrawInventory();
        const subject = bridge?.getCommittedAssembly();
        if (!bridge || !held || !subject?.assemblyDisplay || !subject.isCurrent()) {
          throw new Error('The live overlap has no current initial assembly owner.');
        }
        if (!bridge.armAssemblyAdmissionResourceInventory()) {
          throw new Error('The current assembly owner refused the private admission observation.');
        }
        try {
          bridge.setAssemblyDetailCalibration(next);
          const started = performance.now();
          while (performance.now() - started < 30_000) {
            const captured = bridge.takeAssemblyAdmissionResourceInventory();
            if (captured) {
              return captured;
            }
            const draw = bridge.getCommittedDrawInventory();
            if (
              !subject.isCurrent() ||
              draw?.key !== held.key ||
              draw.unitId !== held.unitId ||
              draw.poseRevision !== held.poseRevision
            ) {
              throw new Error('The overlap changed its root, unit or pose before the admission observation.');
            }
            if (draw.candidateSceneId !== held.candidateSceneId) {
              break;
            }
            // Only the scalar one-shot admission record is polled; unarmed frames perform no resource traversal.
            // oxlint-disable-next-line no-await-in-loop -- One real candidate is observed in order.
            await new Promise<void>((resolve) => {
              setTimeout(resolve, 1);
            });
          }
          throw new Error('The real current/candidate admission snapshot was unavailable.');
        } finally {
          bridge.clearAssemblyAdmissionResourceInventory();
        }
      }, policy);
      const { candidate } = overlap.resources;
      if (!candidate) {
        throw new Error('The candidate owner was absent from the overlap observation.');
      }
      expect(overlap.held.key).toBe(initial.identity.root);
      expect(overlap.held.sceneId).toBe(initial.identity.sceneId);
      expect(overlap.held.unitId).toBe(initial.identity.unitId);
      expect(overlap.held.poseRevision).toBe(initial.identity.poseRevision);
      expect(candidate.key).toBe(initial.identity.root);
      expect(candidate.unitId).toBe(initial.identity.unitId);
      expect(candidate.sceneId).not.toBe(initial.identity.sceneId);
      for (const dimension of ['bufferCount', 'backingBytes', 'payloadBytes'] as const) {
        expect(overlap.resources.union[dimension]).toBeGreaterThanOrEqual(overlap.resources.current[dimension]);
        expect(overlap.resources.union[dimension]).toBeGreaterThanOrEqual(candidate[dimension]);
        expect(overlap.resources.union[dimension]).toBeLessThanOrEqual(
          overlap.resources.current[dimension] + candidate[dimension],
        );
      }
      await target.waitFor(
        (oldScene) => {
          const bridge = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__;
          const draw = bridge?.getCommittedDrawInventory();
          const live = bridge?.getLiveAssemblyResourceInventory();
          return Boolean(
            draw && live && draw.candidateSceneId !== oldScene && !live.candidate && live.retiredOwnerCount === 0,
          );
        },
        initial.identity.sceneId,
        { timeout: 60_000 },
      );
      const admitted = await readS16LiveAssemblyResources();
      expect(admitted.identity.root).toBe(initial.identity.root);
      expect(admitted.identity.unitId).toBe(initial.identity.unitId);
      expect(admitted.identity.poseRevision).toBe(initial.identity.poseRevision);
      expect(admitted.resources.union).toEqual(admitted.resources.current);

      const evictAndRestore = async (): Promise<Readonly<{ low: S16ExactAssemblyCpu; high: S16ExactAssemblyCpu }>> => {
        const before = await readS16LiveAssemblyResources();
        await target.evaluate((camera) => {
          (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__?.setCamera(camera);
        }, farCamera);
        await target.waitFor(
          (oldScene) => {
            const bridge = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__;
            const draw = bridge?.getCommittedDrawInventory();
            const live = bridge?.getLiveAssemblyResourceInventory();
            return Boolean(
              draw &&
              live &&
              draw.candidateSceneId !== oldScene &&
              draw.surfaces.length === 0 &&
              !live.candidate &&
              live.retiredOwnerCount === 0,
            );
          },
          before.identity.sceneId,
          { timeout: 60_000 },
        );
        const evicted = await readS16LiveAssemblyResources();
        expect(evicted.identity.root).toBe(initial.identity.root);
        expect(evicted.resources.union).toEqual(evicted.resources.current);
        expect(evicted.resources.current.backingBytes).toBeLessThan(admitted.resources.current.backingBytes);
        await target.evaluate((camera) => {
          (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__?.setCamera(camera);
        }, nearCamera);
        await target.waitFor(
          (oldScene) => {
            const bridge = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__;
            const draw = bridge?.getCommittedDrawInventory();
            const live = bridge?.getLiveAssemblyResourceInventory();
            return Boolean(
              draw &&
              live &&
              draw.candidateSceneId !== oldScene &&
              draw.surfaces.length > 0 &&
              !live.candidate &&
              live.retiredOwnerCount === 0,
            );
          },
          evicted.identity.sceneId,
          { timeout: 60_000 },
        );
        const restored = await readS16LiveAssemblyResources();
        expect(restored.identity.root).toBe(initial.identity.root);
        expect(restored.identity.unitId).toBe(initial.identity.unitId);
        expect(restored.identity.poseRevision).toBe(initial.identity.poseRevision);
        const unchangedSibling = await readS16LiveAssemblyResources('secondary');
        expect(unchangedSibling.resources).toEqual(sibling.resources);
        return { low: evicted.resources.current, high: restored.resources.current };
      };
      const firstCycle = await evictAndRestore();
      const secondCycle = await evictAndRestore();
      expect(secondCycle.low).toEqual(firstCycle.low);
      expect(secondCycle.high).toEqual(firstCycle.high);
      expect(secondCycle.high.backingBytes).toBeLessThanOrEqual(admitted.resources.current.backingBytes);
      receipt = { initial, sibling, overlap, admitted, firstCycle, secondCycle };
    } finally {
      await target.closeSecondary();
    }
    const afterSiblingClose = await readS16LiveAssemblyResources();
    expect(afterSiblingClose.identity.root).toBe(initial.identity.root);
    expect(afterSiblingClose.resources.candidate).toBeUndefined();
    await target.writeArtifact(
      `s16-${backend}-live-assembly-cpu-owners.json`,
      JSON.stringify(
        {
          backend,
          ...receipt,
          afterSiblingClose,
          denominator:
            'Actual live assembly-owned compressed, geometry, parser and instance typed-array backing bytes and deduplicated payload ranges. Candidate/retired counts are current owner snapshots, never retained telemetry maxima. Texture, demand-index, metadata, worker/WASM, Three object heap, backend upload and physical driver/GPU storage are excluded.',
          qualification:
            'Selected current/candidate overlap, two actual demand eviction/revisit cycles, and independent disposable sibling project; untimed private census only.',
        },
        undefined,
        2,
      ),
    );
  },
);

// Four finite mounted acquisitions reuse the actual builtin sources and original immutable upstream pins.
// These are raw steady-view samples, not cold GPU or mixed performance acceptance.
for (const fixture of [
  {
    family: 'jscad',
    locator: 'replicad.jscad-part-reuse',
    upstreamPin: {
      path: 'assets/parts/sha256/37abc4a76a40d8a873508b9a6ffdd63e238ad97099974236d5407ac0aeff539a.json',
      digest: 'sha256:37abc4a76a40d8a873508b9a6ffdd63e238ad97099974236d5407ac0aeff539a',
    },
    upstreamVariant: {
      glb: {
        byteLength: 2176,
        digest: 'sha256:d1d3ef242297494b845679c84fdcbe1b0a27e97938d1720772a493885c7e0043',
        path: 'assets/sha256/d1d3ef242297494b845679c84fdcbe1b0a27e97938d1720772a493885c7e0043.glb',
      },
      source: {
        entry: 'upstream.ts',
        files: {
          'upstream.settings.ts': 'sha256:9837478c9eea098be68e06ae4085695897d43a6442d78752b02784775c2ffa64',
          'upstream.ts': 'sha256:79380e83e85ef8750442497dd0421234148da61b240554263c230acc9c8365c0',
        },
      },
    },
    seedFiles: [
      ['assembly.json', 'sha256:3f00eb8a6841ae73a54510aecc591c675ee0b942391c6e020281b6a6034ed84c', 840],
      [
        'assets/63bf3bbf0eabc8d3835731c9cbd3e1361234fee9b21b6f58a91651129d806d14.stl',
        'sha256:63bf3bbf0eabc8d3835731c9cbd3e1361234fee9b21b6f58a91651129d806d14',
        1287,
      ],
      [
        'assets/parts/sha256/37abc4a76a40d8a873508b9a6ffdd63e238ad97099974236d5407ac0aeff539a.json',
        'sha256:37abc4a76a40d8a873508b9a6ffdd63e238ad97099974236d5407ac0aeff539a',
        473,
      ],
      [
        'assets/sha256/8d4ee96e19ccb3dc342d49d48d3d3578ee976edde9891dd8d7e724851a4f1374.glb',
        'sha256:8d4ee96e19ccb3dc342d49d48d3d3578ee976edde9891dd8d7e724851a4f1374',
        5560,
      ],
      [
        'assets/sha256/d1d3ef242297494b845679c84fdcbe1b0a27e97938d1720772a493885c7e0043.glb',
        'sha256:d1d3ef242297494b845679c84fdcbe1b0a27e97938d1720772a493885c7e0043',
        2176,
      ],
      ['downstream.settings.ts', 'sha256:021a9d6132282d8264547fed9da8909a6fa0a8b546f8630db830f54a0fbe84f9', 30],
      ['main.ts', 'sha256:3f3d5140e3a6f8fe9c25dfe593eabdc2555c2bd438e53d258ba41dbac5e48c95', 531],
      ['upstream-asset.ts', 'sha256:786106b44771e04a7c7b7f56ecf62aad78c412858fe84c7da132c4e052110342', 153],
      ['upstream.settings.ts', 'sha256:9837478c9eea098be68e06ae4085695897d43a6442d78752b02784775c2ffa64', 31],
      ['upstream.ts', 'sha256:79380e83e85ef8750442497dd0421234148da61b240554263c230acc9c8365c0', 246],
    ] as const,
  },
  {
    family: 'picovoxel',
    locator: 'replicad.picovoxel-part-reuse',
    upstreamPin: {
      path: 'assets/parts/sha256/1b2375ceb1e85a447db1574b7b7dc61ffa51fcde8e8477453024a3955d4cc840.json',
      digest: 'sha256:1b2375ceb1e85a447db1574b7b7dc61ffa51fcde8e8477453024a3955d4cc840',
    },
    upstreamVariant: {
      glb: {
        byteLength: 56_756,
        digest: 'sha256:608b1367792a8930a2d4752ed6dacbfdbc09acb36f517f94169da1f4f9ad57fc',
        path: 'assets/sha256/608b1367792a8930a2d4752ed6dacbfdbc09acb36f517f94169da1f4f9ad57fc.glb',
      },
      source: {
        entry: 'upstream.ts',
        files: {
          'upstream.settings.ts': 'sha256:9837478c9eea098be68e06ae4085695897d43a6442d78752b02784775c2ffa64',
          'upstream.ts': 'sha256:84fb3599674929a1ab7edafe646b43be9045db252e252bc6b86fbe42614f753f',
        },
      },
    },
    seedFiles: [
      ['assembly.json', 'sha256:2fd1abe99f1643731dc82b7f101c97cbf1338f3a3be215d7581ec544845463e0', 840],
      [
        'assets/acfe1666f31a168abad79917b7619cdeac11621581e143223f1f5cbe795b2681.stl',
        'sha256:acfe1666f31a168abad79917b7619cdeac11621581e143223f1f5cbe795b2681',
        115_884,
      ],
      [
        'assets/parts/sha256/1b2375ceb1e85a447db1574b7b7dc61ffa51fcde8e8477453024a3955d4cc840.json',
        'sha256:1b2375ceb1e85a447db1574b7b7dc61ffa51fcde8e8477453024a3955d4cc840',
        474,
      ],
      [
        'assets/sha256/608b1367792a8930a2d4752ed6dacbfdbc09acb36f517f94169da1f4f9ad57fc.glb',
        'sha256:608b1367792a8930a2d4752ed6dacbfdbc09acb36f517f94169da1f4f9ad57fc',
        56_756,
      ],
      [
        'assets/sha256/fdfc0f37e3614a0ebe01d8cfab5ac7e753186f9a76a81e9b5120215409b64e1e.glb',
        'sha256:fdfc0f37e3614a0ebe01d8cfab5ac7e753186f9a76a81e9b5120215409b64e1e',
        189_160,
      ],
      ['downstream.settings.ts', 'sha256:021a9d6132282d8264547fed9da8909a6fa0a8b546f8630db830f54a0fbe84f9', 30],
      ['main.ts', 'sha256:3f3d5140e3a6f8fe9c25dfe593eabdc2555c2bd438e53d258ba41dbac5e48c95', 531],
      ['upstream-asset.ts', 'sha256:6130de868a1df7add5581afe90769d4f988dc8ca8b7c10cb69771c34201b5c6e', 153],
      ['upstream.settings.ts', 'sha256:9837478c9eea098be68e06ae4085695897d43a6442d78752b02784775c2ffa64', 31],
      ['upstream.ts', 'sha256:84fb3599674929a1ab7edafe646b43be9045db252e252bc6b86fbe42614f753f', 258],
    ] as const,
  },
]) {
  for (const cachedWatch of [false, true]) {
    test.each(['WebGL', 'WebGPU'])(
      cachedWatch
        ? `C4 cached mounted mixed ${fixture.family} %s should reacquire the unchanged authored pin and watch only the changed dependency`
        : `S16 mounted mixed ${fixture.family} %s should retain the original pin and acquire owned raw presentation`,
      async (backendName) => {
        const backend = backendName === 'WebGL' ? 'webgl' : 'webgpu';
        await target.setViewport({ width: 1920, height: 1080 });
        const route = `/__e2e/example-fixture?locator=${fixture.locator}&graphicsBackend=${backend}`;
        await target.navigate(route);
        await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 60_000);
        await target
          .click(selectors.getByRole('button', { name: /^decline$/iu }), { timeout: 5000 })
          .catch(() => undefined);
        await target.expectGeometryFramed();
        await target.expectGraphicsBackend(backend);
        await expect
          .poll(
            async () => {
              try {
                const ordinary = await target.evaluate(() => {
                  const bridge = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__;
                  const subject = bridge?.getCommittedAssembly();
                  if (!bridge || !subject) {
                    throw new Error('The ordinary mixed viewport is unavailable.');
                  }
                  return {
                    diagnostics: subject.diagnostics,
                    root: subject.assemblyDisplay?.root,
                    assemblyCurrent: subject.isCurrent(),
                    draw: bridge.getCommittedDrawInventory(),
                  };
                });
                assertOrdinaryParityDiagnostics(ordinary.diagnostics, 'main.ts');
                return ordinary.root === undefined && !ordinary.assemblyCurrent && ordinary.draw === undefined;
              } catch {
                return false;
              }
            },
            { timeout: 60_000 },
          )
          .toBe(true);
        const initialExecutable = await readMixedCadSubject();
        assertOrdinaryParityDiagnostics(initialExecutable.diagnostics, 'main.ts');
        expect(initialExecutable.root).toBeUndefined();
        expect(initialExecutable.assemblyCurrent).toBe(false);
        expect(initialExecutable.draw).toBeUndefined();
        const { projectId } = initialExecutable.diagnostics;
        if (!projectId) {
          throw new Error('The fresh mixed fixture project has no actual identity.');
        }
        expect(initialExecutable.diagnostics.sourceEntryPath).toBe('main.ts');
        const prefix = `${cachedWatch ? 'c4-cached-watch' : 's16-mixed'}-${fixture.family}-${backend}-${projectId}`;
        await target.writeArtifact(
          `${prefix}-initial-executable.json`,
          JSON.stringify({ route, initialExecutable }, undefined, 2),
        );
        await target.click(selectors.getByRole('button', { name: 'Search', exact: true }));
        await target.fill(selectors.getByPlaceholder('Search projects, chats, and actions…'), 'Open files');
        await target.click(selectors.getByText('Open files', { exact: true }));
        const originalDownloads: Array<{ path: string; digest: string; byteLength: number; bytes: readonly number[] }> =
          [];
        // Explorer Download uses the existing project authority. The managed publication reader stays closure-only.
        /* oxlint-disable no-await-in-loop -- Each actual project-owned Download and current-project fence must finish before the next menu gesture. */
        for (const [path, expectedDigest, expectedByteLength] of fixture.seedFiles) {
          const separator = path.lastIndexOf('/');
          const directory = separator === -1 ? '' : path.slice(0, separator);
          if (directory) {
            await expandPath(directory);
          }
          await target.expectVisible(treeItem(path));
          await target.scrollIntoView(treeItem(path));
          await target.evaluate((held) => {
            const diagnostics = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__?.getCommittedAssembly()
              .diagnostics;
            if (diagnostics?.projectId !== held || diagnostics.sourceEntryPath !== 'main.ts') {
              throw new Error('The seeded project changed before its original Download.');
            }
          }, projectId);
          await target.click(treeItem(path), { button: 'right' });
          const file = await target.download(selectors.getByRole('menuitem', { name: 'Download', exact: true }));
          const bytes = base64ToUint8Array(file.base64);
          const digest = `sha256:${[...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
          // Retain actual bytes before comparisons so a failed seeding assertion remains independently inspectable.
          await target.writeArtifact(
            `${prefix}-seed-${path.replaceAll('/', '-')}.json`,
            JSON.stringify(
              {
                projectId,
                path,
                expected: { digest: expectedDigest, byteLength: expectedByteLength },
                suggestedFilename: file.suggestedFilename,
                digest,
                byteLength: bytes.byteLength,
                base64: file.base64,
              },
              undefined,
              2,
            ),
          );
          expect(digest).toBe(expectedDigest);
          expect(bytes.byteLength).toBe(expectedByteLength);
          await target.evaluate((held) => {
            const diagnostics = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__?.getCommittedAssembly()
              .diagnostics;
            if (diagnostics?.projectId !== held || diagnostics.sourceEntryPath !== 'main.ts') {
              throw new Error('The seeded project changed during its original Download.');
            }
          }, projectId);
          originalDownloads.push({ path, digest, byteLength: bytes.byteLength, bytes: [...bytes] });
        }
        /* oxlint-enable no-await-in-loop */

        // Opening main.ts between the two assembly gestures makes the latter a real cached reopen, not a no-op.
        const assemblyStages = [];
        /* oxlint-disable no-await-in-loop -- Actual Explorer openings and their admission fences are sequential stages in one project. */
        for (const entry of ['assembly.json', 'main.ts', 'assembly.json']) {
          await target.expectVisible(treeItem(entry));
          await target.scrollIntoView(treeItem(entry));
          await target.click(treeItem(entry), { button: 'right' });
          await target.click(selectors.getByRole('menuitem', { name: 'Open in Viewer', exact: true }));
          await target.waitFor(
            (expected) => {
              const diagnostics = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__?.getCommittedAssembly()
                .diagnostics;
              return diagnostics?.projectId === expected.projectId && diagnostics.sourceEntryPath === expected.entry;
            },
            { projectId, entry },
            { timeout: 60_000 },
          );
          await target.expectGeometryFramed();
          if (entry === 'main.ts') {
            await expect
              .poll(
                async () => {
                  try {
                    const ordinary = await target.evaluate(() => {
                      const bridge = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__;
                      const subject = bridge?.getCommittedAssembly();
                      if (!bridge || !subject) {
                        throw new Error('The reopened ordinary mixed viewport is unavailable.');
                      }
                      return {
                        diagnostics: subject.diagnostics,
                        root: subject.assemblyDisplay?.root,
                        assemblyCurrent: subject.isCurrent(),
                        draw: bridge.getCommittedDrawInventory(),
                      };
                    });
                    assertOrdinaryParityDiagnostics(ordinary.diagnostics, 'main.ts');
                    return (
                      ordinary.diagnostics.projectId === projectId &&
                      ordinary.root === undefined &&
                      !ordinary.assemblyCurrent &&
                      ordinary.draw === undefined
                    );
                  } catch {
                    return false;
                  }
                },
                { timeout: 60_000 },
              )
              .toBe(true);
            const intermediateExecutable = await target.evaluate(() => {
              const bridge = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__;
              const subject = bridge?.getCommittedAssembly();
              if (!bridge || !subject) {
                throw new Error('The presented intermediate executable is unavailable.');
              }
              return {
                diagnostics: subject.diagnostics,
                root: subject.assemblyDisplay?.root,
                assemblyCurrent: subject.isCurrent(),
                draw: bridge.getCommittedDrawInventory(),
                camera: bridge.getCamera(),
                renderer: bridge.getRendererIdentity(),
                timeOrigin: performance.timeOrigin,
                observedAt: performance.now(),
              };
            });
            await target.writeArtifact(
              `${prefix}-intermediate-executable.json`,
              JSON.stringify(intermediateExecutable, undefined, 2),
            );
            assertOrdinaryParityDiagnostics(intermediateExecutable.diagnostics, 'main.ts');
            expect(intermediateExecutable.diagnostics.projectId).toBe(projectId);
            expect(intermediateExecutable.root).toBeUndefined();
            expect(intermediateExecutable.assemblyCurrent).toBe(false);
            expect(intermediateExecutable.draw).toBeUndefined();
            continue;
          }
          await waitS15Current();
          // Preserve the actual closed owner before closure reads can evict its retained telemetry.
          const stageSubject = cachedWatch ? await readMixedCadSubject() : undefined;
          const [pinResult] = await Promise.allSettled([readScaleCommittedPin(originalDownloads)]);
          if (pinResult.status === 'rejected') {
            // The browser command owns the current page console; retain only this failed project’s existing read diagnostic.
            await Promise.allSettled([
              Promise.resolve().then(async () => {
                const events = await target.events();
                await target.writeArtifact(
                  `${prefix}-first-pin-read-failure.json`,
                  JSON.stringify(
                    {
                      projectId,
                      consoleMessages: events.consoleMessages.filter(
                        ({ text }) => text.includes('Scale committed pin read failure') && text.includes(projectId),
                      ),
                      pageErrors: events.pageErrors,
                    },
                    undefined,
                    2,
                  ),
                );
              }),
            ]);
            const error: unknown = pinResult.reason;
            throw error;
          }
          const pin = pinResult.value;
          if (assemblyStages.length === 0) {
            await expect(readScaleCommittedPin()).rejects.toThrow('Original external closure Download is unavailable.');
            await expect(
              readScaleCommittedPin(
                originalDownloads.map((file) =>
                  file.path === fixture.upstreamPin.path ? { ...file, bytes: [] } : file,
                ),
              ),
            ).rejects.toThrow('Original external closure Download differs from the admitted reference.');
          }
          const publication = await target.evaluate(
            (held) => {
              const bridge = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__;
              const subject = bridge?.getCommittedAssembly();
              const display = subject?.assemblyDisplay;
              const draw = bridge?.getCommittedDrawInventory();
              if (
                !bridge ||
                !subject?.isCurrent() ||
                !display ||
                draw?.key !== held.root ||
                display.root.digest !== held.root ||
                subject.diagnostics.projectId !== held.projectId ||
                subject.diagnostics.sourceEntryPath !== 'assembly.json'
              ) {
                throw new Error('The mixed publication changed while inspecting its admitted source identities.');
              }
              const wrappers = draw.canonicalComponents.filter(
                ({ ancestry }) => ancestry.length === 1 && ancestry[0] === 'assembly',
              );
              const bodies = draw.canonicalComponents.filter(
                ({ ancestry, component }) =>
                  ancestry.length === 2 &&
                  ancestry[0] === 'assembly' &&
                  draw.surfaces.some(({ componentId }) => componentId === component.id),
              );
              return {
                publication: display.admitted.publication,
                diagnostics: subject.diagnostics,
                wrappers: wrappers.map(({ component, ancestry }) => ({ id: component.id, ancestry })),
                bodies: bodies.map(({ component, ancestry }) => ({ id: component.id, ancestry })),
                canonicalComponentCount: draw.canonicalComponents.length,
                canonicalComponents: draw.canonicalComponents,
                surfaceBodyCount: bodies.length,
                surfaceBodyIds: [...new Set(draw.surfaces.map(({ componentId }) => componentId))],
                timeOrigin: performance.timeOrigin,
                observedAt: performance.now(),
              };
            },
            { projectId, root: pin.root.digest },
          );
          await target.writeArtifact(
            `${prefix}-${assemblyStages.length === 0 ? 'authored-publication' : 'cached-reopen'}.json`,
            JSON.stringify({ pin, publication }, undefined, 2),
          );
          expect(pin.diagnostics.projectId).toBe(projectId);
          expect(pin.diagnostics.requestedKey).toBe(pin.root.digest);
          expect(pin.diagnostics.presentedKey).toBe(pin.root.digest);
          expect(pin.definitions).toBe(2);
          expect(pin.occurrences).toBe(1);
          expect(Object.keys(publication.publication.parts).sort()).toEqual(['downstream', 'upstream']);
          expect(publication.publication.occurrences.map(({ id }) => id)).toEqual(['assembly']);
          expect(
            publication.publication.occurrences.map(({ children }) => children?.map(({ id, part }) => ({ id, part }))),
          ).toEqual([
            [
              { id: 'source-mesh', part: 'upstream' },
              { id: 'mount', part: 'downstream' },
            ],
          ]);
          expect(publication.wrappers).toHaveLength(1);
          // Two logical leaves contain three actual surface-owning source bodies: one upstream, two downstream.
          expect(publication.bodies).toHaveLength(3);
          expect(publication.bodies.filter(({ ancestry }) => ancestry[1] === 'source-mesh')).toHaveLength(1);
          expect(publication.bodies.filter(({ ancestry }) => ancestry[1] === 'mount')).toHaveLength(2);
          expect(publication.bodies.map(({ id }) => id).sort()).toEqual([...publication.surfaceBodyIds].sort());
          const expectedUpstreamRecord = fixture.seedFiles.find(([path]) => path === fixture.upstreamPin.path);
          if (!expectedUpstreamRecord) {
            throw new Error('The original upstream record byte denominator is unavailable.');
          }
          expect(
            pin.byteDenominators.files.some(
              ({ kind, digest, byteLength }) =>
                kind === 'record' && digest === fixture.upstreamPin.digest && byteLength === expectedUpstreamRecord[2],
            ),
          ).toBe(true);
          const upstream = publication.publication.parts['upstream']?.variants['default'];
          expect(upstream?.source).toEqual(fixture.upstreamVariant.source);
          expect(upstream?.glb.digest).toBe(fixture.upstreamVariant.glb.digest);
          expect(upstream?.glb.byteLength).toBe(fixture.upstreamVariant.glb.byteLength);
          // Original JSCAD upstream is surface-only; mandatory edge counts below describe the actual mixed draw.
          const downstream = publication.publication.parts['downstream']?.variants['default'];
          expect(downstream?.source.entry).toBe('main.ts');
          for (const path of [
            'main.ts',
            'downstream.settings.ts',
            'upstream-asset.ts',
            fixture.seedFiles.find(([path]) => path.endsWith('.stl'))?.[0],
          ]) {
            const expected = fixture.seedFiles.find(([filePath]) => filePath === path);
            if (!expected) {
              throw new Error('The frozen mixed source dependency is unavailable.');
            }
            expect(downstream?.source.files[expected[0]]).toBe(expected[1]);
          }
          assemblyStages.push({ pin, publication, stageSubject });
        }
        /* oxlint-enable no-await-in-loop */
        const [first, reopened] = assemblyStages;
        if (!first || !reopened) {
          throw new Error('Both actual mixed assembly stages are required.');
        }
        expect(reopened.pin.root).toEqual(first.pin.root);
        expect(reopened.pin.byteDenominators).toEqual(first.pin.byteDenominators);
        expect(reopened.publication.publication).toEqual(first.publication.publication);
        if (!cachedWatch) {
          await openS15ModelPane();
          const fitted = await readS15State();
          // Use the same explicit input for both routes; a fitted getter pose is not a setCamera input.
          const namedCamera = {
            position: [0.04, -0.08, 0.07],
            target: [0.004, 0, 0],
            bounds: fitted.camera.bounds,
            fov: 60,
            zoom: 1,
          } satisfies AssemblyTestCamera;
          const comparisonFrame = await target.evaluate((camera) => {
            const bridge = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__;
            if (!bridge) {
              throw new Error('The mixed comparison-camera owner is unavailable.');
            }
            bridge.setCamera(camera);
            return bridge.getRendererIdentity().frame;
          }, namedCamera);
          await target.waitFor((frame) => {
            const bridge = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__;
            return Boolean(bridge && bridge.getRendererIdentity().frame > frame);
          }, comparisonFrame);
          const named = await readS15State();
          expect(named.environment.dpr).toBe(1);
          expect(named.renderer.api).toBe(backend);
          expect(named.root).toEqual(reopened.pin.root);
          expect(named.inventory.residentMandatoryEdgeTriangles).toBeGreaterThan(0);
          const images: string[] = [];
          const [pixels] = await Promise.allSettled([
            (async () => {
              /* oxlint-disable no-await-in-loop -- Each settled presentation and owned PNG needs the preceding visibility/frame fence. */
              for (const presentation of [
                { name: 'hidden', surfaces: false, lines: false },
                { name: 'surface-only', surfaces: true, lines: false },
                { name: 'edge-only', surfaces: false, lines: true },
              ]) {
                await target.evaluate(
                  (next) => {
                    const bridge = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__;
                    if (!bridge) {
                      throw new Error('The mixed presentation owner is unavailable.');
                    }
                    bridge.setPresentation(next);
                  },
                  { surfaces: presentation.surfaces, lines: presentation.lines },
                );
                await target.waitFor(
                  (expected) => {
                    const draw = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__?.getCommittedDrawInventory();
                    return Boolean(
                      draw?.candidateSceneId === expected.candidate &&
                      draw.surfaces.every(({ visible }) => visible === expected.surfaces) &&
                      draw.edges.every(({ visible }) => visible === expected.lines),
                    );
                  },
                  {
                    candidate: named.inventory.candidateSceneId,
                    surfaces: presentation.surfaces,
                    lines: presentation.lines,
                  },
                );
                const frame = await target.evaluate(
                  (next) => {
                    const bridge = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__;
                    if (!bridge) {
                      throw new Error('The settled mixed presentation owner is unavailable.');
                    }
                    const previousFrame = bridge.getRendererIdentity().frame;
                    bridge.setPresentation(next);
                    return previousFrame;
                  },
                  { surfaces: presentation.surfaces, lines: presentation.lines },
                );
                // Demand redraw is only a PNG barrier, never a compositor presented timestamp.
                await target.waitFor((previous) => {
                  const bridge = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__;
                  return Boolean(bridge && bridge.getRendererIdentity().frame > previous);
                }, frame);
                const current = await readS15State();
                expect(s15Identity(current)).toEqual(s15Identity(named));
                expect(current.inventory.candidateSceneId).toBe(named.inventory.candidateSceneId);
                expect(current.camera).toEqual(named.camera);
                images.push(
                  presentation.name === 'hidden'
                    ? await target.screenshot(
                        selectors.getByTestId('cad-viewer-canvas-region'),
                        `${prefix}-named-${presentation.name}.png`,
                      )
                    : await captureS15Frame(`${prefix}-named-${presentation.name}.png`, named),
                );
                const after = await readS15State();
                expect(s15Identity(after)).toEqual(s15Identity(named));
                expect(after.camera).toEqual(named.camera);
              }
              /* oxlint-enable no-await-in-loop */
              const [hidden, surfaces, edges] = images;
              if (!hidden || !surfaces || !edges) {
                throw new Error('The named mixed PNG controls are incomplete.');
              }
              const [surfacePixels, edgePixels] = await Promise.all([
                compareScalePngFrames(hidden, surfaces),
                compareScalePngFrames(hidden, edges),
              ]);
              expect(surfacePixels.changedPixels).toBeGreaterThan(0);
              expect(edgePixels.changedPixels).toBeGreaterThan(0);
              return {
                images,
                surfacePixels,
                edgePixels,
                mandatoryEdgeTriangles: named.inventory.residentMandatoryEdgeTriangles,
              };
            })(),
          ]);
          const [restoration] = await Promise.allSettled([
            (async () => {
              const frame = await target.evaluate(() => {
                const bridge = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__;
                if (!bridge) {
                  throw new Error('The mixed full-presentation owner is unavailable.');
                }
                const previousFrame = bridge.getRendererIdentity().frame;
                bridge.setPresentation({ surfaces: true, lines: true });
                return previousFrame;
              });
              await target.waitFor(
                (expected) => {
                  const bridge = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__;
                  const draw = bridge?.getCommittedDrawInventory();
                  return Boolean(
                    bridge &&
                    draw?.candidateSceneId === expected.candidate &&
                    draw.surfaces.every(({ visible }) => visible) &&
                    draw.edges.every(({ visible }) => visible) &&
                    bridge.getRendererIdentity().frame > expected.frame,
                  );
                },
                { candidate: named.inventory.candidateSceneId, frame },
              );
            })(),
          ]);
          if (pixels.status === 'rejected') {
            const error: unknown = pixels.reason;
            throw error;
          }
          if (restoration.status === 'rejected') {
            const error: unknown = restoration.reason;
            throw error;
          }
          const full = await readS15State();
          expect(s15Identity(full)).toEqual(s15Identity(named));
          expect(full.camera).toEqual(named.camera);
          const namedImage = await captureS15Frame(`${prefix}-named-full.png`, full);
          const ordinaryControlSelected =
            (fixture.family === 'jscad' && backend === 'webgl') ||
            (fixture.family === 'picovoxel' && backend === 'webgpu');
          const namedRenderFrame = ordinaryControlSelected
            ? await target.evaluate(
                (held) => {
                  const bridge = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__;
                  const subject = bridge?.getCommittedAssembly();
                  if (
                    !bridge ||
                    !subject?.isCurrent() ||
                    subject.assemblyDisplay?.root.digest !== held.root ||
                    bridge.getCommittedDrawInventory()?.candidateSceneId !== held.candidate
                  ) {
                    throw new Error('The mixed named render frame is unavailable.');
                  }
                  return bridge.getRenderFrame();
                },
                { root: full.root.digest, candidate: full.inventory.candidateSceneId },
              )
            : undefined;
          const nativeBefore = await captureScaleViewportEvidence(true);
          expect(nativeBefore.identity.backend).toBe(backend);
          const { renderDevice } = nativeBefore.renderer;
          if (renderDevice?.status !== 'observed') {
            throw new Error('The actual mounted native implementation identity is unavailable.');
          }
          const adapter = {
            api: backend,
            name: renderDevice.description,
            implementation: classifyWebGpuAdapter({
              vendor: renderDevice.vendor,
              architecture: renderDevice.architecture,
              device: renderDevice.device,
              description: renderDevice.description,
              fallback: renderDevice.isFallbackAdapter,
            }),
          };
          await target.writeArtifact(
            `${prefix}-mounted-implementation.json`,
            JSON.stringify({ adapter, nativeBefore }, undefined, 2),
          );
          expect(adapter.implementation).toBe('hardware');
          expect(renderDevice.canvasMatches).toBe(true);
          expect(renderDevice.source).toBe(
            backend === 'webgpu' ? 'mounted-webgpu-canvas-device' : 'mounted-webgl-context',
          );
          if (backend === 'webgpu') {
            expect(renderDevice.configuredDeviceMatches).toBe(true);
            if (renderDevice.isFallbackAdapter !== undefined) {
              expect(renderDevice.isFallbackAdapter).toBe(false);
            }
          }
          const trajectoryBefore = await captureScaleViewportEvidence();
          const probe = await target.scalePresentationProbe(
            `${prefix}-steady-mounted`,
            'primary',
            fixture.family === 'picovoxel' && backend === 'webgpu'
              ? { traceFormat: 'proto', inputLineage: true }
              : undefined,
          );
          expect(probe.traceBytes).toBeGreaterThan(0);
          expect(probe.dataLossOccurred).toBe(false);
          expect(probe.presentationQualification).toBe('raw-probe-only');
          const trajectoryAfter = await captureScaleViewportEvidence();
          const { candidateSceneId: candidateBefore, ...heldBefore } = trajectoryBefore.identity;
          const { candidateSceneId: candidateAfter, ...heldAfter } = trajectoryAfter.identity;
          expect(heldAfter).toEqual(heldBefore);
          expect(trajectoryAfter.camera).not.toEqual(trajectoryBefore.camera);
          await target.writeArtifact(
            `${prefix}-trajectory.json`,
            JSON.stringify(
              {
                probe,
                trajectoryBefore,
                trajectoryAfter,
                candidateBoundary: { before: candidateBefore, after: candidateAfter },
              },
              undefined,
              2,
            ),
          );
          await target.evaluate((camera) => {
            const bridge = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__;
            if (!bridge) {
              throw new Error('The mixed named-camera owner is unavailable.');
            }
            bridge.setCamera(camera);
          }, namedCamera);
          await target.waitFor(
            (expected) => {
              const bridge = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__;
              const camera = bridge?.getCamera();
              return Boolean(
                camera?.position.every((value, axis) => Math.abs(value - expected.position[axis]!) < 1e-6) &&
                camera.target.every((value, axis) => Math.abs(value - expected.target[axis]!) < 1e-6) &&
                camera.requestedFov === expected.fov &&
                camera.zoom === expected.zoom,
              );
            },
            namedCamera,
            { timeout: 30_000 },
          );
          await waitS15Current();
          const nativeAfter = await captureScaleViewportEvidence(true);
          expect(nativeAfter.identity.root).toBe(nativeBefore.identity.root);
          expect(nativeAfter.identity.unitId).toBe(nativeBefore.identity.unitId);
          expect(nativeAfter.identity.poseRevision).toBe(nativeBefore.identity.poseRevision);
          expect(nativeAfter.renderer.renderDevice).toEqual(nativeBefore.renderer.renderDevice);
          const final = await readS15State();
          expect(s15Identity(final)).toEqual(s15Identity(named));
          for (const [actualCamera, expectedCamera] of [
            [nativeAfter.camera, nativeBefore.camera],
            [final.camera, named.camera],
          ]) {
            if (typeof expectedCamera !== 'object' || expectedCamera === null) {
              throw new TypeError('The mixed restoration camera is unavailable.');
            }
            const expectedFields = Object.fromEntries(
              Object.entries(expectedCamera).map(([key, value]: [string, unknown]) => {
                if (key === 'position' || key === 'quaternion') {
                  if (!Array.isArray(value)) {
                    throw new TypeError('The mixed restoration camera vector is unavailable.');
                  }
                  return [
                    key,
                    value.map((component: unknown) => {
                      if (typeof component !== 'number' || !Number.isFinite(component)) {
                        throw new TypeError('The mixed restoration camera vector is nonfinite.');
                      }
                      const expectedComponent: unknown = expect.closeTo(component, 12);
                      return expectedComponent;
                    }),
                  ];
                }
                if (key === 'clipping' || key === 'nativeClipping') {
                  if (typeof value !== 'object' || value === null) {
                    throw new TypeError('The mixed restoration camera clipping is unavailable.');
                  }
                  return [
                    key,
                    Object.fromEntries(
                      Object.entries(value).map(([axis, distance]: [string, unknown]) => {
                        if (typeof distance !== 'number' || !Number.isFinite(distance)) {
                          throw new TypeError('The mixed restoration camera clipping is nonfinite.');
                        }
                        return [axis, expect.closeTo(distance, 12)];
                      }),
                    ),
                  ];
                }
                if (key === 'controlsDistance' || key === 'verticalSpan') {
                  if (typeof value !== 'number' || !Number.isFinite(value)) {
                    throw new TypeError('The mixed restoration camera scalar is nonfinite.');
                  }
                  return [key, expect.closeTo(value, 12)];
                }
                return [key, value];
              }),
            );
            expect(actualCamera).toEqual(expectedFields);
          }
          const restoredImage = await captureS15Frame(`${prefix}-named-after-trusted-input.png`, final);
          const finalPin = await readScaleCommittedPin(originalDownloads);
          expect(finalPin.root).toEqual(reopened.pin.root);
          expect(finalPin.byteDenominators).toEqual(reopened.pin.byteDenominators);
          await target.writeArtifact(
            `${prefix}-acquisition.json`,
            JSON.stringify(
              {
                status: 'RAW_MOUNTED_MIXED_ACQUISITION_REQUIRES_ACTUAL_PRESENTED_JOINS_AND_REFERENCE_REVIEW',
                fixture,
                route,
                projectId,
                initialExecutable,
                assemblyStages,
                denominators: {
                  definitions: 2,
                  publicationGroupOccurrences: 1,
                  publicationLeafOccurrences: 2,
                  canonicalComponentCount: reopened.publication.canonicalComponentCount,
                  surfaceBodies: reopened.publication.bodies,
                  surfaceBodyCount: reopened.publication.surfaceBodyCount,
                  canonicalComponents: reopened.publication.canonicalComponents,
                  checkedImmutableClosure: finalPin.byteDenominators,
                },
                namedCamera,
                named,
                final,
                namedImage,
                restoredImage,
                visiblePixels: pixels.value,
                adapter,
                nativeBefore,
                nativeAfter,
                trajectoryBefore,
                trajectoryAfter,
                probe,
                finalPin,
                limitations: [
                  'Fresh builtin project is not a cold process or cold GPU. Initial executable, authored assembly publication, cached reopen and one steady mounted trusted-input probe are distinct stages.',
                  'Original seeded upstream source and GLB remain pinned; browser evidence supplies no upstream create/mesh/restore count. Original JSCAD upstream is surface-only; actual mixed edge inventory is not all-part edge coverage.',
                  'Native context/device reads and PNG/draw barriers are untimed. Renderer frames/rAF are not presented timestamps; raw signed-ID trace joins, device/quiet/variance review and mixed performance acceptance remain owed.',
                  'Complete closure bytes and conservative draw inventory are not full resident GPU bytes or raster submissions.',
                ],
              },
              undefined,
              2,
            ),
          );
          // Two same-canonical ordinary controls follow the complete original mounted acquisition.
          if (ordinaryControlSelected) {
            if (!namedRenderFrame) {
              throw new Error('The held mixed render frame is unavailable.');
            }
            expect(full.camera.requestedFov).toBe(60);
            const surfaceIds = [...new Set(full.inventory.surfaces.map(({ componentId }) => componentId))].sort();
            expect(surfaceIds).toHaveLength(3);
            const beforeExportPin = await readScaleCommittedPin(originalDownloads);
            expect(beforeExportPin.root).toEqual(finalPin.root);
            expect(beforeExportPin.byteDenominators).toEqual(finalPin.byteDenominators);
            await target.click(selectors.getByRole('button', { name: 'Search', exact: true }));
            await target.fill(selectors.getByPlaceholder('Search projects, chats, and actions…'), 'Export');
            await target.click(selectors.getByRole('option', { name: 'Export', exact: true }));
            const exportPanel = selectors.getByCss('[data-slot="export-panel-body"]');
            await target.expectVisible(exportPanel);
            const exportSource = exportPanel.getByRole('region', { name: 'Source', exact: true });
            await target.click(exportSource.getByRole('button'));
            await target.click(selectors.getByRole('option', { name: 'assembly.json', exact: true }));
            await target.expectVisible(exportSource.getByRole('button', { name: 'assembly.json', exact: true }));
            const exportSubject = await readMixedCadSubject();
            expect(exportSubject.diagnostics.projectId).toBe(projectId);
            expect(exportSubject.diagnostics.sourceEntryPath).toBe('assembly.json');
            expect(exportSubject.root).toEqual(finalPin.root);
            expect(exportSubject.draw?.key).toBe(finalPin.root.digest);
            await target.expectVisible(exportPanel.getByRole('button', { name: /^glb$/iu }), 15_000);
            const toggles = await target.evaluate(() =>
              [...document.querySelectorAll<HTMLButtonElement>('[aria-label="Formats"] button[aria-pressed]')].map(
                (button) => ({
                  name: (button.querySelector(':scope > span')?.textContent ?? '').trim(),
                  selected: button.getAttribute('aria-pressed') === 'true',
                }),
              ),
            );
            expect(toggles.some(({ name }) => name.toLowerCase() === 'glb')).toBe(true);
            /* oxlint-disable no-await-in-loop -- Existing Export format toggles settle before the actual Download. */
            for (const toggle of toggles) {
              if (toggle.selected !== (toggle.name.toLowerCase() === 'glb')) {
                await target.click(exportPanel.getByRole('button', { name: toggle.name, exact: true }));
              }
            }
            /* oxlint-enable no-await-in-loop */
            const exported = await target.download(exportPanel.getByRole('button', { name: /^Export glb$/iu }));
            const exportedBytes = base64ToUint8Array(exported.base64);
            const afterExportSubject = await readMixedCadSubject();
            expect(afterExportSubject.diagnostics.projectId).toBe(projectId);
            expect(afterExportSubject.diagnostics.sourceEntryPath).toBe('assembly.json');
            expect(afterExportSubject.root).toEqual(exportSubject.root);
            expect(afterExportSubject.draw?.key).toBe(finalPin.root.digest);
            const { json: exportedGltf } = await new WebIO().binaryToJSON(exportedBytes);
            const exportedBodyNodes = exportedGltf.nodes?.filter((node) => node.mesh !== undefined) ?? [];
            expect(exportedBodyNodes).toHaveLength(3);
            const exportedBodyIds = exportedBodyNodes.map((node) => node.extras?.['tauComponentId']);
            expect(new Set(exportedBodyIds).size).toBe(3);
            expect(exportedBodyIds).toEqual(expect.arrayContaining(surfaceIds));
            const artifactDigest = `sha256:${[...new Uint8Array(await crypto.subtle.digest('SHA-256', exportedBytes))].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
            const ordinaryPath = `${prefix}-ordinary.glb`;
            await target.writeArtifact(
              `${prefix}-ordinary-export.json`,
              JSON.stringify(
                {
                  projectId,
                  root: finalPin.root,
                  surfaceIds,
                  ordinaryPath,
                  exportSubject,
                  afterExportSubject,
                  selectedExportEntryPath: 'assembly.json',
                  exportedBodyIds,
                  exportedBodyNodes,
                  artifactDigest,
                  byteLength: exportedBytes.byteLength,
                  suggestedFilename: exported.suggestedFilename,
                  base64: exported.base64,
                },
                undefined,
                2,
              ),
            );
            expect(exported.suggestedFilename.toLowerCase()).toMatch(/\.glb$/u);
            expect(exportedBytes.byteLength).toBeGreaterThan(0);
            await target.click(selectors.getByRole('button', { name: 'Search', exact: true }));
            await target.fill(selectors.getByPlaceholder('Search projects, chats, and actions…'), 'Open files');
            await target.click(selectors.getByText('Open files', { exact: true }));
            await target.expectVisible(treeItem('assembly.json'));
            await target.click(treeItem('assembly.json'), { button: 'right' });
            await target.chooseFile(selectors.getByRole('menuitem', { name: 'Upload Files', exact: true }), {
              base64: exported.base64,
              mimeType: 'model/gltf-binary',
              name: ordinaryPath,
            });
            await target.click(selectors.getByRole('button', { name: 'Search', exact: true }));
            await target.fill(selectors.getByPlaceholder('Search projects, chats, and actions…'), 'Open files');
            await target.click(selectors.getByText('Open files', { exact: true }));
            await target.expectVisible(treeItem(ordinaryPath));
            await target.click(treeItem(ordinaryPath), { button: 'right' });
            const verified = await target.download(selectors.getByRole('menuitem', { name: 'Download', exact: true }));
            const verifiedBytes = base64ToUint8Array(verified.base64);
            const verifiedDigest = `sha256:${[...new Uint8Array(await crypto.subtle.digest('SHA-256', verifiedBytes))].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
            await target.writeArtifact(
              `${prefix}-ordinary-upload-download.json`,
              JSON.stringify(
                {
                  projectId,
                  ordinaryPath,
                  digest: verifiedDigest,
                  byteLength: verifiedBytes.byteLength,
                  base64: verified.base64,
                },
                undefined,
                2,
              ),
            );
            expect(verified.base64).toBe(exported.base64);
            expect(verifiedDigest).toBe(artifactDigest);
            expect(verifiedBytes.byteLength).toBe(exportedBytes.byteLength);
            const afterUploadPin = await readScaleCommittedPin(originalDownloads);
            expect(afterUploadPin.root).toEqual(finalPin.root);
            expect(afterUploadPin.byteDenominators).toEqual(finalPin.byteDenominators);
            const [ordinaryResult] = await Promise.allSettled([
              (async () => {
                await target.click(treeItem(ordinaryPath), { button: 'right' });
                await target.click(selectors.getByRole('menuitem', { name: 'Open in Viewer', exact: true }));
                await target.expectGeometryFramed();
                await expect
                  .poll(
                    async () => {
                      const state = await target.evaluate(() => {
                        const bridge = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__;
                        const subject = bridge?.getCommittedAssembly();
                        if (!bridge || !subject) {
                          throw new Error('The ordinary mixed control is unavailable.');
                        }
                        return {
                          diagnostics: subject.diagnostics,
                          root: subject.assemblyDisplay?.root,
                          current: subject.isCurrent(),
                          draw: bridge.getCommittedDrawInventory(),
                        };
                      });
                      if (state.diagnostics.sourceEntryPath !== ordinaryPath) {
                        return false;
                      }
                      assertOrdinaryParityDiagnostics(state.diagnostics, ordinaryPath);
                      return (
                        state.diagnostics.projectId === projectId &&
                        state.root === undefined &&
                        !state.current &&
                        state.draw === undefined
                      );
                    },
                    { timeout: 60_000 },
                  )
                  .toBe(true);
                await target.click(selectors.getByRole('button', { name: 'Search', exact: true }));
                await target.fill(
                  selectors.getByPlaceholder('Search projects, chats, and actions…'),
                  'Open model structure',
                );
                await target.click(selectors.getByText('Open model structure', { exact: true }));
                const ordinaryFrame = await target.evaluate(
                  ({ camera, renderFrame }) => {
                    const bridge = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__;
                    if (!bridge) {
                      throw new Error('The ordinary presentation owner is unavailable.');
                    }
                    bridge.resetModelVisibility();
                    bridge.setAssemblyDetailCalibration(undefined);
                    bridge.setRenderFrame(renderFrame);
                    bridge.setPresentation({ surfaces: true, lines: true });
                    bridge.setCamera(camera);
                    return bridge.getRendererIdentity().frame;
                  },
                  { camera: namedCamera, renderFrame: namedRenderFrame },
                );
                await target.waitFor((frame) => {
                  const bridge = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__;
                  return Boolean(bridge && bridge.getRendererIdentity().frame > frame);
                }, ordinaryFrame);
                const ordinaryBefore = await target.evaluate(
                  async ({ ids, managedPath }) => {
                    const bridge = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__;
                    if (!bridge) {
                      throw new Error('The ordinary mixed consumer disappeared.');
                    }
                    const subject = bridge.getCommittedAssembly();
                    let readerDenied = false;
                    let backendDenied = false;
                    try {
                      await subject.readRawBytes(managedPath);
                    } catch {
                      readerDenied = true;
                    }
                    try {
                      await bridge.observeBackendBindings();
                    } catch {
                      backendDenied = true;
                    }
                    const canvas = bridge.getViewportCanvas();
                    const rect = canvas.getBoundingClientRect();
                    return {
                      diagnostics: subject.diagnostics,
                      root: subject.assemblyDisplay?.root,
                      current: subject.isCurrent(),
                      draw: bridge.getCommittedDrawInventory(),
                      readerDenied,
                      backendDenied,
                      camera: bridge.getCamera(),
                      renderFrame: bridge.getRenderFrame(),
                      canvas: {
                        cssWidth: rect.width,
                        cssHeight: rect.height,
                        bufferWidth: canvas.width,
                        bufferHeight: canvas.height,
                      },
                      renderer: bridge.getRendererIdentity({ includeRenderDevice: true }),
                      bodies: ids.map((id) => ({ id, state: bridge.getRenderedModelComponentState(id) })),
                    };
                  },
                  { ids: surfaceIds, managedPath: finalPin.root.path },
                );
                await target.writeArtifact(
                  `${prefix}-ordinary-before.json`,
                  JSON.stringify(ordinaryBefore, undefined, 2),
                );
                assertOrdinaryParityDiagnostics(ordinaryBefore.diagnostics, ordinaryPath);
                expect(ordinaryBefore.diagnostics.projectId).toBe(projectId);
                expect(ordinaryBefore.root).toBeUndefined();
                expect(ordinaryBefore.current).toBe(false);
                expect(ordinaryBefore.draw).toBeUndefined();
                expect(ordinaryBefore.readerDenied).toBe(true);
                expect(ordinaryBefore.backendDenied).toBe(true);
                expect(ordinaryBefore.bodies.every(({ state }) => state.visibleMeshCount > 0)).toBe(true);
                expect(ordinaryBefore.bodies).toHaveLength(3);
                expect(ordinaryBefore.camera).toEqual(full.camera);
                expect(ordinaryBefore.renderFrame).toEqual(namedRenderFrame);
                expect(ordinaryBefore.canvas).toEqual(full.inventory.canvas);
                expect(ordinaryBefore.renderer.api).toBe(backend);
                const ordinaryDevice = ordinaryBefore.renderer.renderDevice;
                if (ordinaryDevice?.status !== 'observed') {
                  throw new Error('The actual ordinary native implementation is unavailable.');
                }
                expect(
                  classifyWebGpuAdapter({
                    vendor: ordinaryDevice.vendor,
                    architecture: ordinaryDevice.architecture,
                    device: ordinaryDevice.device,
                    description: ordinaryDevice.description,
                    fallback: ordinaryDevice.isFallbackAdapter,
                  }),
                ).toBe('hardware');
                expect(ordinaryDevice.canvasMatches).toBe(true);
                expect(ordinaryDevice.source).toBe(renderDevice.source);
                if (backend === 'webgpu') {
                  expect(ordinaryDevice.configuredDeviceMatches).toBe(true);
                  if (ordinaryDevice.isFallbackAdapter !== undefined) {
                    expect(ordinaryDevice.isFallbackAdapter).toBe(false);
                  }
                }
                const ordinaryImage = await target.screenshot(
                  selectors.getByTestId('cad-viewer-canvas-region'),
                  `${prefix}-ordinary-full.png`,
                );
                const ordinaryAfter = await target.evaluate(() => {
                  const bridge = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__;
                  const subject = bridge?.getCommittedAssembly();
                  if (!bridge || !subject) {
                    throw new Error('The ordinary mixed screenshot owner disappeared.');
                  }
                  const canvas = bridge.getViewportCanvas();
                  const rect = canvas.getBoundingClientRect();
                  return {
                    diagnostics: subject.diagnostics,
                    root: subject.assemblyDisplay?.root,
                    current: subject.isCurrent(),
                    draw: bridge.getCommittedDrawInventory(),
                    camera: bridge.getCamera(),
                    renderFrame: bridge.getRenderFrame(),
                    renderer: bridge.getRendererIdentity({ includeRenderDevice: true }),
                    canvas: {
                      cssWidth: rect.width,
                      cssHeight: rect.height,
                      bufferWidth: canvas.width,
                      bufferHeight: canvas.height,
                    },
                  };
                });
                await target.writeArtifact(
                  `${prefix}-ordinary-after.json`,
                  JSON.stringify(ordinaryAfter, undefined, 2),
                );
                expect(ordinaryAfter.diagnostics).toEqual(ordinaryBefore.diagnostics);
                expect(ordinaryAfter.root).toBeUndefined();
                expect(ordinaryAfter.current).toBe(false);
                expect(ordinaryAfter.draw).toBeUndefined();
                expect(ordinaryAfter.camera).toEqual(ordinaryBefore.camera);
                expect(ordinaryAfter.renderFrame).toEqual(ordinaryBefore.renderFrame);
                expect(ordinaryAfter.canvas).toEqual(ordinaryBefore.canvas);
                expect(ordinaryAfter.renderer.renderDevice).toEqual(ordinaryBefore.renderer.renderDevice);
                const difference = await compareScalePngFrames(namedImage, ordinaryImage);
                await target.writeArtifact(
                  `${prefix}-ordinary-comparison.json`,
                  JSON.stringify(
                    {
                      status: 'RAW_SAME_CANONICAL_ORDINARY_COMPARISON_REQUIRES_REVIEW',
                      projectId,
                      ordinaryPath,
                      root: finalPin.root,
                      artifactDigest,
                      surfaceIds,
                      namedImage,
                      ordinaryImage,
                      assembly: { camera: full.camera, renderFrame: namedRenderFrame, canvas: full.inventory.canvas },
                      ordinaryBefore,
                      ordinaryAfter,
                      difference,
                      limitations: [
                        'Exact camera checks include derived physical/native clipping; no clipping override exists.',
                        'Raster difference is recorded without a similarity threshold or same-pixel qualification.',
                        'Ordinary has no admitted assembly root/draw/reader/backend observation authority.',
                      ],
                    },
                    undefined,
                    2,
                  ),
                );
                return { ordinaryPath, artifactDigest, difference };
              })(),
            ]);
            const [returnResult] = await Promise.allSettled([
              (async () => {
                await target.click(selectors.getByRole('button', { name: 'Search', exact: true }));
                await target.fill(selectors.getByPlaceholder('Search projects, chats, and actions…'), 'Open files');
                await target.click(selectors.getByText('Open files', { exact: true }));
                await target.expectVisible(treeItem('assembly.json'));
                await target.click(treeItem('assembly.json'), { button: 'right' });
                await target.click(selectors.getByRole('menuitem', { name: 'Open in Viewer', exact: true }));
                await target.expectGeometryFramed();
                await waitS15Current();
                const returnedPin = await readScaleCommittedPin(originalDownloads);
                expect(returnedPin.root).toEqual(finalPin.root);
                expect(returnedPin.byteDenominators).toEqual(finalPin.byteDenominators);
                const returnedFrame = await target.evaluate(
                  ({ camera, renderFrame }) => {
                    const bridge = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__;
                    if (!bridge) {
                      throw new Error('The returned mixed comparison-camera owner is unavailable.');
                    }
                    bridge.setRenderFrame(renderFrame);
                    bridge.setPresentation({ surfaces: true, lines: true });
                    bridge.setCamera(camera);
                    return bridge.getRendererIdentity().frame;
                  },
                  { camera: namedCamera, renderFrame: namedRenderFrame },
                );
                await target.waitFor((frame) => {
                  const bridge = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__;
                  return Boolean(bridge && bridge.getRendererIdentity().frame > frame);
                }, returnedFrame);
                const returned = await readS15State();
                expect(returned.root).toEqual(full.root);
                expect(returned.camera).toEqual(full.camera);
                expect(returned.inventory.canvas).toEqual(full.inventory.canvas);
                await target.writeArtifact(
                  `${prefix}-ordinary-return.json`,
                  JSON.stringify({ returnedPin, returned }, undefined, 2),
                );
              })(),
            ]);
            if (ordinaryResult.status === 'rejected') {
              const error: unknown = ordinaryResult.reason;
              throw error;
            }
            if (returnResult.status === 'rejected') {
              const error: unknown = returnResult.reason;
              throw error;
            }
          }
        }

        const openMixedFiles = async (): Promise<void> => {
          await target.click(selectors.getByRole('button', { name: 'Search', exact: true }));
          await target.fill(selectors.getByPlaceholder('Search projects, chats, and actions…'), 'Open files');
          await target.click(selectors.getByRole('option', { name: 'Open files', exact: true }));
        };
        const uploadMixedSetting = async (path: string, content: string): Promise<void> => {
          await openMixedFiles();
          await target.expectVisible(treeItem(path));
          await target.click(treeItem(path), { button: 'right' });
          await target.chooseFile(selectors.getByRole('menuitem', { name: 'Upload Files', exact: true }), {
            name: path,
            mimeType: 'text/plain',
            base64: uint8ArrayToBase64(new TextEncoder().encode(content)),
          });
          const replaceDialog = selectors.getByRole('alertdialog', { name: `Replace '${path}'?`, exact: true });
          await target.expectVisible(replaceDialog);
          await target.click(replaceDialog.getByRole('button', { name: 'Replace', exact: true }));
          await target.expectHidden(replaceDialog);
          await openMixedFiles();
          await target.click(treeItem(path), { button: 'right' });
          const downloaded = await target.download(selectors.getByRole('menuitem', { name: 'Download', exact: true }));
          expect(new TextDecoder().decode(base64ToUint8Array(downloaded.base64))).toBe(content);
        };
        const beforeActivation = await readMixedCadSubject();
        const authoredFile = originalDownloads.find(({ path }) => path === 'assembly.json');
        if (!authoredFile || !beforeActivation.root || !beforeActivation.assemblyCurrent) {
          throw new Error('Authored activation requires the original entry bytes and a held current pin.');
        }
        let beforeEdit = beforeActivation;
        if (cachedWatch) {
          const firstAssembly = first.stageSubject?.pairedActivity.assembly;
          const cachedAssembly = reopened.stageSubject?.pairedActivity.assembly;
          const currentAssembly = beforeActivation.pairedActivity.assembly;
          await target.writeArtifact(
            `${prefix}-cached-watch-owner.json`,
            JSON.stringify(
              {
                first: first.stageSubject,
                cached: reopened.stageSubject,
                current: beforeActivation,
                qualification:
                  'Actual cached authored reopen without modifying assembly.json; pin alone does not establish a watch or source-work exclusion.',
              },
              undefined,
              2,
            ),
          );
          if (!firstAssembly?.owner || !cachedAssembly?.owner || !currentAssembly?.owner) {
            throw new Error('The cached authored reopen has no actual captured assembly owner.');
          }
          expect(cachedAssembly.owner.entryPath).toBe('assembly.json');
          expect(currentAssembly.owner.actorSessionId).toBe(cachedAssembly.owner.actorSessionId);
          expect(currentAssembly.owner.fileSystemRoot).toBe(cachedAssembly.owner.fileSystemRoot);
          expect(cachedAssembly.owner.committedKey).toBe(reopened.pin.root.digest);
          expect(currentAssembly.owner.committedKey).toBe(reopened.pin.root.digest);
          expect(['idle', 'parked']).toContain(currentAssembly.owner.state);
          expect(beforeActivation.root).toEqual(reopened.pin.root);
          expect(beforeActivation.diagnostics.projectId).toBe(projectId);
          expect(beforeActivation.diagnostics.sourceEntryPath).toBe('assembly.json');
          expect(beforeActivation.diagnostics.requestedKey).toBe(reopened.pin.root.digest);
          expect(beforeActivation.diagnostics.presentedKey).toBe(reopened.pin.root.digest);
          expect(cachedAssembly.owner.actorSessionId).toBe(firstAssembly.owner.actorSessionId);
          expect(cachedAssembly.owner.fileSystemRoot).toBe(firstAssembly.owner.fileSystemRoot);
          const priorKeys = new Set(firstAssembly.telemetryEntries.map(spanKey));
          const cachedWork = cachedAssembly.telemetryEntries.filter((entry) => !priorKeys.has(spanKey(entry)));
          const receipts = cachedWork.filter(
            (entry) =>
              entry.name === 'kernel.render' &&
              entry.detail?.['file'] === 'assembly.json' &&
              entry.detail['status'] === 'published' &&
              entry.detail['digest'] === reopened.pin.root.digest &&
              entry.detail['generation'] === reopened.pin.generation,
          );
          expect(receipts).toHaveLength(1);
          const [receipt] = receipts;
          if (!receipt) {
            throw new Error('The unchanged authored reopen has no actual completed receipt.');
          }
          // Parking closes the client. The actual new realm's completed bootstrap is its honest prior frontier.
          const receiptIndex = cachedAssembly.telemetryEntries.indexOf(receipt);
          const cachedBaseline = cachedAssembly.telemetryEntries
            .slice(0, receiptIndex)
            .filter(
              (entry) =>
                entry.origin.instance !== receipt.origin.instance ||
                Number(entry.detail?.['spanId']) < Number(receipt.detail?.['spanId']),
            );
          expect(
            cachedBaseline.some(
              (entry) =>
                entry.origin.instance === receipt.origin.instance &&
                entry.name === 'kernel.bootstrap' &&
                entry.detail?.['parentSpanId'] === undefined,
            ),
          ).toBe(true);
          expect(
            firstAssembly.telemetryEntries.some((entry) => entry.origin.instance === receipt.origin.instance),
          ).toBe(false);
          expect(
            cachedBaseline.some(
              (entry) => entry.origin.instance === receipt.origin.instance && entry.name === 'kernel.init',
            ),
          ).toBe(true);
          const cachedPreparation = cachedWork.filter((entry) =>
            ['kernel.bootstrap', 'kernel.init', 'kernel.load-module'].includes(entry.name),
          );
          const cachedGraph = capturedPublicationGraph(
            cachedBaseline,
            [cachedAssembly.telemetryEntries],
            reopened.pin.root.digest,
          );
          expect(spanKey(cachedGraph.root)).toBe(spanKey(receipt));
          expect(cachedGraph.root.detail).toMatchObject({ generation: reopened.pin.generation });
          expect(
            cachedWork.filter((entry) =>
              [
                'kernel.bundle',
                'kernel.extract-params',
                'kernel.compute',
                'kernel.compute.reuse',
                'kernel.mesh-compute',
                'kernel.evaluate-model',
                'kernel.execute',
                'kernel.mesh',
                'kernel.export-reheat',
              ].includes(entry.name),
            ),
          ).toHaveLength(0);
          await openMixedFiles();
          await target.click(treeItem('assembly.json'), { button: 'right' });
          const unchanged = await target.download(selectors.getByRole('menuitem', { name: 'Download', exact: true }));
          expect([...base64ToUint8Array(unchanged.base64)]).toEqual(authoredFile.bytes);
          const currentPin = await readScaleCommittedPin(originalDownloads);
          expect(currentPin.root).toEqual(reopened.pin.root);
          expect(currentPin.generation).toBe(reopened.pin.generation);
          expect(currentPin.byteDenominators).toEqual(reopened.pin.byteDenominators);
          beforeEdit = await readMixedCadSubject();
          expect(beforeEdit.root).toEqual(currentPin.root);
          expect(beforeEdit.assemblyCurrent).toBe(true);
          expect(beforeEdit.pairedActivity.assembly?.owner?.actorSessionId).toBe(currentAssembly.owner.actorSessionId);
          await target.writeArtifact(
            `${prefix}-cached-authored-reopen.json`,
            JSON.stringify(
              {
                cachedBaseline,
                cachedGraph,
                cachedWork,
                cachedPreparation,
                currentPin,
                beforeEdit,
                qualification:
                  'Real closed persisted authored reuse receipt with zero producer work, unchanged authored bytes/SAME checked closure and current owner. Preparation/native restoration and performance are separate; changed-watch proof follows.',
              },
              undefined,
              2,
            ),
          );
        } else {
          // Preserve the accepted explicit authored activation route for the original four cases.
          const priorActivationSpans = new Set(beforeActivation.activity.telemetryEntries.map(spanKey));
          await uploadMixedSetting(
            'assembly.json',
            `${new TextDecoder().decode(new Uint8Array(authoredFile.bytes))}\n`,
          );
          await expect
            .poll(
              async () => {
                const current = await readMixedCadSubject();
                return (
                  current.assemblyCurrent &&
                  current.diagnostics.projectId === projectId &&
                  current.diagnostics.sourceEntryPath === 'assembly.json' &&
                  current.root !== undefined &&
                  current.activity.telemetryEntries.some(
                    (entry) =>
                      !priorActivationSpans.has(spanKey(entry)) &&
                      entry.name === 'kernel.render' &&
                      entry.detail?.['file'] === 'assembly.json' &&
                      entry.detail['status'] === 'published' &&
                      entry.detail['digest'] === current.root?.digest,
                  )
                );
              },
              { timeout: 60_000 },
            )
            .toBe(true);
          const activated = await readMixedCadSubject();
          const activationRoots = activated.activity.telemetryEntries.filter(
            (entry) =>
              !priorActivationSpans.has(spanKey(entry)) &&
              entry.name === 'kernel.render' &&
              entry.detail?.['file'] === 'assembly.json' &&
              entry.detail['status'] === 'published' &&
              entry.detail['digest'] === activated.root?.digest,
          );
          expect(activationRoots).toHaveLength(1);
          await target.writeArtifact(
            `${prefix}-authored-activation.json`,
            JSON.stringify(
              {
                beforeActivation,
                activated,
                activationRoots,
                limitation:
                  'Explicit authored activation is preparation. Its observed work is separate from the downstream edit; cached live-watch reacquisition remains unqualified.',
              },
              undefined,
              2,
            ),
          );
          beforeEdit = activated;
        }
        if (!beforeEdit.root || !beforeEdit.draw || !beforeEdit.publication) {
          throw new Error('The downstream edit requires an admitted assembly baseline.');
        }
        const editIntermediates = new Map<string, Awaited<ReturnType<typeof readMixedCadSubject>>>();
        try {
          const [upload, observed] = await Promise.allSettled([
            uploadMixedSetting('downstream.settings.ts', 'export const mountWidth = 26;\n'),
            expect
              .poll(
                async () => {
                  try {
                    const current = await readMixedCadSubject();
                    const activities = [current.pairedActivity.main, current.pairedActivity.assembly];
                    const key = JSON.stringify([
                      current.assemblyCurrent,
                      current.root?.digest,
                      activities.map((owned) => {
                        const lastRoot = owned?.telemetryEntries.findLast((entry) => entry.name === 'kernel.render');
                        return [
                          owned?.owner?.actorSessionId,
                          owned?.owner?.committedKey,
                          owned?.owner?.state,
                          lastRoot ? spanKey(lastRoot) : undefined,
                        ];
                      }),
                    ]);
                    if (!editIntermediates.has(key)) {
                      editIntermediates.set(key, current);
                    }
                    if (!current.root || !current.draw) {
                      return false;
                    }
                    const rootDigest = current.root.digest;
                    if (
                      !current.assemblyCurrent ||
                      rootDigest === beforeEdit.root?.digest ||
                      current.draw.candidateSceneId === beforeEdit.draw?.candidateSceneId
                    ) {
                      return false;
                    }
                    capturedPublicationGraph(
                      beforeEdit.activity.telemetryEntries,
                      [...editIntermediates.values()].map(
                        (sample) => sample.pairedActivity.assembly?.telemetryEntries ?? [],
                      ),
                      rootDigest,
                    );
                    return true;
                  } catch {
                    return false;
                  }
                },
                { timeout: 60_000 },
              )
              .toBe(true),
          ]);
          if (upload.status === 'rejected') {
            const error: unknown = upload.reason;
            throw error;
          }
          if (observed.status === 'rejected') {
            const error: unknown = observed.reason;
            throw error;
          }
        } finally {
          await target.writeArtifact(
            `${prefix}-paired-activity-intermediates.json`,
            JSON.stringify(
              {
                beforeEdit,
                intermediates: [...editIntermediates.values()],
                semantics: 'Actual boundary snapshots only; missing busy or parked history is not reconstructed.',
              },
              undefined,
              2,
            ),
          );
        }
        const afterEdit = await readMixedCadSubject();
        await target.writeArtifact(`${prefix}-paired-activity-final.json`, JSON.stringify(afterEdit, undefined, 2));
        if (!afterEdit.root || !afterEdit.draw || !afterEdit.publication) {
          throw new Error('The edited downstream presentation is unavailable.');
        }
        const editedRootDigest = afterEdit.root.digest;
        const captures = [...editIntermediates.values(), afterEdit];
        const selectedCapture = capturedPublicationGraph(
          beforeEdit.activity.telemetryEntries,
          captures.map((sample) => sample.pairedActivity.assembly?.telemetryEntries ?? []),
          editedRootDigest,
        );
        const publicationCapture = captures.at(selectedCapture.captureIndex);
        const capturedAssembly = publicationCapture?.pairedActivity.assembly;
        const joinedRoot = selectedCapture.root;
        const finalAssembly = afterEdit.pairedActivity.assembly;
        if (!capturedAssembly?.owner || !finalAssembly?.owner || !afterEdit.assemblyCurrent) {
          throw new Error('The exact completed publication actor or final current pin is unavailable.');
        }
        expect(capturedAssembly.owner.entryPath).toBe('assembly.json');
        expect(capturedAssembly.owner.actorSessionId).toBe(finalAssembly.owner.actorSessionId);
        expect(capturedAssembly.owner.fileSystemRoot).toBe(finalAssembly.owner.fileSystemRoot);
        expect(finalAssembly.owner.committedKey).toBe(editedRootDigest);
        expect(['idle', 'parked']).toContain(capturedAssembly.owner.state);
        const editedPin = await readScaleCommittedPin(originalDownloads);
        expect(editedPin.root).toEqual(afterEdit.root);
        expect(joinedRoot.detail?.['generation']).toBe(editedPin.generation);
        const priorAssemblyKeys = new Set(beforeEdit.activity.telemetryEntries.map(spanKey));
        const newAssemblyWork = selectedCapture.entries.filter(
          (entry) =>
            !priorAssemblyKeys.has(spanKey(entry)) &&
            (entry.name === 'kernel.compute' || entry.name === 'kernel.mesh-compute'),
        );
        const directProducer =
          newAssemblyWork.some((entry) => entry.name === 'kernel.compute') &&
          newAssemblyWork.some((entry) => entry.name === 'kernel.mesh-compute');
        let pairedGraphs: ReturnType<typeof pairedPublicationGraphs> | undefined;
        let editedTrace: readonly TelemetrySpanRecord[];
        if (directProducer) {
          const admitted = afterEdit.publication.parts['downstream']?.variants['default'];
          if (!admitted) {
            throw new Error('The direct publication has no admitted downstream source/output closure.');
          }
          editedTrace = selectedPublicationGraph(beforeEdit.activity.telemetryEntries, selectedCapture.entries, {
            root: joinedRoot,
            entryPath: 'main.ts',
            kernelId: 'replicad',
            publishedAssembly: {
              digest: editedPin.root.digest,
              generation: editedPin.generation,
              sourceFiles: admitted.source.files,
              glbDigest: admitted.glb.digest,
            },
          });
        } else {
          const mainBefore = beforeEdit.pairedActivity.main;
          const mainAfter = afterEdit.pairedActivity.main;
          const assemblyBefore = beforeEdit.pairedActivity.assembly;
          const assemblyAfter = afterEdit.pairedActivity.assembly;
          const admitted = afterEdit.publication.parts['downstream']?.variants['default'];
          if (!mainBefore?.owner || !mainAfter?.owner || !assemblyBefore?.owner || !assemblyAfter?.owner || !admitted) {
            throw new Error('The cache alternative lacks actual paired actor history or admitted output.');
          }
          for (const [before, after, entryPath] of [
            [mainBefore.owner, mainAfter.owner, 'main.ts'],
            [assemblyBefore.owner, assemblyAfter.owner, 'assembly.json'],
          ] as const) {
            expect(before.entryPath).toBe(entryPath);
            expect(after.entryPath).toBe(entryPath);
            expect(after.actorSessionId).toBe(before.actorSessionId);
            expect(after.fileSystemRoot).toBe(before.fileSystemRoot);
            expect(['idle', 'parked']).toContain(before.state);
            expect(['idle', 'parked']).toContain(after.state);
          }
          expect(mainAfter.owner.fileSystemRoot).toBe(assemblyAfter.owner.fileSystemRoot);
          expect(mainAfter.owner.committedKey).not.toBe(mainBefore.owner.committedKey);
          expect(assemblyBefore.owner.committedKey).toBe(beforeEdit.root.digest);
          expect(assemblyAfter.owner.committedKey).toBe(afterEdit.root.digest);
          const mainDocument = mainAfter.document;
          if (!mainDocument) {
            throw new Error('The held main document/evaluation/request tuple is unavailable.');
          }
          const receiptRoot = capturedAssembly.telemetryEntries.find((entry) => spanKey(entry) === spanKey(joinedRoot));
          if (!receiptRoot) {
            throw new Error('The paired assembly activity lacks the selected receipt root.');
          }
          expect(receiptRoot).toEqual(joinedRoot);
          const mainOwner = mainAfter.owner;
          const earlier = [...editIntermediates.values()].find((sample) => {
            const owned = sample.pairedActivity.main;
            return Boolean(
              owned?.owner &&
              sample.assemblyCurrent &&
              sample.root?.digest === beforeEdit.root?.digest &&
              owned.owner.actorSessionId === mainOwner.actorSessionId &&
              owned.owner.committedKey === mainOwner.committedKey &&
              owned.document?.evaluationId === mainDocument.evaluationId &&
              owned.document.requestId === mainDocument.requestId &&
              (mainDocument.documentId === undefined || owned.document.documentId === mainDocument.documentId),
            );
          });
          const earlierMain = earlier?.pairedActivity.main;
          if (!earlierMain?.owner || !earlierMain.document) {
            throw new Error(
              'No actual completed main witness was captured while the assembly still held its baseline root.',
            );
          }
          expect(earlierMain.owner.fileSystemRoot).toBe(mainAfter.owner.fileSystemRoot);
          expect(earlierMain.document.key).toBe(mainDocument.key);
          expect(earlierMain.document.sourceFiles).toEqual(mainDocument.sourceFiles);
          pairedGraphs = pairedPublicationGraphs(
            {
              assemblyBefore: assemblyBefore.telemetryEntries,
              assemblyAfter: capturedAssembly.telemetryEntries,
              mainBefore: mainBefore.telemetryEntries,
              mainAfter: earlierMain.telemetryEntries,
            },
            {
              root: receiptRoot,
              main: mainDocument,
              displayedDocument: earlierMain.displayedDocument,
              entryPath: 'main.ts',
              kernelId: 'replicad',
              sourceFiles: admitted.source.files,
              glbDigest: admitted.glb.digest,
            },
          );
          editedTrace = pairedGraphs.assembly;
        }
        for (const name of directProducer ? ['kernel.compute', 'kernel.mesh-compute'] : []) {
          const work = editedTrace.filter((entry) => entry.name === name);
          expect(work.length).toBeGreaterThan(0);
          for (const entry of work) {
            expect(entry.detail).toMatchObject({ entryPath: 'main.ts', kernelId: 'replicad' });
          }
          expect(work.filter((entry) => entry.detail?.['entryPath'] === 'upstream.ts')).toHaveLength(0);
        }
        expect(afterEdit.publication.parts['upstream']).toEqual(beforeEdit.publication.parts['upstream']);
        const upstreamRecord = beforeEdit.publication.parts['upstream'];
        const downstreamBefore = beforeEdit.publication.parts['downstream']?.variants['default'];
        const downstreamAfter = afterEdit.publication.parts['downstream']?.variants['default'];
        if (!upstreamRecord || !downstreamBefore || !downstreamAfter) {
          throw new Error('The actual mixed part geometry denominator is unavailable.');
        }
        expect(downstreamAfter.glb.digest).not.toBe(downstreamBefore.glb.digest);
        const upstreamAssets = new Set([
          fixture.upstreamPin.path,
          ...Object.values(upstreamRecord.variants).flatMap((variant) =>
            variant.exact ? [variant.glb.path, variant.exact.asset.path] : [variant.glb.path],
          ),
        ]);
        const originalUpstreamBytes = reopened.pin.byteDenominators.files.filter((file) =>
          upstreamAssets.has(file.path),
        );
        expect(originalUpstreamBytes).toHaveLength(upstreamAssets.size);
        expect(editedPin.byteDenominators.files.filter((file) => upstreamAssets.has(file.path))).toEqual(
          originalUpstreamBytes,
        );
        const downstreamBodyIds = new Set(
          reopened.publication.bodies.filter(({ ancestry }) => ancestry[1] === 'mount').map(({ id }) => id),
        );
        const beforeBounds = beforeEdit.draw.surfaces
          .filter(({ componentId }) => downstreamBodyIds.has(componentId))
          .map(({ canonicalRenderBounds }) => canonicalRenderBounds);
        const afterBounds = afterEdit.draw.surfaces
          .filter(({ componentId }) => downstreamBodyIds.has(componentId))
          .map(({ canonicalRenderBounds }) => canonicalRenderBounds);
        expect(beforeBounds.length).toBeGreaterThan(0);
        expect(afterBounds).toHaveLength(beforeBounds.length);
        for (const bounds of [...beforeBounds, ...afterBounds]) {
          expect(bounds.min).toHaveLength(3);
          expect(bounds.max).toHaveLength(3);
          expect([...bounds.min, ...bounds.max].every((value) => Number.isFinite(value))).toBe(true);
        }
        const mountComponents = beforeEdit.components.filter(({ name }) => name === 'Replicad mount');
        expect(mountComponents).toHaveLength(1);
        const mountComponent = mountComponents[0];
        if (!mountComponent) {
          throw new Error('The actual mounting plate identity is unavailable.');
        }
        const bodyExtents = (state: typeof beforeEdit, componentId: string): readonly number[] => {
          const rows = state.draw?.surfaces.filter((row) => row.componentId === componentId);
          if (rows?.length !== 1) {
            throw new Error('The actual mixed body bounds are ambiguous.');
          }
          const bounds = rows[0]?.canonicalRenderBounds;
          if (!bounds) {
            throw new Error('The actual mixed body bounds are unavailable.');
          }
          return bounds.max.map((maximum, axis) => {
            const minimum = bounds.min[axis];
            if (minimum === undefined) {
              throw new Error('The body extent axis is unavailable.');
            }
            return (maximum - minimum) * state.renderFrame.metersPerRenderUnit;
          });
        };
        const plateBefore = bodyExtents(beforeEdit, mountComponent.id);
        const plateAfter = bodyExtents(afterEdit, mountComponent.id);
        // The fixture builds an X-wide millimetre box. Its GLB vertex buffer stores Y-up metres as Float32.
        const expectedPlateWidth = (state: typeof beforeEdit, widthMillimetres: number): number => {
          const scale = state.draw?.canonicalToRenderMatrix[0];
          const translation = state.draw?.canonicalToRenderMatrix[12];
          if (scale === undefined || translation === undefined) {
            throw new Error('The held canonical-to-render unit transform is unavailable.');
          }
          const halfWidthMetres = Math.fround(widthMillimetres / 2000);
          return (
            (halfWidthMetres * scale + translation - (-halfWidthMetres * scale + translation)) *
            state.renderFrame.metersPerRenderUnit
          );
        };
        expect(plateBefore[0]).toBe(expectedPlateWidth(beforeEdit, 24));
        expect(plateAfter[0]).toBe(expectedPlateWidth(afterEdit, 26));
        expect(plateAfter.slice(1)).toEqual(plateBefore.slice(1));
        const unchangedBodyIds = beforeEdit.draw.surfaces
          .map(({ componentId }) => componentId)
          .filter((id) => id !== mountComponent.id);
        expect(unchangedBodyIds.length).toBeGreaterThan(0);
        for (const id of unchangedBodyIds) {
          expect(bodyExtents(afterEdit, id)).toEqual(bodyExtents(beforeEdit, id));
        }

        expect(
          afterEdit.publication.parts['downstream']?.variants['default']?.source.files['downstream.settings.ts'],
        ).not.toBe(
          beforeEdit.publication.parts['downstream']?.variants['default']?.source.files['downstream.settings.ts'],
        );
        await target.writeArtifact(
          `${prefix}-mounted-downstream-edit.json`,
          JSON.stringify(
            {
              beforeEdit,
              afterEdit,
              editIntermediates: [...editIntermediates.values()],
              joinedRoot,
              editedTrace,
              pairedGraphs,
            },
            undefined,
            2,
          ),
        );
        if (cachedWatch) {
          expect(editedPin.generation).toBe(reopened.pin.generation + 1);
          const stablePin = await readScaleCommittedPin(originalDownloads);
          expect(stablePin.root).toEqual(editedPin.root);
          expect(stablePin.generation).toBe(editedPin.generation);
          await target.writeArtifact(
            `${prefix}-cached-watch-settled.json`,
            JSON.stringify({ editedPin, stablePin }, undefined, 2),
          );
          // This case qualifies cached watch reacquisition; accepted upstream-positive/native-input siblings stay separate.
          return;
        }
        await openMixedFiles();
        await target.click(treeItem('upstream.ts'), { button: 'right' });
        await target.click(selectors.getByRole('menuitem', { name: 'Open in Viewer', exact: true }));
        await target.expectGeometryFramed();
        await expect
          .poll(
            async () => {
              try {
                const current = await readMixedCadSubject();
                assertOrdinaryParityDiagnostics(current.diagnostics, 'upstream.ts');
                return current.diagnostics.projectId === projectId;
              } catch {
                return false;
              }
            },
            { timeout: 60_000 },
          )
          .toBe(true);
        const upstreamBefore = await readMixedCadSubject();
        assertOrdinaryParityDiagnostics(upstreamBefore.diagnostics, 'upstream.ts');
        const upstreamBaselineDocument = upstreamBefore.activity.document;
        if (
          !upstreamBefore.diagnostics.sourceGeometryHash ||
          !upstreamBefore.diagnostics.presentedKey ||
          !upstreamBaselineDocument?.documentId
        ) {
          throw new Error('The actual upstream baseline document, source geometry and presentation are unavailable.');
        }
        const upstreamSettings = 'export const upstreamSize = 10;\n';
        const upstreamSettingsDigest = `sha256:${[
          ...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(upstreamSettings))),
        ]
          .map((value) => value.toString(16).padStart(2, '0'))
          .join('')}`;
        await uploadMixedSetting('upstream.settings.ts', upstreamSettings);
        await expect
          .poll(
            async () => {
              try {
                const current = await readMixedCadSubject();
                assertOrdinaryParityDiagnostics(current.diagnostics, 'upstream.ts');
                const { document, displayedDocument } = current.activity;
                if (!document || !displayedDocument) {
                  return false;
                }
                return (
                  current.diagnostics.projectId === projectId &&
                  current.diagnostics.sourceGeometryHash !== upstreamBefore.diagnostics.sourceGeometryHash &&
                  current.diagnostics.presentedKey !== upstreamBefore.diagnostics.presentedKey &&
                  current.activity.lastRequestedRenderId === current.activity.lastSettledRenderId &&
                  document.documentId === upstreamBaselineDocument.documentId &&
                  document.evaluationId !== upstreamBaselineDocument.evaluationId &&
                  document.sourceFiles['upstream.settings.ts'] === upstreamSettingsDigest &&
                  displayedDocument.documentId === document.documentId &&
                  displayedDocument.evaluationId === document.evaluationId &&
                  displayedDocument.key === current.diagnostics.presentedKey &&
                  document.key === current.diagnostics.sourceGeometryHash &&
                  Object.keys(displayedDocument.sourceFiles).length === Object.keys(document.sourceFiles).length &&
                  Object.entries(document.sourceFiles).every(
                    ([path, digest]) => displayedDocument.sourceFiles[path] === digest,
                  )
                );
              } catch {
                return false;
              }
            },
            { timeout: 60_000 },
          )
          .toBe(true);
        const upstreamAfter = await readMixedCadSubject();
        const upstreamDocument = upstreamAfter.activity.document;
        if (!upstreamDocument) {
          throw new Error('The actual upstream document/evaluation/request tuple is unavailable.');
        }
        const upstreamPeerPreparation = upstreamAfter.activity.displayedDocument;
        if (!upstreamPeerPreparation) {
          throw new Error('The actual upstream peer preparation tuple is unavailable.');
        }
        const upstreamTrace = selectedPublicationGraph(
          upstreamBefore.activity.telemetryEntries,
          upstreamAfter.activity.telemetryEntries,
          {
            document: upstreamDocument,
            peerPreparation: upstreamPeerPreparation,
            entryPath: 'upstream.ts',
            kernelId: fixture.family,
          },
        );
        const upstreamPeerPreparationTrace = upstreamTrace.filter(
          (entry) =>
            entry.name === 'deps.content-hash' && entry.detail?.['requestId'] === upstreamPeerPreparation.requestId,
        );
        expect(upstreamPeerPreparationTrace).toHaveLength(1);
        for (const name of ['kernel.compute', 'kernel.mesh-compute']) {
          const work = upstreamTrace.filter((entry) => entry.name === name);
          expect(work.length).toBeGreaterThan(0);
          for (const entry of work) {
            expect(entry.detail).toMatchObject({ entryPath: 'upstream.ts', kernelId: fixture.family });
          }
        }
        const upstreamDisplayed = await readMixedCadSubject();
        assertOrdinaryParityDiagnostics(upstreamDisplayed.diagnostics, 'upstream.ts');
        expect(upstreamDisplayed.diagnostics.projectId).toBe(projectId);
        expect(upstreamDisplayed.activity.lastRequestedRenderId).toBe(upstreamDisplayed.activity.lastSettledRenderId);
        expect(upstreamDisplayed.activity.document).toEqual(upstreamDocument);
        const displayedUpstream = upstreamDisplayed.activity.displayedDocument;
        if (!displayedUpstream) {
          throw new Error('The actual changed upstream displayed request is unavailable.');
        }
        expect(displayedUpstream.documentId).toBe(upstreamDocument.documentId);
        expect(displayedUpstream.evaluationId).toBe(upstreamDocument.evaluationId);
        expect(displayedUpstream.requestId).toBe(upstreamAfter.activity.displayedDocument?.requestId);
        expect(displayedUpstream.key).toBe(upstreamDisplayed.diagnostics.presentedKey);
        expect(displayedUpstream.key).toBe(upstreamAfter.diagnostics.presentedKey);
        expect(upstreamDisplayed.diagnostics.sourceGeometryHash).toBe(upstreamDocument.key);
        expect(displayedUpstream.sourceFiles).toEqual(upstreamDocument.sourceFiles);
        expect(displayedUpstream.sourceFiles['upstream.settings.ts']).toBe(upstreamSettingsDigest);
        expect(upstreamDisplayed.components.length).toBeGreaterThan(0);
        expect(upstreamDisplayed.components).toEqual(upstreamBefore.components);
        const displayedExtents = (state: typeof upstreamDisplayed): readonly number[] =>
          state.camera.bounds.max.map((maximum, axis) => {
            const minimum = state.camera.bounds.min[axis];
            if (minimum === undefined || !Number.isFinite(minimum) || !Number.isFinite(maximum) || maximum <= minimum) {
              throw new Error('The actual displayed upstream framing bounds are unavailable.');
            }
            return maximum - minimum;
          });
        const upstreamExtentBefore = displayedExtents(upstreamBefore);
        const upstreamExtentAfter = displayedExtents(upstreamDisplayed);
        const [beforeWidth] = upstreamExtentBefore;
        const [afterWidth] = upstreamExtentAfter;
        if (beforeWidth === undefined || afterWidth === undefined) {
          throw new Error('The actual displayed upstream width is unavailable.');
        }
        expect(afterWidth).toBeGreaterThan(beforeWidth);
        if (fixture.family === 'jscad') {
          // The exact edited source makes the cuboid X width equal its frozen 10 mm Z depth.
          expect(afterWidth).toBe(upstreamExtentAfter[2]);
        } else {
          // The Pico source grows the sphere radius from 8 to 10; all displayed physical extents grow together.
          expect(upstreamExtentAfter).toEqual([afterWidth, afterWidth, afterWidth]);
          for (const [axis, extent] of upstreamExtentAfter.entries()) {
            const previousExtent = upstreamExtentBefore[axis];
            if (previousExtent === undefined) {
              throw new Error('The prior displayed sphere extent is unavailable.');
            }
            expect(extent).toBeGreaterThan(previousExtent);
          }
        }
        await target.writeArtifact(
          `${prefix}-mounted-upstream-positive.json`,
          JSON.stringify(
            {
              upstreamBefore,
              upstreamAfter,
              upstreamTrace,
              upstreamPeerPreparationTrace,
              upstreamDisplayed,
              upstreamExtentBefore,
              upstreamExtentAfter,
              qualification:
                'Actual upstream default-request producer work and independently current displayed source/manifest/framing bounds. Memoized pane reuse is inferred; no pane projection-origin receipt or attributed pane mesh, performance or restoration claim.',
            },
            undefined,
            2,
          ),
        );
      },
    );
  }
}

for (const backend of ['webgl', 'webgpu'] as const) {
  test(`S15 hybrid curved part records reduced surfaces and positive authored edge pixels on ${backend}`, async () => {
    await openS15('scale-detail-hybrid-calibration', backend, s15DistantQualityCamera);
    await openS15ModelPane();
    const full = await readS15State();
    const pin = await readScaleCommittedPin();
    expect(pin.root.digest).toBe(full.root.digest);
    expect(pin.definitions).toBe(1);
    expect(pin.occurrences).toBe(1);
    const originalGlbs = await target.evaluate(async (expected) => {
      const bridge = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__;
      const subject = bridge?.getCommittedAssembly();
      if (
        !subject?.assemblyDisplay ||
        !subject.isCurrent() ||
        subject.assemblyDisplay.root.digest !== expected.root.digest
      ) {
        throw new Error('Hybrid authored edge acquisition lost its exact admitted pin.');
      }
      const files = [];
      for (const file of expected.byteDenominators.files.filter(({ kind }) => kind === 'glb')) {
        // oxlint-disable-next-line no-await-in-loop -- Retain the exact original hybrid asset under one captured authority.
        const bytes = await subject.readRawBytes(file.path);
        // oxlint-disable-next-line no-await-in-loop -- Check its real immutable digest before retaining it.
        const digest = `sha256:${[...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
        if (bytes.byteLength !== file.byteLength || digest !== file.digest || !subject.isCurrent()) {
          throw new Error('Hybrid authored edge original GLB differs from its checked pin.');
        }
        files.push({ path: file.path, digest, byteLength: bytes.byteLength, bytes: [...bytes] });
      }
      if (!subject.isCurrent()) {
        throw new Error('Hybrid authored edge acquisition subject retired.');
      }
      return { root: expected.root, diagnostics: subject.diagnostics, files };
    }, pin);
    expect(originalGlbs.files).toHaveLength(1);
    await target.writeArtifact(
      `s15-${backend}-hybrid-authored-edge-original-glbs.json`,
      JSON.stringify(originalGlbs, undefined, 2),
    );
    expect(full.selected).toHaveLength(0);
    expect(full.inventory.residentMandatoryEdgeTriangles).toBeGreaterThan(0);
    const approved = inject('s15ReviewedCalibration')[backend];
    if (!approved || approved.backend !== backend || !/^[a-f0-9]{64}$/u.test(approved.qualityEvidenceSha256)) {
      throw new Error(
        'Hybrid authored edge subject requires the existing reviewed backend policy and evidence identity.',
      );
    }
    const { policy } = approved;
    const capturePresentation = async (
      name: string,
      held: S15State,
      presentationOptions: Readonly<{ surfaces: boolean; lines: boolean }>,
    ) => {
      const { surfaces, lines } = presentationOptions;
      await target.evaluate(
        (presentation) => {
          const bridge = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__;
          if (!bridge) {
            throw new Error('Hybrid authored edge presentation owner is unavailable.');
          }
          bridge.setPresentation(presentation);
        },
        { surfaces, lines },
      );
      await target.waitFor(
        (expected) => {
          const inventory = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__?.getCommittedDrawInventory();
          return Boolean(
            inventory &&
            inventory.candidateSceneId === expected.candidate &&
            inventory.surfaces.every(({ visible }) => visible === expected.surfaces) &&
            inventory.edges.every(({ visible }) => visible === expected.lines),
          );
        },
        { candidate: held.inventory.candidateSceneId, surfaces, lines },
      );
      const frame = await target.evaluate(
        (presentation) => {
          const bridge = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__;
          if (!bridge) {
            throw new Error('Hybrid authored edge redraw owner is unavailable.');
          }
          const previousFrame = bridge.getRendererIdentity().frame;
          bridge.setPresentation(presentation);
          return previousFrame;
        },
        { surfaces, lines },
      );
      await target.waitFor((previousFrame) => {
        const bridge = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__;
        return Boolean(bridge && bridge.getRendererIdentity().frame > previousFrame);
      }, frame);
      const current = await readS15State();
      expect(s15Identity(current)).toEqual(s15Identity(held));
      expect(current.camera).toEqual(held.camera);
      expect(current.selected).toEqual(held.selected);
      expect(current.inventory.candidateSceneId).toBe(held.inventory.candidateSceneId);
      return surfaces || lines
        ? captureS15Frame(name, current)
        : target.screenshot(selectors.getByTestId('cad-viewer-canvas-region'), name);
    };
    const [primary] = await Promise.allSettled([
      (async () => {
        const fullImage = await capturePresentation(`s15-${backend}-hybrid-authored-edge-full.png`, full, {
          surfaces: true,
          lines: true,
        });
        const fullHidden = await capturePresentation(`s15-${backend}-hybrid-authored-edge-full-hidden.png`, full, {
          surfaces: false,
          lines: false,
        });
        const fullSurfaces = await capturePresentation(`s15-${backend}-hybrid-authored-edge-full-surfaces.png`, full, {
          surfaces: true,
          lines: false,
        });
        const fullEdges = await capturePresentation(`s15-${backend}-hybrid-authored-edge-full-edges.png`, full, {
          surfaces: false,
          lines: true,
        });
        const fullEdgesRepeat = await capturePresentation(
          `s15-${backend}-hybrid-authored-edge-full-edges-repeat.png`,
          full,
          { surfaces: false, lines: true },
        );
        await capturePresentation(`s15-${backend}-hybrid-authored-edge-full-restored.png`, full, {
          surfaces: true,
          lines: true,
        });
        const detail = await setS15Policy(policy, full);
        expect(s15Identity(detail)).toEqual(s15Identity(full));
        expect(detail.camera).toEqual(full.camera);
        const rawCalibration = detail.resources.at(-1)?.detail?.['detailCalibrationJson'];
        if (typeof rawCalibration !== 'string') {
          throw new TypeError('Hybrid authored edge projected error is unavailable.');
        }
        const calibration: unknown = JSON.parse(rawCalibration);
        if (
          !calibration ||
          typeof calibration !== 'object' ||
          !('maxProjectedApproximateErrorPixels' in calibration) ||
          typeof calibration.maxProjectedApproximateErrorPixels !== 'number' ||
          !Number.isFinite(calibration.maxProjectedApproximateErrorPixels) ||
          calibration.maxProjectedApproximateErrorPixels <= 0 ||
          !('projectionUnavailableCount' in calibration) ||
          calibration.projectionUnavailableCount !== 0
        ) {
          throw new Error('Hybrid authored edge projected error must be positive finite and actually available.');
        }
        expect(calibration.maxProjectedApproximateErrorPixels).toBeLessThanOrEqual(
          policy.screenSpace.maxApproximatePixelError * policy.screenSpace.enterDetailRatio,
        );
        const fullTriangles = full.inventory.surfaces.reduce((sum, { drawTriangles }) => sum + drawTriangles, 0);
        const detailTriangles = detail.inventory.surfaces.reduce((sum, { drawTriangles }) => sum + drawTriangles, 0);
        expect(detailTriangles).toBeGreaterThan(0);
        expect(detailTriangles).toBeLessThan(fullTriangles);
        expect(
          detail.inventory.surfaces.some(
            ({ canonicalGeometryId, drawGeometryId }) => canonicalGeometryId !== drawGeometryId,
          ),
        ).toBe(true);
        expect(detail.selected).toHaveLength(0);
        expect(detail.inventory.residentMandatoryEdgeTriangles).toBe(full.inventory.residentMandatoryEdgeTriangles);
        expect(detail.inventory.residentMandatoryEdgeTriangles).toBeGreaterThan(0);
        const detailImage = await capturePresentation(`s15-${backend}-hybrid-authored-edge-detail.png`, detail, {
          surfaces: true,
          lines: true,
        });
        const detailHidden = await capturePresentation(
          `s15-${backend}-hybrid-authored-edge-detail-hidden.png`,
          detail,
          { surfaces: false, lines: false },
        );
        const detailSurfaces = await capturePresentation(
          `s15-${backend}-hybrid-authored-edge-detail-surfaces.png`,
          detail,
          { surfaces: true, lines: false },
        );
        const detailEdges = await capturePresentation(`s15-${backend}-hybrid-authored-edge-detail-edges.png`, detail, {
          surfaces: false,
          lines: true,
        });
        const detailEdgesRepeat = await capturePresentation(
          `s15-${backend}-hybrid-authored-edge-detail-edges-repeat.png`,
          detail,
          { surfaces: false, lines: true },
        );
        const [
          fullSurfacePixels,
          detailSurfacePixels,
          fullEdgePixels,
          detailEdgePixels,
          edgeParity,
          edgeRepeat,
          fullEdgeRepeat,
          fullDetail,
        ] = await Promise.all([
          compareScalePngFrames(fullHidden, fullSurfaces),
          compareScalePngFrames(detailHidden, detailSurfaces),
          compareScalePngFrames(fullHidden, fullEdges),
          compareScalePngFrames(detailHidden, detailEdges),
          compareScalePngFrames(fullEdges, detailEdges),
          compareScalePngFrames(detailEdges, detailEdgesRepeat),
          compareScalePngFrames(fullEdges, fullEdgesRepeat),
          compareScalePngFrames(fullImage, detailImage),
        ]);
        for (const pixels of [
          fullSurfacePixels,
          detailSurfacePixels,
          fullEdgePixels,
          detailEdgePixels,
          edgeParity,
          edgeRepeat,
          fullEdgeRepeat,
          fullDetail,
        ]) {
          expect(Number.isFinite(pixels.width)).toBe(true);
          expect(Number.isFinite(pixels.height)).toBe(true);
          expect(pixels.width).toBeGreaterThan(0);
          expect(pixels.height).toBeGreaterThan(0);
          expect(pixels.width).toBe(edgeParity.width);
          expect(pixels.height).toBe(edgeParity.height);
        }
        expect(fullSurfacePixels.changedPixels).toBeGreaterThan(0);
        expect(detailSurfacePixels.changedPixels).toBeGreaterThan(0);
        expect(fullEdgePixels.changedPixels).toBeGreaterThan(0);
        expect(detailEdgePixels.changedPixels).toBeGreaterThan(0);
        expect(edgeParity.changedPixels).toBe(0);
        expect(edgeRepeat.changedPixels).toBe(0);
        expect(fullEdgeRepeat.changedPixels).toBe(0);
        const finalPin = await readScaleCommittedPin();
        expect(finalPin.root).toEqual(pin.root);
        expect(finalPin.byteDenominators).toEqual(pin.byteDenominators);
        await target.writeArtifact(
          `s15-${backend}-hybrid-authored-edge-calibration.json`,
          JSON.stringify(
            {
              status: 'HYBRID_AUTHORED_EDGE_QUALITY_CANDIDATE_REQUIRES_REVIEW',
              policy,
              qualityEvidenceSha256: approved.qualityEvidenceSha256,
              calibration,
              namedCamera: s15DistantQualityCamera,
              checkedPin: finalPin,
              full,
              detail,
              fullTriangles,
              detailTriangles,
              images: {
                fullImage,
                fullHidden,
                fullSurfaces,
                fullEdges,
                fullEdgesRepeat,
                detailImage,
                detailHidden,
                detailSurfaces,
                detailEdges,
                detailEdgesRepeat,
              },
              pixels: {
                fullSurfacePixels,
                detailSurfacePixels,
                fullEdgePixels,
                detailEdgePixels,
                edgeParity,
                edgeRepeat,
                fullEdgeRepeat,
                fullDetail,
              },
              productionDefault: null,
              qualityAccepted: false,
              nativePhysical: null,
            },
            undefined,
            2,
          ),
        );
      })(),
    ]);
    const [restoration] = await Promise.allSettled([
      (async () => {
        await target.evaluate(() => {
          const bridge = (globalThis as S15BridgeWindow).__TAU_SECTION_VIEW_TEST__;
          if (!bridge) {
            throw new Error('Hybrid authored edge restoration owner is unavailable.');
          }
          bridge.setPresentation({ surfaces: true, lines: true });
        });
        const current = await readS15State();
        const restored = await setS15Policy(undefined, current);
        expect(s15Identity(restored)).toEqual(s15Identity(full));
        expect(restored.camera).toEqual(full.camera);
        expect(restored.selected).toEqual(full.selected);
        expect(s15DrawIds(restored)).toEqual(s15DrawIds(full));
        const restoredPin = await readScaleCommittedPin();
        expect(restoredPin.root).toEqual(pin.root);
        expect(restoredPin.byteDenominators).toEqual(pin.byteDenominators);
      })(),
    ]);
    if (restoration.status === 'rejected') {
      const cleanupError: unknown = restoration.reason;
      // Drain diagnostic retention without replacing the primary or restoration failure.
      await Promise.allSettled([
        (async () => {
          await target.writeArtifact(
            `s15-${backend}-hybrid-authored-edge-restoration-failure.json`,
            JSON.stringify(
              {
                primaryStatus: primary.status,
                restorationStatus: restoration.status,
                cleanupError:
                  cleanupError instanceof Error
                    ? { name: cleanupError.name, message: cleanupError.message, stack: cleanupError.stack }
                    : String(cleanupError),
              },
              undefined,
              2,
            ),
          );
        })(),
      ]);
    }
    if (primary.status === 'rejected') {
      const error: unknown = primary.reason;
      throw error;
    }
    if (restoration.status === 'rejected') {
      const error: unknown = restoration.reason;
      throw error;
    }
  });
}
