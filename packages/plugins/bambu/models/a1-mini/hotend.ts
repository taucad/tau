/**
 * A1 mini installed hotend tip, from official A1-series service photographs.
 * Tip datum is Z=0; dimensions are visual estimates, not manufacturing CAD.
 * Rounded silicone body, narrower nose, side pull tab and stainless nozzle.
 */
// eslint-disable-next-line import-x/no-extraneous-dependencies -- The export kernel supplies Replicad.
import { draw, drawRoundedRectangle, drawText } from 'replicad';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Kernel-provided model types.
import type { AnyShape } from 'replicad';

/**
 * Builds the installed silicone sock and the protruding nozzle.
 * @returns Named material shapes for the existing GLB exporter.
 */
export default function main(): Array<
  Readonly<{
    shape: AnyShape;
    name: string;
    color: string;
    roughness: number;
    metalness: number;
  }>
> {
  const body = drawRoundedRectangle(14, 14, 2)
    .sketchOnPlane('XY', 10)
    .extrude(14)
    .fuse(drawRoundedRectangle(2, 4, 0.5).translate(-7, 0).sketchOnPlane('XY', 15).extrude(5));
  const nose = draw([0, 2])
    .lineTo([3.6, 2])
    .lineTo([5, 4])
    .lineTo([5, 10])
    .lineTo([0, 10])
    .close()
    .sketchOnPlane('XZ')
    .revolve();
  const nozzle = draw([0.2, 0])
    .lineTo([0.6, 0])
    .lineTo([1.6, 1.5])
    .lineTo([1.6, 2])
    .lineTo([0.2, 2])
    .close()
    .sketchOnPlane('XZ')
    .revolve();
  const glyphs = drawText('HOT CAUTION', { fontSize: 1.4 }).translate(-5.4, 15);
  const ink = glyphs.sketchOnPlane('XZ', 7.02);
  return [
    { shape: body.fuse(nose), name: 'sock', color: '#2C3035', roughness: 0.8, metalness: 0 },
    { shape: nozzle, name: 'nozzle', color: '#BAB5AF', roughness: 0.3, metalness: 1 },
    {
      shape: 'faces' in ink ? ink.faces() : ink.face(),
      name: 'warning',
      color: '#C4A168',
      roughness: 0.8,
      metalness: 0,
    },
  ];
}
