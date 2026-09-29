import { queryDirectAp242MinimumDistance } from '@taucad/agent-tools/geospec';
import { exactResponseFromNative } from './measurement-exact.response.js';

export type ExactRequest = {
  readonly id: number;
  readonly source: {
    readonly format: 'ap242';
    readonly bytes: Uint8Array<ArrayBuffer>;
    readonly coordinateSystem: 'y-up';
  };
  readonly occurrences: readonly [{ readonly name: string }, { readonly name: string }];
};
export type ExactResponse =
  | {
      id: number;
      status: 'cad-geometry';
      distanceMeters: number;
      pointAMeters: [number, number, number];
      pointBMeters: [number, number, number];
      source: 'ap242';
    }
  | { id: number; status: 'unavailable'; reason: string };

type ExactEngine = Parameters<typeof queryDirectAp242MinimumDistance>[0]['engine'] & { close(): void };

/** Run the exact native AP242 query in this browser worker, not the renderer. */
export async function evaluateExactOccurrenceDistance(
  request: ExactRequest,
  initialize: () => Promise<ExactEngine> = async () => {
    const native = await import('@taucad/geospec-engine-native');
    await native.initialize();
    return new native.Engine();
  },
): Promise<ExactResponse> {
  try {
    const engine = await initialize();
    try {
      const result = await queryDirectAp242MinimumDistance({
        engine,
        ap242Bytes: request.source.bytes,
        nameA: request.occurrences[0].name,
        nameB: request.occurrences[1].name,
      });
      return exactResponseFromNative(request.id, result);
    } finally {
      engine.close();
    }
  } catch (error) {
    return {
      id: request.id,
      status: 'unavailable',
      reason: error instanceof Error ? error.message : 'Exact AP242 query failed.',
    };
  }
}

if (!('document' in globalThis) && typeof globalThis.postMessage === 'function') {
  globalThis.addEventListener('message', async (event: MessageEvent<ExactRequest>) => {
    const result = await evaluateExactOccurrenceDistance(event.data);
    globalThis.postMessage(result);
  });
}
