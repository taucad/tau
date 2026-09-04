/* eslint-disable @typescript-eslint/naming-convention -- test constants use SCREAMING_SNAKE_CASE */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resizeImageForChat } from '#utils/resize-image.js';

const SMALL_JPEG_DATA_URL = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
const SMALL_PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';

let mockImageWidth = 800;
let mockImageHeight = 600;
let mockImageShouldError = false;
let mockCanvasDataUrl = SMALL_JPEG_DATA_URL;
let mockToDataUrlFunction: (() => string) | undefined;
let canvasDrawImage: ReturnType<typeof vi.fn>;
let canvasWidths: number[];
let canvasHeights: number[];

class FakeImage {
  public naturalWidth = 0;
  public naturalHeight = 0;
  private readonly listeners: Record<string, Array<() => void>> = {};

  public addEventListener(event: string, handler: () => void) {
    this.listeners[event] ??= [];
    this.listeners[event].push(handler);
  }

  public get src(): string {
    return '';
  }

  public set src(_value: string) {
    setTimeout(() => {
      if (mockImageShouldError) {
        for (const handler of this.listeners['error'] ?? []) {
          handler();
        }
        return;
      }
      this.naturalWidth = mockImageWidth;
      this.naturalHeight = mockImageHeight;
      for (const handler of this.listeners['load'] ?? []) {
        handler();
      }
    }, 0);
  }
}

beforeEach(() => {
  mockImageWidth = 800;
  mockImageHeight = 600;
  mockImageShouldError = false;
  mockCanvasDataUrl = SMALL_JPEG_DATA_URL;
  mockToDataUrlFunction = undefined;
  canvasDrawImage = vi.fn();
  canvasWidths = [];
  canvasHeights = [];

  vi.stubGlobal('Image', FakeImage);

  const createElementMock = (tag: string): HTMLElement => {
    if (tag === 'canvas') {
      const canvas = {
        _w: 0,
        _h: 0,
        get width(): number {
          return canvas._w;
        },
        set width(v: number) {
          canvas._w = v;
          canvasWidths.push(v);
        },
        get height(): number {
          return canvas._h;
        },
        set height(v: number) {
          canvas._h = v;
          canvasHeights.push(v);
        },
        getContext: () => ({ drawImage: canvasDrawImage }),
        toDataURL: mockToDataUrlFunction ?? (() => mockCanvasDataUrl),
      };
      return canvas as unknown as HTMLCanvasElement;
    }
    return document.createElementNS('http://www.w3.org/1999/xhtml', tag);
  };
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- electron's WebviewTag overload is the one mockImplementation captures; the mock only ever builds HTML elements.
  vi.spyOn(document, 'createElement').mockImplementation(createElementMock as typeof document.createElement);
});

describe('resizeImageForChat', () => {
  it('should return original data URL when image is already small enough', async () => {
    const result = await resizeImageForChat(SMALL_JPEG_DATA_URL);
    expect(result).toBe(SMALL_JPEG_DATA_URL);
  });

  it('should downscale images exceeding 1568px on longest side', async () => {
    mockImageWidth = 3000;
    mockImageHeight = 2000;

    const result = await resizeImageForChat(SMALL_PNG_DATA_URL);

    expect(result).toBe(mockCanvasDataUrl);
    expect(canvasDrawImage).toHaveBeenCalled();
  });

  it('should preserve aspect ratio during resize', async () => {
    mockImageWidth = 3136;
    mockImageHeight = 1568;

    await resizeImageForChat(SMALL_PNG_DATA_URL);

    // 3136x1568 scaled by 1568/3136 = 0.5 → 1568x784
    expect(canvasWidths[0]).toBe(1568);
    expect(canvasHeights[0]).toBe(784);
  });

  it('should try JPEG quality ladder until under size limit', async () => {
    mockImageWidth = 2000;
    mockImageHeight = 2000;

    const bigDataUrl = 'data:image/jpeg;base64,' + 'A'.repeat(2_000_000);
    let callCount = 0;
    mockToDataUrlFunction = () => {
      callCount++;
      return callCount < 4 ? bigDataUrl : SMALL_JPEG_DATA_URL;
    };

    const result = await resizeImageForChat(SMALL_PNG_DATA_URL);
    expect(result).toBe(SMALL_JPEG_DATA_URL);
    expect(callCount).toBe(4);
  });

  it('should apply last-resort downscale for extremely large images', async () => {
    mockImageWidth = 4000;
    mockImageHeight = 4000;

    const bigDataUrl = 'data:image/jpeg;base64,' + 'A'.repeat(2_000_000);
    let toDataUrlCalls = 0;
    mockToDataUrlFunction = () => {
      toDataUrlCalls++;
      return toDataUrlCalls <= 4 ? bigDataUrl : SMALL_JPEG_DATA_URL;
    };

    const result = await resizeImageForChat(SMALL_PNG_DATA_URL);
    expect(result).toBe(SMALL_JPEG_DATA_URL);
    // Last canvas width set should be 800 (last-resort)
    expect(canvasWidths.at(-1)).toBe(800);
  });

  it('should reject non-image data URLs', async () => {
    await expect(resizeImageForChat('data:text/plain;base64,SGVsbG8=')).rejects.toThrow('Invalid image data URL');
  });

  it('should reject on image load error', async () => {
    mockImageShouldError = true;

    await expect(resizeImageForChat('data:image/png;base64,INVALID')).rejects.toThrow('Failed to load image');
  });
});
