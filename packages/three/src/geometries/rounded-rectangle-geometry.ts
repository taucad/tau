import type { BufferGeometry } from 'three';
import { ExtrudeGeometry, Shape, Vector2 } from 'three';

// eslint-disable-next-line @typescript-eslint/naming-convention -- Three.js naming convention
export const RoundedRectangleGeometry = ({
  width,
  height,
  radius,
  smoothness,
  depth,
}: {
  width: number;
  height: number;
  radius: number;
  smoothness: number;
  depth: number;
}): BufferGeometry => {
  const pi2 = Math.PI * 2;
  const n = (smoothness + 1) * 4; // Number of segments
  const points: Vector2[] = [];
  let qu: number;
  let sgx: number;
  let sgy: number;
  let x: number;
  let y: number;

  // Generate contour points
  for (let j = 0; j < n; j++) {
    qu = Math.trunc((4 * j) / n) + 1; // Quadrant  qu: 1..4
    sgx = qu === 1 || qu === 4 ? 1 : -1; // Signum left/right
    sgy = qu < 3 ? 1 : -1; // Signum  top / bottom
    x = sgx * (width / 2 - radius) + radius * Math.cos((pi2 * (j - qu + 1)) / (n - 4)); // Corner center + circle
    y = sgy * (height / 2 - radius) + radius * Math.sin((pi2 * (j - qu + 1)) / (n - 4));

    points.push(new Vector2(x, y));
  }

  // Create shape from points
  const shape = new Shape();
  const firstPoint = points[0];

  if (firstPoint !== undefined) {
    shape.moveTo(firstPoint.x, firstPoint.y);

    for (let i = 1; i < points.length; i++) {
      const point = points[i];

      if (point !== undefined) {
        shape.lineTo(point.x, point.y);
      }
    }

    shape.closePath();
  }

  // Extrude the shape
  const geometry = new ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geometry.center();

  return geometry;
};
