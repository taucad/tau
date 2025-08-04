// ============================================================================
// Development Helper Tests
// ============================================================================

import { describe, it, expect } from 'vitest';
import { importThreeJs } from '#threejs-import.js';
import { createThreeTestUtils, loadFixture } from '#threejs-test.utils.js';
import type { InputFile } from '#types.js';

describe('development helpers', () => {
  const utils = createThreeTestUtils();

  // Utility to help create test expectations for new fixtures
  it.skip('generate geometry signature for new fixture', async () => {
    const fixtureName = 'cube.stl'; // Change this to your new fixture
    const format = 'stl'; // Change this to match your format

    const inputFile: InputFile = {
      name: fixtureName,
      data: loadFixture(fixtureName),
    };

    const object3d = await importThreeJs(inputFile, format as 'gltf' | 'stl');
    const signature = utils.createGeometrySignature(object3d);
    const structure = utils.getObjectStructure(object3d);

    console.log('=== GEOMETRY SIGNATURE ===');
    console.log(JSON.stringify(signature, null, 2));
    console.log('\n=== OBJECT STRUCTURE ===');
    console.log(JSON.stringify(structure, null, 2));

    // Use this information to create your test case configuration:
    const testCaseTemplate = {
      format,
      fixtureName,
      description: `${fixtureName} description`,
      geometry: {
        vertexCount: signature.vertexCount,
        faceCount: signature.faceCount,
        meshCount: signature.meshCount,
        boundingBox: signature.boundingBox,
      },
      structure: {
        type: structure['type'],
        // Add other structure expectations as needed
      },
    };

    console.log('\n=== TEST CASE TEMPLATE ===');
    console.log(JSON.stringify(testCaseTemplate, null, 2));

    // This assertion ensures the test actually runs and validates the signature
    expect(signature.meshCount).toBeGreaterThan(0);
    expect(signature.vertexCount).toBeGreaterThan(0);
    expect(signature.faceCount).toBeGreaterThan(0);
    expect(structure['type']).toBeDefined();
  });
});
