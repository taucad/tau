import sharp from 'sharp';
import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output = new URL(
  process.argv.includes('--dev') ? '../../../out/www-public/_www/assets/' : '../build/client/_www/assets/',
  import.meta.url,
);
await mkdir(output, { recursive: true });
await cp(new URL('../public/', import.meta.url), output, { recursive: true });
await Promise.all(
  ['planetary.json', 'planetary.bin.gz', 'planetary-face18.json', 'planetary-face18.bin.gz'].map(async (name) =>
    cp(fileURLToPath(import.meta.resolve(`@taucad/planetary-gearbox/assets/${name}`)), new URL(name, output)),
  ),
);

// Responsive versions of the committed CAD poster, generated deterministically by the pinned Sharp.
await Promise.all(
  [480, 720, 1200].map(async (width) =>
    sharp(fileURLToPath(new URL('../public/hero-gearbox.webp', import.meta.url)))
      .resize({ width })
      .avif({ quality: 55, effort: 6 })
      .toFile(fileURLToPath(new URL(`hero-gearbox-${width}.avif`, output))),
  ),
);

await Promise.all(
  Array.from({ length: 6 }, async (_, chapter) =>
    sharp(fileURLToPath(new URL(`../public/story-${chapter}.webp`, import.meta.url)))
      .resize({ width: 720 })
      .webp({ quality: 75 })
      .toFile(fileURLToPath(new URL(`story-${chapter}.webp`, output))),
  ),
);
await sharp(fileURLToPath(new URL('../public/hero-gearbox.webp', import.meta.url)))
  .resize({ width: 144 })
  .webp({ quality: 75 })
  .toFile(fileURLToPath(new URL('hero-thumbnail.webp', output)));
