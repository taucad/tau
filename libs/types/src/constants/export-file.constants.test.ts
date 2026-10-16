import { describe, expect, it } from 'vitest';
import { createExportFile } from '#constants/export-file.constants.js';

const bytes = new Uint8Array([1]);

describe('createExportFile', () => {
  it('appends the format extension to a kernel shape or assembly name', () => {
    expect(createExportFile('step', 'assembly', bytes).name).toBe('assembly.step');
    expect(createExportFile('stl', 'Shape 1', bytes).name).toBe('Shape 1.stl');
    expect(createExportFile('stl', 'bracket.v2', bytes).name).toBe('bracket.v2.stl');
  });

  it('keeps a name that already carries the extension', () => {
    expect(createExportFile('glb', 'model.glb', bytes).name).toBe('model.glb');
    expect(createExportFile('stl', 'PART.STL', bytes).name).toBe('PART.STL');
    expect(createExportFile('gcode.3mf', 'model.gcode.3mf', bytes).name).toBe('model.gcode.3mf');
  });
});
