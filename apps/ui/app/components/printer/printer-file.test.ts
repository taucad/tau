import { describe, expect, it } from 'vitest';
import { writeBambuContainer } from '@taucad/slicer/container';
import { extractGcode, hasZipSignature, isPrinterFileName, printerFileKind } from '#components/printer/printer-file.js';
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

describe('extractGcode and loadPrinterProgram', () => {
  it('should read the plate member out of a Bambu container and parse it', () => {
    const gcode = fixtureGcode({ layers: 3 });
    const container = writeBambuContainer({ gcode, modelName: 'fixture', plate: 'textured-pei' });
    expect(printerFileKind('fixture.gcode.3mf', container.subarray(0, 8))).toBe('container');
    expect(new TextDecoder().decode(extractGcode(container, 'container'))).toBe(gcode);
    const program = loadPrinterProgram(container, 'container');
    expect(program.layerTable).toHaveLength(3);
    expect(program.coverage.complete).toBe(true);
  });

  it('should pass text G-code through untouched', () => {
    const bytes = new TextEncoder().encode(fixtureGcode({ layers: 2 }));
    expect(extractGcode(bytes, 'gcode')).toBe(bytes);
    expect(loadPrinterProgram(bytes, 'gcode').layerTable).toHaveLength(2);
  });

  it('should refuse a container without the plate member', () => {
    expect(() => extractGcode(zipHead, 'container')).toThrow();
  });
});
