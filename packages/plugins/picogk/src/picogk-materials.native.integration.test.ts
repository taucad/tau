// @vitest-environment node
/* oxlint-disable typescript/no-unsafe-assignment -- Private kernel context is erased by the public plugin definition. */
import { mkdirSync, writeFileSync, readFileSync, realpathSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { geometryCache } from '@taucad/middleware';
import { createRuntimeClient } from '@taucad/runtime/client';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { createSqliteComputeEngine, fromSqlite } from '@taucad/runtime/node';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { createNodeIo, srgbToLinear } from '@taucad/geometry-core';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import { mock } from 'vitest-mock-extended';
import { defineRuntime } from '@taucad/runtime/worker';
import {
  assertSuccess,
  createMockKernelRuntime,
  createTestRuntimeClient,
  extractGltfFromResult,
} from '@taucad/runtime-testing';
import { describe, expect, it, vi } from 'vitest';
import { loadPicogkKernelOptions, picogkKernel } from '#index.js';
import { PicogkSession } from '#picogk-session.js';
import { picogkBuildSchema, picogkProtocolVersion } from '#picogk.protocol.js';

const workspaceRoot = resolve(import.meta.dirname, '../../../..');
const options = loadPicogkKernelOptions({ resourceRoot: resolve(workspaceRoot, 'apps/desktop/resources/picogk') });
const runtime = defineRuntime({ kernels: [picogkKernel(options)] });
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=';
const fullMaterialSource = `using System.Numerics;
using PicoGK;
Library.Go(1f, () => {
 var viewer = Library.oViewer();
 var data = Convert.FromBase64String("${png}");
 var texture = new MaterialTexture {
   Image = new() { Data = data, Format = MaterialImageFormat.Png, Name = "Shared encoded image" },
   Sampler = new() { WrapS = MaterialWrap.MirroredRepeat, WrapT = MaterialWrap.ClampToEdge, MagFilter = MaterialMagFilter.Linear, MinFilter = MaterialMinFilter.LinearMipmapLinear },
   Transform = new() { Offset = new(.2f,.3f), Scale = new(2,3), Rotation = .4f }
 };
 var material = new Material {
   Name = "Full physical material", Color = new("B8733380"), Metallic = .8f, Roughness = .25f,
   ColorTexture = texture, MetallicRoughnessTexture = texture, NormalTexture = texture, NormalScale = .5f,
   OcclusionTexture = texture, OcclusionStrength = .4f, Emissive = new("804020"), EmissiveStrength = 2, EmissiveTexture = texture,
   AlphaMode = MaterialAlphaMode.Mask, AlphaCutoff = .4f, DoubleSided = false, Ior = 1.5f, Dispersion = .2f,
   Anisotropy = new() { Strength = .8f, Rotation = .3f, Texture = texture },
   Clearcoat = new() { Factor = .4f, Roughness = .2f, Texture = texture, RoughnessTexture = texture, NormalTexture = texture, NormalScale = .6f },
   Iridescence = new() { Factor = .2f, Texture = texture, ThicknessTexture = texture },
   Sheen = new() { Color = new("804020"), Roughness = .2f, ColorTexture = texture, RoughnessTexture = texture },
   Specular = new() { Factor = .9f, Color = new("804020"), Texture = texture, ColorTexture = texture },
   Transmission = new() { Factor = .3f, Texture = texture },
   Volume = new() { Thickness = .002f, AttenuationDistance = .25f, AttenuationColor = new("804020"), ThicknessTexture = texture }
 };
 viewer.Add(Utils.mshCreateCube(new Vector3(10,20,30)), "Textured box", 7);
 viewer.SetGroupMaterial(7, material);
 data[0] = 0; // The admitted image belongs to the viewer now.
 viewer.SetGroupMatrix(7, Matrix4x4.CreateScale(-1,2,3) * Matrix4x4.CreateTranslation(4,5,6));
 viewer.Add(Utils.mshCreateCube(new Vector3(10,10,10)), "Unlit box", 8);
 viewer.SetGroupMatrix(8, Matrix4x4.CreateTranslation(30,0,0));
 viewer.SetGroupMaterial(8, new Material { Name = "Unlit", Unlit = true, Color = new("224466") });
});`;

const parse = async (bytes: Uint8Array<ArrayBuffer>) => {
  const io = await createNodeIo();
  return { ...(await io.binaryToJSON(bytes)), document: await io.readBinary(bytes) };
};

describe('typed PicoGK materials through the production worker', () => {
  it('should receive full material metadata above 1 MiB through the production session', async () => {
    const root = realpathSync(await mkdtemp(join(tmpdir(), 'tau-picogk-large-response-')));
    const workspacePath = join(root, 'workspace');
    const artifactPath = join(root, 'artifacts');
    mkdirSync(workspacePath);
    mkdirSync(artifactPath);
    writeFileSync(
      join(workspacePath, 'main.cs'),
      `using System.Numerics;
using PicoGK;
Library.Go(1f, () => {
 var viewer = Library.oViewer();
 viewer.SetGroupMaterial(0, new Material {
   Name = "Machined steel fasteners and fittings", Color = new("AAB3BA"), Metallic = .95f, Roughness = .3f,
   Anisotropy = new() { Strength = .4f, Rotation = .2f },
   Clearcoat = new() { Factor = .2f, Roughness = .3f }, Ior = 1.5f
 });
 for (var index = 0; index < 2500; index++)
   viewer.Add(Utils.mshCreateCube(new Vector3(2,3,4)), $"Machined fastener {index}", 0);
});`,
    );
    const session = new PicogkSession({
      ...options,
      workspacePath,
      artifactPath,
      logger: createMockKernelRuntime().logger,
    });
    try {
      const result = await session.request({
        method: 'build',
        params: { entryPath: 'main.cs', parameters: {} },
        schema: picogkBuildSchema,
        signal: new AbortController().signal,
      });
      const bytes = Buffer.byteLength(
        JSON.stringify({ protocolVersion: picogkProtocolVersion, requestId: '1:1', result }),
      );
      expect(bytes).toBeGreaterThan(1024 * 1024);
      expect(bytes).toBeLessThan(4 * 1024 * 1024);
      expect(result.components).toHaveLength(2500);
      expect(result.components[2499]).toMatchObject({
        name: 'Machined fastener 2499',
        material: { name: 'Machined steel fasteners and fittings' },
      });
      expect(await session.readArtifact(result)).toHaveLength(result.byteLength);
    } finally {
      await session.cleanup();
      await rm(root, { recursive: true, force: true });
    }
  }, 60_000);

  it('preserves all factors, maps, shared resources, UV frames, exports and restored handles', async () => {
    const client = createTestRuntimeClient({ runtime, files: { 'main.cs': fullMaterialSource } });
    try {
      const rendered = await client.render({ source: { path: 'main.cs' } });
      if (rendered.superseded) {
        throw new Error('Unexpected superseded material render');
      }
      assertSuccess(rendered.geometry);
      const bytes = extractGltfFromResult(rendered.geometry)!;
      const { json, document } = await parse(bytes);
      const material = json.materials?.find((entry) => entry.name === 'Full physical material');
      expect(material?.alphaMode).toBe('MASK');
      expect(material?.alphaCutoff).toBeCloseTo(0.4);
      expect(material?.doubleSided).toBe(false);
      expect(material?.pbrMetallicRoughness?.baseColorFactor?.[0]).toBeCloseTo(srgbToLinear(0xb8 / 255), 5);
      const extensions = material?.extensions ?? {};
      expect(Object.keys(extensions)).toEqual(
        expect.arrayContaining([
          'KHR_materials_anisotropy',
          'KHR_materials_clearcoat',
          'KHR_materials_dispersion',
          'KHR_materials_emissive_strength',
          'KHR_materials_ior',
          'KHR_materials_iridescence',
          'KHR_materials_sheen',
          'KHR_materials_specular',
          'KHR_materials_transmission',
          'KHR_materials_volume',
        ]),
      );
      const rgb = [
        expect.closeTo(srgbToLinear(0x80 / 255), 6),
        expect.closeTo(srgbToLinear(0x40 / 255), 6),
        expect.closeTo(srgbToLinear(0x20 / 255), 6),
      ];
      /* eslint-disable @typescript-eslint/naming-convention -- Standard glTF extension keys are asserted verbatim. */
      expect(material).toMatchObject({
        emissiveFactor: rgb,
        alphaMode: 'MASK',
        alphaCutoff: expect.closeTo(0.4),
        doubleSided: false,
        pbrMetallicRoughness: {
          metallicFactor: expect.closeTo(0.8),
          roughnessFactor: expect.closeTo(0.25),
          baseColorFactor: [
            expect.closeTo(srgbToLinear(0xb8 / 255), 6),
            expect.closeTo(srgbToLinear(0x73 / 255), 6),
            expect.closeTo(srgbToLinear(0x33 / 255), 6),
            expect.closeTo(128 / 255, 6),
          ],
        },
        normalTexture: { scale: expect.closeTo(0.5) },
        occlusionTexture: { strength: expect.closeTo(0.4) },
        extensions: {
          KHR_materials_emissive_strength: { emissiveStrength: 2 },
          KHR_materials_ior: { ior: 1.5 },
          KHR_materials_dispersion: { dispersion: expect.closeTo(0.2) },
          KHR_materials_anisotropy: {
            anisotropyStrength: expect.closeTo(0.8),
            anisotropyRotation: expect.closeTo(0.3),
          },
          KHR_materials_clearcoat: {
            clearcoatFactor: expect.closeTo(0.4),
            clearcoatRoughnessFactor: expect.closeTo(0.2),
            clearcoatNormalTexture: { scale: expect.closeTo(0.6) },
          },
          KHR_materials_iridescence: {
            iridescenceFactor: expect.closeTo(0.2),
            iridescenceIor: expect.closeTo(1.3),
            iridescenceThicknessMinimum: 100,
            iridescenceThicknessMaximum: 400,
          },
          KHR_materials_sheen: { sheenColorFactor: rgb, sheenRoughnessFactor: expect.closeTo(0.2) },
          KHR_materials_specular: { specularFactor: expect.closeTo(0.9), specularColorFactor: rgb },
          KHR_materials_transmission: { transmissionFactor: expect.closeTo(0.3) },
          KHR_materials_volume: {
            thicknessFactor: expect.closeTo(0.002),
            attenuationDistance: 0.25,
            attenuationColor: rgb,
          },
        },
      });
      const slotOwners = [
        [material?.pbrMetallicRoughness, ['baseColorTexture', 'metallicRoughnessTexture']],
        [material, ['normalTexture', 'occlusionTexture', 'emissiveTexture']],
        [extensions['KHR_materials_anisotropy'], ['anisotropyTexture']],
        [
          extensions['KHR_materials_clearcoat'],
          ['clearcoatTexture', 'clearcoatRoughnessTexture', 'clearcoatNormalTexture'],
        ],
        [extensions['KHR_materials_iridescence'], ['iridescenceTexture', 'iridescenceThicknessTexture']],
        [extensions['KHR_materials_sheen'], ['sheenColorTexture', 'sheenRoughnessTexture']],
        [extensions['KHR_materials_specular'], ['specularTexture', 'specularColorTexture']],
        [extensions['KHR_materials_transmission'], ['transmissionTexture']],
        [extensions['KHR_materials_volume'], ['thicknessTexture']],
      ] as const;
      for (const [owner, keys] of slotOwners) {
        for (const key of keys) {
          expect((owner as Record<string, unknown>)[key], key).toMatchObject({
            index: 0,
            extensions: {
              KHR_texture_transform: {
                offset: [expect.closeTo(0.2), expect.closeTo(0.3)],
                scale: [2, 3],
                rotation: expect.closeTo(0.4),
              },
            },
          });
        }
      }
      /* eslint-enable @typescript-eslint/naming-convention -- Resume author-variable naming checks outside standard wire assertions. */
      expect(json.extensionsUsed).toContain('KHR_materials_unlit');
      expect(json.images).toHaveLength(1);
      expect(json.textures).toHaveLength(1);
      expect(json.samplers).toEqual([{ wrapS: 33_648, wrapT: 33_071, magFilter: 9729, minFilter: 9987 }]);
      expect(document.getRoot().listTextures()[0]?.getImage()).toEqual(new Uint8Array(Buffer.from(png, 'base64')));
      const primitive = document.getRoot().listMeshes()[0]!.listPrimitives()[0]!;
      const position = primitive.getAttribute('POSITION')!;
      const uv = primitive.getAttribute('TEXCOORD_0')!;
      const normal = primitive.getAttribute('NORMAL')!;
      const tangent = primitive.getAttribute('TANGENT')!;
      expect(uv.getCount()).toBe(position.getCount());
      expect(tangent.getCount()).toBe(position.getCount());
      const t = [0, 0, 0, 0];
      const n = [0, 0, 0];
      for (let index = 0; index < tangent.getCount(); index++) {
        tangent.getElement(index, t);
        normal.getElement(index, n);
        expect(Math.hypot(t[0]!, t[1]!, t[2]!)).toBeCloseTo(1, 5);
        expect(t[0]! * n[0]! + t[1]! * n[1]! + t[2]! * n[2]!).toBeCloseTo(0, 5);
        expect(Math.abs(t[3]!)).toBe(1);
      }
      const exported = await client.export('glb', {
        exportOptions: { coordinateSystem: 'z-up', unit: { length: 'millimeter' } },
      });
      assertSuccess(exported);
      const { json: millimeters } = await parse(exported.data[0]!.bytes);
      const volume = millimeters.materials?.find((entry) => entry.name === material?.name)?.extensions?.[
        'KHR_materials_volume'
      ];
      expect(volume).toMatchObject({ thicknessFactor: expect.closeTo(2), attenuationDistance: 250 });
      const gltf = await client.export('gltf');
      assertSuccess(gltf);
      const jsonExport: unknown = JSON.parse(new TextDecoder().decode(gltf.data[0]!.bytes));
      expect(jsonExport).toMatchObject({ images: expect.any(Array), textures: [{ source: 0, sampler: 0 }] });
      const io = await createNodeIo();
      const resolved = await io.readJSON({
        json: JSON.parse(new TextDecoder().decode(gltf.data[0]!.bytes)) as Awaited<
          ReturnType<typeof io.writeJSON>
        >['json'],
        resources: Object.fromEntries(gltf.data.slice(1).map(({ name, bytes: resource }) => [name, resource])),
      });
      expect(resolved.getRoot().listMeshes()).toHaveLength(2);
      expect(resolved.getRoot().listTextures()[0]?.getImage()).toEqual(new Uint8Array(Buffer.from(png, 'base64')));
      const definition = await resolveRuntimePluginDefinition('kernel', picogkKernel(options));
      const serialize = definition.serializeNativeHandle!;
      const serialized = serialize({ nativeHandle: { glb: bytes } }, createMockKernelRuntime(), mock());
      const freshDefinition = await resolveRuntimePluginDefinition('kernel', picogkKernel(options));
      const restored = freshDefinition.deserializeNativeHandle!(
        { serializedNativeHandle: structuredClone(serialized) },
        createMockKernelRuntime(),
        mock(),
      );
      const { json: restoredJson, document: restoredDocument } = await parse(restored.glb);
      expect(restoredJson.materials).toEqual(json.materials);
      expect(restoredJson.textures).toEqual(json.textures);
      expect(restoredDocument.getRoot().listTextures()[0]?.getImage()).toEqual(
        new Uint8Array(Buffer.from(png, 'base64')),
      );
      expect(
        restoredDocument.getRoot().listMeshes()[0]!.listPrimitives()[0]!.getAttribute('TEXCOORD_0')!.getArray(),
      ).toEqual(uv.getArray());
      expect(
        restoredDocument.getRoot().listMeshes()[0]!.listPrimitives()[0]!.getAttribute('TANGENT')!.getArray(),
      ).toEqual(tangent.getArray());
      const fixtureRoot = resolve(workspaceRoot, 'out/research/picogk-full-pbr/fixtures');
      mkdirSync(fixtureRoot, { recursive: true });
      writeFileSync(resolve(fixtureRoot, 'full-material.cs'), fullMaterialSource);
      writeFileSync(resolve(fixtureRoot, 'full-material.glb'), bytes);
    } finally {
      await client.shutdown();
    }
  }, 120_000);

  it('restores native materials in a fresh host from SQLite and invalidates changed image assets', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tau-picogk-pbr-cache-'));
    const plugin = picogkKernel(options);
    const definition = await resolveRuntimePluginDefinition('kernel', plugin);
    const build = vi.spyOn(definition, 'createGeometry');
    const restore = vi.spyOn(definition, 'deserializeNativeHandle');
    const cachedRuntime = defineRuntime({ kernels: [plugin], middleware: [geometryCache()] });
    const source = fullMaterialSource.replace(
      `Convert.FromBase64String("${png}")`,
      'System.IO.File.ReadAllBytes("map.png")',
    );
    const render = async (image: Uint8Array<ArrayBuffer>, format: 'glb' | 'gltf' = 'glb') => {
      const store = createSqliteComputeEngine({ directory });
      const client = createRuntimeClient({
        transport: inProcessTransport({
          runtime: cachedRuntime,
          fileSystem: fromMemoryFs(),
          compute: { mode: 'durable', store: fromSqlite({ store, workspace: 'picogk-pbr-cache' }) },
        }),
      });
      try {
        const result = await client.render({
          source: { entry: 'main.cs', files: { 'main.cs': source, 'map.png': image } },
        });
        if (result.superseded) {
          throw new Error('Unexpected superseded cached render');
        }
        assertSuccess(result.geometry);
        const exported = await client.export(format);
        assertSuccess(exported);
        if (format === 'glb') {
          return exported.data[0]!.bytes;
        }
        const io = await createNodeIo();
        const document = await io.readJSON({
          json: JSON.parse(new TextDecoder().decode(exported.data[0]!.bytes)) as Awaited<
            ReturnType<typeof io.writeJSON>
          >['json'],
          resources: Object.fromEntries(exported.data.slice(1).map(({ name, bytes }) => [name, bytes])),
        });
        return await io.writeBinary(document);
      } finally {
        await client.shutdown();
        await store.dispose();
      }
    };
    try {
      const original = new Uint8Array(Buffer.from(png, 'base64'));
      const first = await render(original);
      expect(build).toHaveBeenCalledTimes(1);
      const reopened = await render(original, 'gltf');
      expect(build).toHaveBeenCalledTimes(1);
      expect(restore).toHaveBeenCalledTimes(1);
      const baseline = await parse(first);
      const restored = await parse(reopened);
      const io = await createNodeIo();
      const normalized = await io.writeJSON(baseline.document);
      expect(restored.json.materials).toEqual(normalized.json.materials);
      expect(restored.document.getRoot().listTextures()[0]?.getImage()).toEqual(original);
      for (const attribute of ['POSITION', 'NORMAL', 'TEXCOORD_0', 'TANGENT']) {
        expect(
          restored.document.getRoot().listMeshes()[0]!.listPrimitives()[0]!.getAttribute(attribute)!.getArray(),
        ).toEqual(
          baseline.document.getRoot().listMeshes()[0]!.listPrimitives()[0]!.getAttribute(attribute)!.getArray(),
        );
      }
      const changed = new Uint8Array(
        Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAU0lEQVR4nO3SIQEAIAwF0UUhClGIQCRi0WZYwMOZE1Nf7ImLUnvuN0c77vUeAnDA74f3LoAH4BEKwAF4hAJwAB6hAByARygAB+ARCsABeIQCaMACMopMiEeoqxsAAAAASUVORK5CYII=',
          'base64',
        ),
      );
      const modified = await parse(await render(changed));
      expect(build).toHaveBeenCalledTimes(2);
      expect(modified.document.getRoot().listTextures()[0]?.getImage()).toEqual(changed);
      expect(modified.json.materials).toEqual(baseline.json.materials);
    } finally {
      build.mockRestore();
      restore.mockRestore();
      await rm(directory, { recursive: true, force: true });
    }
  }, 120_000);

  it('keeps UV phase under group transforms and preserves real JPEG and WebP images', async () => {
    const jpeg = new Uint8Array(readFileSync(resolve(workspaceRoot, 'apps/ui/public/textures/matcap-sculpt.jpg')));
    const webp = new Uint8Array(readFileSync(resolve(workspaceRoot, 'infra/seed/default-thumb.webp')));
    const source = `using PicoGK; using System.Numerics;
Library.Go(1f, () => { var viewer = Library.oViewer();
 var map = new MaterialTexture { Image = new() { Data = Convert.FromBase64String("${Buffer.from(jpeg).toString('base64')}"), Format = MaterialImageFormat.Jpeg } };
 var mat = new Material { NormalTexture = map, Anisotropy = new() { Strength=.5f }, Clearcoat=new() { Texture = new() { Image=new() { Data=Convert.FromBase64String("${Buffer.from(webp).toString('base64')}"),Format=MaterialImageFormat.WebP } } } };
 viewer.Add(Utils.mshCreateCube(new Vector3(10,20,30)),"Before",0);viewer.SetGroupMaterial(0,mat);
 var transformed = Utils.mshCreateCube(new Vector3(10,20,30));
 viewer.Add(transformed,"After",1);viewer.SetGroupMaterial(1,mat);
 viewer.SetObjectMatrix(transformed,Matrix4x4.CreateRotationX(.2f)*Matrix4x4.CreateTranslation(4,5,6));
 viewer.SetGroupMatrix(1,Matrix4x4.CreateScale(-1,2,3)*Matrix4x4.CreateRotationZ(.4f)*Matrix4x4.CreateTranslation(10,20,30));
});`;
    const client = createTestRuntimeClient({ runtime, files: { 'main.cs': source } });
    try {
      const result = await client.render({ source: { path: 'main.cs' } });
      if (result.superseded) {
        throw new Error('Unexpected superseded phase fixture');
      }
      assertSuccess(result.geometry);
      const { json, document } = await parse(extractGltfFromResult(result.geometry)!);
      expect(json.extensionsUsed).toContain('EXT_texture_webp');
      expect(json.images?.map(({ mimeType }) => mimeType)).toEqual(['image/jpeg', 'image/webp']);
      expect(
        document
          .getRoot()
          .listTextures()
          .map((texture) => texture.getImage()),
      ).toEqual([jpeg, webp]);
      const primitives = document
        .getRoot()
        .listMeshes()
        .map((mesh) => mesh.listPrimitives()[0]!);
      expect(primitives[1]!.getAttribute('TEXCOORD_0')!.getArray()).toEqual(
        primitives[0]!.getAttribute('TEXCOORD_0')!.getArray(),
      );
      expect(primitives[1]!.getAttribute('POSITION')!.getArray()).not.toEqual(
        primitives[0]!.getAttribute('POSITION')!.getArray(),
      );
      const before = primitives[0]!,
        after = primitives[1]!;
      const transformDirection = ([x, y, z]: number[]) => {
        // Undo canonical Y-up, apply the C# row-vector object then group matrices, restore Y-up.
        const cadY = -z!,
          cadZ = y!;
        const rotatedY = cadY * Math.cos(0.2) - cadZ * Math.sin(0.2);
        const rotatedZ = cadY * Math.sin(0.2) + cadZ * Math.cos(0.2);
        const scaleX = -x!,
          scaleY = rotatedY * 2,
          scaleZ = rotatedZ * 3;
        return [
          scaleX * Math.cos(0.4) - scaleY * Math.sin(0.4),
          scaleZ,
          -(scaleX * Math.sin(0.4) + scaleY * Math.cos(0.4)),
        ];
      };
      const cross = ([ax, ay, az]: number[], [bx, by, bz]: number[]) => [
        ay! * bz! - az! * by!,
        az! * bx! - ax! * bz!,
        ax! * by! - ay! * bx!,
      ];
      const dot = (a: number[], b: number[]) => a.reduce((sum, value, index) => sum + value * b[index]!, 0);
      const tangent = before.getAttribute('TANGENT')!,
        normal = before.getAttribute('NORMAL')!;
      for (let index = 0; index < tangent.getCount(); index++) {
        const sourceT = tangent.getElement(index, []) as number[],
          sourceN = normal.getElement(index, []) as number[];
        const targetT = after.getAttribute('TANGENT')!.getElement(index, []) as number[];
        const targetN = after.getAttribute('NORMAL')!.getElement(index, []) as number[];
        const derivative = transformDirection(sourceT);
        const projection = dot(derivative, targetN);
        const projected = derivative.map((value, axis) => value - targetN[axis]! * projection);
        const length = Math.hypot(...projected);
        for (const [axis, value] of projected.entries()) {
          expect(targetT[axis]).toBeCloseTo(value / length, 5);
        }
        const bitangent = transformDirection(cross(sourceN, sourceT).map((value) => value * sourceT[3]!));
        expect(targetT[3]).toBe(dot(cross(targetN, targetT), bitangent) < 0 ? -1 : 1);
      }
      const exported = await client.export('gltf');
      assertSuccess(exported);
      const io = await createNodeIo();
      const resolved = await io.readJSON({
        json: JSON.parse(new TextDecoder().decode(exported.data[0]!.bytes)) as Awaited<
          ReturnType<typeof io.writeJSON>
        >['json'],
        resources: Object.fromEntries(exported.data.slice(1).map(({ name, bytes }) => [name, bytes])),
      });
      expect(
        resolved
          .getRoot()
          .listTextures()
          .map((texture) => texture.getImage()),
      ).toEqual([jpeg, webp]);
    } finally {
      await client.shutdown();
    }
  }, 120_000);

  it('builds visibly textured and curved physical witnesses from native geometry', async () => {
    const source = `using PicoGK; using System.Numerics;
Library.Go(.5f, () => {
 var viewer = Library.oViewer();
 var texture = new MaterialTexture { Image = new() { Data = Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAU0lEQVR4nO3SIQEAIAwF0UUhClGIQCRi0WZYwMOZE1Nf7ImLUnvuN0c77vUeAnDA74f3LoAH4BEKwAF4hAJwAB6hAByARygAB+ARCsABeIQCaMACMopMiEeoqxsAAAAASUVORK5CYII="), Format = MaterialImageFormat.Png }, Transform = new() { Scale = new(2,2) } };
 viewer.Add(Voxels.voxSphere(new Vector3(-28,0,0), 12), "Checker sphere", 1);
 viewer.SetGroupMaterial(1, new Material { Name = "Textured clearcoat", ColorTexture = texture, Roughness = .25f, Clearcoat = new() { Factor = .7f, Roughness = .1f } });
 viewer.Add(Voxels.voxSphere(Vector3.Zero, 12), "Copper sphere", 2);
 viewer.SetGroupMaterial(2, new Material { Name = "Anisotropic copper", Color = new("B87333"), Metallic = 1, Roughness = .25f, Anisotropy = new() { Strength = .8f, Rotation = .5f } });
 viewer.Add(Voxels.voxSphere(new Vector3(28,0,0), 12), "Glass sphere", 3);
 viewer.SetGroupMaterial(3, new Material { Name = "Tinted glass", Roughness = .05f, Ior = 1.5f, Transmission = new() { Factor = 1 }, Volume = new() { Thickness = .024f, AttenuationDistance = .03f, AttenuationColor = new("70C0D0") }, Dispersion = .15f });
});`;
    const client = createTestRuntimeClient({ runtime, files: { 'main.cs': source } });
    try {
      const rendered = await client.render({ source: { path: 'main.cs' } });
      if (rendered.superseded) {
        throw new Error('Unexpected superseded witness render');
      }
      assertSuccess(rendered.geometry);
      const bytes = extractGltfFromResult(rendered.geometry)!;
      const { json } = await parse(bytes);
      expect(json.materials?.map((material) => material.name)).toEqual([
        'Textured clearcoat',
        'Anisotropic copper',
        'Tinted glass',
      ]);
      const fixtureRoot = resolve(workspaceRoot, 'out/research/picogk-full-pbr/fixtures');
      mkdirSync(fixtureRoot, { recursive: true });
      writeFileSync(resolve(fixtureRoot, 'browser-witness.cs'), source);
      writeFileSync(resolve(fixtureRoot, 'browser-witness.glb'), bytes);
    } finally {
      await client.shutdown();
    }
  }, 120_000);

  it.each([
    ['viewer.SetGroupMaterial(7, new Material { Roughness = -1 });', 'Roughness'],
    [
      'var line = new PolyLine("FFFFFF"); line.nAddVertex(Vector3.Zero); line.nAddVertex(Vector3.One); viewer.Add(line, 7); viewer.SetGroupMaterial(7, new Material { Anisotropy = new() });',
      'PolyLine',
    ],
  ])(
    'rejects invalid material with %s and recovery %s',
    async (body, expected) => {
      const client = createTestRuntimeClient({
        runtime,
        files: {
          'main.cs': `using PicoGK; using System.Numerics; Library.Go(1f, () => { var viewer = Library.oViewer(); ${body} });`,
        },
      });
      try {
        const rendered = await client.render({ source: { path: 'main.cs' } });
        if (rendered.superseded) {
          throw new Error('Unexpected superseded invalid material render');
        }
        expect(rendered.geometry.success).toBe(false);
        expect(JSON.stringify(rendered.geometry.issues)).toContain(expected);
        expect(JSON.stringify(rendered.geometry.issues)).toContain('Correct this property and retry');
      } finally {
        await client.shutdown();
      }
    },
    120_000,
  );
});
