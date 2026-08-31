import { visit } from 'unist-util-visit';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import type { Root, Element } from 'hast';
import type { Schema } from 'hast-util-sanitize';
import type { PluggableList } from 'unified';

const katexTagAllowList = [
  'math',
  'maction',
  'maligngroup',
  'malignmark',
  'menclose',
  'merror',
  'mfenced',
  'mfrac',
  'mi',
  'mlongdiv',
  'mmultiscripts',
  'mn',
  'mo',
  'mover',
  'mpadded',
  'mphantom',
  'mroot',
  'mrow',
  'ms',
  'mscarries',
  'mscarry',
  'msgroup',
  'msline',
  'mspace',
  'msqrt',
  'msrow',
  'mstack',
  'mstyle',
  'msub',
  'msup',
  'msubsup',
  'mtable',
  'mtd',
  'mtext',
  'mtr',
  'munder',
  'munderover',
  'semantics',
  'annotation',
  'annotation-xml',
  'svg',
  'g',
  'path',
  'span',
] as const;

const katexAttributeAllowList = [
  ['className'],
  ['style'],
  ['encoding'],
  ['display'],
  ['mathvariant'],
  ['xmlns'],
  ['viewBox'],
  ['width'],
  ['height'],
  ['preserveAspectRatio'],
  ['fill'],
  ['stroke'],
  ['d'],
  ['transform'],
  ['x'],
  ['y'],
  ['x1'],
  ['x2'],
  ['y1'],
  ['y2'],
];

const allowedAnchorProtocols = ['http', 'https', 'mailto'];
const allowedImageProtocols = ['http', 'https'];

/**
 * Strict sanitize schema for publication README markdown:
 *
 * - Strips `<script>` / `<iframe>` and `javascript:` URLs.
 * - Forces every `<a>` to carry `rel='nofollow noopener noreferrer'` and `target='_blank'`.
 * - Permits KaTeX `MathML`/SVG nodes and `language-*` code class names.
 */
const publicationSanitizeSchema: Schema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), ...katexTagAllowList],
  attributes: {
    ...defaultSchema.attributes,
    a: [...(defaultSchema.attributes?.['a'] ?? []), 'target', 'rel'],
    code: [['className', /^language-./u]],
    pre: [['className', /^language-./u]],
    span: [...(defaultSchema.attributes?.['span'] ?? []), ['className', /^(?:katex|hljs|shiki)/u], ['style']],
    div: [...(defaultSchema.attributes?.['div'] ?? []), ['className', /^(?:katex|hljs|shiki)/u]],
    ...Object.fromEntries(katexTagAllowList.map((tag) => [tag, katexAttributeAllowList])),
  },
  protocols: {
    ...defaultSchema.protocols,
    href: allowedAnchorProtocols,
    src: allowedImageProtocols,
  },
  strip: ['script', 'iframe', 'object', 'embed', 'style'],
};

/**
 * `rehype-plugins` array applied after `rehype-sanitize` to enforce safe `<a>` defaults.
 *
 * Runs as a separate visitor so the sanitize schema can stay declarative while still
 * guaranteeing every external link emits `rel='nofollow noopener noreferrer'` + `target='_blank'`.
 */
const enforceSafeAnchors = () => (tree: Root) => {
  visit(tree, 'element', (node: Element) => {
    if (node.tagName !== 'a') {
      return;
    }

    node.properties['target'] = '_blank';
    node.properties['rel'] = ['nofollow', 'noopener', 'noreferrer'];
  });
};

/**
 * Composite rehype plugin set for publication README markdown.
 *
 * @public
 */
export const publicationRehypeSanitize: PluggableList = [
  [rehypeSanitize, publicationSanitizeSchema],
  [enforceSafeAnchors],
];
