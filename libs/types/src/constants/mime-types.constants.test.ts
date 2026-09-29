import { describe, expect, it } from 'vitest';
import { fileExtensionSet, fileExtensions, lookupMimeType, mimeTypes } from '#constants/mime-types.constants.js';
import { formatConfigurations } from '#constants/format-names.constants.js';

describe('mimeTypes', () => {
  it('should map the EDA kernel export extensions to their canonical MIME types', () => {
    expect(mimeTypes).toMatchObject({
      csv: 'text/csv',
      txt: 'text/plain',
      json: 'application/json',
    });
  });

  it('should derive fileExtensions and fileExtensionSet from every catalog key', () => {
    expect(fileExtensions).toEqual(Object.keys(mimeTypes));
    expect(fileExtensionSet.size).toBe(fileExtensions.length);
    expect(fileExtensionSet.has('csv')).toBe(true);
    expect(fileExtensionSet.has('txt')).toBe(true);
    expect(fileExtensionSet.has('json')).toBe(true);
  });
});

describe('lookupMimeType', () => {
  it('should resolve a catalogued extension', () => {
    expect(lookupMimeType('json')).toBe('application/json');
    expect(lookupMimeType('glb')).toBe('model/gltf-binary');
  });

  it('should default to application/octet-stream for an unknown extension', () => {
    expect(lookupMimeType('unknown-ext')).toBe('application/octet-stream');
  });
});

describe('mimeTypes', () => {
  it('should map the slicer toolpath extensions to their media types', () => {
    expect(lookupMimeType('gcode')).toBe('text/x.gcode');
    expect(lookupMimeType('gcode.3mf')).toBe('application/vnd.bambulab.gcode-3mf');
    expect(fileExtensionSet.has('gcode.3mf')).toBe(true);
  });

  it('should keep the plain 3MF model type distinct from the Bambu print container', () => {
    expect(mimeTypes['3mf']).toBe('model/3mf');
    expect(mimeTypes['gcode.3mf']).not.toBe(mimeTypes['3mf']);
  });

  it('should fall back to octet-stream for an unknown extension', () => {
    expect(lookupMimeType('not-a-format')).toBe('application/octet-stream');
  });

  it('should describe every extension with a format name', () => {
    for (const extension of Object.keys(mimeTypes)) {
      expect(formatConfigurations).toHaveProperty(extension);
    }
    expect(formatConfigurations['gcode.3mf'].name).toBe('Bambu print container (GCODE.3MF)');
  });
});
