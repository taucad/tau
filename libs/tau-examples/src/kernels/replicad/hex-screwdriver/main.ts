/**
 * Parametric M5 Allen Key Screwdriver
 * A customizable M5 Allen key screwdriver with adjustable hexagonal handle and shaft dimensions.
 */
import {
  drawCircle,
  drawPolysides,
} from 'replicad';

export const defaultParams = {
  handleLength: 100, // Length of the handle in mm
  handleSize: 20, // Size of the hexagonal handle in mm
  shaftLength: 75, // Length of the shaft in mm
  shaftDiameter: 5, // Diameter of the shaft in mm
  hexSize: 5, // Size of the hexagonal tip in mm (M5)
  hexLength: 10, // Length of the tip in mm
  filletRadius: 2, // Radius for filleting edges
};

export default function main(
  p = defaultParams,
) {
  // Create hexagonal handle
  let handle = drawPolysides(
    p.handleSize / 2,
    6,
  )
    .sketchOnPlane()
    .extrude(p.handleLength);

  // Apply fillet to the edges of the handle
  handle = handle.fillet(
    p.filletRadius,
  );

  // Create shaft
  const shaft = drawCircle(
    p.shaftDiameter / 2,
  )
    .sketchOnPlane()
    .extrude(p.shaftLength)
    .translate([0, 0, p.handleLength]);

  // Create hexagonal tip
  const hexTip = drawPolysides(
    p.hexSize / 2,
    6,
  )
    .sketchOnPlane()
    .extrude(p.hexLength)
    .translate([
      0,
      0,
      p.handleLength + p.shaftLength,
    ]);

  // Combine handle, shaft, and hex tip
  return handle
    .fuse(shaft)
    .fuse(hexTip);
}
