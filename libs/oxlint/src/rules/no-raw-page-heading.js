/**
 * @typedef {import('eslint').Rule.RuleModule} RuleModule
 */

/**
 * `PageHeader` owns the page title; display heroes (landing, loader, legal) keep their own type.
 */
const HEADING_OWNER_FILE =
  /[\\/]components[\\/]layout[\\/]page-header\.tsx$|[\\/]routes[\\/](?:_index|loader[^\\/]*|legal[^\\/]*)[\\/]/u;

/** A text-size utility, with or without a responsive variant: `text-3xl`, `md:text-4xl`. */
const TEXT_SIZE = /(?:^|[\s:])text-(?:xs|sm|base|lg|\d?xl)(?![\w-])/u;

const staticText = (value) => {
  if (value?.type === 'Literal' && typeof value.value === 'string') {
    return value.value;
  }
  if (value?.type === 'JSXExpressionContainer') {
    return staticText(value.expression);
  }
  if (value?.type === 'TemplateLiteral') {
    return value.quasis.map((quasi) => quasi.value.raw).join(' ');
  }
  if (value?.type === 'CallExpression') {
    return value.arguments.map((argument) => staticText(argument) ?? '').join(' ');
  }
};

/** @type {RuleModule} */
export const noRawPageHeadingRule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Require page titles to render through PageHeader.',
    },
    messages: {
      violation:
        'Render the page title through `PageHeader` (`#components/layout/page-header.js`) instead of a styled `<h1>` (Page Composition Policy, Rule 2).',
    },
    schema: [],
  },
  create(context) {
    if (HEADING_OWNER_FILE.test(context.filename)) {
      return {};
    }
    return {
      JSXOpeningElement(node) {
        if (node.name.type !== 'JSXIdentifier' || node.name.name !== 'h1') {
          return;
        }
        const className = node.attributes.find(
          (item) => item.type === 'JSXAttribute' && item.name.name === 'className',
        );
        if (TEXT_SIZE.test(staticText(className?.value) ?? '')) {
          context.report({ node, messageId: 'violation' });
        }
      },
    };
  },
};
