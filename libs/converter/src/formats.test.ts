import { describe, expect, it } from 'vitest';
import type { SupportedImportFormat, SupportedExportFormat } from '#formats.js';
import { supportedImportFormats, supportedExportFormats } from '#formats.js';

describe('formats', () => {
  describe('supportedImportFormats', () => {
    it('should export a non-empty array of strings', () => {
      expect(supportedImportFormats).toBeInstanceOf(Array);
      expect(supportedImportFormats.length).toBeGreaterThan(0);
      for (const format of supportedImportFormats) {
        expect(typeof format).toBe('string');
      }
    });

    it('should include known import formats', () => {
      const expected: SupportedImportFormat[] = ['stl', 'step', '3dm', 'obj', 'glb', 'gltf', 'fbx', 'dxf'];
      for (const format of expected) {
        expect(supportedImportFormats).toContain(format);
      }
    });
  });

  describe('supportedExportFormats', () => {
    it('should export a non-empty array of strings', () => {
      expect(supportedExportFormats).toBeInstanceOf(Array);
      expect(supportedExportFormats.length).toBeGreaterThan(0);
      for (const format of supportedExportFormats) {
        expect(typeof format).toBe('string');
      }
    });

    it('should include known export formats', () => {
      const expected: SupportedExportFormat[] = ['stl', 'step', 'glb', 'gltf', 'fbx', 'obj'];
      for (const format of expected) {
        expect(supportedExportFormats).toContain(format);
      }
    });
  });

  describe('consistency', () => {
    it('should maintain consistency with full converter exports', async () => {
      const converter = await import('./index.js');

      expect([...supportedImportFormats].sort()).toEqual([...converter.supportedImportFormats].sort());
      expect([...supportedExportFormats].sort()).toEqual([...converter.supportedExportFormats].sort());
    });
  });
});
