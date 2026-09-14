/**
 * @typedef {import('eslint').Rule.RuleModule} RuleModule
 */

const TAILWIND_POINTER_PATTERN = /\bcursor-pointer\b/u;
const CSS_POINTER_PATTERN = /\bcursor\s*:\s*pointer\b/iu;

const staticString = (node) => {
  if (node?.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked;
  }
};

const memberName = (node) => {
  if (node.type !== 'MemberExpression') {
    return;
  }
  if (!node.computed && node.property.type === 'Identifier') {
    return node.property.name;
  }
  return staticString(node.property);
};

const propertyName = (node) => {
  if (node.key.type === 'Identifier' && !node.computed) {
    return node.key.name;
  }
  return staticString(node.key);
};

/** @type {RuleModule} */
export const noAuthoredPointerCursorRule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow authored pointer cursors outside the shared action cursor contract.',
    },
    messages: {
      violation:
        'Do not author pointer cursors directly. Links use native anchor behavior; actions use the shared cursor contract.',
    },
    schema: [],
  },
  create(context) {
    if (/[\\/]no-authored-pointer-cursor\.test\.js$/u.test(context.filename)) {
      return {};
    }

    const report = (node) => {
      context.report({ node, messageId: 'violation' });
    };

    return {
      Literal(node) {
        if (
          typeof node.value === 'string' &&
          (TAILWIND_POINTER_PATTERN.test(node.value) || CSS_POINTER_PATTERN.test(node.value))
        ) {
          report(node);
        }
      },
      TemplateElement(node) {
        if (TAILWIND_POINTER_PATTERN.test(node.value.raw) || CSS_POINTER_PATTERN.test(node.value.raw)) {
          report(node);
        }
      },
      Property(node) {
        if (propertyName(node) === 'cursor' && staticString(node.value) === 'pointer') {
          report(node.value);
        }
      },
      AssignmentExpression(node) {
        if (memberName(node.left) === 'cursor' && staticString(node.right) === 'pointer') {
          report(node.right);
        }
      },
      CallExpression(node) {
        const name = node.callee.type === 'Identifier' ? node.callee.name : memberName(node.callee);
        if (
          name?.toLowerCase().includes('cursor') &&
          node.arguments.some((argument) => staticString(argument) === 'pointer')
        ) {
          report(node);
        }
      },
    };
  },
};
