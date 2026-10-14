/** Select the native Node driver without changing pnpm/Nx orchestration's PATH. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { accessSync, constants, readFileSync, realpathSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

/**
 * Resolve the native executable without changing the orchestration environment.
 *
 * @internal
 * @type {(environment?: NodeJS.ProcessEnv) => string}
 * @param [environment] - Caller environment; no mutation.
 * @returns Selected native executable.
 */
export const nativeNode = (environment = process.env) => {
  const selected = environment['GEOSPEC_NATIVE_NODE'];
  if (selected === undefined) {
    return process.execPath;
  }
  assert.ok(
    isAbsolute(selected) && statSync(selected).isFile(),
    'GEOSPEC_NATIVE_NODE must name an absolute executable file',
  );
  accessSync(selected, constants.X_OK);
  return realpathSync(selected);
};

/**
 * Invoke the installed NAPI CLI with the selected native executable.
 *
 * @internal
 * @type {(args: string[], manifest?: string) => {executable: string, args: string[]}}
 * @param args - NAPI arguments.
 * @param [manifest] - Resolved NAPI package manifest.
 * @returns Exact driver command.
 */
export const napiCommand = (args, manifest = createRequire(import.meta.url).resolve('@napi-rs/cli/package.json')) => {
  const metadata = /** @type {{bin: {napi: string}}} */ (JSON.parse(readFileSync(manifest, 'utf8')));
  return { executable: nativeNode(), args: [resolve(dirname(manifest), metadata.bin.napi), ...args] };
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.equal(process.argv[2], '--napi', 'Expected --napi followed by NAPI arguments');
  const command = napiCommand(process.argv.slice(3));
  const result = spawnSync(command.executable, command.args, { stdio: 'inherit', env: process.env });
  if (result.error) {
    throw result.error;
  }
  process.exitCode = result.status ?? 1;
}
