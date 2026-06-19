/* oxlint-disable no-restricted-imports, import/extensions -- Fumadocs source config is imported by Vite config before app # aliases are active. */
import { defineConfig, defineDocs } from 'fumadocs-mdx/config';
import { remarkAutoTypeTable, createGenerator } from 'fumadocs-typescript';
import { remarkMdxMermaid } from 'fumadocs-core/mdx-plugins';
import { tauCustomShikiLanguages } from '../shiki-custom-languages.js';
import { llmStringifyMdx } from './llm-stringify-mdx.js';
import { remarkResolveRelativeLinks } from './remark-resolve-relative-links.js';

const generator = createGenerator({
  tsconfigPath: '../../tsconfig.docs.json',
});

export const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    postprocess: {
      includeProcessedMarkdown: {
        stringify: (...stringifyArguments) => llmStringifyMdx(...stringifyArguments),
      },
    },
  },
});

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [[remarkAutoTypeTable, { generator }], remarkMdxMermaid, remarkResolveRelativeLinks],
    remarkCodeTabOptions: {
      parseMdx: true,
    },
    rehypeCodeOptions: {
      themes: {
        light: 'github-light',
        dark: 'github-dark',
      },
      defaultColor: false,
      inline: 'tailing-curly-colon',
      langs: tauCustomShikiLanguages,
    },
  },
});
