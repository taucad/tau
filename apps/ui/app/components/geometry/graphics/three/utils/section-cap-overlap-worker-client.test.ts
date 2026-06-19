// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createSectionCapOverlapWorkerClient } from '#components/geometry/graphics/three/utils/section-cap-overlap-worker-client.js';
import type {
  SectionCapWorkerRequest,
  SectionCapWorkerResponse,
} from '#components/geometry/graphics/three/utils/section-cap-overlap-worker-protocol.js';

class FakeSectionCapWorker extends EventTarget {
  public postMessage = vi.fn();
  public terminate = vi.fn();

  public dispatchResponse(response: SectionCapWorkerResponse): void {
    this.dispatchEvent(new MessageEvent('message', { data: response }));
  }
}

const minimalRequest = (): SectionCapWorkerRequest => ({
  type: 'compute',
  sequence: 1,
  requestKey: 'request',
  planeKey: 'plane',
  sourceSetKey: 'sources',
  basis: {
    origin: [0, 0, 0],
    normal: [0, 0, 1],
    u: [1, 0, 0],
    v: [0, 1, 0],
    planeKey: 'plane',
    normalizationOffset: [0, 0],
    normalizationScale: 1,
  },
  sourceKeys: [],
  ownerKeys: [],
  geometryKeys: [],
  trueCut: new Uint8Array(),
  areas: new Float64Array(),
  bboxes: new Float64Array(),
  meshWorldInverses: new Float64Array(),
  sourcePolygonOffsets: new Uint32Array([0]),
  polygonRingOffsets: new Uint32Array([0]),
  ringPointOffsets: new Uint32Array([0]),
  points: new Float64Array(),
});

describe('createSectionCapOverlapWorkerClient', () => {
  it('should post requests, forward responses, and terminate on dispose', () => {
    const worker = new FakeSectionCapWorker();
    const onResponse = vi.fn();
    const onError = vi.fn();
    const client = createSectionCapOverlapWorkerClient({
      createWorker: () => worker as unknown as Worker,
      onResponse,
      onError,
    });
    const request = minimalRequest();

    client.post(request, [request.points.buffer]);
    worker.dispatchResponse({
      type: 'error',
      sequence: 1,
      requestKey: 'request',
      planeKey: 'plane',
      sourceSetKey: 'sources',
      message: 'expected test response',
    });
    client.dispose();

    expect(worker.postMessage).toHaveBeenCalledWith(request, [request.points.buffer]);
    expect(onResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        message: 'expected test response',
      }),
    );
    expect(onError).not.toHaveBeenCalled();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
});
