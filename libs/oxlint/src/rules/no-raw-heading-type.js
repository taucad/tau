/**
 * @typedef {import('eslint').Rule.RuleModule} RuleModule
 */

/** The components whose look comes from the heading scale: `Heading` and the title slots that compose it. */
const SCALE_OWNERS = new Set([
  'Heading',
  'PageHeader',
  'SectionHeader',
  'CardTitle',
  'DialogTitle',
  'AlertDialogTitle',
  'DrawerTitle',
  'SheetTitle',
]);

const RAW_HEADING = /^h[1-6]$/u;

/**
 * What a heading variant owns: text size, weight, line height and tracking, with or without a
 * variant prefix (`md:text-2xl`). Colour, alignment and wrapping (`text-muted-foreground`,
 * `text-center`, `text-balance`, `truncate`, `line-clamp-2`) stay legal.
 */
const TYPE_UTILITY =
  /(?<![\w-])(?:text-(?:xs|sm|base|lg|\d?xl|\[\d[^\]\s]*\])|font-(?:thin|extralight|light|normal|medium|semibold|bold|extrabold|black)|leading-[\w.[\]-]+|tracking-[\w.[\]-]+)(?![\w-])/gu;

/** Files that define the scale, or render content whose type is not the product's heading scale. */
const EXEMPT_FILE =
  /[\\/]packages[\\/]ui[\\/]src[\\/]components[\\/](?:heading[^\\/]*|panel-empty-state)\.tsx?$|[\\/]components[\\/]markdown[\\/]|[\\/]routes[\\/]loader[^\\/]*[\\/]/u;

/** Each reserved variant, the one place that may render it, and what everything else renders instead. */
const RESERVED_VARIANTS = {
  page: { owner: /[\\/]components[\\/]layout[\\/]page-header\.tsx$/u, instead: '`PageHeader`' },
  display: { owner: /[\\/]routes[\\/]_index[\\/]/u, instead: 'the `page` title through `PageHeader`' },
};

/** The static class strings inside a `className` value, through `cn(…)`, conditionals and arrays. */
const classStrings = (node) => {
  switch (node?.type) {
    case 'Literal': {
      return typeof node.value === 'string' ? [node] : [];
    }
    case 'TemplateLiteral': {
      return node.quasis;
    }
    case 'JSXExpressionContainer': {
      return classStrings(node.expression);
    }
    case 'CallExpression': {
      return node.arguments.flatMap((argument) => classStrings(argument));
    }
    case 'ConditionalExpression': {
      return [...classStrings(node.consequent), ...classStrings(node.alternate)];
    }
    case 'LogicalExpression': {
      return [...classStrings(node.left), ...classStrings(node.right)];
    }
    case 'ArrayExpression': {
      return node.elements.flatMap((element) => classStrings(element));
    }
    default: {
      return [];
    }
  }
};

const attribute = (node, name) =>
  node.attributes.find((item) => item.type === 'JSXAttribute' && item.name.name === name);

/** @type {RuleModule} */
export const noRawHeadingTypeRule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Keep size, weight, line height and tracking utilities off headings and title slots: the Heading variant owns them.',
    },
    hasSuggestions: true,
    messages: {
      raw: '`{{found}}` styles a raw `<{{name}}>`. Render `Heading` (`@taucad/ui/components/heading`) with a `level` and the `variant` for its role instead (UI Policy §3).',
      override:
        '`{{found}}` overrides the heading scale on `{{name}}`. The variant owns size, weight, line height and tracking: pick the variant that fits (UI Policy §3).',
      reserved:
        "`variant='{{variant}}'` is reserved to its one owner. Render {{instead}} here (Page Composition Policy, Rule 2).",
      remove: 'Remove `{{found}}`.',
    },
    schema: [],
  },
  create(context) {
    if (EXEMPT_FILE.test(context.filename)) {
      return {};
    }
    return {
      JSXOpeningElement(node) {
        if (node.name.type !== 'JSXIdentifier') {
          return;
        }
        const { name } = node.name;
        const isOwner = SCALE_OWNERS.has(name);
        if (!isOwner && !RAW_HEADING.test(name)) {
          return;
        }

        const variant = name === 'Heading' ? attribute(node, 'variant')?.value : undefined;
        const reserved = variant?.type === 'Literal' ? RESERVED_VARIANTS[variant.value] : undefined;
        if (reserved && !reserved.owner.test(context.filename)) {
          context.report({
            node: variant,
            messageId: 'reserved',
            data: { variant: variant.value, instead: reserved.instead },
          });
        }

        for (const literal of classStrings(attribute(node, 'className')?.value)) {
          const source = context.sourceCode.getText(literal);
          for (const match of source.matchAll(TYPE_UTILITY)) {
            const [found] = match;
            /* Take the variant prefix (`md:`) with the utility: the match starts after it. */
            const prefix = /(?:[\w-]+:)*$/u.exec(source.slice(0, match.index))?.[0] ?? '';
            const start = /** @type {number} */ (literal.range[0]) + match.index - prefix.length;
            const length = prefix.length + found.length;
            /* Take one neighbouring space with the utility so the class string stays tidy. */
            const end = source[match.index + found.length] === ' ' ? start + length + 1 : start + length;
            const data = { found: `${prefix}${found}`, name };
            context.report({
              node: literal,
              loc: {
                start: context.sourceCode.getLocFromIndex(start),
                end: context.sourceCode.getLocFromIndex(start + length),
              },
              messageId: isOwner ? 'override' : 'raw',
              data,
              /* A raw heading has no variant to fall back on, so removing its classes is no fix. */
              suggest: isOwner ? [{ messageId: 'remove', data, fix: (fixer) => fixer.removeRange([start, end]) }] : [],
            });
          }
        }
      },
    };
  },
};
