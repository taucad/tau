import { importSTLAsMesh, makeBox } from 'replicad';
import { stlBytes } from './upstream-asset.js';
import { mountWidth } from './downstream.settings.js';

export default async function main() {
  const insert = await importSTLAsMesh(
    new Blob([stlBytes], { type: 'model/stl' }),
  );
  return {
    shapes: [
      { shape: insert.translate([0, 0, 5]), name: 'Imported mesh insert' },
      {
        shape: makeBox([-mountWidth / 2, -10, -2], [mountWidth / 2, 10, 0]),
        name: 'Replicad mount',
      },
    ],
  };
}
