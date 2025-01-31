import { drawRectangle, Shell } from 'replicad';


export type Dimensions = {
  thickness: number;
  height: number;
  width: number;
  depth: number;
};

// The replicad code! Not much there!
export function drawBox({ thickness, height, width, depth }: Dimensions): Shell {
  return drawRectangle(width, depth)
    .sketchOnPlane()
    .extrude(height)
    // @ts-expect-error - incorrect types
    .shell(thickness, (f) => f.inPlane('XY', height)) as Shell;
}
