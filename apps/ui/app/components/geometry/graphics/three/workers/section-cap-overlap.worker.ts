import { computeSectionCapWorkerResponse } from '#components/geometry/graphics/three/utils/section-cap-overlap-worker-job.js';
import { getSectionCapWorkerBooleanOperations } from '#components/geometry/graphics/three/utils/section-cap-overlap-worker-backend.js';
import { transferablesForSectionCapWorkerResponse } from '#components/geometry/graphics/three/utils/section-cap-overlap-worker-protocol.js';
import type {
  SectionCapWorkerErrorResponse,
  SectionCapWorkerRequest,
  SectionCapWorkerResponse,
} from '#components/geometry/graphics/three/utils/section-cap-overlap-worker-protocol.js';

type SectionCapWorkerGlobal = Readonly<{
  addEventListener(type: 'message', listener: (event: MessageEvent<SectionCapWorkerRequest>) => void): void;
  postMessage(response: SectionCapWorkerResponse, transfer?: Transferable[]): void;
}>;

const context = globalThis as unknown as SectionCapWorkerGlobal;

const handleMessage = async (event: MessageEvent<SectionCapWorkerRequest>): Promise<void> => {
  const request = event.data;
  try {
    const booleanOperations = await getSectionCapWorkerBooleanOperations();
    const response = computeSectionCapWorkerResponse(request, { booleanOperations });
    context.postMessage(response, transferablesForSectionCapWorkerResponse(response));
  } catch (error) {
    const response: SectionCapWorkerErrorResponse = {
      type: 'error',
      sequence: request.sequence,
      requestKey: request.requestKey,
      planeKey: request.planeKey,
      sourceSetKey: request.sourceSetKey,
      message: error instanceof Error ? error.message : 'Unknown section cap overlap worker failure.',
    };
    context.postMessage(response);
  }
};

context.addEventListener('message', (event: MessageEvent<SectionCapWorkerRequest>) => {
  void handleMessage(event);
});
