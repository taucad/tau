/* oxlint-disable jsdoc-js/sort-tags -- Tau JSDoc policy places visibility before parameters */
/** Consumer options and strict wire serialization for image rendering. */

import type { ExportFile } from '@taucad/types';

/**
 * Output image formats. `jpg` aliases `jpeg`.
 *
 * @public
 */
export type RenderImageFormat = 'png' | 'webp' | 'jpeg' | 'jpg';

/**
 * World axis treated as up.
 *
 * @public
 */
export type RenderUpAxis = 'x' | 'y' | 'z';

/**
 * Camera projection used for the image.
 *
 * @public
 */
export type RenderProjection = 'perspective' | 'orthographic';

type RenderImageSharedOptions = {
  readonly format: RenderImageFormat;
  readonly width?: number;
  readonly height?: number;
  readonly quality?: number;
  readonly margin?: number;
  readonly up?: RenderUpAxis;
  readonly projection?: RenderProjection;
  readonly background?: readonly [number, number, number, number] | string;
  /** Include the bottom-right camera-aware XYZ indicator and front-on depth marker. */
  readonly includeAxes?: boolean;
  /** Include the top-left caller-authored label verbatim. */
  readonly includeLabel?: boolean;
  /**
   * Include a bottom-left physical scale. Perspective labels identify the
   * subject-center measurement plane with `@ center`; orthographic scale is
   * depth-invariant.
   */
  readonly includeScale?: boolean;
};

type RenderLabelOptions =
  | {
      readonly includeLabel: true;
      /** Screen-upright caller-authored text rendered verbatim. */
      readonly label: string;
    }
  | {
      readonly includeLabel?: false;
      /** Retained but not drawn when label inclusion is disabled. */
      readonly label?: string;
    };

/**
 * Options for one rendered image.
 *
 * @public
 */
export type RenderImageOptions = RenderImageSharedOptions &
  RenderLabelOptions & {
    readonly phi?: number;
    readonly theta?: number;
  };

/**
 * One identified camera in a multi-image request.
 *
 * @public
 */
export type RenderImageView<Id extends string = string> = {
  /** Stable result and filename identity. */
  readonly id: Id;
  /** Screen-upright caller-authored text rendered verbatim. */
  readonly label?: string;
  readonly phi: number;
  readonly theta: number;
};

type LabeledViews<Views extends readonly RenderImageView[]> = {
  readonly [Index in keyof Views]: Views[Index] & { readonly label: string };
};

/**
 * Shared settings plus an ordered collection of camera views.
 *
 * @public
 */
export type RenderImagesOptions<Views extends readonly RenderImageView[] = readonly RenderImageView[]> =
  RenderImageSharedOptions &
    (
      | { readonly includeLabel: true; readonly views: LabeledViews<Views> }
      | { readonly includeLabel?: false; readonly views: Views }
    );

/**
 * One identified rendered file.
 *
 * @public
 */
export type RenderedImage<Id extends string = string> = {
  readonly id: Id;
  readonly file: ExportFile;
};

/**
 * Result tuple whose IDs and order follow the input view tuple.
 *
 * @public
 */
export type RenderedImages<Views extends readonly RenderImageView[]> = {
  readonly [Index in keyof Views]: Views[Index] extends RenderImageView<infer Id> ? RenderedImage<Id> : never;
};

type NoExtraKeys<Value, Shape> = Value & Record<Exclude<keyof Value, keyof Shape>, never>;

type StrictViews<Views extends readonly RenderImageView[]> = Views['length'] extends 0
  ? never
  : {
      readonly [Index in keyof Views]: Views[Index] extends RenderImageView
        ? NoExtraKeys<Views[Index], RenderImageView>
        : never;
    };

/**
 * Internal exact form used by the façade.
 *
 * @internal
 */
// oxlint-disable-next-line tau-lint/require-public-export-jsdoc -- internal exact-key constraint
export type StrictRenderImagesOptions<Options extends RenderImagesOptions> = NoExtraKeys<
  Options,
  RenderImagesOptions
> & {
  readonly views: StrictViews<Options['views']>;
};

/**
 * Preserve literal singular option values while rejecting misspelled keys.
 *
 * @public
 * @param options - Singular image settings
 * @returns The same settings with literal types preserved
 */
export const createRenderImageOptions = <const Options extends RenderImageOptions>(
  options: NoExtraKeys<Options, RenderImageOptions>,
): Options => options;

/**
 * Preserve literal view IDs and order while rejecting misplaced or misspelled keys.
 *
 * @public
 * @param options - Shared settings and ordered views
 * @returns The same settings with literal view IDs and order preserved
 */
export const createRenderImagesOptions = <const Options extends RenderImagesOptions>(
  options: StrictRenderImagesOptions<Options>,
): Options => options;

const singularKeys = new Set([
  'format',
  'width',
  'height',
  'quality',
  'phi',
  'theta',
  'margin',
  'up',
  'projection',
  'background',
  'label',
  'includeAxes',
  'includeLabel',
  'includeScale',
]);

const pluralKeys = new Set([
  'format',
  'width',
  'height',
  'quality',
  'margin',
  'up',
  'projection',
  'background',
  'includeAxes',
  'includeLabel',
  'includeScale',
  'views',
]);

const viewKeys = new Set(['id', 'label', 'phi', 'theta']);
const viewIdPattern = /^[\dA-Za-z][\w-]{0,63}$/;
const viewIdDescription = '[A-Za-z0-9][A-Za-z0-9_-]{0,63}';
const annotatedMinDimension = 192;
const defaultWidth = 768;
const defaultHeight = 432;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isUnknownArray = (value: unknown): value is unknown[] => Array.isArray(value);

const assertKnownKeys = (value: Record<string, unknown>, allowed: ReadonlySet<string>, name: string): void => {
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown !== undefined) {
    throw new TypeError(`${name} contains unknown property ${JSON.stringify(unknown)}`);
  }
};

type AssertFinite = (value: unknown, name: string) => asserts value is number;

const assertFinite: AssertFinite = (value, name) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number`);
  }
};

const assertOptionalFinite = (value: unknown, name: string): void => {
  if (value !== undefined) {
    assertFinite(value, name);
  }
};

const assertOptionalBoolean = (value: unknown, name: string): void => {
  if (value !== undefined && typeof value !== 'boolean') {
    throw new TypeError(`${name} must be a boolean`);
  }
};

type AssertLabel = (value: unknown, name: string) => asserts value is string;

const assertLabel: AssertLabel = (value, name) => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  const characters = [...value];
  if (characters.length > 64) {
    throw new TypeError(`${name} must contain at most 64 characters`);
  }
  const unsupported = characters.find((character) => {
    const printableAscii = character >= ' ' && character <= '~';
    return !printableAscii && !['µ', '—', '−'].includes(character);
  });
  if (unsupported !== undefined) {
    throw new TypeError(`${name} contains unsupported character ${JSON.stringify(unsupported)}`);
  }
};

const assertRange = (value: unknown, name: string, bounds: readonly [minimum: number, maximum: number]): void => {
  const [minimum, maximum] = bounds;
  assertFinite(value, name);
  if (value < minimum || value > maximum) {
    throw new TypeError(`${name} must be between ${minimum} and ${maximum}`);
  }
};

const parseHexColor = (value: string): readonly [number, number, number, number] => {
  if (!/^#[\dA-Fa-f]{6}(?:[\dA-Fa-f]{2})?$/.test(value)) {
    throw new TypeError('background must be #RRGGBB or #RRGGBBAA');
  }
  const hex = value.slice(1);
  return [
    Number.parseInt(hex.slice(0, 2), 16) / 255,
    Number.parseInt(hex.slice(2, 4), 16) / 255,
    Number.parseInt(hex.slice(4, 6), 16) / 255,
    hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1,
  ];
};

const validateAnnotatedDimensions = (options: Omit<RenderImageOptions, 'phi' | 'theta'>): void => {
  if (![options.includeAxes, options.includeLabel, options.includeScale].includes(true)) {
    return;
  }
  if (
    (options.width ?? defaultWidth) < annotatedMinDimension ||
    (options.height ?? defaultHeight) < annotatedMinDimension
  ) {
    throw new TypeError(`annotated images must be at least ${annotatedMinDimension}x${annotatedMinDimension}`);
  }
};

const validateBackground = (background: unknown): void => {
  if (typeof background === 'string') {
    parseHexColor(background);
    return;
  }
  if (
    background !== undefined &&
    (!isUnknownArray(background) ||
      background.length !== 4 ||
      background.some(
        (channel) => typeof channel !== 'number' || !Number.isFinite(channel) || channel < 0 || channel > 1,
      ))
  ) {
    throw new TypeError('background must contain four channels between 0 and 1');
  }
};

const validateCommon = (options: Omit<RenderImageOptions, 'phi' | 'theta'>): void => {
  if (!['png', 'webp', 'jpeg', 'jpg'].includes(options.format)) {
    throw new TypeError('format must be png, webp, jpeg, or jpg');
  }
  if (options.width !== undefined) {
    assertRange(options.width, 'width', [16, 4096]);
  }
  if (options.height !== undefined) {
    assertRange(options.height, 'height', [16, 4096]);
  }
  if (options.quality !== undefined) {
    assertRange(options.quality, 'quality', [0, 1]);
  }
  if (options.margin !== undefined) {
    assertRange(options.margin, 'margin', [0, 0.5]);
  }
  if (options.up !== undefined && !['x', 'y', 'z'].includes(options.up)) {
    throw new TypeError('up must be x, y, or z');
  }
  if (options.projection !== undefined && !['perspective', 'orthographic'].includes(options.projection)) {
    throw new TypeError('projection must be perspective or orthographic');
  }
  assertOptionalBoolean(options.includeAxes, 'includeAxes');
  assertOptionalBoolean(options.includeLabel, 'includeLabel');
  assertOptionalBoolean(options.includeScale, 'includeScale');
  validateAnnotatedDimensions(options);
  validateBackground(options.background);
};

const normalizedBackground = (
  background: RenderImageOptions['background'],
): readonly [number, number, number, number] | undefined =>
  typeof background === 'string' ? parseHexColor(background) : background;

/**
 * Validate and serialize one request for render-core.
 *
 * @internal
 * @param options - Singular render options
 * @returns The validated JSON request
 */
// oxlint-disable-next-line tau-lint/require-public-export-jsdoc -- binding implementation detail
export const toImageRequestJson = (options: RenderImageOptions): string => {
  const input: unknown = options;
  if (!isRecord(input)) {
    throw new TypeError('options must be an object');
  }
  assertKnownKeys(input, singularKeys, 'options');
  validateCommon(options);
  if (options.label !== undefined) {
    assertLabel(options.label, 'label');
  }
  if (input['includeLabel'] === true && input['label'] === undefined) {
    throw new TypeError('label is required when includeLabel is true');
  }
  assertOptionalFinite(options.phi, 'phi');
  assertOptionalFinite(options.theta, 'theta');
  return JSON.stringify({
    format: options.format,
    width: options.width,
    height: options.height,
    quality: options.quality,
    phi: options.phi,
    theta: options.theta,
    margin: options.margin,
    up: options.up,
    projection: options.projection,
    background: normalizedBackground(options.background),
    label: options.label,
    includeAxes: options.includeAxes,
    includeLabel: options.includeLabel,
    includeScale: options.includeScale,
  });
};

/**
 * Validate and serialize one ordered multi-image request for render-core.
 *
 * @internal
 * @param options - Shared render options and ordered views
 * @returns The validated JSON request
 */
// oxlint-disable-next-line tau-lint/require-public-export-jsdoc -- binding implementation detail
export const toImagesRequestJson = (options: RenderImagesOptions): string => {
  const input: unknown = options;
  if (!isRecord(input)) {
    throw new TypeError('options must be an object');
  }
  assertKnownKeys(input, pluralKeys, 'options');
  validateCommon(options);
  const { views } = input;
  if (!isUnknownArray(views) || views.length === 0) {
    throw new TypeError('views must contain at least one view');
  }
  const ids = new Set<string>();
  const normalizedViews: RenderImageView[] = [];
  for (const [index, view] of views.entries()) {
    if (!isRecord(view)) {
      throw new TypeError(`views[${index}] must be an object`);
    }
    assertKnownKeys(view, viewKeys, `views[${index}]`);
    const { id, label, phi, theta } = view;
    if (typeof id !== 'string' || !viewIdPattern.test(id)) {
      throw new TypeError(`views[${index}].id must match ${viewIdDescription}`);
    }
    if (ids.has(id)) {
      throw new TypeError(`views contains duplicate id ${JSON.stringify(id)}`);
    }
    ids.add(id);
    assertFinite(phi, `views[${index}].phi`);
    assertFinite(theta, `views[${index}].theta`);
    if (label !== undefined) {
      assertLabel(label, `views[${index}].label`);
    }
    if (options.includeLabel && label === undefined) {
      throw new TypeError(`views[${index}].label is required when includeLabel is true`);
    }
    normalizedViews.push({ id, label, phi, theta });
  }
  return JSON.stringify({
    format: options.format,
    width: options.width,
    height: options.height,
    quality: options.quality,
    margin: options.margin,
    up: options.up,
    projection: options.projection,
    background: normalizedBackground(options.background),
    includeAxes: options.includeAxes,
    includeLabel: options.includeLabel,
    includeScale: options.includeScale,
    views: normalizedViews,
  });
};

/**
 * Derive the singular output filename.
 *
 * @internal
 * @param format - Encoded image format
 * @returns The singular thumbnail filename
 */
// oxlint-disable-next-line tau-lint/require-public-export-jsdoc -- façade implementation detail
export const imageFileName = (format: RenderImageFormat): string => `thumbnail.${format}`;

/**
 * Derive an identified-view output filename.
 *
 * @internal
 * @param id - Validated view identifier
 * @param format - Encoded image format
 * @returns The identified thumbnail filename
 */
// oxlint-disable-next-line tau-lint/require-public-export-jsdoc -- façade implementation detail
export const imageViewFileName = (id: string, format: RenderImageFormat): string => `thumbnail-${id}.${format}`;
