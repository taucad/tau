import { describe, expect, it } from 'vitest';
import { contentDigest } from '@taucad/cache-core';
import { revisionId } from '@taucad/filesystem/revisions';

import type { JobAcceptedEvent, JobLifecycleEvent } from '#jobs/job-reducer.js';
import { reduceJobSnapshot } from '#jobs/job-reducer.js';

const digest = contentDigest({ value: `sha256:${'a'.repeat(64)}` });
const accepted: JobAcceptedEvent = {
  type: 'job-accepted',
  revision: 1,
  reference: { hostId: 'host-a', jobId: 'job-a' },
  provider: { id: 'openfoam.case', version: '1.0.0', manifestDigest: digest },
  input: {
    revision: {
      authorityId: 'authority-a',
      workspaceId: 'workspace-a',
      revisionId: revisionId('revision-a'),
      treeDigest: digest,
    },
    paths: ['case/controlDict'],
  },
  configuration: { value: { viscosity: 0.001 }, digest, providerManifestDigest: digest },
};

const transition = (revision: number, state: JobLifecycleEvent['state']): JobLifecycleEvent => ({
  type: 'job-lifecycle-changed',
  revision,
  reference: accepted.reference,
  state,
});

describe('reduceJobSnapshot', () => {
  it('projects acceptance as queued rather than another lifecycle state', () => {
    expect(reduceJobSnapshot(undefined, accepted)).toMatchObject({ revision: 1, state: 'queued' });
    expect(() => reduceJobSnapshot(undefined, { ...accepted, revision: 2 })).toThrow('revision 1');
  });

  it('reduces an ordered nonterminal lifecycle into a terminal state', () => {
    const queued = reduceJobSnapshot(undefined, accepted);
    const running = reduceJobSnapshot(queued, transition(2, 'running'));
    const completed = reduceJobSnapshot(running, transition(3, 'completed'));

    expect(completed).toMatchObject({ revision: 3, state: 'completed' });
    expect(queued).toMatchObject({ revision: 1, state: 'queued' });
  });

  it.each([
    ['a revision gap', transition(3, 'running')],
    ['a cross-host reference', { ...transition(2, 'running'), reference: { hostId: 'host-b', jobId: 'job-a' } }],
    ['a cross-job reference', { ...transition(2, 'running'), reference: { hostId: 'host-a', jobId: 'job-b' } }],
  ])('rejects %s', (_name, event) => {
    expect(() => reduceJobSnapshot(reduceJobSnapshot(undefined, accepted), event)).toThrow(TypeError);
  });

  it('rejects duplicate acceptance and terminal rewrites', () => {
    const queued = reduceJobSnapshot(undefined, accepted);
    expect(() => reduceJobSnapshot(queued, accepted)).toThrow('more than once');

    const running = reduceJobSnapshot(queued, transition(2, 'running'));
    const failed = reduceJobSnapshot(running, transition(3, 'failed'));
    expect(() => reduceJobSnapshot(failed, transition(4, 'queued'))).toThrow('Unsupported');
  });

  it('permits explicit waiting and attention-required recovery paths', () => {
    const queued = reduceJobSnapshot(undefined, accepted);
    const waiting = reduceJobSnapshot(queued, transition(2, 'waiting'));
    const attention = reduceJobSnapshot(waiting, transition(3, 'attention_required'));
    const resumed = reduceJobSnapshot(attention, transition(4, 'queued'));

    expect(resumed.state).toBe('queued');
  });

  it.each(['waiting', 'attention_required'] as const)(
    'permits reconciliation from %s directly to completed',
    (ambiguousState) => {
      const queued = reduceJobSnapshot(undefined, accepted);
      const ambiguous = reduceJobSnapshot(queued, transition(2, ambiguousState));

      expect(reduceJobSnapshot(ambiguous, transition(3, 'completed')).state).toBe('completed');
    },
  );

  it('owns and deeply freezes accepted event payloads', () => {
    const reference = { hostId: 'host-a', jobId: 'job-a' };
    const paths = ['case/controlDict'];
    const mutable: JobAcceptedEvent = {
      ...accepted,
      reference,
      input: { ...accepted.input, paths },
    };
    const snapshot = reduceJobSnapshot(undefined, mutable);
    reference.jobId = 'rewritten';
    paths[0] = 'rewritten';

    expect(snapshot.reference.jobId).toBe('job-a');
    expect(snapshot.input.paths).toEqual(['case/controlDict']);
    expect(Object.isFrozen(snapshot.input.revision)).toBe(true);
    expect(Object.isFrozen(snapshot.configuration.value)).toBe(true);
  });
});
