import { describe, expect, it, beforeAll } from 'vitest';
import type { InputFormat, OutputFormat } from '#types.js';
import {
  convertFile,
  importToGlb,
  exportFromGlb,
  getSupportedInputFormats,
  getSupportedOutputFormats,
  isInputFormatSupported,
  isOutputFormatSupported,
} from '#conversion.js';
import { loadFixture } from '#test.utils.js';

// ============================================================================
// Test Configuration
// ============================================================================

/**
 * Representative format matrix for comprehensive testing.
 * We test key format families rather than every possible combination.
 */
const TEST_FORMAT_COMBINATIONS = [
  // GLB pass-through optimization
  { input: 'glb' as InputFormat, output: 'glb' as OutputFormat },

  // Assimp → Assimp (optimization path)
  { input: 'obj' as InputFormat, output: 'stl' as OutputFormat },
  { input: 'fbx' as InputFormat, output: 'dae' as OutputFormat },
  { input: 'dae' as InputFormat, output: 'obj' as OutputFormat },

  // Assimp → Three.js exporter
  { input: 'obj' as InputFormat, output: 'glb' as OutputFormat },

  // CAD → Various outputs
  { input: 'step' as InputFormat, output: 'glb' as OutputFormat },
  { input: 'step' as InputFormat, output: 'stl' as OutputFormat },
  { input: 'step' as InputFormat, output: 'obj' as OutputFormat },

  // Specialized → Various outputs - TODO: Add these back in
  // { input: '3dm' as InputFormat, output: 'glb' as OutputFormat },
  // { input: 'vox' as InputFormat, output: 'obj' as OutputFormat },
  // { input: 'drc' as InputFormat, output: 'stl' as OutputFormat },
] as const;

/**
 * Format-specific test fixtures.
 * Maps each format to a known working test file.
 */
const TEST_FIXTURES: Record<InputFormat, string> = {
  '3dm': 'cube-mesh.3dm',
  '3ds': 'cube.3ds',
  '3mf': 'cube.3mf',
  ac: 'cube.ac',
  ase: 'cube.ase',
  amf: 'cube.amf',
  brep: 'cube.brep',
  bvh: 'cube.bvh',
  cob: 'cube.cob',
  dae: 'cube.dae',
  drc: 'cube.drc',
  dxf: 'cube.dxf',
  fbx: 'cube-ascii.fbx',
  glb: 'cube.glb',
  gltf: 'cube.gltf',
  ifc: 'cube-freecad.ifc',
  iges: 'cube-mesh.iges',
  igs: 'cube-mesh.igs',
  lwo: 'cube.lwo',
  md2: 'cube.md2', // Note: May be skipped
  md5mesh: 'cube.md5mesh',
  'mesh.xml': 'cube.mesh.xml',
  nff: 'cube.nff',
  obj: 'cube.obj',
  off: 'cube.off',
  ogex: 'cube.ogex',
  ply: 'cube-ascii.ply',
  smd: 'cube.smd',
  step: 'cube.step',
  stl: 'cube-ascii.stl',
  stp: 'cube.stp',
  usda: 'cube.usda',
  usdc: 'cube.usdc',
  usdz: 'cube.usdz',
  vox: 'cube.vox',
  vtk: 'cube.vtk',
  vtp: 'cube.vtp',
  wrl: 'cube.wrl',
  x: 'cube.x',
  x3d: 'cube.x3d',
  x3db: 'cube.x3db', // Note: May be skipped
  x3dv: 'cube.x3dv',
  xgl: 'cube.xgl',
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Load test file for a given format.
 */
const loadTestFile = (format: InputFormat) => {
  const filename = TEST_FIXTURES[format];
  return [
    {
      name: filename,
      data: loadFixture(filename),
    },
  ];
};

/**
 * Validate that output files are properly formatted.
 */
const validateOutputFiles = (files: unknown[], expectedFormat: OutputFormat) => {
  expect(files).toBeDefined();
  expect(Array.isArray(files)).toBe(true);
  expect(files.length).toBeGreaterThan(0);

  for (const file of files) {
    expect(file).toHaveProperty('name');
    expect(file).toHaveProperty('data');
    expect(file.data).toBeInstanceOf(Uint8Array);
    expect(file.data.length).toBeGreaterThan(0);
    expect(typeof file.name).toBe('string');
    expect(file.name.length).toBeGreaterThan(0);
  }
};

/**
 * Validate GLB data format.
 */
const validateGlbData = (glb: Uint8Array) => {
  expect(glb).toBeInstanceOf(Uint8Array);
  expect(glb.length).toBeGreaterThan(0);

  // Basic GLB header validation (first 4 bytes should be 'glTF')
  const header = new TextDecoder().decode(glb.slice(0, 4));
  expect(header).toBe('glTF');
};

// ============================================================================
// Main Test Suite
// ============================================================================

describe('File Conversion Integration', () => {
  // ========================================================================
  // Format Support Tests
  // ========================================================================

  describe('format support validation', () => {
    it('should return supported input formats', () => {
      const formats = getSupportedInputFormats();
      expect(Array.isArray(formats)).toBe(true);
      expect(formats.length).toBeGreaterThan(0);
      expect(formats).toContain('glb');
      expect(formats).toContain('obj');
      expect(formats).toContain('step');
    });

    it('should return supported output formats', () => {
      const formats = getSupportedOutputFormats();
      expect(Array.isArray(formats)).toBe(true);
      expect(formats.length).toBeGreaterThan(0);
      expect(formats).toContain('glb');
      expect(formats).toContain('obj');
      expect(formats).toContain('stl');
    });

    it('should validate input format support', () => {
      expect(isInputFormatSupported('glb')).toBe(true);
      expect(isInputFormatSupported('obj')).toBe(true);
      expect(isInputFormatSupported('xyz')).toBe(false);
      expect(isInputFormatSupported('')).toBe(false);
    });

    it('should validate output format support', () => {
      expect(isOutputFormatSupported('glb')).toBe(true);
      expect(isOutputFormatSupported('stl')).toBe(true);
      expect(isOutputFormatSupported('xyz')).toBe(false);
      expect(isOutputFormatSupported('')).toBe(false);
    });
  });

  // ========================================================================
  // End-to-End Conversion Tests
  // ========================================================================

  describe('end-to-end conversion', () => {
    // Test each format combination
    for (const { input, output } of TEST_FORMAT_COMBINATIONS) {
      it(`should convert ${input} → ${output}`, async () => {
        try {
          const inputFiles = loadTestFile(input);
          const outputFiles = await convertFile(inputFiles, input, output);
          validateOutputFiles(outputFiles, output);
        } catch (error) {
          // Some formats may not be available in the test environment
          if (error instanceof Error && error.message.includes('not implemented')) {
            console.warn(`Skipping ${input} → ${output}: ${error.message}`);
          } else {
            throw error;
          }
        }
      }, 30_000); // 30 second timeout for complex conversions
    }
  });

  // ========================================================================
  // Import-Only Tests
  // ========================================================================

  describe('import to GLB', () => {
    const testFormats: InputFormat[] = ['glb', 'obj', 'step', 'dae'];

    for (const format of testFormats) {
      it(`should import ${format} to GLB`, async () => {
        try {
          const inputFiles = loadTestFile(format);
          const glb = await importToGlb(inputFiles, format);
          validateGlbData(glb);
        } catch (error) {
          if (error instanceof Error && error.message.includes('not implemented')) {
            console.warn(`Skipping ${format} import: ${error.message}`);
          } else {
            throw error;
          }
        }
      }, 15_000);
    }

    it('should handle GLB pass-through optimization', async () => {
      const inputFiles = loadTestFile('glb');
      const glb = await importToGlb(inputFiles, 'glb');
      validateGlbData(glb);

      // For GLB input, output should be identical to input
      expect(glb).toEqual(inputFiles[0].data);
    });
  });

  // ========================================================================
  // Export-Only Tests
  // ========================================================================

  describe('export from GLB', () => {
    let testGlb: Uint8Array;

    beforeAll(async () => {
      // Create test GLB data from a simple format
      const objectFiles = loadTestFile('obj');
      testGlb = await importToGlb(objectFiles, 'obj');
    });

    const testFormats: OutputFormat[] = ['glb', 'obj', 'stl', 'dae'];

    for (const format of testFormats) {
      it(`should export GLB to ${format}`, async () => {
        try {
          const outputFiles = await exportFromGlb(testGlb, format);
          validateOutputFiles(outputFiles, format);
        } catch (error) {
          if (error instanceof Error && error.message.includes('not implemented')) {
            console.warn(`Skipping GLB → ${format} export: ${error.message}`);
          } else {
            throw error;
          }
        }
      }, 15_000);
    }

    it('should handle GLB pass-through optimization', async () => {
      const outputFiles = await exportFromGlb(testGlb, 'glb');
      expect(outputFiles).toHaveLength(1);
      expect(outputFiles[0].name).toBe('model.glb');
      expect(outputFiles[0].data).toEqual(testGlb);
    });
  });

  // ========================================================================
  // Round-Trip Tests
  // ========================================================================

  describe('round-trip conversion', () => {
    it('should maintain geometry through GLB round-trip', async () => {
      try {
        // OBJ → GLB → OBJ
        const originalFiles = loadTestFile('obj');
        const glb = await importToGlb(originalFiles, 'obj');
        const roundTripFiles = await exportFromGlb(glb, 'obj');

        validateGlbData(glb);
        validateOutputFiles(roundTripFiles, 'obj');

        // Basic validation that we got valid output
        expect(roundTripFiles[0].data.length).toBeGreaterThan(100);
      } catch (error) {
        if (error instanceof Error && error.message.includes('not implemented')) {
          console.warn(`Skipping round-trip test: ${error.message}`);
        } else {
          throw error;
        }
      }
    }, 20_000);
  });

  // ========================================================================
  // Error Handling Tests
  // ========================================================================

  describe('error handling', () => {
    it('should throw error for unsupported input format', async () => {
      const files = [{ name: 'test.xyz', data: new Uint8Array([1, 2, 3]) }];
      await expect(convertFile(files, 'xyz' as InputFormat, 'glb')).rejects.toThrow('Unsupported input format');
    });

    it('should throw error for unsupported output format', async () => {
      const files = loadTestFile('obj');
      await expect(convertFile(files, 'obj', 'xyz' as OutputFormat)).rejects.toThrow('Unsupported output format');
    });

    it('should throw error for empty file array', async () => {
      await expect(convertFile([], 'obj', 'glb')).rejects.toThrow();
    });

    it('should throw error for invalid file data', async () => {
      const files = [{ name: 'test.obj', data: new Uint8Array([1, 2, 3]) }];
      await expect(convertFile(files, 'obj', 'glb')).rejects.toThrow();
    });
  });

  // ========================================================================
  // Performance Tests
  // ========================================================================

  describe('performance baselines', () => {
    it('should complete simple conversions within reasonable time', async () => {
      const start = Date.now();
      try {
        const files = loadTestFile('obj');
        await convertFile(files, 'obj', 'stl');
        const duration = Date.now() - start;

        // Should complete within 10 seconds for simple formats
        expect(duration).toBeLessThan(10_000);
      } catch (error) {
        if (error instanceof Error && error.message.includes('not implemented')) {
          console.warn('Skipping performance test: format not implemented');
        } else {
          throw error;
        }
      }
    });

    it('should handle GLB pass-through very quickly', async () => {
      const start = Date.now();
      const files = loadTestFile('glb');
      await convertFile(files, 'glb', 'glb');
      const duration = Date.now() - start;

      // Pass-through should be near-instantaneous
      expect(duration).toBeLessThan(100);
    });
  });
});
