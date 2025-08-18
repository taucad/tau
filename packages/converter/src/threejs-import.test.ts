import { describe, expect, it, beforeEach } from 'vitest';
import { Vector3, Mesh } from 'three';
import type { BufferGeometry, Object3D } from 'three';
import type { InputFile } from '#types.js';
import { importThreeJs, threejsImportFomats } from '#threejs-import.js';
import { createThreeTestUtils, loadTestData } from '#threejs-test.utils.js';
import type { LoaderTestCase, StructureExpectation } from '#threejs-test.utils.js';

// ============================================================================
// Test Configuration Registry
// ============================================================================

const loaderTestCases: LoaderTestCase[] = [
  {
    format: 'gltf',
    fixtureName: 'cube.gltf',
    description: 'Simple cube from GLTF format',
    geometry: {
      vertexCount: 36,
      faceCount: 12,
      meshCount: 1,
      boundingBox: {
        size: [2, 2, 2],
        center: [0, 0, 1],
      },
    },
    structure: {
      type: 'Group',
      children: [
        {
          name: 'node',
          type: 'Mesh',
        },
      ],
    },
  },
  {
    format: 'glb',
    fixtureName: 'cube.glb',
    description: 'Simple cube from GLB format',
    geometry: {
      vertexCount: 36,
      faceCount: 12,
      meshCount: 1,
      boundingBox: {
        size: [2, 2, 2],
        center: [0, 0, 1],
      },
    },
    structure: {
      type: 'Group',
      children: [
        {
          name: 'node',
          type: 'Mesh',
        },
      ],
    },
  },
  {
    format: 'glb',
    variant: 'draco',
    fixtureName: 'cube-draco.glb',
    description: 'Simple cube from GLB format with Draco compression',
    geometry: {
      vertexCount: 36,
      faceCount: 12,
      meshCount: 1,
      boundingBox: {
        size: [2, 2, 2],
        center: [0, 0, 1],
      },
    },
    structure: {
      type: 'Group',
      children: [
        {
          name: 'node',
          type: 'Mesh',
        },
      ],
    },
  },
  {
    format: 'glb',
    variant: 'draco',
    fixtureName: 'cube-draco.gltf',
    description: 'Simple cube from GLTF format with Draco compression',
    geometry: {
      vertexCount: 36,
      faceCount: 12,
      meshCount: 1,
      boundingBox: {
        size: [2, 2, 2],
        center: [0, 0, 1],
      },
    },
    structure: {
      type: 'Group',
      children: [
        {
          name: 'node',
          type: 'Mesh',
        },
      ],
    },
  },
  {
    format: 'stl',
    variant: 'binary',
    fixtureName: 'cube-bin.stl',
    description: 'Simple cube from binary STL format',
    geometry: {
      vertexCount: 36,
      faceCount: 12,
      meshCount: 1,
      boundingBox: {
        size: [2, 2, 2],
        center: [0, 0, 1],
      },
    },
    structure: {
      type: 'Group',
      children: [
        {
          type: 'Object3D',
        },
      ],
    },
  },
  {
    format: 'stl',
    variant: 'ascii',
    fixtureName: 'cube-ascii.stl',
    description: 'Simple cube from ASCII STL format',
    geometry: {
      vertexCount: 36,
      faceCount: 12,
      meshCount: 1,
      boundingBox: {
        size: [2, 2, 2],
        center: [0, 0, 1],
      },
    },
    structure: {
      type: 'Group',
      children: [
        {
          type: 'Object3D',
        },
      ],
    },
  },
  {
    format: 'obj',
    fixtureName: 'cube.obj',
    description: 'Simple cube from OBJ format',
    geometry: {
      vertexCount: 36,
      faceCount: 12,
      meshCount: 1,
      boundingBox: {
        size: [2, 2, 2],
        center: [0, 1, 0],
      },
    },
    structure: {
      type: 'Group',
      children: [
        {
          type: 'Object3D',
        },
      ],
    },
  },
  {
    format: 'ply',
    variant: 'binary',
    fixtureName: 'cube-bin.ply',
    description: 'Simple cube from binary PLY format',
    geometry: {
      vertexCount: 36,
      faceCount: 12,
      meshCount: 1,
      boundingBox: {
        size: [2, 2, 2],
        center: [0, 0, 1],
      },
    },
    structure: {
      type: 'Group',
      children: [
        {
          type: 'Mesh',
        },
      ],
    },
  },
  {
    format: 'ply',
    variant: 'ascii',
    fixtureName: 'cube-ascii.ply',
    description: 'Simple cube from ASCII PLY format',
    geometry: {
      vertexCount: 36,
      faceCount: 12,
      meshCount: 1,
      boundingBox: {
        size: [2, 2, 2],
        center: [0, 0, 1],
      },
    },
    structure: {
      type: 'Group',
      children: [
        {
          type: 'Mesh',
        },
      ],
    },
  },
  {
    format: '3dm',
    variant: 'brep',
    fixtureName: 'cube-brep.3dm',
    description: 'Simple cube from BREP 3DM format',
    skip: true,
    skipReason: 'BREP geometry is not supported for conversion.',
    geometry: {
      vertexCount: 36,
      faceCount: 12,
      meshCount: 1,
      boundingBox: {
        size: [2, 2, 2],
        center: [0, 0, 1],
      },
    },
  },
  {
    format: '3dm',
    variant: 'extrusion',
    fixtureName: 'cube-extrusion.3dm',
    description: 'Simple cube from EXTRUSION 3DM format',
    skip: true,
    skipReason: 'Extrusion geometry is not supported for conversion.',
    geometry: {
      vertexCount: 36,
      faceCount: 12,
      meshCount: 1,
      boundingBox: {
        size: [2, 2, 2],
        center: [0, 0, 1],
      },
    },
  },
  {
    format: '3dm',
    variant: 'mesh',
    fixtureName: 'cube-mesh.3dm',
    description: 'Simple cube from MESH 3DM format',
    geometry: {
      vertexCount: 36,
      faceCount: 12,
      meshCount: 1,
      boundingBox: {
        size: [2, 2, 2],
        center: [0, 0, 1],
      },
    },
  },
  {
    format: '3dm',
    variant: 'instance',
    async dataSource() {
      const { createCubeInstanceFixture } = await import('#fixtures/rhino3dm/cube-instance.js');
      return createCubeInstanceFixture();
    },
    description: 'Multiple instanced cubes from programmatic 3DM',
    geometry: {
      vertexCount: 180, // Original mesh + 4 instances
      faceCount: 60, // Original mesh + 4 instances
      meshCount: 5, // Original mesh + 4 instance references
      boundingBox: {
        size: [12, 7, 2],
        center: [5, 2.5, 1],
      },
    },
    structure: {
      type: 'Group',
      children: [
        { type: 'Mesh', name: 'TestCube' },
        { type: 'Mesh', name: 'TestCube' },
        { type: 'Mesh', name: 'TestCube' },
        { type: 'Mesh', name: 'TestCube' },
        { type: 'Mesh', name: 'TestCube' },
      ],
    },
  },
  {
    format: 'dae',
    fixtureName: 'cube.dae',
    description: 'Simple cube from DAE format',
    geometry: {
      vertexCount: 36,
      faceCount: 12,
      meshCount: 1,
      boundingBox: {
        size: [2, 2, 2],
        center: [0, 0, 1],
      },
    },
    structure: {
      type: 'Group',
    },
  },
  {
    format: 'fbx',
    variant: 'binary',
    fixtureName: 'cube-bin.fbx',
    description: 'Simple cube from binary FBX format',
    geometry: {
      vertexCount: 36,
      faceCount: 12,
      meshCount: 1,
      boundingBox: {
        size: [2, 2, 2],
        center: [0, 0, 1],
      },
    },
    structure: {
      type: 'Group',
    },
  },
  {
    format: 'fbx',
    variant: 'ascii',
    fixtureName: 'cube-ascii.fbx',
    description: 'Simple cube from ASCII FBX format',
    geometry: {
      vertexCount: 36,
      faceCount: 12,
      meshCount: 1,
      boundingBox: {
        size: [2, 2, 2],
        center: [0, 0, 1],
      },
    },
    structure: {
      type: 'Group',
    },
  },
  {
    format: 'fbx',
    variant: 'textures',
    fixtureName: 'cube-textures.fbx',
    description: 'Simple cube from ASCII FBX format with textures',
    geometry: {
      vertexCount: 36,
      faceCount: 12,
      meshCount: 1,
      boundingBox: {
        size: [2, 2, 2],
        center: [0, 0, 1],
      },
    },
    structure: {
      type: 'Group',
    },
  },
  {
    format: 'usdz',
    fixtureName: 'cube.usdz',
    description: 'Simple cube from USDZ format',
    geometry: {
      vertexCount: 36,
      faceCount: 12,
      meshCount: 1,
      boundingBox: {
        size: [2, 2, 2],
        center: [0, 0, 1],
      },
    },
    structure: {
      type: 'Group',
      children: [
        {
          type: 'Object3D',
        },
      ],
    },
  },
  {
    format: 'usda',
    fixtureName: 'cube.usda',
    description: 'USDA format is not supported yet.',
    geometry: {
      vertexCount: 36,
      faceCount: 12,
      meshCount: 1,
      boundingBox: {
        size: [2, 2, 2],
        center: [0, 0, 1],
      },
    },
    structure: {
      type: 'Group',
      children: [
        {
          type: 'Object3D',
        },
      ],
    },
  },
  {
    format: 'usdc',
    fixtureName: 'cube.usdc',
    description: 'USDC format is not supported yet.',
    geometry: {
      vertexCount: 36,
      faceCount: 12,
      meshCount: 1,
      boundingBox: {
        size: [2, 2, 2],
        center: [0, 0, 1],
      },
    },
    structure: {
      type: 'Group',
      children: [
        {
          type: 'Object3D',
        },
      ],
    },
  },
  {
    format: '3ds',
    fixtureName: 'cube.3ds',
    description: 'Simple cube from 3DS format',
    geometry: {
      vertexCount: 36,
      faceCount: 12,
      meshCount: 1,
      boundingBox: {
        size: [2, 2, 2],
        center: [0, 0, 1],
      },
    },
    structure: {
      type: 'Group',
      children: [
        {
          type: 'Object3D',
        },
      ],
    },
  },
  {
    format: '3mf',
    fixtureName: 'cube.3mf',
    description: 'Simple cube from 3MF format',
    geometry: {
      vertexCount: 36,
      faceCount: 12,
      meshCount: 1,
      boundingBox: {
        size: [2, 2, 2],
        center: [0, -1, 0],
      },
    },
    structure: {
      type: 'Group',
      children: [
        {
          type: 'Object3D',
        },
      ],
    },
  },
  {
    format: 'ifc',
    fixtureName: 'cube-freecad.ifc',
    description: 'Simple cube from IFC format (FreeCad)',
    geometry: {
      vertexCount: 36,
      faceCount: 12,
      meshCount: 1,
      boundingBox: {
        size: [2, 2, 2],
        center: [0, 0, 1],
      },
    },
    structure: {
      type: 'Group',
      children: [
        {
          type: 'Object3D',
        },
      ],
    },
  },
  {
    format: 'ifc',
    fixtureName: 'cube-blender.ifc',
    description: 'Simple cube from IFC format (Blender)',
    geometry: {
      vertexCount: 36,
      faceCount: 12,
      meshCount: 1,
      boundingBox: {
        size: [2, 2, 2],
        center: [0, 0, 1],
      },
    },
    structure: {
      type: 'Group',
      children: [
        {
          type: 'Object3D',
        },
      ],
    },
  },
  {
    format: 'kmz',
    fixtureName: 'cube.kmz',
    description: 'Simple cube from KMZ format',
    skip: true,
    skipReason: 'KMZ loader currently requires DOM parser, which is not available in Node.js.',
    geometry: {
      vertexCount: 36,
      faceCount: 12,
      meshCount: 1,
      boundingBox: {
        size: [2, 2, 2],
        center: [0, 0, 1],
      },
    },
    structure: {
      type: 'Group',
    },
  },
  {
    format: 'amf',
    fixtureName: 'cube.amf',
    description: 'Simple cube from AMF format',
    geometry: {
      vertexCount: 36,
      faceCount: 12,
      meshCount: 1,
      boundingBox: {
        size: [2, 2, 2],
        center: [0, 0, 1],
      },
    },
    structure: {
      type: 'Group',
      children: [
        {
          type: 'Object3D',
        },
      ],
    },
  },
  {
    format: 'step',
    fixtureName: 'cube.step',
    description: 'Simple cube from STEP format',
    geometry: {
      vertexCount: 24,
      faceCount: 8,
      meshCount: 1,
      boundingBox: {
        size: [2, 2, 2],
        center: [0, 0, 1],
      },
    },
    structure: {
      type: 'Group',
    },
  },
  {
    format: 'stp',
    fixtureName: 'cube.stp',
    description: 'Simple cube from STP format',
    geometry: {
      vertexCount: 24,
      faceCount: 8,
      meshCount: 1,
      boundingBox: {
        size: [2, 2, 2],
        center: [0, 0, 1],
      },
    },
    structure: {
      type: 'Group',
    },
  },
  {
    format: 'iges',
    variant: 'mesh',
    fixtureName: 'cube-mesh.iges',
    description: 'Simple cube from mesh IGE format',
    geometry: {
      vertexCount: 24,
      faceCount: 8,
      meshCount: 1,
      boundingBox: {
        size: [2, 2, 2],
        center: [0, 0, 1],
      },
    },
    structure: {
      type: 'Group',
    },
  },
  {
    format: 'igs',
    variant: 'mesh',
    fixtureName: 'cube-mesh.igs',
    description: 'Simple cube from mesh IGS format',
    geometry: {
      vertexCount: 24,
      faceCount: 8,
      meshCount: 1,
      boundingBox: {
        size: [2, 2, 2],
        center: [0, 0, 1],
      },
    },
    structure: {
      type: 'Group',
    },
  },
  {
    format: 'iges',
    variant: 'brep',
    fixtureName: 'cube-brep.iges',
    description: 'Simple cube from NURBS IGE format',
    geometry: {
      vertexCount: 24,
      faceCount: 8,
      meshCount: 6,
      facePoints: 4,
      boundingBox: {
        size: [2, 2, 2],
        center: [0, 0, 1],
      },
    },
    structure: {
      type: 'Group',
    },
  },
  {
    format: 'igs',
    variant: 'brep',
    fixtureName: 'cube-brep.igs',
    description: 'Simple cube from NURBS IGS format',
    geometry: {
      vertexCount: 24,
      faceCount: 8,
      meshCount: 6,
      facePoints: 4,
      boundingBox: {
        size: [2, 2, 2],
        center: [0, 0, 1],
      },
    },
    structure: {
      type: 'Group',
    },
  },
  {
    format: 'brep',
    fixtureName: 'cube.brep',
    description: 'Simple cube from BREP format',
    geometry: {
      vertexCount: 24,
      faceCount: 8,
      meshCount: 1,
      boundingBox: {
        size: [2, 2, 2],
        center: [0, 0, 1],
      },
    },
    structure: {
      type: 'Group',
    },
  },
  {
    format: 'gcode',
    fixtureName: 'cube.gcode',
    description: 'Simple cube from GCODE format',
    skip: true,
    skipReason: 'GCODE loader does not appear to produce correct geometry right now.',
    geometry: {
      vertexCount: 0,
      faceCount: 0,
      meshCount: 0,
      boundingBox: {
        size: [0, 0, 0],
        center: [0, 0, 0],
      },
    },
    structure: {
      type: 'Group',
    },
  },
  {
    format: 'wrl',
    fixtureName: 'cube.wrl',
    description: 'Simple cube from VRML format',
    geometry: {
      vertexCount: 36,
      faceCount: 12,
      meshCount: 1,
      boundingBox: {
        size: [2, 2, 2],
        center: [0, 0, 1],
      },
    },
    structure: {
      type: 'Group',
    },
  },
  {
    format: 'x3dv',
    fixtureName: 'cube.x3dv',
    description: 'Simple cube from X3DV format',
    geometry: {
      vertexCount: 36,
      faceCount: 12,
      meshCount: 1,
      boundingBox: {
        size: [2, 2, 2],
        center: [0, 0, 1],
      },
    },
    structure: {
      type: 'Group',
    },
  },
  {
    format: 'x3d',
    fixtureName: 'cube.x3d',
    description: 'Simple cube from X3D format',
    geometry: {
      vertexCount: 36,
      faceCount: 12,
      meshCount: 1,
      boundingBox: {
        size: [2, 2, 2],
        center: [0, 0, 1],
      },
    },
    structure: {
      type: 'Group',
      children: [
        {
          type: 'Object3D',
        },
      ],
    },
  },
  {
    format: 'x3db',
    fixtureName: 'cube.x3db',
    description: 'Simple cube from X3DB format',
    skip: true,
    skipReason: 'X3DB loader is not implemented yet.',
    geometry: {
      vertexCount: 36,
      faceCount: 12,
      meshCount: 1,
      boundingBox: {
        size: [2, 2, 2],
        center: [0, 0, 1],
      },
    },
    structure: {
      type: 'Group',
      children: [
        {
          type: 'Object3D',
        },
      ],
    },
  },
  {
    format: 'lwo',
    fixtureName: 'cube.lwo',
    description: 'Simple cube from LWO format',
    geometry: {
      vertexCount: 36,
      faceCount: 12,
      meshCount: 1,
      boundingBox: {
        size: [2, 2, 2],
        center: [0, 1, 0],
      },
    },
    structure: {
      type: 'Group',
      children: [
        {
          type: 'Object3D',
        },
      ],
    },
  },
  {
    format: 'bvh',
    fixtureName: 'cube.bvh',
    description: 'BVH format is not supported yet.',
    skip: true,
    skipReason: 'BVH loader is not implemented yet.',
    geometry: {
      vertexCount: 0,
      faceCount: 0,
      meshCount: 0,
      boundingBox: {
        size: [0, 0, 0],
        center: [0, 0, 0],
      },
    },
  },
  {
    format: 'drc',
    fixtureName: 'cube.drc',
    description: 'DRC format is not supported yet.',
    skip: true,
    skipReason: 'DRC loader is not fully working yet.',
    geometry: {
      vertexCount: 72,
      faceCount: 24,
      meshCount: 1,
      boundingBox: {
        size: [0, 0, 0],
        center: [0, 0, 0],
      },
    },
  },
  {
    format: 'md2',
    fixtureName: 'cube.md2',
    description: 'Simple cube from MD2 format',
    skip: true,
    skipReason: 'MD2 fixture is not available.',
    geometry: {
      vertexCount: 36,
      faceCount: 12,
      meshCount: 1,
      boundingBox: {
        size: [2, 2, 2],
        center: [0, 0, 1],
      },
    },
    structure: {
      type: 'Group',
      children: [
        {
          type: 'Mesh',
        },
      ],
    },
  },
  {
    format: 'pcd',
    fixtureName: 'cube.pcd',
    description: 'PCD format is not supported yet.',
    skip: true,
    skipReason: 'PCD loader is not implemented yet.',
    geometry: {
      vertexCount: 0,
      faceCount: 0,
      meshCount: 0,
      boundingBox: {
        size: [0, 0, 0],
        center: [0, 0, 0],
      },
    },
  },
  {
    format: 'vox',
    fixtureName: 'cube.vox',
    description: 'Simple cube from VOX format',
    geometry: {
      vertexCount: 144,
      faceCount: 48,
      meshCount: 1,
      boundingBox: {
        size: [2, 2, 2],
        center: [0, 0, 1],
      },
    },
    structure: {
      type: 'Group',
      children: [
        {
          type: 'Mesh',
        },
      ],
    },
  },
  {
    format: 'vtk',
    fixtureName: 'cube.vtk',
    description: 'Simple cube from VTK format',
    geometry: {
      vertexCount: 8,
      faceCount: 3,
      meshCount: 1,
      facePoints: 4,
      boundingBox: {
        size: [2, 2, 2],
        center: [0, 0, 1],
      },
    },
    structure: {
      type: 'Mesh',
    },
  },
  {
    format: 'vtp',
    fixtureName: 'cube.vtp',
    description: 'Simple cube from VTP format',
    skip: true,
    skipReason: 'VTP loader currently requires DOM parser, which is not available in Node.js.',
    geometry: {
      vertexCount: 8,
      faceCount: 3,
      meshCount: 1,
      facePoints: 4,
      boundingBox: {
        size: [2, 2, 2],
        center: [0, 0, 1],
      },
    },
    structure: {
      type: 'Mesh',
    },
  },
  {
    format: 'xyz',
    fixtureName: 'cube.xyz',
    description: 'Simple cube from XYZ format',
    skip: true,
    skipReason: 'XYZ loader requires point cloud testing.',
    geometry: {
      vertexCount: 0,
      faceCount: 0,
      meshCount: 0,
      boundingBox: {
        size: [0, 0, 0],
        center: [0, 0, 0],
      },
    },
  },
  {
    format: 'dxf',
    fixtureName: `cube.dxf`,
    description: `Simple cube from DXF format`,
    geometry: {
      vertexCount: 72,
      faceCount: 24,
      meshCount: 1,
      boundingBox: {
        size: [2, 2, 2] as [number, number, number],
        center: [0, 0, 1] as [number, number, number],
      },
    },
    structure: {
      type: 'Group',
      children: [
        {
          type: 'Mesh',
        },
      ],
    },
  },
  {
    format: 'off',
    fixtureName: `cube.off`,
    description: `Simple cube from OFF format`,
    geometry: {
      vertexCount: 36,
      faceCount: 12,
      meshCount: 1,
      boundingBox: {
        size: [2, 2, 2] as [number, number, number],
        center: [0, 0, 1] as [number, number, number],
      },
    },
    structure: {
      type: 'Group',
      children: [
        {
          type: 'Mesh',
        },
      ],
    },
  },
  {
    format: 'x',
    fixtureName: `cube.x`,
    description: `Simple cube from X format`,
    geometry: {
      vertexCount: 36,
      faceCount: 12,
      meshCount: 1,
      boundingBox: {
        size: [2, 2, 2] as [number, number, number],
        center: [0, 0, 1] as [number, number, number],
      },
    },
    structure: {
      type: 'Group',
      children: [
        {
          type: 'Mesh',
        },
      ],
    },
  },
  {
    format: 'udo',
    fixtureName: `cube.udo`,
    description: `Simple cube from UDO format`,
    skip: true,
    skipReason: 'UDO loader is not implemented yet.',
    geometry: {
      vertexCount: 36,
      faceCount: 12,
      meshCount: 1,
      boundingBox: {
        size: [2, 2, 2] as [number, number, number],
        center: [0, 0, 1] as [number, number, number],
      },
    },
    structure: {
      type: 'Group',
      children: [
        {
          type: 'Mesh',
        },
      ],
    },
  },
  {
    format: 'blend',
    fixtureName: `cube.blend`,
    description: `Simple cube from BLEND format`,
    skip: true,
    skipReason: 'BLEND loader is not implemented yet.',
    geometry: {
      vertexCount: 36,
      faceCount: 12,
      meshCount: 1,
      boundingBox: {
        size: [2, 2, 2] as [number, number, number],
        center: [0, 0, 1] as [number, number, number],
      },
    },
    structure: {
      type: 'Group',
      children: [
        {
          type: 'Mesh',
        },
      ],
    },
  },
  ...(['dwg', 'pov', 'gdf', 'gts','x_t','xaml','xgl','vda','svg','sldprt','skp','shapr','rib','pdb','nrrd','mtl','max','ldr','inc','exr','cd'] as const).map((format) => ({
    format,
    fixtureName: `cube.${format}`,
    description: `[NEW] Simple cube from ${format} format`,
    skip: true,
    skipReason: `${format} loader is not implemented yet.`,
    geometry: {
      vertexCount: 36,
      faceCount: 12,
      meshCount: 1,
      boundingBox: {
        size: [2, 2, 2] as [number, number, number],
        center: [0, 0, 1] as [number, number, number],
      },
    },
    structure: {
      type: 'Group',
      children: [
        {
          type: 'Mesh',
        },
      ],
    },
  })),
];

// ============================================================================
// Individual Test Helpers (Single Responsibility)
// ============================================================================

const createGeometryTestHelpers = (utils: ReturnType<typeof createThreeTestUtils>) => ({
  expectVertexCount(object3d: Object3D, expectedCount: number): void {
    const stats = utils.getGeometryStats(object3d);
    expect(stats.vertexCount).toBe(expectedCount);
  },

  expectFaceCount(object3d: Object3D, expectedCount: number): void {
    const stats = utils.getGeometryStats(object3d);
    expect(Math.round(stats.faceCount)).toBe(expectedCount);
  },

  expectMeshCount(object3d: Object3D, expectedCount: number): void {
    const stats = utils.getGeometryStats(object3d);
    expect(stats.meshCount).toBe(expectedCount);
  },

  expectBoundingBoxSize(object3d: Object3D, expectedSize: [number, number, number], tolerance?: number): void {
    const boundingBox = utils.getBoundingBox(object3d);
    const size = boundingBox.getSize(new Vector3());
    const actualTolerance = tolerance ?? utils.epsilon;

    const [expectedWidth, expectedHeight, expectedDepth] = expectedSize;
    utils.expectVector3ToBeCloseTo(
      size,
      new Vector3(expectedWidth, expectedHeight, expectedDepth),
      'bounding box size',
      actualTolerance,
    );
  },

  expectBoundingBoxCenter(object3d: Object3D, expectedCenter: [number, number, number], tolerance?: number): void {
    const boundingBox = utils.getBoundingBox(object3d);
    const center = boundingBox.getCenter(new Vector3());
    const actualTolerance = tolerance ?? utils.epsilon;

    const [expectedCenterX, expectedCenterY, expectedCenterZ] = expectedCenter;
    utils.expectVector3ToBeCloseTo(
      center,
      new Vector3(expectedCenterX, expectedCenterY, expectedCenterZ),
      'bounding box center',
      actualTolerance,
    );
  },
});

const createStructureTestHelpers = () => ({
  expectObjectType(object3d: Object3D, expectedType: string): void {
    expect(object3d.type).toBe(expectedType);
  },

  expectObjectName(object3d: Object3D, expectedName: string): void {
    expect(object3d.name).toBe(expectedName);
  },

  expectChildrenCount(object3d: Object3D, expectedCount: number): void {
    expect(object3d.children.length).toBe(expectedCount);
  },

  expectChildAtIndex(object3d: Object3D, index: number, childExpectation: StructureExpectation): void {
    const child = object3d.children[index];
    expect(child).toBeDefined();

    if (child) {
      expect(child.type).toBe(childExpectation.type);

      if (childExpectation.name !== undefined) {
        expect(child.name).toBe(childExpectation.name);
      }
    }
  },
});

// ============================================================================
// Parameterized Tests
// ============================================================================

describe('threejs-import', () => {
  const utils = createThreeTestUtils();
  const geometryHelpers = createGeometryTestHelpers(utils);
  const structureHelpers = createStructureTestHelpers();

  for (const testCase of loaderTestCases) {
    const describeFunction = testCase.skip ? describe.skip : describe;
    const variantDescription = testCase.variant ? ` (${testCase.variant})` : '';
    const skipDescription = testCase.skip ? ` [SKIPPED]: ${testCase.skipReason}` : '';
    describeFunction(`'${testCase.format}' loader${variantDescription}${skipDescription}`, () => {
      const { format, fixtureName, description, geometry, structure, skip } = testCase;

      let object3d: Object3D;

      beforeEach(async () => {
        if (skip) {
          return;
        }

        const data = await loadTestData(testCase);
        const inputFile: InputFile = {
          name: fixtureName ?? `${format}-${testCase.variant ?? 'default'}`,
          data,
        };

        object3d = await importThreeJs(inputFile, format);
      });

      it(`should successfully import ${description ?? fixtureName}`, () => {
        expect(object3d).toBeDefined();
      });

      // Geometry tests - each aspect gets its own test case
      if (geometry) {
        it('should have correct vertex count', () => {
          geometryHelpers.expectVertexCount(object3d, geometry.vertexCount);
        });

        it('should have correct face count', () => {
          geometryHelpers.expectFaceCount(object3d, geometry.faceCount);
        });

        it('should have correct mesh count', () => {
          geometryHelpers.expectMeshCount(object3d, geometry.meshCount);
        });

        it('should have correct bounding box size', () => {
          geometryHelpers.expectBoundingBoxSize(object3d, geometry.boundingBox.size, geometry.boundingBox.tolerance);
        });

        it('should have correct bounding box center', () => {
          geometryHelpers.expectBoundingBoxCenter(
            object3d,
            geometry.boundingBox.center,
            geometry.boundingBox.tolerance,
          );
        });
      }

      // Structure tests - each aspect gets its own test case
      if (structure) {
        it('should have correct object type', () => {
          structureHelpers.expectObjectType(object3d, structure.type);
        });

        if (structure.name !== undefined) {
          it('should have correct object name', () => {
            structureHelpers.expectObjectName(object3d, structure.name!);
          });
        }

        if (structure.children !== undefined) {
          it('should have correct number of children', () => {
            structureHelpers.expectChildrenCount(object3d, structure.children!.length);
          });

          // Test each child individually
          for (const [index, childExpectation] of structure.children.entries()) {
            // eslint-disable-next-line @typescript-eslint/no-loop-func -- vitest ensures test closure, so this is safe
            it(`should have correct child structure at index ${index}`, () => {
              structureHelpers.expectChildAtIndex(object3d, index, childExpectation as StructureExpectation);
            });
          }
        }
      }

      it('should produce consistent results across multiple imports', async () => {
        const data = await loadTestData(testCase);
        const inputFile: InputFile = {
          name: fixtureName ?? `${format}-${testCase.variant ?? 'default'}`,
          data,
        };

        const object3d2 = await importThreeJs(inputFile, format);

        const signature1 = utils.createGeometrySignature(object3d);
        const signature2 = utils.createGeometrySignature(object3d2);

        expect(signature1).toEqual(signature2);
      });

      it('should have valid mesh position attributes', () => {
        let hasValidMesh = false;
        object3d.traverse((child) => {
          if (child instanceof Mesh) {
            hasValidMesh = true;
            const geometry = child.geometry as BufferGeometry;
            const position = geometry.getAttribute('position');
            expect(position).toBeDefined();
          }
        });
        expect(hasValidMesh).toBe(true);
      });

      it('should have positive vertex counts in meshes', () => {
        object3d.traverse((child) => {
          if (child instanceof Mesh) {
            const geometry = child.geometry as BufferGeometry;
            const position = geometry.getAttribute('position');
            expect(position.count).toBeGreaterThan(0);
          }
        });
      });

      it('should have properly triangulated mesh geometry', () => {
        object3d.traverse((child) => {
          if (child instanceof Mesh) {
            const geometry = child.geometry as BufferGeometry;
            const position = geometry.getAttribute('position');
            const facePoints = testCase.geometry?.facePoints ?? 3;
            expect(position.count % facePoints).toBe(0);
          }
        });
      });

      it('should have finite coordinate values', () => {
        object3d.traverse((child) => {
          if (child instanceof Mesh) {
            const geometry = child.geometry as BufferGeometry;
            const position = geometry.getAttribute('position');

            for (const value of position.array) {
              expect(Number.isFinite(value)).toBe(true);
            }
          }
        });
      });
    });
  }

  // Test skipped loaders
  const skippedTestCases = loaderTestCases.filter((tc) => tc.skip);
  if (skippedTestCases.length > 0) {
    describe('skipped loaders', () => {
      for (const testCase of skippedTestCases) {
        it(`should skip ${testCase.format} loader${testCase.variant ? ` (${testCase.variant})` : ''}: ${testCase.skipReason}`, () => {
          expect(testCase.skip).toBe(true);
        });
      }
    });
  }

  // Integration test for all enabled formats
  it('should test all declared formats', () => {
    const enabledFormats = loaderTestCases.map((tc) => tc.format);
    const declaredFormats = threejsImportFomats;

    expect([...new Set(enabledFormats)].sort()).toEqual([...new Set(declaredFormats)].sort());
  });
});
