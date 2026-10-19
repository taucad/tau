import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createSectionLoopClient } from '#graphics/three/utils/section-loop-client.js';
import type {
  SectionLoopWorkerPort,
  SectionLoopWorkerRequest,
  SectionLoopWorkerResponse,
} from '#graphics/three/utils/section-loop-client.js';
import { createSectionLoopSlicer } from '#graphics/three/utils/section-loop-slicer.js';
import type { SectionLoopSourceInput } from '#graphics/three/utils/section-loop-slicer.js';

const sourceInput = (): SectionLoopSourceInput => {
  const geometry = new THREE.BoxGeometry(2, 2, 2);
  return {
    sourceKey: 'source',
    signature: 'a',
    participants: [
      {
        positions: Float32Array.from(geometry.getAttribute('position').array),
        index: Uint32Array.from(geometry.getIndex()!.array),
        localToSource: new THREE.Matrix4().toArray(),
      },
    ],
  };
};

/** A worker double that answers with a real slicer, and can lose its state as a restarted worker does. */
const createWorkerDouble = () => {
  let slicer = createSectionLoopSlicer();
  const kinds: Array<SectionLoopWorkerRequest['loops']['kind']> = [];
  let onMessage: ((event: Event) => void) | undefined;
  const port: SectionLoopWorkerPort = {
    postMessage({ id, loops }) {
      kinds.push(loops.kind);
      let result: SectionLoopWorkerResponse['result'];
      if (loops.kind === 'prepare') {
        result = { kind: 'prepared', milliseconds: slicer.prepare(loops.input) };
      } else if (loops.kind === 'slice') {
        result = { kind: 'sliced', result: slicer.slice(loops.request) };
      } else {
        slicer.release(loops.sourceKey);
        result = { kind: 'released' };
      }
      queueMicrotask(() => onMessage?.(new MessageEvent('message', { data: { id, result } })));
    },
    terminate: vi.fn(),
    addEventListener(type, listener) {
      if (type === 'message') {
        onMessage = listener;
      }
    },
  };
  return {
    port,
    kinds,
    forget() {
      slicer = createSectionLoopSlicer();
    },
  };
};

const request = { sourceKey: 'source', signature: 'a', plane: [0, 0, 1, 0] } as const;

describe('createSectionLoopClient', () => {
  it('should send a source once, then only planes', async () => {
    const worker = createWorkerDouble();
    const client = createSectionLoopClient(() => worker.port);
    const readSource = vi.fn(sourceInput);

    const first = await client.slice(request, readSource);
    const second = await client.slice({ ...request, plane: [0, 0, 1, 0.5] }, readSource);

    expect(first.slice.closedLoops).toHaveLength(1);
    expect(first.prepareMilliseconds).toBeTypeOf('number');
    expect(second.slice.closedLoops).toHaveLength(1);
    expect(second.prepareMilliseconds).toBeUndefined();
    expect(readSource).toHaveBeenCalledTimes(1);
    expect(worker.kinds).toEqual(['prepare', 'slice', 'slice']);
    client.dispose();
  });

  it('should send the source again when the worker no longer holds it', async () => {
    const worker = createWorkerDouble();
    const client = createSectionLoopClient(() => worker.port);
    await client.slice(request, sourceInput);
    worker.forget();

    const result = await client.slice({ ...request, plane: [0, 0, 1, 0.5] }, sourceInput);

    expect(result.slice.closedLoops).toHaveLength(1);
    expect(worker.kinds).toEqual(['prepare', 'slice', 'slice', 'prepare', 'slice']);
    client.dispose();
  });

  it('should slice in-process where no worker can start', async () => {
    const client = createSectionLoopClient(() => undefined);

    const result = await client.slice(request, sourceInput);

    expect(result).toMatchObject({ status: 'ready' });
    expect(result.slice.closedLoops).toHaveLength(1);
    client.dispose();
  });
});
