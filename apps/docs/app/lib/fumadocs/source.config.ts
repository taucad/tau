/* oxlint-disable no-restricted-imports, import/extensions -- Fumadocs source config is imported by Vite config before app # aliases are active. */
import { defineConfig, defineDocs, frontmatterSchema } from 'fumadocs-mdx/config';
import { remarkAutoTypeTable, createGenerator } from 'fumadocs-typescript';
import { remarkMdxMermaid } from 'fumadocs-core/mdx-plugins';
import { tauCustomShikiLanguages } from '@taucad/grammars';
import { z } from 'zod';
import { remarkLlmStringifyMdx } from './llm-stringify-mdx.js';
import { remarkResolveRelativeLinks } from './remark-resolve-relative-links.js';

const generator = createGenerator({
  tsconfigPath: './tsconfig.api-docs.json',
});

// oxlint-disable-next-line typescript/no-deprecated -- the suggested pageSchema replacement breaks fumadocs-mdx 15.4 collection output (every page 404s at prerender); re-evaluate on the next fumadocs-mdx major.
const docsFrontmatterSchema = frontmatterSchema.extend({
  title: z.string(),
  docType: z.enum(['tutorial', 'how-to', 'reference', 'explanation']),
  wordBudgetOverride: z.number().int().positive().optional(),
});

export const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    schema: docsFrontmatterSchema,
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
});

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [
      [remarkAutoTypeTable, { generator }],
      remarkMdxMermaid,
      remarkResolveRelativeLinks,
      remarkLlmStringifyMdx,
    ],
    remarkCodeTabOptions: {
      parseMdx: true,
    },
    rehypeCodeOptions: {
      themes: {
        // The standard light palette's parameter orange fails AA on the docs code surface.
        light: 'github-light-high-contrast',
        dark: 'github-dark',
        'high-contrast-light': 'github-light-high-contrast',
        'high-contrast-dark': 'github-dark-high-contrast',
      },
      defaultColor: false,
      inline: 'tailing-curly-colon',
      langs: tauCustomShikiLanguages,
    },
  },
});
