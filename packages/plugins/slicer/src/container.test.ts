import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { MachineArtifactReference } from '@taucad/runtime/machine';
import { unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import {
  bambuContainerMembers,
  bambuPlateMember,
  readBambuContainer,
  readBambuPreview,
  readBambuContainerProducer,
  writeBambuContainer,
} from '#container.js';

const encoder = new TextEncoder();
const gcode = 'G28\nG90\nM83\nG1 X10 Y10 F3000\n';
const digest = (bytes: Uint8Array<ArrayBuffer>): MachineArtifactReference['digest'] =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}` as MachineArtifactReference['digest'];

describe('writeBambuContainer', () => {
  it('should write the censused member set in a fixed order with the plate MD5', () => {
    const bytes = writeBambuContainer({ gcode, modelName: 'cube', plate: 'textured-pei' });
    const members = unzipSync(bytes);
    expect(Object.keys(members)).toEqual([...bambuContainerMembers]);
    // A Bambu plate is also recorded under Bambu Studio's own name for it.
    const plate = `; CONFIG_BLOCK_START\n; curr_bed_type = Textured PEI Plate\n; CONFIG_BLOCK_END\n${gcode}`;
    expect(new TextDecoder().decode(members[bambuPlateMember])).toBe(plate);
    expect(new TextDecoder().decode(members['Metadata/plate_1.gcode.md5'])).toBe(
      createHash('md5').update(plate).digest('hex'),
    );
    expect(new TextDecoder().decode(members['[Content_Types].xml'])).toContain(
      'Extension="gcode" ContentType="text/x.gcode"',
    );
    expect(new TextDecoder().decode(members['3D/3dmodel.model'])).toContain('<metadata name="Title">cube</metadata>');
    expect(JSON.parse(new TextDecoder().decode(members['Metadata/plate_1.json']))).toEqual({
      version: 2,
      name: 'cube',
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Bambu plate_1.json field names are fixed.
      bed_type: 'textured-pei',
    });
  });

  it('should record what the plate was sliced for where Bambu Studio records it', () => {
    const members = unzipSync(
      writeBambuContainer({
        gcode,
        modelName: 'cube',
        plate: 'cool',
        printerModel: 'Bambu Lab X1 Carbon',
        nozzleDiameter: 0.4,
        filamentTypes: ['PLA', 'PETG'],
        filamentColors: ['#ff0000', '#0000FF'],
        filamentDiameters: [1.75, 1.75],
      }),
    );
    expect(new TextDecoder().decode(members[bambuPlateMember])).toBe(
      '; CONFIG_BLOCK_START\n' +
        '; curr_bed_type = Cool Plate\n' +
        '; filament_colour = #FF0000;#0000FF\n' +
        '; filament_diameter = 1.75,1.75\n' +
        '; filament_type = PLA;PETG\n' +
        '; nozzle_diameter = 0.4\n' +
        '; printer_model = Bambu Lab X1 Carbon\n' +
        `; CONFIG_BLOCK_END\n${gcode}`,
    );
    expect(new TextDecoder().decode(members['Metadata/slice_info.config'])).toContain(
      '  <metadata key="nozzle_diameters" value="0.4"/>\n' +
        '  <object identify_id="1" name="cube" skipped="false"/>\n' +
        '  <filament id="1" type="PLA" color="#FF0000"/>\n' +
        '  <filament id="2" type="PETG" color="#0000FF"/>\n',
    );
  });

  it.each([
    ['a printer model that ends the comment line', { printerModel: 'X1\nM104 S300' }],
    ['a material that splits the list', { filamentTypes: ['PLA;PETG'] }],
    ['a zero diameter', { filamentDiameters: [0] }],
    ['an unbounded nozzle', { nozzleDiameter: Number.POSITIVE_INFINITY }],
  ])('should refuse %s, which would land in a G-code comment', (_name, facts) => {
    expect(() => writeBambuContainer({ gcode, modelName: 'cube', ...facts })).toThrow(
      new TypeError('SLICER_CONTAINER_SETTING_INVALID'),
    );
  });

  it('should be byte-deterministic and escape the model name', () => {
    const first = writeBambuContainer({ gcode, modelName: 'a<b>&"c"' });
    const second = writeBambuContainer({ gcode, modelName: 'a<b>&"c"' });
    expect(digest(first)).toBe(digest(second));
    expect(new TextDecoder().decode(unzipSync(first)['Metadata/slice_info.config'])).toContain(
      'name="a&lt;b&gt;&amp;&quot;c&quot;"',
    );
  });

  it('should add the thumbnail relationship only when a thumbnail is given', () => {
    const thumbnail = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);
    const members = unzipSync(writeBambuContainer({ gcode, modelName: 'cube', thumbnail }));
    expect(Object.keys(members)).toEqual([...bambuContainerMembers, 'Metadata/plate_1.png']);
    expect(new TextDecoder().decode(members['_rels/.rels'])).toContain('metadata/thumbnail');
    expect(members['Metadata/plate_1.png']).toEqual(thumbnail);
  });

  it('should refuse an empty plate', () => {
    expect(() => writeBambuContainer({ gcode: '', modelName: 'cube' })).toThrow('SLICER_CONTAINER_PLATE_EMPTY');
  });
});

// Synthetic stand-in for a Bambu Studio archive: only the two provenance signals, made-up version.
const studioSliceInfo =
  '<?xml version="1.0" encoding="UTF-8"?>\n<config>\n  <header>\n' +
  '    <header_item key="X-BBL-Client-Type" value="slicer"/>\n' +
  '    <header_item key="X-BBL-Client-Version" value="99.0.0.0"/>\n' +
  '  </header>\n</config>\n';
const studioPlate = `; HEADER_BLOCK_START\n; BambuStudio 99.0.0.0\n; total layer number: 1\n; HEADER_BLOCK_END\n\n${'G1 X1 Y1 E0.1\n'.repeat(200_000)}`;
const studioContainer = (sliceInfo?: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(
    zipSync({
      [bambuPlateMember]: encoder.encode(studioPlate),
      ...(sliceInfo === undefined ? {} : { 'Metadata/slice_info.config': encoder.encode(sliceInfo) }),
    }),
  );

describe('readBambuContainerProducer', () => {
  it.each([
    ['a Bambu Studio archive', studioContainer(studioSliceInfo), { name: 'Bambu Studio', version: '99.0.0.0' }],
    [
      'a reference-engine archive',
      writeBambuContainer({ gcode: `; generated by @taucad/slicer reference engine\n${gcode}`, modelName: 'cube' }),
      { name: '@taucad/slicer reference' },
    ],
    ['an archive naming no producer', writeBambuContainer({ gcode, modelName: 'cube' }), undefined],
    ['a Bambu Studio header without slice metadata', studioContainer(), undefined],
    [
      'a Bambu Studio header whose metadata names another client',
      studioContainer(studioSliceInfo.replace('value="slicer"', 'value="other"')),
      undefined,
    ],
  ])('should identify %s', (_name, bytes, producer) => {
    expect(readBambuContainerProducer(bytes)).toEqual(producer);
  });

  it('should take the version from the slice metadata when the header names none', () => {
    const bytes = Uint8Array.from(
      zipSync({
        [bambuPlateMember]: encoder.encode('; BambuStudio\nG28\n'),
        'Metadata/slice_info.config': encoder.encode(studioSliceInfo),
      }),
    );
    expect(readBambuContainerProducer(bytes)).toEqual({ name: 'Bambu Studio', version: '99.0.0.0' });
  });

  it.each([
    ['non-zip bytes', encoder.encode('not a zip')],
    ['no bytes', new Uint8Array()],
  ])('should report no producer for %s', (_name, bytes) => {
    expect(readBambuContainerProducer(Uint8Array.from(bytes))).toBeUndefined();
  });
});

describe('readBambuContainer', () => {
  it('should return the plate, verify its MD5 and digest every member', () => {
    const bytes = writeBambuContainer({ gcode, modelName: 'cube' });
    const container = readBambuContainer(bytes);
    expect(new TextDecoder().decode(container.gcode)).toBe(gcode);
    expect(container.md5Verified).toBe(true);
    expect(container.recordedMd5).toBe(createHash('md5').update(gcode).digest('hex'));
    expect(container.members.map((member) => member.name)).toEqual([...bambuContainerMembers]);
    const plate = container.members.find((member) => member.name === bambuPlateMember)!;
    expect(plate).toEqual({ name: bambuPlateMember, length: gcode.length, digest: digest(encoder.encode(gcode)) });
  });

  it('should read the bed type the plate was sliced for, from the reference engine and from Bambu Studio', () => {
    expect(readBambuContainer(writeBambuContainer({ gcode, modelName: 'cube', plate: 'textured-pei' })).bedType).toBe(
      'textured-pei',
    );
    const studio = (json: string): Uint8Array<ArrayBuffer> =>
      Uint8Array.from(
        zipSync({ [bambuPlateMember]: encoder.encode(gcode), 'Metadata/plate_1.json': encoder.encode(json) }),
      );
    expect(readBambuContainer(studio('{"bed_type":"hot_plate","version":2}')).bedType).toBe('hot_plate');
    expect(readBambuContainer(studio('not json')).bedType).toBeUndefined();
    expect(readBambuContainer(studio('null')).bedType).toBeUndefined();
    expect(readBambuContainer(Uint8Array.from(zipSync({ [bambuPlateMember]: encoder.encode(gcode) }))).bedType).toBe(
      undefined,
    );
  });

  it('should report an unverified MD5 when the recorded value disagrees', () => {
    const bytes = zipSync({
      [bambuPlateMember]: encoder.encode(gcode),
      'Metadata/plate_1.gcode.md5': encoder.encode('0'.repeat(32)),
    });
    const container = readBambuContainer(Uint8Array.from(bytes));
    expect(container.md5Verified).toBe(false);
    expect(container.recordedMd5).toBe('0'.repeat(32));
  });

  it('should read no filament colours from a plate that records none', () => {
    expect(readBambuContainer(writeBambuContainer({ gcode, modelName: 'cube' })).filamentColors).toEqual([]);
  });

  it.each([
    ['a missing plate', zipSync({ 'Metadata/other.gcode': encoder.encode(gcode) }), 'SLICER_CONTAINER_PLATE_MISSING'],
    ['an empty plate', zipSync({ [bambuPlateMember]: new Uint8Array() }), 'SLICER_CONTAINER_PLATE_INVALID'],
    ['path traversal', zipSync({ '../plate_1.gcode': encoder.encode(gcode) }), 'SLICER_CONTAINER_MEMBER_INVALID'],
    [
      'case-colliding members',
      zipSync({ [bambuPlateMember]: encoder.encode(gcode), 'metadata/PLATE_1.GCODE': encoder.encode(gcode) }),
      'SLICER_CONTAINER_LIMIT',
    ],
    ['non-zip bytes', encoder.encode('not a zip'), 'SLICER_CONTAINER_INVALID'],
    ['no bytes', new Uint8Array(), 'SLICER_CONTAINER_LIMIT'],
  ])('should refuse %s', (_name, bytes, code) => {
    expect(() => readBambuContainer(Uint8Array.from(bytes))).toThrow(code);
  });
});

describe('filament colours', () => {
  const decoder = new TextDecoder();
  const plateOf = (bytes: Uint8Array<ArrayBuffer>): string => decoder.decode(unzipSync(bytes)[bambuPlateMember]);
  const zippedPlate = (text: string): Uint8Array<ArrayBuffer> =>
    Uint8Array.from(zipSync({ [bambuPlateMember]: encoder.encode(text) }));

  it('should record them in a config block at the head of the plate and per filament, then read them back in order', () => {
    const bytes = writeBambuContainer({ gcode, modelName: 'cube', filamentColors: ['#ff0000', '#0000FF'] });

    expect(plateOf(bytes)).toBe(
      `; CONFIG_BLOCK_START\n; filament_colour = #FF0000;#0000FF\n; CONFIG_BLOCK_END\n${gcode}`,
    );
    expect(decoder.decode(unzipSync(bytes)['Metadata/slice_info.config'])).toContain(
      '  <object identify_id="1" name="cube" skipped="false"/>\n' +
        '  <filament id="1" color="#FF0000"/>\n' +
        '  <filament id="2" color="#0000FF"/>\n' +
        ' </plate>\n',
    );
    const container = readBambuContainer(bytes);
    expect(container.filamentColors).toEqual(['#FF0000', '#0000FF']);
    expect(container.md5Verified).toBe(true);
  });

  it('should write the same bytes as before when there is no colour to record', () => {
    expect(writeBambuContainer({ gcode, modelName: 'cube', filamentColors: [] })).toEqual(
      writeBambuContainer({ gcode, modelName: 'cube' }),
    );
  });

  it('should keep naming the reference engine as the producer of a coloured plate', () => {
    const bytes = writeBambuContainer({
      gcode: `; generated by @taucad/slicer reference engine\n${gcode}`,
      modelName: 'cube',
      filamentColors: ['#F5A623'],
    });

    expect(readBambuContainerProducer(bytes)).toEqual({ name: '@taucad/slicer reference' });
  });

  it.each([
    ['a named colour', ['red']],
    ['a colour with alpha', ['#FF0000FF']],
    ['two colours in one entry', ['#FF0000;#0000FF']],
    ['more than 64 colours', Array.from({ length: 65 }, () => '#FF0000')],
  ])('should refuse %s', (_name, filamentColors) => {
    expect(() => writeBambuContainer({ gcode, modelName: 'cube', filamentColors })).toThrow(
      'SLICER_CONTAINER_COLOR_INVALID',
    );
  });

  it('should read the colours of a real two-colour Bambu Studio slice in filament order', () => {
    const plate = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'two-colour-cubes.gcode'));

    expect(readBambuContainer(Uint8Array.from(zipSync({ [bambuPlateMember]: plate }))).filamentColors).toEqual([
      '#FF0000',
      '#0000FF',
    ]);
  });

  it('should read the colours Bambu Studio records at the head of the plate and Orca at its tail', () => {
    const head = zippedPlate(
      '; CONFIG_BLOCK_START\n; default_filament_colour = ""\n; filament_colour = #f5a623;#FFFFFF\n; CONFIG_BLOCK_END\nG28\n',
    );
    const tail = zippedPlate(`${'G1 X1 Y1\n'.repeat(10_000)}; filament_colour = #00AE42\n`);

    expect(readBambuContainer(head).filamentColors).toEqual(['#F5A623', '#FFFFFF']);
    expect(readBambuContainer(tail).filamentColors).toEqual(['#00AE42']);
  });

  it('should drop an alpha byte and read no colours when any entry is not a colour', () => {
    expect(readBambuContainer(zippedPlate('; filament_colour = #FF0000FF;#0000ff\n')).filamentColors).toEqual([
      '#FF0000',
      '#0000FF',
    ]);
    expect(readBambuContainer(zippedPlate('; filament_colour = #FF0000;red\n')).filamentColors).toEqual([]);
    expect(readBambuContainer(zippedPlate('; filament_colour = #FF0000;\n')).filamentColors).toEqual([]);
  });
});

describe('selective preview extraction', () => {
  it('should agree with the full reader without retaining unrelated members, and reject unsafe or corrupted archives', () => {
    const source = writeBambuContainer({
      gcode,
      modelName: 'cube',
      plate: 'textured-pei',
      filamentColors: ['#ff0000'],
    });
    const full = readBambuContainer(source);
    const preview = readBambuPreview(source);
    expect(preview.gcode).toEqual(full.gcode);
    expect(preview.bedType).toEqual(full.bedType);
    expect(preview.filamentColors).toEqual(full.filamentColors);
    expect(preview.md5Verified).toBe(true);
    expect('members' in preview).toBe(false);
    const members = unzipSync(source);
    members['../unselected.png'] = new Uint8Array([1]);
    expect(() => readBambuPreview(Uint8Array.from(zipSync(members)))).toThrow();
    delete members['../unselected.png'];
    members['Metadata/plate_1.gcode.md5'] = encoder.encode('0'.repeat(32));
    expect(() => readBambuPreview(Uint8Array.from(zipSync(members)))).toThrow('SLICER_CONTAINER_CHECKSUM_INVALID');
  });
});

it('should enforce actual selected output limits when ZIP directory sizes lie', () => {
  const archive = Uint8Array.from(
    zipSync({
      'Metadata/plate_1.gcode': encoder.encode(gcode),
      'Metadata/plate_1.gcode.md5': encoder.encode('0'.repeat(1024)),
    }),
  );
  const directory = new DataView(archive.buffer);
  for (let offset = 0; offset + 46 <= archive.byteLength; offset += 1) {
    if (directory.getUint32(offset, true) !== 0x02_01_4b_50) {
      continue;
    }
    const nameLength = directory.getUint16(offset + 28, true);
    const name = new TextDecoder().decode(archive.subarray(offset + 46, offset + 46 + nameLength));
    if (name.endsWith('.md5')) {
      directory.setUint32(offset + 24, 32, true);
    }
  }
  expect(() => readBambuPreview(archive)).toThrow('SLICER_CONTAINER_LIMIT');
});
