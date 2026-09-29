import { readFile, realpath, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';

const maxImageBytes = 20 * 1024 * 1024;
const imageExtension = /\.(?:png|jpe?g|webp)$/i;

/** Read one Codex-generated image after resolving symlinks within its owned directory. */
export async function readGeneratedImage(
  path: unknown,
  home: string,
): Promise<{
  readonly path: string;
  readonly bytes: Uint8Array<ArrayBuffer>;
}> {
  if (typeof path !== 'string' || !isAbsolute(path) || !imageExtension.test(path)) {
    throw new Error('Invalid generated image path.');
  }
  const root = await realpath(join(home, '.codex/generated_images'));
  const file = await realpath(path);
  const inside = relative(root, file);
  if (
    inside === '' ||
    inside === '..' ||
    inside.startsWith(`..${sep}`) ||
    isAbsolute(inside) ||
    !imageExtension.test(file)
  ) {
    throw new Error('Generated image is outside the permitted directory.');
  }
  const metadata = await stat(file);
  if (!metadata.isFile() || metadata.size === 0 || metadata.size > maxImageBytes) {
    throw new Error('Generated image is missing or exceeds the size limit.');
  }
  const bytes = Uint8Array.from(await readFile(file));
  if (bytes.byteLength > maxImageBytes) {
    throw new Error('Generated image exceeds the size limit.');
  }
  const parent = dirname(inside);
  return { path: parent === '.' ? basename(file) : `${basename(parent)}/${basename(file)}`, bytes };
}
