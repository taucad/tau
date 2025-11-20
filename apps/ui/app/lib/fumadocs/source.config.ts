import type { frontmatterSchema, metaSchema, DocsCollection } from 'fumadocs-mdx/config';
import { defineConfig, defineDocs } from 'fumadocs-mdx/config';

// Note: The icon field is automatically supported in fumadocs frontmatter schema
// Icons are passed as strings (e.g., "lucide:home", "lib:openscad") and resolved in the sidebar

export const docs: DocsCollection<typeof frontmatterSchema, typeof metaSchema> = defineDocs({
  dir: 'content/docs',
  docs: {
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
});

export default defineConfig();
