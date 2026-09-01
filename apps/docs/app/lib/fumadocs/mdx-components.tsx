import type { MDXComponents } from 'mdx/types.js';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import { TypeTable } from 'fumadocs-ui/components/type-table';
import { InteractiveDiagram } from '#components/docs/interactive-diagram.lazy.js';
import { Mermaid } from '#components/docs/mermaid.js';
import { ReplicadReference } from '#components/docs/replicad-reference.js';

export const getMdxComponents = (): MDXComponents => ({
  ...defaultMdxComponents,
  TypeTable,
  Mermaid,
  InteractiveDiagram,
  ReplicadReference,
});
