/** DOM-free SVG-to-PNG rendering through package-owned resvg WASM. */

import { z } from 'zod';
import type { Resvg as ResvgType, ResvgRenderOptions } from '@resvg/resvg-wasm';
import { compileWasmStreaming, defineTranscoder, loadWasmBinary } from '@taucad/runtime/transcoder';
import type { ExportFile } from '@taucad/runtime/types';
import {
  renderImageAnnotatedMinDimension,
  renderImageBackgroundPattern,
  renderImageDimensionRange,
  renderImageLabelMaxLength,
  renderImageLabelPattern,
  renderImageMarginRange,
} from 'nanoraster';

const resvgWasmUrl = new URL(import.meta.resolve('@resvg/resvg-wasm/index_bg.wasm')).href;
// oxlint-disable-next-line unicorn/relative-url-style -- Vite only treats the explicit relative form as a build-owned asset.
const geistRegularUrl = new URL('./fonts/Geist-Regular.ttf', import.meta.url).href;
const internalImageUrl = 'https://tau.invalid/svg-source.png';
const textDecoder = new TextDecoder('utf-8', { fatal: true });

const resvgSha256 = '22bf6e9f9a100d972da0411a69c5ba504367fc1fa87b3b64e3f35e53926d2d70';
const geistRegularSha256 = '5c8968eafb98a4c4f47033daf29e38e284a6f2a82eb017d171ab040fe7c4b615';

const svgLabelSchema = z
  .string()
  .min(1, 'Label must not be empty')
  .max(renderImageLabelMaxLength, `Label must contain at most ${renderImageLabelMaxLength} characters`)
  .refine((label) => label.trim().length > 0, 'Label must not contain only whitespace')
  .regex(renderImageLabelPattern, 'Label contains an unsupported character');

/** Strict options shared by direct and runtime SVG rendering. @public */
export const svgPngOptionsSchema = z
  .object({
    width: z.number().int().min(renderImageDimensionRange[0]).max(renderImageDimensionRange[1]).default(768),
    height: z.number().int().min(renderImageDimensionRange[0]).max(renderImageDimensionRange[1]).default(432),
    margin: z.number().min(renderImageMarginRange[0]).max(renderImageMarginRange[1]).default(0.1),
    background: z.string().regex(renderImageBackgroundPattern, 'Expected #RRGGBB or #RRGGBBAA').default('#FFFFFF'),
    label: svgLabelSchema.optional(),
    axes: z.boolean().default(false),
    scaleBar: z.boolean().default(false),
    lengthSymbol: z
      .string()
      .min(1)
      .max(8)
      .regex(/^[\p{L}\p{M}"'°µμ/-]+$/u)
      .optional(),
  })
  .strict()
  .superRefine((options, context) => {
    if (
      (options.axes || options.scaleBar || options.label !== undefined) &&
      options.width < renderImageAnnotatedMinDimension
    ) {
      context.addIssue({
        code: 'custom',
        path: ['width'],
        message: `Annotated images require width ≥ ${renderImageAnnotatedMinDimension}`,
      });
    }
    if (
      (options.axes || options.scaleBar || options.label !== undefined) &&
      options.height < renderImageAnnotatedMinDimension
    ) {
      context.addIssue({
        code: 'custom',
        path: ['height'],
        message: `Annotated images require height ≥ ${renderImageAnnotatedMinDimension}`,
      });
    }
    if (options.scaleBar && options.lengthSymbol === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['lengthSymbol'],
        message: 'A CAD length symbol is required for a scale bar',
      });
    }
  });

/** SVG rendering options accepted by {@link renderSvgPng}. @public */
export type SvgPngOptions = z.input<typeof svgPngOptionsSchema>;
type ParsedSvgPngOptions = z.output<typeof svgPngOptionsSchema>;
type SvgFailureCode = 'parse' | 'backend' | 'encode';

/** Stable failure returned by direct SVG rendering and mapped by the service. @public */
export class SvgRenderError extends Error {
  public readonly code: SvgFailureCode;

  public constructor(code: SvgFailureCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SvgRenderError';
    this.code = code;
  }
}

type ResvgConstructor = typeof ResvgType;
type ResvgBackend = { readonly resvgConstructor: ResvgConstructor; readonly font: Uint8Array<ArrayBuffer> };
let backendPromise: Promise<ResvgBackend> | undefined;

const loadBackend = async (): Promise<ResvgBackend> => {
  backendPromise ??= (async () => {
    const [resvg, wasm, fontBuffer] = await Promise.all([
      import('@resvg/resvg-wasm'),
      compileWasmStreaming(resvgWasmUrl),
      loadWasmBinary(geistRegularUrl),
    ]);
    await resvg.initWasm(wasm);
    return { resvgConstructor: resvg.Resvg, font: new Uint8Array(fontBuffer) };
  })();
  try {
    return await backendPromise;
  } catch (error) {
    backendPromise = undefined;
    throw error;
  }
};

const escapeXml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

const niceLength = (target: number): number => {
  if (!(target > 0) || !Number.isFinite(target)) {
    throw new SvgRenderError('parse', 'SVG scale bar requires finite positive drawing bounds');
  }
  const power = 10 ** Math.floor(Math.log10(target));
  const normalized = target / power;
  const factor = normalized >= 5 ? 5 : normalized >= 2 ? 2 : 1;
  return factor * power;
};

const formatLength = (value: number): string => {
  if (value >= 1e4 || value < 1e-3) {
    return value.toExponential(2).replace(/\.00(?=e)/u, '');
  }
  return Number(value.toPrecision(3)).toString();
};

type Layout = {
  readonly contentX: number;
  readonly contentY: number;
  readonly contentWidth: number;
  readonly contentHeight: number;
  readonly inset: number;
  readonly fontSize: number;
  readonly chipHeight: number;
  readonly axesSide: number;
  readonly scaleWidth: number;
};

const createLayout = (options: ParsedSvgPngOptions, sourceAspect: number): Layout => {
  const minDimension = Math.min(options.width, options.height);
  const inset = Math.max(1, Math.round(minDimension * 0.03));
  const guard = Math.max(2, Math.round(minDimension * 0.02));
  const fontSize = Math.max(12, Math.round(minDimension * 0.025));
  const chipHeight = Math.ceil(fontSize * 2.15);
  const axesSide = options.axes ? Math.max(16, Math.round(minDimension * 0.18)) : 0;
  const scaleHeight = options.scaleBar ? Math.ceil(fontSize * 3) : 0;
  const topReserved = options.label === undefined ? inset : inset + chipHeight + guard;
  const bottomReserved = inset + Math.max(axesSide, scaleHeight) + (options.axes || options.scaleBar ? guard : 0);
  const margin = minDimension * options.margin;
  const availableWidth = options.width - 2 * (inset + margin);
  const availableHeight = options.height - topReserved - bottomReserved - 2 * margin;
  if (!(availableWidth > 0) || !(availableHeight > 0)) {
    throw new SvgRenderError('parse', 'SVG margin and annotations leave no room for the drawing');
  }
  const contentWidth = Math.max(1, Math.floor(Math.min(availableWidth, availableHeight * sourceAspect)));
  const contentHeight = Math.max(1, Math.floor(contentWidth / sourceAspect));
  return {
    contentX: Math.round((options.width - contentWidth) / 2),
    contentY: Math.round(topReserved + margin + (availableHeight - contentHeight) / 2),
    contentWidth,
    contentHeight,
    inset,
    fontSize,
    chipHeight,
    axesSide,
    scaleWidth: Math.min(Math.round(minDimension * 0.42), Math.floor(options.width / 2 - inset - guard)),
  };
};

const chip = ({
  x,
  y,
  width,
  height,
  radius,
}: {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly radius: number;
}): string =>
  `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="#FFFFFF" fill-opacity="0.92" stroke="#D1D5DB"/>`;

const labelMarkup = (options: ParsedSvgPngOptions, layout: Layout): string => {
  if (options.label === undefined) {
    return '';
  }
  const targetWidth = options.width * 0.46;
  const estimatedWidthAtOnePixel = Math.max(1, [...options.label].length * 0.6);
  const fontSize = Math.min(layout.fontSize, (targetWidth - layout.fontSize * 1.4) / estimatedWidthAtOnePixel);
  if (fontSize < 7) {
    throw new SvgRenderError('parse', 'SVG label does not fit the top-left overlay slot');
  }
  const width = Math.ceil(estimatedWidthAtOnePixel * fontSize + layout.fontSize * 1.4);
  const y = layout.inset;
  return `${chip({ x: layout.inset, y, width, height: layout.chipHeight, radius: layout.fontSize * 0.55 })}<text x="${layout.inset + width / 2}" y="${y + layout.chipHeight * 0.67}" text-anchor="middle" font-family="Geist" font-size="${fontSize}" fill="#000000">${escapeXml(options.label)}</text>`;
};

const scaleMarkup = (options: ParsedSvgPngOptions, layout: Layout, sourceWidth: number): string => {
  if (!options.scaleBar) {
    return '';
  }
  const unitsPerPixel = sourceWidth / layout.contentWidth;
  const targetPixels = layout.scaleWidth * 0.55;
  const length = niceLength(unitsPerPixel * targetPixels);
  const barWidth = length / unitsPerPixel;
  const height = Math.ceil(layout.fontSize * 3);
  const y = options.height - layout.inset - height;
  const centerX = layout.inset + layout.scaleWidth / 2;
  const barY = y + height * 0.36;
  const stroke = Math.max(1, layout.fontSize * 0.11);
  const left = centerX - barWidth / 2;
  const right = centerX + barWidth / 2;
  const label = `${formatLength(length)} ${options.lengthSymbol}`;
  return `${chip({ x: layout.inset, y, width: layout.scaleWidth, height, radius: layout.fontSize * 0.55 })}<g stroke="#000000" stroke-width="${stroke}" stroke-linecap="round"><line x1="${left}" y1="${barY}" x2="${right}" y2="${barY}"/><line x1="${left}" y1="${barY - stroke * 2}" x2="${left}" y2="${barY + stroke * 2}"/><line x1="${right}" y1="${barY - stroke * 2}" x2="${right}" y2="${barY + stroke * 2}"/></g><text x="${centerX}" y="${y + height * 0.79}" text-anchor="middle" font-family="Geist" font-size="${layout.fontSize * 0.82}" fill="#000000">${escapeXml(label)}</text>`;
};

const axesMarkup = (options: ParsedSvgPngOptions, layout: Layout): string => {
  if (!options.axes) {
    return '';
  }
  const x = options.width - layout.inset - layout.axesSide;
  const y = options.height - layout.inset - layout.axesSide;
  const originX = x + layout.axesSide * 0.28;
  const originY = y + layout.axesSide * 0.72;
  const extent = layout.axesSide * 0.46;
  const stroke = Math.max(2, layout.fontSize * 0.13);
  const arrow = Math.max(4, layout.fontSize * 0.35);
  return `${chip({ x, y, width: layout.axesSide, height: layout.axesSide, radius: layout.fontSize * 0.55 })}<g fill="none" stroke-width="${stroke}" stroke-linecap="round"><path d="M ${originX} ${originY} H ${originX + extent}" stroke="#FF0000"/><path d="M ${originX} ${originY} V ${originY - extent}" stroke="#008000"/></g><path d="M ${originX + extent} ${originY} l -${arrow} -${arrow / 2} v ${arrow} z" fill="#FF0000"/><path d="M ${originX} ${originY - extent} l -${arrow / 2} ${arrow} h ${arrow} z" fill="#008000"/><text x="${originX + extent + arrow * 0.5}" y="${originY + layout.fontSize * 0.35}" font-family="Geist" font-size="${layout.fontSize}" fill="#FF0000">+X</text><text x="${originX - layout.fontSize * 0.45}" y="${originY - extent - arrow * 0.45}" font-family="Geist" font-size="${layout.fontSize}" fill="#008000">+Y</text>`;
};

const resvgOptions = (font: Uint8Array<ArrayBuffer>): ResvgRenderOptions => ({
  font: { fontBuffers: [font], defaultFontFamily: 'Geist', sansSerifFamily: 'Geist' },
  shapeRendering: 2,
  textRendering: 2,
  imageRendering: 0,
});

const renderPng = (renderer: InstanceType<ResvgConstructor>): Uint8Array<ArrayBuffer> => {
  const image = renderer.render();
  try {
    return new Uint8Array(image.asPng());
  } finally {
    image.free();
  }
};

const assertPng = (bytes: Uint8Array<ArrayBuffer>, width: number, height: number): void => {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || signature.some((value, index) => bytes[index] !== value)) {
    throw new SvgRenderError('encode', 'resvg returned invalid PNG bytes');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(16) !== width || view.getUint32(20) !== height) {
    throw new SvgRenderError(
      'encode',
      `resvg returned ${view.getUint32(16)}×${view.getUint32(20)} instead of ${width}×${height}`,
    );
  }
};

/**
 * Render one canonical SVG artifact to a deterministic annotated PNG.
 * @param svg - Complete source SVG document.
 * @param rawOptions - Output size and annotation options.
 * @returns The rendered PNG artifact.
 * @public
 */
export const renderSvgPng = async (svg: string, rawOptions: SvgPngOptions = {}): Promise<ExportFile> => {
  let options: ParsedSvgPngOptions;
  try {
    options = svgPngOptionsSchema.parse(rawOptions);
  } catch (error) {
    throw new SvgRenderError('parse', error instanceof Error ? error.message : String(error), { cause: error });
  }

  let backend: ResvgBackend;
  try {
    backend = await loadBackend();
  } catch (error) {
    throw new SvgRenderError('backend', error instanceof Error ? error.message : String(error), { cause: error });
  }

  const { resvgConstructor, font } = backend;
  let sourceProbe: InstanceType<ResvgConstructor>;
  try {
    // oxlint-disable-next-line new-cap -- The dynamically imported class is held in a camel-case variable by naming policy.
    sourceProbe = new resvgConstructor(svg, resvgOptions(font));
  } catch (error) {
    throw new SvgRenderError('parse', error instanceof Error ? error.message : String(error), { cause: error });
  }
  let sourceWidth: number;
  let sourceHeight: number;
  try {
    sourceWidth = sourceProbe.width;
    sourceHeight = sourceProbe.height;
  } finally {
    sourceProbe.free();
  }
  if (!(sourceWidth > 0) || !Number.isFinite(sourceWidth) || !(sourceHeight > 0) || !Number.isFinite(sourceHeight)) {
    throw new SvgRenderError('parse', 'SVG has invalid intrinsic dimensions');
  }

  try {
    const layout = createLayout(options, sourceWidth / sourceHeight);
    // oxlint-disable-next-line new-cap -- The dynamically imported class is held in a camel-case variable by naming policy.
    const sourceRenderer = new resvgConstructor(svg, {
      ...resvgOptions(font),
      fitTo: { mode: 'width', value: layout.contentWidth },
    });
    let sourcePng: Uint8Array<ArrayBuffer>;
    try {
      sourcePng = renderPng(sourceRenderer);
    } finally {
      sourceRenderer.free();
    }

    const background =
      options.background.length === 9
        ? `<rect width="100%" height="100%" fill="${options.background.slice(0, 7)}" fill-opacity="${Number.parseInt(options.background.slice(7), 16) / 255}"/>`
        : `<rect width="100%" height="100%" fill="${options.background}"/>`;
    const wrapper = `<svg xmlns="http://www.w3.org/2000/svg" width="${options.width}" height="${options.height}" viewBox="0 0 ${options.width} ${options.height}" color="#111827">${background}<image href="${internalImageUrl}" x="${layout.contentX}" y="${layout.contentY}" width="${layout.contentWidth}" height="${layout.contentHeight}"/>${labelMarkup(options, layout)}${scaleMarkup(options, layout, sourceWidth)}${axesMarkup(options, layout)}</svg>`;
    // oxlint-disable-next-line new-cap -- The dynamically imported class is held in a camel-case variable by naming policy.
    const finalRenderer = new resvgConstructor(wrapper, resvgOptions(font));
    try {
      const unresolved = finalRenderer.imagesToResolve() as unknown[];
      if (!unresolved.includes(internalImageUrl)) {
        throw new SvgRenderError('backend', 'resvg did not expose the internal drawing image for resolution');
      }
      finalRenderer.resolveImage(internalImageUrl, sourcePng);
      const bytes = renderPng(finalRenderer);
      assertPng(bytes, options.width, options.height);
      return { name: 'render.png', mimeType: 'image/png', bytes };
    } finally {
      finalRenderer.free();
    }
  } catch (error) {
    if (error instanceof SvgRenderError) {
      throw error;
    }
    throw new SvgRenderError('backend', error instanceof Error ? error.message : String(error), { cause: error });
  }
};

const edges = [
  {
    from: 'svg',
    to: 'png',
    fidelity: 'mesh',
    optionsSchema: svgPngOptionsSchema,
  },
] as const;

/** SVG-to-PNG runtime transcoder sharing the direct renderer implementation. @public */
export const svgTranscoder = defineTranscoder({
  id: 'svg-image',
  name: 'SvgImageTranscoder',
  version: '1.0.0',
  implementationAssets: [
    { id: 'wasm:resvg', url: resvgWasmUrl, sha256: resvgSha256 },
    { id: 'font:Geist-Regular.ttf', url: geistRegularUrl, sha256: geistRegularSha256 },
  ],
  edges,
  async initialize() {
    return {};
  },
  async transcode(input, runtime) {
    if (input.files.length !== 1) {
      return {
        success: false,
        issues: [
          {
            message: `SVG transcoding expected exactly one source artifact, received ${input.files.length}`,
            code: 'RUNTIME',
            type: 'runtime',
            severity: 'error',
          },
        ],
      };
    }
    try {
      runtime.logger.log('Rendering SVG → png');
      const svg = textDecoder.decode(input.files[0]!.bytes);
      return { success: true, data: [await renderSvgPng(svg, input.options)], issues: [] };
    } catch (error) {
      const failure = error instanceof SvgRenderError ? error : new SvgRenderError('parse', String(error));
      return {
        success: false,
        issues: [
          {
            message: failure.message,
            code: 'RUNTIME',
            type: 'runtime',
            severity: 'error',
            details: { type: 'render', code: failure.code },
          },
        ],
      };
    }
  },
});
