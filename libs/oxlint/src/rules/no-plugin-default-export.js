/**
 * @typedef {import('eslint').Rule.RuleModule} RuleModule
 */

import { pluginSourceOf } from '../utils/plugin-source.utils.js';

/** @type {RuleModule} */
export const noPluginDefaultExportRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Keep first-party plugin implementation modules (`packages/plugins/*/src/**`) named-only: no `export default` ' +
        'declaration or expression, at the top level or inside an ambient module. A CAD user source keeps its default ' +
        'entrypoint; it lives outside plugin sources.',
    },
    messages: {
      defaultExport:
        'Plugin implementation modules are named-only. Replace this default export with a named export; the package ' +
        'entry re-exports the package-named binding and `plugin`.',
    },
    schema: [],
  },
  create(context) {
    if (pluginSourceOf(context.filename) === undefined) {
      return {};
    }
    return {
      ExportDefaultDeclaration(node) {
        context.report({ node, messageId: 'defaultExport' });
      },
    };
  },
};
