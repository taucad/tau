/**
 * Writes the libassimp brand assets from the Replicad source.
 *
 *   tsx generate-logo.ts                    # write libassimp.svg and banner.svg here
 *   tsx generate-logo.ts --check            # fail if they have drifted
 *   tsx generate-logo.ts --install <root>   # also write the full pack into a libassimp checkout
 *
 * `libassimp.svg` is the square mark, shipped verbatim as the repository's
 * logo and SVG favicon. `banner.svg` is the wide README lockup: the same mark,
 * the outlined wordmark, and a rule on a dark ground. `--install` adds the
 * raster derivatives the docs site needs: a full-bleed 180 px Apple touch
 * icon and a PNG-in-ICO favicon at 16, 32 and 48 px.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import openCascade from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import { brandBox, createLibassimpLogo, type LogoTile } from './main.js';
import { wordmarkBox, wordmarkPath } from './wordmark.js';

setOC(openCascade);

const ground = '#1c0e08';
const rule = '#ff9a2e';

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

/** The drawing is y-up about the origin; one group places it in the brand box. */
const markup = `<g transform="translate(${brandBox / 2} ${brandBox / 2}) scale(1 -1)">${createLibassimpLogo()
  .map(({ shape, color }) => `<path fill="${color}" d="${svgPath(shape)}"/>`)
  .join('')}</g>`;

const square = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${brandBox} ${brandBox}">${markup}</svg>\n`;

/* -------------------------------------------------------------------- *
 * Banner: mark, wordmark, rule. Sized so the mark's optical centre and
 * the wordmark's optical centre sit on one line.
 * -------------------------------------------------------------------- */
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

/* -------------------------------------------------------------------- *
 * Raster derivatives. PNG-in-ICO is what every current browser reads and
 * what nanoraster ships; the Apple icon is opaque because iOS masks it.
 * -------------------------------------------------------------------- */
const icoSizes = [16, 32, 48] as const;
const appleSize = 180;
/** Mark size inside the Apple icon: the rim clears iOS's corner mask. */
const appleMark = 132;

const toIco = (pngs: ReadonlyArray<readonly [number, Buffer]>): Buffer => {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const entries = Buffer.alloc(16 * pngs.length);
  let offset = 6 + entries.length;
  for (const [index, [size, png]] of pngs.entries()) {
    const entry = index * 16;
    entries.writeUInt8(size, entry);
    entries.writeUInt8(size, entry + 1);
    entries.writeUInt8(0, entry + 2);
    entries.writeUInt8(0, entry + 3);
    entries.writeUInt16LE(1, entry + 4);
    entries.writeUInt16LE(32, entry + 6);
    entries.writeUInt32LE(png.length, entry + 8);
    entries.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  }
  return Buffer.concat([header, entries, ...pngs.map(([, png]) => png)]);
};

const install = async (root: string): Promise<void> => {
  const { default: sharp } = await import('sharp');
  const rasterize = async (size: number): Promise<Buffer> =>
    sharp(Buffer.from(square)).resize(size, size).png().toBuffer();
  const ico = toIco(
    await Promise.all(
      icoSizes.map(async (size) => [size, await rasterize(size)] as const),
    ),
  );
  const apple = await sharp({
    create: {
      width: appleSize,
      height: appleSize,
      channels: 3,
      background: ground,
    },
  })
    .composite([{ input: await rasterize(appleMark), gravity: 'centre' }])
    .removeAlpha()
    .png()
    .toBuffer();

  const files: ReadonlyArray<readonly [string, string | Buffer]> = [
    ['images/logo.svg', square],
    ['images/banner.svg', banner],
    ['docs-site/public/logo.svg', square],
    ['docs-site/public/favicon.svg', square],
    ['docs-site/public/favicon.ico', ico],
    ['docs-site/public/apple-touch-icon.png', apple],
  ];
  for (const [relative, contents] of files) {
    const path = join(root, relative);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
    console.log(`wrote ${path}`);
  }
};

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

const installIndex = process.argv.indexOf('--install');
if (installIndex !== -1) {
  const root = process.argv[installIndex + 1];
  if (!root) {
    throw new Error('--install needs the path of a libassimp checkout');
  }
  await install(root);
}
