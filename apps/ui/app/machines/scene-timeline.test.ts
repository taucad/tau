// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ProgressiveSceneUpdate, ResolvedSceneSnapshot, SceneNodeId } from '@taucad/runtime';
import {
  appendSceneTimelineUpdate,
  createSceneTimeline,
  rehydrateSceneTimelineEntry,
  selectSceneTimelineSequence,
} from '#machines/scene-timeline.js';

type ResetUpdate = Extract<ProgressiveSceneUpdate, { readonly type: 'reset' }>;
type SceneDigest = ResetUpdate['sceneDigest'];

const sceneDigest = (value: string): SceneDigest => value as SceneDigest;
const nodeId = (value: string): SceneNodeId => value as SceneNodeId;
const transform = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const;

const snapshot = (id: string, bytes = 1): ResolvedSceneSnapshot => ({
  manifest: {
    schemaVersion: 1,
    rootNodeIds: [nodeId(id)],
    nodes: {
      [id]: { id: nodeId(id), childIds: [], transform, visible: true },
    },
    presentation: {},
  },
  assets:
    bytes === 0
      ? []
      : [
          {
            contentDigest: `asset-${id}` as ResolvedSceneSnapshot['assets'][number]['contentDigest'],
            mediaType: 'model/gltf-binary',
            byteLength: bytes,
            geometry: { format: 'gltf', content: new Uint8Array(bytes) },
          },
        ],
});

const reset = (options: {
  renderId: string;
  sequence: number;
  revision?: number;
  id?: string;
  bytes?: number;
}): ResetUpdate => ({
  type: 'reset',
  renderId: options.renderId,
  sequence: options.sequence,
  revision: options.revision ?? options.sequence,
  sceneDigest: sceneDigest(`scene-${options.renderId}-${options.revision ?? options.sequence}`),
  snapshot: snapshot(options.id ?? options.renderId, options.bytes),
  skippedBefore: 0,
});

describe('scene timeline', () => {
  it('follows new frames, pauses when scrubbed, and resumes at Live', () => {
    let timeline = createSceneTimeline();
    timeline = appendSceneTimelineUpdate(timeline, reset({ renderId: 'render-a', sequence: 0 }));
    timeline = appendSceneTimelineUpdate(timeline, reset({ renderId: 'render-a', sequence: 1 }));

    expect(timeline.selectedSequence).toBe(1);
    expect(timeline.followLive).toBe(true);

    timeline = selectSceneTimelineSequence(timeline, 0);
    timeline = appendSceneTimelineUpdate(timeline, reset({ renderId: 'render-a', sequence: 2 }));

    expect(timeline.selectedSequence).toBe(0);
    expect(timeline.followLive).toBe(false);

    timeline = selectSceneTimelineSequence(timeline, 'live');
    expect(timeline.selectedSequence).toBe(2);
    expect(timeline.followLive).toBe(true);
  });

  it('starts a new branch only from reset and rejects stale render updates', () => {
    let timeline = appendSceneTimelineUpdate(createSceneTimeline(), reset({ renderId: 'render-a', sequence: 0 }));
    timeline = appendSceneTimelineUpdate(timeline, reset({ renderId: 'render-b', sequence: 0 }));
    timeline = appendSceneTimelineUpdate(timeline, reset({ renderId: 'render-a', sequence: 1 }));

    expect(timeline.renderId).toBe('render-b');
    expect(timeline.entries.map((entry) => entry.renderId)).toEqual(['render-b']);
  });

  it('enters recovery on a sequence gap and accepts a later reset as resynchronisation', () => {
    let timeline = appendSceneTimelineUpdate(createSceneTimeline(), reset({ renderId: 'render-a', sequence: 0 }));
    const gap: ProgressiveSceneUpdate = {
      type: 'delta',
      renderId: 'render-a',
      sequence: 2,
      baseRevision: 0,
      revision: 1,
      baseSceneDigest: sceneDigest('scene-render-a-0'),
      sceneDigest: sceneDigest('scene-render-a-1'),
      operations: [],
      assets: [],
    };

    timeline = appendSceneTimelineUpdate(timeline, gap);
    expect(timeline.streamState).toBe('recovering');
    expect(timeline.issue?.type).toBe('sequence-gap');

    timeline = appendSceneTimelineUpdate(timeline, reset({ renderId: 'render-a', sequence: 3, revision: 2 }));
    expect(timeline.streamState).toBe('live');
    expect(timeline.entries.at(-1)?.sequence).toBe(3);
  });

  it('bounds metadata and retained payload bytes without losing the selected sequence contract', () => {
    let timeline = createSceneTimeline();
    timeline = appendSceneTimelineUpdate(timeline, reset({ renderId: 'render-a', sequence: 0, bytes: 4 }), {
      maxEntries: 2,
      maxBytes: 5,
    });
    timeline = appendSceneTimelineUpdate(timeline, reset({ renderId: 'render-a', sequence: 1, bytes: 4 }), {
      maxEntries: 2,
      maxBytes: 5,
    });
    timeline = appendSceneTimelineUpdate(timeline, reset({ renderId: 'render-a', sequence: 2, bytes: 4 }), {
      maxEntries: 2,
      maxBytes: 5,
    });

    expect(timeline.entries).toHaveLength(2);
    expect(timeline.entries.map((entry) => entry.sequence)).toEqual([1, 2]);
    expect(timeline.entries.filter((entry) => entry.update !== undefined)).toHaveLength(1);
    expect(timeline.retainedBytes).toBe(4);
    expect(timeline.retainedRange).toEqual({ first: 1, last: 2 });
  });

  it('marks a retained bookmark for rehydration and installs its restored snapshot', () => {
    const initial = reset({ renderId: 'render-a', sequence: 0, bytes: 1 });
    let timeline = appendSceneTimelineUpdate(createSceneTimeline(), initial, { maxEntries: 4, maxBytes: 0 });
    timeline = appendSceneTimelineUpdate(timeline, {
      type: 'bookmark',
      renderId: 'render-a',
      sequence: 1,
      revision: 0,
      bookmark: {
        id: 'bookmark-a',
        label: 'Saved stage',
        source: 'explicit',
        sceneDigest: initial.sceneDigest,
        retained: true,
      },
    });
    timeline = selectSceneTimelineSequence(timeline, 0);

    expect(timeline.entries[0]?.availability).toBe('rehydrating');

    timeline = rehydrateSceneTimelineEntry(timeline, {
      renderId: 'render-a',
      sequence: 0,
      revision: 0,
      sceneDigest: initial.sceneDigest,
      snapshot: initial.snapshot,
    });
    expect(timeline.entries[0]?.availability).toBe('memory');
    expect(timeline.entries[0]?.update?.type).toBe('reset');
  });

  it('keeps a restored selected snapshot resident beyond the ordinary metadata and byte budgets', () => {
    const retained = reset({ renderId: 'render-a', sequence: 0, bytes: 4 });
    const limits = { maxEntries: 2, maxBytes: 1 };
    let timeline = appendSceneTimelineUpdate(createSceneTimeline(), retained, limits);
    timeline = appendSceneTimelineUpdate(
      timeline,
      {
        type: 'bookmark',
        renderId: 'render-a',
        sequence: 1,
        revision: 0,
        bookmark: {
          id: 'bookmark-a',
          label: 'Saved stage',
          source: 'explicit',
          sceneDigest: retained.sceneDigest,
          retained: true,
        },
      },
      limits,
    );
    timeline = selectSceneTimelineSequence(timeline, 0);
    timeline = appendSceneTimelineUpdate(timeline, reset({ renderId: 'render-a', sequence: 2, bytes: 4 }), limits);
    timeline = appendSceneTimelineUpdate(timeline, reset({ renderId: 'render-a', sequence: 3, bytes: 4 }), limits);
    timeline = rehydrateSceneTimelineEntry(
      timeline,
      {
        renderId: 'render-a',
        sequence: 0,
        revision: 0,
        sceneDigest: retained.sceneDigest,
        snapshot: retained.snapshot,
      },
      limits,
    );

    expect(timeline.selectedSequence).toBe(0);
    expect(timeline.entries).toHaveLength(3);
    expect(timeline.retainedBytes).toBe(4);
    expect(timeline.entries.find((entry) => entry.sequence === 0)?.update?.type).toBe('reset');

    timeline = selectSceneTimelineSequence(timeline, 'live', limits);
    expect(timeline.selectedSequence).toBe(3);
    expect(timeline.entries.find((entry) => entry.sequence === 0)?.update).toBeUndefined();
  });
});
