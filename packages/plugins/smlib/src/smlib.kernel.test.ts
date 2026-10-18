// @vitest-environment node
/* oxlint-disable max-lines -- comprehensive kernel test suite */
/* oxlint-disable @typescript-eslint/no-unsafe-assignment -- vitest asymmetric matchers return any */
/* eslint-disable @typescript-eslint/naming-convention -- File names use extensions like 'box.ts' */
import { readFile } from 'node:fs/promises';
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { NodeIO } from '@gltf-transform/core';
import { Window } from 'happy-dom';
import type { RuntimeContentInput, TelemetryEntry } from '@taucad/runtime/types';
import type { ParameterManifest } from '@taucad/parameters';
import type { ExportResult, Rendering } from '@taucad/runtime';
import { registerTauGltfExtensions } from '@taucad/geometry-core';
import type { TauCadTopologyPayload, TauCadTopologyRoot } from '@taucad/geometry-core';
import { tauCadTopologyExtension } from '@taucad/runtime/types';
import { decode as msgpackDecode, encode as msgpackEncode } from '@msgpack/msgpack';
import { evaluatePose, sampleAnimation } from '@taucad/kinematics';
import {
  assertRenderingSuccess,
  createGeometryFile,
  createMockKernelRuntime,
  createTestGeometry,
  createTestRuntimeClient,
  extractGltfFromResult,
  mapZupMillimetersToYupMeters,
  readCoordinateEvidence,
} from '@taucad/runtime-testing';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import { esbuildBundler } from '@taucad/esbuild';
import { defineRuntime } from '@taucad/runtime/worker';
import { offersFor, smlibKernel } from '#smlib.kernel.js';
import { normalizeRenderShapes } from '#utils/render-output.js';

vi.setConfig({ testTimeout: 20_000 });

// =============================================================================
// Test Utilities
// =============================================================================

type SmlibTestOptions = {
  readonly workerOptions?: Parameters<typeof smlibKernel>[0];
};

const createSmlibRuntime = (options?: SmlibTestOptions) =>
  defineRuntime({
    kernels: [smlibKernel(options?.workerOptions)],
    bundlers: [esbuildBundler()],
  });

const makeTestClient = (files: Record<string, string>, options?: SmlibTestOptions) =>
  createTestRuntimeClient({ runtime: createSmlibRuntime(options), files });
type TestClient = ReturnType<typeof makeTestClient>;
type GeometryFile = ReturnType<typeof createGeometryFile>;

const testClients = new Set<TestClient>();
const activeDocuments = new Map<
  TestClient,
  { path: string; parametersKey: string; document: ReturnType<TestClient['open']> }
>();

/** Create a production-path in-process client for tests with the provided files. */
const createClient = (
  files: Record<string, string>,
  options?: SmlibTestOptions & { readonly onTelemetry?: (entries: readonly TelemetryEntry[]) => void },
): TestClient => {
  const client = makeTestClient(files, options);
  if (options?.onTelemetry) {
    const { onTelemetry } = options;
    client.on('telemetry', (batch) => {
      onTelemetry(batch.entries);
    });
  }
  testClients.add(client);
  return client;
};

const sourcePath = (file: GeometryFile): string => (file.path === '' ? file.filename : `${file.path}/${file.filename}`);

const renderGeometry = async (
  client: TestClient,
  {
    file,
    parameters,
    content,
    options,
    view: viewName = 'model',
    instance,
  }: {
    file: GeometryFile;
    parameters: Record<string, unknown>;
    content?: RuntimeContentInput;
    options?: Record<string, unknown>;
    view?: 'model' | 'drawing';
    instance?: string;
  },
): Promise<Rendering> => {
  const path = sourcePath(file);
  const parametersKey = JSON.stringify(parameters);
  let active = activeDocuments.get(client);
  if (active?.path !== path) {
    active?.document.close();
    active = { path, parametersKey, document: client.open({ source: { path }, parameters }) };
    activeDocuments.set(client, active);
  } else if (active.parametersKey !== parametersKey) {
    const updated = await active.document.update({ parameters });
    expect(updated.superseded).toBe(false);
    active.parametersKey = parametersKey;
  }
  const view =
    viewName === 'drawing'
      ? active.document.view('drawing', instance ? { instance } : {})
      : active.document.view('model', { ...(content ? { content } : {}), ...(options ? { options } : {}) });
  const outcome = await view.rendering();
  view.close();
  expect(outcome.superseded).toBe(false);
  if (outcome.superseded) {
    throw new Error('SMLib test render was superseded');
  }
  return outcome.rendering;
};

const exportLastRender = async (
  client: TestClient,
  format: Extract<keyof ReturnType<typeof smlibKernel>['exports'], string>,
  exportOptions?: Record<string, unknown>,
): Promise<ExportResult> => {
  const active = activeDocuments.get(client);
  if (!active) {
    throw new Error('No document is open for export');
  }
  return active.document.export(format, exportOptions === undefined ? undefined : { options: exportOptions });
};

afterEach(async () => {
  for (const active of activeDocuments.values()) {
    active.document.close();
  }
  activeDocuments.clear();
  await Promise.all([...testClients].map(async (client) => client.shutdown()));
  testClients.clear();
});

function assertRenderingFailure(rendering: Rendering): asserts rendering is Extract<Rendering, { success: false }> {
  expect(rendering.success).toBe(false);
  if (rendering.success) {
    throw new Error('Expected rendering failure');
  }
}

function assertExportSuccess(result: ExportResult): asserts result is Extract<ExportResult, { success: true }> {
  expect(result.success).toBe(true);
  if (!result.success) {
    throw new Error(result.issues.map((issue) => issue.message).join('\n'));
  }
}

const expectSvgContent = (rendering: Rendering): string => {
  assertRenderingSuccess(rendering);
  expect(rendering.artifact.mimeType).toBe('image/svg+xml');
  if (rendering.artifact.mimeType !== 'image/svg+xml' || typeof rendering.artifact.content !== 'string') {
    throw new Error(`Expected SVG rendering, received ${rendering.artifact.mimeType}`);
  }
  return rendering.artifact.content;
};

const readSvgPaths = (svg: string): Array<{ stroke?: string; dash?: string }> => {
  const window = new Window();
  const document_ = new window.DOMParser().parseFromString(svg, 'image/svg+xml');
  expect(document_.documentElement.localName).toBe('svg');
  return [...document_.querySelectorAll('path')].map((path) => {
    expect(path.getAttribute('stroke-width')).toBe('1');
    expect(path.getAttribute('vector-effect')).toBe('non-scaling-stroke');
    return {
      ...(path.getAttribute('stroke') ? { stroke: path.getAttribute('stroke')! } : {}),
      ...(path.getAttribute('stroke-dasharray') ? { dash: path.getAttribute('stroke-dasharray')! } : {}),
    };
  });
};

const readGlb = async (rendering: Rendering) => {
  assertRenderingSuccess(rendering);
  const glb = extractGltfFromResult(rendering);
  if (!glb) {
    throw new Error('Expected GLB render output.');
  }
  return new NodeIO().readBinary(glb);
};

const readGltfSize = async (glbBytes: Uint8Array<ArrayBuffer>): Promise<[number, number, number]> => {
  const document = await new NodeIO().readBinary(glbBytes);
  const min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const position = primitive.getAttribute('POSITION');
      if (!position) {
        continue;
      }
      const point: [number, number, number] = [0, 0, 0];
      for (let index = 0; index < position.getCount(); index++) {
        position.getElement(index, point);
        for (let axis = 0; axis < 3; axis++) {
          min[axis] = Math.min(min[axis]!, point[axis]!);
          max[axis] = Math.max(max[axis]!, point[axis]!);
        }
      }
    }
  }
  return [max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!];
};

type PrimitiveCounts = { triangles: number; lines: number; triangleVertices: number };

/** The rendering's glTF extent, Y-up metres. */
const renderedSize = async (rendering: Rendering): Promise<[number, number, number]> => {
  assertRenderingSuccess(rendering);
  return readGltfSize(extractGltfFromResult(rendering)!);
};

const countTriangles = async (rendering: Rendering): Promise<number> => {
  const counts = await countPrimitives(rendering);
  return counts.triangles;
};

const countPrimitives = async (rendering: Rendering): Promise<PrimitiveCounts> => {
  const document = await readGlb(rendering);
  const counts: PrimitiveCounts = { triangles: 0, lines: 0, triangleVertices: 0 };
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      if (primitive.getMode() === 4) {
        counts.triangles += (primitive.getIndices()?.getCount() ?? 0) / 3;
        counts.triangleVertices += primitive.getAttribute('POSITION')!.getCount();
      } else if (primitive.getMode() === 1) {
        counts.lines++;
      }
    }
  }
  return counts;
};

type StlPoint = [number, number, number];

const readBinaryStlEvidence = (bytes: Uint8Array<ArrayBuffer>): { normals: StlPoint[]; vertices: StlPoint[] } => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const triangleCount = view.getUint32(80, true);
  const normals: StlPoint[] = [];
  const vertices: StlPoint[] = [];
  const round = (value: number): number => {
    const rounded = Math.round(value * 1e4) / 1e4;
    return Object.is(rounded, -0) ? 0 : rounded;
  };
  const readPoint = (offset: number): StlPoint => [
    round(view.getFloat32(offset, true)),
    round(view.getFloat32(offset + 4, true)),
    round(view.getFloat32(offset + 8, true)),
  ];
  for (let triangle = 0; triangle < triangleCount; triangle++) {
    const offset = 84 + triangle * 50;
    normals.push(readPoint(offset));
    vertices.push(readPoint(offset + 12), readPoint(offset + 24), readPoint(offset + 36));
  }
  const compare = (left: StlPoint, right: StlPoint): number =>
    left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
  return { normals: normals.sort(compare), vertices: vertices.sort(compare) };
};

const stlBounds = (vertices: StlPoint[]): { min: StlPoint; max: StlPoint } => {
  const min: StlPoint = [Infinity, Infinity, Infinity];
  const max: StlPoint = [-Infinity, -Infinity, -Infinity];
  for (const vertex of vertices) {
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis]!, vertex[axis]!);
      max[axis] = Math.max(max[axis]!, vertex[axis]!);
    }
  }
  return { min, max };
};

/** Helper to extract parameters and assert success. */
async function getParameters(files: Record<string, string>, mainFile: string): Promise<ParameterManifest> {
  const client = makeTestClient(files);
  try {
    const described = await client.describe({ source: { path: mainFile } });
    if (!described.success) {
      throw new Error(described.issues.map((issue) => issue.message).join('\n'));
    }
    return described.parameters;
  } finally {
    await client.shutdown();
  }
}

/** Helper to create geometry and return the result. */
const createGeometry = async ({
  files,
  mainFile,
  parameters,
  content,
  options,
}: {
  files: Record<string, string>;
  mainFile: string;
  parameters?: Record<string, unknown>;
  content?: RuntimeContentInput;
  options?: SmlibTestOptions;
}): ReturnType<typeof createTestGeometry> =>
  createTestGeometry({
    runtime: createSmlibRuntime(options),
    files,
    open: { source: { path: mainFile }, ...(parameters ? { parameters } : {}) },
    ...(content ? { view: (document) => document.view('model', { content }) } : {}),
  });

const readTopologyPayload = async (glb: Uint8Array<ArrayBuffer> | undefined): Promise<TauCadTopologyPayload> => {
  if (!glb) {
    throw new Error('Expected GLB render output.');
  }
  const document = await registerTauGltfExtensions(new NodeIO()).readBinary(glb);
  const root = document.getRoot().getExtension<TauCadTopologyRoot>(tauCadTopologyExtension);
  if (!root) {
    throw new Error('Expected a TAU_cad_topology payload.');
  }
  const payload: unknown = root.getPayload();
  return payload as TauCadTopologyPayload;
};

/** Round to nanometre precision and fold negative zero so frame conversions compare exactly. */
const rounded = (vector: readonly number[] | undefined): number[] =>
  (vector ?? []).map((value) => Math.round(value * 1e9) / 1e9 + 0);

const plateCode = `
  import { Box, Cylinder, GridLocations, Z } from '@classcad/smlibwasm';

  export const defaultParams = { width: 80, depth: 60, thickness: 10, holeRadius: 4, fillet: 3 };

  export default function main(params: typeof defaultParams) {
    const plate = Box(params.width, params.depth, params.thickness);
    const rounded = plate.fillet(plate.edges().parallelTo(Z), params.fillet);
    const holes = GridLocations(params.width / 2, params.depth / 2, 2, 2).mul(
      Cylinder(params.holeRadius, params.thickness * 2),
    );
    return rounded.cut(holes);
  }
`;

const boxCode = `
  import { Box } from '@classcad/smlibwasm';
  export default function main() {
    return Box(50, 30, 10);
  }
`;

const resolveSmlibDefinition = async () => resolveRuntimePluginDefinition('kernel', smlibKernel());
let smlibDefinition: Awaited<ReturnType<typeof resolveSmlibDefinition>>;

// =============================================================================
// Parameter extraction
// =============================================================================

describe('SmlibKernel', () => {
  beforeAll(async () => {
    smlibDefinition = await resolveSmlibDefinition();
  });

  it('declares its export formats and handle snapshot', () => {
    expect(Object.keys(smlibKernel().exports).sort()).toEqual(['glb', 'gltf', 'step', 'stl']);
    expect(smlibDefinition.serializeHandle).toBeDefined();
    expect(smlibDefinition.deserializeHandle).toBeDefined();
  });

  describe('getParameters', () => {
    it('should extract defaultParams from an exported const', async () => {
      const { schema, defaults } = await getParameters({ 'plate.ts': plateCode }, 'plate.ts');

      expect(defaults).toEqual({ width: 80, depth: 60, thickness: 10, holeRadius: 4, fillet: 3 });
      expect(schema).toMatchObject({
        type: 'object',
        properties: {
          width: { type: 'double', default: 80 },
          fillet: { type: 'double', default: 3 },
        },
      });
    });

    it('should extract nested, boolean and string parameters', async () => {
      const { defaults, schema } = await getParameters(
        {
          'box.ts': `
            import { Box } from '@classcad/smlibwasm';
            export const defaultParams = { size: { x: 10, y: 20 }, hollow: true, label: 'A' };
            export default function main(params) {
              return Box(params.size.x, params.size.y, 5);
            }
          `,
        },
        'box.ts',
      );

      expect(defaults).toEqual({ size: { x: 10, y: 20 }, hollow: true, label: 'A' });
      expect(schema).toMatchObject({
        properties: {
          size: { type: 'object', properties: { x: { type: 'double' }, y: { type: 'double' } } },
          hollow: { type: 'boolean', default: true },
          label: { type: 'string', default: 'A' },
        },
      });
    });

    it('should return empty parameters when the file declares none', async () => {
      const { defaults } = await getParameters({ 'box.ts': boxCode }, 'box.ts');
      expect(defaults).toEqual({});
    });
  });

  // ===========================================================================
  // Geometry
  // ===========================================================================

  describe('createGeometry', () => {
    it('should render the filleted plate with face groups and default parameters', async () => {
      const result = await createGeometry({ files: { 'plate.ts': plateCode }, mainFile: 'plate.ts' });

      assertRenderingSuccess(result);
      expect(result.issues).toEqual([]);
      const size = await readGltfSize(extractGltfFromResult(result)!);
      // Y-up metres: width 80 mm on x, thickness 10 mm on y, depth 60 mm on z.
      expect(size[0]).toBeCloseTo(0.08, 5);
      expect(size[1]).toBeCloseTo(0.01, 5);
      expect(size[2]).toBeCloseTo(0.06, 5);
    });

    it('should re-render with new parameters', async () => {
      const client = createClient({ 'plate.ts': plateCode });
      const file = createGeometryFile('plate.ts');

      const first = await renderGeometry(client, { file, parameters: {} });
      const second = await renderGeometry(client, { file, parameters: { width: 120 } });

      assertRenderingSuccess(first);
      assertRenderingSuccess(second);
      const firstSize = await renderedSize(first);
      const secondSize = await renderedSize(second);
      expect(firstSize[0]).toBeCloseTo(0.08, 5);
      expect(secondSize[0]).toBeCloseTo(0.12, 5);
    });

    it('should pass the library as the first argument to a two-parameter main', async () => {
      const result = await createGeometry({
        files: {
          'box.ts': `
            import type * as Smlib from '@classcad/smlibwasm';
            export const defaultParams = { size: 12 };
            export default function main(smlib: typeof Smlib, params: typeof defaultParams) {
              return smlib.Box(params.size, params.size, params.size);
            }
          `,
        },
        mainFile: 'box.ts',
      });

      assertRenderingSuccess(result);
      const size = await readGltfSize(extractGltfFromResult(result)!);
      expect(size[0]).toBeCloseTo(0.012, 5);
    });

    it('should run async main functions', async () => {
      const result = await createGeometry({
        files: {
          'box.ts': `
            import { Sphere } from '@classcad/smlibwasm';
            export default async function main() {
              await Promise.resolve();
              return Sphere(5);
            }
          `,
        },
        mainFile: 'box.ts',
      });

      assertRenderingSuccess(result);
      const size = await readGltfSize(extractGltfFromResult(result)!);
      expect(size[0]).toBeCloseTo(0.01, 3);
    });

    it('should handle boolean, fillet, chamfer and transform operations', async () => {
      const result = await createGeometry({
        files: {
          'ops.ts': `
            import { Box, Cylinder, Pos, Rot, Z } from '@classcad/smlibwasm';
            export default function main() {
              const base = Box(40, 40, 10);
              const chamfered = base.chamfer(base.edges().parallelTo(Z), 2);
              const boss = Pos(0, 0, 10).mul(Rot(0, 0, 45).mul(Box(10, 10, 10)));
              return chamfered.fuse(boss).cut(Cylinder(3, 100));
            }
          `,
        },
        mainFile: 'ops.ts',
      });

      assertRenderingSuccess(result);
      expect(result.issues).toEqual([]);
      expect(await countTriangles(result)).toBeGreaterThan(20);
    });

    it('should flatten arrays and shape lists into named shapes', async () => {
      const result = await createGeometry({
        files: {
          'many.ts': `
            import { Box, GridLocations } from '@classcad/smlibwasm';
            export default function main() {
              return GridLocations(20, 20, 2, 1).mul(Box(5, 5, 5));
            }
          `,
        },
        mainFile: 'many.ts',
      });

      const document = await readGlb(result);
      const names = document
        .getRoot()
        .listNodes()
        .map((node) => node.getName())
        .filter((name) => name !== '');
      expect(names.length).toBeGreaterThanOrEqual(2);
      expect(new Set(names).size).toBe(names.length);
    });

    it('should render a mesh body returned by main', async () => {
      const result = await createGeometry({
        files: {
          'mesh.ts': `
            import { Mesh } from '@classcad/smlibwasm';
            export default function main() {
              return new Mesh([0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10], [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]);
            }
          `,
        },
        mainFile: 'mesh.ts',
      });

      assertRenderingSuccess(result);
      expect(await countTriangles(result)).toBe(4);
    });

    it('should render an empty GLB when main returns undefined', async () => {
      const result = await createGeometry({
        files: { 'empty.ts': `import '@classcad/smlibwasm';\nexport default function main() {}` },
        mainFile: 'empty.ts',
      });

      assertRenderingSuccess(result);
      expect(result.artifact.mimeType).toBe('model/gltf-binary');
      expect(await countTriangles(result)).toBe(0);
    });

    it('should resolve transitive and multi-file imports with parameters', async () => {
      const result = await createGeometry({
        files: {
          'main.ts': `
            import { makeBracket } from './lib/bracket';
            export const defaultParams = { size: 30 };
            export default function main(params: typeof defaultParams) {
              return makeBracket(params.size);
            }
          `,
          'lib/bracket.ts': `
            import { Box } from '@classcad/smlibwasm';
            export const makeBracket = (size: number) => Box(size, size / 2, 4);
          `,
        },
        mainFile: 'main.ts',
        parameters: { size: 40 },
      });

      assertRenderingSuccess(result);
      const size = await renderedSize(result);
      expect(size[0]).toBeCloseTo(0.04, 5);
    });

    it('should detect the CommonJS require form', async () => {
      const result = await createGeometry({
        files: {
          'box.js': `
            const { Box } = require('@classcad/smlibwasm');
            function main() { return Box(10, 10, 10); }
          `,
        },
        mainFile: 'box.js',
      });

      assertRenderingSuccess(result);
    });

    it('should bundle TypeScript interfaces, enums and type-only imports', async () => {
      const result = await createGeometry({
        files: {
          'typed.ts': `
            import { Box } from '@classcad/smlibwasm';
            import type { Part } from '@classcad/smlibwasm';
            interface Size { readonly x: number; readonly y: number }
            enum Height { Low = 5, High = 15 }
            const size = { x: 20, y: 10 } as const satisfies Size;
            export default function main(): Part {
              return Box(size.x, size.y, Height.High);
            }
          `,
        },
        mainFile: 'typed.ts',
      });

      assertRenderingSuccess(result);
      const size = await renderedSize(result);
      expect(size[1]).toBeCloseTo(0.015, 5);
    });
  });

  // ===========================================================================
  // Names, colours and the Model envelope
  // ===========================================================================

  describe('Named shapes and colors', () => {
    it('should keep authored names and PBR scalars from shape configurations', async () => {
      const result = await createGeometry({
        files: {
          'parts.ts': `
            import { Box, Cylinder, Pos } from '@classcad/smlibwasm';
            export default function main() {
              return [
                { shape: Box(10, 10, 10), name: 'Housing', color: '#ff0000', metalness: 0.8, roughness: 0.3 },
                { shape: Pos(20, 0, 0).mul(Cylinder(4, 10)), name: 'Shaft', color: '#0000ff', opacity: 0.5 },
              ];
            }
          `,
        },
        mainFile: 'parts.ts',
      });

      const document = await readGlb(result);
      const materials = document.getRoot().listMaterials();
      const nodeNames = document
        .getRoot()
        .listNodes()
        .map((node) => node.getName());
      expect(nodeNames).toEqual(expect.arrayContaining(['Housing', 'Shaft']));

      const housing = materials.find((material) => material.getMetallicFactor() === 0.8);
      expect(housing?.getRoughnessFactor()).toBeCloseTo(0.3, 5);
      expect(housing?.getBaseColorFactor()[0]).toBeCloseTo(1, 3);
      const shaft = materials.find((material) => material.getAlphaMode() === 'BLEND');
      expect(shaft?.getAlpha()).toBeCloseTo(0.5, 5);
    });

    it('should use the body name and color from named() and colored()', async () => {
      const result = await createGeometry({
        files: {
          'body.ts': `
            import { Box } from '@classcad/smlibwasm';
            export default function main() {
              return Box(10, 10, 10).named('Cube').colored([0, 1, 0]);
            }
          `,
        },
        mainFile: 'body.ts',
      });

      const document = await readGlb(result);
      expect(
        document
          .getRoot()
          .listNodes()
          .map((node) => node.getName()),
      ).toContain('Cube');
      const [material] = document.getRoot().listMaterials();
      const [red, green, blue] = material?.getBaseColorFactor() ?? [];
      expect([red, green, blue]).toEqual([0, 1, 0]);
    });

    it('should use defaultName for a single unnamed shape and index unnamed shapes', async () => {
      const single = await createGeometry({
        files: {
          'box.ts': `
            import { Box } from '@classcad/smlibwasm';
            export const defaultName = 'Widget';
            export default function main() { return Box(5, 5, 5); }
          `,
        },
        mainFile: 'box.ts',
      });
      const multiple = await createGeometry({
        files: {
          'boxes.ts': `
            import { Box, Pos } from '@classcad/smlibwasm';
            export default function main() { return [Box(5, 5, 5), Pos(10, 0, 0).mul(Box(5, 5, 5))]; }
          `,
        },
        mainFile: 'boxes.ts',
      });

      const names = async (rendering: Rendering) => {
        const document = await readGlb(rendering);
        return document
          .getRoot()
          .listNodes()
          .map((node) => node.getName())
          .filter((name) => name !== '');
      };
      expect(await names(single)).toContain('Widget');
      const multipleNames = await names(multiple);
      expect(multipleNames).toHaveLength(2);
      expect(new Set(multipleNames).size).toBe(2);
    });

    it('should reject a shape configuration with both material and legacy color', async () => {
      const result = await createGeometry({
        files: {
          'both.ts': `
            import { Box } from '@classcad/smlibwasm';
            export default function main() {
              return { shapes: [{ shape: Box(1, 1, 1), color: '#ff0000', material: { name: 'm' } }] };
            }
          `,
        },
        mainFile: 'both.ts',
      });

      assertRenderingFailure(result);
      expect(result.issues[0]?.message).toContain('not both');
    });

    it('should reject a Model envelope whose shapes are not an array', async () => {
      const result = await createGeometry({
        files: {
          'bad.ts': `
            import '@classcad/smlibwasm';
            export default function main() { return { shapes: 'nope' }; }
          `,
        },
        mainFile: 'bad.ts',
      });

      assertRenderingFailure(result);
      expect(result.issues[0]?.message).toContain('Model.shapes must be an array');
    });
  });

  // ===========================================================================
  // Errors
  // ===========================================================================

  describe('Error handling', () => {
    it('should return a bundling error for syntax errors', async () => {
      const result = await createGeometry({
        files: {
          'bad.ts': `import { Box } from '@classcad/smlibwasm';\nexport default function main( { return Box(1,1,1) }`,
        },
        mainFile: 'bad.ts',
      });

      assertRenderingFailure(result);
      expect(result.issues.length).toBeGreaterThan(0);
    });

    it('should return a located runtime error for a thrown error in user code', async () => {
      const result = await createGeometry({
        files: {
          'throws.ts': `
            import { Box } from '@classcad/smlibwasm';
            export default function main() {
              const box = Box(1, 1, 1);
              throw new Error('boom from user code');
            }
          `,
        },
        mainFile: 'throws.ts',
      });

      assertRenderingFailure(result);
      expect(result.issues[0]).toMatchObject({
        message: expect.stringContaining('boom from user code'),
        severity: 'error',
        details: expect.objectContaining({ producer: { kernelId: 'smlib' } }),
      });
      expect(result.issues[0]?.location?.fileName).toContain('throws.ts');
    });

    it('should surface SMLib modeling errors with the operation that failed', async () => {
      const result = await createGeometry({
        files: {
          'fillet.ts': `
            import { Box, Z } from '@classcad/smlibwasm';
            export default function main() {
              const box = Box(10, 10, 10);
              return box.fillet(box.edges().parallelTo(Z), 50);
            }
          `,
        },
        mainFile: 'fillet.ts',
      });

      assertRenderingFailure(result);
      expect(result.issues[0]?.message.length).toBeGreaterThan(0);
      expect(result.issues[0]?.details).toMatchObject({ producer: { kernelId: 'smlib' } });
    });

    it('should report an undefined variable as a runtime error', async () => {
      const result = await createGeometry({
        files: {
          'undef.ts': `
            import { Box } from '@classcad/smlibwasm';
            export default function main() {
              // @ts-expect-error -- deliberately undefined
              return Box(missingWidth, 1, 1);
            }
          `,
        },
        mainFile: 'undef.ts',
      });

      assertRenderingFailure(result);
      expect(result.issues[0]?.message).toContain('missingWidth');
    });
  });

  // ===========================================================================
  // Drawings
  // ===========================================================================

  describe('Drawing view (SVG)', () => {
    const drawingCode = `
      import { Line, Polyline } from '@classcad/smlibwasm';
      export default function main() {
        return [
          { shape: Polyline([0, 0, 0], [20, 0, 0], [20, 10, 0], [0, 10, 0], [0, 0, 0]), name: 'Outline', color: '#ff0000' },
          { shape: Line([0, 0, 0], [20, 10, 0]), name: 'Diagonal', color: '#0000ff', strokeType: 'dashes' },
        ];
      }
    `;

    it('offers a drawing-only model with authored drawing instances', () => {
      expect(
        offersFor({
          shapes: [],
          drawings: [
            { name: 'Outline', polylines: [] },
            { name: 'Diagonal', polylines: [] },
          ],
        }),
      ).toEqual({
        views: ['drawing'],
        exports: [],
        instances: {
          drawing: [
            { id: 'Outline', title: 'Outline' },
            { id: 'Diagonal', title: 'Diagonal' },
          ],
        },
      });
      expect(offersFor({ shapes: [], drawings: [] })).toEqual({ views: ['model'], exports: ['glb', 'gltf'] });
    });

    it('should render each offered drawing instance with its authored stroke and dashes', async () => {
      const client = createClient({ 'drawing.ts': drawingCode });
      const document = client.open({ source: { path: 'drawing.ts' } });
      const evaluated = await document.evaluation();
      if (evaluated.superseded || !evaluated.evaluation.success) {
        throw new Error('Expected two offered drawing instances');
      }
      const instances = evaluated.evaluation.views.find((offer) => offer.id === 'drawing')?.instances ?? [];
      expect(instances.map((instance) => instance.id)).toEqual(['Outline', 'Diagonal']);

      const paths = await Promise.all(
        instances.map(async (instance) => {
          const view = document.view('drawing', { instance: instance.id });
          const settled = await view.rendering();
          view.close();
          if (settled.superseded) {
            throw new Error('Drawing view was superseded');
          }
          return readSvgPaths(expectSvgContent(settled.rendering));
        }),
      );
      document.close();

      expect(paths).toEqual([[{ stroke: '#ff0000' }], [{ stroke: '#0000ff', dash: '8 4' }]]);
    });

    it('should render one authored drawing instance alone', async () => {
      const client = createClient({ 'drawing.ts': drawingCode });
      const svg = expectSvgContent(
        await renderGeometry(client, {
          file: createGeometryFile('drawing.ts'),
          parameters: {},
          view: 'drawing',
          instance: 'Diagonal',
        }),
      );

      expect(readSvgPaths(svg).map((path) => path.stroke)).toEqual(['#0000ff']);
    });

    it('should keep drawings beside a model and render each in its view', async () => {
      const client = createClient({
        'mixed.ts': `
          import { Box, Line } from '@classcad/smlibwasm';
          export default function main() {
            return [
              { shape: Box(10, 10, 10), name: 'Body' },
              { shape: Line([0, 0, 0], [10, 0, 0]), name: 'Axis' },
            ];
          }
        `,
      });
      const file = createGeometryFile('mixed.ts');

      const model = await renderGeometry(client, { file, parameters: {} });
      const drawing = await renderGeometry(client, { file, parameters: {}, view: 'drawing' });

      expect(await countTriangles(model)).toBeGreaterThan(0);
      expect(readSvgPaths(expectSvgContent(drawing))).toHaveLength(1);
    });
  });

  // ===========================================================================
  // Exports
  // ===========================================================================

  describe('exportGeometry', () => {
    it('should export STEP that round-trips the solid, name and color', async () => {
      const { fromStep, ShapeList } = await import('@classcad/smlibwasm');
      const client = createClient({
        'box.ts': `
          import { Box } from '@classcad/smlibwasm';
          export default function main() {
            return { shape: Box(10, 20, 30), name: 'Block', color: '#ff0000' };
          }
        `,
      });
      await renderGeometry(client, { file: createGeometryFile('box.ts'), parameters: {} });

      const result = await exportLastRender(client, 'step');
      assertExportSuccess(result);
      expect(result.files[0].name).toBe('assembly.step');
      const imported = fromStep(new TextDecoder().decode(result.files[0].bytes));
      const part = (imported instanceof ShapeList ? [...imported][0] : imported) as unknown as {
        volume: number;
        name?: string;
        color?: number[];
      };
      expect(part.volume).toBeCloseTo(6000, 1);
      expect(part.name).toBe('Block');
      expect(part.color?.map((value) => Math.round(value * 255))).toEqual([255, 0, 0]);
    });

    it('should rotate STEP geometry from z-up to y-up exactly once', async () => {
      const { fromStep, ShapeList } = await import('@classcad/smlibwasm');
      const client = createClient({
        'box.ts': `
          import { Box, Pos } from '@classcad/smlibwasm';
          export default function main() { return Pos(1, 2, 3).mul(Box(10, 20, 30)); }
        `,
      });
      await renderGeometry(client, { file: createGeometryFile('box.ts'), parameters: {} });

      const zUp = await exportLastRender(client, 'step');
      const yUp = await exportLastRender(client, 'step', { coordinateSystem: 'y-up' });
      assertExportSuccess(zUp);
      assertExportSuccess(yUp);

      const bounds = (bytes: Uint8Array<ArrayBuffer>) => {
        const shape = fromStep(new TextDecoder().decode(bytes));
        const box = (shape instanceof ShapeList ? [...shape][0]! : shape).bbox();
        return { min: rounded(box.min.toArray()), max: rounded(box.max.toArray()) };
      };
      expect(bounds(zUp.files[0].bytes)).toEqual({ min: [-4, -8, -12], max: [6, 12, 18] });
      // (x, y, z) → (x, z, −y)
      expect(bounds(yUp.files[0].bytes)).toEqual({ min: [-4, -12, -12], max: [6, 18, 8] });
    });

    it('should export a STEP assembly with one body per shape', async () => {
      const { fromStep, ShapeList } = await import('@classcad/smlibwasm');
      const client = createClient({
        'parts.ts': `
          import { Box, Pos } from '@classcad/smlibwasm';
          export default function main() {
            return [
              { shape: Box(5, 5, 5), name: 'Left' },
              { shape: Pos(10, 0, 0).mul(Box(5, 5, 5)), name: 'Right' },
            ];
          }
        `,
      });
      await renderGeometry(client, { file: createGeometryFile('parts.ts'), parameters: {} });

      const result = await exportLastRender(client, 'step');
      assertExportSuccess(result);
      const imported = fromStep(new TextDecoder().decode(result.files[0].bytes));
      const names = [...(imported instanceof ShapeList ? imported : [imported])].map((shape) => shape.name);
      expect(names.map(String).toSorted((left, right) => left.localeCompare(right))).toEqual(['Left', 'Right']);
    });

    it('should export ASCII and binary STL per shape', async () => {
      const client = createClient({ 'box.ts': boxCode });
      await renderGeometry(client, { file: createGeometryFile('box.ts'), parameters: {} });

      const ascii = await exportLastRender(client, 'stl', { binary: false });
      const binary = await exportLastRender(client, 'stl');
      assertExportSuccess(ascii);
      assertExportSuccess(binary);
      expect(ascii.files).toHaveLength(1);
      expect(new TextDecoder().decode(ascii.files[0].bytes)).toMatch(/^solid/);
      const evidence = readBinaryStlEvidence(binary.files[0].bytes);
      // A box is 12 triangles.
      expect(evidence.normals).toHaveLength(12);
      expect(stlBounds(evidence.vertices)).toEqual({ min: [-25, -15, -5], max: [25, 15, 5] });
    });

    it('should rotate binary STL vertices to y-up exactly once', async () => {
      const client = createClient({ 'box.ts': boxCode });
      await renderGeometry(client, { file: createGeometryFile('box.ts'), parameters: {} });

      const yUp = await exportLastRender(client, 'stl', { binary: true, coordinateSystem: 'y-up' });
      assertExportSuccess(yUp);
      expect(stlBounds(readBinaryStlEvidence(yUp.files[0].bytes).vertices)).toEqual({
        min: [-25, -5, -15],
        max: [25, 5, 15],
      });
    });

    it.each(['glb', 'gltf'] as const)('should export %s', async (format) => {
      const client = createClient({ 'box.ts': boxCode });
      await renderGeometry(client, { file: createGeometryFile('box.ts'), parameters: {} });

      const result = await exportLastRender(client, format);
      assertExportSuccess(result);
      expect(result.files[0].bytes.byteLength).toBeGreaterThan(0);
    });

    it('should export GLB in z-up millimetres when asked', async () => {
      const client = createClient({ 'box.ts': boxCode });
      await renderGeometry(client, { file: createGeometryFile('box.ts'), parameters: {} });

      const result = await exportLastRender(client, 'glb', {
        coordinateSystem: 'z-up',
        unit: { length: 'millimeter' },
      });
      assertExportSuccess(result);
      const size = await readGltfSize(result.files[0].bytes);
      expect(size[0]).toBeCloseTo(50, 4);
      expect(size[1]).toBeCloseTo(30, 4);
      expect(size[2]).toBeCloseTo(10, 4);
    });

    it.each(['glb', 'gltf'] as const)(
      'should convert asymmetric %s geometry from z-up millimetres to y-up metres exactly once',
      async (format) => {
        const client = createClient({
          'evidence.ts': `
            import { Box, Pos } from '@classcad/smlibwasm';
            export default function main() {
              return [
                { shape: Pos(12, 21, 28).mul(Box(10, 20, 30)), name: 'First Box', color: '#ff0000' },
                { shape: Pos(-15, 26, 35).mul(Box(4, 6, 8)), name: 'Second Box', color: '#0000ff' },
              ];
            }
          `,
        });
        await renderGeometry(client, { file: createGeometryFile('evidence.ts'), parameters: {} });

        const zUp = await exportLastRender(client, format, {
          coordinateSystem: 'z-up',
          unit: { length: 'millimeter' },
        });
        const yUp = await exportLastRender(client, format, { coordinateSystem: 'y-up', unit: { length: 'meter' } });
        assertExportSuccess(zUp);
        assertExportSuccess(yUp);

        const zUpEvidence = await readCoordinateEvidence({ bytes: zUp.files[0].bytes, format });
        const yUpEvidence = await readCoordinateEvidence({ bytes: yUp.files[0].bytes, format });
        expect(yUpEvidence).toEqual(mapZupMillimetersToYupMeters(zUpEvidence));
      },
    );

    it('should export empty GLB and glTF files after an empty render', async () => {
      const client = createClient({ 'empty.ts': `import '@classcad/smlibwasm';\nexport default function main() {}` });
      await renderGeometry(client, { file: createGeometryFile('empty.ts'), parameters: {} });

      const results = await Promise.all(
        (['glb', 'gltf'] as const).map(async (format) => exportLastRender(client, format)),
      );
      for (const result of results) {
        assertExportSuccess(result);
        expect(result.files[0].bytes.byteLength).toBeGreaterThan(0);
      }
    });

    it('should refuse STEP for a model of meshes only', async () => {
      const client = createClient({
        'mesh.ts': `
          import { Mesh } from '@classcad/smlibwasm';
          export default function main() {
            return new Mesh([0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10], [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]);
          }
        `,
      });
      await renderGeometry(client, { file: createGeometryFile('mesh.ts'), parameters: {} });

      const result = await exportLastRender(client, 'step');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.issues[0]?.message).toContain('exact B-rep');
      }
    });

    it('should export from a committed evaluation before any view renders', async () => {
      const client = createClient({ 'box.ts': boxCode });
      const document = client.open({ source: { path: 'box.ts' }, parameters: {} });
      try {
        const result = await document.export('stl', { options: { binary: true } });
        assertExportSuccess(result);
        expect(readBinaryStlEvidence(result.files[0].bytes).normals).toHaveLength(12);
      } finally {
        document.close();
      }
    });

    it('should mesh STL more finely at a finer tolerance', async () => {
      const client = createClient({
        'cyl.ts': `
          import { Cylinder } from '@classcad/smlibwasm';
          export default function main() { return Cylinder(20, 10); }
        `,
      });
      await renderGeometry(client, { file: createGeometryFile('cyl.ts'), parameters: {} });

      const coarse = await exportLastRender(client, 'stl', {
        binary: true,
        tessellation: { linearTolerance: 1, angularTolerance: 30 },
      });
      const fine = await exportLastRender(client, 'stl', {
        binary: true,
        tessellation: { linearTolerance: 0.01, angularTolerance: 5 },
      });
      assertExportSuccess(coarse);
      assertExportSuccess(fine);
      expect(readBinaryStlEvidence(fine.files[0].bytes).normals.length).toBeGreaterThan(
        readBinaryStlEvidence(coarse.files[0].bytes).normals.length,
      );
    });
  });
});

// =============================================================================
// Edges, topology, tessellation and normals
// =============================================================================

describe('includeEdges and includeTopology content', () => {
  it('should omit edge lines by default and include them on request', async () => {
    const without = await createGeometry({ files: { 'plate.ts': plateCode }, mainFile: 'plate.ts' });
    const withEdges = await createGeometry({
      files: { 'plate.ts': plateCode },
      mainFile: 'plate.ts',
      content: { includeEdges: true },
    });

    const withoutCounts = await countPrimitives(without);
    const withCounts = await countPrimitives(withEdges);
    expect(withoutCounts.lines).toBe(0);
    expect(withCounts.lines).toBeGreaterThan(0);
    expect(withCounts.triangleVertices).toBe(withoutCounts.triangleVertices);
  });

  it('should group triangles by face and edges by edge in TAU_cad_topology', async () => {
    const result = await createGeometry({
      files: { 'box.ts': boxCode },
      mainFile: 'box.ts',
      content: { includeEdges: true, includeTopology: true },
    });

    assertRenderingSuccess(result);
    const payload = await readTopologyPayload(extractGltfFromResult(result));
    expect(payload.components).toHaveLength(1);
    const [component] = payload.components;
    // A box has six faces of two triangles and twelve straight edges of one segment.
    expect(component?.faceGroups?.map((group) => group.faceId).toSorted((left, right) => left - right)).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
    expect(component?.faceGroups?.every((group) => group.count === 6)).toBe(true);
    expect(component?.edgeGroups).toHaveLength(12);
    expect(component?.edgeGroups?.every((group) => group.count === 6)).toBe(true);
    expect(component?.capabilities?.hasPreciseTopology).toBe(true);
  });
});

/** Open edges of the triangle mesh once coincident positions are welded: zero for a watertight mesh. */
const countOpenEdges = async (rendering: Rendering): Promise<number> => {
  const document = await readGlb(rendering);
  let open = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      if (primitive.getMode() !== 4) {
        continue;
      }
      const position = primitive.getAttribute('POSITION')!;
      const indices = primitive.getIndices()!;
      const keys: string[] = [];
      for (let index = 0; index < position.getCount(); index++) {
        keys.push(
          position
            .getElement(index, [0, 0, 0])
            .map((value) => Math.round(value * 1e7))
            .join(','),
        );
      }
      const edges = new Map<string, number>();
      for (let corner = 0; corner < indices.getCount(); corner += 3) {
        const triangle = [0, 1, 2].map((offset) => keys[indices.getScalar(corner + offset)]!);
        for (let side = 0; side < 3; side++) {
          const edge = [triangle[side]!, triangle[(side + 1) % 3]!].toSorted().join('|');
          edges.set(edge, (edges.get(edge) ?? 0) + 1);
        }
      }
      open += [...edges.values()].filter((count) => count !== 2).length;
    }
  }
  return open;
};

describe('Watertight meshes', () => {
  it.each([
    ['a box filleted on every edge', `const box = Box(30, 20, 10); return box.fillet(box.edges(), 2);`],
    ['a cone frustum', `return Cone(12, 3, 24);`],
    ['a moved torus', `return Pos(34, -17, 9).mul(Torus(10, 3));`],
    [
      'a chamfered and filleted block',
      `const box = Box(40, 30, 20); const rounded = box.fillet(box.edges().parallelTo(Z), 4); return rounded.chamfer(rounded.edges().groupBy(Z).at(-1), 1.5);`,
    ],
  ])('should render %s without cracks between faces', async (_label, body) => {
    const result = await createGeometry({
      files: {
        'part.ts': `
          import { Box, Cone, Pos, Torus, Z } from '@classcad/smlibwasm';
          export default function main() { ${body} }
        `,
      },
      mainFile: 'part.ts',
      content: { includeTopology: true },
    });

    assertRenderingSuccess(result);
    expect(await countOpenEdges(result)).toBe(0);
    const payload = await readTopologyPayload(extractGltfFromResult(result));
    const groups = payload.components[0]?.faceGroups ?? [];
    expect(groups.length).toBeGreaterThan(0);
    expect(new Set(groups.map((group) => group.faceId)).size).toBe(groups.length);
  });
});

describe('Tessellation', () => {
  const sphereCode = `
    import { Sphere } from '@classcad/smlibwasm';
    export default function main() { return Sphere(20); }
  `;

  it('should produce denser meshes at a finer tessellation preset', async () => {
    const client = createClient({ 'sphere.ts': sphereCode });
    const file = createGeometryFile('sphere.ts');

    const draft = await renderGeometry(client, { file, parameters: {}, options: { tessellation: 'low' } });
    const fine = await renderGeometry(client, { file, parameters: {}, options: { tessellation: 'extra-high' } });

    const fineTriangles = await countTriangles(fine);
    const draftTriangles = await countTriangles(draft);
    expect(fineTriangles).toBeGreaterThan(draftTriangles);
  });

  it('should honour explicit linear and angular tolerances', async () => {
    const client = createClient({ 'sphere.ts': sphereCode });
    const file = createGeometryFile('sphere.ts');

    const coarse = await renderGeometry(client, {
      file,
      parameters: {},
      options: { tessellation: { linearTolerance: 2, angularTolerance: 40 } },
    });
    const fine = await renderGeometry(client, {
      file,
      parameters: {},
      options: { tessellation: { linearTolerance: 0.05, angularTolerance: 5 } },
    });

    const fineTriangles = await countTriangles(fine);
    const coarseTriangles = await countTriangles(coarse);
    expect(fineTriangles).toBeGreaterThan(coarseTriangles);
  });
});

describe('Normal consistency', () => {
  const outwardRatio = async (rendering: Rendering): Promise<number> => {
    const document = await readGlb(rendering);
    const points: Array<{ position: number[]; normal: number[] }> = [];
    for (const mesh of document.getRoot().listMeshes()) {
      for (const primitive of mesh.listPrimitives()) {
        if (primitive.getMode() !== 4) {
          continue;
        }
        const position = primitive.getAttribute('POSITION')!;
        const normal = primitive.getAttribute('NORMAL')!;
        for (let index = 0; index < position.getCount(); index++) {
          points.push({ position: position.getElement(index, []), normal: normal.getElement(index, []) });
        }
      }
    }
    const center = [0, 1, 2].map(
      (axis) => points.reduce((sum, point) => sum + point.position[axis]!, 0) / points.length,
    );
    const outward = points.filter(
      ({ position, normal }) =>
        [0, 1, 2].reduce((sum, axis) => sum + (position[axis]! - center[axis]!) * normal[axis]!, 0) >= 0,
    );
    return outward.length / points.length;
  };

  it('should produce outward-facing unit normals on a convex solid', async () => {
    const result = await createGeometry({ files: { 'box.ts': boxCode }, mainFile: 'box.ts' });
    expect(await outwardRatio(result)).toBeGreaterThan(0.95);

    const document = await readGlb(result);
    for (const mesh of document.getRoot().listMeshes()) {
      for (const primitive of mesh.listPrimitives()) {
        const normal = primitive.getAttribute('NORMAL');
        if (!normal) {
          continue;
        }
        for (let index = 0; index < normal.getCount(); index++) {
          const [x = 0, y = 0, z = 0] = normal.getElement(index, [0, 0, 0]);
          expect(Math.hypot(x, y, z)).toBeCloseTo(1, 3);
        }
      }
    }
  });

  it('should produce outward-facing normals on a smooth curved solid', async () => {
    const result = await createGeometry({
      files: {
        'sphere.ts': `
          import { Sphere } from '@classcad/smlibwasm';
          export default function main() { return Sphere(10); }
        `,
      },
      mainFile: 'sphere.ts',
    });
    expect(await outwardRatio(result)).toBeGreaterThan(0.99);
  });

  it('should keep sharp box edges: no vertex shares normals across faces', async () => {
    const result = await createGeometry({ files: { 'box.ts': boxCode }, mainFile: 'box.ts' });
    const document = await readGlb(result);
    for (const mesh of document.getRoot().listMeshes()) {
      for (const primitive of mesh.listPrimitives()) {
        const normal = primitive.getAttribute('NORMAL');
        if (!normal) {
          continue;
        }
        for (let index = 0; index < normal.getCount(); index++) {
          const components = normal.getElement(index, []).map((value) => Math.abs(value));
          // Every normal on a box is axis-aligned.
          expect(Math.max(...components)).toBeCloseTo(1, 3);
        }
      }
    }
  });
});

// =============================================================================
// Library tracing telemetry
// =============================================================================

describe('Library call tracing', () => {
  async function collectTelemetry(): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 500);
    });
  }

  beforeEach(() => {
    performance.clearMeasures();
    performance.clearMarks();
  });

  const tracedCode = `
    import { Box, Cylinder } from '@classcad/smlibwasm';
    export default function main() {
      const base = Box(10, 20, 30);
      return base.cut(Cylinder(2, 40));
    }
  `;

  it('emits wasm-init, run-main, render-output and glTF spans', async () => {
    const telemetry: Array<readonly TelemetryEntry[]> = [];
    const client = createClient({ 'box.ts': tracedCode }, { onTelemetry: (entries) => telemetry.push(entries) });

    assertRenderingSuccess(await renderGeometry(client, { file: createGeometryFile('box.ts'), parameters: {} }));
    await collectTelemetry();

    const names = new Set(telemetry.flat().map((entry) => entry.name));
    for (const name of ['smlib.run-main', 'smlib.render-output', 'smlib.mesh-to-gltf']) {
      expect(names).toContain(name);
    }
  });

  it('emits a library summary under run-main when summary tracing is enabled', async () => {
    const telemetry: Array<readonly TelemetryEntry[]> = [];
    const client = createClient(
      { 'box.ts': tracedCode },
      { workerOptions: { libraryTracing: 'summary' }, onTelemetry: (entries) => telemetry.push(entries) },
    );

    assertRenderingSuccess(await renderGeometry(client, { file: createGeometryFile('box.ts'), parameters: {} }));
    await collectTelemetry();

    const entries = telemetry.flat();
    const runMain = entries.find((entry) => entry.name === 'smlib.run-main');
    const summary = entries.find((entry) => entry.name === 'smlib.library.summary');
    expect(summary?.detail).toMatchObject({ library: 'smlib' });
    expect(summary?.detail).toMatchObject({ 'Box.calls': 1, 'Cylinder.calls': 1, 'cut.calls': 1 });
    expect(summary?.detail?.['parentSpanId']).toBe(runMain?.detail?.['spanId']);
  });

  it('emits per-call spans for constructors and shape methods, and still renders', async () => {
    const telemetry: Array<readonly TelemetryEntry[]> = [];
    const client = createClient(
      { 'box.ts': plateCode },
      { workerOptions: { libraryTracing: 'per-call' }, onTelemetry: (entries) => telemetry.push(entries) },
    );

    assertRenderingSuccess(await renderGeometry(client, { file: createGeometryFile('box.ts'), parameters: {} }));
    await collectTelemetry();

    const librarySpans = telemetry.flat().filter((entry) => entry.name.startsWith('smlib.library.'));
    const spanNames = new Set(librarySpans.map((entry) => entry.name));
    for (const name of ['smlib.library.Box', 'smlib.library.fillet', 'smlib.library.cut']) {
      expect(spanNames).toContain(name);
    }
    expect(librarySpans[0]?.detail).toMatchObject({ scope: 'user-main' });
  });

  it('emits no library telemetry when tracing is off', async () => {
    const telemetry: Array<readonly TelemetryEntry[]> = [];
    const client = createClient({ 'box.ts': tracedCode }, { onTelemetry: (entries) => telemetry.push(entries) });

    assertRenderingSuccess(await renderGeometry(client, { file: createGeometryFile('box.ts'), parameters: {} }));
    await collectTelemetry();

    expect(telemetry.flat().filter((entry) => entry.name.startsWith('smlib.library.'))).toHaveLength(0);
  });
});

// =============================================================================
// Mechanisms
// =============================================================================

const mechanismModule = (driverComponent: string, declaration = 'function mechanism(params: typeof defaultParams)') => `
  import { Box, Pos } from '@classcad/smlibwasm';
  import type { MechanismSource } from '@taucad/kinematics';

  export const defaultParams = { gap: 20 };

  // Box is centred on the origin, so each body is placed by its centre.
  export default function main(params: typeof defaultParams) {
    return [
      { shape: Pos(50, 25, 5).mul(Box(100, 50, 10)), name: 'Base' },
      { shape: Pos(10, 10, 20).mul(Box(20, 20, 20)), name: 'Drive Gear' },
      { shape: Pos(params.gap + 30, 10, 20).mul(Box(20, 20, 20)), name: 'Driven Gear' },
    ];
  }

  export ${declaration} {
    return {
      schemaVersion: 1,
      units: { length: 'mm', angle: 'deg' },
      root: 'base',
      links: {
        base: { shapes: ['Base'] },
        drive: { shapes: ['${driverComponent}'] },
        driven: { shapes: ['Driven Gear'] },
      },
      joints: {
        drive: {
          type: 'revolute',
          parent: 'base',
          child: 'drive',
          origin: [10, 10, 10],
          axis: [0, 0, 1],
          limits: { lower: -180, upper: 180 },
        },
        driven: { type: 'revolute', parent: 'base', child: 'driven', origin: [params.gap + 30, 10, 10], axis: [0, 0, 1] },
      },
      couplings: [{ driver: 'drive', follower: 'driven', ratio: -0.5 }],
    };
  }
`;

describe('mechanism export', () => {
  it('should render and pose the hinged model documented in the SMLib skill', async () => {
    const reference = await readFile(new URL('../agent/kinematics-reference.md', import.meta.url), 'utf8');
    const source = /## Complete hinged model\n\n```typescript\n([\s\S]*?)\n```/u.exec(reference)?.[1];
    expect(source).toBeDefined();
    if (source === undefined) {
      return;
    }

    const result = await createGeometry({ files: { 'hinge.ts': source }, mainFile: 'hinge.ts' });
    assertRenderingSuccess(result);
    expect(result.issues).toEqual([]);
    const { mechanism } = await readTopologyPayload(extractGltfFromResult(result));
    expect(mechanism?.links).toEqual({
      base: { components: ['component:base'] },
      lid: { components: ['component:lid'] },
    });
    const animation = mechanism?.animations?.[0];
    expect(animation).toBeDefined();
    if (mechanism === undefined || animation === undefined) {
      return;
    }
    expect(sampleAnimation({ animation, time: 1 })).toEqual({ hinge: 55 });
    const pose = evaluatePose({ mechanism, coordinates: { hinge: 55 } });
    expect(pose.status).toBe('posed');
    if (pose.status === 'posed') {
      expect(pose.pose.linkTransforms['lid']).not.toEqual(pose.pose.linkTransforms['base']);
    }
  });

  it('should carry a mechanism in GLB space with resolved component ids', async () => {
    const result = await createGeometry({
      files: { 'gears.ts': mechanismModule('Drive Gear') },
      mainFile: 'gears.ts',
      parameters: { gap: 30 },
    });

    assertRenderingSuccess(result);
    const payload = await readTopologyPayload(extractGltfFromResult(result));
    const { mechanism } = payload;
    expect(result.issues).toEqual([]);
    expect(payload.components.map((component) => component.id)).toEqual([
      'component:base',
      'component:drive-gear',
      'component:driven-gear',
    ]);
    expect(mechanism?.units).toEqual({ length: 'm', angle: 'deg' });
    // Z-up millimetres → Y-up metres: (x, y, z) → (x, z, −y) / 1000.
    const drive = mechanism?.joints['drive'];
    const driven = mechanism?.joints['driven'];
    expect(rounded(drive?.origin)).toEqual([0.01, 0.01, -0.01]);
    expect(drive?.type === 'revolute' ? rounded(drive.axis) : undefined).toEqual([0, 1, 0]);
    expect(rounded(driven?.origin)).toEqual([0.06, 0.01, -0.01]);
    expect(mechanism?.couplings).toEqual([{ driver: 'drive', follower: 'driven', ratio: -0.5 }]);
  });

  it('should report an unknown component and still render the geometry', async () => {
    const result = await createGeometry({
      files: { 'gears.ts': mechanismModule('Missing Gear') },
      mainFile: 'gears.ts',
    });

    assertRenderingSuccess(result);
    const payload = await readTopologyPayload(extractGltfFromResult(result));
    expect(payload.components).toHaveLength(3);
    expect(payload.mechanism).toBeUndefined();
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'INVALID_REFERENCE',
        severity: 'warning',
        message: expect.stringMatching(/\/links\/drive.*Missing Gear/s),
      }),
    ]);
  });

  it('should render without a mechanism and warn when mechanism() throws', async () => {
    const result = await createGeometry({
      files: {
        'box.ts': `
          import { Box } from '@classcad/smlibwasm';
          export const defaultParams = { size: 10 };
          export default function main(params: typeof defaultParams) {
            return [{ shape: Box(params.size, params.size, params.size), name: 'Base' }];
          }
          export function mechanism(params: typeof defaultParams) {
            throw new Error(\`mechanism typo for size \${params.size}\`);
          }
        `,
      },
      mainFile: 'box.ts',
    });

    assertRenderingSuccess(result);
    const payload = await readTopologyPayload(extractGltfFromResult(result));
    expect(payload.mechanism).toBeUndefined();
    expect(result.issues).toEqual([
      expect.objectContaining({
        severity: 'warning',
        message: expect.stringMatching(/^Mechanism: mechanism\(\) threw ".*mechanism typo for size 10"/),
        details: expect.objectContaining({ producer: { kernelId: 'smlib' } }),
      }),
    ]);
  });

  it('should resolve an async mechanism() to its value', async () => {
    const result = await createGeometry({
      files: {
        'gears.ts': mechanismModule(
          'Drive Gear',
          'async function mechanism(params: typeof defaultParams): Promise<MechanismSource>',
        ),
      },
      mainFile: 'gears.ts',
    });

    assertRenderingSuccess(result);
    const payload = await readTopologyPayload(extractGltfFromResult(result));
    expect(result.issues).toEqual([]);
    expect(payload.mechanism?.links['drive']).toEqual({ components: ['component:drive-gear'] });
  });
});

// =============================================================================
// serializeHandle / deserializeHandle
// =============================================================================

type SmlibKernelContext = Parameters<NonNullable<typeof smlibDefinition.serializeHandle>>[2];
type SmlibSerializeInput = Parameters<NonNullable<typeof smlibDefinition.serializeHandle>>[0]['handle'];

describe('serializeNativeHandle', () => {
  beforeAll(async () => {
    smlibDefinition = await resolveSmlibDefinition();
  });

  const context = async (): Promise<SmlibKernelContext> => {
    const library = await import('@classcad/smlibwasm');
    // The kernel's serializer reads only the library; a mock proxy would freeze its arrays.
    return { library: { ...library } } as unknown as SmlibKernelContext;
  };

  const roundTrip = async (handle: SmlibSerializeInput) => {
    const kernelContext = await context();
    const snapshot = smlibDefinition.serializeHandle!({ handle }, createMockKernelRuntime(), kernelContext);
    // The build cache stores the snapshot with msgpack.
    const restoredSnapshot = msgpackDecode(msgpackEncode(snapshot)) as typeof snapshot;
    const restored = smlibDefinition.deserializeHandle!(
      { serialized: restoredSnapshot },
      createMockKernelRuntime(),
      kernelContext,
    );
    return { snapshot, restored };
  };

  it('should round-trip exact bodies, metadata, meshes, drawings and the mechanism', async () => {
    const library = await import('@classcad/smlibwasm');
    const mechanism = { schemaVersion: 1, root: 'base', links: { base: { shapes: ['Block'] } }, joints: {} };
    const handle = {
      shapes: normalizeRenderShapes(
        library,
        [
          // oxlint-disable-next-line new-cap -- SMLib's shape factories are capitalised functions.
          { shape: library.Box(10, 20, 30), name: 'Block', color: '#ff0000', metalness: 0.8, roughness: 0.3 },
          { shape: new library.Mesh([0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2]), name: 'Tri', opacity: 0.5 },
        ],
        'model',
      ),
      drawings: [
        {
          name: 'Sketch',
          polylines: [
            [
              [0, 0],
              [1, 1],
            ],
          ],
        },
      ],
      mechanism,
    } as unknown as SmlibSerializeInput;

    const { snapshot, restored } = await roundTrip(handle);

    expect(snapshot.shapes.map((shape) => shape.kind)).toEqual(['brep', 'mesh']);
    expect(snapshot.shapes[0]?.metadata).toMatchObject({
      name: 'Block',
      color: '#ff0000',
      metalness: 0.8,
      roughness: 0.3,
    });
    expect(restored.shapes.map((entry) => entry.name)).toEqual(['Block', 'Tri']);
    const block = restored.shapes[0]?.shape;
    expect(block).toBeInstanceOf(library.Part);
    expect((block as InstanceType<typeof library.Part>).volume).toBeCloseTo(6000, 3);
    expect(restored.shapes[1]?.shape).toBeInstanceOf(library.Mesh);
    expect(restored.shapes[1]).toMatchObject({ opacity: 0.5 });
    expect(restored.drawings).toEqual(handle.drawings);
    expect(restored.mechanism).toEqual(mechanism);
  });

  it('should keep GLB resources across a snapshot', async () => {
    const library = await import('@classcad/smlibwasm');
    const handle = {
      // oxlint-disable-next-line new-cap -- SMLib's shape factories are capitalised functions.
      shapes: normalizeRenderShapes(library, [{ shape: library.Box(1, 1, 1), name: 'Box' }], 'model'),
      drawings: [],
      images: { checker: { uri: 'data:image/png;base64,AAAA' } },
    } as unknown as SmlibSerializeInput;

    const { restored } = await roundTrip(handle);
    expect(restored.images).toEqual(handle.images);
  });
});

describe('No kernel matched', () => {
  it('should fail when no kernel can handle an empty file', async () => {
    const result = await createGeometry({ files: { 'empty.ts': '' }, mainFile: 'empty.ts' });

    assertRenderingFailure(result);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'KERNEL_CAPABILITY_MISSING' }));
  });
});

/* eslint-enable @typescript-eslint/naming-convention -- End of file */
