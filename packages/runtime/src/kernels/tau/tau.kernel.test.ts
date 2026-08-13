/* eslint-disable @typescript-eslint/naming-convention -- test data uses virtual paths as object keys */
import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { NodeIO } from '@gltf-transform/core';
import { KHRMaterialsUnlit } from '@gltf-transform/extensions';
import { importToGlb } from '@taucad/converter';
import type * as Converter from '@taucad/converter';
import type { GeometryGltf, GeometryResponse } from '@taucad/types';
import type { KernelRuntime, GetDependenciesInput, GetParametersInput } from '#types/runtime-kernel.types.js';
import { createMockKernelRuntime } from '#testing/kernel-testing.utils.js';
import { tau as tauKernel } from '#kernels/tau/tau.kernel.js';
import { tauExportSchemas } from '#kernels/tau/tau.schemas.js';
import { resolveRuntimePluginDefinition } from '#plugins/plugin-runtime-definition.js';
import { writeGlb } from '#utils/glb-writer.js';
import type { GlbPrimitive } from '#utils/glb-writer.js';
import { readCoordinateEvidence } from '#testing/coordinate-testing.utils.js';

vi.mock('@taucad/converter', async (importOriginal) => ({
  ...(await importOriginal<typeof Converter>()),
  importToGlb: vi.fn(),
}));

const stepBytes = new Uint8Array([0x53, 0x54, 0x45, 0x50]);
const encode = (value: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(value);

const createInventoryRuntime = (
  files: Record<string, Uint8Array<ArrayBuffer>>,
  directories: ReadonlySet<string> = new Set(),
) => {
  const runtime = createMockKernelRuntime();
  runtime.filesystem.mocks.readdir.mockImplementation(async (directory) => {
    const prefix = directory === '/' ? '/' : `${directory}/`;
    return [
      ...new Set(
        [...Object.keys(files), ...directories].flatMap((path) => {
          if (!path.startsWith(prefix)) {
            return [];
          }
          const remainder = path.slice(prefix.length);
          return remainder.length > 0 && !remainder.includes('/') ? [remainder] : [];
        }),
      ),
    ].reverse();
  });
  runtime.filesystem.mocks.stat.mockImplementation(async (path) => {
    if (directories.has(String(path))) {
      return { type: 'directory', size: 0, mtimeMs: 0 };
    }
    const bytes = files[path];
    if (bytes) {
      return { type: 'file', size: bytes.byteLength, mtimeMs: 0 };
    }
    throw Object.assign(new Error(`missing ${path}`), { code: 'ENOENT' });
  });
  runtime.filesystem.mocks.readFile.mockImplementation(async (path) => {
    const bytes = files[path];
    if (!bytes) {
      throw Object.assign(new Error(`missing ${path}`), { code: 'ENOENT' });
    }
    return bytes;
  });
  return runtime;
};

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

const createTransformedCoordinateGlb = async (): Promise<Uint8Array<ArrayBuffer>> => {
  const primitive = createTrianglePrimitive();
  const linePrimitive: GlbPrimitive = {
    mode: 1,
    positions: new Float32Array([0.004, 0.005, 0.006, -0.007, 0.008, -0.009]),
    indices: new Uint32Array([0, 1]),
    material: {
      name: 'Authored Edge Material',
      baseColorFactor: [0.25, 0.5, 0.75, 1],
      metallicFactor: 0,
      roughnessFactor: 1,
      doubleSided: true,
      alphaMode: 'OPAQUE',
      extensions: { KHR_materials_unlit: {} },
    },
  };
  const glb = writeGlb({
    nodes: [
      {
        name: 'Authored Triangle',
        primitives: [
          {
            ...primitive,
            positions: new Float32Array([0, 0, 0, 0.01, 0, 0, 0, 0.02, -0.03]),
            normals: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]),
            material: { ...primitive.material, name: 'Authored Surface Material' },
          },
          linePrimitive,
        ],
      },
    ],
    extensionsUsed: ['KHR_materials_unlit'],
  });
  const io = new NodeIO().registerExtensions([KHRMaterialsUnlit]);
  const document = await io.readBinary(glb);
  const child = document.getRoot().listNodes()[0]!.setTranslation([0.007, 0.013, -0.011]);
  const parent = document.createNode('Authored Assembly').setTranslation([-0.002, 0.003, 0.005]).addChild(child);
  document.getRoot().listScenes()[0]!.addChild(parent);
  return io.writeBinary(document);
};

type Point3 = [number, number, number];
type CoordinateEvidence = Awaited<ReturnType<typeof readCoordinateEvidence>>;

const roundCoordinate = (value: number): number => {
  const rounded = Math.round(value * 1e6) / 1e6;
  return Object.is(rounded, -0) ? 0 : rounded;
};

const comparePoints = (left: Point3, right: Point3): number =>
  left[0] - right[0] || left[1] - right[1] || left[2] - right[2];

const mapCoordinateEvidence = (
  evidence: CoordinateEvidence,
  coordinateSystem: 'y-up' | 'z-up',
  scale: number,
): CoordinateEvidence => {
  const mapPoint = ([x, y, z]: Point3): Point3 =>
    coordinateSystem === 'z-up'
      ? [roundCoordinate(x * scale), roundCoordinate(-z * scale), roundCoordinate(y * scale)]
      : [roundCoordinate(x * scale), roundCoordinate(y * scale), roundCoordinate(z * scale)];
  const mapNormal = ([x, y, z]: Point3): Point3 =>
    coordinateSystem === 'z-up' ? [x, roundCoordinate(-z), roundCoordinate(y)] : [x, y, z];

  return evidence.map((primitive) => {
    const positions = primitive.positions.map(mapPoint).sort(comparePoints);
    const sum: Point3 = [0, 0, 0];
    for (const point of positions) {
      sum[0] += point[0];
      sum[1] += point[1];
      sum[2] += point[2];
    }
    const centroid = sum.map((value) => roundCoordinate(value / positions.length)) as Point3;
    return {
      ...primitive,
      centroid,
      normals: primitive.normals.map(mapNormal).sort(comparePoints),
      positions,
    };
  });
};

const readSceneEvidence = async (bytes: Uint8Array<ArrayBuffer>) => {
  const document = await new NodeIO().registerExtensions([KHRMaterialsUnlit]).readBinary(bytes);
  return {
    nodes: document
      .getRoot()
      .listNodes()
      .map((node) => ({ name: node.getName(), parent: node.getParentNode()?.getName() ?? '' }))
      .sort((left, right) => left.name.localeCompare(right.name)),
    primitives: document
      .getRoot()
      .listMeshes()
      .flatMap((mesh) =>
        mesh.listPrimitives().map((primitive) => ({
          mode: primitive.getMode(),
          material: primitive.getMaterial()?.getName() ?? '',
          color: primitive.getMaterial()?.getBaseColorFactor(),
          unlit: primitive.getMaterial()?.getExtension('KHR_materials_unlit') !== null,
        })),
      ),
  };
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

const findGltfGeometryContent = (geometry: GeometryResponse | undefined): Uint8Array<ArrayBuffer> => {
  expect(geometry?.format).toBe('gltf');
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
    it('should return array containing the input entryPath', async () => {
      const result = await tauDefinition.getDependencies(
        mock<GetDependenciesInput>({ entryPath: '/models/part.step' }),
        createMockKernelRuntime({ filesystemOverrides: { readFileResult: stepBytes } }),
        {},
      );
      expect(result).toEqual({ resolved: ['/models/part.step'], unresolved: [] });
    });

    it('discovers root glTF sidecars deterministically and skips sibling directories', async () => {
      const runtime = createInventoryRuntime(
        {
          '/main.gltf': encode(JSON.stringify({ buffers: [{ uri: 'mesh.bin' }], images: [{ uri: 'textures/a.png' }] })),
          '/mesh.bin': new Uint8Array([1]),
          '/readme.txt': encode('sibling input'),
          '/textures/a.png': new Uint8Array([2]),
        },
        new Set(['/textures']),
      );

      const result = await tauDefinition.getDependencies({ entryPath: '/main.gltf' }, runtime, {});

      expect(runtime.filesystem.mocks.readdir).toHaveBeenCalledExactlyOnceWith('/');
      expect(result).toEqual({
        resolved: ['/main.gltf', '/mesh.bin', '/readme.txt', '/textures/a.png'],
        unresolved: [],
      });
      expect(runtime.filesystem.mocks.readFile).not.toHaveBeenCalledWith('/textures');
    });

    it('reports missing referenced glTF sidecars as canonical unresolved dependencies', async () => {
      const runtime = createInventoryRuntime({
        '/models/main.gltf': encode(JSON.stringify({ buffers: [{ uri: '../shared/model.bin' }] })),
      });

      const result = await tauDefinition.getDependencies({ entryPath: '/models/main.gltf' }, runtime, {});

      expect(result).toEqual({
        resolved: ['/models/main.gltf'],
        unresolved: ['/shared/model.bin'],
      });
    });

    it.each(['../secret.bin', 'https://example.test/model.bin', String.raw`nested\model.bin`, '%E0%A4%A'])(
      'rejects incompatible root glTF URI %s before reading that path',
      async (uri) => {
        const runtime = createInventoryRuntime({
          '/main.gltf': encode(JSON.stringify({ buffers: [{ uri }] })),
        });

        await expect(tauDefinition.getDependencies({ entryPath: '/main.gltf' }, runtime, {})).rejects.toThrow();
        expect(runtime.filesystem.mocks.readFile).toHaveBeenCalledTimes(1);
      },
    );

    it('propagates non-not-found inventory failures', async () => {
      const runtime = createInventoryRuntime({ '/main.step': stepBytes });
      runtime.filesystem.mocks.stat.mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'EACCES' }));

      await expect(tauDefinition.getDependencies({ entryPath: '/main.step' }, runtime, {})).rejects.toMatchObject({
        code: 'EACCES',
      });
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

  describe('export schemas', () => {
    it('should preserve Y-up metre pass-through defaults while accepting explicit GLB transforms', () => {
      expect(tauExportSchemas.glb.parse({})).toEqual({
        coordinateSystem: 'y-up',
        unit: { length: 'meter' },
      });
      expect(
        tauExportSchemas.glb.parse({
          coordinateSystem: 'z-up',
          unit: { length: 'millimeter' },
        }),
      ).toEqual({
        coordinateSystem: 'z-up',
        unit: { length: 'millimeter' },
      });
      expect(tauExportSchemas.glb.safeParse({ unknown: true }).success).toBe(false);
      expect(tauExportSchemas.gltf.parse({ coordinateSystem: 'z-up' })).toEqual({});
    });
  });

  describe('createGeometry', () => {
    it('supplies the same referenced glTF URI keys that discovery identifies', async () => {
      const glbData = await createNamedGlb();
      const sidecar = new Uint8Array([7, 8, 9]);
      const runtime = createInventoryRuntime({
        '/models/main.gltf': encode(JSON.stringify({ images: [{ uri: 'textures/albedo.png' }] })),
        '/models/textures/albedo.png': sidecar,
      });
      vi.mocked(importToGlb).mockImplementation(async (_files, _format, resolver) => {
        expect(resolver?.exists('textures/albedo.png')).toBe(true);
        expect(resolver?.readFile('textures/albedo.png')).toEqual(sidecar);
        return glbData;
      });

      const dependencies = await tauDefinition.getDependencies({ entryPath: '/models/main.gltf' }, runtime, {});
      const result = await tauDefinition.createGeometry(
        {
          entryPath: '/models/main.gltf',
          parameters: {},
        },
        runtime,
        {},
      );

      expect(dependencies.resolved).toContain('/models/textures/albedo.png');
      expect(result.geometry?.format).toBe('gltf');
    });

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
        mock<Parameters<typeof tauDefinition.createGeometry>[0]>({
          entryPath: '/models/part.step',
          parameters: {},
        }),
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
        mock<Parameters<typeof tauDefinition.createGeometry>[0]>({
          entryPath: '/models/part.glb',
          parameters: {},
        }),
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

    it('should preserve asymmetric y-up geometry and node transforms at the import boundary', async () => {
      const glbData = await createTransformedCoordinateGlb();
      vi.mocked(importToGlb).mockResolvedValue(glbData);
      const runtime = createMockKernelRuntime({ filesystemOverrides: { readFileResult: glbData } });

      const result = await tauDefinition.createGeometry(
        mock<Parameters<typeof tauDefinition.createGeometry>[0]>({
          entryPath: '/models/part.glb',
          parameters: {},
        }),
        runtime,
        {},
      );

      const selectGeometry = async (bytes: Uint8Array<ArrayBuffer>) => {
        const evidence = await readCoordinateEvidence({ bytes });
        return evidence.map(({ centroid, normals, positions, winding }) => ({ centroid, normals, positions, winding }));
      };
      expect(await selectGeometry(findGltfGeometryContent(result.geometry))).toEqual(await selectGeometry(glbData));
      expect(await readSceneEvidence(findGltfGeometryContent(result.geometry))).toEqual(
        await readSceneEvidence(glbData),
      );
    });

    it('should throw with structured issues when importToGlb fails', async () => {
      vi.mocked(importToGlb).mockRejectedValue(new Error('conversion failed'));

      const runtime = createMockKernelRuntime({
        filesystemOverrides: { readFileResult: stepBytes },
      });

      try {
        await tauDefinition.createGeometry(
          mock<Parameters<typeof tauDefinition.createGeometry>[0]>({
            entryPath: '/models/part.step',
            parameters: {},
          }),
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
    it('should return the native GLB bytes unchanged for the default Y-up metre export', async () => {
      const runtime = createMockKernelRuntime();
      const nativeHandle = await createNamedGlb();

      const result = await tauDefinition.exportGeometry(
        { format: 'glb', options: { coordinateSystem: 'y-up', unit: { length: 'meter' } }, nativeHandle },
        runtime,
        {},
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0]!.name).toBe('model.glb');
        expect(result.data[0]!.mimeType).toBe('model/gltf-binary');
        expect(result.data[0]!.bytes).toEqual(nativeHandle);
      }
    });

    it.each([
      { coordinateSystem: 'y-up', unit: { length: 'meter' }, scale: 1 },
      { coordinateSystem: 'z-up', unit: { length: 'meter' }, scale: 1 },
      { coordinateSystem: 'y-up', unit: { length: 'millimeter' }, scale: 1000 },
      { coordinateSystem: 'z-up', unit: { length: 'millimeter' }, scale: 1000 },
    ] as const)(
      'should export asymmetric $coordinateSystem/$unit.length evidence exactly once',
      async ({ coordinateSystem, unit, scale }) => {
        const runtime = createMockKernelRuntime();
        const nativeHandle = await createTransformedCoordinateGlb();
        const sourceEvidence = await readCoordinateEvidence({ bytes: nativeHandle });
        const sourceScene = await readSceneEvidence(nativeHandle);

        const result = await tauDefinition.exportGeometry(
          { format: 'glb', options: { coordinateSystem, unit }, nativeHandle },
          runtime,
          {},
        );

        expect(result.success).toBe(true);
        if (result.success) {
          expect(await readCoordinateEvidence({ bytes: result.data[0]!.bytes })).toEqual(
            mapCoordinateEvidence(sourceEvidence, coordinateSystem, scale),
          );
          expect(await readSceneEvidence(result.data[0]!.bytes)).toEqual(sourceScene);
        }
      },
    );

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
        {
          format: 'stl' as 'glb',
          options: { coordinateSystem: 'y-up', unit: { length: 'meter' } },
          nativeHandle,
        },
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
        {
          format: 'glb',
          options: { coordinateSystem: 'y-up', unit: { length: 'meter' } },
          nativeHandle: new Uint8Array(0),
        },
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
