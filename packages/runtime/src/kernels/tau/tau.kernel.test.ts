import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { NodeIO } from '@gltf-transform/core';
import { importToGlb } from '@taucad/converter';
import type { GeometryGltf, GeometryResponse } from '@taucad/types';
import type {
  KernelRuntime,
  GetDependenciesInput,
  GetParametersInput,
  CreateGeometryInput,
} from '#types/runtime-kernel.types.js';
import { createMockKernelRuntime } from '#testing/kernel-testing.utils.js';
import { tau as tauKernel } from '#kernels/tau/tau.kernel.js';
import { resolveRuntimePluginDefinition } from '#plugins/plugin-runtime-definition.js';
import { writeGlb } from '#utils/glb-writer.js';
import type { GlbPrimitive } from '#utils/glb-writer.js';

vi.mock('@taucad/converter', () => ({
  importToGlb: vi.fn(),
}));

const stepBytes = new Uint8Array([0x53, 0x54, 0x45, 0x50]);

const createTrianglePrimitive = (): GlbPrimitive => ({
  mode: 4,
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
  indices: new Uint32Array([0, 1, 2]),
  material: {
    baseColorFactor: [1, 1, 1, 1],
    metallicFactor: 0,
    roughnessFactor: 1,
    doubleSided: true,
    alphaMode: 'OPAQUE',
  },
});

const createNamedGlb = async (
  options: { nodeName?: string; materialName?: string; sceneName?: string } = {},
): Promise<Uint8Array<ArrayBuffer>> => {
  const primitive = createTrianglePrimitive();
  const glb = writeGlb({
    nodes: [
      {
        ...(options.nodeName ? { name: options.nodeName } : {}),
        primitives: [
          {
            ...primitive,
            material: {
              ...primitive.material,
              ...(options.materialName ? { name: options.materialName } : {}),
            },
          },
        ],
      },
    ],
  });

  if (!options.sceneName) {
    return glb;
  }

  const io = new NodeIO();
  const document = await io.readBinary(glb);
  document.getRoot().listScenes()[0]!.setName(options.sceneName);
  return io.writeBinary(document);
};

const readNodeMeshNames = async (
  glbBytes: Uint8Array<ArrayBuffer>,
): Promise<{ nodeNames: string[]; meshNames: string[]; materialNames: string[]; sceneNames: string[] }> => {
  const document = await new NodeIO().readBinary(glbBytes);
  return {
    nodeNames: document
      .getRoot()
      .listNodes()
      .map((node) => node.getName()),
    meshNames: document
      .getRoot()
      .listMeshes()
      .map((mesh) => mesh.getName()),
    materialNames: document
      .getRoot()
      .listMaterials()
      .map((material) => material.getName()),
    sceneNames: document
      .getRoot()
      .listScenes()
      .map((scene) => scene.getName()),
  };
};

const findGltfGeometryContent = (geometry: GeometryResponse): Uint8Array<ArrayBuffer> => {
  expect(geometry.format).toBe('gltf');
  return (geometry as GeometryGltf).content;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TauKernel', () => {
  const resolveTauDefinition = async () => resolveRuntimePluginDefinition('kernel', tauKernel());
  let tauDefinition: Awaited<ReturnType<typeof resolveTauDefinition>>;

  beforeAll(async () => {
    tauDefinition = await resolveTauDefinition();
  });

  describe('getDependencies', () => {
    it('should return array containing the input filePath', async () => {
      const result = await tauDefinition.getDependencies(
        mock<GetDependenciesInput>({ filePath: '/models/part.step' }),
        mock<KernelRuntime>(),
        {},
      );
      expect(result).toEqual({ resolved: ['/models/part.step'], unresolved: [] });
    });
  });

  describe('getParameters', () => {
    it('should return empty default parameters and empty JSON schema', async () => {
      const result = await tauDefinition.getParameters(mock<GetParametersInput>(), mock<KernelRuntime>(), {});
      expect(result).toEqual({
        success: true,
        data: {
          defaultParameters: {},
          jsonSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
        },
        issues: [],
      });
    });
  });

  describe('initialize', () => {
    it('should resolve with empty config', async () => {
      const result = await tauDefinition.initialize({}, mock<KernelRuntime>());
      expect(result).toEqual({});
    });
  });

  describe('createGeometry', () => {
    it('should call importToGlb with file content and return geometry with gltf format', async () => {
      const converterMaterialName = ['Material', 'Default'].join('_');
      const glbData = await createNamedGlb({
        nodeName: 'Geometry',
        materialName: converterMaterialName,
        sceneName: 'Scene',
      });
      vi.mocked(importToGlb).mockResolvedValue(glbData);

      const runtime = createMockKernelRuntime({
        filesystemOverrides: { readFileResult: stepBytes },
      });

      const result = await tauDefinition.createGeometry(
        mock<CreateGeometryInput>({ filePath: '/models/part.step', basePath: '/models', options: {} }),
        runtime,
        {},
      );

      /* oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() returns any for matchers */
      expect(importToGlb).toHaveBeenCalledWith(
        /* oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() matcher */
        [{ name: 'part.step', bytes: expect.any(Uint8Array) }],
        'step',
        /* oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() matcher */
        expect.objectContaining({ exists: expect.any(Function), readFile: expect.any(Function) }),
      );
      const gltfContent = findGltfGeometryContent(result.geometry);
      const { nodeNames, meshNames, materialNames, sceneNames } = await readNodeMeshNames(gltfContent);
      expect(nodeNames).toEqual(['Shape 1']);
      expect(meshNames).toEqual(['Shape 1']);
      expect(materialNames).toEqual(['']);
      expect(sceneNames).toEqual(['']);
      expect(result.nativeHandle).toEqual(gltfContent);
    });

    it('should preserve nonblank names for imported glTF-family files', async () => {
      const authoredMaterialName = ['Material', 'Default'].join('_');
      const glbData = await createNamedGlb({
        nodeName: 'Shape_0',
        materialName: authoredMaterialName,
        sceneName: 'Scene',
      });
      vi.mocked(importToGlb).mockResolvedValue(glbData);

      const runtime = createMockKernelRuntime({
        filesystemOverrides: { readFileResult: glbData },
      });

      const result = await tauDefinition.createGeometry(
        mock<CreateGeometryInput>({ filePath: '/models/part.glb', basePath: '/models', options: {} }),
        runtime,
        {},
      );

      const gltfContent = findGltfGeometryContent(result.geometry);
      const { nodeNames, meshNames, materialNames, sceneNames } = await readNodeMeshNames(gltfContent);
      expect(nodeNames).toEqual(['Shape_0']);
      expect(meshNames).toEqual(['Shape_0']);
      expect(materialNames).toEqual([authoredMaterialName]);
      expect(sceneNames).toEqual(['Scene']);
    });

    it('should throw with structured issues when importToGlb fails', async () => {
      vi.mocked(importToGlb).mockRejectedValue(new Error('conversion failed'));

      const runtime = createMockKernelRuntime({
        filesystemOverrides: { readFileResult: stepBytes },
      });

      try {
        await tauDefinition.createGeometry(
          mock<CreateGeometryInput>({ filePath: '/models/part.step', basePath: '/models', options: {} }),
          runtime,
          {},
        );
        expect.fail('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('conversion failed');
        expect((error as { issues: Array<{ message: string }> }).issues).toBeDefined();
        expect((error as { issues: Array<{ message: string }> }).issues[0]!.message).toBe('conversion failed');
      }
    });
  });

  describe('exportGeometry', () => {
    it('should return GLB file when format is glb', async () => {
      const runtime = createMockKernelRuntime();
      const nativeHandle = await createNamedGlb();

      const result = await tauDefinition.exportGeometry({ format: 'glb', options: {}, nativeHandle }, runtime, {});

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0]!.name).toBe('model.glb');
        expect(result.data[0]!.mimeType).toBe('model/gltf-binary');
        expect(result.data[0]!.bytes.byteLength).toBeGreaterThan(0);
      }
    });

    it('should return glTF file when format is gltf', async () => {
      const runtime = createMockKernelRuntime();
      const nativeHandle = await createNamedGlb();

      const result = await tauDefinition.exportGeometry({ format: 'gltf', options: {}, nativeHandle }, runtime, {});

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0]!.name).toBe('model.gltf');
      }
    });

    it('should reject unsupported formats with error result', async () => {
      const runtime = createMockKernelRuntime();
      const nativeHandle = new Uint8Array([1, 2, 3]);

      const result = await tauDefinition.exportGeometry(
        { format: 'stl' as 'glb', options: {}, nativeHandle },
        runtime,
        {},
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.issues[0]!.message).toContain('Use a transcoder');
      }
    });

    it('should return error result when nativeHandle is empty', async () => {
      const runtime = createMockKernelRuntime();

      const result = await tauDefinition.exportGeometry(
        { format: 'glb', options: {}, nativeHandle: new Uint8Array(0) },
        runtime,
        {},
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.issues[0]!.message).toContain('No geometry available');
      }
    });
  });

  describe('native-handle snapshots', () => {
    it('should round-trip GLB bytes through the durable native-handle hooks', () => {
      expect(tauDefinition.serializeNativeHandle).toBeDefined();
      expect(tauDefinition.deserializeNativeHandle).toBeDefined();

      const nativeHandle = new Uint8Array([0x67, 0x6c, 0x54, 0x46]);
      const runtime = createMockKernelRuntime();
      const { serializeNativeHandle, deserializeNativeHandle } = tauDefinition;
      const serialize =
        serializeNativeHandle ??
        (() => {
          throw new Error('Tau native-handle serializer must be defined');
        });
      const deserialize =
        deserializeNativeHandle ??
        (() => {
          throw new Error('Tau native-handle deserializer must be defined');
        });
      const serializedNativeHandle = serialize({ nativeHandle }, runtime, {});
      const restored = deserialize({ serializedNativeHandle }, runtime, {});

      expect(restored).toEqual(nativeHandle);
      expect(restored).not.toBe(nativeHandle);
      expect(serializedNativeHandle).not.toBe(nativeHandle);
    });
  });
});
