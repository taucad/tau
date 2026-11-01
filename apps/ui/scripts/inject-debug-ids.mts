/**
 * Add Sentry debug ids to the JavaScript the UI build compiled, and to nothing else.
 *
 * `sentry-cli sourcemaps inject` appends a debug-ID snippet to every JavaScript file under the path it is given.
 * A file the build copied verbatim (the PicoGK browser host, the C# language server, any runtime added later)
 * is checked against its own manifest in the browser, so one appended byte makes its loader refuse it. Those
 * files have no source map, and a debug id without a source map cannot symbolicate anything, so the rule is
 * generic: inject only where the build wrote a source map. `verify-shipped-assets.mts` then proves every
 * verbatim file is unchanged.
 *
 * Usage: node apps/ui/scripts/inject-debug-ids.mts <client-dir>
 * Exit codes: the CLI's own, or 2 for usage.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const scriptExtensions = new Set(['.js', '.mjs', '.cjs']);

/**
 * The scripts under a built client directory that have no sibling source map.
 * @param client - The built client directory, such as `apps/ui/build/client`.
 * @returns Their paths relative to `client`, with forward slashes, sorted.
 */
export const unmappedScripts = async (client: string): Promise<string[]> => {
  const entries = await readdir(client, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && scriptExtensions.has(path.extname(entry.name)))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .filter((file) => !existsSync(`${file}.map`))
    .map((file) => path.relative(client, file).split(path.sep).join('/'))
    .toSorted();
};

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const [client, ...extra] = process.argv.slice(2);
  if (!client || extra.length > 0) {
    console.error('Usage: node apps/ui/scripts/inject-debug-ids.mts <client-dir>');
    process.exit(2);
  }
  const skipped = await unmappedScripts(client);
  console.log(`Leaving ${String(skipped.length)} script(s) without a source map unchanged.`);
  const cli = path.resolve(import.meta.dirname, '../../../scripts/node_modules/.bin/sentry-cli');
  const result = spawnSync(cli, ['sourcemaps', 'inject', ...skipped.flatMap((file) => ['--ignore', file]), client], {
    stdio: 'inherit',
  });
  if (result.error) {
    throw result.error;
  }
  process.exit(result.status ?? 1);
}
