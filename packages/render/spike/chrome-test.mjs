// S1 browser leg: render the gear fixture inside a module worker in headless
// Chromium via WebGPU, save the PNG, and assert its dimensions. The verdict
// arrives via the page's POST /result — no page globals involved.
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { startServer } from '#spike/server.mjs';

const outDirectory = fileURLToPath(new URL('out', import.meta.url));

// Flag sets tried in order until a WebGPU adapter materializes.
const launchAttempts = [
  { channel: 'chromium', headless: true, args: ['--enable-unsafe-webgpu'] },
  { channel: 'chromium', headless: true, args: ['--enable-unsafe-webgpu', '--use-angle=metal'] },
  { headless: true, args: ['--enable-unsafe-webgpu'] },
];

/** @type {(buffer: Buffer, width: number, height: number) => void} */
const assertPng = (buffer, width, height) => {
  const magic = [0x89, 0x50, 0x4e, 0x47];
  if (!magic.every((byte, index) => buffer[index] === byte)) {
    throw new Error('not a PNG');
  }
  const actualWidth = buffer.readUInt32BE(16);
  const actualHeight = buffer.readUInt32BE(20);
  if (actualWidth !== width || actualHeight !== height) {
    throw new Error(`expected ${width}x${height}, got ${actualWidth}x${actualHeight}`);
  }
};

/** @type {() => Promise<import('./server.mjs').SpikeResult>} */
const timeoutResult = async () =>
  new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve({ ok: false, error: 'timeout waiting for result' });
    }, 45_000);
    timer.unref();
  });

const { server, port, nextResult } = await startServer();

/** @param analysis - Browser-derived fixture silhouette metrics. */
const assertInterleavedFixture = (analysis) => {
  if (
    !analysis ||
    analysis.foregroundPixels < 1000 ||
    !analysis.hasInteriorGap ||
    analysis.leftPixels < 300 ||
    analysis.rightPixels < 300
  ) {
    throw new Error(`interleaved fixture silhouette is incomplete: ${JSON.stringify(analysis)}`);
  }
};

/** @param presentation Browser-measured responsive capture layout. */
/** @type {(presentation: import('./server.mjs').SpikeResult['presentation']) => void} */
const assertPresentation = (presentation) => {
  const widthsMatch = (widths, expected) =>
    Array.isArray(widths) && widths.length === 6 && widths.every((width) => Math.abs(width - expected) <= 0.25);
  const { narrow, wide, singleObjectFit } = presentation ?? {};
  if (
    narrow?.columns !== 2 ||
    wide?.columns !== 3 ||
    !widthsMatch(narrow.imageWidths, 216.5) ||
    !widthsMatch(wide.imageWidths, 142) ||
    singleObjectFit !== 'contain'
  ) {
    throw new Error(`capture presentation layout drifted: ${JSON.stringify(presentation)}`);
  }
};

/** @type {(options: (typeof launchAttempts)[number]) => Promise<(import('./server.mjs').SpikeResult & { options?: object }) | undefined>} */
const runAttempt = async (options) => {
  const browser = await chromium.launch(options);
  try {
    const page = await browser.newPage();
    page.on('console', (message) => {
      console.log(`  [page] ${message.text()}`);
    });
    let reported = nextResult();
    await page.goto(`http://127.0.0.1:${port}/?presentation=1`);
    let result = await Promise.race([reported, timeoutResult()]);
    console.log(`attempt ${JSON.stringify(options)} → ${result.ok ? 'OK' : `FAIL: ${result.error}`}`);
    if (!result.ok) {
      return undefined;
    }
    assertPresentation(result.presentation);
    const png = Buffer.from(result.pngBase64 ?? '', 'base64');
    assertPng(png, 768, 432);
    if (png.length < 5000) {
      throw new Error(`suspiciously small PNG (${png.length} bytes) — likely blank`);
    }
    const webp = Buffer.from(result.webpBase64 ?? '', 'base64');
    if (webp.toString('latin1', 0, 4) !== 'RIFF' || webp.toString('latin1', 8, 12) !== 'WEBP') {
      throw new Error('webp output is not a WebP');
    }
    const jpeg = Buffer.from(result.jpegBase64 ?? '', 'base64');
    if (!(jpeg[0] === 0xff && jpeg[1] === 0xd8)) {
      throw new Error('jpeg output is not a JPEG');
    }
    await mkdir(outDirectory, { recursive: true });
    await page.screenshot({ fullPage: true, path: `${outDirectory}/chrome-presentation.png` });
    await writeFile(`${outDirectory}/chrome.png`, png);
    await writeFile(`${outDirectory}/chrome.webp`, webp);
    await writeFile(`${outDirectory}/chrome.jpg`, jpeg);

    reported = nextResult();
    await page.goto(`http://127.0.0.1:${port}/?fixture=${encodeURIComponent('interleaved-instanced-lines.glb')}`);
    result = await Promise.race([reported, timeoutResult()]);
    if (!result.ok) {
      throw new Error(`interleaved fixture failed: ${result.error}`);
    }
    const { analysis } = result;
    assertInterleavedFixture(analysis);
    if (!result.invalidGlbError?.startsWith('parse:')) {
      throw new Error(`browser invalid-GLB taxonomy failed: ${result.invalidGlbError ?? 'missing'}`);
    }
    const fixturePng = Buffer.from(result.pngBase64 ?? '', 'base64');
    assertPng(fixturePng, 768, 432);
    await writeFile(`${outDirectory}/chrome-interleaved.png`, fixturePng);
    return { ...result, options };
  } finally {
    await browser.close();
  }
};

/** @type {(import('./server.mjs').SpikeResult & { options?: object }) | undefined} */
let verdict;
for (const options of launchAttempts) {
  // oxlint-disable-next-line no-await-in-loop -- fallback chain: flag sets must run sequentially until one produces a WebGPU adapter
  verdict = await runAttempt(options);
  if (verdict) {
    break;
  }
}

server.close();

if (verdict) {
  console.log(
    `PASS: adapter=${verdict.adapter} init=${verdict.initTime}ms render=${verdict.renderTime}ms render2=${verdict.secondRenderTime}ms codecs=${verdict.codecTime}ms png=${verdict.pngBytes}B webp=${verdict.webpBytes}B jpeg=${verdict.jpegBytes}B → spike/out/chrome.{png,webp,jpg}`,
  );
} else {
  console.error('FAIL: no launch configuration produced a WebGPU render');
  process.exitCode = 1;
}
