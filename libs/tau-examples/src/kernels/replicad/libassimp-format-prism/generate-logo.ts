/**
 * Writes the libassimp brand assets.
 *
 *   tsx generate-logo.ts            # write the assets
 *   tsx generate-logo.ts --check    # fail if they have drifted
 *
 * `libassimp.svg` is the square mark, shipped verbatim as the repository's
 * logo and SVG favicon. `banner.svg` is the wide README lockup: the same mark,
 * the outlined wordmark, and a rule on a dark ground.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import openCascade from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import { brandBox, createLibassimpLogo, type LogoTile } from './main.js';
import { wordmarkBox, wordmarkPath } from './wordmark.js';

setOC(openCascade);

const ground = '#24130d';
const rule = '#ff9f1c';

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

const markup = createLibassimpLogo()
  .map(({ shape, color }) => `<path fill="${color}" d="${svgPath(shape)}"/>`)
  .join('');

const square = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${brandBox} ${brandBox}">${markup}</svg>\n`;

const bannerHeight = 260;
const markSize = 176;
const columnGap = 40;
const sidePadding = 96;
const ruleHeight = 8;
const ruleGap = 20;
const cornerRadius = 36;

const wordWidth = wordmarkBox.x2 - wordmarkBox.x1;
const contentWidth = markSize + columnGap + wordWidth;
const bannerWidth = Math.round(contentWidth + sidePadding * 2);
const left = (bannerWidth - contentWidth) / 2;
const baseline = bannerHeight / 2 - (wordmarkBox.y1 + wordmarkBox.y2) / 2;
const wordLeft = left + markSize + columnGap - wordmarkBox.x1;

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
<g transform="translate(${left.toFixed(3)} ${((bannerHeight - markSize) / 2).toFixed(3)}) scale(${(markSize / brandBox).toFixed(5)})">${markup}</g>
<path fill="#ffffff" transform="translate(${wordLeft.toFixed(3)} ${baseline.toFixed(3)})" d="${wordmarkPath}"/>
<rect x="${(wordLeft + wordmarkBox.x1).toFixed(2)}" y="${(baseline + wordmarkBox.y2 + ruleGap).toFixed(2)}" width="${wordWidth.toFixed(2)}" height="${ruleHeight}" fill="${rule}"/>
</svg>
`;

const here = dirname(fileURLToPath(import.meta.url));
const targets: ReadonlyArray<readonly [string, string]> = [
  [join(here, 'libassimp.svg'), square],
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
