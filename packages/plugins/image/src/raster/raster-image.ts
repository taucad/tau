/** The RGBA pivot every raster decoder produces and every encoder consumes. */

/**
 * Eight-bit RGBA pixels, rows top to bottom, not premultiplied. Structurally an `ImageData`.
 * @public
 */
export type RasterImage = {
  readonly data: Uint8ClampedArray<ArrayBuffer>;
  readonly width: number;
  readonly height: number;
};

/**
 * The three fields of `ImageData` that the codec glue constructs and reads, for a host without `ImageData` (Node).
 */
class RasterImageData implements RasterImage {
  // oxlint-disable-next-line @typescript-eslint/parameter-properties -- erasableSyntaxOnly forbids parameter properties.
  public readonly data: Uint8ClampedArray<ArrayBuffer>;
  // oxlint-disable-next-line @typescript-eslint/parameter-properties -- erasableSyntaxOnly forbids parameter properties.
  public readonly width: number;
  // oxlint-disable-next-line @typescript-eslint/parameter-properties -- erasableSyntaxOnly forbids parameter properties.
  public readonly height: number;

  public constructor(data: Uint8ClampedArray<ArrayBuffer>, width: number, height: number) {
    this.data = data;
    this.width = width;
    this.height = height;
  }
}

/**
 * Define `ImageData` where the host has none, so codec glue that constructs one works in every host. A host's own
 * `ImageData` is left in place.
 */
export const ensureImageData = (): void => {
  if (!('ImageData' in globalThis)) {
    Reflect.set(globalThis, 'ImageData', RasterImageData);
  }
};
