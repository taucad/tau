import { BufferGeometry, Float32BufferAttribute } from 'three';

// eslint-disable-next-line @typescript-eslint/naming-convention -- Three.js naming convention
export const CircleGeometry = ({
  radius,
  arc,
  arcOffset = 0,
}: {
  radius: number;
  arc: number;
  arcOffset?: number;
}): BufferGeometry => {
  const geometry = new BufferGeometry();
  const vertices = [];

  for (let i = 0; i <= 64 * arc; ++i) {
    vertices.push(
      0,
      Math.cos((i / 32) * Math.PI + arcOffset) * radius,
      Math.sin((i / 32) * Math.PI + arcOffset) * radius,
    );
  }

  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));

  return geometry;
};
