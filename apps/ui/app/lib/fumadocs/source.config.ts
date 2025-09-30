import { defineConfig, defineDocs, frontmatterSchema, metaSchema, type DocsCollection, type GlobalConfig } from 'fumadocs-mdx/config';

export const docs: DocsCollection<typeof frontmatterSchema, typeof metaSchema> = defineDocs({
  dir: 'content/docs',
  docs: {
    postprocess: {
      includeProcessedMarkdown: true,
    }
  }
});

export default defineConfig() as GlobalConfig;
