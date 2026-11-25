/**
 * Shared scoping for the first-party plugin surface rules: `no-plugin-default-export`,
 * `no-plugin-default-import`, `require-plugin-package-binding` and `no-kernel-type-assertion`.
 *
 * Each rule runs in the lint target of the project that owns the file, so a plugin enforces its own
 * surface and Nx selects that plugin's lint when its source changes.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A TypeScript implementation source under a first-party plugin package: `packages/plugins/<pkg>/src/**`.
 * The prefix before `packages/` is the workspace root (empty for a workspace-relative filename).
 */
const PLUGIN_SOURCE = /^(?:(.*?)\/)?packages\/plugins\/([^/]+)\/src\/(.+)$/u;

/** `.ts` and `.tsx`, the extensions the plugin surface guard has always scanned. */
const TYPESCRIPT_SOURCE = /\.tsx?$/u;

/** Declaration files describe foreign modules (WASM bindings, untyped dependencies); they are not implementation. */
const DECLARATION_SOURCE = /\.d\.tsx?$/u;

/**
 * Normalize a lint filename to forward slashes.
 *
 * @param {string} filename - `context.filename`.
 * @returns {string} The filename with `/` separators.
 */
export const normalizeFilename = (filename) => filename.replaceAll('\\', '/');

/**
 * Classify a file as a first-party plugin implementation source.
 *
 * @param {string} filename - `context.filename`.
 * @returns {{ workspaceRoot: string; packageName: string; path: string } | undefined} The workspace root, the
 *   package directory name and the path below `src/`, or `undefined` outside `packages/plugins/<pkg>/src` or for a
 *   non-TypeScript or declaration file.
 */
export const pluginSourceOf = (filename) => {
  const match = PLUGIN_SOURCE.exec(normalizeFilename(filename));
  if (match === null) {
    return undefined;
  }
  const path = match[3] ?? '';
  if (!TYPESCRIPT_SOURCE.test(path) || DECLARATION_SOURCE.test(path)) {
    return undefined;
  }
  return { workspaceRoot: match[1] ?? '', packageName: match[2] ?? '', path };
};

/**
 * The package-named binding of a plugin package: its directory name in camelCase (`picogk-browser` →
 * `picogkBrowser`).
 *
 * @param {string} packageName - The package directory name under `packages/plugins`.
 * @returns {string} The binding name.
 */
export const pluginAliasOf = (packageName) =>
  packageName.replaceAll(/-([a-z0-9])/gu, (_match, /** @type {string} */ character) => character.toUpperCase());

/** @type {Map<string, readonly string[]>} */
const pluginPackageNamesByRoot = new Map();

/**
 * The npm names of the workspace's first-party plugin packages: every `packages/plugins/<dir>` with a
 * `package.json` (a removed plugin leaves its untracked `node_modules` behind in existing checkouts; only manifests
 * name packages). Read once per workspace root and lint process.
 *
 * A source file can only import a plugin package it depends on, so the manifest it reads is already in that
 * project's lint inputs through `^production`.
 *
 * @param {string} workspaceRoot - The workspace root, as {@link pluginSourceOf} or a scope match returned it.
 * @returns {readonly string[]} The plugin package names, or none when the root has no `packages/plugins`.
 */
export const pluginPackageNamesOf = (workspaceRoot) => {
  const cached = pluginPackageNamesByRoot.get(workspaceRoot);
  if (cached !== undefined) {
    return cached;
  }
  const pluginsDirectory = join(workspaceRoot === '' ? '.' : workspaceRoot, 'packages', 'plugins');
  /** @type {string[]} */
  const names = [];
  if (existsSync(pluginsDirectory)) {
    for (const entry of readdirSync(pluginsDirectory, { withFileTypes: true })) {
      const manifest = join(pluginsDirectory, entry.name, 'package.json');
      if (entry.isDirectory() && existsSync(manifest)) {
        const { name } = /** @type {{ name?: unknown }} */ (JSON.parse(readFileSync(manifest, 'utf8')));
        if (typeof name === 'string') {
          names.push(name);
        }
      }
    }
  }
  names.sort();
  pluginPackageNamesByRoot.set(workspaceRoot, names);
  return names;
};
