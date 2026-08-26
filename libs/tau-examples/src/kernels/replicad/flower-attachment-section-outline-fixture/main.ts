import { draw, drawCircle, drawEllipse, makeCylinder } from 'replicad';
import type { ShapeConfig } from 'replicad';

export const defaultParams = {
  innerDiameter: 11.25,
  flowerDiameter: 45,
  petalCount: 5,
  petalThickness: 3,
  funnelHeight: 8,
  funnelOuterRadius: 11.5,
  funnelWallThickness: 1.8,
  debossDepth: 0.8,
};

export default function main(p = defaultParams): ShapeConfig[] {
  const rInner = p.innerDiameter / 2;
  const rPetal = p.flowerDiameter / 5.2;
  const petalCenterOffset = p.flowerDiameter / 2 - rPetal;

  let flowerDrawing = drawCircle(rInner + 4.5);
  for (let index = 0; index < p.petalCount; index++) {
    const angle = (index * 360) / p.petalCount;
    const petal = drawCircle(rPetal)
      .translate(petalCenterOffset, 0)
      .rotate(angle);
    flowerDrawing = flowerDrawing.fuse(petal);
  }

  flowerDrawing = flowerDrawing.fillet(2.5);
  flowerDrawing = flowerDrawing.cut(drawCircle(rInner));

  let flowerBase = flowerDrawing.sketchOnPlane('XY').extrude(p.petalThickness);
  try {
    flowerBase = flowerBase.fillet(0.8);
  } catch {
    // Replicad fillets are best-effort in this fixture; the outline regression is about the section cut.
  }

  const rHub = rInner + 3.5;
  const hPetal = p.petalThickness;
  const hFunnel = p.funnelHeight;
  const rTopOuter = p.funnelOuterRadius;
  const wallThickness = p.funnelWallThickness;
  const rTopInner = rTopOuter - wallThickness;

  const funnelProfile = draw([rInner, 0])
    .lineTo([rHub, 0])
    .lineTo([rHub, hPetal])
    .lineTo([rTopOuter, hFunnel])
    .lineTo([rTopInner, hFunnel])
    .lineTo([rTopInner - (rTopOuter - rHub), hPetal])
    .lineTo([rInner, 1.5])
    .lineTo([rInner, 0])
    .close();

  const funnel = funnelProfile.sketchOnPlane('XZ').revolve([0, 0, 1]);
  let flower = flowerBase.fuse(funnel);

  const drillHole = makeCylinder(rInner, hFunnel + 4).translateZ(-2);
  flower = flower.cut(drillHole);

  try {
    flower = flower.fillet(0.6, (edgeFinder) =>
      edgeFinder.withinDistance(rInner + 0.2, [0, 0, 0]),
    );
  } catch {
    // Keep the section-outline fixture renderable if a local kernel build rejects this edge query.
  }

  for (let index = 0; index < p.petalCount; index++) {
    const angle = (index * 360) / p.petalCount;
    const majorRadius = rPetal * 0.55;
    const minorRadius = rPetal * 0.3;

    const vein = drawEllipse(majorRadius, minorRadius)
      .translate(petalCenterOffset + 1, 0)
      .sketchOnPlane('XY', p.petalThickness - p.debossDepth)
      .extrude(p.debossDepth + 0.5)
      .rotate(angle);

    flower = flower.cut(vein);
  }

  try {
    flower = flower.fillet(0.3, (edgeFinder) =>
      edgeFinder.inPlane('XY', p.petalThickness).ofCurveType('ELLIPSE'),
    );
  } catch {
    // Keep the imported user fixture source stable across minor kernel differences.
  }

  try {
    flower = flower.fillet(0.5, (edgeFinder) =>
      edgeFinder.inPlane('XY', hFunnel).ofCurveType('CIRCLE'),
    );
  } catch {
    // The section-outline visual regression does not depend on this cosmetic lip fillet.
  }

  return [
    {
      shape: flower,
      color: '#E31B23',
      name: 'Hummingbird Flower Attachment',
    },
  ];
}
