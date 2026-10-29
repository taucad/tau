// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { KernelFileSystem } from '@taucad/runtime/kernel';
import { FileSystemManager } from '#filesystem-manager.js';
import type { ExportOptions } from '#kcl-utils.js';
import { KclUtilities } from '#kcl-utils.js';
import { OfflineEngineConnection } from '#offline/offline-engine-connection.js';
import { compound, massProperties } from '#offline/offline-occt.js';
import { enrichZooGltfTopology } from '#zoo-gltf-topology.utils.js';
import type { Oc } from '#offline/offline-occt.js';

const source = `
profile = startSketchOn(XY)
  |> startProfile(at = [0, 0])
  |> line(end = [10, 0])
  |> line(end = [0, 10])
  |> line(end = [-10, 0])
  |> close()
box = extrude(profile, length = 10)
hole = startSketchOn(XY)
  |> circle(center = [5, 5], radius = 2)
  |> extrude(length = 10)
part = subtract([box], tools = [hole])
`;

const memoryFs = (): KernelFileSystem =>
  ({
    async readFile() {
      return new TextEncoder().encode(source);
    },
    async exists() {
      return true;
    },
    async readdir() {
      return ['main.kcl'];
    },
  }) as unknown as KernelFileSystem;

const text = (bytes: Uint8Array<ArrayBuffer>): string => new TextDecoder().decode(bytes);

describe('offline KCL execution', () => {
  const utils = new KclUtilities({
    baseUrl: 'ws://offline',
    mode: 'offline',
    fileSystemManager: new FileSystemManager(memoryFs()),
  });

  beforeAll(async () => {
    await utils.initializeEngine();
    const { program, errors } = await utils.parseKcl(source);
    expect(errors).toEqual([]);
    const outcome = await utils.executeProgram(program, 'main.kcl');
    expect(outcome.errors).toEqual([]);
  }, 120_000);

  afterAll(async () => {
    await utils.cleanup();
  });

  it('builds the solid with libcascade, without a WebSocket', async () => {
    const engine = utils.offlineConnection?.engine;
    expect(engine).toBeDefined();
    const solids = engine!.scene.visibleSolids();
    expect(solids).toHaveLength(1);
    const oc = await (OfflineEngineConnection as unknown as { occt: Promise<Oc> }).occt;
    // The default loader is the package's own build, which carries the native helpers.
    expect((oc as unknown as { TauOffline?: unknown }).TauOffline).toBeDefined();
    const { volume } = massProperties(
      oc,
      compound(
        oc,
        solids.map((solid) => solid.shape),
      ),
    );
    expect(volume).toBeCloseTo(1000 - Math.PI * 4 * 10, 3);
  });

  it('writes B-rep topology the Zoo enrichment binds faces to', async () => {
    const [file] = await utils.exportFromMemory({
      type: 'gltf',
      storage: 'binary',
    });
    const enriched = await enrichZooGltfTopology(file!.contents, {
      format: 'glb',
    });
    const view = new DataView(enriched.buffer, enriched.byteOffset);
    const jsonLength = view.getUint32(12, true);
    const json = JSON.parse(text(enriched.subarray(20, 20 + jsonLength))) as {
      bufferViews: Array<{ byteOffset?: number; byteLength: number }>;
      extensions: { TAU_cad_topology: { topologyBufferView: number } };
    };
    const payloadView = json.bufferViews[json.extensions.TAU_cad_topology.topologyBufferView]!;
    const bin = enriched.subarray(28 + jsonLength);
    const offset = payloadView.byteOffset ?? 0;
    const payload = JSON.parse(text(bin.subarray(offset, offset + payloadView.byteLength))) as {
      components: Array<{ kind: string }>;
      warnings: unknown[];
    };
    expect(payload.warnings).toEqual([]);
    // Six box faces and the hole's cylinder.
    expect(payload.components.filter((component) => component.kind === 'body')).toHaveLength(1);
    expect(payload.components.filter((component) => component.kind === 'face')).toHaveLength(7);
  });

  it.each<[string, ExportOptions, (files: Array<{ name: string; contents: Uint8Array<ArrayBuffer> }>) => void]>([
    [
      'STEP',
      { type: 'step' },
      ([file]) => {
        expect(text(file!.contents)).toMatch(/^ISO-10303-21;/);
        expect(text(file!.contents)).toContain('MANIFOLD_SOLID_BREP');
      },
    ],
    [
      'binary STL',
      { type: 'stl', storage: 'binary' },
      ([file]) => {
        const view = new DataView(file!.contents.buffer, file!.contents.byteOffset);
        const triangles = view.getUint32(80, true);
        expect(triangles).toBeGreaterThan(10);
        expect(file!.contents.byteLength).toBe(84 + triangles * 50);
      },
    ],
    [
      'ASCII STL',
      { type: 'stl', storage: 'ascii' },
      ([file]) => {
        expect(text(file!.contents)).toMatch(/^solid/);
        expect(text(file!.contents)).toContain('facet normal');
      },
    ],
    [
      'OBJ',
      { type: 'obj' },
      (files) => {
        const objectFile = files.find((file) => file.name.endsWith('.obj'));
        expect(text(objectFile!.contents)).toMatch(/^v /m);
        expect(text(objectFile!.contents)).toMatch(/^f /m);
      },
    ],
    [
      'PLY',
      { type: 'ply' },
      ([file]) => {
        expect(text(file!.contents.subarray(0, 200))).toMatch(/^ply/);
      },
    ],
    [
      'glTF binary',
      { type: 'gltf', storage: 'binary' },
      ([file]) => {
        expect(text(file!.contents.subarray(0, 4))).toBe('glTF');
        const jsonLength = new DataView(file!.contents.buffer, file!.contents.byteOffset).getUint32(12, true);
        const json = JSON.parse(text(file!.contents.subarray(20, 20 + jsonLength))) as {
          meshes: Array<{ primitives: Array<{ mode?: number; extras?: { edgeGroups?: unknown[] } }> }>;
        };
        const lines = json.meshes.flatMap((mesh) => mesh.primitives).filter((primitive) => primitive.mode === 1);
        // A box with a through hole: 12 box edges, plus two circles and the cylinder's seam.
        expect(lines).toHaveLength(1);
        expect(lines[0]!.extras?.edgeGroups?.length).toBeGreaterThanOrEqual(15);
      },
    ],
    [
      'glTF embedded',
      { type: 'gltf', storage: 'embedded' },
      ([file]) => {
        const json = JSON.parse(text(file!.contents)) as { buffers: Array<{ uri: string }>; meshes: unknown[] };
        expect(json.meshes.length).toBeGreaterThan(0);
        expect(json.buffers[0]!.uri).toMatch(/^data:application\/octet-stream;base64,/);
      },
    ],
  ])('exports %s through libcascade', async (_name, options, check) => {
    const files = await utils.exportFromMemory(options);
    expect(files.length).toBeGreaterThan(0);
    check(files);
  });
});
