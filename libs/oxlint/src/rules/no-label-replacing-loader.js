/**
 * @typedef {import('eslint').Rule.RuleModule} RuleModule
 */

/** Controls whose visible label is their accessible name. */
const CONTROLS = new Set(['Button', 'Link', 'NavLink', 'InteractiveHoverButton']);

/** `Loader`, `Loader2`, `LoaderCircle`, `Spinner`: every busy glyph the app renders. */
const LOADER_NAME = /^(?:Loader\w*|Spinner)$/u;

const elementName = (node) =>
  node.openingElement.name.type === 'JSXIdentifier' ? node.openingElement.name.name : undefined;

const hasAttribute = (node, name) =>
  node.openingElement.attributes.some((item) => item.type === 'JSXAttribute' && item.name.name === name);

/** A loader that does not name itself: the control loses its label while it shows. */
const isSilentLoader = (node) =>
  node.type === 'JSXElement' &&
  LOADER_NAME.test(elementName(node) ?? '') &&
  !hasAttribute(node, 'aria-label') &&
  !hasAttribute(node, 'aria-labelledby');

const hasText = (node) => {
  switch (node.type) {
    case 'Literal': {
      return typeof node.value === 'string' && node.value.trim() !== '';
    }
    case 'TemplateLiteral': {
      return true;
    }
    case 'JSXText': {
      return node.value.trim() !== '';
    }
    case 'JSXElement':
    case 'JSXFragment': {
      return node.children.some((child) => hasText(child));
    }
    default: {
      return false;
    }
  }
};

/**
 * The control element whose child is this conditional: `<Button>{c ? <Loader /> : 'Save'}</Button>`,
 * or a render-prop child such as `<NavLink>{({ isPending }) => (isPending ? <Loader /> : 'Sign in')}</NavLink>`.
 */
const owningControl = (node) => {
  let { parent } = node;
  if (parent?.type === 'ArrowFunctionExpression' && parent.body === node) {
    parent = parent.parent;
  }
  if (parent?.type !== 'JSXExpressionContainer' || parent.parent?.type !== 'JSXElement') {
    return;
  }
  return CONTROLS.has(elementName(parent.parent) ?? '') ? parent.parent : undefined;
};

/** @type {RuleModule} */
export const noLabelReplacingLoaderRule = {
  meta: {
    type: 'problem',
    docs: {
      description: "Disallow a loader that replaces a control's label.",
    },
    messages: {
      violation:
        'A busy control keeps its name: render the label beside the loader and set `aria-busy` instead of swapping the label for a loader (Page Composition Policy, Rule 10).',
    },
    schema: [],
  },
  create(context) {
    return {
      ConditionalExpression(node) {
        const { consequent, alternate } = node;
        const replacesLabel = isSilentLoader(consequent)
          ? hasText(alternate)
          : isSilentLoader(alternate) && hasText(consequent);
        if (replacesLabel && owningControl(node) !== undefined) {
          context.report({ node, messageId: 'violation' });
        }
      },
    };
  },
};
