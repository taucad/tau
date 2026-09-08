import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
// eslint-disable-next-line no-restricted-imports -- The WASM runner shares the adjacent frozen-corpus executor.
import { runEarlyCorpus } from '../node/run-conformance.mjs';

/** @typedef {{ ingestMesh: (request: Uint8Array, mesh: Uint8Array) => Uint8Array, processRequest: (request: Uint8Array) => Uint8Array, canonicalPlan: (request: Uint8Array) => Uint8Array, evaluatePlan: (plan: Uint8Array) => Uint8Array }} BindingEngine */
/** @typedef {{ Engine: new () => BindingEngine, canonicalize: (input: Uint8Array) => Uint8Array, initialize?: (input: Uint8Array) => Promise<void>, default?: (input: { module_or_path: Uint8Array }) => Promise<unknown> }} WasmBinding */

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

/** @type {(options: { modulePath: string, binaryPath: string, output?: string, host?: string }) => ReturnType<typeof runEarlyCorpus>} */
export const runWasmCorpus = async ({ modulePath, binaryPath, output, host = 'wasm-node' }) => {
  const binding = /** @type {WasmBinding} */ (await import(pathToFileURL(modulePath).href));
  const binary = await readFile(binaryPath);
  if (typeof binding.initialize === 'function') {
    await binding.initialize(binary);
  } else if (typeof binding.default === 'function') {
    await binding.default({ module_or_path: binary });
  } else {
    throw new Error('WASM host module has no initializer.');
  }
  return runEarlyCorpus({ binding, host, artifacts: [modulePath, binaryPath], output });
};

if (import.meta.main) {
  const argumentsByName = parseArguments();
  const modulePath = resolve(
    argumentsByName.get('--module') ??
      fileURLToPath(new URL('generated/geospec_engine_native_wasm.js', import.meta.url)),
  );
  const binaryPath = resolve(
    argumentsByName.get('--binary') ??
      fileURLToPath(new URL('generated/geospec_engine_native_wasm_bg.wasm', import.meta.url)),
  );
  const report = await runWasmCorpus({
    modulePath,
    binaryPath,
    output: argumentsByName.get('--output'),
  });
  process.stdout.write(`${JSON.stringify({ passed: report.passed, failed: report.failed })}\n`);
  if (report.failed > 0) {
    process.exitCode = 1;
  }
}
