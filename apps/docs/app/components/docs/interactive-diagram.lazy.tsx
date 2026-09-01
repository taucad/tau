import { Suspense, lazy } from 'react';
import type { ReactNode } from 'react';
import type { InteractiveDiagramProps } from '#components/docs/interactive-diagram.js';
import { ClientOnly } from '#components/client-only.js';

// One of the documentation pages renders a diagram; a static import here would
// put the whole flow-graph library in the route chunk every page downloads.
const InteractiveDiagramRenderer = lazy(async () => {
  const diagramModule = await import('#components/docs/interactive-diagram.js');
  return { default: diagramModule.InteractiveDiagram };
});

const diagramPlaceholder = (
  <div
    className='my-6 min-h-96 rounded-xl border border-border bg-muted'
    role='status'
    aria-label='Loading interactive diagram'
  />
);

export function InteractiveDiagram(props: InteractiveDiagramProps): ReactNode {
  return (
    <ClientOnly fallback={diagramPlaceholder}>
      <Suspense fallback={diagramPlaceholder}>
        <InteractiveDiagramRenderer {...props} />
      </Suspense>
    </ClientOnly>
  );
}
