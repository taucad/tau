/**
 * @typedef {import('eslint').Rule.RuleModule} RuleModule
 */

/**
 * Flat capability modules of a plugin package: `packages/plugins/<pkg>/src/<file>`.
 * Nested directories (`utils/`, `wasm/`, `types/`, `session/`, …) hold helpers,
 * not capabilities, and are out of scope by construction — as are
 * `packages/core/**`, `packages/runtime/src/plugins/plugin.ts`, and the Nx
 * inference plugins under `tools/`.
 */
const PLUGIN_SOURCE_FILE = /(?:^|\/)packages\/plugins\/([^/]+)\/src\/([^/]+)$/u;

/** The capability roles a filename may declare. */
const ROLES = 'plugin|kernel|transcoder|middleware|bundler';

/** `<name>.<role>[.test|.test-d].ts` — the target convention. */
const DOTTED_ROLE = new RegExp(String.raw`\.(?:${ROLES})(?:\.test|\.test-d)?\.tsx?$`, 'u');

/** `<name>-<role>[.test|.test-d].ts` — the migration-era hyphen form. */
const HYPHEN_ROLE = new RegExp(String.raw`-((?:${ROLES})(?:\.test|\.test-d)?\.tsx?)$`, 'u');

/** Bare `plugin[.test|.test-d].ts` — the generic form the generator used to emit. */
const GENERIC_PLUGIN = /^plugin((?:\.test|\.test-d)?\.tsx?)$/u;

/** @type {RuleModule} */
export const pluginCapabilityFilenameRule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce the `{name}.{role}.ts` capability filename convention for flat modules under ' +
        '`packages/plugins/*/src`, so a kernel, transcoder, middleware, bundler, or plugin factory ' +
        'is locatable by filename and every test pairs with its subject.',
    },
    messages: {
      genericName:
        "'{{actual}}' is a generic capability filename. Rename it to '{{suggestion}}' so the plugin " +
        'factory is locatable by filename.',
      hyphenRole:
        "'{{actual}}' separates its capability role with a hyphen. Rename it to '{{suggestion}}': the " +
        'role separator is a dot, hyphens stay inside the name segment.',
    },
    schema: [],
  },
  create(context) {
    const match = PLUGIN_SOURCE_FILE.exec(context.filename.replaceAll('\\', '/'));
    if (match === null) {
      return {};
    }

    const packageName = match[1] ?? '';
    const basename = match[2] ?? '';

    const generic = GENERIC_PLUGIN.exec(basename);
    if (generic !== null) {
      const suggestion = `${packageName}.plugin${generic[1] ?? ''}`;
      return {
        Program(node) {
          context.report({ node, messageId: 'genericName', data: { actual: basename, suggestion } });
        },
      };
    }

    if (DOTTED_ROLE.test(basename)) {
      return {};
    }

    const hyphen = HYPHEN_ROLE.exec(basename);
    if (hyphen === null) {
      return {};
    }

    const suggestion = `${basename.slice(0, hyphen.index)}.${hyphen[1] ?? ''}`;
    return {
      Program(node) {
        context.report({ node, messageId: 'hyphenRole', data: { actual: basename, suggestion } });
      },
    };
  },
};
