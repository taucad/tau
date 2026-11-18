// The cross-file half of the first-party plugin surface: the package entry re-exports the package-named
// `definePlugin` binding under its own name and as `plugin`, the name dynamic loaders read (`module.plugin()`).
// The single-file half (named-only modules, the package-named binding, kernel assertions) is tau-lint's.

/**
 * Input of {@link assertPluginContractSurface}.
 * @public
 */
export type PluginContractSurfaceInput = {
  /** The npm package name, such as `@taucad/replicad`; its unscoped name in camelCase names the binding. */
  readonly packageName: string;
  /** The package entry's module namespace: `await import('#index.js')`. */
  readonly entry: Readonly<Record<string, unknown>>;
  /** The implementation module's namespace: `await import('#<name>.plugin.js')`. */
  readonly implementation: Readonly<Record<string, unknown>>;
};

/** The export name dynamic plugin loaders call. */
const dynamicPluginExport = 'plugin';

const bindingNameOf = (packageName: string): string =>
  packageName
    .slice(packageName.lastIndexOf('/') + 1)
    .replaceAll(/-([a-z0-9])/gu, (_match, character: string) => character.toUpperCase());

/**
 * Assert a plugin package's dynamic plugin contract: its implementation module exports the package-named
 * `definePlugin` binding (`@taucad/picogk-browser` → `picogkBrowser`), and the package entry re-exports that same
 * factory exactly twice, under the package name and as `plugin`, and under no other name.
 *
 * @param input - The package name and the entry and implementation module namespaces.
 * @throws {Error} Naming the missing binding and every missing, foreign or extra entry export.
 * @public
 * @example <caption>Pin a plugin package's entry from its own test</caption>
 * ```typescript
 * import { assertPluginContractSurface } from '@taucad/runtime-testing';
 *
 * // In `src/index.test.ts`: `entry` is `await import('#index.js')`, `implementation` is
 * // `await import('#replicad.plugin.js')`.
 * export const checkReplicadEntry = (
 *   entry: Readonly<Record<string, unknown>>,
 *   implementation: Readonly<Record<string, unknown>>,
 * ): void => {
 *   assertPluginContractSurface({ packageName: '@taucad/replicad', entry, implementation });
 * };
 * ```
 */
export const assertPluginContractSurface = (input: PluginContractSurfaceInput): void => {
  const binding = bindingNameOf(input.packageName);
  const factory = input.implementation[binding];
  if (typeof factory !== 'function') {
    throw new TypeError(
      `${input.packageName}: the implementation module exports no '${binding}' plugin factory; declare ` +
        `\`export const ${binding} = definePlugin({ ... })\`.`,
    );
  }

  const problems: string[] = [];
  for (const name of [binding, dynamicPluginExport]) {
    if (!Object.hasOwn(input.entry, name)) {
      problems.push(`the entry does not export '${name}'; re-export '${binding}' as '${name}'.`);
    } else if (input.entry[name] !== factory) {
      problems.push(`the entry's '${name}' is not the implementation module's '${binding}'.`);
    }
  }
  for (const name of Object.keys(input.entry)) {
    if (name !== binding && name !== dynamicPluginExport && input.entry[name] === factory) {
      problems.push(`the entry also exports '${binding}' as '${name}'; only '${binding}' and 'plugin' name it.`);
    }
  }

  if (problems.length > 0) {
    throw new Error(`${input.packageName} plugin contract surface:\n${problems.map((line) => `- ${line}`).join('\n')}`);
  }
};
