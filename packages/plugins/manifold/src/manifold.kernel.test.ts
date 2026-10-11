// @vitest-environment node
import { afterEach, describe, it, expect } from 'vitest';
import { NodeIO } from '@gltf-transform/core';
import type { ParameterManifest } from '@taucad/parameters';
import { asKnownArtifact } from '@taucad/runtime/types';

import { manifoldKernel } from '#manifold.kernel.js';
import { esbuildBundler } from '@taucad/esbuild';
import {
  assertRenderingSuccess,
  createMockKernelRuntime,
  expectKernelProjectionOrder,
  createGeometryTestHelpers,
  createTestGeometry,
  createTestRuntimeClient,
  getTestParameters,
  mapZupMillimetersToYupMeters,
  readCoordinateEvidence,
} from '@taucad/runtime-testing';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import { defineRuntime } from '@taucad/runtime/worker';

const testRuntime = defineRuntime({ kernels: [manifoldKernel()], bundlers: [esbuildBundler()] });
const testClients = new Set<ReturnType<typeof createTestRuntimeClient<typeof testRuntime>>>();
const createClient = (files: Record<string, string>) => {
  const client = createTestRuntimeClient({ runtime: testRuntime, files });
  testClients.add(client);
  return client;
};

afterEach(async () => {
  await Promise.all([...testClients].map(async (client) => client.shutdown()));
  testClients.clear();
});

const getParameters = async (files: Record<string, string>, mainFile: string): Promise<ParameterManifest> =>
  getTestParameters({ runtime: testRuntime, files, mainFile });

const createGeometry = async (
  files: Record<string, string>,
  mainFile: string,
  parameters: Record<string, unknown> = {},
): ReturnType<typeof createTestGeometry> =>
  createTestGeometry({
    runtime: testRuntime,
    files,
    open: { source: { path: mainFile }, parameters },
  });

const geometryHelpers = createGeometryTestHelpers();

const readGltfNodeMeshNames = async (
  glbBytes: Uint8Array<ArrayBuffer>,
): Promise<{ nodeNames: string[]; meshNames: string[] }> => {
  const document = await new NodeIO().readBinary(glbBytes);
  const semanticNodes = document
    .getRoot()
    .listNodes()
    .filter((node) =>
      node
        .getMesh()
        ?.listPrimitives()
        .some((primitive) => primitive.getMode() !== 1),
    );
  return {
    nodeNames: semanticNodes.map((node) => node.getName()),
    meshNames: semanticNodes.map((node) => node.getMesh()!.getName()),
  };
};

const extractGltfBytes = (result: Awaited<ReturnType<typeof createTestGeometry>>): Uint8Array<ArrayBuffer> => {
  if (!result.success) {
    throw new Error(`Expected GLB rendering, received ${result.issues.map(({ message }) => message).join('; ')}`);
  }
  const artifact = asKnownArtifact(result.artifact);
  if (artifact?.mimeType !== 'model/gltf-binary') {
    throw new Error(`Expected GLB artifact, received ${result.artifact.mimeType}`);
  }
  return artifact.content;
};

const readGlbJson = (
  bytes: Uint8Array<ArrayBuffer>,
): {
  extensionsUsed?: string[];
  meshes?: Array<{ extensions?: Record<string, unknown> }>;
} => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength))) as {
    extensionsUsed?: string[];
    meshes?: Array<{ extensions?: Record<string, unknown> }>;
  };
};

describe('ManifoldWorker', () => {
  it.each([false, true])('keeps %s geometry render and GLB export independent', async (empty) => {
    const result = await createGeometry(
      {
        'model.ts': empty
          ? `import { Manifold } from 'manifold-3d/manifoldCAD'; export default () => [];`
          : `import { Manifold } from 'manifold-3d/manifoldCAD'; export default () => Manifold.cube([10, 10, 10]);`,
      },
      'model.ts',
    );
    assertRenderingSuccess(result);
    const glb = extractGltfBytes(result);
    const definition = await resolveRuntimePluginDefinition('kernel', manifoldKernel());
    const runtime = createMockKernelRuntime();
    const context = { manifoldCadModule: {} };
    const handle = { glb };
    const fresh = definition.deserializeHandle!(
      {
        serialized: definition.serializeHandle!({ handle }, runtime, context),
      },
      runtime,
      context,
    );
    const render = async (value: typeof handle) => {
      const projected = await definition.render!({ handle: value, view: 'model', options: {} }, runtime, context);
      return projected.content;
    };
    const exportModel = async (value: typeof handle, coordinateSystem: 'y-up' | 'z-up') => {
      const projected = await definition.export!(
        {
          exportId: 'glb',
          handle: value,
          options: {
            coordinateSystem,
            unit: { length: coordinateSystem === 'y-up' ? 'meter' : 'millimeter' },
          },
        },
        runtime,
        context,
      );
      return projected.files[0].bytes;
    };
    const ordered = await expectKernelProjectionOrder({
      renderA: async () => render(handle),
      renderB: async () => exportModel(handle, 'y-up'),
      freshB: async () => exportModel(fresh, 'y-up'),
      export: async () => exportModel(handle, 'z-up'),
    });
    expect(ordered.first).toEqual(glb);
  });

  describe('getParameters', () => {
    it('should extract defaultParams from ESM module', async () => {
      const { defaults, schema } = await getParameters(
        {
          'params.ts': `
            import { Manifold } from 'manifold-3d/manifoldCAD';

            export const defaultParams = {
              size: 20,
              centered: true,
            };

            export default function main(p = defaultParams) {
              return Manifold.cube([p.size, p.size, p.size], p.centered);
            }
          `,
        },
        'params.ts',
      );

      expect(defaults).toEqual({ size: 20, centered: true });
      expect(schema).toMatchObject({
        type: 'object',
        properties: {
          size: { type: 'double', default: 20 },
          centered: { type: 'boolean', default: true },
        },
      });
    });

    it('should extract defaultParameters alias', async () => {
      const { defaults } = await getParameters(
        {
          'params.ts': `
            import { Manifold } from 'manifold-3d/manifoldCAD';

            export const defaultParameters = {
              radius: 15,
            };

            export default function main(p = defaultParameters) {
              return Manifold.sphere(p.radius);
            }
          `,
        },
        'params.ts',
      );

      expect(defaults).toEqual({ radius: 15 });
    });

    it('should return empty parameter defaults when none are exported', async () => {
      const { defaults } = await getParameters(
        {
          'no-params.ts': `
            import { Manifold } from 'manifold-3d/manifoldCAD';

            export default function main() {
              return Manifold.cube([10, 10, 10], true);
            }
          `,
        },
        'no-params.ts',
      );

      expect(defaults).toEqual({});
    });
  });

  describe('createGeometry', () => {
    it('should compute GLTF geometry for a simple cube', async () => {
      const result = await createGeometry(
        {
          'cube.ts': `
            import { Manifold } from 'manifold-3d/manifoldCAD';

            export default function main() {
              return Manifold.cube([10, 10, 10], true);
            }
          `,
        },
        'cube.ts',
      );

      expect(result.success).toBe(true);
      await geometryHelpers.expectValidGltf(result);
      await geometryHelpers.expectMeshCount(result, 1);
      await geometryHelpers.expectBoundingBoxSize(result, [0.01, 0.01, 0.01], 0.0005);
      if (result.success) {
        const json = readGlbJson(extractGltfBytes(result));
        expect(json.extensionsUsed).toContain('EXT_mesh_manifold');
        expect(json.meshes?.[0]?.extensions?.['EXT_mesh_manifold']).toMatchObject({
          manifoldPrimitive: { mode: 4 },
        });
        const { nodeNames, meshNames } = await readGltfNodeMeshNames(extractGltfBytes(result));
        expect(nodeNames).toEqual(['Shape 1']);
        expect(meshNames).toEqual(['Shape 1']);
      }
    });

    it('tracks GLTFNode exports and resets the tracked-node registry between renders', async () => {
      const client = createClient({
        'tracked.ts': `
          import { GLTFNode, getGLTFNodes, Manifold } from 'manifold-3d/manifoldCAD';

          export default function main() {
            const node = new GLTFNode();
            node.manifold = Manifold.cube([10, 10, 10], true);
            return getGLTFNodes();
          }
        `,
      });

      const expectRenderedMesh = async () => {
        const document = client.open({ source: { path: 'tracked.ts' }, parameters: {}, watch: false });
        const view = document.view('model');
        const outcome = await view.rendering();
        expect(outcome.superseded).toBe(false);
        if (!outcome.superseded) {
          await geometryHelpers.expectMeshCount(outcome.rendering, 1);
        }
        view.close();
        document.close();
      };

      await expectRenderedMesh();
      await expectRenderedMesh();
    });

    it('should compute geometry using runtime parameters', async () => {
      const result = await createGeometry(
        {
          'cube.ts': `
            import { Manifold } from 'manifold-3d/manifoldCAD';

            export const defaultParams = { size: 20 };

            export default function main(p = defaultParams) {
              return Manifold.cube([p.size, p.size, p.size], true);
            }
          `,
        },
        'cube.ts',
        { size: 30 },
      );

      expect(result.success).toBe(true);
      await geometryHelpers.expectValidGltf(result);
      await geometryHelpers.expectBoundingBoxSize(result, [0.03, 0.03, 0.03], 0.0005);
    });

    it('should support default export as async function', async () => {
      const result = await createGeometry(
        {
          'async-main.ts': `
            import { Manifold } from 'manifold-3d/manifoldCAD';

            export default async function main() {
              return Manifold.sphere(10);
            }
          `,
        },
        'async-main.ts',
      );

      expect(result.success).toBe(true);
      await geometryHelpers.expectValidGltf(result);
      await geometryHelpers.expectMeshCount(result, 1);
    });

    it('should render an empty GLB when main returns undefined (no return statement)', async () => {
      const result = await createGeometry(
        {
          'no-return.ts': `
            import { Manifold } from 'manifold-3d/manifoldCAD';

            export default function main() {
              Manifold.cube([10, 10, 10], true);
            }
          `,
        },
        'no-return.ts',
      );

      await geometryHelpers.expectValidGltf(result);
      await geometryHelpers.expectMeshCount(result, 0);
    });

    it('should render an empty GLB when main explicitly returns undefined', async () => {
      const result = await createGeometry(
        {
          'explicit_undefined.ts': `
            import { Manifold } from 'manifold-3d/manifoldCAD';

            export default function main() {
              Manifold.cube([10, 10, 10], true);
              return undefined;
            }
          `,
        },
        'explicit_undefined.ts',
      );

      await geometryHelpers.expectValidGltf(result);
      await geometryHelpers.expectMeshCount(result, 0);
    });

    it('should render an empty GLB when main returns empty array', async () => {
      const result = await createGeometry(
        {
          'empty_array.ts': `
            import { Manifold } from 'manifold-3d/manifoldCAD';

            export default function main() {
              return [];
            }
          `,
        },
        'empty_array.ts',
      );

      await geometryHelpers.expectValidGltf(result);
      await geometryHelpers.expectMeshCount(result, 0);
    });

    it('should return failure for syntax errors', async () => {
      const result = await createGeometry(
        {
          'syntax-error.ts': `
            import { Manifold } from 'manifold-3d/manifoldCAD';

            export default function main() {
              return Manifold.cube([10, 10, 10], true
            }
          `,
        },
        'syntax-error.ts',
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.issues[0]?.message.length).toBeGreaterThan(0);
      }
    });

    it('should return failure for runtime errors thrown by user code', async () => {
      const result = await createGeometry(
        {
          'runtime-error.ts': `
            import { Manifold } from 'manifold-3d/manifoldCAD';

            export default function main() {
              throw new Error('manifold boom');
            }
          `,
        },
        'runtime-error.ts',
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.issues[0]?.message).toContain('manifold boom');
      }
    });
  });

  describe('normals', () => {
    type TrianglePrimitive = {
      readonly positions: Float32Array;
      readonly normals: Float32Array | undefined;
      readonly colors: Float32Array | undefined;
    };

    const renderTriangles = async (source: string): Promise<TrianglePrimitive[]> => {
      const result = await createGeometry({ 'model.ts': source }, 'model.ts');
      assertRenderingSuccess(result);
      const document = await new NodeIO().readBinary(extractGltfBytes(result));
      return document
        .getRoot()
        .listMeshes()
        .flatMap((mesh) => mesh.listPrimitives())
        .filter((primitive) => primitive.getMode() === 4)
        .map((primitive) => ({
          positions: primitive.getAttribute('POSITION')!.getArray() as Float32Array,
          normals: primitive.getAttribute('NORMAL')?.getArray() as Float32Array | undefined,
          colors: primitive.getAttribute('COLOR_0')?.getArray() as Float32Array | undefined,
        }));
    };

    const vectors = (values: Float32Array): Array<[number, number, number]> =>
      Array.from({ length: values.length / 3 }, (_, index) => [
        values[index * 3]!,
        values[index * 3 + 1]!,
        values[index * 3 + 2]!,
      ]);

    const expectUnitNormals = (primitives: readonly TrianglePrimitive[]): void => {
      expect(primitives.length).toBeGreaterThan(0);
      for (const { positions, normals } of primitives) {
        expect(normals).toBeDefined();
        expect(normals!.length).toBe(positions.length);
        for (const [x, y, z] of vectors(normals!)) {
          expect(Math.hypot(x, y, z)).toBeCloseTo(1, 4);
        }
      }
    };

    it('supplies normals for a bare manifold, keeping box edges sharp and the manifold extension', async () => {
      const result = await createGeometry(
        {
          'cube.ts': `
            import { Manifold } from 'manifold-3d/manifoldCAD';
            export default () => Manifold.cube([10, 10, 10], true);
          `,
        },
        'cube.ts',
      );
      assertRenderingSuccess(result);
      expect(readGlbJson(extractGltfBytes(result)).extensionsUsed).toContain('EXT_mesh_manifold');

      const primitives = await renderTriangles(`
        import { Manifold } from 'manifold-3d/manifoldCAD';
        export default () => Manifold.cube([10, 10, 10], true);
      `);
      expectUnitNormals(primitives);
      // 90° edges exceed the smoothing angle, so every normal is a face normal.
      for (const normal of vectors(primitives[0]!.normals!)) {
        expect(normal.map((component) => Math.abs(Math.round(component))).reduce((sum, value) => sum + value)).toBe(1);
      }
    });

    it('labels normals on setMaterial parts that the node material does not govern', async () => {
      const primitives = await renderTriangles(`
        import { Manifold, setMaterial } from 'manifold-3d/manifoldCAD';
        export default () =>
          setMaterial(Manifold.cube([40, 40, 10], true), { baseColorFactor: [0, 0, 1] }).add(
            setMaterial(Manifold.cylinder(30, 8, -1, 32, true), { baseColorFactor: [1, 0, 0] }),
          );
      `);
      expect(primitives).toHaveLength(2);
      expectUnitNormals(primitives);
    });

    it('appends normals after authored colour properties', async () => {
      const primitives = await renderTriangles(`
        import { GLTFNode, Manifold } from 'manifold-3d/manifoldCAD';
        export default () => {
          const node = new GLTFNode();
          node.manifold = Manifold.cube([10, 10, 10], true).setProperties(3, (color, position) => {
            color[0] = (position[0] + 5) / 10;
            color[1] = (position[1] + 5) / 10;
            color[2] = 0.25;
          });
          node.material = { attributes: ['COLOR_0'] };
          return node;
        };
      `);
      expectUnitNormals(primitives);
      const [{ positions, colors }] = primitives as [TrianglePrimitive];
      const expected = vectors(positions);
      for (const [index, [red, green, blue]] of vectors(colors!).entries()) {
        const [x, y] = expected[index]!;
        expect(red).toBeCloseTo((x + 5) / 10, 5);
        expect(green).toBeCloseTo((y + 5) / 10, 5);
        expect(blue).toBeCloseTo(0.25, 5);
      }
    });

    it('keeps normals the model authored', async () => {
      // At 60° an octagonal prism's sides are smooth; the kernel's 30° would facet them.
      const primitives = await renderTriangles(`
        import { GLTFNode, Manifold } from 'manifold-3d/manifoldCAD';
        export default () => {
          const node = new GLTFNode();
          node.manifold = Manifold.cylinder(10, 5, -1, 8, true).calculateNormals(0, 60);
          node.material = { attributes: ['NORMAL'] };
          return node;
        };
      `);
      expectUnitNormals(primitives);
      const [{ positions, normals }] = primitives as [TrianglePrimitive];
      const sides = vectors(normals!)
        .map((normal, index) => ({ normal, position: vectors(positions)[index]! }))
        .filter(({ normal }) => Math.abs(normal[2]) < 0.5);
      expect(sides.length).toBeGreaterThan(0);
      for (const { normal, position } of sides) {
        const radius = Math.hypot(position[0], position[1]);
        expect(normal[0]).toBeCloseTo(position[0] / radius, 4);
        expect(normal[1]).toBeCloseTo(position[1] / radius, 4);
      }
    });

    it('gives a cross-section its plane normal', async () => {
      const primitives = await renderTriangles(`
        import { CrossSection } from 'manifold-3d/manifoldCAD';
        export default () => CrossSection.square([10, 10], true).subtract(CrossSection.circle(3, 32));
      `);
      expectUnitNormals(primitives);
      for (const normal of vectors(primitives[0]!.normals!)) {
        expect(normal).toEqual([0, 0, 1]);
      }
    });

    it('exports show() debug views as authored', async () => {
      // The manifold-3d writer emits the captured debug mesh with the run's labels, which a NORMAL label would overrun.
      const primitives = await renderTriangles(`
        import { Manifold, show } from 'manifold-3d/manifoldCAD';
        export default () => Manifold.cube([20, 20, 5], true).add(show(Manifold.cylinder(10, 3, -1, 16, true)));
      `);
      expect(primitives.length).toBeGreaterThan(0);
      expect(primitives.every(({ normals }) => normals === undefined)).toBe(true);
    });
  });

  describe('exportGeometry', () => {
    it('should export GLB after successful geometry creation', async () => {
      const client = createClient({
        'cube.ts': `
          import { Manifold } from 'manifold-3d/manifoldCAD';

          export default function main() {
            return Manifold.cube([10, 10, 10], true);
          }
        `,
      });

      const exportResult = await client.open({ source: { path: 'cube.ts' }, watch: false }).export('glb');
      expect(exportResult.success).toBe(true);
      if (exportResult.success) {
        expect(exportResult.files[0].bytes).toBeInstanceOf(Uint8Array);
        const { nodeNames, meshNames } = await readGltfNodeMeshNames(exportResult.files[0].bytes);
        expect(nodeNames).toEqual(['Shape 1']);
        expect(meshNames).toEqual(['Shape 1']);
      }
    });

    it('should convert asymmetric GLB geometry from z-up millimeters to y-up meters exactly once', async () => {
      const client = createClient({
        'coordinate-evidence.ts': `
          import { Manifold } from 'manifold-3d/manifoldCAD';

          export default function main() {
            return Manifold.cube([10, 20, 30], false).translate([7, 11, 13]);
          }
        `,
      });
      const document = client.open({ source: { path: 'coordinate-evidence.ts' }, watch: false });
      const zUp = await document.export('glb', {
        options: { coordinateSystem: 'z-up', unit: { length: 'millimeter' } },
      });
      const yUp = await document.export('glb', {
        options: { coordinateSystem: 'y-up', unit: { length: 'meter' } },
      });
      expect(zUp.success).toBe(true);
      expect(yUp.success).toBe(true);
      if (!zUp.success || !yUp.success) {
        return;
      }

      const zUpEvidence = await readCoordinateEvidence({ bytes: zUp.files[0].bytes });
      const yUpEvidence = await readCoordinateEvidence({ bytes: yUp.files[0].bytes });
      expect(yUpEvidence).toEqual(mapZupMillimetersToYupMeters(zUpEvidence));
    });

    it('should export an empty GLB after an empty render', async () => {
      const client = createClient({
        'empty.ts': `
          import 'manifold-3d/manifoldCAD';

          export default function main() {
            return [];
          }
        `,
      });

      const exportResult = await client.open({ source: { path: 'empty.ts' }, watch: false }).export('glb');
      expect(exportResult.success).toBe(true);
      if (!exportResult.success) {
        return;
      }

      const document = await new NodeIO().readBinary(exportResult.files[0].bytes);
      expect(document.getRoot().listMeshes()).toHaveLength(0);
    });

    it('should return error for unsupported gltf format', async () => {
      const client = createClient({
        'cube.ts': `
          import { Manifold } from 'manifold-3d/manifoldCAD';

          export default function main() {
            return Manifold.cube([10, 10, 10], true);
          }
        `,
      });

      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- deliberately bypasses the typed format union to test wire rejection.
      const exportResult = await client.open({ source: { path: 'cube.ts' }, watch: false }).export('gltf' as 'glb');
      expect(exportResult.success).toBe(false);
      if (!exportResult.success) {
        expect(exportResult.issues[0]?.message).toContain('gltf');
      }
    });

    it('should reject export from a failed source without reusing earlier geometry', async () => {
      const client = createClient({
        'cube.ts': `
          import { Manifold } from 'manifold-3d/manifoldCAD';

          export default function main() {
            return Manifold.cube([10, 10, 10], true);
          }
        `,
      });

      const document = client.open({ source: { path: 'missing.ts' }, watch: false });
      const result = await document.export('glb');
      expect(result.success).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
    });

    it('should return error for unsupported export formats', async () => {
      const client = createClient({
        'cube.ts': `
          import { Manifold } from 'manifold-3d/manifoldCAD';

          export default function main() {
            return Manifold.cube([10, 10, 10], true);
          }
        `,
      });

      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- deliberately bypasses the typed format union to test wire rejection.
      const exportResult = await client.open({ source: { path: 'cube.ts' }, watch: false }).export('step' as 'glb');
      expect(exportResult.success).toBe(false);
    });
  });

  describe('native-handle snapshots', () => {
    it('should round-trip GLB bytes through the durable native-handle hooks', async () => {
      const definition = await resolveRuntimePluginDefinition('kernel', manifoldKernel());
      expect(definition.serializeHandle).toBeDefined();
      expect(definition.deserializeHandle).toBeDefined();

      const nativeHandle = { glb: new Uint8Array([0x67, 0x6c, 0x54, 0x46]) };
      const runtime = createMockKernelRuntime();
      const { serializeHandle, deserializeHandle } = definition;
      const serialize =
        serializeHandle ??
        (() => {
          throw new Error('Manifold native-handle serializer must be defined');
        });
      const deserialize =
        deserializeHandle ??
        (() => {
          throw new Error('Manifold native-handle deserializer must be defined');
        });
      const context = { manifoldCadModule: {} };
      const serializedHandle = serialize({ handle: nativeHandle }, runtime, context);
      const restored = deserialize({ serialized: serializedHandle }, runtime, context);

      expect(restored.glb).toEqual(nativeHandle.glb);
      expect(restored.glb).not.toBe(nativeHandle.glb);
      expect(serializedHandle.glb).not.toBe(nativeHandle.glb);
    });
  });
});
