/**
 * The print-request ledger: how a request moves from preparation through approval, upload and start, how its state
 * follows the effects recorded for it, and the request operations the machines channel serves. Every transition
 * commits the whole request, so a watcher never needs a cursor.
 *
 * @module
 */

import { randomUUID } from 'node:crypto';

import { canonicalizeCacheValue } from '@taucad/cache-core';

import { cloneBoundedJson } from '@taucad/parameters/json';
import { identity, receiptMessage } from '#host/node-machine-context.js';
import type { NodeMachineHostContext } from '#host/node-machine-context.js';
import type { NodeMachineEffectState } from '#host/node-machine-operations.js';
import type { MachineChannelHostOperations } from '#machines/machine-channel.js';
import type { PrintRequest } from '#machines/print-request.js';

/** Request states nothing moves on from. @internal */
export const terminalRequestStates: ReadonlySet<PrintRequest['state']> = new Set([
  'denied',
  'failed',
  'rejected',
  'started',
  'withdrawn',
]);

/** Request states whose host work still needs the binding; removal is refused until they settle. @internal */
export const bindingBusyStates: ReadonlySet<PrintRequest['state']> = new Set([
  'preparing',
  'awaiting-approval',
  'uploading',
  'starting',
]);

const requestFailure = (error: unknown): NonNullable<PrintRequest['failure']> => {
  const cause = error instanceof Error ? error.cause : undefined;
  if (
    cause !== null &&
    typeof cause === 'object' &&
    'code' in cause &&
    typeof cause.code === 'string' &&
    'message' in cause &&
    typeof cause.message === 'string'
  ) {
    return { code: identity.parse(cause.code), message: receiptMessage.parse(cause.message) };
  }
  const message = error instanceof Error ? error.message : 'MACHINE_PREPARATION_FAILED';
  return {
    code: /^[A-Z][A-Z0-9_]{0,255}$/u.test(message) ? message : 'MACHINE_PREPARATION_FAILED',
    message: receiptMessage.parse(message.slice(0, 1024) || 'MACHINE_PREPARATION_FAILED'),
  };
};

/**
 * Fold the durable effect ledger into one in-flight request.
 * @internal
 * @param record - The in-flight request.
 * @param effects - Every recorded effect, by operation id.
 * @returns The next request state, or `undefined` while nothing has settled.
 */
export const advancePrintRequest = (
  record: PrintRequest,
  effects: ReadonlyMap<string, NodeMachineEffectState>,
): PrintRequest | undefined => {
  const phase =
    record.state === 'uploading' || (record.state === 'unknown' && record.transferId === undefined)
      ? 'upload'
      : record.state === 'starting' || record.state === 'unknown'
        ? 'start'
        : undefined;
  if (!phase) {
    return undefined;
  }
  const operationId = phase === 'upload' ? record.uploadOperationId : record.startOperationId;
  const receipt = operationId === undefined ? undefined : effects.get(operationId)?.receipt;
  if (!receipt || (record.state === 'unknown' && receipt.status === 'unknown')) {
    return undefined;
  }
  if (receipt.status === 'rejected') {
    return {
      ...record,
      state: phase === 'upload' ? 'failed' : 'rejected',
      receipt,
      failure: { code: receipt.code, message: receipt.message },
    };
  }
  if (receipt.status === 'unknown') {
    return { ...record, state: 'unknown', receipt };
  }
  return receipt.kind === 'upload'
    ? { ...record, state: 'starting', transferId: receipt.evidence.transferId, receipt }
    : { ...record, state: 'started', receipt };
};

/** The host's own device operations, which a request prepares, uploads and starts through. @internal */
export type NodeMachinePrintDevice = Pick<MachineChannelHostOperations, 'preparePrint' | 'uploadPrint' | 'startPrint'>;

/** The print-request operations of the machines channel. @internal */
export type NodeMachinePrintRequestOperations = Pick<
  MachineChannelHostOperations,
  'requestPrint' | 'listPrintRequests' | 'watchPrintRequests' | 'resolvePrintRequest' | 'withdrawPrintRequest'
>;

/**
 * Serve the print-request ledger over the host's shared state.
 * @internal
 * @param context - The host's shared state.
 * @param device - The host's own device operations; an approved request uploads and starts through them.
 * @returns The request operations.
 */
export const createNodeMachinePrintRequestOperations = (
  context: NodeMachineHostContext,
  device: NodeMachinePrintDevice,
): NodeMachinePrintRequestOperations => {
  const { commitRequest, effectQueue, now, requestCommits, requests, usableMachine } = context;
  const listRequests = (machineId: string | undefined, projectId: string | undefined): readonly PrintRequest[] =>
    [...requests.values()]
      .filter(
        (request) =>
          (machineId === undefined || request.machineId === machineId) &&
          (projectId === undefined || request.artifact.projectId === projectId),
      )
      .sort(
        (left, right) => right.createdAt.localeCompare(left.createdAt) || right.requestId.localeCompare(left.requestId),
      )
      .slice(0, 1024);
  return {
    async requestPrint(operationInput) {
      if (!context.runtime) {
        throw new Error('MACHINE_OPERATION_UNAVAILABLE');
      }
      const requestId = identity.parse(operationInput.requestId);
      const machineId = identity.parse(operationInput.machineId);
      return effectQueue.queueFor(`request:${requestId}`, async () => {
        operationInput.signal.throwIfAborted();
        operationInput.admitted.assertCurrent();
        const configuration = cloneBoundedJson(operationInput.configuration, {
          code: 'NODE_MACHINE_PREPARATION_CONFIGURATION',
          maximumDepth: 20,
          maximumNodes: 2048,
          maximumCharacters: 65_536,
        });
        const existing = requests.get(requestId);
        if (existing) {
          if (
            existing.machineId !== machineId ||
            canonicalizeCacheValue({ value: existing.artifact }) !==
              canonicalizeCacheValue({ value: operationInput.artifact }) ||
            canonicalizeCacheValue({ value: existing.configuration }) !==
              canonicalizeCacheValue({ value: configuration })
          ) {
            throw new Error('MACHINE_PRINT_REQUEST_ID_CONFLICT');
          }
          return existing;
        }
        // A request lives in its machine's directory, so an unbound machine gets none.
        usableMachine(machineId, 'MACHINE_PREPARATION_UNAVAILABLE');
        const createdAt = now();
        let record = await commitRequest({
          requestId,
          machineId,
          artifact: operationInput.artifact,
          configuration,
          requestedBy: operationInput.requestedBy,
          summary: operationInput.summary ?? { fileName: operationInput.artifact.path.split('/').at(-1) ?? 'print' },
          state: 'preparing',
          createdAt,
          updatedAt: createdAt,
        });
        try {
          const prepared = await device.preparePrint({
            admitted: operationInput.admitted,
            signal: operationInput.signal,
            machineId,
            artifact: operationInput.artifact,
            configuration,
          });
          record = await commitRequest({ ...record, state: 'awaiting-approval', prepared });
        } catch (error) {
          record = await commitRequest({ ...record, state: 'failed', failure: requestFailure(error) });
        }
        return record;
      });
    },
    async listPrintRequests(operationInput) {
      const machineId = operationInput.machineId === undefined ? undefined : identity.parse(operationInput.machineId);
      return listRequests(machineId, operationInput.projectId);
    },
    async *watchPrintRequests(operationInput) {
      const { signal, projectId } = operationInput;
      const machineId = operationInput.machineId === undefined ? undefined : identity.parse(operationInput.machineId);
      // Ponytail: every frame is a whole record, so pending updates coalesce by request id and never need a cursor.
      const pending = new Map<string, PrintRequest>();
      let wake = Promise.withResolvers<void>();
      const off = requestCommits.subscribe(
        (request) => {
          if (
            (machineId === undefined || request.machineId === machineId) &&
            (projectId === undefined || request.artifact.projectId === projectId)
          ) {
            pending.set(request.requestId, request);
            wake.resolve();
          }
        },
        { signal },
      );
      const onAbort = (): void => {
        wake.resolve();
      };
      signal.addEventListener('abort', onAbort, { once: true });
      try {
        for (const request of listRequests(machineId, projectId)) {
          signal.throwIfAborted();
          yield pending.get(request.requestId) ?? request;
        }
        while (!signal.aborted) {
          if (pending.size === 0) {
            // oxlint-disable-next-line eslint/no-await-in-loop -- one wake per committed transition.
            await wake.promise;
            wake = Promise.withResolvers<void>();
            continue;
          }
          const batch = [...pending.values()];
          pending.clear();
          for (const request of batch) {
            signal.throwIfAborted();
            yield request;
          }
        }
      } finally {
        off();
        signal.removeEventListener('abort', onAbort);
      }
    },
    async resolvePrintRequest(operationInput) {
      if (!context.runtime) {
        throw new Error('MACHINE_OPERATION_UNAVAILABLE');
      }
      const requestId = identity.parse(operationInput.requestId);
      const { admitted } = operationInput;
      return effectQueue.queueFor(`request:${requestId}`, async () => {
        operationInput.signal.throwIfAborted();
        admitted.assertCurrent();
        const record = requests.get(requestId);
        if (!record) {
          throw new Error('MACHINE_PRINT_REQUEST_UNKNOWN');
        }
        if (operationInput.decision === 'deny') {
          if (record.state !== 'awaiting-approval') {
            throw new Error('MACHINE_PRINT_REQUEST_NOT_AWAITING');
          }
          return commitRequest({ ...record, state: 'denied', resolvedBy: operationInput.resolvedBy });
        }
        // An approval moves toward the printer; a machine whose log is unreadable could not record it.
        usableMachine(record.machineId, 'MACHINE_OPERATION_UNAVAILABLE');
        let current = record;
        if (current.state === 'awaiting-approval') {
          current = await commitRequest({
            ...current,
            state: 'approved',
            resolvedBy: operationInput.resolvedBy,
            uploadOperationId: identity.parse(operationInput.uploadOperationId ?? randomUUID()),
            startOperationId: identity.parse(operationInput.startOperationId ?? randomUUID()),
          });
        } else if (current.state === 'approved' || current.state === 'uploading' || current.state === 'starting') {
          if (
            (operationInput.uploadOperationId !== undefined &&
              operationInput.uploadOperationId !== current.uploadOperationId) ||
            (operationInput.startOperationId !== undefined &&
              operationInput.startOperationId !== current.startOperationId)
          ) {
            throw new Error('MACHINE_PRINT_REQUEST_ID_CONFLICT');
          }
        } else {
          throw new Error('MACHINE_PRINT_REQUEST_NOT_AWAITING');
        }
        const { prepared, uploadOperationId, startOperationId } = current;
        if (!prepared || uploadOperationId === undefined || startOperationId === undefined) {
          throw new Error('NODE_MACHINE_PRINT_REQUEST_INVALID');
        }
        const latest = (): PrintRequest => requests.get(requestId) ?? current;
        try {
          if (current.state === 'approved') {
            current = await commitRequest({ ...current, state: 'uploading' });
          }
          if (current.state === 'uploading') {
            // The approval is durable: the transfer answers to the host, not to the caller's wait.
            await device.uploadPrint({
              admitted,
              signal: admitted.signal,
              machineId: current.machineId,
              preparedId: prepared.preparedId,
              preparedDigest: prepared.preparedDigest,
              operationId: uploadOperationId,
            });
            current = latest();
          }
          if (current.state === 'starting' && current.transferId !== undefined) {
            await device.startPrint({
              admitted,
              signal: admitted.signal,
              machineId: current.machineId,
              preparedId: prepared.preparedId,
              preparedDigest: prepared.preparedDigest,
              transferId: current.transferId,
              expectedSetupDigest: prepared.setupDigest,
              operationId: startOperationId,
            });
            current = latest();
          }
        } catch (error) {
          current = latest();
          if (!terminalRequestStates.has(current.state)) {
            current = await commitRequest({
              ...current,
              state: 'failed',
              failure: requestFailure(error),
            });
          }
        }
        return current;
      });
    },
    async withdrawPrintRequest(operationInput) {
      const requestId = identity.parse(operationInput.requestId);
      return effectQueue.queueFor(`request:${requestId}`, async () => {
        operationInput.signal.throwIfAborted();
        operationInput.admitted.assertCurrent();
        const record = requests.get(requestId);
        if (!record) {
          throw new Error('MACHINE_PRINT_REQUEST_UNKNOWN');
        }
        if (record.state !== 'awaiting-approval') {
          throw new Error('MACHINE_PRINT_REQUEST_NOT_AWAITING');
        }
        return commitRequest({ ...record, state: 'withdrawn', resolvedBy: operationInput.resolvedBy });
      });
    },
  };
};
