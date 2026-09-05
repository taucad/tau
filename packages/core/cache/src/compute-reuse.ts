import { CacheCorruptionError, CacheRequiredError } from '#errors.js';
import { actionDigest, canonicalizeComputeAction, contentDigest, digestAction, digestContent } from '#digest.js';
import type { ActionStore, ComputeActionRecord, ContentStore } from '#store.js';
import type {
  ActionDigest,
  CacheCodec,
  ComputeAction,
  ComputeEvaluationInput,
  ComputeEvaluationResult,
  ComputeReuseService,
  ContentDigest,
} from '#types.js';

/** Stores used by a compute reuse service. @public */
export type ComputeReuseServiceOptions = {
  readonly contentStore: ContentStore;
  readonly actionStore: ActionStore;
};

type PendingEvaluation = {
  readonly controller: AbortController;
  readonly promise: Promise<ComputeEvaluationResult<unknown>>;
  waiters: number;
};

type CacheLookup<T> =
  | { readonly status: 'hit'; readonly value: T; readonly contentDigest: ContentDigest }
  | { readonly status: 'miss' };

const defaultSignal = new AbortController().signal;

const abortReason = (signal: AbortSignal): Error =>
  signal.reason instanceof Error ? signal.reason : new DOMException('Aborted', 'AbortError');

const throwIfAborted = (signal: AbortSignal): void => {
  if (signal.aborted) {
    throw abortReason(signal);
  }
};

const requiredFailure = (message: string, cause: unknown): CacheRequiredError =>
  new CacheRequiredError(message, { cause });

const validateRecord = (input: {
  readonly record: ComputeActionRecord;
  readonly action: ComputeAction;
  readonly codec: CacheCodec<unknown>;
  readonly expectedDigest: ActionDigest;
}): void => {
  const { record, action, codec, expectedDigest } = input;
  try {
    const schemaVersion: unknown = record.schemaVersion;
    if (schemaVersion !== 1) {
      throw new TypeError('unsupported schema version');
    }
    if (actionDigest({ value: record.actionDigest }) !== expectedDigest) {
      throw new TypeError('action digest mismatch');
    }
    if (record.codec.id !== action.codec.id || record.codec.version !== action.codec.version) {
      throw new TypeError('codec identity mismatch');
    }
    contentDigest({ value: record.output.digest });
    if (!Number.isSafeInteger(record.output.size) || record.output.size < 0) {
      throw new TypeError('invalid output size');
    }
    if (typeof record.output.mediaType !== 'string' || record.output.mediaType.length === 0) {
      throw new TypeError('invalid output media type');
    }
    if (record.output.mediaType !== codec.mediaType) {
      throw new TypeError('output media type mismatch');
    }
    for (const dependency of record.dependencies) {
      actionDigest({ value: dependency });
    }
  } catch (error) {
    throw new CacheCorruptionError('Cached action record failed validation.', { cause: error });
  }
};

const readCache = async <T>(input: {
  readonly action: ComputeAction;
  readonly actionKey: ActionDigest;
  readonly codec: CacheCodec<T>;
  readonly contentStore: ContentStore;
  readonly actionStore: ActionStore;
  readonly signal: AbortSignal;
}): Promise<CacheLookup<T>> => {
  const { action, actionKey, codec, contentStore, actionStore, signal } = input;
  const actionResult = await actionStore.read({ digest: actionKey, signal });
  if (actionResult.status === 'miss') {
    return { status: 'miss' };
  }
  validateRecord({
    record: actionResult.record,
    action,
    codec: codec as CacheCodec<unknown>,
    expectedDigest: actionKey,
  });
  const contentResult = await contentStore.read({
    digest: actionResult.record.output.digest,
    signal,
  });
  if (contentResult.status === 'miss') {
    throw new CacheCorruptionError('Cached action points to missing content.');
  }
  if (contentResult.bytes.byteLength !== actionResult.record.output.size) {
    throw new CacheCorruptionError('Cached content size does not match its action record.');
  }
  if ((await digestContent({ bytes: contentResult.bytes })) !== actionResult.record.output.digest) {
    throw new CacheCorruptionError('Cached content does not match its digest.');
  }
  throwIfAborted(signal);
  try {
    const value = await codec.decode({ bytes: new Uint8Array(contentResult.bytes), signal });
    throwIfAborted(signal);
    return { status: 'hit', value, contentDigest: actionResult.record.output.digest };
  } catch (error) {
    throwIfAborted(signal);
    throw new CacheCorruptionError('Cached content could not be decoded.', { cause: error });
  }
};

const lookupWithPolicy = async <T>(input: {
  readonly evaluation: ComputeEvaluationInput<T>;
  readonly actionKey: ActionDigest;
  readonly contentStore: ContentStore;
  readonly actionStore: ActionStore;
  readonly signal: AbortSignal;
}): Promise<CacheLookup<T>> => {
  try {
    return await readCache({
      action: input.evaluation.action,
      actionKey: input.actionKey,
      codec: input.evaluation.codec,
      contentStore: input.contentStore,
      actionStore: input.actionStore,
      signal: input.signal,
    });
  } catch (error) {
    throwIfAborted(input.signal);
    if (input.evaluation.policy === 'best-effort') {
      return { status: 'miss' };
    }
    if (error instanceof CacheCorruptionError) {
      throw error;
    }
    throw requiredFailure('Required cache lookup failed.', error);
  }
};

const skipped = <T>(input: {
  readonly value: T;
  readonly actionKey: ActionDigest;
  readonly reason: 'encode-failed' | 'content-store-failed' | 'action-store-failed';
}): ComputeEvaluationResult<T> => ({
  source: 'computed',
  value: input.value,
  actionDigest: input.actionKey,
  publication: { status: 'skipped', reason: input.reason },
});

const publishComputed = async <T>(input: {
  readonly evaluation: ComputeEvaluationInput<T>;
  readonly value: T;
  readonly actionKey: ActionDigest;
  readonly contentStore: ContentStore;
  readonly actionStore: ActionStore;
  readonly signal: AbortSignal;
}): Promise<ComputeEvaluationResult<T>> => {
  const { evaluation, value, actionKey, contentStore, actionStore, signal } = input;
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = new Uint8Array(await evaluation.codec.encode({ value, signal }));
    throwIfAborted(signal);
  } catch (error) {
    throwIfAborted(signal);
    if (evaluation.policy === 'required') {
      throw requiredFailure('Required cache encoding failed.', error);
    }
    return skipped({ value, actionKey, reason: 'encode-failed' });
  }

  const outputDigest = await digestContent({ bytes });
  try {
    const result = await contentStore.write({ digest: outputDigest, bytes, signal });
    if (result.status === 'rejected') {
      throw new Error('Content store rejected the encoded result.');
    }
    throwIfAborted(signal);
  } catch (error) {
    throwIfAborted(signal);
    if (evaluation.policy === 'required') {
      throw requiredFailure('Required content publication failed.', error);
    }
    return skipped({ value, actionKey, reason: 'content-store-failed' });
  }

  const record: ComputeActionRecord = {
    schemaVersion: 1,
    actionDigest: actionKey,
    codec: { id: evaluation.codec.id, version: evaluation.codec.version },
    output: {
      digest: outputDigest,
      size: bytes.byteLength,
      mediaType: evaluation.codec.mediaType,
    },
    dependencies: evaluation.action.inputs
      .filter((dependency) => dependency.kind === 'action')
      .map((dependency) => actionDigest({ value: dependency.digest })),
  };
  try {
    const result = await actionStore.publish({ record, signal });
    if (result.status === 'rejected') {
      throw new Error('Action store rejected the completed record.');
    }
    throwIfAborted(signal);
  } catch (error) {
    throwIfAborted(signal);
    if (evaluation.policy === 'required') {
      throw requiredFailure('Required action publication failed.', error);
    }
    return skipped({ value, actionKey, reason: 'action-store-failed' });
  }

  return {
    source: 'computed',
    value,
    actionDigest: actionKey,
    publication: { status: 'stored', contentDigest: outputDigest },
  };
};

const runEvaluation = async <T>(input: {
  readonly evaluation: ComputeEvaluationInput<T>;
  readonly actionKey: ActionDigest;
  readonly contentStore: ContentStore;
  readonly actionStore: ActionStore;
  readonly signal: AbortSignal;
}): Promise<ComputeEvaluationResult<T>> => {
  const lookup = await lookupWithPolicy(input);
  if (lookup.status === 'hit') {
    return {
      source: 'cache',
      value: lookup.value,
      actionDigest: input.actionKey,
      contentDigest: lookup.contentDigest,
    };
  }
  throwIfAborted(input.signal);
  const value = await input.evaluation.compute({ signal: input.signal });
  throwIfAborted(input.signal);
  return publishComputed({ ...input, value });
};

const waitFor = async <T>(input: {
  readonly pending: PendingEvaluation;
  readonly signal: AbortSignal;
}): Promise<ComputeEvaluationResult<T>> => {
  const { pending, signal } = input;
  pending.waiters += 1;
  try {
    return await new Promise<ComputeEvaluationResult<T>>((resolve, reject) => {
      const onAbort = (): void => {
        reject(abortReason(signal));
      };
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
      void forwardPending({ pending, signal, onAbort, resolve, reject });
    });
  } finally {
    pending.waiters -= 1;
    if (pending.waiters === 0) {
      pending.controller.abort();
    }
  }
};

const forwardPending = async <T>(input: {
  readonly pending: PendingEvaluation;
  readonly signal: AbortSignal;
  readonly onAbort: () => void;
  readonly resolve: (result: ComputeEvaluationResult<T>) => void;
  readonly reject: (error: Error) => void;
}): Promise<void> => {
  try {
    const result = await input.pending.promise;
    input.signal.removeEventListener('abort', input.onAbort);
    input.resolve(result as ComputeEvaluationResult<T>);
  } catch (error) {
    input.signal.removeEventListener('abort', input.onAbort);
    input.reject(error instanceof Error ? error : new Error(String(error)));
  }
};

/**
 * Create a compute reuse service over caller-owned content and action stores.
 *
 * Concurrent identical evaluations share work. Cancelling one waiter does not
 * cancel the producer until every waiter has detached. Action records are the
 * commit point and are published only after immutable content is stored.
 * @param options - Content and action stores owned by the caller.
 * @returns A reusable compute coordinator.
 * @public
 */
export const createComputeReuseService = (options: ComputeReuseServiceOptions): ComputeReuseService => {
  const pendingEvaluations = new Map<string, PendingEvaluation>();

  return {
    evaluate: async <T>(evaluation: ComputeEvaluationInput<T>) => {
      const callerSignal = evaluation.signal ?? defaultSignal;
      throwIfAborted(callerSignal);
      if (
        evaluation.action.codec.id !== evaluation.codec.id ||
        evaluation.action.codec.version !== evaluation.codec.version
      ) {
        throw new TypeError('Compute action codec identity must match the supplied codec.');
      }
      const flightKey = `${canonicalizeComputeAction(evaluation.action)}:${evaluation.policy}`;
      let pending = pendingEvaluations.get(flightKey);
      if (pending === undefined) {
        const controller = new AbortController();
        const promise: Promise<ComputeEvaluationResult<unknown>> = (async () => {
          try {
            const actionKey = await digestAction({ action: evaluation.action });
            return await runEvaluation({
              evaluation,
              actionKey,
              contentStore: options.contentStore,
              actionStore: options.actionStore,
              signal: controller.signal,
            });
          } finally {
            if (pendingEvaluations.get(flightKey)?.controller === controller) {
              pendingEvaluations.delete(flightKey);
            }
          }
        })();
        pending = { controller, promise, waiters: 0 };
        pendingEvaluations.set(flightKey, pending);
      }
      return waitFor<T>({ pending, signal: callerSignal });
    },
  };
};
