// @vitest-environment jsdom
/**
 * `turn.conflicted` and `turn.failed` reach a person (W5 review R5, A4).
 *
 * Both are published by every host in the same schema as `turn.finalized`, and
 * before this they were read by nothing: a turn that recorded no revision was
 * silent on browser and desktop alike. The pin is the notice.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render } from '@testing-library/react';
import { revisionStatusHarness } from '#hooks/use-revision-status.test-harness.js';
import {
  clearTurnOutcome,
  RevisionOutcomes,
  useLatestTurnOutcome,
} from '#routes/w.$workspace.$project/revision-outcomes.js';
import type { WorkerRevisionEvent } from '#machines/file-manager.worker.revisions.js';

const listeners = new Set<(event: WorkerRevisionEvent) => void>();
const publish = (event: WorkerRevisionEvent): void => {
  /* The port delivers outside React's own work loop, which is exactly how it
   * arrives in the product. */
  act(() => {
    for (const listener of listeners) {
      listener(event);
    }
  });
};

vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ projectId: 'p' }) }));

vi.mock('#hooks/use-revision-status.js', async () => {
  const harness = await import('#hooks/use-revision-status.test-harness.js');
  const base = harness.revisionStatusMock();
  return {
    ...base,
    useRevisionClient: () => ({
      ...(base['useRevisionClient'] as () => Record<string, unknown>)(),
      subscribeEvents: (listener: (event: WorkerRevisionEvent) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    }),
  };
});

const errors: Array<{ title: string; description?: string }> = [];
vi.mock('#components/ui/sonner.js', () => ({
  toast: {
    error: (title: string, options?: { description?: string }) => {
      errors.push({ title, ...(options?.description === undefined ? {} : { description: options.description }) });
    },
  },
}));

/** Reads the same store the pane's attention line reads. */
function Latest(): React.JSX.Element {
  const outcome = useLatestTurnOutcome();
  return <span data-testid='latest'>{outcome === undefined ? 'none' : `${outcome.kind}:${outcome.turnId}`}</span>;
}

beforeEach(() => {
  revisionStatusHarness.reset();
  errors.length = 0;
  clearTurnOutcome();
});

afterEach(() => {
  listeners.clear();
});

describe('RevisionOutcomes', () => {
  it('says so when a turn ends without recording anything', () => {
    const { getByTestId } = render(
      <>
        <RevisionOutcomes />
        <Latest />
      </>,
    );

    publish({
      type: 'turn.failed',
      turnId: 'turn-1',
      runId: 'run-1',
      chatId: 'chat-1',
      checkoutId: 'live',
      reason: 'The turn ended before it recorded a revision.',
    });

    expect(errors).toEqual([
      {
        title: 'Nothing was saved for that change',
        description: 'The turn ended before it recorded a revision.',
      },
    ]);
    expect(getByTestId('latest')).toHaveTextContent('failed:turn-1');
  });

  it('says so when a turn conflicts, in document words', () => {
    const { getByTestId } = render(
      <>
        <RevisionOutcomes />
        <Latest />
      </>,
    );

    publish({ type: 'turn.conflicted', turnId: 'turn-2', runId: 'run-2', chatId: 'chat-1', checkoutId: 'live' });

    expect(errors).toHaveLength(1);
    expect(errors[0]?.title).toBe('That change needs your attention');
    expect(`${errors[0]?.title ?? ''} ${errors[0]?.description ?? ''}`).not.toMatch(/merge conflict|branch|HEAD/iu);
    expect(getByTestId('latest')).toHaveTextContent('conflicted:turn-2');
  });

  it('stays quiet for the outcome that did record a revision', () => {
    const { getByTestId } = render(
      <>
        <RevisionOutcomes />
        <Latest />
      </>,
    );

    publish({
      type: 'turn.finalized',
      turnId: 'turn-3',
      runId: 'run-3',
      chatId: 'chat-1',
      projectId: 'p',
      checkoutId: 'live',
      revisionId: 'rev-1',
      changedPaths: [],
      trigger: 'turn',
      runIds: ['run-3'],
    });

    expect(errors).toEqual([]);
    expect(getByTestId('latest')).toHaveTextContent('none');
  });
});
