import { makeBaseBox, type ShapeConfig } from 'replicad';

export const defaultParams = {
  filletRadius: 3,
  chamferDistance: 2,
} as const;

type Params = typeof defaultParams;

export default function main(p: Params = defaultParams): ShapeConfig[] {
  const filletGauge = makeBaseBox(36, 26, 18).fillet(p.filletRadius);
  const chamferBase = makeBaseBox(34, 24, 16).translate([50, 0, 0]);
  const chamferGauge = chamferBase.chamfer(p.chamferDistance);

  return [
    { shape: filletGauge, color: '#9a9aa2', name: 'Fillet Gauge' },
    { shape: chamferGauge, color: '#b0b0b8', name: 'Chamfer Gauge' },
  ];
}
