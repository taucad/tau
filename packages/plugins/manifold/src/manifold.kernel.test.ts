// @vitest-environment node
import { afterEach, describe, it, expect } from 'vitest';
import { NodeIO } from '@gltf-transform/core';
import type { JSONSchema7, GeometryResponse } from '@taucad/runtime/types';

import { manifoldKernel } from '#manifold.kernel.js';
import { esbuildBundler } from '@taucad/esbuild';
import {
  createMockKernelRuntime,
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
const testClients = new Set<ReturnType<typeof createTestRuntimeClient>>();
const createClient = (files: Record<string, string>) => {
  const client = createTestRuntimeClient({ runtime: testRuntime, files });
  testClients.add(client);
  return client;
};

afterEach(async () => {
  await Promise.all([...testClients].map(async (client) => client.shutdown()));
  testClients.clear();
});

const getParameters = async (
  files: Record<string, string>,
  mainFile: string,
): Promise<{
  jsonSchema: JSONSchema7;
  defaultParameters: Record<string, unknown>;
}> => getTestParameters({ runtime: testRuntime, files, mainFile });

const createGeometry = async (
  files: Record<string, string>,
  mainFile: string,
  parameters: Record<string, unknown> = {},
): ReturnType<typeof createTestGeometry> =>
  createTestGeometry({
    runtime: testRuntime,
    files,
    mainFile,
    parameters,
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

const extractGltfBytes = (result: { data: GeometryResponse }): Uint8Array<ArrayBuffer> => {
  if (result.data.format !== 'gltf') {
    throw new Error(`Expected GLTF geometry, received ${result.data.format}`);
  }
  return result.data.content;
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
  describe('getParameters', () => {
    it('should extract defaultParams from ESM module', async () => {
      const { defaultParameters, jsonSchema } = await getParameters(
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

      expect(defaultParameters).toEqual({ size: 20, centered: true });
      expect(jsonSchema).toMatchObject({
        type: 'object',
        properties: {
          size: { type: 'integer', default: 20 },
          centered: { type: 'boolean', default: true },
        },
      });
    });

    it('should extract defaultParameters alias', async () => {
      const { defaultParameters } = await getParameters(
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

      expect(defaultParameters).toEqual({ radius: 15 });
    });

    it('should return empty parameter defaults when none are exported', async () => {
      const { defaultParameters } = await getParameters(
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

      expect(defaultParameters).toEqual({});
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
        const outcome = await client.render({ source: { path: 'tracked.ts' }, parameters: {} });
        expect(outcome.superseded).toBe(false);
        if (!outcome.superseded) {
          await geometryHelpers.expectMeshCount(outcome.geometry, 1);
        }
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

      const exportResult = await client.export('glb', { source: { path: 'cube.ts' } });
      expect(exportResult.success).toBe(true);
      if (exportResult.success) {
        expect(exportResult.data[0]?.bytes).toBeInstanceOf(Uint8Array);
        const { nodeNames, meshNames } = await readGltfNodeMeshNames(exportResult.data[0]!.bytes);
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
      const zUp = await client.export('glb', {
        source: { path: 'coordinate-evidence.ts' },
        exportOptions: { coordinateSystem: 'z-up', unit: { length: 'millimeter' } },
      });
      const yUp = await client.export('glb', {
        source: { path: 'coordinate-evidence.ts' },
        exportOptions: { coordinateSystem: 'y-up', unit: { length: 'meter' } },
      });
      expect(zUp.success).toBe(true);
      expect(yUp.success).toBe(true);
      if (!zUp.success || !yUp.success) {
        return;
      }

      const zUpEvidence = await readCoordinateEvidence({ bytes: zUp.data[0]!.bytes });
      const yUpEvidence = await readCoordinateEvidence({ bytes: yUp.data[0]!.bytes });
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

      const exportResult = await client.export('glb', { source: { path: 'empty.ts' } });
      expect(exportResult.success).toBe(true);
      if (!exportResult.success) {
        return;
      }

      const document = await new NodeIO().readBinary(exportResult.data[0]!.bytes);
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
      const exportResult = await client.export('gltf' as 'glb', { source: { path: 'cube.ts' } });
      expect(exportResult.success).toBe(false);
      if (!exportResult.success) {
        expect(exportResult.issues[0]?.message).toContain('gltf');
      }
    });

    it('should return error when exporting before creating geometry', async () => {
      const client = createClient({
        'cube.ts': `
          import { Manifold } from 'manifold-3d/manifoldCAD';

          export default function main() {
            return Manifold.cube([10, 10, 10], true);
          }
        `,
      });

      await expect(client.export('glb')).rejects.toThrow();
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
      const exportResult = await client.export('step' as 'glb', { source: { path: 'cube.ts' } });
      expect(exportResult.success).toBe(false);
    });
  });

  describe('native-handle snapshots', () => {
    it('should round-trip GLB bytes through the durable native-handle hooks', async () => {
      const definition = await resolveRuntimePluginDefinition('kernel', manifoldKernel());
      expect(definition.serializeNativeHandle).toBeDefined();
      expect(definition.deserializeNativeHandle).toBeDefined();

      const nativeHandle = { glb: new Uint8Array([0x67, 0x6c, 0x54, 0x46]) };
      const runtime = createMockKernelRuntime();
      const { serializeNativeHandle, deserializeNativeHandle } = definition;
      const serialize =
        serializeNativeHandle ??
        (() => {
          throw new Error('Manifold native-handle serializer must be defined');
        });
      const deserialize =
        deserializeNativeHandle ??
        (() => {
          throw new Error('Manifold native-handle deserializer must be defined');
        });
      const context = { manifoldCadModule: {} };
      const serializedNativeHandle = serialize({ nativeHandle }, runtime, context);
      const restored = deserialize({ serializedNativeHandle }, runtime, context);

      expect(restored.glb).toEqual(nativeHandle.glb);
      expect(restored.glb).not.toBe(nativeHandle.glb);
      expect(serializedNativeHandle.glb).not.toBe(nativeHandle.glb);
    });
  });
});
