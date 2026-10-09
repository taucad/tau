import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import type { TranscoderServices } from '@taucad/runtime/transcoder';
import type { ExportFile } from '@taucad/runtime/types';
import { unzipSync } from 'fflate';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { writeFakeInstall } from '#bambu-studio/fake-install.test-helpers.js';
import type { FakeInstall } from '#bambu-studio/fake-install.test-helpers.js';
import { bambuPlateMember, readBambuContainer, readBambuContainerProducer } from '#container.js';
import { boxTriangles, boxVertices, writeTestGlb } from '#glb.test-helpers.js';
import type { TestVertex } from '#glb.test-helpers.js';
import { slicerOptionsSchema } from '#slicer-options.js';
import { slicerTranscoder } from '#slicer.transcoder.js';
import { parseGcode } from '#toolpath.js';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__');
const readGlb = (name: string): ExportFile => ({
  name,
  bytes: Uint8Array.from(readFileSync(join(fixtures, name))),
  mimeType: 'model/gltf-binary',
});
const sha256 = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex');
const createRuntime = (signal = new AbortController().signal): TranscoderServices =>
  mock<TranscoderServices>({
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    tracer: { startSpan: vi.fn(() => ({ end: vi.fn() })) },
    signal,
  });

/** A GLB in Tau's export convention with one part, from Z-up millimetre vertices; uncoloured without `color`. */
const createGlb = async (
  vertices: readonly TestVertex[],
  triangles: ReadonlyArray<readonly [number, number, number]>,
  color?: number,
): Promise<ExportFile> => ({
  name: 'part.glb',
  bytes: await writeTestGlb([{ vertices, triangles, ...(color === undefined ? {} : { color }) }]),
  mimeType: 'model/gltf-binary',
});

const cubeVertices = (size: number): TestVertex[] => boxVertices([-size / 2, -size / 2, 0], [size / 2, size / 2, size]);
const cubeTriangles = boxTriangles;
const decoder = new TextDecoder();

/** A GLB of 10 mm boxes in a row along X, one per colour. */
const createRowGlb = async (colors: readonly number[]): Promise<ExportFile> => ({
  name: 'row.glb',
  bytes: await writeTestGlb(
    colors.map((color, index) => ({
      vertices: boxVertices([index * 20, 0, 0], [index * 20 + 10, 10, 10]),
      triangles: boxTriangles,
      color,
    })),
  ),
  mimeType: 'model/gltf-binary',
});

/** A 20 mm cube whose bottom, top and front faces are red and whose other faces are blue. */
const createFaceColouredGlb = async (): Promise<ExportFile> => ({
  name: 'faces.glb',
  bytes: await writeTestGlb([
    { vertices: cubeVertices(20), triangles: cubeTriangles.slice(0, 6), color: 0xff_00_00 },
    { vertices: cubeVertices(20), triangles: cubeTriangles.slice(6), color: 0x00_00_ff },
  ]),
  mimeType: 'model/gltf-binary',
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
      containerSha256: 'fc9608ac10621a993132a4c3102240abdba2960e0450014b42a9e74e104a23df',
      plateSha256: '41471c6c049c306389cb34e2680636b2b953d1395d6d4f94ffb7ad1ce4252455',
      segments: 5931,
      envelope: { max: 138, height: 20 },
    },
    {
      name: 'pyramid.glb',
      layers: 125,
      containerSha256: '8e95ab6c28369291af7dd0baaddc25a846059f8dec18302d222a7e8551425ffc',
      plateSha256: '45bb7cfebf3e1567b703f3ed4944bdfa106b900657f8346c4900988327ae6fd2',
      segments: 5441,
      envelope: { max: 143, height: 25 },
    },
  ])('reference engine on $name', ({ name, layers, containerSha256, plateSha256, segments, envelope }) => {
    it('should produce a deterministic Bambu container whose plate MD5 verifies', async () => {
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
      // What it was sliced for, where Bambu Studio records it, so a printer's job checks can read it.
      expect(new TextDecoder().decode(plate)).toMatch(
        /^; CONFIG_BLOCK_START\n; curr_bed_type = Textured PEI Plate\n(?:; filament_colour = #[\dA-F]{6}\n)?; filament_diameter = 1\.75\n; nozzle_diameter = 0\.4\n; printer_model = Bambu Lab X1 Carbon\n; CONFIG_BLOCK_END\n; generated by @taucad\/slicer reference engine\n(?:; tau:option [a-zA-Z]+=.*\n)+; tau:layer-count \d+\nM140 S55\nM104 S220\nG28\n/u,
      );
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

  describe('model colours on the reference engine', () => {
    it('should record a coloured model’s colour in a config block ahead of the plate it slices uncoloured', async () => {
      const coloured = await slice(await createGlb(cubeVertices(20), cubeTriangles, 0xf5_a6_23));
      const plain = await slice(await createGlb(cubeVertices(20), cubeTriangles));
      if (!coloured.success || !plain.success) {
        expect.fail(JSON.stringify({ coloured: coloured.issues, plain: plain.issues }));
      }
      const container = readBambuContainer(coloured.data[0]!.bytes);

      expect(coloured.issues).toEqual([]);
      expect(container.filamentColors).toEqual(['#F5A623']);
      expect(decoder.decode(container.gcode)).toBe(
        decoder
          .decode(readBambuContainer(plain.data[0]!.bytes).gcode)
          .replace('; curr_bed_type = Textured PEI Plate\n', '$&; filament_colour = #F5A623\n'),
      );
      expect(readBambuContainerProducer(coloured.data[0]!.bytes)).toEqual({ name: '@taucad/slicer reference' });
    });

    it('should record the filament material it is told, and none when it is not', async () => {
      const told = await slice(readGlb('cube.glb'), { filamentType: 'PETG' });
      const untold = await slice(readGlb('cube.glb'));
      if (!told.success || !untold.success) {
        expect.fail(JSON.stringify({ told: told.issues, untold: untold.issues }));
      }
      expect(decoder.decode(readBambuContainer(told.data[0]!.bytes).gcode)).toContain('\n; filament_type = PETG\n');
      expect(decoder.decode(readBambuContainer(untold.data[0]!.bytes).gcode)).not.toContain('filament_type');
    });

    it('should print a two-colour model in its first colour and warn that the colours merge', async () => {
      const result = await slice(readGlb('two-colour-cubes.glb'));
      if (!result.success) {
        expect.fail(JSON.stringify(result.issues));
      }

      expect(readBambuContainer(result.data[0]!.bytes).filamentColors).toEqual(['#FF0000']);
      expect(result.issues).toEqual([
        {
          message:
            "The reference engine prints one material, so the model's 2 colours (#FF0000, #0000FF) print as one, in #FF0000.",
          code: 'REPRESENTATION_UNSUPPORTED',
          type: 'runtime',
          severity: 'warning',
          details: { operation: 'transcode', engine: 'reference', colors: ['#FF0000', '#0000FF'] },
        },
      ]);
    });
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

  describe('bambu-studio engine', () => {
    let root: string;
    let fake: FakeInstall;
    type Recorded = { args: string[]; files: Record<string, { name: string }>; stls: string[] };
    // Triangle count and X extent of a binary STL the fake command line recorded.
    const stlSummary = (base64: string) => {
      const bytes = Buffer.from(base64, 'base64');
      const triangles = bytes.readUInt32LE(80);
      const xs = Array.from({ length: triangles * 3 }, (_, corner) =>
        bytes.readFloatLE(84 + Math.floor(corner / 3) * 50 + 12 + (corner % 3) * 12),
      );
      return { triangles, x: [Math.min(...xs), Math.max(...xs)] };
    };
    const recorded = async (): Promise<Recorded> => JSON.parse(await readFile(fake.record, 'utf8')) as Recorded;

    beforeAll(async () => {
      root = await mkdtemp(join(tmpdir(), 'tau-slicer-bambu-'));
      fake = await writeFakeInstall(root, { bundledVersion: '01.00.00.01' });
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    afterAll(async () => {
      await rm(root, { recursive: true, force: true });
    });

    // The engine hands the signal to Node's child process API, which needs a real AbortSignal, not the mock's proxy.
    const sliceWithRealSignal = async (file: ExportFile, options: Record<string, unknown>) => {
      const { signal } = new AbortController();
      const runtime = new Proxy(createRuntime(), {
        get: (target, key, receiver): unknown => (key === 'signal' ? signal : Reflect.get(target, key, receiver)),
      });
      return definition.transcode({ from: 'glb', to: 'gcode.3mf', files: [file], options }, runtime, context);
    };

    const useFakeInstall = (): void => {
      vi.stubEnv('TAU_BAMBU_STUDIO_PATH', fake.app);
      vi.stubEnv('HOME', fake.home);
    };

    it('should return Bambu Studio’s archive byte for byte, sliced with default X1 Carbon presets', async () => {
      useFakeInstall();
      await fake.control({ mode: 'succeed' });
      const result = await sliceWithRealSignal(readGlb('cube.glb'), { engine: 'bambu-studio', plate: 'cool' });
      if (!result.success) {
        expect.fail(JSON.stringify(result.issues));
      }
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({ name: 'model.gcode.3mf', mimeType: 'application/vnd.bambulab.gcode-3mf' });
      expect(new TextDecoder().decode(result.data[0]!.bytes)).toBe('demo archive bytes');
      const { args, files } = await recorded();
      expect(args[args.indexOf('--curr-bed-type') + 1]).toBe('Cool Plate');
      // An uncoloured model keeps the filament preset's colour.
      expect(args).not.toContain('--filament-colour');
      expect(Object.values(files).map(({ name }) => name)).toEqual([
        'Bambu Lab X1 Carbon 0.4 nozzle',
        '0.20mm Standard @BBL X1C',
        'Bambu PLA Basic @BBL X1C',
      ]);
    });

    it("should record the model's colour as the filament colour", async () => {
      useFakeInstall();
      await fake.control({ mode: 'succeed' });
      const result = await sliceWithRealSignal(await createGlb(cubeVertices(20), cubeTriangles, 0xf5_a6_23), {
        engine: 'bambu-studio',
      });
      expect(result.success).toBe(true);
      const { args } = await recorded();
      expect(args[args.indexOf('--filament-colour') + 1]).toBe('#F5A623');
    });

    it('should slice a two-colour model as one assembly, each colour with its own filament', async () => {
      useFakeInstall();
      await fake.control({ mode: 'succeed' });
      const result = await sliceWithRealSignal(readGlb('two-colour-cubes.glb'), { engine: 'bambu-studio' });
      if (!result.success) {
        expect.fail(JSON.stringify(result.issues));
      }
      const { args, files, stls } = await recorded();

      expect(result.issues).toEqual([]);
      expect(args.slice(args.indexOf('--load-filament-ids'), args.indexOf('--outputdir'))).toEqual([
        '--load-filament-ids',
        '1,2',
        '--assemble',
        '--filament-colour',
        '#FF0000;#0000FF',
      ]);
      expect(Object.values(files).map(({ name }) => name)).toEqual([
        'Bambu Lab X1 Carbon 0.4 nozzle',
        '0.20mm Standard @BBL X1C',
        'Bambu PLA Basic @BBL X1C',
        'Bambu PLA Basic @BBL X1C',
      ]);
      // Each part keeps its place in the model, so Bambu Studio arranges the pair as one.
      expect(stls.map((stl) => stlSummary(stl))).toEqual([
        { triangles: 12, x: [-15, -5] },
        { triangles: 12, x: [5, 15] },
      ]);
    });

    it.each([
      {
        name: 'more colours than the printer loads',
        file: async () => createRowGlb([0xff_00_00, 0x00_ff_00, 0x00_00_ff, 0xff_ff_00, 0xff_00_ff]),
        triangles: 60,
        message:
          "The printer loads at most 4 filaments, so the model's 5 colours (#FF0000, #00FF00, #0000FF, #FFFF00, #FF00FF) print as one, in #FF0000.",
        colors: ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF'],
      },
      {
        name: 'colours on faces of one solid',
        file: createFaceColouredGlb,
        triangles: 12,
        message:
          "Colours on faces of a solid cannot print as separate filaments, so the model's 2 colours (#FF0000, #0000FF) print as one, in #FF0000.",
        colors: ['#FF0000', '#0000FF'],
      },
    ])(
      'should slice $name as one part in the first colour, with a warning',
      async ({ file, triangles, message, colors }) => {
        useFakeInstall();
        await fake.control({ mode: 'succeed' });
        const result = await sliceWithRealSignal(await file(), { engine: 'bambu-studio' });
        if (!result.success) {
          expect.fail(JSON.stringify(result.issues));
        }
        const { args, stls } = await recorded();

        expect(args).not.toContain('--assemble');
        expect(args[args.indexOf('--filament-colour') + 1]).toBe('#FF0000');
        expect(stls.map((stl) => stlSummary(stl).triangles)).toEqual([triangles]);
        expect(result.issues).toEqual([
          {
            message,
            code: 'REPRESENTATION_UNSUPPORTED',
            type: 'runtime',
            severity: 'warning',
            details: { operation: 'transcode', engine: 'bambu-studio', colors },
          },
        ]);
      },
    );

    it('should slice with the chosen presets and fill the rest from the printer hints', async () => {
      useFakeInstall();
      await fake.control({ mode: 'succeed' });
      const result = await sliceWithRealSignal(readGlb('cube.glb'), {
        engine: 'bambu-studio',
        bambuStudio: {
          process: '0.20mm Strength @BBL X1C',
          hints: { model: 'X1C', plate: 'high-temperature', materials: [{ slot: 0, materialId: 'PETG' }] },
        },
      });
      expect(result.success).toBe(true);
      const { args, files } = await recorded();
      expect(args[args.indexOf('--curr-bed-type') + 1]).toBe('High Temp Plate');
      expect(Object.values(files).map(({ name }) => name)).toEqual([
        'Bambu Lab X1 Carbon 0.4 nozzle',
        '0.20mm Strength @BBL X1C',
        'Bambu PETG Basic @BBL X1C',
      ]);
    });

    it('should default the other presets for a chosen printer', async () => {
      useFakeInstall();
      await fake.control({ mode: 'succeed' });
      const result = await sliceWithRealSignal(readGlb('cube.glb'), {
        engine: 'bambu-studio',
        preset: 'fine',
        bambuStudio: { printer: 'Bambu Lab X1 Carbon 0.4 nozzle' },
      });
      expect(result.success).toBe(true);
      const { files } = await recorded();
      expect(Object.values(files).map(({ name }) => name)).toEqual([
        'Bambu Lab X1 Carbon 0.4 nozzle',
        '0.12mm Fine @BBL X1C',
        'Bambu PLA Basic @BBL X1C',
      ]);
    });

    it('should report a failed Bambu Studio slice as a runtime issue carrying its code', async () => {
      useFakeInstall();
      await fake.control({ mode: 'fail' });
      await expect(sliceWithRealSignal(readGlb('cube.glb'), { engine: 'bambu-studio' })).resolves.toEqual({
        success: false,
        issues: [
          expect.objectContaining({
            code: 'RUNTIME',
            message: 'Bambu Studio could not slice: Nothing to slice here.',
            details: { engine: 'bambu-studio', code: 'BAMBU_STUDIO_SLICE_FAILED' },
          }),
        ],
      });
    });

    it('should refuse when Bambu Studio is not installed', async () => {
      vi.stubEnv('TAU_BAMBU_STUDIO_PATH', join(root, 'missing', 'BambuStudio.app'));
      await expect(sliceWithRealSignal(readGlb('cube.glb'), { engine: 'bambu-studio' })).resolves.toEqual({
        success: false,
        issues: [
          expect.objectContaining({
            code: 'RUNTIME',
            message: 'Slicing with Bambu Studio needs the Tau desktop app with Bambu Studio installed.',
            details: { engine: 'bambu-studio', code: 'BAMBU_STUDIO_UNAVAILABLE' },
          }),
        ],
      });
    });

    it('should reject unknown Bambu Studio options', () => {
      expect(
        slicerOptionsSchema.safeParse({ engine: 'bambu-studio', bambuStudio: { printer: 'X', nope: 1 } }).success,
      ).toBe(false);
      expect(
        slicerOptionsSchema.safeParse({ engine: 'bambu-studio', bambuStudio: { hints: { model: 'X1C' } } }).success,
      ).toBe(false);
    });

    it('should accept null for a setting the printer value decides', () => {
      expect(
        slicerOptionsSchema.safeParse({
          engine: 'bambu-studio',
          bambuStudio: { settings: Object.fromEntries([['filament_retraction_length', null]]) },
        }).success,
      ).toBe(true);
    });
  });
});
