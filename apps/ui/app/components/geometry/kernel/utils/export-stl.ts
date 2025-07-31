import type { IndexedPolyhedron } from '#components/geometry/kernel/utils/common.js';

/**
 * Calculate the normal vector for a triangle
 */
function calculateNormal(v1: number[], v2: number[], v3: number[]): number[] {
  // Validate vertices have at least 3 components
  if (v1.length < 3 || v2.length < 3 || v3.length < 3) {
    return [0, 0, 1]; // Default normal
  }

  // Calculate two edge vectors with safe access
  const edge1 = [v2[0]! - v1[0]!, v2[1]! - v1[1]!, v2[2]! - v1[2]!];
  const edge2 = [v3[0]! - v1[0]!, v3[1]! - v1[1]!, v3[2]! - v1[2]!];

  // Calculate cross product (normal)
  const normal = [
    edge1[1]! * edge2[2]! - edge1[2]! * edge2[1]!,
    edge1[2]! * edge2[0]! - edge1[0]! * edge2[2]!,
    edge1[0]! * edge2[1]! - edge1[1]! * edge2[0]!,
  ];

  // Normalize the vector
  const length = Math.hypot(normal[0]!, normal[1]!, normal[2]!);

  if (length > 0) {
    return [normal[0]! / length, normal[1]! / length, normal[2]! / length];
  }

  return [0, 0, 1]; // Default normal if calculation fails
}

/**
 * Create an ASCII STL string from mesh data
 */
export function createStlAscii(meshData: IndexedPolyhedron): Blob {
  const { vertices, faces } = meshData;
  let stlContent = 'solid model\n';

  // Process each face
  for (const face of faces) {
    if (face.length < 3) {
      continue; // Skip invalid faces
    }

    // Triangulate face using fan triangulation
    for (let i = 1; i < face.length - 1; i++) {
      const idx1 = face[0];
      const idx2 = face[i];
      const idx3 = face[i + 1];

      if (idx1 === undefined || idx2 === undefined || idx3 === undefined) {
        continue;
      }

      const v1 = vertices[idx1];
      const v2 = vertices[idx2];
      const v3 = vertices[idx3];

      if (!v1 || !v2 || !v3) {
        continue;
      }

      // Calculate normal
      const normal = calculateNormal(v1, v2, v3);

      // Write triangle to STL
      stlContent += `  facet normal ${normal[0]!} ${normal[1]!} ${normal[2]!}\n`;
      stlContent += '    outer loop\n';
      stlContent += `      vertex ${v1[0]} ${v1[1]} ${v1[2]}\n`;
      stlContent += `      vertex ${v2[0]} ${v2[1]} ${v2[2]}\n`;
      stlContent += `      vertex ${v3[0]} ${v3[1]} ${v3[2]}\n`;
      stlContent += '    endloop\n';
      stlContent += '  endfacet\n';
    }
  }

  stlContent += 'endsolid model\n';

  return new Blob([stlContent], { type: 'model/stl' });
}

/**
 * Create a binary STL blob from mesh data
 */
export function createStlBinary(meshData: IndexedPolyhedron): Blob {
  const { vertices, faces } = meshData;

  // Calculate total number of triangles
  let totalTriangles = 0;
  for (const face of faces) {
    if (face.length >= 3) {
      totalTriangles += face.length - 2; // Fan triangulation
    }
  }

  // Binary STL format:
  // 80-byte header + 4-byte triangle count + (50 bytes per triangle)
  const headerSize = 80;
  const triangleCountSize = 4;
  const triangleSize = 50; // 12 bytes normal + 36 bytes vertices + 2 bytes attribute
  const totalSize = headerSize + triangleCountSize + totalTriangles * triangleSize;

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  // Write header (80 bytes, can be anything)
  const headerText = 'Binary STL exported from OpenSCAD';
  const headerBytes = new TextEncoder().encode(headerText);
  for (let i = 0; i < Math.min(headerBytes.length, headerSize); i++) {
    view.setUint8(i, headerBytes[i]!);
  }

  // Write triangle count
  view.setUint32(headerSize, totalTriangles, true); // Little-endian

  let offset = headerSize + triangleCountSize;

  // Process each face
  for (const face of faces) {
    if (face.length < 3) {
      continue; // Skip invalid faces
    }

    // Triangulate face using fan triangulation
    for (let i = 1; i < face.length - 1; i++) {
      const idx1 = face[0];
      const idx2 = face[i];
      const idx3 = face[i + 1];

      if (idx1 === undefined || idx2 === undefined || idx3 === undefined) {
        continue;
      }

      const v1 = vertices[idx1];
      const v2 = vertices[idx2];
      const v3 = vertices[idx3];

      if (!v1 || !v2 || !v3) {
        continue;
      }

      // Calculate normal
      const normal = calculateNormal(v1, v2, v3);

      // Write normal (12 bytes)
      view.setFloat32(offset, normal[0]!, true);
      view.setFloat32(offset + 4, normal[1]!, true);
      view.setFloat32(offset + 8, normal[2]!, true);
      offset += 12;

      // Write vertices (36 bytes total)
      // Vertex 1
      view.setFloat32(offset, v1[0], true);
      view.setFloat32(offset + 4, v1[1], true);
      view.setFloat32(offset + 8, v1[2], true);
      offset += 12;

      // Vertex 2
      view.setFloat32(offset, v2[0], true);
      view.setFloat32(offset + 4, v2[1], true);
      view.setFloat32(offset + 8, v2[2], true);
      offset += 12;

      // Vertex 3
      view.setFloat32(offset, v3[0], true);
      view.setFloat32(offset + 4, v3[1], true);
      view.setFloat32(offset + 8, v3[2], true);
      offset += 12;

      // Write attribute byte count (2 bytes, usually 0)
      view.setUint16(offset, 0, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: 'model/stl' });
}
