import type { BufferGeometry } from 'three';
import { ExtrudeGeometry } from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import type { FontData } from 'three/addons/loaders/FontLoader.js';
import fontTypeface from '#graphics/three/geometries/geist-mono.typeface.json' with { type: 'json' };

const font = new FontLoader().parse(fontTypeface as unknown as FontData);

// eslint-disable-next-line @typescript-eslint/naming-convention -- Three.js naming convention
export const FontGeometry = ({ text, depth, size }: { text: string; depth: number; size: number }): BufferGeometry => {
  const shapes = font.generateShapes(text, size);
  const geometry = new ExtrudeGeometry(shapes, { depth, bevelEnabled: false });
  geometry.center();

  return geometry;
};
