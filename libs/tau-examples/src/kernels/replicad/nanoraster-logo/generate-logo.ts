/**
 * Writes the nanoraster brand assets.
 *
 *   tsx generate-logo.ts            # write the assets
 *   tsx generate-logo.ts --check    # fail if they have drifted
 *
 * `nanoraster.svg` is the square mark, shipped verbatim as the repository's
 * logo and favicon. `banner.svg` is the wide README lockup: the same mark,
 * the wordmark, and a rule, on the mark's own ground.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import openCascade from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import { createNanorasterLogo, type LogoTile } from './main.js';
import { wordmarkBox, wordmarkPath } from './wordmark.js';

setOC(openCascade);

const brandBox = 512;
const ground = '#0a1418';
const rule = '#22d3ee';

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

/**
 * Gradient id for a scanline. Prefixed because a README embeds several of
 * these marks into one document, where ids share a namespace.
 */
const gradientId = (prefix: string, index: number): string =>
  `${prefix}s${index}`;

const toDefs = (tiles: readonly LogoTile[], prefix: string): string =>
  tiles
    .map(
      (tile, index) =>
        `<linearGradient id="${gradientId(prefix, index)}" x1="${tile.span[0].toFixed(1)}" y1="0" x2="${tile.span[1].toFixed(1)}" y2="0" gradientUnits="userSpaceOnUse">${tile.stops
          .map(
            (stop, step) =>
              `<stop offset="${((step / (tile.stops.length - 1)) * 100).toFixed(1)}%" stop-color="${stop}"/>`,
          )
          .join('')}</linearGradient>`,
    )
    .join('');

const toPathElement = (tile: LogoTile, index: number, prefix: string): string =>
  `<path fill="url(#${gradientId(prefix, index)})" d="${svgPath(tile.shape)}"/>`;

const tiles = createNanorasterLogo();
const markup = (prefix: string): string =>
  `<defs>${toDefs(tiles, prefix)}</defs>${tiles.map((tile, index) => toPathElement(tile, index, prefix)).join('')}`;

const square = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${brandBox} ${brandBox}">${markup('m')}</svg>\n`;

/* -------------------------------------------------------------------- *
 * Banner: mark, wordmark, rule. Sized so the mark's optical centre and
 * the wordmark's optical centre sit on one line.
 * -------------------------------------------------------------------- */
const bannerHeight = 260;
const markSize = 168;
const columnGap = 40;
const sidePadding = 96;
const ruleHeight = 8;
const ruleGap = 20;
const cornerRadius = 36;

const wordWidth = wordmarkBox.x2 - wordmarkBox.x1;
const contentWidth = markSize + columnGap + wordWidth;
const bannerWidth = Math.round(contentWidth + sidePadding * 2);
const left = (bannerWidth - contentWidth) / 2;
// Centre on the wordmark's ink, not on its baseline.
const baseline = bannerHeight / 2 - (wordmarkBox.y1 + wordmarkBox.y2) / 2;
const wordLeft = left + markSize + columnGap - wordmarkBox.x1;

// The banner supplies the dark ground the white wordmark needs, and the mark
// drops onto it unchanged. Its gradients take a separate prefix so the two
// marks never collide when both are inlined in one page.
const scanlines = markup('b');

const roundedRect = (width: number, height: number, radius: number): string =>
  [
    `M ${radius} 0`,
    `L ${width - radius} 0`,
    `A ${radius} ${radius} 0 0 1 ${width} ${radius}`,
    `L ${width} ${height - radius}`,
    `A ${radius} ${radius} 0 0 1 ${width - radius} ${height}`,
    `L ${radius} ${height}`,
    `A ${radius} ${radius} 0 0 1 0 ${height - radius}`,
    `L 0 ${radius}`,
    `A ${radius} ${radius} 0 0 1 ${radius} 0`,
    'Z',
  ].join(' ');

const banner = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${bannerWidth} ${bannerHeight}" width="${bannerWidth}" height="${bannerHeight}">
<path fill="${ground}" d="${roundedRect(bannerWidth, bannerHeight, cornerRadius)}"/>
<g transform="translate(${left.toFixed(3)} ${((bannerHeight - markSize) / 2).toFixed(3)}) scale(${(markSize / brandBox).toFixed(5)})">${scanlines}</g>
<path fill="#ffffff" transform="translate(${wordLeft.toFixed(3)} ${baseline.toFixed(3)})" d="${wordmarkPath}"/>
<rect x="${(wordLeft + wordmarkBox.x1).toFixed(2)}" y="${(baseline + wordmarkBox.y2 + ruleGap).toFixed(2)}" width="${wordWidth.toFixed(2)}" height="${ruleHeight}" fill="${rule}"/>
</svg>
`;

const here = dirname(fileURLToPath(import.meta.url));
const targets: ReadonlyArray<readonly [string, string]> = [
  [join(here, 'nanoraster.svg'), square],
  [join(here, 'banner.svg'), banner],
];

if (process.argv.includes('--check')) {
  for (const [path, contents] of targets) {
    if (readFileSync(path, 'utf8') !== contents) {
      throw new Error(`Generated asset differs: ${path}`);
    }
  }
} else {
  for (const [path, contents] of targets) {
    writeFileSync(path, contents);
  }
}
