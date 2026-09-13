import defaultMdxComponents from 'fumadocs-ui/mdx';
import { TypeTable } from 'fumadocs-ui/components/type-table';
import type { MDXComponents } from 'mdx/types';

export const getMDXComponents = (components?: MDXComponents): MDXComponents => ({
  ...defaultMdxComponents,
  TypeTable,
  ...components,
});
