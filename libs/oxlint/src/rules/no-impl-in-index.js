/**
 * @typedef {import('eslint').Rule.RuleModule} RuleModule
 * @typedef {import('estree').Node} Node
 */

/**
 * Matches `index` barrel files by any TS extension. A barrel exists only to
 * re-export; anything defined here is invisible to a filename grep.
 */
const INDEX_FILE = /(?:^|[\\/])index\.(?:ts|tsx|mts|cts)$/u;

/**
 * Statement types that are legal in a pure barrel: imports feed re-exports,
 * `export * from`, and `import x = require(...)` alias imports. Nothing else —
 * a barrel re-exports symbols defined elsewhere and declares nothing itself,
 * not even type aliases or interfaces.
 */
const ALLOWED_TOP_LEVEL = new Set(['ImportDeclaration', 'ExportAllDeclaration', 'TSImportEqualsDeclaration']);

/**
 * Convert a camelCase / PascalCase identifier to a kebab-case filename hint for
 * the fix message.
 *
 * @param {string} name - Identifier to convert.
 * @returns {string} Kebab-case form.
 */
const toKebab = (name) =>
  name
    .replaceAll(/([a-z0-9])([A-Z])/gu, '$1-$2')
    .replaceAll(/[_\s]+/gu, '-')
    .toLowerCase();

/** Node types that bind a named symbol (runtime or type), mapped to their human label. */
const NAMED_BINDING_KINDS = new Map([
  ['FunctionDeclaration', 'function'],
  ['FunctionExpression', 'function'],
  ['ArrowFunctionExpression', 'function'],
  ['ClassDeclaration', 'class'],
  ['ClassExpression', 'class'],
  ['TSEnumDeclaration', 'enum'],
  ['TSModuleDeclaration', 'namespace'],
  ['TSTypeAliasDeclaration', 'type'],
  ['TSInterfaceDeclaration', 'interface'],
]);

/**
 * Human label for a variable declaration by what it binds.
 *
 * @param {Node | null | undefined} init - The declarator initializer.
 * @returns {string} One of 'function', 'class', or 'value'.
 */
const describeInitKind = (init) => {
  if (init?.type === 'ArrowFunctionExpression' || init?.type === 'FunctionExpression') {
    return 'function';
  }
  if (init?.type === 'ClassExpression') {
    return 'class';
  }
  return 'value';
};

/**
 * Classify a (possibly export-unwrapped) declaration/statement that declares a
 * symbol (value or type) or runs a side effect in a barrel. Returns the
 * offending name + kind, or `undefined` when the node is an allowed barrel
 * citizen.
 *
 * @param {Node | null | undefined} node - Declaration or statement to classify.
 * @returns {{ name: string, kind: string } | undefined} Violation, or undefined when allowed.
 */
const classifyDeclaration = (node) => {
  if (!node) {
    return undefined;
  }

  const namedKind = NAMED_BINDING_KINDS.get(node.type);
  if (namedKind !== undefined) {
    // Arrow/function/class expressions (default exports) carry no id → 'default'.
    return { name: String(node.id?.name ?? 'default'), kind: namedKind };
  }

  if (node.type === 'VariableDeclaration') {
    const [declarator] = node.declarations;
    const name = declarator?.id?.type === 'Identifier' ? String(declarator.id.name) : 'value';
    return { name, kind: describeInitKind(declarator?.init) };
  }

  if (node.type === 'ExpressionStatement') {
    return { name: 'top-level statement', kind: 'side effect' };
  }

  return undefined;
};

/**
 * Classify a top-level statement of a barrel. Only imports and re-exports
 * (`export … from`, `export { … }`, `export * from`, `export type { … }`) are
 * allowed; anything that declares a symbol (value or type) or runs a side
 * effect is a violation.
 *
 * @param {Node} statement - Top-level program statement.
 * @returns {{ name: string, kind: string } | undefined} Violation, or undefined when allowed.
 */
const classifyStatement = (statement) => {
  if (ALLOWED_TOP_LEVEL.has(statement.type)) {
    return undefined;
  }

  if (statement.type === 'ExportNamedDeclaration') {
    // Re-exports are the barrel's whole purpose: `export { a } from './x'`
    // (incl. `export type { A } from './x'`) and `export { a, b }` / `export
    // type { A }` (specifier re-export of imported bindings). Anything with an
    // inline `declaration` — including `export type Foo = …` and
    // `export interface Foo {}` — defines a symbol and does not belong here.
    if (statement.source) {
      return undefined;
    }
    if (!statement.declaration) {
      return undefined;
    }
    return classifyDeclaration(statement.declaration);
  }

  if (statement.type === 'ExportDefaultDeclaration') {
    // `export default foo` re-exports an existing binding; anything else defines one.
    if (statement.declaration.type === 'Identifier') {
      return undefined;
    }
    return classifyDeclaration(statement.declaration);
  }

  return classifyDeclaration(statement);
};

/** @type {RuleModule} */
export const noImplInIndexRule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce that `index.ts`/`index.tsx` files are pure barrels: only imports and re-exports ' +
        '(`export … from`, `export *`, `export { … }`, `export type { … }`) are allowed. Every ' +
        'declaration — function, arrow, class, runtime constant, enum, namespace, type alias, ' +
        'interface, and top-level side effect — must live in a named module and be re-exported, ' +
        'so every symbol is locatable by filename.',
    },
    messages: {
      notABarrel:
        "index barrels may only re-export. Move the {{kind}} '{{name}}' to a named module " +
        "(e.g. '{{suggestion}}.ts') and re-export it from index.ts so it is locatable by filename.",
    },
    schema: [],
  },
  create(context) {
    if (!INDEX_FILE.test(context.filename)) {
      return {};
    }

    return {
      Program(program) {
        for (const statement of program.body) {
          const violation = classifyStatement(statement);
          if (violation === undefined) {
            continue;
          }

          context.report({
            node: statement,
            messageId: 'notABarrel',
            data: {
              name: violation.name,
              kind: violation.kind,
              suggestion: toKebab(violation.name),
            },
          });
        }
      },
    };
  },
};
