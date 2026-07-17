import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RenderImageOptions } from '#options.js';
import { renderManyRaw, renderRaw } from '#renderer.js';
import { RenderError, renderGlbToImage, renderGlbToImages } from '#index.js';

vi.mock('#renderer.js', () => ({
  renderRaw: vi.fn(),
  renderManyRaw: vi.fn(),
}));

const singular = vi.mocked(renderRaw);
const plural = vi.mocked(renderManyRaw);
const glb = new Uint8Array([1, 2, 3]);

beforeEach(() => {
  singular.mockReset();
  plural.mockReset();
});

describe('renderGlbToImage', () => {
  it('should return one owned ExportFile with the requested format', async () => {
    const output = new Uint8Array([0x52, 0x49, 0x46, 0x46]);
    singular.mockResolvedValue(output);

    const file = await renderGlbToImage(glb, { format: 'webp', width: 800 });
    output[0] = 0;

    expect(file).toEqual(expect.objectContaining({ name: 'thumbnail.webp', mimeType: 'image/webp' }));
    expect([...file.bytes]).toEqual([0x52, 0x49, 0x46, 0x46]);
    expect(file.bytes.buffer).not.toBe(output.buffer);
    expect(singular).toHaveBeenCalledWith(glb, JSON.stringify({ format: 'webp', width: 800 }));
  });

  it('should resolve the jpeg mime type for the jpg alias', async () => {
    singular.mockResolvedValue(new Uint8Array([0xff, 0xd8]));

    const file = await renderGlbToImage(glb, { format: 'jpg' });

    expect(file.mimeType).toBe('image/jpeg');
    expect(file.name).toBe('thumbnail.jpg');
  });

  it('should reject invalid options before invoking the renderer', async () => {
    const options: RenderImageOptions & { unexpected: boolean } = {
      format: 'png',
      unexpected: true,
    };

    try {
      await renderGlbToImage(glb, options);
      expect.fail('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(RenderError);
      expect((error as RenderError).code).toBe('parse');
      expect((error as RenderError).message).toBe('parse: options contains unknown property "unexpected"');
    }
    expect(singular).not.toHaveBeenCalled();
  });

  it('should preserve tagged renderer failures', async () => {
    singular.mockRejectedValue(new Error('parse: unexpected glb magic'));

    try {
      await renderGlbToImage(glb, { format: 'png' });
      expect.fail('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(RenderError);
      expect((error as RenderError).code).toBe('parse');
      expect((error as RenderError).message).toBe('parse: unexpected glb magic');
    }
  });
});

describe('renderGlbToImages', () => {
  const options = {
    format: 'png',
    includeAxes: true,
    includeLabel: true,
    includeScale: true,
    views: [
      { id: 'front', label: 'Front', phi: 90, theta: 0 },
      { id: 'top', label: 'Top', phi: 0, theta: 0 },
    ],
  } as const;

  it('should preserve order, IDs, filenames, and owned bytes', async () => {
    const front = new Uint8Array([1, 2]);
    const top = new Uint8Array([3, 4]);
    plural.mockResolvedValue([front, top]);

    const results = await renderGlbToImages(glb, options);
    front[0] = 9;
    top[0] = 9;

    expect(results.map(({ id }) => id)).toEqual(['front', 'top']);
    expect(results.map(({ file }) => file.name)).toEqual(['thumbnail-front.png', 'thumbnail-top.png']);
    expect(results.map(({ file }) => [...file.bytes])).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(results[0].file.bytes.buffer).not.toBe(front.buffer);
    expect(plural).toHaveBeenCalledOnce();
  });

  it('should reject cardinality mismatches atomically', async () => {
    plural.mockResolvedValue([new Uint8Array([1])]);

    try {
      await renderGlbToImages(glb, options);
      expect.fail('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(RenderError);
      expect((error as RenderError).code).toBe('unknown');
      expect((error as RenderError).message).toBe('renderer contract violation: expected 2 images, received 1');
    }
  });

  it('should preserve a view-qualified renderer failure', async () => {
    plural.mockRejectedValue(new Error('gpu: view "top": device lost'));

    try {
      await renderGlbToImages(glb, options);
      expect.fail('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(RenderError);
      expect((error as RenderError).code).toBe('device-lost');
      expect((error as RenderError).message).toBe('gpu: view "top": device lost');
    }
  });
});
