import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import openCascade from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import { createPicoVoxelLogo, type LogoTile } from './main.js';

setOC(openCascade);

const formatPath = (path: string): string =>
  path.replaceAll(/-?\d+(?:\.\d+)?/g, (value) =>
    String(Number(Number(value).toFixed(5))),
  );

const toPathElement = ({ shape, color }: LogoTile): string =>
  `<path fill="${color}" d="${shape
    .toSVGPaths()
    .flat()
    .map((path) => formatPath(path))
    .join(' ')}"/>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${createPicoVoxelLogo()
  .map((tile) => toPathElement(tile))
  .join('')}</svg>\n`;

const directory = dirname(fileURLToPath(import.meta.url));
const output = join(directory, 'picovoxel.svg');

if (process.argv.includes('--check')) {
  if (readFileSync(output, 'utf8') !== svg) {
    throw new Error(`Generated logo differs: ${output}`);
  }
} else {
  writeFileSync(output, svg);
}
