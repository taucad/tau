import { describe, expect, it } from 'vitest';
import { writeBambuContainer } from '@taucad/slicer/container';
import {
  hasZipSignature,
  readPrinterFile,
  isPrinterFileName,
  printerFileKind,
  readGcodeSetting,
} from '#components/printer/printer-file.js';
import { loadPrinterProgram } from '#components/printer/printer-program.js';
import { fixtureGcode } from '#components/printer/testing/toolpath-fixture.js';

const zipHead = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
const text = new TextEncoder().encode('G28\nG1 X1\n');

describe('printer file recognition', () => {
  it('should recognise printer file names regardless of case', () => {
    expect(isPrinterFileName('plate_1.gcode.3mf')).toBe(true);
    expect(isPrinterFileName('bracket.GCODE')).toBe(true);
    expect(isPrinterFileName('bracket.3mf')).toBe(false);
    expect(isPrinterFileName('gcode.txt')).toBe(false);
  });

  it('should require the zip signature for a container and none for text G-code', () => {
    expect(hasZipSignature(zipHead)).toBe(true);
    expect(hasZipSignature(text)).toBe(false);
    expect(printerFileKind('part.gcode.3mf', zipHead)).toBe('container');
    expect(printerFileKind('part.gcode.3mf', text)).toBeUndefined();
    expect(printerFileKind('part.gcode', text)).toBe('gcode');
    expect(printerFileKind('part.3mf', zipHead)).toBeUndefined();
  });
});

describe('readPrinterFile and loadPrinterProgram', () => {
  it('should read the plate member out of a Bambu container and parse it', () => {
    const gcode = fixtureGcode({ layers: 3 });
    const container = writeBambuContainer({ gcode, modelName: 'fixture', plate: 'textured-pei' });
    expect(printerFileKind('fixture.gcode.3mf', container.subarray(0, 8))).toBe('container');
    expect(new TextDecoder().decode(readPrinterFile(container, 'container').gcode)).toBe(gcode);
    const { program, slicedPlate } = loadPrinterProgram(container, 'container');
    expect(program.layerTable).toHaveLength(3);
    expect(program.coverage.complete).toBe(true);
    expect(slicedPlate?.id).toBe('textured-pei');
  });

  it('should pass text G-code through untouched', () => {
    const bytes = new TextEncoder().encode(fixtureGcode({ layers: 2 }));
    expect(readPrinterFile(bytes, 'gcode')).toEqual({ gcode: bytes, slicedPlate: undefined, filamentColor: undefined });
    expect(loadPrinterProgram(bytes, 'gcode').program.layerTable).toHaveLength(2);
  });

  it('should refuse a container without the plate member', () => {
    expect(() => readPrinterFile(zipHead, 'container')).toThrow();
  });

  it("should take the plate from Bambu Studio's config block when the container names none Tau knows", () => {
    const gcode = `; HEADER_BLOCK_START\n; CONFIG_BLOCK_START\n; curr_bed_type = High Temp Plate\n; CONFIG_BLOCK_END\n${fixtureGcode({ layers: 2 })}`;
    const unspecified = writeBambuContainer({ gcode, modelName: 'fixture' });
    expect(readPrinterFile(unspecified, 'container').slicedPlate?.id).toBe('high-temperature');
    expect(readPrinterFile(new TextEncoder().encode(gcode), 'gcode').slicedPlate?.id).toBe('high-temperature');
    const cool = writeBambuContainer({ gcode, modelName: 'fixture', plate: 'cool_plate' });
    expect(readPrinterFile(cool, 'container').slicedPlate?.id).toBe('cool');
  });
});

const encode = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);

describe('readGcodeSetting', () => {
  it("should read Bambu Studio's leading config block", () => {
    expect(
      readGcodeSetting(encode('; HEADER_BLOCK_START\n; curr_bed_type = Textured PEI Plate\nG28\n'), 'curr_bed_type'),
    ).toBe('Textured PEI Plate');
  });

  it('should read a config block at the end of a long file and ignore the middle', () => {
    const middle = 'G1 X1 Y1\n'.repeat(20_000);
    expect(readGcodeSetting(encode(`G28\n${middle}; curr_bed_type = Cool Plate\n`), 'curr_bed_type')).toBe(
      'Cool Plate',
    );
    expect(
      readGcodeSetting(encode(`G28\n${middle}; curr_bed_type = Cool Plate\n${middle}`), 'curr_bed_type'),
    ).toBeUndefined();
  });

  it('should report nothing when no setting is present', () => {
    expect(readGcodeSetting(encode('G28\nG1 X1 F600\n'), 'curr_bed_type')).toBeUndefined();
  });
});

describe('sliced filament colour', () => {
  it("should take the first colour of the config block's filament list", () => {
    const gcode = `; CONFIG_BLOCK_START\n; filament_colour = #f5a623;#FFFFFF\n; CONFIG_BLOCK_END\n${fixtureGcode({ layers: 1 })}`;
    expect(readPrinterFile(encode(gcode), 'gcode').filamentColor).toBe('#F5A623');
    expect(readPrinterFile(writeBambuContainer({ gcode, modelName: 'fixture' }), 'container').filamentColor).toBe(
      '#F5A623',
    );
    expect(readPrinterFile(encode(fixtureGcode({ layers: 1 })), 'gcode').filamentColor).toBeUndefined();
  });
});
