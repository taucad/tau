export type Vertex = [number, number, number];
export type Face = number[];
export type Color = [number, number, number]; // RGB values 0-1

export type IndexedPolyhedron = {
  vertices: Vertex[];
  faces: Face[];
  colors: Color[];
};
