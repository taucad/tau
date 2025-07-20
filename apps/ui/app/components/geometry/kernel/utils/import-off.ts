import type { Vertex, Face, Color } from '~/components/geometry/kernel/utils/common.js';

export type OffData = {
  vertices: Vertex[];
  faces: Face[];
  colors: Color[];
};

/**
 * Parse OFF (Object File Format) data from string
 * OFF format supports vertices, faces, and colors
 */
export function parseOff(offContent: string): OffData {
  const lines = offContent
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));

  if (lines.length === 0) {
    throw new Error('Empty OFF file');
  }

  let counts: string;
  let currentLine = 0;

  // Handle both "OFF 8 6 0" and separate "OFF" + "8 6 0" formats
  if (lines[0]?.match(/^OFF(\s|$)/)) {
    // Header and counts on same line: "OFF 8 6 0"
    counts = lines[0].slice(3).trim();
    currentLine = 1;
  } else if (lines[currentLine] === 'OFF' && lines.length > 1) {
    // Header and counts on separate lines
    counts = lines[1] ?? '';
    currentLine = 2;
  } else {
    throw new Error('Invalid OFF file: missing OFF header');
  }

  const countParts = counts.split(/\s+/).map(Number);
  const numberVertices = countParts[0] ?? 0;
  const numberFaces = countParts[1] ?? 0;

  if (isNaN(numberVertices) || isNaN(numberFaces)) {
    throw new TypeError('Invalid OFF file: invalid vertex or face counts');
  }

  if (currentLine + numberVertices + numberFaces > lines.length) {
    throw new Error('Invalid OFF file: not enough lines');
  }

  const vertices: Vertex[] = [];
  for (let i = 0; i < numberVertices; i++) {
    const vertexLine = lines[currentLine + i];
    if (!vertexLine) {
      throw new Error(`Invalid OFF file: missing vertex ${i}`);
    }

    const parts = vertexLine.split(/\s+/).map(Number);

    if (parts.length < 3 || parts.some((part) => Number.isNaN(part))) {
      throw new Error(`Invalid OFF file: invalid vertex at line ${currentLine + i + 1}`);
    }

    const x = parts[0];
    const y = parts[1];
    const z = parts[2];

    if (x === undefined || y === undefined || z === undefined) {
      throw new Error(`Invalid OFF file: missing coordinates at line ${currentLine + i + 1}`);
    }

    vertices.push([x, y, z]);
  }

  currentLine += numberVertices;

  const faces: Face[] = [];
  const colors: Color[] = [];

  for (let i = 0; i < numberFaces; i++) {
    const faceLine = lines[currentLine + i];
    if (!faceLine) {
      throw new Error(`Invalid OFF file: missing face ${i}`);
    }

    const parts = faceLine.split(/\s+/).map(Number);

    const numberVerts = parts[0] ?? 0;
    const faceVertices = parts.slice(1, numberVerts + 1);

    // Check for color data (R G B values after vertex indices)
    let color: Color = [1, 1, 1]; // Default to white

    if (parts.length >= numberVerts + 4) {
      // Has RGB color data
      const r = parts[numberVerts + 1];
      const g = parts[numberVerts + 2];
      const b = parts[numberVerts + 3];

      if (r !== undefined && g !== undefined && b !== undefined) {
        color = [r / 255, g / 255, b / 255] as Color;
      }
    }

    if (faceVertices.length < 3) {
      throw new Error(`Invalid OFF file: face at line ${currentLine + i + 1} must have at least 3 vertices`);
    }

    if (faceVertices.length === 3) {
      // Triangle face
      faces.push(faceVertices as Face);
      colors.push(color);
    } else {
      // Triangulate polygon faces using fan triangulation
      for (let j = 1; j < faceVertices.length - 1; j++) {
        faces.push([faceVertices[0], faceVertices[j], faceVertices[j + 1]]);
        colors.push(color);
      }
    }
  }

  return {
    vertices,
    faces,
    colors,
  };
}
