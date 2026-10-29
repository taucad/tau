import { describe, expect, it, vi } from 'vitest';

const svg = vi.hoisted(() => ({
  loaded: vi.fn(),
  png: vi.fn(async () => ({ name: 'drawing.png', mimeType: 'image/png', bytes: new Uint8Array([1]) })),
  webp: vi.fn(async () => ({ name: 'drawing.webp', mimeType: 'image/webp', bytes: new Uint8Array([2]) })),
}));
vi.mock('@taucad/image/svg', () => {
  svg.loaded();
  return { renderSvgPng: svg.png, renderSvgWebp: svg.webp };
});

const { headlessImageBackend } = await import('#services/headless-image-backend.js');

describe('headless image backend entry', () => {
  it('should defer SVG rendering code until an image is requested and preserve format and options', async () => {
    expect(svg.loaded).not.toHaveBeenCalled();
    const content = '<svg xmlns="http://www.w3.org/2000/svg"/>';
    const options = { width: 64, height: 64 };
    await expect(headlessImageBackend.renderSvg?.(content, 'png', options)).resolves.toEqual({
      name: 'drawing.png',
      mimeType: 'image/png',
      bytes: new Uint8Array([1]),
    });
    expect(svg.loaded).toHaveBeenCalledOnce();
    expect(svg.png).toHaveBeenCalledWith(content, options);
    await expect(headlessImageBackend.renderSvg?.(content, 'webp', options)).resolves.toEqual({
      name: 'drawing.webp',
      mimeType: 'image/webp',
      bytes: new Uint8Array([2]),
    });
    expect(svg.webp).toHaveBeenCalledWith(content, options);
  });
});
