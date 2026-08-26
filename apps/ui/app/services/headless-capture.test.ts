/* oxlint-disable no-bitwise, typescript/consistent-type-assertions -- Binary header fixtures and partial XState snapshots intentionally use low-level encoding and test-only casts. */
import { describe, expect, it, vi } from 'vitest';
import type { ExportFile, Geometry } from '@taucad/types';
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

vi.mock('#machines/await-fresh-render.js', () => ({ awaitFreshRender: vi.fn() }));
vi.mock('#services/graphics-camera-registry.js', () => ({ getGraphicsCameraState: vi.fn() }));

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

const snapshot = (geometry: Geometry, entryPath = '/parts/bracket.ts') =>
  ({
    context: {
      geometry,
      entryPath,
      parameters: { width: 42 },
      units: { length: 'mm' },
      latestGeometryOutcome: 'success',
      kernelIssues: new Map(),
    },
  }) as unknown as Parameters<typeof captureSettledCadImages>[0]['cadSnapshot'];

const gltf = { format: 'gltf', content: { json: {}, buffers: [] }, hash: 'gltf-hash' } as unknown as Geometry;
const presentationGltf = {
  format: 'gltf',
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
} as Extract<Geometry, { format: 'gltf' }>;
const svg = {
  format: 'svg',
  content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"></svg>',
  hash: 'svg-hash',
} as Extract<Geometry, { format: 'svg' }>;
const cameraState = {
  position: [8000, -6000, 4000],
  target: [1000, 2000, 3000],
  up: [0.1, 0.2, 0.97],
  projection: { kind: 'perspective', verticalFieldOfView: 52, zoom: 1.4 },
  clipping: { near: 200, far: 900_000 },
  aspect: 16 / 9,
} as const;

describe('headless capture adapter', () => {
  it('maps frozen current GLTF camera state into the canonical annotated metre recipe', async () => {
    const exportImage = vi.fn<ExportImage>(async (_job) => [webp(2400, 1350)]);

    const files = await captureSettledCadImages({
      cadSnapshot: snapshot(gltf),
      cameraState,
      imageService: { export: exportImage },
      fileSystem: {} as Parameters<typeof captureSettledCadImages>[0]['fileSystem'],
      recipe: { purpose: 'chat', mode: 'current' },
    });

    expect(files).toHaveLength(1);
    const job = exportImage.mock.calls[0]![0];
    if (job.sourceFormat !== 'gltf' || job.format !== 'webp') {
      throw new Error('Expected a GLTF WebP job');
    }
    expect(job).toMatchObject({
      source: { path: '/parts/bracket.ts' },
      parameters: { width: 42 },
      includeEdges: true,
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
    });
  });

  it('returns six ordered GLTF views with complete per-view labels', async () => {
    const exportImage = vi.fn<ExportImage>(async (_job) =>
      canonicalCaptureViews.map((_view, index) => webp(1600, 1600, index)),
    );

    await captureSettledCadImages({
      cadSnapshot: snapshot(gltf),
      imageService: { export: exportImage },
      fileSystem: {} as Parameters<typeof captureSettledCadImages>[0]['fileSystem'],
      recipe: { purpose: 'chat', mode: 'orthographic' },
    });

    const job = exportImage.mock.calls[0]![0];
    expect(job).toMatchObject({
      sourceFormat: 'gltf',
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
    if (job.sourceFormat !== 'gltf' || job.format !== 'webp') {
      throw new Error('Expected a GLTF WebP batch job');
    }
    const batchOptions = job.exportOptions as {
      readonly mode: 'batch';
      readonly views: ReadonlyArray<{
        readonly id: string;
        readonly label?: string;
        readonly camera: { readonly framing: 'fit'; readonly projection: { readonly kind: 'orthographic' } };
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
      fileSystem: {} as Parameters<typeof captureSettledCadImages>[0]['fileSystem'],
      recipe: { purpose: 'agent', mode: 'isometric', includeEdges: false },
    });

    expect(exportImage.mock.calls[0]![0]).toMatchObject({
      includeEdges: false,
      exportOptions: { width: 1600, height: 1600, lineWidth: 3 },
    });
  });

  it('keeps the three-pixel edge recipe explicit for utility captures', async () => {
    const exportImage = vi.fn<ExportImage>(async (_job) => [png(2400, 1350)]);

    await captureSettledCadImages({
      cadSnapshot: snapshot(gltf),
      cameraState,
      imageService: { export: exportImage },
      fileSystem: {} as Parameters<typeof captureSettledCadImages>[0]['fileSystem'],
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
        enableSurfaces: false,
        enableLines: false,
        hiddenComponentIds: ['component:node-0'],
        isolatedComponentIds: [],
        section: {
          point: [1000, 2000, 3000],
          normal: [0, 1, 0],
          clipSurfaces: true,
          clipLines: false,
        },
      },
      imageService: { export: exportImage },
      fileSystem: {} as Parameters<typeof captureSettledCadImages>[0]['fileSystem'],
      recipe: { purpose: 'chat', mode: 'current' },
    });

    expect(exportImage.mock.calls[0]![0]).toMatchObject({
      exportOptions: {
        surfaces: false,
        lines: false,
        visiblePrimitives: [{ nodeIndex: 1, meshIndex: 1, primitiveIndex: 0 }],
        sections: {
          planes: [{ point: [1, 2, 3], normal: [0, 1, 0] }],
          clipSurfaces: true,
          clipLines: false,
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
      position: [number, number, number];
      target: [number, number, number];
      up: [number, number, number];
      projection: CameraState['projection'];
      clipping: CameraState['clipping'];
      aspect: number;
    } = {
      position: [8000, -6000, 4000] as [number, number, number],
      target: [1000, 2000, 3000] as [number, number, number],
      up: [0, 0, 1] as [number, number, number],
      projection: { kind: 'perspective', verticalFieldOfView: 52, zoom: 1.4 },
      clipping: { near: 200, far: 900_000 },
      aspect: 16 / 9,
    };
    const liveUnit = {
      hiddenComponentIds: ['component:node-0'],
      isolatedComponentIds: [] as string[],
    };
    const liveContext = {
      enableSurfaces: false,
      enableLines: true,
      isSectionViewActive: true,
      availableSectionViews: [{ id: 'xy', normal: [0, 0, 1] as [number, number, number], constant: 0 }],
      selectedSectionViewId: 'xy',
      sectionViewPivot: [1000, 0, 0] as [number, number, number],
      sectionViewRotation: [0, 0, 0] as [number, number, number],
      sectionViewDirection: -1 as const,
      enableClippingMesh: true,
      enableClippingLines: false,
      modelInteractionUnitId: 'unit',
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
    const capture = captureCadImages({
      cadRef: {} as Parameters<typeof captureCadImages>[0]['cadRef'],
      graphicsRef,
      imageService: { export: exportImage },
      fileSystem: {} as Parameters<typeof captureCadImages>[0]['fileSystem'],
      recipe: { purpose: 'chat', mode: 'current' },
    });

    liveCamera.position[0] = 99_000;
    liveCamera.up[0] = 1;
    liveContext.enableSurfaces = true;
    liveContext.sectionViewPivot[0] = 9000;
    liveUnit.hiddenComponentIds[0] = 'component:node-1';
    resolveFresh(snapshot(presentationGltf));
    await capture;

    expect(exportImage.mock.calls[0]![0]).toMatchObject({
      exportOptions: {
        camera: { position: [8, -6, 4], up: [0, 0, 1] },
        surfaces: false,
        visiblePrimitives: [{ nodeIndex: 1, meshIndex: 1, primitiveIndex: 0 }],
        sections: { planes: [{ point: [1, 0, 0], normal: [0, 0, 1] }] },
      },
    });
  });

  it('routes settled SVG to one annotated PNG and rejects meaningless multi-angle capture', async () => {
    const exportImage = vi.fn<ExportImage>(async (_job) => [png(2400, 1350)]);
    const common = {
      cadSnapshot: snapshot(svg, '/drawings/profile.ts'),
      imageService: { export: exportImage },
      fileSystem: {} as Parameters<typeof captureSettledCadImages>[0]['fileSystem'],
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
    await expect(
      captureSettledCadImages({
        ...common,
        recipe: { purpose: 'agent', mode: 'orthographic', includeEdges: true },
      }),
    ).rejects.toThrow('one canonical view');
  });

  it('rejects malformed output before dispatch and encodes MIME-aware data URLs', async () => {
    const exportImage = vi.fn<ExportImage>(async (_job) => [webp(10, 10)]);
    await expect(
      captureSettledCadImages({
        cadSnapshot: snapshot(gltf),
        cameraState,
        imageService: { export: exportImage },
        fileSystem: {} as Parameters<typeof captureSettledCadImages>[0]['fileSystem'],
        recipe: { purpose: 'chat', mode: 'current' },
      }),
    ).rejects.toThrow('2400×1350');
    expect(captureFilesToDataUrls([png(1, 1)])[0]).toMatch(/^data:image\/png;base64,/u);
  });

  it('rejects live WebRTC geometry without invoking a canvas fallback', async () => {
    const exportImage = vi.fn();
    const webrtc = { format: 'webrtc', hash: 'live-hash' } as unknown as Geometry;

    await expect(
      captureSettledCadImages({
        cadSnapshot: snapshot(webrtc),
        cameraState,
        imageService: { export: exportImage },
        fileSystem: {} as Parameters<typeof captureSettledCadImages>[0]['fileSystem'],
        recipe: { purpose: 'chat', mode: 'current' },
      }),
    ).rejects.toThrow('Live WebRTC geometry cannot be captured headlessly');
    expect(exportImage).not.toHaveBeenCalled();
  });
});
