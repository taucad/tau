import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import rhino3dm from 'rhino3dm';
import type * as rhino from 'rhino3dm';

/**
 * Creates a 3dm file with instance definitions programmatically
 * Contains:
 * - A 2x2x2mm cube as an instance definition
 * - Multiple instances of the cube at different positions and rotations
 *
 * @returns the 3dm file as a byte array
 */
export async function createCubeInstanceFixture(): Promise<Uint8Array<ArrayBuffer>> {
  const rhino = await rhino3dm();

  // Load an existing cube mesh from our fixtures
  const fixturePath = join(import.meta.dirname, '..', 'cube-mesh.3dm');
  const existingFileData = readFileSync(fixturePath);
  const existingDocument = rhino.File3dm.fromByteArray(new Uint8Array(existingFileData));

  // Create a new document for our instance-based version
  const rhinoFile = new rhino.File3dm();

  // Get the first mesh from the existing document
  const existingObjects = existingDocument.objects();
  let cubeMesh = null;

  for (let i = 0; i < existingObjects.count; i++) {
    const object = existingObjects.get(i);
    const geom = object.geometry();
    if (geom.objectType === rhino.ObjectType.Mesh) {
      cubeMesh = geom as rhino.Mesh;
      break;
    }
  }

  if (!cubeMesh) {
    throw new Error('No mesh found in cube-mesh.3dm fixture');
  }

  // Create object attributes for the cube
  const cubeAttributes = new rhino.ObjectAttributes();
  cubeAttributes.name = 'TestCube';

  // Add the cube to the document as an instance definition object
  rhinoFile.objects().add(cubeMesh, cubeAttributes);

  // Create an instance definition from this geometry
  const instanceDefinitionIndex = rhinoFile.instanceDefinitions().add(
    'CubeBlock',
    'A 2x2x2mm test cube',
    '',
    '',
    [0, 0, 0], // Base point as array
    [cubeMesh],
    [cubeAttributes],
  );

  if (instanceDefinitionIndex < 0) {
    throw new Error('Failed to create instance definition');
  }

  // Get the instance definition we just created
  const instanceDefinition = rhinoFile.instanceDefinitions().get(instanceDefinitionIndex);

  // Create multiple instance references
  const instancePositions = [
    { x: 5, y: 0, z: 0 },
    { x: 10, y: 0, z: 0 },
    { x: 0, y: 5, z: 0 },
    { x: 5, y: 5, z: 0 },
  ];

  for (const position of instancePositions) {
    // Create transformation matrix using XYZ translation
    const transform = rhino.Transform.translationXYZ(position.x, position.y, position.z);

    // Create instance reference geometry
    // @ts-expect-error -- InstanceReference is not typed correctly.
    const instanceRef = new rhino.InstanceReference(instanceDefinition.id, transform);

    // Create attributes for the instance reference
    const refAttributes = new rhino.ObjectAttributes();

    // Add instance reference to document
    rhinoFile.objects().add(instanceRef, refAttributes);
  }

  // Convert to byte array
  const bytes = rhinoFile.toByteArray() as Uint8Array<ArrayBuffer>;

  return bytes;
}
