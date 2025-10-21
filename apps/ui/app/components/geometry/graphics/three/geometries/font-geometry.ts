import type { BufferGeometry } from 'three';
import { ExtrudeGeometry } from 'three';
import { FontLoader } from 'three/examples/jsm/Addons.js';
import type { FontData } from 'three/examples/jsm/Addons.js';
import fontTypeface from '#components/geometry/graphics/three/geometries/geist-mono.typeface.json?raw';

// eslint-disable-next-line @typescript-eslint/naming-convention -- Three.js naming convention
export const FontGeometry = ({ text, depth, size }: { text: string; depth: number; size: number }): BufferGeometry => {
  const loader = new FontLoader();
  const font = loader.parse(JSON.parse(fontTypeface) as FontData);
  const shapes = font.generateShapes(text, size);
  const geometry = new ExtrudeGeometry(shapes, { depth, bevelEnabled: false });
  geometry.center();

  return geometry;
};
