/**
 * @typedef {import('eslint').Rule.RuleModule} RuleModule
 * @typedef {import('estree').Node} Node
 */

import { pluginAliasOf, pluginSourceOf } from '../utils/plugin-source.utils.js';

/** @type {RuleModule} */
export const requirePluginPackageBindingRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        "Require a plugin package's implementation module (`packages/plugins/<pkg>/src/<pkg>.plugin.ts`) to export " +
        'exactly one `definePlugin` binding, named for the package in camelCase, so the package entry can re-export ' +
        'it under that name and as `plugin`.',
    },
    messages: {
      missingBinding:
        "'{{file}}' exports no `definePlugin` binding. Declare `export const {{alias}} = definePlugin({ ... });`.",
      unexpectedBinding:
        "'{{name}}' is not the package-named binding. Name the `definePlugin` export '{{alias}}' and keep it the " +
        "module's only `definePlugin` export.",
    },
    schema: [],
  },
  create(context) {
    const source = pluginSourceOf(context.filename);
    if (source === undefined || source.path !== `${source.packageName}.plugin.ts`) {
      return {};
    }
    const alias = pluginAliasOf(source.packageName);

    return {
      Program(program) {
        /** @type {Array<{ name: string; node: Node }>} */
        const bindings = [];
        for (const statement of program.body) {
          if (statement.type !== 'ExportNamedDeclaration' || statement.declaration?.type !== 'VariableDeclaration') {
            continue;
          }
          for (const declarator of statement.declaration.declarations) {
            const { id, init } = declarator;
            if (
              id.type === 'Identifier' &&
              init?.type === 'CallExpression' &&
              init.callee.type === 'Identifier' &&
              init.callee.name === 'definePlugin'
            ) {
              bindings.push({ name: id.name, node: declarator });
            }
          }
        }

        if (bindings.length === 0) {
          context.report({ node: program, messageId: 'missingBinding', data: { file: source.path, alias } });
          return;
        }
        for (const { name, node } of bindings) {
          if (name !== alias) {
            context.report({ node, messageId: 'unexpectedBinding', data: { name, alias } });
          }
        }
      },
    };
  },
};
