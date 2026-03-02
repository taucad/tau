import type { BufferGeometry } from 'three';
import { ExtrudeGeometry } from 'three';
import { FontLoader } from 'three/examples/jsm/Addons.js';
import type { FontData } from 'three/examples/jsm/Addons.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- local file via package imports (#* → ./src/*)
import fontData from '#geometries/geist-mono.typeface.json';

// eslint-disable-next-line @typescript-eslint/naming-convention -- Three.js naming convention
export const FontGeometry = ({ text, depth, size }: { text: string; depth: number; size: number }): BufferGeometry => {
  const loader = new FontLoader();
  const font = loader.parse(fontData as unknown as FontData);
  const shapes = font.generateShapes(text, size);
  const geometry = new ExtrudeGeometry(shapes, { depth, bevelEnabled: false });
  geometry.center();

  return geometry;
};
