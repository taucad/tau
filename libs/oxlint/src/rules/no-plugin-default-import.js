/**
 * @typedef {import('eslint').Rule.RuleModule} RuleModule
 */

import { normalizeFilename, pluginPackageNamesOf } from '../utils/plugin-source.utils.js';

/**
 * Package-owned roots: the runtime and every first-party plugin. A JSON module (a package's `tau-plugin.json`) has
 * only a default export; it is data, not a plugin module, so these roots may default-import it.
 */
const PACKAGE_SCOPE = /^(?:(.*?)\/)?packages\/(?:runtime|plugins\/[^/]+)\/src\/.+(?<!\.d\.tsx?)$/u;

/**
 * Application-owned roots that compose the runtime: the telemetry library and the UI's middleware and runtime
 * folders. They have always been held to the stricter form, without the JSON allowance or a declaration-file
 * exemption.
 */
const APPLICATION_SCOPE =
  /^(?:(.*?)\/)?(?:libs\/telemetry\/src|apps\/ui\/app\/middleware|apps\/ui\/app\/runtime)\/.+$/u;

/** `.ts` and `.tsx`, the extensions the plugin surface guard has always scanned. */
const TYPESCRIPT_SOURCE = /\.tsx?$/u;

/** Specifier prefixes that name a Tau-owned plugin module, besides the plugin packages themselves. */
const PLUGIN_IMPORT_PREFIXES = Object.freeze([
  '#bundler/',
  '#kernels/',
  '#middleware/',
  '@taucad/runtime/bundler',
  '@taucad/runtime/middleware',
  '@taucad/runtime/transcoder',
]);

/** @type {RuleModule} */
export const noPluginDefaultImportRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow default imports of Tau-owned plugin modules (the runtime bundler, middleware and transcoder entries, ' +
        "the runtime's `#bundler/`, `#kernels/` and `#middleware/` modules, and every `packages/plugins/*` package) " +
        'from runtime, plugin and runtime-composing application sources. Plugin modules are named-only.',
    },
    messages: {
      defaultImport:
        "'{{specifier}}' is a Tau-owned plugin module and has no default export. Import its named binding instead.",
    },
    schema: [],
  },
  create(context) {
    const filename = normalizeFilename(context.filename);
    if (!TYPESCRIPT_SOURCE.test(filename)) {
      return {};
    }
    const packageMatch = PACKAGE_SCOPE.exec(filename);
    const applicationMatch = packageMatch === null ? APPLICATION_SCOPE.exec(filename) : null;
    const match = packageMatch ?? applicationMatch;
    if (match === null) {
      return {};
    }
    const allowJson = packageMatch !== null;
    const workspaceRoot = match[1] ?? '';

    /** @type {readonly string[] | undefined} */
    let prefixes;
    const isPluginImport = (/** @type {string} */ specifier) => {
      if (allowJson && specifier.endsWith('.json')) {
        return false;
      }
      prefixes ??= [...PLUGIN_IMPORT_PREFIXES, ...pluginPackageNamesOf(workspaceRoot)];
      return prefixes.some((prefix) => specifier === prefix || specifier.startsWith(prefix));
    };

    return {
      ImportDeclaration(node) {
        const specifier = node.source.value;
        if (
          typeof specifier === 'string' &&
          node.specifiers.some(({ type }) => type === 'ImportDefaultSpecifier') &&
          isPluginImport(specifier)
        ) {
          context.report({ node, messageId: 'defaultImport', data: { specifier } });
        }
      },
    };
  },
};
