import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createSectionLoopSlicer } from '#graphics/three/utils/section-loop-slicer.js';
import type { SectionLoopParticipantInput } from '#graphics/three/utils/section-loop-slicer.js';

const participantOf = (geometry: THREE.BufferGeometry, matrix = new THREE.Matrix4()): SectionLoopParticipantInput => ({
  positions: Float32Array.from(geometry.getAttribute('position').array),
  index: Uint32Array.from(geometry.getIndex()!.array),
  localToSource: matrix.toArray(),
});

describe('createSectionLoopSlicer', () => {
  it('should slice a source of several meshes in the source frame, through its tree', () => {
    const slicer = createSectionLoopSlicer();
    slicer.prepare({
      sourceKey: 'source',
      signature: 'a',
      participants: [
        participantOf(new THREE.BoxGeometry(2, 2, 2)),
        // A second box, moved into the source frame by its matrix.
        participantOf(new THREE.BoxGeometry(2, 2, 2, 8, 8, 8), new THREE.Matrix4().makeTranslation(5, 0, 0)),
      ],
    });

    const result = slicer.slice({ sourceKey: 'source', signature: 'a', plane: [0, 0, 1, 0.25] });

    expect(result).toMatchObject({ status: 'ready' });
    if (result.status !== 'ready') {
      return;
    }
    expect(result.slice.closedLoops).toHaveLength(2);
    expect(result.slice.openChains).toHaveLength(0);
    const xs = result.slice.closedLoops.map((loop) => Math.max(...loop.filter((_value, index) => index % 3 === 0)));
    expect(xs.sort((left, right) => left - right)).toEqual([1, 6]);
    // The tree finds the triangles near the plane, not all 20 of the coarse box's and 776 of the fine one's.
    expect(result.candidateCount).toBeLessThan(12 + 6 * 8 * 8 * 2);
  });

  it('should ask for a source it does not hold at the requested signature, and forget a released one', () => {
    const slicer = createSectionLoopSlicer();
    const request = { sourceKey: 'source', signature: 'a', plane: [0, 0, 1, 0] } as const;
    expect(slicer.slice(request)).toEqual({ status: 'missing' });

    slicer.prepare({ sourceKey: 'source', signature: 'a', participants: [participantOf(new THREE.BoxGeometry())] });
    expect(slicer.slice({ ...request, signature: 'b' })).toEqual({ status: 'missing' });
    expect(slicer.slice(request).status).toBe('ready');

    slicer.release('source');
    expect(slicer.slice(request)).toEqual({ status: 'missing' });
  });
});
