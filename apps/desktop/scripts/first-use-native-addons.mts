/**
 * Preload the release's signed Sharp addon when running the checkout CLI in notarized Electron.
 * The JavaScript stays from the checkout; only an exact-version native addon is resolved inside
 * the app whose signature the qualification script verifies. No signing or security bypass occurs.
 * Usage: ELECTRON_RUN_AS_NODE=1 <Tau binary> --import <this file> <CLI> ...
 */
import { readdirSync, realpathSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { basename, dirname, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const unpacked = join(dirname(dirname(realpathSync(process.execPath))), 'Resources', 'app.asar.unpacked');
const signedAddons = new Map<string, string>();

registerHooks({
  resolve(specifier, context, nextResolve) {
    const resolved = nextResolve(specifier, context);
    if (
      !resolved.url.startsWith('file:') ||
      !/\/@img\/sharp-darwin-(?:arm64|x64)\/lib\/sharp-darwin-(?:arm64|x64)-[\d.]+\.node$/u.test(
        fileURLToPath(resolved.url),
      )
    ) {
      return resolved;
    }
    const name = basename(fileURLToPath(resolved.url));
    let signed = signedAddons.get(name);
    if (!signed) {
      const matches = readdirSync(unpacked, { recursive: true, encoding: 'utf8' }).filter(
        (path) => basename(path) === name,
      );
      if (matches.length !== 1) {
        throw new Error(`Expected one release-signed ${name} in ${unpacked}; found ${matches.length}`);
      }
      signed = realpathSync(join(unpacked, matches[0]!));
      const within = relative(realpathSync(unpacked), signed);
      if (within === '..' || within.startsWith(`..${sep}`)) {
        throw new Error(`Release addon escapes the signed app: ${signed}`);
      }
      signedAddons.set(name, signed);
    }
    return { url: pathToFileURL(signed).href, format: 'addon', shortCircuit: true };
  },
});
