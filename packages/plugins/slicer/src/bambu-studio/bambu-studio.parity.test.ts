/**
 * Parity harness against the person's installed Bambu Studio.
 *
 * Runs only where Bambu Studio is installed (or `TAU_BAMBU_STUDIO_PATH` names
 * it). With `TAU_BAMBU_PARITY_GOLDEN` pointing at a `.gcode.3mf` exported from
 * the Bambu Studio app for the same 20 mm cube, X1 Carbon 0.4, 0.20mm
 * Standard, Bambu PETG Basic and the high temperature plate, it also compares
 * the start and end sequences byte for byte and `project_settings.config` key
 * by key. Goldens stay outside this repository.
 */
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { unzipSync } from 'fflate';
import { beforeAll, describe, expect, it } from 'vitest';

import { loadBambuStudioCatalog } from '#bambu-studio/catalog.js';
import { describeBambuStudioSettings } from '#bambu-studio/engine.js';
import { findBambuStudio } from '#bambu-studio/installation.js';
import { flattenBambuSettings } from '#bambu-studio/options/index.js';
import { resolveBambuStudioSelection } from '#bambu-studio/selection.js';
import { sliceWithBambuStudio } from '#bambu-studio/slice.js';
import type { BambuStudioSelection, BambuStudioSliceResult } from '#bambu-studio/types.js';
import { readBambuContainer, readBambuContainerProducer } from '#container.js';
import { readTriangleMesh, writeBinaryStl } from '#glb-mesh.js';
import { parseGcode, toolpathSegmentKinds } from '#toolpath.js';

/* eslint-disable @typescript-eslint/naming-convention -- Bambu Studio preset and result keys are fixed snake_case names. */

const install = await findBambuStudio();
const golden = process.env['TAU_BAMBU_PARITY_GOLDEN'];
const plateMember = 'Metadata/plate_1.gcode';
const decoder = new TextDecoder();
const readFixture = (name: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '__fixtures__', name)));

/** Lines from the first marker through the second, inclusive. */
const section = (gcode: string, from: string, to: string): string => {
  const start = gcode.indexOf(from);
  const end = gcode.indexOf(to, start);
  return start === -1 || end === -1 ? '' : gcode.slice(start, end + to.length);
};

describe.runIf(install !== undefined)('Bambu Studio parity (installed app)', { timeout: 120_000 }, () => {
  const found = install!;
  let selection: BambuStudioSelection;
  let parts: Array<{ stl: Uint8Array<ArrayBuffer> }>;
  let first: BambuStudioSliceResult;
  let second: BambuStudioSliceResult;

  beforeAll(async () => {
    parts = [{ stl: writeBinaryStl(await readTriangleMesh(readFixture('cube.glb'))) }];
    const catalog = await loadBambuStudioCatalog(found, { model: 'X1C', nozzleDiameter: 0.4 });
    selection = resolveBambuStudioSelection(catalog, {
      model: 'X1C',
      nozzleDiameter: 0.4,
      preset: 'standard',
      plate: 'high-temperature',
      materials: [{ slot: 0, materialId: 'PETG', profileId: 'GFG00' }],
    });
    expect(selection).toEqual({
      printer: 'Bambu Lab X1 Carbon 0.4 nozzle',
      process: '0.20mm Standard @BBL X1C',
      filaments: ['Bambu PETG Basic @BBL X1C'],
      plate: 'high-temperature',
    });
    const signal = AbortSignal.timeout(600_000);
    first = await sliceWithBambuStudio({ install: found, selection, parts, signal });
    second = await sliceWithBambuStudio({ install: found, selection, parts, signal });
  }, 600_000);

  it('should slice with the resolved PETG filament, plate and machine templates', () => {
    const gcode = decoder.decode(unzipSync(first.archive)[plateMember]);
    expect(gcode).toContain(`; BambuStudio ${found.version}`);
    expect(gcode).toContain('; total layer number: 100');
    expect(gcode).toContain('; curr_bed_type = High Temp Plate');
    expect(gcode).toContain('; filament_type = PETG');
    expect(gcode).toContain('; hot_plate_temp = 70');
    expect(gcode).toContain('; nozzle_temperature = 255');
    // The X1 Carbon start template only arrives through `include`; its calibration gates prove it resolved.
    expect(gcode.match(/^M1002 judge_flag/gmu)?.length ?? 0).toBeGreaterThan(10);
    expect(first.result).toMatchObject({ returnCode: 0 });
    expect(first.result.predictionSeconds).toBeGreaterThan(0);
  });

  it('should write Bambu Studio’s full archive, named as its producer', () => {
    expect(Object.keys(unzipSync(first.archive))).toHaveLength(19);
    expect(readBambuContainerProducer(first.archive)).toEqual({ name: 'Bambu Studio', version: found.version });
  });

  it('should produce byte-identical plate G-code across runs', () => {
    const ours = unzipSync(first.archive)[plateMember]!;
    const again = unzipSync(second.archive)[plateMember]!;
    // A native byte comparison: `toEqual` walks the G-code element by element and takes seconds under load.
    expect(again.byteLength).toBeGreaterThan(0);
    expect(Buffer.compare(again, ours)).toBe(0);
  });

  it('should describe the selection’s settings as a schema whose defaults are the preset values', async () => {
    const { schema, values, groups } = await describeBambuStudioSettings(found, selection);
    expect(schema.properties).toHaveProperty('process');
    expect(schema.properties).toHaveProperty('filament');
    expect(groups.length).toBeGreaterThan(5);
    expect(flattenBambuSettings(values)).toMatchObject({
      wall_loops: 2,
      sparse_infill_density: 15,
      nozzle_temperature: 255,
    });
  });

  it('should slice with edited settings', async () => {
    const edited = await sliceWithBambuStudio({
      install: found,
      selection: { ...selection, settings: { wall_loops: 3, sparse_infill_density: 20, nozzle_temperature: 250 } },
      parts,
      signal: AbortSignal.timeout(300_000),
    });
    const config = section(
      decoder.decode(unzipSync(edited.archive)[plateMember]),
      '; CONFIG_BLOCK_START',
      '; CONFIG_BLOCK_END',
    );
    expect(config).toContain('\n; wall_loops = 3\n');
    expect(config).toContain('\n; sparse_infill_density = 20%\n');
    expect(config).toContain('\n; nozzle_temperature = 250\n');
  }, 300_000);

  it('should record the given filament colour in the project and G-code', async () => {
    const coloured = await sliceWithBambuStudio({
      install: found,
      selection,
      parts: [{ ...parts[0]!, color: '#F5A623' }],
      signal: AbortSignal.timeout(300_000),
    });
    const members = unzipSync(coloured.archive);
    const config = section(decoder.decode(members[plateMember]), '; CONFIG_BLOCK_START', '; CONFIG_BLOCK_END');
    expect(config).toMatch(/\n; filament_colour = #F5A623\b/u);
    const project = JSON.parse(decoder.decode(members['Metadata/project_settings.config'])) as {
      filament_colour: string[];
    };
    expect(project.filament_colour[0]).toBe('#F5A623');
  }, 300_000);

  it('should slice two parts as one assembly, part i with filament i in its colour, keeping their placement', async () => {
    const model = await readTriangleMesh(readFixture('two-colour-cubes.glb'));
    const assembled = await sliceWithBambuStudio({
      install: found,
      selection,
      parts: model.parts.map((part) => ({ stl: writeBinaryStl(part), color: part.color! })),
      signal: AbortSignal.timeout(300_000),
    });
    const { gcode, filamentColors } = readBambuContainer(assembled.archive);
    const text = decoder.decode(gcode);

    // The selection names one filament; the second part prints with it too.
    expect(assembled.presets.filaments).toEqual([selection.filaments[0], selection.filaments[0]]);
    expect(filamentColors).toEqual(['#FF0000', '#0000FF']);
    expect(section(text, '; CONFIG_BLOCK_START', '; CONFIG_BLOCK_END')).toContain(
      '\n; filament_colour = #FF0000;#0000FF\n',
    );
    expect(text.match(/^M620 S1A/gmu)?.length ?? 0).toBeGreaterThan(10);
    // Outer walls per filament: the blue cube sits 20 mm right of the red one, as modelled.
    const program = parseGcode(gcode);
    const outerWall = toolpathSegmentKinds.indexOf('outer-wall');
    const walls = [0, 1].map((tool) => {
      const xs: number[] = [];
      const ys: number[] = [];
      for (let index = 0; index < program.segmentCount; index += 1) {
        if (program.tools[index] === tool && program.kinds[index] === outerWall && program.extrusion[index]! > 0) {
          xs.push(program.positions[index * 6 + 3]!);
          ys.push(program.positions[index * 6 + 4]!);
        }
      }
      return { x: Math.min(...xs), y: Math.min(...ys) };
    });
    expect(walls[1]!.x - walls[0]!.x).toBeCloseTo(20, 2);
    expect(walls[1]!.y).toBeCloseTo(walls[0]!.y, 2);
  }, 300_000);

  it.runIf(golden !== undefined)('should match the app’s start, end and project settings', async () => {
    const theirs = unzipSync(Uint8Array.from(await readFile(golden!)));
    const ours = unzipSync(first.archive);
    const theirGcode = decoder.decode(theirs[plateMember]);
    const ourGcode = decoder.decode(ours[plateMember]);
    for (const [from, to] of [
      ['; EXECUTABLE_BLOCK_START', '; MACHINE_START_GCODE_END'],
      ['; MACHINE_END_GCODE_START', '; EXECUTABLE_BLOCK_END'],
    ] as const) {
      expect(section(ourGcode, from, to)).toBe(section(theirGcode, from, to));
    }
    const settings = (members: ReturnType<typeof unzipSync>): Record<string, unknown> => {
      const { version: _version, ...rest } = JSON.parse(
        decoder.decode(members['Metadata/project_settings.config']),
      ) as Record<string, unknown>;
      return rest;
    };
    expect(settings(ours)).toEqual(settings(theirs));
  });
});
/* eslint-enable @typescript-eslint/naming-convention -- End of Bambu Studio keys. */
