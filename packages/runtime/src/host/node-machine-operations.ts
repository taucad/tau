/**
 * The write-ahead log of device effects each machine keeps in its `operations.jsonl`: an intent before anything is
 * sent, a sending mark as the send begins, and the result. Replay folds the log back into each effect's latest state,
 * and any record that breaks the replay rules makes the whole log untrustworthy.
 *
 * @module
 */

import { z } from 'zod';

import type { ContentDigest } from '@taucad/cache-core';
import type { MachineEventLog } from '#host/node-machine-event-log.js';
import type { MachineOperationReceipt, MachineOperationSnapshot } from '#machines/machine-client.js';
import type { MachineSubmissionReceipt, MachineTransferReceipt } from '#machines/machine.js';

/** A well-formed string of 1–256 characters: every id, name and code the host records. @internal */
export const identity = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => value.isWellFormed());

/** A `sha256:` content digest. @internal */
export const digest = z.custom<ContentDigest>(
  (value) => typeof value === 'string' && /^sha256:[0-9a-f]{64}$/u.test(value),
);

/** The readable message a refusal carries. @internal */
export const receiptMessage = z
  .string()
  .min(1)
  .max(1024)
  .refine((value) => value.isWellFormed());

const runEffectKindSchema = z.enum(['cancel', 'pause', 'resume', 'start', 'urgent-stop']);
const effectKindSchema = z.enum(['cancel', 'pause', 'resume', 'start', 'upload', 'urgent-stop']);
/** The record written before an effect is attempted. @internal */
export const effectIntentSchema = z.strictObject({
  type: z.literal('machine-effect-intent'),
  machineId: identity,
  providerId: identity,
  physicalMachineId: identity,
  operationId: identity,
  inputDigest: digest,
  intent: z.discriminatedUnion('kind', [
    z.strictObject({
      kind: z.literal('upload'),
      preparedId: identity,
      preparedDigest: digest,
    }),
    z.strictObject({
      kind: z.literal('start'),
      preparedId: identity,
      preparedDigest: digest,
      transferId: identity,
      expectedSetupDigest: digest,
    }),
    z.strictObject({
      kind: z.enum(['cancel', 'pause', 'resume', 'urgent-stop']),
      expectedProviderRunId: identity,
    }),
  ]),
  plannedAt: z.iso.datetime({ offset: true }),
});
const effectSendingSchema = z.strictObject({
  type: z.literal('machine-effect-sending'),
  operationId: identity,
  observedAt: z.iso.datetime({ offset: true }),
});
const operationReceiptSchema = z.union([
  z.strictObject({
    operationId: identity,
    machineId: identity,
    kind: z.literal('upload'),
    status: z.literal('accepted'),
    evidence: z.strictObject({ transferId: identity }),
    observedAt: z.iso.datetime({ offset: true }),
  }),
  z.strictObject({
    operationId: identity,
    machineId: identity,
    kind: runEffectKindSchema,
    status: z.literal('accepted'),
    providerRunId: identity.optional(),
    observedAt: z.iso.datetime({ offset: true }),
  }),
  z.strictObject({
    operationId: identity,
    machineId: identity,
    kind: effectKindSchema,
    status: z.literal('rejected'),
    code: identity,
    message: receiptMessage,
    observedAt: z.iso.datetime({ offset: true }),
  }),
  z.strictObject({
    operationId: identity,
    machineId: identity,
    kind: effectKindSchema,
    status: z.literal('unknown'),
    reason: identity,
    providerRunId: identity.optional(),
    observedAt: z.iso.datetime({ offset: true }),
  }),
]);
/** The record of an effect's outcome, from its attempt, a reconciliation or a restart. @internal */
export const effectResultSchema = z.strictObject({
  type: z.literal('machine-effect-result'),
  operationId: identity,
  source: z.enum(['attempt', 'reconciliation', 'recovery']),
  receipt: operationReceiptSchema,
});
/** Everything a machine's `operations.jsonl` holds: the write-ahead records of its device effects. */
const operationEventSchema = z.discriminatedUnion('type', [
  effectIntentSchema,
  effectSendingSchema,
  effectResultSchema,
]);
const providerReceiptSchema = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('accepted'),
    providerRunId: identity.optional(),
    observedAt: z.iso.datetime({ offset: true }),
  }),
  z.strictObject({
    status: z.literal('rejected'),
    code: identity,
    message: receiptMessage,
    observedAt: z.iso.datetime({ offset: true }),
  }),
  z.strictObject({
    status: z.literal('unknown'),
    reason: identity,
    providerRunId: identity.optional(),
    observedAt: z.iso.datetime({ offset: true }),
  }),
]);
const transferReceiptSchema = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('transferred'),
    transferId: identity,
    digest,
    length: z.number().int().positive(),
    observedAt: z.iso.datetime({ offset: true }),
  }),
  z.strictObject({
    status: z.literal('rejected'),
    code: identity,
    message: receiptMessage,
    observedAt: z.iso.datetime({ offset: true }),
  }),
  z.strictObject({
    status: z.literal('unknown'),
    reason: identity,
    observedAt: z.iso.datetime({ offset: true }),
  }),
]);

/** One effect's intent record. @internal */
export type NodeMachineEffectIntentEvent = Readonly<z.infer<typeof effectIntentSchema>>;
/** One effect's result record. @internal */
export type NodeMachineEffectResultEvent = Readonly<z.infer<typeof effectResultSchema>>;
/** Any record of a machine's operations log. @internal */
export type NodeMachineEffectEvent = Readonly<z.infer<typeof operationEventSchema>>;

/** One recorded effect's latest state, as its log's records leave it. @internal */
export type NodeMachineEffectState = {
  intent: NodeMachineEffectIntentEvent;
  status: MachineOperationSnapshot['status'];
  updatedAt: string;
  receipt?: MachineOperationReceipt;
};

/**
 * Parse one operations-log record.
 * @internal
 * @param candidate - An untrusted record.
 * @returns The frozen record.
 */
export const parseOperationEvent = (candidate: unknown): NodeMachineEffectEvent =>
  Object.freeze(operationEventSchema.parse(candidate));

/**
 * Fold one machine's operations log under the replay rules. Any violation makes the whole log unusable, since an
 * effect whose history cannot be trusted must never be sent again.
 * @internal
 * @param machineId - The machine whose directory holds the log.
 * @param log - Its recovered operations log.
 * @returns Each recorded effect's latest state, by operation id.
 */
export const replayOperations = async (
  machineId: string,
  log: MachineEventLog<NodeMachineEffectEvent>,
): Promise<Map<string, NodeMachineEffectState>> => {
  const replayed = new Map<string, NodeMachineEffectState>();
  for (let cursor = 0; ; ) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- the log folds in sequence.
    const page = await log.replay({ cursor, limit: 128 });
    for (const { event } of page.records) {
      if (event.type === 'machine-effect-intent') {
        if (replayed.has(event.operationId)) {
          throw new Error('NODE_MACHINE_EFFECT_DUPLICATE_INTENT');
        }
        if (event.machineId !== machineId) {
          throw new Error('NODE_MACHINE_EFFECT_MACHINE_MISMATCH');
        }
        replayed.set(event.operationId, {
          intent: event,
          status: 'planned',
          updatedAt: event.plannedAt,
        });
        continue;
      }
      const state = replayed.get(event.operationId);
      if (!state) {
        throw new Error('NODE_MACHINE_EFFECT_ORPHAN_TRANSITION');
      }
      if (event.type === 'machine-effect-sending') {
        if (state.status !== 'planned') {
          throw new Error('NODE_MACHINE_EFFECT_INVALID_SENDING');
        }
        state.status = 'sending';
        state.updatedAt = event.observedAt;
        continue;
      }
      if (
        event.receipt.operationId !== state.intent.operationId ||
        event.receipt.machineId !== state.intent.machineId ||
        event.receipt.kind !== state.intent.intent.kind ||
        (state.status !== 'sending' && state.status !== 'unknown')
      ) {
        throw new Error('NODE_MACHINE_EFFECT_INVALID_RESULT');
      }
      state.status = event.receipt.status;
      state.updatedAt = event.receipt.observedAt;
      state.receipt = event.receipt;
    }
    if (page.records.length === 0 || page.nextCursor >= page.endCursor) {
      return replayed;
    }
    cursor = page.nextCursor;
  }
};

/**
 * The public receipt of one effect, from its provider's reply.
 * @internal
 * @param input - The effect's ids and intent, and the provider's reply.
 * @returns The validated receipt.
 */
export const publicOperationReceipt = (
  input: Readonly<{
    operationId: string;
    machineId: string;
    intent: NodeMachineEffectIntentEvent['intent'];
    receipt: MachineSubmissionReceipt | MachineTransferReceipt;
  }>,
): MachineOperationReceipt => {
  const { intent } = input;
  const base = {
    operationId: input.operationId,
    machineId: input.machineId,
    kind: intent.kind,
  };
  if (intent.kind !== 'upload') {
    const receipt = providerReceiptSchema.parse(input.receipt);
    // A control's preflight matched its run, so an accepted control names that run when the provider's reply does not.
    const addressed =
      'expectedProviderRunId' in intent && receipt.status === 'accepted' && receipt.providerRunId === undefined
        ? { providerRunId: intent.expectedProviderRunId }
        : {};
    return operationReceiptSchema.parse({ ...base, ...receipt, ...addressed });
  }
  const transfer = transferReceiptSchema.parse(input.receipt);
  return operationReceiptSchema.parse(
    transfer.status === 'transferred'
      ? {
          ...base,
          status: 'accepted',
          evidence: { transferId: transfer.transferId },
          observedAt: transfer.observedAt,
        }
      : { ...base, ...transfer },
  );
};

/**
 * The snapshot a client reads of one recorded effect.
 * @internal
 * @param state - The effect's latest state.
 * @returns The frozen snapshot.
 */
export const effectSnapshot = (state: NodeMachineEffectState): MachineOperationSnapshot =>
  Object.freeze({
    operationId: state.intent.operationId,
    machineId: state.intent.machineId,
    kind: state.intent.intent.kind,
    inputDigest: state.intent.inputDigest,
    status: state.status,
    updatedAt: state.updatedAt,
    ...(state.receipt ? { receipt: state.receipt } : {}),
  });
