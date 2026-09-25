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
import { readBambuContainerProducer } from '#container.js';
import { readTriangleMesh, writeBinaryStl } from '#glb-mesh.js';

/* eslint-disable @typescript-eslint/naming-convention -- Bambu Studio preset and result keys are fixed snake_case names. */

const install = await findBambuStudio();
const golden = process.env['TAU_BAMBU_PARITY_GOLDEN'];
const plateMember = 'Metadata/plate_1.gcode';
const decoder = new TextDecoder();

/** Lines from the first marker through the second, inclusive. */
const section = (gcode: string, from: string, to: string): string => {
  const start = gcode.indexOf(from);
  const end = gcode.indexOf(to, start);
  return start === -1 || end === -1 ? '' : gcode.slice(start, end + to.length);
};

describe.runIf(install !== undefined)('Bambu Studio parity (installed app)', { timeout: 120_000 }, () => {
  const found = install!;
  let selection: BambuStudioSelection;
  let stl: Uint8Array<ArrayBuffer>;
  let first: BambuStudioSliceResult;
  let second: BambuStudioSliceResult;

  beforeAll(async () => {
    const cube = Uint8Array.from(
      readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '__fixtures__', 'cube.glb')),
    );
    stl = writeBinaryStl(await readTriangleMesh(cube));
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
    first = await sliceWithBambuStudio({ install: found, selection, stl, signal });
    second = await sliceWithBambuStudio({ install: found, selection, stl, signal });
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
    expect(unzipSync(second.archive)[plateMember]).toEqual(unzipSync(first.archive)[plateMember]);
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
      stl,
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
