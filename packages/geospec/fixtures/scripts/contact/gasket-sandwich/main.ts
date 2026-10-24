import { drawRectangle, makeBaseBox } from 'replicad';
import { face } from '@taucad/replicad/annotations';

export const defaultParams = {
  headLift: 0, // Mm - lift of the head off the gasket's upper face
};

export default function main(p = defaultParams) {
  const deck = makeBaseBox(60, 60, 10); // z ∈ [0, 10]
  const gasket = makeBaseBox(60, 60, 1.2).translate([0, 0, 10]); // z ∈ [10, 11.2]
  const head = drawRectangle(60, 60)
    .sketchOnPlane()
    .extrude(10)
    .translate([0, 0, 11.2 + p.headLift]);

  return [
    { shape: deck, name: 'block', interfaces: { deck: face((f) => f.inPlane('XY', 10)) } },
    {
      shape: gasket,
      name: 'gasket',
      interfaces: {
        lower: face((f) => f.inPlane('XY', 10)),
        upper: face((f) => f.inPlane('XY', 11.2)),
      },
    },
    {
      shape: head,
      name: 'head',
      interfaces: { deck: face((f) => f.inPlane('XY', 11.2 + p.headLift)) },
    },
  ];
}
