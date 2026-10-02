import type { MDXComponents } from 'mdx/types.js';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import { TypeTable } from 'fumadocs-ui/components/type-table';
import { InteractiveDiagram } from '#components/docs/interactive-diagram.lazy.js';
import { Mermaid } from '#components/docs/mermaid.js';
import { ReplicadReference } from '#components/docs/replicad-reference.js';

export const getMdxComponents = (): MDXComponents => ({
  ...defaultMdxComponents,
  table: (props) => (
    <div
      role='region'
      aria-label='Documentation table'
      tabIndex={0}
      className='relative my-6 prose-no-margin overflow-auto'
    >
      <table {...props} />
    </div>
  ),
  TypeTable,
  Mermaid,
  InteractiveDiagram,
  ReplicadReference,
});
