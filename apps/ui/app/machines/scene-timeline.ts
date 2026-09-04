import type { ProgressiveSceneUpdate, SceneBookmark } from '@taucad/runtime';

type SceneDigest = Extract<ProgressiveSceneUpdate, { readonly type: 'reset' }>['sceneDigest'];

export type SceneTimelineStreamState = 'idle' | 'live' | 'recovering' | 'complete' | 'failed' | 'cancelled';
export type SceneTimelineEntryAvailability = 'memory' | 'retained' | 'rehydrating' | 'unavailable';

export type SceneTimelineArtifactSave =
  | { readonly status: 'idle' }
  | { readonly status: 'saving'; readonly sequence: number }
  | { readonly status: 'saved'; readonly sequence: number; readonly path: string }
  | { readonly status: 'failed'; readonly sequence: number; readonly message: string };

export type SceneTimelineIssue =
  | {
      readonly type: 'sequence-gap';
      readonly expected: number;
      readonly received: number;
    }
  | { readonly type: 'revision-mismatch'; readonly received: number }
  | { readonly type: 'digest-mismatch' }
  | { readonly type: 'snapshot-missing' }
  | { readonly type: 'snapshot-read-failed'; readonly message: string };

export type SceneTimelineEntry = {
  readonly renderId: string;
  readonly sequence: number;
  readonly revision: number;
  readonly sceneDigest: SceneDigest;
  readonly label?: string;
  readonly bookmark?: SceneBookmark;
  readonly availability: SceneTimelineEntryAvailability;
  readonly byteLength: number;
  readonly update?: ProgressiveSceneUpdate;
};

export type SceneTimeline = {
  readonly renderId?: string;
  readonly entries: readonly SceneTimelineEntry[];
  readonly selectedSequence?: number;
  readonly followLive: boolean;
  readonly retainedRange?: { readonly first: number; readonly last: number };
  readonly streamState: SceneTimelineStreamState;
  readonly issue?: SceneTimelineIssue;
  readonly lastSequence?: number;
  readonly latestRevision?: number;
  readonly latestSceneDigest?: SceneDigest;
  readonly retainedBytes: number;
  readonly staleRenderIds: readonly string[];
  /** Authored-project persistence state for the currently selected preview frame. */
  readonly artifactSave: SceneTimelineArtifactSave;
};

export type SceneTimelineLimits = {
  readonly maxEntries: number;
  readonly maxBytes: number;
};

/** One policy for cheap timeline metadata and the smaller materialized-frame residency tier. */
export const defaultSceneResidencyPolicy = {
  maxTimelineEntries: 120,
  maxMaterializedFrames: 24,
  maxBytes: 64 * 1024 * 1024,
} as const;

export const defaultSceneTimelineLimits: SceneTimelineLimits = {
  maxEntries: defaultSceneResidencyPolicy.maxTimelineEntries,
  maxBytes: defaultSceneResidencyPolicy.maxBytes,
};

const staleRenderIdLimit = 16;

export const createSceneTimeline = (): SceneTimeline => ({
  entries: [],
  followLive: true,
  streamState: 'idle',
  retainedBytes: 0,
  staleRenderIds: [],
  artifactSave: { status: 'idle' },
});

const artifactSaveForSelection = (
  timeline: SceneTimeline,
  selectedSequence: number | undefined,
): SceneTimelineArtifactSave =>
  timeline.selectedSequence === selectedSequence ? timeline.artifactSave : { status: 'idle' };

const getUpdateByteLength = (update: ProgressiveSceneUpdate): number => {
  switch (update.type) {
    case 'reset': {
      return update.snapshot.assets.reduce((total, asset) => total + asset.byteLength, 0);
    }
    case 'delta': {
      return update.assets.reduce((total, asset) => total + asset.byteLength, 0);
    }
    case 'refinement': {
      return update.replacements.reduce((total, replacement) => total + replacement.replacement.byteLength, 0);
    }
    case 'bookmark': {
      return 0;
    }
  }
};

const asEntry = (update: Exclude<ProgressiveSceneUpdate, { readonly type: 'bookmark' }>): SceneTimelineEntry => ({
  renderId: update.renderId,
  sequence: update.sequence,
  revision: update.revision,
  sceneDigest: update.sceneDigest,
  availability: 'memory',
  byteLength: getUpdateByteLength(update),
  update,
});

const getRetainedRange = (entries: readonly SceneTimelineEntry[]): SceneTimeline['retainedRange'] => {
  const first = entries.at(0)?.sequence;
  const last = entries.at(-1)?.sequence;
  return first === undefined || last === undefined ? undefined : { first, last };
};

const boundEntries = (
  entries: readonly SceneTimelineEntry[],
  limits: SceneTimelineLimits,
  protectedSequence?: number,
): Pick<SceneTimeline, 'entries' | 'retainedBytes' | 'retainedRange'> => {
  const metadataBounded = entries.slice(-Math.max(1, limits.maxEntries));
  const protectedEntry = entries.find((entry) => entry.sequence === protectedSequence);
  if (protectedEntry && !metadataBounded.some((entry) => entry.sequence === protectedSequence)) {
    metadataBounded.unshift(protectedEntry);
  }
  let retainedBytes = metadataBounded.reduce((total, entry) => total + (entry.update ? entry.byteLength : 0), 0);
  const bounded = [...metadataBounded];

  for (let index = 0; index < bounded.length && retainedBytes > limits.maxBytes; index += 1) {
    const entry = bounded[index];
    if (!entry?.update || entry.sequence === protectedSequence) {
      continue;
    }
    retainedBytes -= entry.byteLength;
    bounded[index] = {
      ...entry,
      availability: entry.bookmark ? 'retained' : 'unavailable',
      update: undefined,
    };
  }

  return {
    entries: bounded,
    retainedBytes,
    retainedRange: getRetainedRange(bounded),
  };
};

const appendFrame = (
  timeline: SceneTimeline,
  update: Exclude<ProgressiveSceneUpdate, { readonly type: 'bookmark' }>,
  limits: SceneTimelineLimits,
): SceneTimeline => {
  const selectedSequence = timeline.followLive ? update.sequence : timeline.selectedSequence;
  const bounded = boundEntries(
    [...timeline.entries, asEntry(update)],
    limits,
    timeline.followLive ? undefined : selectedSequence,
  );
  return {
    ...timeline,
    ...bounded,
    renderId: update.renderId,
    selectedSequence,
    streamState: 'live',
    issue: undefined,
    lastSequence: update.sequence,
    latestRevision: update.revision,
    latestSceneDigest: update.sceneDigest,
    artifactSave: artifactSaveForSelection(timeline, selectedSequence),
  };
};

const rememberStaleRenderId = (timeline: SceneTimeline): readonly string[] => {
  if (!timeline.renderId) {
    return timeline.staleRenderIds;
  }
  return [...timeline.staleRenderIds.filter((id) => id !== timeline.renderId), timeline.renderId].slice(
    -staleRenderIdLimit,
  );
};

const startRender = (
  timeline: SceneTimeline,
  update: Extract<ProgressiveSceneUpdate, { readonly type: 'reset' }>,
  limits: SceneTimelineLimits,
): SceneTimeline =>
  appendFrame(
    {
      ...createSceneTimeline(),
      staleRenderIds: rememberStaleRenderId(timeline),
    },
    update,
    limits,
  );

const markRecovering = (timeline: SceneTimeline, issue: SceneTimelineIssue): SceneTimeline => ({
  ...timeline,
  streamState: 'recovering',
  issue,
});

const hasExpectedSequence = (timeline: SceneTimeline, update: ProgressiveSceneUpdate): boolean =>
  timeline.lastSequence === undefined || update.sequence === timeline.lastSequence + 1;

const appendBookmark = (
  timeline: SceneTimeline,
  update: Extract<ProgressiveSceneUpdate, { readonly type: 'bookmark' }>,
): SceneTimeline => {
  const index = timeline.entries.findLastIndex(
    (entry) => entry.revision === update.revision && entry.sceneDigest === update.bookmark.sceneDigest,
  );
  if (index === -1) {
    return markRecovering(timeline, { type: 'digest-mismatch' });
  }

  const entries = [...timeline.entries];
  const entry = entries[index];
  if (!entry) {
    return timeline;
  }
  entries[index] = {
    ...entry,
    label: update.bookmark.label,
    bookmark: update.bookmark,
    availability: entry.update ? 'memory' : 'retained',
  };
  return {
    ...timeline,
    entries,
    lastSequence: update.sequence,
    issue: undefined,
  };
};

export const appendSceneTimelineUpdate = (
  timeline: SceneTimeline,
  update: ProgressiveSceneUpdate,
  limits: SceneTimelineLimits = defaultSceneTimelineLimits,
): SceneTimeline => {
  if (timeline.staleRenderIds.includes(update.renderId)) {
    return timeline;
  }

  if (timeline.renderId !== update.renderId) {
    return update.type === 'reset' ? startRender(timeline, update, limits) : timeline;
  }

  if (timeline.lastSequence !== undefined && update.sequence <= timeline.lastSequence) {
    return timeline;
  }

  if (update.type === 'reset') {
    return appendFrame(timeline, update, limits);
  }

  if (timeline.streamState === 'recovering') {
    return timeline;
  }

  if (!hasExpectedSequence(timeline, update)) {
    return markRecovering(timeline, {
      type: 'sequence-gap',
      expected: (timeline.lastSequence ?? -1) + 1,
      received: update.sequence,
    });
  }

  if (update.revision !== timeline.latestRevision && update.type !== 'delta') {
    return markRecovering(timeline, { type: 'revision-mismatch', received: update.revision });
  }

  if (update.type === 'bookmark') {
    return appendBookmark(timeline, update);
  }

  if (update.type === 'delta') {
    if (update.baseRevision !== timeline.latestRevision) {
      return markRecovering(timeline, { type: 'revision-mismatch', received: update.baseRevision });
    }
    if (update.baseSceneDigest !== timeline.latestSceneDigest) {
      return markRecovering(timeline, { type: 'digest-mismatch' });
    }
  } else if (update.sceneDigest !== timeline.latestSceneDigest) {
    return markRecovering(timeline, { type: 'digest-mismatch' });
  }

  return appendFrame(timeline, update, limits);
};

export const selectSceneTimelineSequence = (
  timeline: SceneTimeline,
  sequence: number | 'live',
  limits: SceneTimelineLimits = defaultSceneTimelineLimits,
): SceneTimeline => {
  if (sequence === 'live') {
    const selectedSequence = timeline.entries.at(-1)?.sequence;
    return {
      ...timeline,
      ...boundEntries(timeline.entries, limits),
      selectedSequence,
      followLive: true,
      artifactSave: artifactSaveForSelection(timeline, selectedSequence),
    };
  }

  const entry = timeline.entries.find((candidate) => candidate.sequence === sequence);
  if (!entry) {
    return timeline;
  }
  const entries = timeline.entries.map(
    (candidate): SceneTimelineEntry =>
      candidate.sequence === sequence && !candidate.update && candidate.bookmark
        ? { ...candidate, availability: 'rehydrating' }
        : candidate,
  );
  return {
    ...timeline,
    ...boundEntries(entries, limits, sequence),
    selectedSequence: sequence,
    followLive: false,
    artifactSave: artifactSaveForSelection(timeline, sequence),
  };
};

export const settleSceneTimeline = (
  timeline: SceneTimeline,
  state: Extract<SceneTimelineStreamState, 'complete' | 'failed' | 'cancelled'>,
): SceneTimeline => ({
  ...timeline,
  streamState: timeline.renderId ? state : timeline.streamState,
});

export const rehydrateSceneTimelineEntry = (
  timeline: SceneTimeline,
  input: {
    readonly renderId: string;
    readonly sequence: number;
    readonly revision: number;
    readonly sceneDigest: SceneDigest;
    readonly snapshot: Extract<ProgressiveSceneUpdate, { readonly type: 'reset' }>['snapshot'];
  },
  limits: SceneTimelineLimits = defaultSceneTimelineLimits,
): SceneTimeline => {
  if (timeline.renderId !== input.renderId) {
    return timeline;
  }
  const update: ProgressiveSceneUpdate = {
    type: 'reset',
    renderId: input.renderId,
    sequence: input.sequence,
    revision: input.revision,
    sceneDigest: input.sceneDigest,
    snapshot: input.snapshot,
    skippedBefore: 0,
  };
  const entries = timeline.entries.map((entry): SceneTimelineEntry => {
    if (entry.sequence !== input.sequence) {
      return entry;
    }
    return {
      ...entry,
      availability: 'memory',
      byteLength: getUpdateByteLength(update),
      update,
    };
  });
  return {
    ...timeline,
    ...boundEntries(
      entries,
      limits,
      timeline.selectedSequence === input.sequence && !timeline.followLive ? input.sequence : timeline.selectedSequence,
    ),
    issue: undefined,
  };
};

export const clearSceneTimeline = (timeline: SceneTimeline): SceneTimeline => ({
  ...createSceneTimeline(),
  staleRenderIds: rememberStaleRenderId(timeline),
});
