import { describe, expect, it } from 'vitest';
import { fileExtensionSet, fileExtensions, lookupMimeType, mimeTypes } from '#constants/mime-types.constants.js';

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
