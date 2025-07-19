import type { Vertex, Face, Color } from './common.js';

export interface OFFData {
  vertices: Vertex[];
  faces: Face[];
  colors: Color[];
}

/**
 * Parse OFF (Object File Format) data from string
 * OFF format supports vertices, faces, and colors
 */
export function parseOFF(offContent: string): OFFData {
  const lines = offContent.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));
  
  let lineIndex = 0;
  
  // First line should be OFF or COFF (colored OFF)
  const header = lines[lineIndex++];
  const hasColors = header === 'COFF' || header.startsWith('C');
  
  if (!header.startsWith('OFF') && !header.startsWith('COFF')) {
    throw new Error('Invalid OFF file: missing OFF header');
  }
  
  // Second line: number of vertices, faces, edges
  const countsLine = lines[lineIndex++];
  if (!countsLine) {
    throw new Error('Invalid OFF file: missing counts line');
  }
  
  const [numVertices, numFaces] = countsLine.split(/\s+/).map(Number);
  
  const vertices: Vertex[] = [];
  const faces: Face[] = [];
  const colors: Color[] = [];
  
  // Parse vertices
  for (let i = 0; i < numVertices; i++) {
    const vertexLine = lines[lineIndex++];
    if (!vertexLine) {
      throw new Error(`Invalid OFF file: missing vertex ${i}`);
    }
    
    const parts = vertexLine.split(/\s+/).map(Number);
    if (parts.length < 3) {
      throw new Error(`Invalid OFF file: vertex ${i} has less than 3 coordinates`);
    }
    
    vertices.push([parts[0], parts[1], parts[2]]);
    
    // If there are color values for vertices (additional components)
    if (hasColors && parts.length >= 6) {
      colors.push([parts[3], parts[4], parts[5]]);
    }
  }
  
  // Parse faces
  for (let i = 0; i < numFaces; i++) {
    const faceLine = lines[lineIndex++];
    if (!faceLine) {
      throw new Error(`Invalid OFF file: missing face ${i}`);
    }
    
    const parts = faceLine.split(/\s+/).map(Number);
    const faceVertexCount = parts[0];
    
    if (parts.length < faceVertexCount + 1) {
      throw new Error(`Invalid OFF file: face ${i} has insufficient vertex indices`);
    }
    
    const faceIndices = parts.slice(1, faceVertexCount + 1);
    faces.push(faceIndices);
    
    // If there are color values for faces (additional components after vertex indices)
    if (hasColors && parts.length >= faceVertexCount + 4) {
      const colorStart = faceVertexCount + 1;
      colors.push([
        parts[colorStart] / 255,     // Normalize from 0-255 to 0-1
        parts[colorStart + 1] / 255,
        parts[colorStart + 2] / 255
      ]);
    }
  }
  
  // If no colors were found, provide default white color
  if (colors.length === 0) {
    // Default to white for all faces if no colors specified
    for (let i = 0; i < numFaces; i++) {
      colors.push([1, 1, 1]);
    }
  }
  
  return {
    vertices,
    faces,
    colors
  };
}