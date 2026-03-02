import type { BufferGeometry } from 'three';
import { Vector2, Shape, ExtrudeGeometry } from 'three';
import { SVGLoader } from 'three/examples/jsm/Addons.js';

// eslint-disable-next-line @typescript-eslint/naming-convention -- Three.js naming convention
export const SvgGeometry = ({ svg, depth }: { svg: string; depth: number }): BufferGeometry => {
  let geometry: BufferGeometry;
  const loader = new SVGLoader();
  const svgData = loader.parse(svg);

  for (const path of svgData.paths) {
    const pts = path.subPaths[0]!.getPoints(10);
    pts.pop();
    for (const p of pts) {
      p.y *= -1;
    }

    pts.reverse();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- SvgLoader adds this
    const { strokeWidth } = path.userData!['style'];

    const pPrevious = new Vector2();
    const pNext = new Vector2();
    const c = new Vector2();
    const offsetPts = [];
    for (const [idx, p] of pts.entries()) {
      let idxPrevious = idx - 1;
      if (idxPrevious < 0) {
        idxPrevious = pts.length - 1;
      }

      let idxNext = idx + 1;
      if (idxNext === pts.length) {
        idxNext = 0;
      }

      pPrevious.subVectors(pts[idxPrevious]!, p).normalize();
      pNext.subVectors(pts[idxNext]!, p).normalize();
      const anglePrevious = pPrevious.angle();
      const angleNext = pNext.angle();
      const angleMid = (angleNext - anglePrevious) * 0.5;
      pPrevious.rotateAround(c, angleMid);
      const offsetDist = strokeWidth / Math.cos(angleMid - Math.PI * 0.5);
      offsetPts.push(pPrevious.clone().setLength(offsetDist).add(p));
    }

    const shape = new Shape(offsetPts);
    geometry = new ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    geometry.center();
  }

  return geometry!;
};
