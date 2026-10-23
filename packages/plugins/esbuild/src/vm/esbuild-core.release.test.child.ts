/* Run by `esbuild-core.release.test.ts` under `--permission` and `--expose-gc`: the permission model refuses esbuild's
 * service process, so `initializeEsbuild` selects esbuild-wasm's in-thread browser service, the one the browser worker
 * runs. One scenario per process: `service-death` breaks that service for good. A module, not `--eval`: `--eval`
 * exposes Node's built-in modules as globals, which esbuild-wasm's in-thread glue would then write its protocol through.
 *
 * argv: `release` or `service-death`. Prints one JSON line. */
import { EsbuildBundler } from '#vm/esbuild-core.js';
import type { VmFileSystem } from '#vm/types.js';

const [scenario = 'release'] = process.argv.slice(2);
const { gc } = globalThis as { gc?: () => void };
if (gc === undefined) {
  throw new Error('Run with --expose-gc');
}

const files = new Map<string, string>();
const encoder = new TextEncoder();
async function readFile(path: string, encoding: 'utf8'): Promise<string>;
async function readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
async function readFile(path: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
  const value = files.get(path);
  if (value === undefined) {
    throw new Error(`ENOENT: ${path}`);
  }
  return encoding === 'utf8' ? value : encoder.encode(value);
}
const filesystem: VmFileSystem = {
  exists: async (path) => files.has(path),
  readFile,
  writeFile: async (path, content) => {
    files.set(path, content);
  },
  ensureDir: async () => undefined,
};

/**
 * Write a fresh half-megabyte entry, so every edit's output is distinct.
 * @param edit - The edit's ordinal.
 */
const writeEdit = (edit: number): void => {
  files.set('main.ts', `export const payload = ${JSON.stringify(`${edit}:`.repeat(128 * 1024))};\n`);
};

const bundler = new EsbuildBundler({ filesystem, builtinModules: new Map(), sourceMaps: true });
await bundler.initialize();

/**
 * Detect and bundle `edits` fresh sources, as one source edit does, and measure the heap they leave behind.
 * @param edits - Edits to run after a warm-up.
 * @returns Heap bytes retained across the measured edits, after forced collections.
 */
const measureRetention = async (edits: number): Promise<{ edits: number; retainedBytes: number }> => {
  const edit = async (index: number): Promise<void> => {
    writeEdit(index);
    await bundler.detectImports('main.ts');
    const { success, issues } = await bundler.bundle('main.ts');
    if (!success) {
      throw new Error(`bundle failed: ${JSON.stringify(issues)}`);
    }
  };
  const settledHeap = (): number => {
    gc();
    gc();
    return process.memoryUsage().heapUsed;
  };
  for (let index = 0; index < 3; index += 1) {
    // oxlint-disable-next-line no-await-in-loop -- one edit at a time, as the editor issues them
    await edit(index);
  }
  const before = settledHeap();
  for (let index = 3; index < 3 + edits; index += 1) {
    // oxlint-disable-next-line no-await-in-loop -- one edit at a time, as the editor issues them
    await edit(index);
  }
  return { edits, retainedBytes: settledHeap() - before };
};

/**
 * Break the in-thread service while a bundle is pending, then bundle and detect again.
 * @returns How each call settled.
 */
const killService = async (): Promise<{ pending: unknown; later: unknown; detect: string }> => {
  writeEdit(0);
  const { performance: realPerformance } = globalThis;
  Object.defineProperty(globalThis, 'performance', {
    configurable: true,
    value: {
      now: () => {
        throw new Error('service died');
      },
    },
  });
  const outcome = async (): Promise<unknown> => {
    const { success, issues } = await bundler.bundle('main.ts');
    return { success, messages: issues.map((issue) => issue.message) };
  };
  const pending = await outcome();
  const later = await outcome();
  let detect = 'fulfilled';
  try {
    await bundler.detectImports('main.ts');
  } catch (error) {
    detect = `rejected: ${error instanceof Error ? error.message : String(error)}`;
  }
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: realPerformance });
  return { pending, later, detect };
};

const result = scenario === 'service-death' ? await killService() : await measureRetention(20);
process.stdout.write(`${JSON.stringify(result)}\n`);
