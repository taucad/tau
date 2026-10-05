/* oxlint-disable no-bitwise, typescript/consistent-type-assertions -- Binary header fixtures and partial XState snapshots intentionally use low-level encoding and test-only casts. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { Matrix4 } from 'three';
import { writeGlb } from '@taucad/geometry-core';
import type { Mechanism } from '@taucad/kinematics';
import type { ExportFile } from '@taucad/types';
import type { PublishedAssemblyDocument } from '@taucad/runtime/client';
import type { Artifact, Rendering } from '@taucad/runtime';
import type { CameraState } from '@taucad/camera';
import {
  canonicalCaptureViews,
  captureCadImages,
  captureFilesToDataUrls,
  captureSettledCadImages,
} from '#services/headless-capture.js';
import type { HeadlessImageJob } from '#services/headless-image.service.js';
import { awaitFreshRender } from '#machines/await-fresh-render.js';
import { getGraphicsCameraState } from '#services/graphics-camera-registry.js';
import { recordHeadlessImageTiming } from '#services/headless-image-debug.js';
import { parseGltfBytes } from '#components/geometry/graphics/metadata/gltf-component-manifest.js';
import {
  isSectionRemoved,
  maxSectionPieces,
  resolveSectionPieces,
} from '#components/geometry/graphics/section-cuts.js';
import type { SectionAxis, SectionCut, SectionPlane } from '#components/geometry/graphics/section-cuts.js';

vi.mock('#machines/await-fresh-render.js', () => ({ awaitFreshRender: vi.fn() }));
vi.mock('#services/graphics-camera-registry.js', () => ({ getGraphicsCameraState: vi.fn() }));
vi.mock('#services/headless-image-debug.js', () => ({ recordHeadlessImageTiming: vi.fn() }));

type ExportImage = (job: HeadlessImageJob) => Promise<ExportFile[] | undefined>;

const png = (width: number, height: number): ExportFile => {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return { name: 'render.png', mimeType: 'image/png', bytes };
};

const webp = (width: number, height: number, index = 0): ExportFile => {
  const bytes = new Uint8Array(31);
  bytes.set(new TextEncoder().encode('RIFF'), 0);
  bytes.set(new TextEncoder().encode('WEBP'), 8);
  bytes.set(new TextEncoder().encode('VP8X'), 12);
  const encodedWidth = width - 1;
  const encodedHeight = height - 1;
  bytes.set([encodedWidth & 0xff, (encodedWidth >> 8) & 0xff, (encodedWidth >> 16) & 0xff], 24);
  bytes.set([encodedHeight & 0xff, (encodedHeight >> 8) & 0xff, (encodedHeight >> 16) & 0xff], 27);
  bytes[30] = index;
  return { name: `render-${index}.webp`, mimeType: 'image/webp', bytes };
};

const snapshot = (artifact: Artifact & { hash: string }, entryPath = '/parts/bracket.ts') =>
  ({
    context: {
      rendering: {
        success: true,
        artifact,
        hash: artifact.hash,
        view: 'model',
        requestId: 'view-request',
        evaluationId: 'evaluation',
        transient: false,
        issues: [],
      } satisfies Rendering,
      entryPath,
      parameters: { width: 42 },
      units: { length: 'mm' },
      latestRenderingOutcome: 'success',
      kernelIssues: new Map(),
    },
    hasTag: () => false,
  }) as unknown as Parameters<typeof captureSettledCadImages>[0]['cadSnapshot'];

const gltf = {
  mimeType: 'model/gltf-binary',
  content: new Uint8Array([0x67, 0x6c, 0x54, 0x46]),
  hash: 'gltf-hash',
} satisfies Artifact & { hash: string };
const presentationGltf = {
  mimeType: 'model/gltf-binary',
  content: new TextEncoder().encode(
    JSON.stringify({
      scene: 0,
      scenes: [{ nodes: [0, 1] }],
      nodes: [
        { name: 'Hidden', mesh: 0 },
        { name: 'Visible', mesh: 1 },
      ],
      meshes: [{ primitives: [{ attributes: {} }] }, { primitives: [{ attributes: {} }] }],
    }),
  ),
  hash: 'presentation-gltf-hash',
} satisfies Artifact & { hash: string };
const svg = {
  mimeType: 'image/svg+xml',
  content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"></svg>',
  hash: 'svg-hash',
} satisfies Artifact & { hash: string };
const cameraState = {
  frameId: 'tau:root',
  position: [8, -6, 4],
  target: [1, 2, 3],
  up: [0.1, 0.2, 0.97],
  projection: { kind: 'perspective', verticalFieldOfView: 52, zoom: 1.4 },
  clipping: { near: 0.2, far: 900 },
  aspect: 16 / 9,
} as const;

describe('headless capture adapter', () => {
  const assemblyCapture = () => {
    const root = { digest: 'sha256:root-b' };
    const publication = { root };
    const admitted = { publication };
    const exportProjection = vi.fn<PublishedAssemblyDocument['exportPublished']>(async () => ({
      success: true,
      exportId: 'glb',
      issues: [],
      files: [{ name: 'assembly.glb', mimeType: 'model/gltf-binary', bytes: gltf.content }],
    }));
    const cadSnapshot = {
      ...snapshot(gltf),
      context: {
        ...snapshot(gltf).context,
        rendering: undefined,
        committedRendering: undefined,
        committedAssemblyDisplay: { root, admitted, document: { exportPublished: exportProjection } },
        publishedAssemblyRoot: root,
        publishedAssembly: publication,
        admittedAssembly: admitted,
        publishedAssemblyEntryPath: '/parts/bracket.ts',
        kernelClient: undefined,
      },
    } as unknown as Parameters<typeof captureSettledCadImages>[0]['cadSnapshot'];
    const graphicsContext = {
      gltfPresentation: { presentedKey: root.digest, phase: 'presented' },
      modelInteractionRef: { getSnapshot: () => ({ context: { unitsById: {} } }) },
      modelInteractionUnitId: 'assembly-unit',
      kinematicsRef: { getSnapshot: () => ({ context: poseContext }) },
      committedSectionCuts: [],
    };
    const poseContext = { revision: 0, unitsById: {} as Record<string, { coordinates: Record<string, number> }> };
    return {
      root,
      cadSnapshot,
      exportProjection,
      graphicsContext,
      poseContext,
      cadRef: { getSnapshot: () => cadSnapshot } as Parameters<typeof captureCadImages>[0]['cadRef'],
      graphicsRef: { getSnapshot: () => ({ context: graphicsContext }) } as unknown as Parameters<
        typeof captureCadImages
      >[0]['graphicsRef'],
    };
  };

  it.each(['preparing', 'failed'])(
    'denies root B current-view capture while root A remains displayed (%s)',
    async (phase) => {
      const fixture = assemblyCapture();
      fixture.graphicsContext.gltfPresentation = { presentedKey: 'sha256:root-a', phase };
      vi.mocked(awaitFreshRender).mockResolvedValue(fixture.cadSnapshot);
      const exportImage = vi.fn<ExportImage>();
      await expect(
        captureCadImages({
          cadRef: fixture.cadRef,
          graphicsRef: fixture.graphicsRef,
          cameraState,
          imageService: { export: exportImage },
          recipe: { purpose: 'utility', mode: 'current' },
        }),
      ).rejects.toThrow('still preparing its displayed scene');
      expect(fixture.exportProjection).not.toHaveBeenCalled();
      expect(exportImage).not.toHaveBeenCalled();
    },
  );

  it.each(['preparing', 'failed', 'missing'])(
    'denies an ordinary source B current-view capture while source A remains displayed (%s)',
    async (phase) => {
      const fixture = assemblyCapture();
      const sourceSnapshot = snapshot(gltf);
      fixture.graphicsContext.gltfPresentation = { presentedKey: phase === 'missing' ? '' : 'source-a', phase };
      vi.mocked(awaitFreshRender).mockResolvedValue(sourceSnapshot);
      const exportImage = vi.fn<ExportImage>();
      await expect(
        captureCadImages({
          cadRef: { getSnapshot: () => sourceSnapshot } as Parameters<typeof captureCadImages>[0]['cadRef'],
          graphicsRef: phase === 'missing' ? undefined : fixture.graphicsRef,
          cameraState,
          imageService: { export: exportImage },
          recipe: { purpose: 'utility', mode: 'current' },
        }),
      ).rejects.toThrow('still preparing its displayed scene');
      expect(exportImage).not.toHaveBeenCalled();
    },
  );

  it('rejects a committed source change while waiting for current-view freshness before exporting', async () => {
    const fixture = assemblyCapture();
    const selected = snapshot(gltf);
    fixture.graphicsContext.gltfPresentation.presentedKey = gltf.hash;
    const fresh = Promise.withResolvers<typeof selected>();
    vi.mocked(awaitFreshRender).mockReturnValue(fresh.promise);
    const exportImage = vi.fn<ExportImage>();
    const capture = captureCadImages({
      cadRef: { getSnapshot: () => selected } as Parameters<typeof captureCadImages>[0]['cadRef'],
      graphicsRef: fixture.graphicsRef,
      cameraState,
      imageService: { export: exportImage },
      recipe: { purpose: 'utility', mode: 'current' },
    });
    fixture.graphicsContext.gltfPresentation.presentedKey = 'source-c';
    fresh.resolve(selected);
    await expect(capture).rejects.toThrow('still preparing its displayed scene');
    expect(exportImage).not.toHaveBeenCalled();
  });

  it.each(['key', 'source'] as const)('fences ordinary current-view %s changes after export', async (changed) => {
    const fixture = assemblyCapture();
    let selected = snapshot(gltf);
    fixture.graphicsContext.gltfPresentation.presentedKey = gltf.hash;
    vi.mocked(awaitFreshRender).mockResolvedValue(selected);
    const exportImage = vi.fn<ExportImage>(async () => [png(2400, 1350)]);
    const options = {
      cadRef: { getSnapshot: () => selected } as Parameters<typeof captureCadImages>[0]['cadRef'],
      graphicsRef: fixture.graphicsRef,
      cameraState,
      imageService: { export: exportImage },
      recipe: { purpose: 'utility', mode: 'current' },
    } as const;
    await expect(captureCadImages(options)).resolves.toMatchObject({
      files: [expect.objectContaining({ mimeType: 'image/png' })],
    });
    exportImage.mockImplementation(async () => {
      if (changed === 'key') {
        fixture.graphicsContext.gltfPresentation.presentedKey = 'source-c';
      } else {
        selected = snapshot({ ...gltf, hash: 'source-c' });
      }
      return [png(2400, 1350)];
    });
    await expect(captureCadImages(options)).rejects.toThrow('changed during image capture');
  });

  it('lazily projects the displayed assembly and rejects a scene change during capture', async () => {
    const fixture = assemblyCapture();
    vi.mocked(awaitFreshRender).mockResolvedValue(fixture.cadSnapshot);
    const exportImage = vi.fn<ExportImage>(async () => [png(2400, 1350)]);
    const options = {
      cadRef: fixture.cadRef,
      graphicsRef: fixture.graphicsRef,
      cameraState,
      imageService: { export: exportImage },
      recipe: { purpose: 'utility', mode: 'current' },
    } as const;
    expect(fixture.exportProjection).not.toHaveBeenCalled();
    await expect(captureCadImages(options)).resolves.toMatchObject({
      files: [expect.objectContaining({ mimeType: 'image/png' })],
    });
    expect(fixture.exportProjection).toHaveBeenCalledWith({ format: 'glb', publishedAssembly: { root: fixture.root } });
    exportImage.mockImplementation(async () => {
      fixture.graphicsContext.gltfPresentation.presentedKey = 'sha256:root-c';
      return [png(2400, 1350)];
    });
    await expect(captureCadImages(options)).rejects.toThrow('changed during image capture');
  });

  it('denies active motion and fences pose revisions for current-view capture while canonical recipes remain as-built', async () => {
    const fixture = assemblyCapture();
    vi.mocked(awaitFreshRender).mockResolvedValue(fixture.cadSnapshot);
    const exportImage = vi.fn<ExportImage>(async () => [png(2400, 1350)]);
    const options = {
      cadRef: fixture.cadRef,
      graphicsRef: fixture.graphicsRef,
      cameraState,
      imageService: { export: exportImage },
      recipe: { purpose: 'utility', mode: 'current' },
    } as const;
    fixture.poseContext.unitsById['assembly-unit'] = { coordinates: { hinge: 0.5 } };
    await expect(captureCadImages(options)).rejects.toThrow('requires the as-built pose');
    expect(fixture.exportProjection).not.toHaveBeenCalled();
    expect(exportImage).not.toHaveBeenCalled();
    exportImage.mockImplementation(async () => [webp(2400, 1350)]);
    await expect(
      captureCadImages({ ...options, recipe: { purpose: 'chat', mode: 'isometric' } }),
    ).resolves.toMatchObject({ files: [expect.objectContaining({ mimeType: 'image/webp' })] });
    fixture.poseContext.unitsById['assembly-unit'] = { coordinates: { hinge: 0 } };
    exportImage.mockImplementation(async () => {
      fixture.poseContext.revision += 1;
      return [png(2400, 1350)];
    });
    await expect(captureCadImages(options)).rejects.toThrow('pose changed during image capture');
  });

  it('captures a chat image from settled GLTF without a viewer camera using bounds framing', async () => {
    vi.mocked(awaitFreshRender).mockResolvedValue(snapshot(gltf, 'other.ts'));
    const exportImage = vi.fn<ExportImage>(async () => [webp(2400, 1350)]);

    const capture = await captureCadImages({
      cadRef: {} as Parameters<typeof captureCadImages>[0]['cadRef'],
      imageService: { export: exportImage },
      recipe: { purpose: 'chat', mode: 'isometric' },
    });

    expect(capture.files).toHaveLength(1);
    const job = exportImage.mock.calls[0]?.[0];
    if (job?.sourceFormat !== 'glb' || job.format !== 'webp') {
      throw new Error('Expected a GLB WebP job');
    }
    expect(job.sourcePath).toBe('other.ts');
    expect(job.exportOptions).toMatchObject({
      width: 2400,
      height: 1350,
      label: 'other.ts',
      camera: { framing: 'bounds', projection: { kind: 'perspective', verticalFieldOfView: 45 } },
    });
  });

  it('maps frozen current GLTF camera state into the canonical annotated metre recipe', async () => {
    const exportImage = vi.fn<ExportImage>(async (_job) => [webp(2400, 1350)]);

    const files = await captureSettledCadImages({
      cadSnapshot: snapshot(gltf),
      cameraState,
      imageService: { export: exportImage },
      recipe: { purpose: 'chat', mode: 'current' },
    });

    expect(files).toHaveLength(1);
    const job = exportImage.mock.calls[0]![0];
    if (job.sourceFormat !== 'glb' || job.format !== 'webp') {
      throw new Error('Expected a GLB WebP job');
    }
    expect(job).toMatchObject({
      sourcePath: '/parts/bracket.ts',
      content: gltf.content,
    });
    expect(job.exportOptions).toMatchObject({
      width: 2400,
      height: 1350,
      lineWidth: 3,
      camera: {
        framing: 'fixed',
        position: [8, -6, 4],
        target: [1, 2, 3],
        up: [0.1, 0.2, 0.97],
        projection: { kind: 'perspective', verticalFieldOfView: 52, zoom: 1.4 },
        clipping: { near: 0.2, far: 900 },
      },
      quality: 1,
      background: '#242424',
      label: '/parts/bracket.ts',
      axes: true,
      scaleBar: true,
      world: { up: '+z', forward: '-y', unit: 'meter' },
    });
  });

  it.each([
    ['x', [1, 0, 0]],
    ['y', [0, 1, 0]],
    ['z', [0, 0, 1]],
  ] as const)(
    'keeps the fixed Tau world while the %s-up viewer orientation rides camera.up',
    async (upDirection, up) => {
      const exportImage = vi.fn<ExportImage>(async (_job) => [webp(2400, 1350)]);

      await captureSettledCadImages({
        cadSnapshot: snapshot(gltf),
        cameraState: { ...cameraState, up },
        presentation: {
          upDirection,
          enableSurfaces: true,
          enableLines: true,
          hiddenComponentIds: [],
          isolatedComponentIds: [],
        },
        imageService: { export: exportImage },
        recipe: { purpose: 'chat', mode: 'current' },
      });

      const job = exportImage.mock.calls[0]![0];
      if (job.sourceFormat !== 'glb') {
        throw new Error('Expected a GLB job');
      }
      expect(job.exportOptions).toMatchObject({
        world: { up: '+z', forward: '-y', unit: 'meter' },
        camera: { framing: 'fixed', up },
      });
    },
  );

  it('returns six ordered GLTF views with complete per-view labels', async () => {
    const exportImage = vi.fn<ExportImage>(async (_job) =>
      canonicalCaptureViews.map((_view, index) => webp(1600, 1600, index)),
    );

    await captureSettledCadImages({
      cadSnapshot: snapshot(gltf),
      imageService: { export: exportImage },
      recipe: { purpose: 'chat', mode: 'orthographic' },
    });

    const job = exportImage.mock.calls[0]![0];
    expect(job).toMatchObject({
      sourceFormat: 'glb',
      geometryHash: 'gltf-hash',
      exportOptions: {
        mode: 'batch',
        width: 1600,
        height: 1600,
        lineWidth: 3,
        background: '#242424',
        axes: true,
        scaleBar: true,
        quality: 1,
      },
    });
    if (job.sourceFormat !== 'glb' || job.format !== 'webp') {
      throw new Error('Expected a GLB WebP batch job');
    }
    const batchOptions = job.exportOptions as {
      readonly mode: 'batch';
      readonly views: ReadonlyArray<{
        readonly id: string;
        readonly label?: string;
        readonly camera: { readonly framing: 'bounds'; readonly projection: { readonly kind: 'orthographic' } };
      }>;
    };
    expect(batchOptions.views.map(({ id }) => id)).toEqual(canonicalCaptureViews.map(({ id }) => id));
    expect(batchOptions.views.map(({ label }) => label)).toEqual(canonicalCaptureViews.map(({ label }) => label));
  });

  it('keeps agent edge intent with the shared three-pixel line policy', async () => {
    const exportImage = vi.fn<ExportImage>(async (_job) => [webp(1600, 1600)]);

    await captureSettledCadImages({
      cadSnapshot: snapshot(gltf),
      imageService: { export: exportImage },
      recipe: { purpose: 'agent', mode: 'isometric', includeEdges: false },
    });

    expect(exportImage.mock.calls[0]![0]).toMatchObject({
      exportOptions: { width: 1600, height: 1600, lineWidth: 3, lines: false },
    });
  });

  it('keeps the three-pixel edge recipe explicit for utility captures', async () => {
    const exportImage = vi.fn<ExportImage>(async (_job) => [png(2400, 1350)]);

    await captureSettledCadImages({
      cadSnapshot: snapshot(gltf),
      cameraState,
      imageService: { export: exportImage },
      recipe: { purpose: 'utility', mode: 'current' },
    });

    expect(exportImage.mock.calls[0]![0]).toMatchObject({
      exportOptions: { width: 2400, height: 1350, lineWidth: 3 },
    });
  });

  it('maps presentation toggles, fresh visibility refs, and section units into one GLTF request', async () => {
    const exportImage = vi.fn<ExportImage>(async (_job) => [webp(2400, 1350)]);

    await captureSettledCadImages({
      cadSnapshot: snapshot(presentationGltf),
      cameraState,
      presentation: {
        upDirection: 'z',
        enableSurfaces: false,
        enableLines: false,
        hiddenComponentIds: ['component:node-0'],
        isolatedComponentIds: [],
        sectionCuts: [{ id: 'cut', kind: 'plane', plane: 'xz', offset: 2, isFlipped: true }],
      },
      imageService: { export: exportImage },
      recipe: { purpose: 'chat', mode: 'current' },
    });

    expect(exportImage.mock.calls[0]![0]).toMatchObject({
      exportOptions: {
        surfaces: false,
        lines: false,
        visiblePrimitives: [{ nodeIndex: 1, meshIndex: 1, primitiveIndex: 0 }],
        sections: {
          planes: [{ point: [0, 2, 0], normal: [0, 1, 0] }],
          clipSurfaces: true,
          clipLines: true,
        },
      },
    });
  });

  it('freezes camera and semantic presentation intent before awaiting fresh geometry', async () => {
    let resolveFresh!: (value: Parameters<typeof captureSettledCadImages>[0]['cadSnapshot']) => void;
    const fresh = new Promise<Parameters<typeof captureSettledCadImages>[0]['cadSnapshot']>((resolve) => {
      resolveFresh = resolve;
    });
    vi.mocked(awaitFreshRender).mockReturnValue(fresh);
    const liveCamera: {
      frameId: string;
      position: [number, number, number];
      target: [number, number, number];
      up: [number, number, number];
      projection: CameraState['projection'];
      clipping: CameraState['clipping'];
      aspect: number;
    } = {
      frameId: 'tau:root',
      position: [8, -6, 4] as [number, number, number],
      target: [1, 2, 3] as [number, number, number],
      up: [0, 0, 1] as [number, number, number],
      projection: { kind: 'perspective', verticalFieldOfView: 52, zoom: 1.4 },
      clipping: { near: 0.2, far: 900 },
      aspect: 16 / 9,
    };
    const liveUnit = {
      hiddenComponentIds: ['component:node-0'],
      isolatedComponentIds: [] as string[],
    };
    const liveContext = {
      enableSurfaces: false,
      enableLines: true,
      upDirection: 'z',
      isSectionViewActive: true,
      committedSectionCuts: [
        { id: 'cut', kind: 'plane', plane: 'xy', offset: 1, isFlipped: true },
      ] as readonly SectionCut[],
      gltfPresentation: { presentedKey: presentationGltf.hash },
      modelInteractionUnitId: 'unit',
      kinematicsRef: { getSnapshot: () => ({ context: { revision: 0, unitsById: {} } }) },
      modelInteractionRef: {
        getSnapshot: () => ({ context: { unitsById: { unit: liveUnit } } }),
      },
    };
    const graphicsRef = {
      getSnapshot: () => ({
        context: liveContext,
      }),
    } as unknown as Parameters<typeof captureCadImages>[0]['graphicsRef'];
    const exportImage = vi.fn<ExportImage>(async (_job) => [webp(2400, 1350)]);
    vi.mocked(getGraphicsCameraState).mockReturnValue(liveCamera);
    const sourceSnapshot = snapshot(presentationGltf);
    const capture = captureCadImages({
      cadRef: { getSnapshot: () => sourceSnapshot } as Parameters<typeof captureCadImages>[0]['cadRef'],
      graphicsRef,
      imageService: { export: exportImage },
      recipe: { purpose: 'chat', mode: 'current' },
    });

    liveCamera.position[0] = 99;
    liveCamera.up[0] = 1;
    liveContext.enableSurfaces = true;
    liveContext.committedSectionCuts = [{ id: 'cut', kind: 'plane', plane: 'xy', offset: 9, isFlipped: true }];
    liveUnit.hiddenComponentIds[0] = 'component:node-1';
    resolveFresh(sourceSnapshot);
    await capture;

    expect(exportImage.mock.calls[0]![0]).toMatchObject({
      exportOptions: {
        camera: { position: [8, -6, 4], up: [0, 0, 1] },
        surfaces: false,
        visiblePrimitives: [{ nodeIndex: 1, meshIndex: 1, primitiveIndex: 0 }],
        sections: { planes: [{ point: [0, 0, 1], normal: [0, 0, 1] }] },
      },
    });
  });

  it('routes either SVG capture mode to one canonical annotated PNG', async () => {
    const exportImage = vi.fn<ExportImage>(async (_job) => [png(2400, 1350)]);
    const common = {
      cadSnapshot: snapshot(svg, '/drawings/profile.ts'),
      imageService: { export: exportImage },
    };

    await captureSettledCadImages({
      ...common,
      cameraState: { ...cameraState, aspect: 1 },
      recipe: { purpose: 'chat', mode: 'current' },
    });

    const job = exportImage.mock.calls[0]![0];
    if (job.sourceFormat !== 'svg') {
      throw new Error('Expected an SVG job');
    }
    expect(job).toMatchObject({ content: svg.content, format: 'png' });
    expect(job.exportOptions).toMatchObject({
      width: 2400,
      height: 1350,
      background: '#242424',
      label: '/drawings/profile.ts',
      axes: true,
      scaleBar: true,
      lengthSymbol: 'mm',
    });
    expect(job.exportOptions).not.toHaveProperty('lineWidth');
    const orthographic = await captureSettledCadImages({
      ...common,
      recipe: { purpose: 'agent', mode: 'orthographic', includeEdges: true },
    });
    expect(orthographic).toHaveLength(1);
    expect(exportImage).toHaveBeenCalledTimes(2);
    const orthographicJob = exportImage.mock.calls[1]![0];
    expect(orthographicJob).toMatchObject({ sourceFormat: 'svg', content: svg.content, format: 'png' });
    expect(orthographicJob.exportOptions).toMatchObject({ width: 1600, height: 1600, axes: true, scaleBar: true });
  });

  it('should capture the selected fresh drawing in its units despite a failed default view', async () => {
    vi.mocked(awaitFreshRender).mockClear();
    const defaultSnapshot = snapshot(gltf);
    defaultSnapshot.context.latestRenderingOutcome = 'failure';
    const cadRef = mock<Parameters<typeof captureCadImages>[0]['cadRef']>({ getSnapshot: () => defaultSnapshot });
    const selected: Rendering = {
      success: true,
      artifact: { ...svg, units: { length: 'cm' } },
      hash: 'selected-drawing',
      view: 'schematic',
      requestId: 'selected-request',
      evaluationId: 'selected-evaluation',
      transient: false,
      issues: [],
    };
    let resolveRendering!: (rendering: Rendering) => void;
    const captureRendering = vi.fn(
      async () =>
        new Promise<Rendering>((resolve) => {
          resolveRendering = resolve;
        }),
    );
    const exportImage = vi.fn<ExportImage>(async () => [png(2400, 1350)]);
    const capture = captureCadImages({
      cadRef,
      captureRendering,
      imageService: { export: exportImage },
      recipe: { purpose: 'chat', mode: 'current' },
    });
    expect(exportImage).not.toHaveBeenCalled();
    resolveRendering(selected);
    await capture;
    expect(awaitFreshRender).not.toHaveBeenCalled();
    expect(exportImage.mock.calls[0]?.[0]).toMatchObject({
      sourceFormat: 'svg',
      content: svg.content,
      exportOptions: { lengthSymbol: 'cm' },
    });
    expect(exportImage.mock.calls[0]?.[0].identity).toContain('selected-drawing');
  });

  it('should reject a selected transient projection instead of capturing the default model', async () => {
    const cadRef = mock<Parameters<typeof captureCadImages>[0]['cadRef']>({ getSnapshot: () => snapshot(gltf) });
    const { rendering } = snapshot(svg).context;
    if (!rendering) {
      throw new Error('Missing rendering fixture');
    }
    const exportImage = vi.fn<ExportImage>();
    await expect(
      captureCadImages({
        cadRef,
        captureRendering: async () => ({ ...rendering, transient: true }),
        imageService: { export: exportImage },
        recipe: { purpose: 'chat', mode: 'current' },
      }),
    ).rejects.toThrow('The selected CAD view has no committed rendering');
    expect(exportImage).not.toHaveBeenCalled();
  });

  it('should send posed transparent capture bytes with a distinct cache identity', async () => {
    const content = writeGlb({
      nodes: [
        {
          primitives: [
            {
              mode: 4,
              positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
              material: {},
            },
          ],
        },
      ],
    });
    const original = new Uint8Array(content);
    const delta = new Matrix4().makeRotationZ(Math.PI / 2);
    const mechanism: Mechanism = {
      schemaVersion: 1,
      units: { length: 'm', angle: 'rad' },
      root: 'base',
      links: { base: { components: [] }, arm: { components: ['component:node-0'] } },
      joints: { hinge: { type: 'revolute', parent: 'base', child: 'arm', origin: [0, 0, 0], axis: [0, 0, 1] } },
    };
    const exportImage = vi.fn<ExportImage>(async () => [webp(2400, 1350)]);
    await captureSettledCadImages({
      cadSnapshot: snapshot({ ...gltf, content }),
      cameraState,
      imageService: { export: exportImage },
      recipe: { purpose: 'chat', mode: 'current' },
      presentation: {
        upDirection: 'z',
        enableSurfaces: true,
        enableLines: true,
        hiddenComponentIds: [],
        isolatedComponentIds: [],
        model: {
          mechanism,
          pose: { coordinates: { hinge: Math.PI / 2 }, linkTransforms: { arm: delta.toArray() } },
          opacityByComponentId: { 'component:node-0': 0.25 },
        },
      },
    });
    const job = exportImage.mock.calls[0]?.[0];
    if (job?.sourceFormat !== 'glb') {
      throw new Error('Expected a GLB capture');
    }
    expect(job.geometryHash).not.toBe(gltf.hash);
    const { json } = parseGltfBytes(job.content);
    expect(json.nodes?.[0]?.matrix).toEqual(delta.toArray());
    const surface = json.meshes?.[json.nodes?.[0]?.mesh ?? 0]?.primitives?.[0];
    expect(json.materials?.[surface?.material ?? 0]?.pbrMetallicRoughness?.baseColorFactor?.[3]).toBe(0.25);
    expect(content).toEqual(original);
  });

  it('rejects malformed output before dispatch and encodes MIME-aware data URLs', async () => {
    const exportImage = vi.fn<ExportImage>(async (_job) => [png(2400, 1350)]);
    await expect(
      captureSettledCadImages({
        cadSnapshot: snapshot(gltf),
        cameraState,
        imageService: { export: exportImage },
        recipe: { purpose: 'chat', mode: 'current' },
      }),
    ).rejects.toThrow('non-empty image/webp');
    expect(captureFilesToDataUrls([png(1, 1)])[0]).toMatch(/^data:image\/png;base64,/u);
  });

  it('rejects unknown media without invoking a canvas fallback', async () => {
    const exportImage = vi.fn();
    const webrtc = { mimeType: 'application/x-webrtc-stream', content: 'stream', hash: 'live-hash' };

    await expect(
      captureSettledCadImages({
        cadSnapshot: snapshot(webrtc),
        cameraState,
        imageService: { export: exportImage },
        recipe: { purpose: 'chat', mode: 'current' },
      }),
    ).rejects.toThrow('Unsupported CAD artifact: application/x-webrtc-stream');
    expect(exportImage).not.toHaveBeenCalled();
  });

  it('uses the shared reserved-key precedence for failed renders', async () => {
    const failedSnapshot = {
      context: {
        rendering: snapshot(gltf).context.rendering,
        entryPath: '/parts/bracket.ts',
        units: { length: 'mm' },
        latestRenderingOutcome: 'failure',
        kernelIssues: new Map([
          [
            '__render__',
            [
              { message: 'render issue one', code: 'RUNTIME', type: 'runtime', severity: 'error' },
              { message: 'render issue two', code: 'RUNTIME', type: 'runtime', severity: 'error' },
            ],
          ],
        ]),
      },
      hasTag: () => false,
    } as unknown as Parameters<typeof captureSettledCadImages>[0]['cadSnapshot'];

    await expect(
      captureSettledCadImages({
        cadSnapshot: failedSnapshot,
        imageService: { export: vi.fn() },
        recipe: { purpose: 'chat', mode: 'current' },
      }),
    ).rejects.toThrow('render issue one; render issue two');
  });

  it('uses the deterministic machine fallback for a failed render without issues', async () => {
    const failedSnapshot = {
      context: {
        rendering: snapshot(gltf).context.rendering,
        entryPath: '/parts/bracket.ts',
        units: { length: 'mm' },
        latestRenderingOutcome: 'failure',
        kernelIssues: new Map(),
      },
      hasTag: () => false,
    } as unknown as Parameters<typeof captureSettledCadImages>[0]['cadSnapshot'];

    await expect(
      captureSettledCadImages({
        cadSnapshot: failedSnapshot,
        imageService: { export: vi.fn() },
        recipe: { purpose: 'chat', mode: 'current' },
      }),
    ).rejects.toThrow('The selected CAD render failed');
  });
});

describe('headless capture of section cuts', () => {
  type Vector = readonly [number, number, number];
  type RetainedPlane = { readonly point: Vector; readonly normal: Vector };
  type Sections = { readonly planes: RetainedPlane[]; readonly clipSurfaces: boolean; readonly clipLines: boolean };

  const planeCut = (plane: SectionPlane, offset: number, isFlipped: boolean): SectionCut => ({
    id: `${plane}:${offset}`,
    kind: 'plane',
    plane,
    offset,
    isFlipped,
  });

  const cutaway = (axis: SectionAxis, start: number, sweep: number): SectionCut => ({
    id: `${axis}:${start}:${sweep}`,
    kind: 'revolution',
    axis,
    origin: [0.1, -0.2, 0.05],
    start,
    sweep,
  });

  /** A viewer's graphics actor with `cuts` committed, and Section on unless `isSectionViewActive` says otherwise. */
  const graphicsWith = (cuts: readonly SectionCut[], isSectionViewActive = true) => {
    const context = {
      enableSurfaces: true,
      enableLines: true,
      upDirection: 'z',
      isSectionViewActive,
      committedSectionCuts: cuts,
      gltfPresentation: { presentedKey: gltf.hash },
      modelInteractionUnitId: undefined,
      kinematicsRef: { getSnapshot: () => ({ context: { revision: 0, unitsById: {} } }) },
      modelInteractionRef: { getSnapshot: () => ({ context: { unitsById: {} } }) },
    };
    return { getSnapshot: () => ({ context }) } as unknown as Parameters<typeof captureCadImages>[0]['graphicsRef'];
  };

  /** A current-view capture of a viewer: the sections it asks the image for, and the cuts it reports it left out. */
  const captureSections = async (
    graphicsRef: Parameters<typeof captureCadImages>[0]['graphicsRef'],
  ): Promise<{
    exportOptions: { readonly sections?: Sections };
    sections: Sections | undefined;
    omittedSectionCutIds: readonly string[];
  }> => {
    const sourceSnapshot = snapshot(gltf);
    vi.mocked(awaitFreshRender).mockResolvedValue(sourceSnapshot);
    vi.mocked(getGraphicsCameraState).mockReturnValue(cameraState);
    const exportImage = vi.fn<ExportImage>(async (_job) => [webp(2400, 1350)]);
    const { omittedSectionCutIds } = await captureCadImages({
      cadRef: { getSnapshot: () => sourceSnapshot } as Parameters<typeof captureCadImages>[0]['cadRef'],
      graphicsRef,
      imageService: { export: exportImage },
      recipe: { purpose: 'chat', mode: 'current' },
    });
    const job = exportImage.mock.calls[0]![0];
    if (job.sourceFormat !== 'glb') {
      throw new Error('Expected a GLB job');
    }
    const exportOptions = job.exportOptions as { readonly sections?: Sections };
    return { exportOptions, sections: exportOptions.sections, omittedSectionCutIds };
  };

  /** Nothing was left out: the capture neither records an omission nor reports one. */
  const expectNothingOmitted = (omittedSectionCutIds: readonly string[]): void => {
    expect(omittedSectionCutIds).toEqual([]);
    expect(recordHeadlessImageTiming).not.toHaveBeenCalledWith(
      'capture.section-omitted',
      expect.anything(),
      expect.anything(),
    );
  };

  /** Points around the origin, clear of every cut boundary used here. */
  const samples = [-0.93, -0.37, 0.23, 0.71].flatMap((x) =>
    [-0.87, -0.29, 0.19, 0.83].flatMap((y) => [-0.91, -0.31, 0.27, 0.77].map((z) => [x, y, z] as const)),
  );

  /** Whether the image keeps every sample the cuts keep, and drops every one they remove. */
  const expectSameCut = (planes: readonly RetainedPlane[], cuts: readonly SectionCut[]): void => {
    const pieces = resolveSectionPieces(cuts);
    const retained = samples.map((point) =>
      planes.every(
        ({ point: on, normal }) =>
          normal[0] * (point[0] - on[0]) + normal[1] * (point[1] - on[1]) + normal[2] * (point[2] - on[2]) >= 0,
      ),
    );
    expect(retained).toEqual(samples.map((point) => !isSectionRemoved(point, pieces)));
    expect(retained).toContain(true);
    expect(retained).toContain(false);
  };

  beforeEach(() => {
    vi.mocked(recordHeadlessImageTiming).mockClear();
  });

  it('should keep the side a plane cut leaves, flipped or not', async () => {
    const cuts = [planeCut('xy', 0.1, false), planeCut('yz', -0.2, true), planeCut('xz', 0.3, false)];

    const { sections, omittedSectionCutIds } = await captureSections(graphicsWith(cuts));

    expect(sections).toEqual({
      planes: [
        { point: [0, 0, 0.1], normal: [0, 0, -1] },
        { point: [-0.2, 0, 0], normal: [1, 0, 0] },
        { point: [0, 0.3, 0], normal: [0, -1, 0] },
      ],
      clipSurfaces: true,
      clipLines: true,
    });
    expectSameCut(sections!.planes, cuts);
    expectNothingOmitted(omittedSectionCutIds);
  });

  it.each([270, 180])('should keep a %s° cutaway as the complements of its two faces', async (sweep) => {
    const cuts = [cutaway('z', 30, sweep)];

    const { sections, omittedSectionCutIds } = await captureSections(graphicsWith(cuts));

    expect(sections?.planes).toHaveLength(2);
    expectSameCut(sections!.planes, cuts);
    expectNothingOmitted(omittedSectionCutIds);
  });

  it('should leave out a cutaway narrower than 180°, recording and reporting it', async () => {
    const plane = planeCut('xy', 0.1, false);
    const narrow = cutaway('x', 45, 90);

    const { sections, omittedSectionCutIds } = await captureSections(graphicsWith([plane, narrow]));

    expect(sections?.planes).toEqual([{ point: [0, 0, 0.1], normal: [0, 0, -1] }]);
    expect(omittedSectionCutIds).toEqual([narrow.id]);
    expect(recordHeadlessImageTiming).toHaveBeenCalledWith('capture.section-omitted', expect.any(Number), {
      cutIds: [narrow.id],
    });
    // With nothing left to draw, the image is not cut at all.
    const alone = await captureSections(graphicsWith([narrow]));
    expect(alone.sections).toBeUndefined();
  });

  it("should fit four wide cutaways in the image's eight half-spaces", async () => {
    // Each keeps a wedge about Z; together they keep 220° to 360°.
    const cuts = [0, 10, 20, 30].map((start) => cutaway('z', start, 190));

    const { sections, omittedSectionCutIds } = await captureSections(graphicsWith(cuts));

    expect(sections?.planes).toHaveLength(maxSectionPieces);
    expectSameCut(sections!.planes, cuts);
    expectNothingOmitted(omittedSectionCutIds);
  });

  it('should capture and report no cuts while Section is off', async () => {
    const cuts = [planeCut('xy', 0.1, false), cutaway('x', 45, 90)];

    const { exportOptions, omittedSectionCutIds } = await captureSections(graphicsWith(cuts, false));

    expect(exportOptions).not.toHaveProperty('sections');
    expectNothingOmitted(omittedSectionCutIds);
  });
});
