import type { ShapeConfig } from 'replicad';
import { drawRoundedRectangle, makeCylinder } from 'replicad';

export const defaultParams = { bodyLength: 80, bodyWidth: 30, wheelRadius: 8 } as const;

export default function main(p = defaultParams): ShapeConfig[] {
  const body = drawRoundedRectangle(p.bodyLength, p.bodyWidth, 4).sketchOnPlane('XY').extrude(20);
  const wheelL = makeCylinder(p.wheelRadius, 6).translate([-p.bodyLength / 3, p.bodyWidth / 2, 0]);
  const wheelR = makeCylinder(p.wheelRadius, 6).translate([p.bodyLength / 3, p.bodyWidth / 2, 0]);
  return [
    { shape: body, color: '#1E90FF', name: 'Body' },
    { shape: wheelL, color: '#222222', name: 'Wheel Left' },
    { shape: wheelR, color: '#222222', name: 'Wheel Right' },
  ];
}
