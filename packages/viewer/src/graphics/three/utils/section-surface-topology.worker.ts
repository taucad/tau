import { censusSectionSurfaceClosure } from '#graphics/three/utils/section-surface-closure.js';
import type { SectionClosureCensus } from '#graphics/three/utils/section-surface-closure.js';
import type { SectionClosureWorkerInput } from '#graphics/three/utils/section-surface-topology.js';
import { createSectionLoopSlicer } from '#graphics/three/utils/section-loop-slicer.js';
import type { SectionLoopWorkerRequest, SectionLoopWorkerResponse } from '#graphics/three/utils/section-loop-client.js';

type SectionTopologyWorkerMessage = Readonly<{ id: number; input: SectionClosureWorkerInput }>;
type SectionTopologyWorkerScope = Readonly<{
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<SectionTopologyWorkerMessage | SectionLoopWorkerRequest>) => void,
  ): void;
  postMessage(
    message: Readonly<{ id: number; result: SectionClosureCensus }> | SectionLoopWorkerResponse,
    transfer: Transferable[],
  ): void;
}>;

const workerScope = globalThis as unknown as SectionTopologyWorkerScope;
const loopSlicer = createSectionLoopSlicer();

workerScope.addEventListener('message', (event) => {
  const { data } = event;
  if ('loops' in data) {
    const { id, loops } = data;
    if (loops.kind === 'prepare') {
      workerScope.postMessage({ id, result: { kind: 'prepared', milliseconds: loopSlicer.prepare(loops.input) } }, []);
    } else if (loops.kind === 'release') {
      loopSlicer.release(loops.sourceKey);
      workerScope.postMessage({ id, result: { kind: 'released' } }, []);
    } else {
      const result = loopSlicer.slice(loops.request);
      const transfer =
        result.status === 'ready'
          ? [
              result.slice.fill.buffer,
              result.slice.openTriangles.buffer,
              ...result.slice.closedLoops.map((loop) => loop.buffer),
              ...result.slice.openChains.map((chain) => chain.buffer),
            ]
          : [];
      workerScope.postMessage({ id, result: { kind: 'sliced', result } }, transfer);
    }
    return;
  }
  workerScope.postMessage({ id: data.id, result: censusSectionSurfaceClosure(data.input) }, []);
});
