import type { Pico, Voxels } from 'picovoxel';

export const defaultParams = { voxelSize: 0.5, radius: 8, tube: 2.5 };

/**
 * A (2, 3) torus-knot tube, laid out exactly as three.js `TorusKnotGeometry(radius, tube, 128, 24)`
 * builds it, so the round trip mesh → voxels needs no `three` dependency.
 */
export const torusKnotMesh = (
  radius: number,
  tube: number,
): { vertices: number[]; triangles: number[] } => {
  const [tubularSegments, radialSegments, p, q] = [128, 24, 2, 3];
  const curve = (u: number): [number, number, number] => {
    const quOverP = (q / p) * u;
    const cs = Math.cos(quOverP);
    return [
      radius * (2 + cs) * 0.5 * Math.cos(u),
      radius * (2 + cs) * Math.sin(u) * 0.5,
      radius * Math.sin(quOverP) * 0.5,
    ];
  };
  const vertices: number[] = [];
  for (let ring = 0; ring <= tubularSegments; ++ring) {
    const u = (ring / tubularSegments) * p * Math.PI * 2;
    const p1 = curve(u);
    const p2 = curve(u + 0.01);
    const t = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]];
    const n = [p2[0] + p1[0], p2[1] + p1[1], p2[2] + p1[2]];
    const b = [
      t[1]! * n[2]! - t[2]! * n[1]!,
      t[2]! * n[0]! - t[0]! * n[2]!,
      t[0]! * n[1]! - t[1]! * n[0]!,
    ];
    const normal = [
      b[1]! * t[2]! - b[2]! * t[1]!,
      b[2]! * t[0]! - b[0]! * t[2]!,
      b[0]! * t[1]! - b[1]! * t[0]!,
    ];
    const bLength = Math.hypot(b[0]!, b[1]!, b[2]!);
    const nLength = Math.hypot(normal[0]!, normal[1]!, normal[2]!);
    for (let segment = 0; segment <= radialSegments; ++segment) {
      const v = (segment / radialSegments) * Math.PI * 2;
      const cx = -tube * Math.cos(v);
      const cy = tube * Math.sin(v);
      for (let axis = 0; axis < 3; axis++) {
        vertices.push(
          p1[axis]! +
            (cx * normal[axis]!) / nLength +
            (cy * b[axis]!) / bLength,
        );
      }
    }
  }
  const triangles: number[] = [];
  for (let ring = 1; ring <= tubularSegments; ring++) {
    for (let segment = 1; segment <= radialSegments; segment++) {
      const a = (radialSegments + 1) * (ring - 1) + (segment - 1);
      const bIndex = (radialSegments + 1) * ring + (segment - 1);
      const c = (radialSegments + 1) * ring + segment;
      const d = (radialSegments + 1) * (ring - 1) + segment;
      triangles.push(a, bIndex, d, bIndex, c, d);
    }
  }
  return { vertices, triangles };
};

export default function main(pico: Pico, params = defaultParams): Voxels {
  return pico.createMesh(torusKnotMesh(params.radius, params.tube)).toVoxels();
}
