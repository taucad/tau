import { describe, expect, it } from 'vitest';
import { lookupExportFidelity, exportFidelities } from '#constants/file.constants.js';

describe('lookupExportFidelity', () => {
  it('should classify step as brep fidelity', () => {
    expect(lookupExportFidelity('step')).toBe('brep');
  });

  it('should classify stp as brep fidelity', () => {
    expect(lookupExportFidelity('stp')).toBe('brep');
  });

  it('should classify iges as brep fidelity', () => {
    expect(lookupExportFidelity('iges')).toBe('brep');
  });

  it('should classify igs as brep fidelity', () => {
    expect(lookupExportFidelity('igs')).toBe('brep');
  });

  it('should classify brep as brep fidelity', () => {
    expect(lookupExportFidelity('brep')).toBe('brep');
  });

  it('should classify glb as mesh fidelity', () => {
    expect(lookupExportFidelity('glb')).toBe('mesh');
  });

  it('should classify gltf as mesh fidelity', () => {
    expect(lookupExportFidelity('gltf')).toBe('mesh');
  });

  it('should classify stl as mesh fidelity', () => {
    expect(lookupExportFidelity('stl')).toBe('mesh');
  });

  it('should classify obj as mesh fidelity', () => {
    expect(lookupExportFidelity('obj')).toBe('mesh');
  });

  it('should default to mesh fidelity for an unknown extension', () => {
    expect(lookupExportFidelity('unknown-ext')).toBe('mesh');
  });
});

describe('exportFidelities', () => {
  it('should expose explicit brep entries for cad-interchange formats', () => {
    expect(exportFidelities).toMatchObject({
      step: 'brep',
      stp: 'brep',
      iges: 'brep',
      igs: 'brep',
      brep: 'brep',
    });
  });
});
