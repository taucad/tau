/* oxlint-disable eslint/no-await-in-loop -- Each retry must wait for the document and projection selected by the previous step. */
import { waitFor } from 'xstate';
import type { ActorRefFrom, SnapshotFrom } from 'xstate';
import { defaultOperationTimeout } from '#constants/editor.constants.js';
import type { cadMachine } from '#machines/cad.machine.js';

/** Timeout while waiting for the CAD unit's current document and default view. */
export class AwaitFreshOperationTimeoutError extends Error {
  public get code(): 'OPERATION_TIMEOUT' {
    return 'OPERATION_TIMEOUT';
  }

  public constructor(milliseconds: number) {
    super(`The current CAD document did not settle within ${milliseconds}ms.`);
    this.name = 'AwaitFreshOperationTimeoutError';
  }
}

export type AwaitFreshRenderOptions = {
  signal?: AbortSignal;
  /** Maximum wall-clock wait in milliseconds. */
  awaitTimeout?: number;
};

/**
 * Wait for the document's current evaluation and its default projection. The
 * document owns freshness and supersession; the actor only supplies the live
 * document and the presentation snapshot returned to existing callers.
 */
export async function awaitFreshRender(
  cadActor: ActorRefFrom<typeof cadMachine>,
  options: AwaitFreshRenderOptions = {},
): Promise<SnapshotFrom<typeof cadMachine>> {
  const milliseconds = options.awaitTimeout ?? defaultOperationTimeout;
  const operationTimeoutController = new AbortController();
  const timeoutId = setTimeout(() => {
    operationTimeoutController.abort(new AwaitFreshOperationTimeoutError(milliseconds));
  }, milliseconds);
  const signal = options.signal
    ? AbortSignal.any([options.signal, operationTimeoutController.signal])
    : operationTimeoutController.signal;

  try {
    for (;;) {
      signal.throwIfAborted();
      const ready = await waitFor(
        cadActor,
        (snapshot) => snapshot.matches('error') || Boolean(snapshot.context.document),
        { signal, timeout: milliseconds + 1000 },
      );
      if (ready.matches('error')) {
        return ready;
      }
      const { document } = ready.context;
      if (!document) {
        continue;
      }

      const evaluated = await document.evaluation({ signal });
      if (evaluated.superseded || cadActor.getSnapshot().context.document !== document) {
        continue;
      }
      if (!evaluated.evaluation.success || evaluated.evaluation.views.length === 0) {
        return cadActor.getSnapshot();
      }

      const withView = await waitFor(
        cadActor,
        (snapshot) =>
          snapshot.matches('error') || snapshot.context.document !== document || Boolean(snapshot.context.defaultView),
        { signal, timeout: milliseconds + 1000 },
      );
      if (withView.matches('error')) {
        return withView;
      }
      const { defaultView } = withView.context;
      if (withView.context.document !== document || !defaultView) {
        continue;
      }

      const projected = await defaultView.rendering({ signal });
      if (projected.superseded || cadActor.getSnapshot().context.document !== document) {
        continue;
      }
      const presented = await waitFor(
        cadActor,
        (snapshot) =>
          snapshot.context.document !== document ||
          (snapshot.context.lastProjection?.requestId === projected.rendering.requestId &&
            snapshot.context.lastProjection.evaluationId === projected.rendering.evaluationId),
        { signal, timeout: milliseconds + 1000 },
      );
      if (presented.context.document !== document) {
        continue;
      }
      return presented;
    }
  } catch (error) {
    if (operationTimeoutController.signal.aborted) {
      throw new AwaitFreshOperationTimeoutError(milliseconds);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
