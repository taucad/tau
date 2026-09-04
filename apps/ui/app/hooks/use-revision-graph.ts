import { useCallback, useMemo } from 'react';
import { useRevisionActor } from '#routes/w.$workspace.$project/revision-provider.js';
import type { PersistedRevisionConflict } from '#types/revision.types.js';

export type RevisionGraphActions = {
  readonly editSummary: (turnId: string, summary: string) => void;
  readonly associateJob: (turnId: string, jobId: string) => void;
  readonly setConflict: (turnId: string, conflict?: PersistedRevisionConflict) => void;
};

/** Typed mutation seams for revision metadata and external job/merge adapters. */
export const useRevisionGraphActions = (): RevisionGraphActions => {
  const actor = useRevisionActor();
  const editSummary = useCallback(
    (turnId: string, summary: string) => {
      actor.send({ type: 'EDIT_SUMMARY', turnId, summary });
    },
    [actor],
  );
  const associateJob = useCallback(
    (turnId: string, jobId: string) => {
      actor.send({ type: 'ASSOCIATE_JOB', turnId, jobId });
    },
    [actor],
  );
  const setConflict = useCallback(
    (turnId: string, conflict?: PersistedRevisionConflict) => {
      actor.send({ type: 'SET_REVISION_CONFLICT', turnId, ...(conflict === undefined ? {} : { conflict }) });
    },
    [actor],
  );
  return useMemo(() => ({ editSummary, associateJob, setConflict }), [editSummary, associateJob, setConflict]);
};
