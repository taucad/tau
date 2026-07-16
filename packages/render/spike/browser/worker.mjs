/* oxlint-disable no-restricted-imports, jsdoc-js/no-types -- generated wasm artifact and typed JavaScript spike */
// Dedicated module worker: loads the wasm renderer, fetches the fixture GLB,
// renders it twice (the second render probes the Safari 26 device-lost class
// of bugs), renders webp + jpeg through the codec entry point, and posts the
// bytes back.
import init, {
  render_glb_to_image,
  render_glb_to_images,
  bench_codecs,
  bench_multi_view,
  codec_conformance,
  describe_adapter,
} from './pkg/render_wasm.js';

/** @param {string} json @returns {unknown} */
const parseReport = (json) => /** @type {unknown} */ (JSON.parse(json));

/** @param {Uint8Array} png @returns {Promise<{ foregroundPixels: number, hasInteriorGap: boolean, leftPixels: number, rightPixels: number }>} */
const analyzePng = async (png) => {
  const bitmap = await createImageBitmap(new Blob([png], { type: 'image/png' }));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new Error('2d canvas unavailable for fixture analysis');
  }
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const columns = new Uint32Array(canvas.width);
  let foregroundPixels = 0;
  for (let offset = 3; offset < pixels.length; offset += 4) {
    if (pixels[offset] > 8) {
      foregroundPixels += 1;
      columns[((offset - 3) / 4) % canvas.width] += 1;
    }
  }
  const min = columns.findIndex((count) => count > 0);
  let max = columns.length - 1;
  while (max >= 0 && columns[max] === 0) {
    max -= 1;
  }
  const gapStart = min + Math.floor((max - min) * 0.35);
  const gapEnd = min + Math.ceil((max - min) * 0.65);
  const gap = columns.findIndex((count, index) => index >= gapStart && index <= gapEnd && count === 0);
  const split = gap === -1 ? Math.floor((min + max) / 2) : gap;
  const leftPixels = columns.slice(0, split).reduce((sum, count) => sum + count, 0);
  const rightPixels = columns.slice(split + 1).reduce((sum, count) => sum + count, 0);
  return { foregroundPixels, hasInteriorGap: gap !== -1, leftPixels, rightPixels };
};

// Guard against a stale spike build: spike/browser/pkg is a separate wasm-pack
// output from src/wasm, and a signature drift (the RenderRequest JSON contract
// replaced 6 positional args) once produced a phantom cross-browser failure.
if (render_glb_to_image.length !== 2 || render_glb_to_images.length !== 2) {
  throw new Error(
    `stale spike pkg: expected singular/plural (glb, options_json) bindings — run \`pnpm nx spike:wasm render\``,
  );
}

/** Current 4:3 thumbnail plus the historical comparison sizes. */
const BENCH_SIZES = [
  [640, 360],
  [768, 576],
  [1280, 720],
  [1920, 1080],
  [2560, 1440],
  [3840, 2160],
];

/**
 * Failure-path diagnostic: report the raw WebGPU state of the worker scope so
 * a wasm-glue error can be attributed (missing API vs denied adapter vs a
 * real render bug). Never runs on success.
 */
const probeGpu = async () => {
  try {
    const { gpu: navigatorGpu } = globalThis.navigator;
    const gpu =
      /** @type {{ requestAdapter: () => Promise<{ info?: { vendor?: string, architecture?: string } } | null> } | undefined} */ (
        navigatorGpu
      );
    if (!gpu) {
      return ' [worker navigator.gpu: missing]';
    }
    const adapter = await gpu.requestAdapter();
    if (!adapter) {
      return ' [worker navigator.gpu: present; requestAdapter → null]';
    }
    const info = adapter.info ? `${adapter.info.vendor ?? ''} ${adapter.info.architecture ?? ''}`.trim() : 'no info';
    return ` [worker navigator.gpu: present; adapter granted (${info})]`;
  } catch (probeError) {
    return ` [worker gpu probe threw: ${String(probeError)}]`;
  }
};

globalThis.addEventListener('message', async (event) => {
  const { glbUrl, width, height, bench } =
    /** @type {{ glbUrl: string, width: number, height: number, bench?: boolean }} */ (event.data);
  let step = 'init';
  try {
    const t0 = performance.now();
    await init();
    /** Milliseconds. */
    const initTime = Math.round(performance.now() - t0);

    step = 'fetch-glb';
    const response = await fetch(glbUrl);
    const glb = new Uint8Array(await response.arrayBuffer());
    step = 'describe-adapter';
    const adapter = await describe_adapter();

    if (bench) {
      step = 'bench';
      const results = /** @type {unknown[]} */ ([]);
      for (const [benchWidth, benchHeight] of BENCH_SIZES) {
        // oxlint-disable-next-line no-await-in-loop -- sequential by design: sizes share one GPU
        results.push(parseReport(await bench_codecs(glb, benchWidth, benchHeight)));
      }
      const multiView = parseReport(await bench_multi_view(glb, 768, 432));
      const codecConformance = parseReport(codec_conformance());
      globalThis.postMessage({ ok: true, adapter, initTime, bench: results, codecConformance, multiView });
      return;
    }

    step = 'first-render';
    const t1 = performance.now();
    const png = await render_glb_to_image(glb, JSON.stringify({ width, height, format: 'png' }));
    /** Milliseconds. */
    const renderTime = Math.round(performance.now() - t1);

    step = 'second-render';
    const t2 = performance.now();
    await render_glb_to_image(glb, JSON.stringify({ width, height, format: 'png' }));
    /** Milliseconds. */
    const secondRenderTime = Math.round(performance.now() - t2);

    step = 'codecs';
    const t3 = performance.now();
    const webp = await render_glb_to_image(glb, JSON.stringify({ width, height, format: 'webp' }));
    const jpeg = await render_glb_to_image(
      glb,
      JSON.stringify({ width, height, format: 'jpeg', quality: 0.85, background: [1, 1, 1, 1] }),
    );
    /** Milliseconds. */
    const codecTime = Math.round(performance.now() - t3);
    const webpMagic =
      String.fromCodePoint(...webp.subarray(0, 4)) === 'RIFF' &&
      String.fromCodePoint(...webp.subarray(8, 12)) === 'WEBP';
    if (!webpMagic || !(jpeg[0] === 0xff && jpeg[1] === 0xd8)) {
      throw new Error('webp/jpeg magic bytes wrong');
    }

    step = 'invalid-glb';
    let invalidGlbError = '';
    try {
      await render_glb_to_image(new Uint8Array([0]), JSON.stringify({ width, height, format: 'png' }));
    } catch (error) {
      invalidGlbError = String(error instanceof Error ? error.message : error);
    }
    if (!invalidGlbError.startsWith('parse:')) {
      throw new Error(`invalid GLB did not produce parse: (${invalidGlbError || 'no error'})`);
    }

    step = 'analyze-png';
    const analysis = await analyzePng(png);

    step = 'batch';
    const views = [
      { id: 'front', phi: 90, theta: 0 },
      { id: 'top', phi: 0, theta: 0 },
    ];
    const shared = { width, height, format: 'png' };
    const batch = await render_glb_to_images(glb, JSON.stringify({ ...shared, views }));
    if (!Array.isArray(batch) || batch.length !== views.length) {
      throw new Error('batch output shape wrong');
    }
    for (const [index, view] of views.entries()) {
      // oxlint-disable-next-line no-await-in-loop -- conformance compares each batch output with its singular operation
      const one = await render_glb_to_image(glb, JSON.stringify({ ...shared, phi: view.phi, theta: view.theta }));
      if (batch[index].length !== one.length || batch[index].some((byte, offset) => byte !== one[offset])) {
        throw new Error(`batch view ${view.id} differs from singular bytes`);
      }
    }

    globalThis.postMessage(
      {
        ok: true,
        adapter,
        png,
        webp,
        jpeg,
        initTime,
        renderTime,
        secondRenderTime,
        codecTime,
        batchViews: batch.length,
        analysis,
        invalidGlbError,
      },
      [png.buffer, webp.buffer, jpeg.buffer],
    );
  } catch (error) {
    const diagnostic = await probeGpu();
    const stack =
      error instanceof Error && error.stack ? ` stack: ${error.stack.split('\n').slice(0, 4).join(' | ')}` : '';
    globalThis.postMessage({
      ok: false,
      error: `${step}: ${String(error instanceof Error ? error.message : error)}${diagnostic}${stack}`,
    });
  }
});

globalThis.postMessage({ ready: true });
