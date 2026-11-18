/**
 * @typedef {import('eslint').Rule.RuleModule} RuleModule
 */

/**
 * The page globals whose shape a product module declares (`declare global { var … }`) beside the bridge that installs
 * them. The section-view bridge's contract is `apps/ui/app/components/geometry/debug/section-view-test-bridge-api.ts`.
 */
const defaultGlobals = ['__TAU_SECTION_VIEW_TEST__', '__TAU_SECTION_VIEW_TEST_BRIDGES__'];

/**
 * The name a property signature declares, when it is written as an identifier or a string.
 *
 * @param {any} key - The signature's key.
 * @returns {string | undefined} The name.
 */
const keyName = (key) => {
  if (key.type === 'Identifier') {
    return key.name;
  }
  if (key.type === 'Literal' && typeof key.value === 'string') {
    return key.value;
  }
  return undefined;
};

/** @type {RuleModule} */
export const noTestBridgeRedeclarationRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        "A test bridge global is typed once, by the product module that installs it; nothing else declares the global's shape.",
    },
    messages: {
      violation:
        '`{{name}}` is declared by its product module. Read `globalThis.{{name}}` directly (ui-e2e imports its types from `@taucad/app/test-bridges/section-view`), so removing or changing a bridge method fails the typecheck.',
    },
    schema: [
      {
        type: 'object',
        properties: { globals: { type: 'array', items: { type: 'string' } } },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const globals = new Set(context.options[0]?.globals ?? defaultGlobals);
    return {
      /** @param {any} node */
      TSPropertySignature(node) {
        const name = keyName(node.key);
        if (name !== undefined && globals.has(name)) {
          context.report({ node, messageId: 'violation', data: { name } });
        }
      },
    };
  },
};
