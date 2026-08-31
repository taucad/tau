/** Writes the four favicon-first Fold Stack explorations and review board. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import openCascade from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import { brandBox, type LogoTile } from './main.js';
import { logoVariants } from './variants.js';
import { wordmarkPath } from './wordmark.js';

setOC(openCascade);

const formatPath = (path: string): string =>
  path.replaceAll(/-?\d+(?:\.\d+)?/g, (value) =>
    String(Number(Number(value).toFixed(3))),
  );

const svgPath = (shape: LogoTile['shape']): string =>
  shape
    .toSVGPaths()
    .flat()
    .map((path) => formatPath(path))
    .join(' ');

const markup = (tiles: readonly LogoTile[]): string =>
  tiles
    .map(({ shape, color }) => `<path fill="${color}" d="${svgPath(shape)}"/>`)
    .join('');

const here = dirname(fileURLToPath(import.meta.url));
const output = join(here, 'variants');
mkdirSync(output, { recursive: true });

for (const variant of logoVariants) {
  const tiles = variant.create();

  writeFileSync(
    join(output, variant.file),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${brandBox} ${brandBox}"><title>${variant.name}</title>${markup(tiles)}</svg>\n`,
  );
}

const cards = logoVariants
  .map((variant, index) => {
    const x = 32 + (index % 2) * 568;
    const y = 32 + Math.floor(index / 2) * 244;
    const mark = markup(variant.create());

    return `<g transform="translate(${x} ${y})">
  <rect width="536" height="212" rx="24" fill="#fff"/>
  <g transform="translate(22 34) scale(0.28125)">${mark}</g>
  <rect x="184" y="34" width="326" height="64" rx="12" fill="#f6f6f6"/>
  <g transform="translate(202 54) scale(0.046875)">${mark}</g>
  <g transform="translate(238 84) scale(0.28)"><path fill="#17120f" d="${wordmarkPath}"/></g>
  <text x="184" y="136" fill="#17120f" font-family="ui-sans-serif,system-ui,sans-serif" font-size="23" font-weight="750">${index + 1}. ${variant.name}</text>
  <text x="184" y="166" fill="#766a65" font-family="ui-sans-serif,system-ui,sans-serif" font-size="15">${variant.description}</text>
  <text x="184" y="190" fill="#a09590" font-family="ui-monospace,monospace" font-size="12">24 px nav fit</text>
</g>`;
  })
  .join('\n');

writeFileSync(
  join(output, 'review-board.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 520" width="1200" height="520">
<rect width="1200" height="520" fill="#efefef"/>
${cards}
</svg>\n`,
);
