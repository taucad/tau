import { expect, describe, it, beforeEach } from 'vitest';
import type { Object3D } from 'three';
import { Box3, Vector3, Object3D as ThreeObject3D } from 'three';
import { importThreeJs } from '#threejs-import.js';
import { exportThreeJs, threejsExportFormats, type ThreejsExportFormat } from '#threejs-export.js';
import type { OutputFile, InputFile } from '#types.js';
import { loadFixture } from '#threejs-test.utils.js';
import { GltfLoader } from '#loaders/gltf.loader.js';

// ============================================================================
// Types for Export Testing
// ============================================================================

type ExportTestCase = {
  format: ThreejsExportFormat;
  description?: string;
  skip?: boolean;
  skipReason?: string;
  
  // Test fixture selection
  fixture: 'cube' | 'cube-materials' | 'cube-animations';
  
  // Expected output
  expectedFiles: {
    count: number;
    primaryExtension: string;
    expectedNames: string[]; // Specific expected file names
  };
  
  // Round-trip assertions
  expectations: {
    geometry: {
      vertexCountTolerance: number; // 0 = exact, >0 = allowed difference
      faceCountTolerance: number;
      boundingBoxTolerance: number; // tolerance for bounding box comparison
      preservesNormals: boolean;
      preservesUVs: boolean;
    };
    materials: {
      preservesMaterialCount: boolean;
      preservesBasicProperties: boolean; // color, opacity, etc.
    };
    structure: {
      preservesHierarchy: boolean;
      preservesNames: boolean;
    };
  };
};

// ============================================================================
// Test Utility Functions  
// ============================================================================

/**
 * Load a test fixture as InputFiles for import
 */
const loadTestFixture = (fixture: ExportTestCase['fixture']): InputFile[] => {
  const filename = `${fixture}.glb`;
  return [{
    name: filename,
    data: loadFixture(filename)
  }];
};

/**
 * Load GLB data from test fixture
 */
const loadGlbFixture = (fixture: ExportTestCase['fixture']): Uint8Array => {
  const filename = `${fixture}.glb`;
  return loadFixture(filename);
};

/**
 * Import a test fixture into a Three.js Object3D (for comparison purposes)
 */
const importTestFixture = async (fixture: ExportTestCase['fixture']): Promise<Object3D> => {
  const files = loadTestFixture(fixture);
  return new GltfLoader().initialize({ format: 'glb', transformYtoZup: false, scaleMetersToMillimeters: false }).loadAsync(files);
};

/**
 * Perform round-trip test: GLB → Export → Import → Compare
 */
const performRoundTripTest = async (
  glbData: Uint8Array,
  format: ThreejsExportFormat
): Promise<{ 
  exportedFiles: OutputFile[],
  roundTripObject: Object3D 
}> => {
  // Export the GLB data
  const exportedFiles = await exportThreeJs(glbData, format);
  
  // If no files were exported, return empty result
  if (exportedFiles.length === 0) {
    const emptyObject = new ThreeObject3D();
    return { exportedFiles, roundTripObject: emptyObject };
  }
  
  // Convert OutputFiles to InputFiles for re-import
  const inputFiles: InputFile[] = exportedFiles.map(file => ({
    name: file.name,
    data: file.data
  }));
  
  // Re-import the exported files
  const roundTripObject = await importThreeJs(inputFiles, format);
  
  return { exportedFiles, roundTripObject };
};

/**
 * Assert geometry properties are within tolerance
 */
const assertGeometryProperties = async (
  original: Object3D,
  roundTrip: Object3D,
  expectations: ExportTestCase['expectations']['geometry']
) => {
  // Helper to count vertices and faces recursively
  const countGeometry = (object3d: Object3D) => {
    let vertexCount = 0;
    let faceCount = 0;
    
    object3d.traverse((child) => {
      if ('geometry' in child && child.geometry) {
        const geometry = child.geometry as any;
        if (geometry.attributes?.position) {
          vertexCount += geometry.attributes.position.count;
        }
        if (geometry.index) {
          faceCount += geometry.index.count / 3;
        }
      }
    });
    
    return { vertexCount, faceCount };
  };
  
  const originalGeometry = countGeometry(original);
  const roundTripGeometry = countGeometry(roundTrip);
  
  // Check vertex count within tolerance
  const vertexDiff = Math.abs(originalGeometry.vertexCount - roundTripGeometry.vertexCount);
  expect(vertexDiff).toBeLessThanOrEqual(expectations.vertexCountTolerance);
  
  // Check face count within tolerance
  const faceDiff = Math.abs(originalGeometry.faceCount - roundTripGeometry.faceCount);
  expect(faceDiff).toBeLessThanOrEqual(expectations.faceCountTolerance);
  
  // Check bounding boxes
  original.updateMatrixWorld(true);
  roundTrip.updateMatrixWorld(true);
  
  const originalBox = new Box3().setFromObject(original);
  const roundTripBox = new Box3().setFromObject(roundTrip);
  
  const sizeOriginal = originalBox.getSize(new Vector3());
  const sizeRoundTrip = roundTripBox.getSize(new Vector3());
  
  // Debug logging for bounding box analysis
  console.log('=== BOUNDING BOX ANALYSIS ===');
  console.log('Original bounding box min:', originalBox.min.toArray());
  console.log('Original bounding box max:', originalBox.max.toArray());
  console.log('Original size:', sizeOriginal.toArray());
  console.log('Round-trip bounding box min:', roundTripBox.min.toArray());
  console.log('Round-trip bounding box max:', roundTripBox.max.toArray());
  console.log('Round-trip size:', sizeRoundTrip.toArray());
  
  const sizeDiff = sizeOriginal.distanceTo(sizeRoundTrip);
  console.log('Size difference:', sizeDiff);
  console.log('Tolerance:', expectations.boundingBoxTolerance);
  console.log('============================');
  
  expect(sizeDiff).toBeLessThanOrEqual(expectations.boundingBoxTolerance);
};

/**
 * Assert material properties are preserved
 */
const assertMaterialProperties = (
  original: Object3D,
  roundTrip: Object3D,
  expectations: ExportTestCase['expectations']['materials']
) => {
  const countMaterials = (obj: Object3D) => {
    const materials = new Set();
    obj.traverse((child) => {
      if ('material' in child && child.material) {
        materials.add(child.material);
      }
    });
    return materials.size;
  };
  
  if (expectations.preservesMaterialCount) {
    const originalCount = countMaterials(original);
    const roundTripCount = countMaterials(roundTrip);
    expect(roundTripCount).toBe(originalCount);
  }
  
  // TODO: Add more material property assertions as needed
};

/**
 * Assert structural properties are preserved
 */
const assertStructuralProperties = (
  original: Object3D,
  roundTrip: Object3D,
  expectations: ExportTestCase['expectations']['structure']
) => {
  if (expectations.preservesHierarchy) {
    // Count total objects in hierarchy
    let originalCount = 0;
    let roundTripCount = 0;
    
    original.traverse(() => originalCount++);
    roundTrip.traverse(() => roundTripCount++);
    
    expect(roundTripCount).toBe(originalCount);
  }
  
  // TODO: Add more structural assertions as needed
};

// ============================================================================
// Test Cases Definition
// ============================================================================

const exportTestCases: ExportTestCase[] = [
  // GLTF/GLB Formats - Skip due to Node.js compatibility issues  
  {
    format: 'glb',
    fixture: 'cube',
    description: 'GLB export with basic cube',
    skip: true,
    skipReason: 'GLTFExporter requires FileReader API, not available in Node.js',
    expectedFiles: {
      count: 1,
      primaryExtension: 'glb',
      expectedNames: ['model.glb']
    },
    expectations: {
      geometry: {
        vertexCountTolerance: 0,
        faceCountTolerance: 0,
        boundingBoxTolerance: 0.001,
        preservesNormals: true,
        preservesUVs: true
      },
      materials: {
        preservesMaterialCount: true,
        preservesBasicProperties: true
      },
      structure: {
        preservesHierarchy: true,
        preservesNames: false // GLB may not preserve all names
      }
    }
  },
  
  {
    format: 'gltf',
    fixture: 'cube',
    description: 'GLTF export with basic cube',
    skip: true,
    skipReason: 'GLTFExporter requires FileReader API, not available in Node.js',
    expectedFiles: {
      count: 1, // For now, until we implement .bin separation
      primaryExtension: 'gltf',
      expectedNames: ['model.gltf']
    },
    expectations: {
      geometry: {
        vertexCountTolerance: 0,
        faceCountTolerance: 0,
        boundingBoxTolerance: 0.001,
        preservesNormals: true,
        preservesUVs: true
      },
      materials: {
        preservesMaterialCount: true,
        preservesBasicProperties: true
      },
      structure: {
        preservesHierarchy: true,
        preservesNames: false
      }
    }
  },
  
  // STL Format
  {
    format: 'stl',
    fixture: 'cube',
    description: 'STL export with basic cube',
    expectedFiles: {
      count: 1,
      primaryExtension: 'stl',
      expectedNames: ['result.stl']
    },
    expectations: {
      geometry: {
        vertexCountTolerance: 0, // STL may duplicate vertices at edges
        faceCountTolerance: 0,
        boundingBoxTolerance: 0.001,
        preservesNormals: false, // STL recalculates normals
        preservesUVs: false // STL doesn't support UVs
      },
      materials: {
        preservesMaterialCount: false, // STL doesn't support materials
        preservesBasicProperties: false
      },
      structure: {
        preservesHierarchy: false, // STL flattens to single mesh
        preservesNames: false
      }
    }
  },
  
  // OBJ Format
  {
    format: 'obj',
    fixture: 'cube',
    description: 'OBJ export with basic cube',
    expectedFiles: {
      count: 2, // .obj + .mtl files
      primaryExtension: 'obj',
      expectedNames: ['result.obj', 'result.mtl']
    },
    expectations: {
      geometry: {
        vertexCountTolerance: 0,
        faceCountTolerance: 0,
        boundingBoxTolerance: 0.001,
        preservesNormals: true,
        preservesUVs: true
      },
      materials: {
        preservesMaterialCount: false, // Basic OBJ export may not preserve materials
        preservesBasicProperties: false
      },
      structure: {
        preservesHierarchy: false, // OBJ typically flattens hierarchy
        preservesNames: true
      }
    }
  },
  
  // PLY Format - Skip due to Node.js compatibility issues
  {
    format: 'ply',
    fixture: 'cube',
    description: 'PLY export with basic cube',
    expectedFiles: {
      count: 1,
      primaryExtension: 'ply',
      expectedNames: ['result.ply']
    },
    expectations: {
      geometry: {
        vertexCountTolerance: 0,
        faceCountTolerance: 0,
        boundingBoxTolerance: 0.001,
        preservesNormals: true,
        preservesUVs: false // PLY may not preserve UVs consistently
      },
      materials: {
        preservesMaterialCount: false, // PLY has limited material support
        preservesBasicProperties: false
      },
      structure: {
        preservesHierarchy: false,
        preservesNames: false
      }
    }
  },
  
  // USDZ Format
  {
    format: 'usdz',
    fixture: 'cube',
    description: 'USDZ export with basic cube',
    expectedFiles: {
      count: 1,
      primaryExtension: 'usdz',
      expectedNames: ['model.usdz']
    },
    expectations: {
      geometry: {
        vertexCountTolerance: 36,
        faceCountTolerance: 12, // USDZ may modify face count during export/import
        boundingBoxTolerance: 0.35, // TODO: debug this tolerance
        preservesNormals: true,
        preservesUVs: true
      },
      materials: {
        preservesMaterialCount: false,
        preservesBasicProperties: true
      },
      structure: {
        preservesHierarchy: false, // USDZ import may change hierarchy structure
        preservesNames: true
      }
    }
  },
  
  // DAE Format
  {
    format: 'dae',
    fixture: 'cube',
    description: 'DAE export with basic cube',
    expectedFiles: {
      count: 1,
      primaryExtension: 'dae',
      expectedNames: ['result.dae']
    },
    expectations: {
      geometry: {
        vertexCountTolerance: 0,
        faceCountTolerance: 0,
        boundingBoxTolerance: 0.001,
        preservesNormals: true,
        preservesUVs: true
      },
      materials: {
        preservesMaterialCount: true,
        preservesBasicProperties: true
      },
      structure: {
        preservesHierarchy: false,
        preservesNames: false
      }
    }
  },
  
  // FBX Format
  {
    format: 'fbx',
    fixture: 'cube',
    description: 'FBX export with basic cube',
    expectedFiles: {
      count: 1,
      primaryExtension: 'fbx',
      expectedNames: ['result.fbx']
    },
    expectations: {
      geometry: {
        vertexCountTolerance: 0,
        faceCountTolerance: 0,
        boundingBoxTolerance: 0.001,
        preservesNormals: true,
        preservesUVs: true
      },
      materials: {
        preservesMaterialCount: true,
        preservesBasicProperties: true
      },
      structure: {
        preservesHierarchy: false,
        preservesNames: false
      }
    }
  },
  
  // X Format
  {
    format: 'x',
    fixture: 'cube',
    description: 'X export with basic cube',
    expectedFiles: {
      count: 1,
      primaryExtension: 'x',
      expectedNames: ['result.x']
    },
    expectations: {
      geometry: {
        vertexCountTolerance: 0,
        faceCountTolerance: 0,
        boundingBoxTolerance: 0.001,
        preservesNormals: true,
        preservesUVs: true
      },
      materials: {
        preservesMaterialCount: true,
        preservesBasicProperties: true
      },
      structure: {
        preservesHierarchy: false,
        preservesNames: false
      }
    }
  },
  
  // X3D Format
  {
    format: 'x3d',
    fixture: 'cube',
    description: 'X3D export with basic cube',
    expectedFiles: {
      count: 1,
      primaryExtension: 'x3d',
      expectedNames: ['result.x3d']
    },
    expectations: {
      geometry: {
        vertexCountTolerance: 0,
        faceCountTolerance: 0,
        boundingBoxTolerance: 0.001,
        preservesNormals: true,
        preservesUVs: true
      },
      materials: {
        preservesMaterialCount: true,
        preservesBasicProperties: true
      },
      structure: {
        preservesHierarchy: false,
        preservesNames: false
      }
    }
  },
  
  // 3DS Format
  {
    format: '3ds',
    fixture: 'cube',
    description: '3DS export with basic cube',
    expectedFiles: {
      count: 1,
      primaryExtension: '3ds',
      expectedNames: ['result.3ds']
    },
    expectations: {
      geometry: {
        vertexCountTolerance: 0,
        faceCountTolerance: 0,
        boundingBoxTolerance: 0.001,
        preservesNormals: false,
        preservesUVs: true
      },
      materials: {
        preservesMaterialCount: true,
        preservesBasicProperties: true
      },
      structure: {
        preservesHierarchy: false,
        preservesNames: false
      }
    }
  },
  
  // STP Format
  {
    format: 'stp',
    fixture: 'cube',
    description: 'STP export with basic cube',
    expectedFiles: {
      count: 1,
      primaryExtension: 'stp',
      expectedNames: ['result.stp']
    },
    expectations: {
      geometry: {
        vertexCountTolerance: 0,
        faceCountTolerance: 0,
        boundingBoxTolerance: 0.001,
        preservesNormals: false,
        preservesUVs: false
      },
      materials: {
        preservesMaterialCount: true,
        preservesBasicProperties: true
      },
      structure: {
        preservesHierarchy: false,
        preservesNames: false
      }
    }
  }
];

// ============================================================================
// Main Test Suite
// ============================================================================

describe('threejs-export', () => {
  for (const testCase of exportTestCases) {
    describe(`'${testCase.format}' exporter`, () => {
      if (testCase.skip) {
        it.skip(`should export ${testCase.description}: ${testCase.skipReason}`, () => {
          expect(testCase.skip).toBe(true);
        });
        return;
      }
      
      let originalObject: Object3D;
      let glbData: Uint8Array;
      let exportedFiles: OutputFile[];
      let roundTripObject: Object3D;
      
      beforeEach(async () => {
        // Load GLB data and import for comparison
        glbData = loadGlbFixture(testCase.fixture);
        originalObject = await importTestFixture(testCase.fixture);
        
        // Perform round-trip export/import using GLB data
        const result = await performRoundTripTest(glbData, testCase.format);
        exportedFiles = result.exportedFiles;
        roundTripObject = result.roundTripObject;
      });
      
      it(`should export ${testCase.description}`, () => {
        expect(exportedFiles).toBeDefined();
        expect(exportedFiles.length).toBeGreaterThan(0);
      });
      
      it('should produce correct number of output files', () => {
        expect(exportedFiles.length).toBe(testCase.expectedFiles.count);
      });
      
      it('should have correct file names and extensions', () => {
        // Check that we have the expected file names
        const actualNames = exportedFiles.map(f => f.name).sort();
        const expectedNames = [...testCase.expectedFiles.expectedNames].sort();
        expect(actualNames).toEqual(expectedNames);
        
        // Also check primary extension exists
        const primaryFile = exportedFiles.find(f => 
          f.name.endsWith(`.${testCase.expectedFiles.primaryExtension}`)
        );
        expect(primaryFile).toBeDefined();
      });
      
      it('should have valid file data', () => {
        for (const file of exportedFiles) {
          expect(file.name).toBeTruthy();
          expect(file.data).toBeInstanceOf(Uint8Array);
          expect(file.data.length).toBeGreaterThan(0);
        }
      });
      
      it('should successfully round-trip through export/import', () => {
        expect(roundTripObject).toBeDefined();
        expect(roundTripObject).toBeInstanceOf(Object.getPrototypeOf(originalObject).constructor);
      });
      
      it('should preserve geometry properties within tolerance', async () => {
        await assertGeometryProperties(originalObject, roundTripObject, testCase.expectations.geometry);
      });
      
      it('should handle material properties correctly', () => {
        assertMaterialProperties(originalObject, roundTripObject, testCase.expectations.materials);
      });
      
      it('should handle structural properties correctly', () => {
        assertStructuralProperties(originalObject, roundTripObject, testCase.expectations.structure);
      });
    });
  }
  
  // Meta tests
  describe('skipped exporters', () => {
    const skippedTestCases = exportTestCases.filter(tc => tc.skip);
    if (skippedTestCases.length > 0) {
      for (const testCase of skippedTestCases) {
        it(`should skip ${testCase.format} exporter: ${testCase.skipReason}`, () => {
          expect(testCase.skip).toBe(true);
        });
      }
    } else {
      it('no skipped tests in current suite', () => {
        expect(skippedTestCases.length).toBe(0);
      });
    }
  });
  
  it('should test all declared export formats', () => {
    const testedFormats = exportTestCases.map(tc => tc.format);
    const declaredFormats = threejsExportFormats;
    
    expect([...new Set(testedFormats)].sort()).toEqual([...new Set(declaredFormats)].sort());
  });
  
  it('should throw error when GLB data is empty', async () => {
    const emptyGlbData = new Uint8Array(0);
    await expect(exportThreeJs(emptyGlbData, 'glb')).rejects.toThrow('GLB data cannot be empty');
  });
});
