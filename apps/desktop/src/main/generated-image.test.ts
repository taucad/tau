import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readGeneratedImage } from '#main/generated-image.js';

const temporary: string[] = [];
afterEach(() => {
  for (const root of temporary.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function fixture(): { home: string; images: string } {
  const home = mkdtempSync(join(tmpdir(), 'tau-generated-image-'));
  temporary.push(home);
  const images = join(home, '.codex/generated_images/run-1');
  mkdirSync(images, { recursive: true });
  return { home, images };
}

describe('readGeneratedImage', () => {
  it('should return bounded image bytes and a stable project-relative name', async () => {
    const { home, images } = fixture();
    const file = join(images, 'render.png');
    writeFileSync(file, new Uint8Array([137, 80, 78, 71]));
    await expect(readGeneratedImage(file, home)).resolves.toEqual({
      path: 'run-1/render.png',
      bytes: new Uint8Array([137, 80, 78, 71]),
    });
  });

  it('should refuse files outside generated images, including symlink escapes', async () => {
    const { home, images } = fixture();
    const outside = join(home, 'private.png');
    writeFileSync(outside, new Uint8Array([1]));
    symlinkSync(outside, join(images, 'link.png'));
    await expect(readGeneratedImage(outside, home)).rejects.toThrow('permitted directory');
    await expect(readGeneratedImage(join(images, 'link.png'), home)).rejects.toThrow('permitted directory');
  });

  it('should refuse unsupported and oversized files', async () => {
    const { home, images } = fixture();
    const unsupported = join(images, 'secret.txt');
    const oversized = join(images, 'huge.webp');
    writeFileSync(unsupported, new Uint8Array([1]));
    writeFileSync(oversized, new Uint8Array(20 * 1024 * 1024 + 1));
    await expect(readGeneratedImage(unsupported, home)).rejects.toThrow('Invalid generated image path');
    await expect(readGeneratedImage(oversized, home)).rejects.toThrow('size limit');
  });
});
