import { buildSectionCanonicalTopologyWorkerResult } from '#components/geometry/graphics/three/utils/section-surface-topology.js';
import type {
  SectionCanonicalTopologyWorkerInput,
  SectionCanonicalTopologyWorkerResult,
} from '#components/geometry/graphics/three/utils/section-surface-topology.js';

type SectionTopologyWorkerMessage = Readonly<{ id: number; input: SectionCanonicalTopologyWorkerInput }>;
type SectionTopologyWorkerScope = Readonly<{
  addEventListener(type: 'message', listener: (event: MessageEvent<SectionTopologyWorkerMessage>) => void): void;
  postMessage(
    message: Readonly<{ id: number; result: SectionCanonicalTopologyWorkerResult }>,
    transfer: Transferable[],
  ): void;
}>;

const workerScope = globalThis as unknown as SectionTopologyWorkerScope;

workerScope.addEventListener('message', (event) => {
  const result = buildSectionCanonicalTopologyWorkerResult(event.data.input);
  const transfer =
    result.status === 'ready'
      ? [
          result.representativeVertices.buffer,
          result.triangleEdges.buffer,
          result.edges.buffer,
          ...result.components.flatMap((component) => [component.triangles.buffer, component.edges.buffer]),
        ]
      : [];
  workerScope.postMessage({ id: event.data.id, result }, transfer);
});
