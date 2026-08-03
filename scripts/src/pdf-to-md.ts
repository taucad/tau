import { execFile } from 'node:child_process';
import { openSync, closeSync, constants, fstatSync, readSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { runReferenceCli } from '#reference-to-md.js';

const execFileAsync = promisify(execFile);
const maximumPdfBytes = 100 * 1024 * 1024;
const maximumOutputBytes = 20 * 1024 * 1024;
const extractorEnvironment = Object.fromEntries([
  ['LANG', 'C.UTF-8'],
  ['LC_ALL', 'C.UTF-8'],
  ['NODE_NO_WARNINGS', '1'],
]);

export const validatePdfArtifact = async (path: string): Promise<void> => {
  const descriptor = openSync(path, constants.O_RDONLY);
  try {
    const { size } = fstatSync(descriptor);
    if (size > maximumPdfBytes) {
      throw new Error(`PDF exceeds ${maximumPdfBytes} bytes`);
    }
    const header = Buffer.alloc(5);
    if (readSync(descriptor, header, 0, header.length, 0) !== header.length || header.toString('latin1') !== '%PDF-') {
      throw new Error('cached artifact is not a PDF');
    }
  } finally {
    closeSync(descriptor);
  }
};

const requirePermissionFlags = (): void => {
  for (const flag of ['--permission', '--allow-addons', '--allow-fs-read']) {
    if (!process.allowedNodeEnvironmentFlags.has(flag)) {
      throw new Error(`Node.js runtime does not support required containment flag ${flag}`);
    }
  }
};

export const convertPdfArtifact = async (path: string): Promise<{ markdown: string; detail: string }> => {
  requirePermissionFlags();
  const repoRoot = resolve(import.meta.dirname, '../..');
  const extractor = resolve(import.meta.dirname, 'pdf-to-md.extract.ts');
  const args = [
    '--max-old-space-size=512',
    '--permission',
    '--allow-addons',
    `--allow-fs-read=${extractor}`,
    `--allow-fs-read=${path}`,
    `--allow-fs-read=${resolve(repoRoot, 'node_modules')}`,
    `--allow-fs-read=${resolve(repoRoot, 'scripts/node_modules')}`,
    `--allow-fs-read=${resolve(repoRoot, 'scripts/package.json')}`,
    extractor,
    path,
  ];
  const { stdout } = await execFileAsync(process.execPath, args, {
    encoding: 'utf8',
    env: extractorEnvironment,
    maxBuffer: maximumOutputBytes,
    timeout: 30_000,
  });

  const result = JSON.parse(stdout) as { text?: unknown; pages?: unknown };
  if (typeof result.text !== 'string' || result.text.trim() === '') {
    throw new Error('PDF extractor returned invalid text');
  }
  if (result.pages !== undefined && typeof result.pages !== 'number') {
    throw new Error('PDF extractor returned an invalid page count');
  }
  const pages = result.pages === undefined ? 'unknown page count' : `${result.pages} pages`;
  return { markdown: result.text, detail: `PDF text extraction (${pages})` };
};

const main = async (): Promise<void> => {
  await runReferenceCli({
    format: 'pdf',
    target: 'pdf-to-md',
    validateArtifacts: async (paths) => validatePdfArtifact(paths.artifact),
    convertArtifacts: async (paths) => convertPdfArtifact(paths.artifact),
  });
};

const isDirectRun = (): boolean =>
  process.argv[1] ? fileURLToPath(import.meta.url) === resolve(process.argv[1]) : false;

if (isDirectRun()) {
  try {
    await main();
  } catch (error) {
    console.error(`pdf-to-md failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
