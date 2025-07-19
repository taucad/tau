import type { Vertex, Face, Color } from './common.js';

export interface MeshData {
  vertices: Vertex[];
  faces: Face[];
  colors: Color[];
}

/**
 * Create a GLB (binary GLTF) blob from mesh data with colors
 */
export function createGLB(meshData: MeshData): Blob {
  const { vertices, faces, colors } = meshData;
  
  // Convert faces to triangles and create flat arrays
  const positions: number[] = [];
  const triangleIndices: number[] = [];
  const vertexColors: number[] = [];
  
  let vertexIndex = 0;
  
  // Process each face
  for (let faceIdx = 0; faceIdx < faces.length; faceIdx++) {
    const face = faces[faceIdx];
    const faceColor = colors[faceIdx] || [1, 1, 1]; // Default to white
    
    if (face.length < 3) {
      continue; // Skip invalid faces
    }
    
    // Triangulate face (simple fan triangulation)
    for (let i = 1; i < face.length - 1; i++) {
      // Add vertices for this triangle
      const v1 = vertices[face[0]];
      const v2 = vertices[face[i]];
      const v3 = vertices[face[i + 1]];
      
      if (!v1 || !v2 || !v3) {
        continue; // Skip if any vertex is missing
      }
      
      // Add positions
      positions.push(...v1, ...v2, ...v3);
      
      // Add colors (same color for all vertices of this triangle)
      vertexColors.push(...faceColor, ...faceColor, ...faceColor);
      
      // Add triangle indices
      triangleIndices.push(vertexIndex, vertexIndex + 1, vertexIndex + 2);
      vertexIndex += 3;
    }
  }
  
  // Calculate buffer sizes
  const positionBufferSize = positions.length * 4; // 4 bytes per float
  const colorBufferSize = vertexColors.length * 4; // 4 bytes per float
  const indexBufferSize = triangleIndices.length * 2; // 2 bytes per short
  
  // Align buffer sizes to 4-byte boundaries
  const alignedPositionSize = Math.ceil(positionBufferSize / 4) * 4;
  const alignedColorSize = Math.ceil(colorBufferSize / 4) * 4;
  const alignedIndexSize = Math.ceil(indexBufferSize / 4) * 4;
  
  const totalBufferSize = alignedPositionSize + alignedColorSize + alignedIndexSize;
  
  // Create glTF JSON structure
  const gltf = {
    asset: {
      version: "2.0",
      generator: "Tau OpenSCAD Converter"
    },
    scene: 0,
    scenes: [
      {
        nodes: [0]
      }
    ],
    nodes: [
      {
        mesh: 0
      }
    ],
    meshes: [
      {
        primitives: [
          {
            attributes: {
              POSITION: 0,
              COLOR_0: 1
            },
            indices: 2
          }
        ]
      }
    ],
    accessors: [
      // Position accessor
      {
        bufferView: 0,
        componentType: 5126, // FLOAT
        count: positions.length / 3,
        type: "VEC3",
        max: [
          Math.max(...positions.filter((_, i) => i % 3 === 0)),
          Math.max(...positions.filter((_, i) => i % 3 === 1)),
          Math.max(...positions.filter((_, i) => i % 3 === 2))
        ],
        min: [
          Math.min(...positions.filter((_, i) => i % 3 === 0)),
          Math.min(...positions.filter((_, i) => i % 3 === 1)),
          Math.min(...positions.filter((_, i) => i % 3 === 2))
        ]
      },
      // Color accessor
      {
        bufferView: 1,
        componentType: 5126, // FLOAT
        count: vertexColors.length / 3,
        type: "VEC3"
      },
      // Index accessor
      {
        bufferView: 2,
        componentType: 5123, // UNSIGNED_SHORT
        count: triangleIndices.length,
        type: "SCALAR"
      }
    ],
    bufferViews: [
      // Position buffer view
      {
        buffer: 0,
        byteOffset: 0,
        byteLength: positionBufferSize,
        target: 34962 // ARRAY_BUFFER
      },
      // Color buffer view
      {
        buffer: 0,
        byteOffset: alignedPositionSize,
        byteLength: colorBufferSize,
        target: 34962 // ARRAY_BUFFER
      },
      // Index buffer view
      {
        buffer: 0,
        byteOffset: alignedPositionSize + alignedColorSize,
        byteLength: indexBufferSize,
        target: 34963 // ELEMENT_ARRAY_BUFFER
      }
    ],
    buffers: [
      {
        byteLength: totalBufferSize
      }
    ]
  };
  
  // Convert JSON to binary
  const jsonString = JSON.stringify(gltf);
  const jsonBuffer = new TextEncoder().encode(jsonString);
  const jsonLength = jsonBuffer.length;
  const jsonPadding = (4 - (jsonLength % 4)) % 4;
  
  // Create binary buffer
  const binaryBuffer = new ArrayBuffer(totalBufferSize);
  const binaryView = new DataView(binaryBuffer);
  const binaryFloat32 = new Float32Array(binaryBuffer);
  const binaryUint16 = new Uint16Array(binaryBuffer);
  
  let offset = 0;
  
  // Write positions
  for (let i = 0; i < positions.length; i++) {
    binaryFloat32[offset / 4 + i] = positions[i];
  }
  offset += alignedPositionSize;
  
  // Write colors
  for (let i = 0; i < vertexColors.length; i++) {
    binaryFloat32[offset / 4 + i] = vertexColors[i];
  }
  offset += alignedColorSize;
  
  // Write indices
  for (let i = 0; i < triangleIndices.length; i++) {
    binaryUint16[offset / 2 + i] = triangleIndices[i];
  }
  
  // Calculate total GLB size
  const glbHeaderSize = 12; // GLB header
  const jsonChunkHeaderSize = 8; // JSON chunk header
  const binaryChunkHeaderSize = 8; // Binary chunk header
  const paddedJsonLength = jsonLength + jsonPadding;
  
  const totalGlbSize = glbHeaderSize + jsonChunkHeaderSize + paddedJsonLength + 
                       binaryChunkHeaderSize + totalBufferSize;
  
  // Create final GLB buffer
  const glbBuffer = new ArrayBuffer(totalGlbSize);
  const glbView = new DataView(glbBuffer);
  const glbUint8 = new Uint8Array(glbBuffer);
  
  let glbOffset = 0;
  
  // GLB header
  glbView.setUint32(glbOffset, 0x46546C67, true); // "glTF" magic
  glbOffset += 4;
  glbView.setUint32(glbOffset, 2, true); // version
  glbOffset += 4;
  glbView.setUint32(glbOffset, totalGlbSize, true); // total length
  glbOffset += 4;
  
  // JSON chunk header
  glbView.setUint32(glbOffset, paddedJsonLength, true); // chunk length
  glbOffset += 4;
  glbView.setUint32(glbOffset, 0x4E4F534A, true); // "JSON" type
  glbOffset += 4;
  
  // JSON data
  glbUint8.set(jsonBuffer, glbOffset);
  glbOffset += jsonLength;
  
  // JSON padding
  for (let i = 0; i < jsonPadding; i++) {
    glbUint8[glbOffset++] = 0x20; // space character
  }
  
  // Binary chunk header
  glbView.setUint32(glbOffset, totalBufferSize, true); // chunk length
  glbOffset += 4;
  glbView.setUint32(glbOffset, 0x004E4942, true); // "BIN\0" type
  glbOffset += 4;
  
  // Binary data
  glbUint8.set(new Uint8Array(binaryBuffer), glbOffset);
  
  return new Blob([glbBuffer], { type: 'model/gltf-binary' });
}