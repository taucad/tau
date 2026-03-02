/**
 * Decorated Box Model
 * A customizable box with decorative patterns.
 */
import {
  sketchRectangle,
  EdgeFinder,
  FaceFinder,
  makePlane,
} from 'replicad';
import {
  addVoronoi,
  addGrid,
  addHoneycomb,
} from 'https://cdn.jsdelivr.net/npm/replicad-decorate/dist/studio/replicad-decorate.js';

export const defaultParams = {
  height: 30,
  depth: 80,
  width: 120,
  filletRadius: 5,
  shellThickness: 2,
  decorationStyle: 'voronoi',
  decorationMargin: 2,
  decorationPadding: 2,
  decorationRadius: 5,
  decorationCellCount: 20,
  decorationSeed: 5,
};

export default function main(
  p = defaultParams,
) {
  let shape = sketchRectangle(
    p.depth,
    p.width,
    makePlane('XY'),
  )
    .extrude(p.height)
    .fillet({
      radius: p.filletRadius,
      filter:
        new EdgeFinder().inDirection(
          'Z',
        ),
    })
    .shell({
      thickness: p.shellThickness,
      filter: new FaceFinder().inPlane(
        'XY',
        p.height,
      ),
    });

  const decorateParameters = {
    faceIndex: 18,
    depth: -p.shellThickness,
    radius: p.decorationRadius,
    margin: p.decorationMargin,
    padding: p.decorationPadding,
    cellCount: p.decorationCellCount,
    seed: p.decorationSeed,
  };

  switch (p.decorationStyle) {
    case 'voronoi': {
      shape = addVoronoi(
        shape,
        decorateParameters,
      );

      break;
    }

    case 'grid': {
      shape = addGrid(
        shape,
        decorateParameters,
      );

      break;
    }

    case 'honeycomb': {
      shape = addHoneycomb(
        shape,
        decorateParameters,
      );

      break;
    }

    default: {
      shape = addHoneycomb(
        shape,
        decorateParameters,
      );
    }
  }

  return shape;
}
