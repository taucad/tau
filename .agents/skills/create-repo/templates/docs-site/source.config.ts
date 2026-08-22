import { defineConfig, defineDocs } from 'fumadocs-mdx/config';
import { createGenerator, remarkAutoTypeTable } from 'fumadocs-typescript';

const generator = createGenerator({ tsconfigPath: './tsconfig.json' });

export const docs = defineDocs({ dir: 'content/docs' });

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [[remarkAutoTypeTable, { generator }]],
  },
});
