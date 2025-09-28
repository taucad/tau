import { defineConfig, defineDocs, frontmatterSchema, metaSchema, type DocsCollection, type GlobalConfig } from 'fumadocs-mdx/config';

export const docs: DocsCollection<typeof frontmatterSchema, typeof metaSchema> = defineDocs({
  dir: 'content/docs',
});

export default defineConfig() as GlobalConfig;
