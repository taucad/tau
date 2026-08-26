import { constants, fstatSync, openSync, closeSync, readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { convertWithReferencePandoc } from '#reference-pandoc.js';
import { runReferenceCli } from '#reference-to-md.js';

const maximumLatexBytes = 5 * 1024 * 1024;

const startsWithBytes = (data: Uint8Array<ArrayBuffer>, prefix: readonly number[]): boolean =>
  prefix.every((value, index) => data[index] === value);

const compressedMagic = (data: Uint8Array<ArrayBuffer>): boolean =>
  startsWithBytes(data, [0x50, 0x4b, 0x03, 0x04]) ||
  startsWithBytes(data, [0x1f, 0x8b]) ||
  startsWithBytes(data, [0x42, 0x5a, 0x68]) ||
  startsWithBytes(data, [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00]) ||
  startsWithBytes(data, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]) ||
  new TextDecoder('ascii').decode(data.subarray(257, 262)) === 'ustar';

export const readLatexArtifact = (path: string): string => {
  const descriptor = openSync(path, constants.O_RDONLY);
  try {
    if (fstatSync(descriptor).size > maximumLatexBytes) {
      throw new Error(`LaTeX artifact exceeds ${maximumLatexBytes} bytes`);
    }
  } finally {
    closeSync(descriptor);
  }

  const data = Uint8Array.from(readFileSync(path));
  if (compressedMagic(data)) {
    throw new Error('LaTeX artifact must be a direct text file, not an archive');
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(data);
  } catch {
    throw new Error('LaTeX artifact must be valid UTF-8');
  }
  // oxlint-disable-next-line no-control-regex -- Direct LaTeX accepts tabs/newlines but no binary controls.
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(text)) {
    throw new Error('LaTeX artifact contains forbidden control characters');
  }
  return text;
};

export const validateLatexArtifact = async (path: string): Promise<void> => {
  readLatexArtifact(path);
};

export const convertLatexArtifact = async (path: string): Promise<{ markdown: string; detail: string }> => {
  const latex = readLatexArtifact(path);
  const { markdown } = await convertWithReferencePandoc({ profile: 'latex-to-gfm', input: latex });
  return { markdown, detail: 'sandboxed Pandoc LaTeX conversion' };
};

const main = async (): Promise<void> => {
  await runReferenceCli({
    format: 'latex',
    target: 'text-to-md',
    validateArtifacts: async (paths) => validateLatexArtifact(paths.artifact),
    convertArtifacts: async (paths) => convertLatexArtifact(paths.artifact),
  });
};

const isDirectRun = (): boolean =>
  process.argv[1] ? fileURLToPath(import.meta.url) === resolvePath(process.argv[1]) : false;

if (isDirectRun()) {
  try {
    await main();
  } catch (error) {
    console.error(`text-to-md failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
