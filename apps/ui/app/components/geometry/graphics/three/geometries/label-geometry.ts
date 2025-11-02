import type { BufferGeometry } from 'three';
import { FontGeometry } from '#components/geometry/graphics/three/geometries/font-geometry.js';
import { RoundedRectangleGeometry } from '#components/geometry/graphics/three/geometries/rounded-rectangle-geometry.js';

// eslint-disable-next-line @typescript-eslint/naming-convention -- Three.js naming convention
export const LabelTextGeometry = ({
  text,
  size = 30,
  depth = 2,
}: {
  text: string;
  size?: number;
  depth?: number;
}): BufferGeometry =>
  // eslint-disable-next-line new-cap -- Three.js geometry function
  FontGeometry({ text, size, depth });

// eslint-disable-next-line @typescript-eslint/naming-convention -- Three.js naming convention
export const LabelBackgroundGeometry = ({
  text,
  characterWidth = 18,
  padding = 40,
  height = 70,
  radius = 20,
  depth = 10,
}: {
  text: string;
  characterWidth?: number;
  padding?: number;
  height?: number;
  radius?: number;
  depth?: number;
}): BufferGeometry => {
  // Calculate width based on character count (fixed-width mono font)
  const width = text.length * characterWidth + padding * 2;

  // eslint-disable-next-line new-cap -- Three.js geometry function
  return RoundedRectangleGeometry({
    width,
    height,
    radius,
    smoothness: 16,
    depth,
  });
};
