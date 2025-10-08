import type { frontmatterSchema, metaSchema, DocsCollection } from 'fumadocs-mdx/config';
import { defineConfig, defineDocs } from 'fumadocs-mdx/config';

export const docs: DocsCollection<typeof frontmatterSchema, typeof metaSchema> = defineDocs({
  dir: 'content/docs',
  docs: {
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
});

export default defineConfig();
