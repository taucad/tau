import { describe, expect, it } from 'vitest';

import { fileExtensionSet, formatConfigurations, lookupMimeType, mimeTypes } from '@taucad/types/constants';

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
