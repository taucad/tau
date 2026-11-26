import { visit } from 'unist-util-visit';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import type { Root, Element } from 'hast';
import type { Schema } from 'hast-util-sanitize';
import type { PluggableList } from 'unified';

const allowedAnchorProtocols = ['http', 'https', 'mailto'];
const allowedImageProtocols = ['http', 'https'];

/*
 * Elements dropped from the default schema: `picture` and `source` load from `srcset`, which the protocol check does
 * not cover.
 */
const droppedTagNames = new Set(['picture', 'source']);

/**
 * Sanitize schema for Markdown a model, an agent or a project file wrote, which is all the Markdown this viewer shows:
 *
 * - Strips `<script>` / `<iframe>` and `javascript:` URLs.
 * - Forces every `<a>` to carry `rel='nofollow noopener noreferrer'` and `target='_blank'`.
 * - Keeps no `style` attribute and no class beyond `language-*`, `katex*` and `hljs*`, so the text cannot draw over
 *   the app, look like one of its controls, or load a stylesheet URL.
 * - Keeps no `picture` or `source`; an `img` keeps its `src`, and `MarkdownImage` loads one from another host only
 *   when the person asks.
 *
 * Math needs no allowance here: the math plugin renders KaTeX after this schema has run.
 */
const markdownSanitizeSchema: Schema = {
  ...defaultSchema,
  tagNames: (defaultSchema.tagNames ?? []).filter((tag) => !droppedTagNames.has(tag)),
  attributes: {
    ...defaultSchema.attributes,
    a: [...(defaultSchema.attributes?.['a'] ?? []), 'target', 'rel'],
    code: [['className', /^language-./u]],
    pre: [['className', /^language-./u]],
    span: [...(defaultSchema.attributes?.['span'] ?? []), ['className', /^(?:katex|hljs)/u]],
    div: [...(defaultSchema.attributes?.['div'] ?? []), ['className', /^(?:katex|hljs)/u]],
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

    node.properties.target = '_blank';
    node.properties.rel = ['nofollow', 'noopener', 'noreferrer'];
  });
};

/**
 * Composite rehype plugin set for the Markdown the viewer shows.
 *
 * @public
 */
export const markdownRehypeSanitize: PluggableList = [[rehypeSanitize, markdownSanitizeSchema], [enforceSafeAnchors]];
