/**
 * @typedef {import('eslint').Rule.RuleModule} RuleModule
 */

/** Attributes that name a control. `id` counts on inputs because a `<Label htmlFor>` can name them. */
const NAMING_ATTRIBUTES = new Set(['aria-label', 'aria-labelledby', 'title']);

const elementName = (node) => (node.name.type === 'JSXIdentifier' ? node.name.name : undefined);

const attribute = (opening, name) =>
  opening.attributes.find((item) => item.type === 'JSXAttribute' && item.name.name === name);

const staticValue = (item) => {
  const value = item?.value;
  if (value?.type === 'Literal') {
    return value.value;
  }
  if (value?.type === 'JSXExpressionContainer' && value.expression.type === 'Literal') {
    return value.expression.value;
  }
};

/**
 * Whether children may carry a name. An expression is unknown and counts as named, so the rule
 * only fires on children it can prove silent: whitespace and elements with no text inside.
 */
const childrenNameControl = (children) =>
  children.some((child) => {
    switch (child.type) {
      case 'JSXText': {
        return child.value.trim() !== '';
      }
      case 'JSXExpressionContainer': {
        return child.expression.type !== 'JSXEmptyExpression';
      }
      case 'JSXElement': {
        return (
          /\bsr-only\b/u.test(staticValue(attribute(child.openingElement, 'className')) ?? '') ||
          childrenNameControl(child.children)
        );
      }
      case 'JSXFragment': {
        return childrenNameControl(child.children);
      }
      default: {
        return false;
      }
    }
  });

/** The controls this rule can see: icon-size `Button`s and search inputs. */
const controlKind = (opening) => {
  const name = elementName(opening);
  if (name === 'Button' && String(staticValue(attribute(opening, 'size')) ?? '').startsWith('icon')) {
    return 'button';
  }
  if (name === 'SearchInput' || (name === 'Input' && staticValue(attribute(opening, 'type')) === 'search')) {
    return 'input';
  }
};

/** @type {RuleModule} */
export const requireAccessibleNameRule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require an accessible name on icon-only buttons and search inputs.',
    },
    messages: {
      button:
        'Name this icon-only button with `aria-label` (a tooltip is not a name; Page Composition Policy, Rule 9).',
      input:
        'Name this search field with `aria-label` or a `<Label htmlFor>`; a placeholder is not a name (Page Composition Policy, Rule 4).',
    },
    schema: [],
  },
  create(context) {
    return {
      JSXElement(node) {
        const opening = node.openingElement;
        const kind = controlKind(opening);
        if (
          kind === undefined ||
          opening.attributes.some(
            (item) =>
              item.type === 'JSXSpreadAttribute' ||
              NAMING_ATTRIBUTES.has(item.name.name) ||
              item.name.name === 'asChild' ||
              (kind === 'input' && item.name.name === 'id'),
          ) ||
          (kind === 'button' && childrenNameControl(node.children))
        ) {
          return;
        }
        context.report({ node: opening, messageId: kind });
      },
    };
  },
};
