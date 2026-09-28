import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
// eslint-disable-next-line no-restricted-imports -- The WASM runner shares the adjacent frozen-corpus executor.
import { runEarlyCorpus } from '../node/run-conformance.mjs';

/** @typedef {{ ingestMesh: (request: Uint8Array, mesh: Uint8Array) => Uint8Array, processRequest: (request: Uint8Array) => Uint8Array, canonicalPlan: (request: Uint8Array) => Uint8Array, evaluatePlan: (plan: Uint8Array) => Uint8Array }} BindingEngine */
/** @typedef {{ Engine: new () => BindingEngine, canonicalize: (input: Uint8Array) => Uint8Array, initialize: (input: URL) => Promise<void> }} WasmBinding */

/** @type {() => Map<string, string>} */
const parseArguments = () => {
  const argumentsByName = /** @type {Map<string, string>} */ (new Map());
  for (let index = 2; index < process.argv.length; index += 2) {
    const name = process.argv[index];
    const value = process.argv[index + 1];
    argumentsByName.set(name, value);
  }
  return argumentsByName;
};

/** @type {(options: { modulePath?: string, binaryPath?: string, output?: string, host?: string, recordIds?: string[] }) => ReturnType<typeof runEarlyCorpus>} */
export const runWasmCorpus = async ({
  modulePath = fileURLToPath(new URL('../../dist/wasm.mjs', import.meta.url)),
  binaryPath,
  output,
  recordIds,
  host = 'wasm-node',
} = {}) => {
  if (binaryPath === undefined) {
    const manifest = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
    const mixedBindingImport = manifest.imports?.['#mixed-wasm-binding'];
    const mixedBinding = typeof mixedBindingImport === 'string' ? mixedBindingImport : mixedBindingImport?.default;
    if (typeof mixedBinding !== 'string') {
      throw new Error('Package has no mixed WASM binding import.');
    }
    binaryPath = fileURLToPath(
      new URL('geospec_engine_native.wasm', new URL(mixedBinding, new URL('../../package.json', import.meta.url))),
    );
  }
  const binding = /** @type {WasmBinding} */ (await import(pathToFileURL(modulePath).href));
  if (typeof binding.initialize !== 'function') {
    throw new Error('Current WASM facade has no mixed-module initializer.');
  }
  await binding.initialize(pathToFileURL(binaryPath));
  return runEarlyCorpus({ binding, host, artifacts: [modulePath, binaryPath], output, recordIds });
};

if (import.meta.main) {
  const argumentsByName = parseArguments();
  const modulePath = argumentsByName.get('--module');
  const binaryPath = argumentsByName.get('--binary');
  const report = await runWasmCorpus({
    modulePath: modulePath === undefined ? undefined : resolve(modulePath),
    binaryPath: binaryPath === undefined ? undefined : resolve(binaryPath),
    output: argumentsByName.get('--output'),
    recordIds: argumentsByName.get('--ids')?.split(','),
  });
  process.stdout.write(`${JSON.stringify({ passed: report.passed, failed: report.failed })}\n`);
  if (report.failed > 0) {
    process.exitCode = 1;
  }
}
