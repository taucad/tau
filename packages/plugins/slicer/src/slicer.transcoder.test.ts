import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Document, WebIO } from '@gltf-transform/core';
import type { MachineArtifactReference } from '@taucad/runtime/machine';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import type { TranscoderRuntime } from '@taucad/runtime/transcoder';
import type { ExportFile } from '@taucad/runtime/types';
import { unzipSync } from 'fflate';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { bambuPlateMember, readBambuContainer } from '#container.js';
import { slicerTranscoder } from '#slicer.transcoder.js';
import { parseGcode } from '#toolpath.js';
// The Bambu provider keeps its preflight private; this white-box import proves the container it admits.
/* oxlint-disable no-restricted-imports -- cross-package white-box acceptance check against @taucad/bambu's private preflight */
// eslint-disable-next-line @nx/enforce-module-boundaries -- same white-box check; @taucad/bambu exports no preflight subpath
import { prepareBambuArtifact } from '../../bambu/src/bambu.archive.js';
/* oxlint-enable no-restricted-imports -- white-box import ends */

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__');
const readGlb = (name: string): ExportFile => ({
  name,
  bytes: Uint8Array.from(readFileSync(join(fixtures, name))),
  mimeType: 'model/gltf-binary',
});
const sha256 = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex');
const createRuntime = (signal = new AbortController().signal): TranscoderRuntime =>
  mock<TranscoderRuntime>({
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    tracer: { startSpan: vi.fn(() => ({ end: vi.fn() })) },
    signal,
  });

/** Write a GLB in Tau's export convention (glTF Y-up metres) from Z-up millimetre vertices. */
const createGlb = async (
  vertices: ReadonlyArray<readonly [number, number, number]>,
  triangles: ReadonlyArray<readonly [number, number, number]>,
): Promise<ExportFile> => {
  const document = new Document();
  const buffer = document.createBuffer();
  const position = document
    .createAccessor()
    .setType('VEC3')
    .setArray(Float32Array.from(vertices.flatMap(([x, y, z]) => [x / 1000, z / 1000, -y / 1000])))
    .setBuffer(buffer);
  const indices = document
    .createAccessor()
    .setType('SCALAR')
    .setArray(Uint32Array.from(triangles.flat()))
    .setBuffer(buffer);
  const primitive = document.createPrimitive().setAttribute('POSITION', position).setIndices(indices);
  const mesh = document.createMesh('part').addPrimitive(primitive);
  const node = document.createNode('part').setMesh(mesh);
  document.createScene().addChild(node);
  return { name: 'part.glb', bytes: await new WebIO().writeBinary(document), mimeType: 'model/gltf-binary' };
};

const cubeVertices = (size: number): Array<readonly [number, number, number]> => [
  [-size / 2, -size / 2, 0],
  [size / 2, -size / 2, 0],
  [size / 2, size / 2, 0],
  [-size / 2, size / 2, 0],
  [-size / 2, -size / 2, size],
  [size / 2, -size / 2, size],
  [size / 2, size / 2, size],
  [-size / 2, size / 2, size],
];
const cubeTriangles: Array<readonly [number, number, number]> = [
  [0, 2, 1],
  [0, 3, 2],
  [4, 5, 6],
  [4, 6, 7],
  [0, 1, 5],
  [0, 5, 4],
  [1, 2, 6],
  [1, 6, 5],
  [2, 3, 7],
  [2, 7, 6],
  [3, 0, 4],
  [3, 4, 7],
];

const artifactFor = (bytes: Uint8Array<ArrayBuffer>, path: string): MachineArtifactReference => ({
  revision: {
    authorityId: 'authority',
    workspaceId: 'workspace',
    revisionId: 'revision' as MachineArtifactReference['revision']['revisionId'],
    treeDigest: `sha256:${sha256(new TextEncoder().encode('tree'))}` as MachineArtifactReference['digest'],
  },
  path,
  digest: `sha256:${sha256(bytes)}` as MachineArtifactReference['digest'],
  length: bytes.byteLength,
  mediaType: 'application/vnd.bambulab.gcode-3mf',
  contract: { id: 'manufacturing.toolpath.bambu-gcode-3mf', version: 1 },
  selectedMember: bambuPlateMember,
});

describe('slicerTranscoder', () => {
  const resolveDefinition = async () => resolveRuntimePluginDefinition('transcoder', slicerTranscoder());
  let definition: Awaited<ReturnType<typeof resolveDefinition>>;
  let context: Record<string, never>;

  beforeAll(async () => {
    definition = await resolveDefinition();
    context = (await definition.initialize({}, createRuntime())) as Record<string, never>;
  });

  const slice = async (file: ExportFile, options: Record<string, unknown> = {}, signal?: AbortSignal) =>
    definition.transcode({ from: 'glb', to: 'gcode.3mf', files: [file], options }, createRuntime(signal), context);

  it('should declare one glb → gcode.3mf edge', () => {
    expect(definition.edges.map(({ from, to, fidelity }) => ({ from, to, fidelity }))).toEqual([
      { from: 'glb', to: 'gcode.3mf', fidelity: 'mesh' },
    ]);
  });

  describe.each([
    {
      name: 'cube.glb',
      layers: 100,
      containerSha256: '6217a0436863a7a2a30e71de156b2de2236880c86a9bf791e4c58434f2ebe669',
      plateSha256: '42f02d13ddf0e7c89fc2c007bb1b6509e8c5160175ad6231a5cece23668aca46',
      segments: 5931,
      envelope: { max: 138, height: 20 },
    },
    {
      name: 'pyramid.glb',
      layers: 125,
      containerSha256: '9a961a730d3f852c82fe3932259b635073b4a556d161a43d2ef521e75643669e',
      plateSha256: '8fe2c3643e1270370b8a88cc8f6f3d6a698d0d899ce96f67b450c09388394f3c',
      segments: 5441,
      envelope: { max: 143, height: 25 },
    },
  ])('reference engine on $name', ({ name, layers, containerSha256, plateSha256, segments, envelope }) => {
    it('should produce a deterministic Bambu container the provider preflight admits', async () => {
      const result = await slice(readGlb(name));
      expect(result.success).toBe(true);
      if (!result.success) {
        return;
      }
      const [file] = result.data;
      expect(file).toMatchObject({ name: 'model.gcode.3mf', mimeType: 'application/vnd.bambulab.gcode-3mf' });
      expect(sha256(file!.bytes)).toBe(containerSha256);
      const plate = unzipSync(file!.bytes)[bambuPlateMember]!;
      expect(sha256(Uint8Array.from(plate))).toBe(plateSha256);
      expect(new TextDecoder().decode(plate)).toMatch(
        /^; generated by @taucad\/slicer reference engine\n(?:; tau:option [a-zA-Z]+=.*\n)+; tau:layer-count \d+\nM140 S55\nM104 S220\nG28\n/u,
      );
      await expect(
        prepareBambuArtifact({
          artifact: artifactFor(file!.bytes, `${name.slice(0, -4)}.gcode.3mf`),
          runtime: {
            async *readArtifact() {
              yield Uint8Array.from(file!.bytes);
            },
          },
          signal: new AbortController().signal,
        }),
      ).resolves.toMatchObject({
        length: file!.bytes.byteLength,
        memberMd5: createHash('md5').update(plate).digest('hex'),
      });
      expect(readBambuContainer(file!.bytes).md5Verified).toBe(true);
    });

    it('should parse back with the expected layers, segments and bounds inside the build volume', async () => {
      const result = await slice(readGlb(name));
      if (!result.success) {
        expect.fail(JSON.stringify(result.issues));
      }
      const program = parseGcode(readBambuContainer(result.data[0]!.bytes).gcode);
      expect(program.layerTable).toHaveLength(layers);
      expect(program.segmentCount).toBe(segments);
      expect(program.initialPosition).toBe('homed');
      expect(program.coverage).toMatchObject({ vendor: 0, unknown: 0, complete: true });
      for (const axis of [0, 1, 2]) {
        expect(program.bounds.min[axis]).toBeGreaterThanOrEqual(0);
        expect(program.bounds.max[axis]).toBeLessThanOrEqual(256);
      }
      // Extrusion above the purge stays inside the centred part's envelope, within one nozzle width of its walls.
      let maxX = -Infinity;
      let maxY = -Infinity;
      let maxZ = -Infinity;
      for (let index = 0; index < program.segmentCount; index += 1) {
        if (program.extrusion[index]! > 0 && program.layers[index]! > 0) {
          maxX = Math.max(maxX, program.positions[index * 6 + 3]!);
          maxY = Math.max(maxY, program.positions[index * 6 + 4]!);
          maxZ = Math.max(maxZ, program.positions[index * 6 + 5]!);
        }
      }
      expect(maxX).toBeGreaterThan(envelope.max - 0.4);
      expect(maxX).toBeLessThanOrEqual(envelope.max);
      expect(maxY).toBeGreaterThan(envelope.max - 0.4);
      expect(maxY).toBeLessThanOrEqual(envelope.max);
      // The pyramid's apex layers are thinner than one wall inset and print nothing, so the top sits a few layers low.
      expect(maxZ).toBeLessThanOrEqual(envelope.height + 1e-4);
      expect(maxZ).toBeGreaterThan(envelope.height - 0.6);
      expect(program.duration).toBeGreaterThan(60);
      expect(program.filamentLength).toBeGreaterThan(500);
    });
  });

  it('should honour the preset and explicit layer height in the emitted options and layer count', async () => {
    const result = await slice(readGlb('cube.glb'), { preset: 'fast', walls: 3, infillPercent: 0 });
    if (!result.success) {
      expect.fail(JSON.stringify(result.issues));
    }
    const text = new TextDecoder().decode(readBambuContainer(result.data[0]!.bytes).gcode);
    expect(text).toContain('; tau:option layerHeight=0.28');
    expect(text).toContain('; tau:option walls=3');
    expect(text).toContain('; tau:layer-count 72');
    expect(text).not.toContain(';TYPE:Sparse infill');
    expect(text).toContain(';TYPE:Internal solid infill');
  });

  it('should refuse supports on the reference engine with a content issue', async () => {
    const result = await slice(readGlb('cube.glb'), { supports: true });
    expect(result).toEqual({
      success: false,
      issues: [
        expect.objectContaining({
          code: 'RUNTIME_CONTENT_UNSUPPORTED',
          message: 'The reference engine does not generate supports.',
          details: { operation: 'transcode', engine: 'reference', option: 'supports' },
        }),
      ],
    });
  });

  it('should refuse the service engine without an endpoint', async () => {
    const result = await slice(readGlb('cube.glb'), { engine: 'service' });
    expect(result).toEqual({
      success: false,
      issues: [expect.objectContaining({ code: 'TRANSCODER_OPTIONS_INVALID' })],
    });
  });

  it('should refuse a part larger than the bed and an open mesh', async () => {
    const oversized = await slice(await createGlb(cubeVertices(300), cubeTriangles));
    expect(oversized.success).toBe(false);
    if (!oversized.success) {
      expect(oversized.issues).toHaveLength(1);
      expect(oversized.issues[0]).toMatchObject({ code: 'RUNTIME', type: 'runtime', severity: 'error' });
      expect(oversized.issues[0]!.message).toContain('300.00 × 300.00 × 300.00 mm');
    }
    const open = await slice(await createGlb(cubeVertices(20), cubeTriangles.slice(0, 11)));
    expect(open).toEqual({
      success: false,
      issues: [expect.objectContaining({ code: 'GEOMETRY_INVALID' })],
    });
  });

  it('should slice a mesh wound inside out as its right-side-out twin', async () => {
    const outward = await slice(await createGlb(cubeVertices(20), cubeTriangles));
    // An OpenSCAD polyhedron with its faces listed the other way exports like this.
    const inward = await slice(
      await createGlb(
        cubeVertices(20),
        cubeTriangles.map(([a, b, c]) => [a, c, b] as const),
      ),
    );
    if (!outward.success || !inward.success) {
      expect.fail(JSON.stringify({ outward: outward.issues, inward: inward.issues }));
    }
    expect(readBambuContainer(inward.data[0]!.bytes).gcode).toEqual(readBambuContainer(outward.data[0]!.bytes).gcode);
  });

  it('should refuse a part with nothing to extrude on any layer', async () => {
    // 0.2 mm thick: thinner than one 0.4 mm extrusion, so every layer drops it.
    const fin = cubeVertices(20).map(([x, y, z]) => [x, y / 100, z] as const);
    const result = await slice(await createGlb(fin, cubeTriangles));
    expect(result).toEqual({ success: false, issues: [expect.objectContaining({ code: 'GEOMETRY_INVALID' })] });
    if (!result.success) {
      expect(result.issues[0]!.message).toContain('Nothing to print');
    }
  });

  it('should read a GLB written by glTF-Transform with node transforms into the same slice', async () => {
    const result = await slice(await createGlb(cubeVertices(20), cubeTriangles));
    if (!result.success) {
      expect.fail(JSON.stringify(result.issues));
    }
    const program = parseGcode(readBambuContainer(result.data[0]!.bytes).gcode);
    expect(program.layerTable).toHaveLength(100);
  });

  it('should stop at the operation signal', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(slice(readGlb('cube.glb'), {}, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('should report a missing input file', async () => {
    const result = await definition.transcode(
      { from: 'glb', to: 'gcode.3mf', files: [], options: {} },
      createRuntime(),
      context,
    );
    expect(result).toEqual({ success: false, issues: [expect.objectContaining({ code: 'RUNTIME' })] });
  });
});
