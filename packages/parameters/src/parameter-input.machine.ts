// oxlint-disable no-barrel-files/no-barrel-files -- `./input-machine` is a package entry path over its split model
import { assign, enqueueActions, setup } from 'xstate';
import {
  acknowledgedFromOutcome,
  authorityMatchesActive,
  changedAuthority,
  conflictDraft,
  correlated,
  emittedIntent,
  evaluateDraft,
  freshDraft,
  hasSettlementBarrier,
  initialContext,
  invalidEventDiagnostic,
  invalidInputDiagnostic,
  nextGeneration,
  numericProjection,
  observesActiveSubmission,
  pendingSubmissionFor,
  pendingWithPressure,
  pointerDraft,
  projectAcknowledged,
  rebasedPending,
  revisedDraft,
  sameAuthorityValue,
  stepDraft,
  submissionFor,
  validEvent,
} from '#parameter-input.model.js';
import type {
  ParameterInputMachineContext,
  ParameterInputMachineEmitted,
  ParameterInputMachineEvent,
  ParameterInputMachineInput,
} from '#parameter-input.model.js';

export { validateParameterInputValue } from '#parameter-input.model.js';
export type {
  ParameterInputBinding,
  ParameterInputDisplay,
  ParameterInputMachineInput,
  ParameterInputAcknowledged,
  ParameterInputDiagnostic,
  ParameterInputDraft,
  ParameterInputSubmission,
  ParameterInputMachineContext,
  ParameterInputModifiers,
  ParameterInputMachineEvent,
  ParameterInputMachineEmitted,
} from '#parameter-input.model.js';

/**
 * Portable interaction owner for one parameter editor binding.
 *
 * It emits correlated parameter-set intents and advances acknowledged data only
 * after a matching committed settlement.
 *
 * @public
 */
export const parameterInputMachine = setup({
  types: {
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- XState setup typing
    context: {} as ParameterInputMachineContext,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- XState setup typing
    events: {} as ParameterInputMachineEvent,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- XState setup typing
    input: {} as ParameterInputMachineInput,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- XState setup typing
    emitted: {} as ParameterInputMachineEmitted,
  },
  guards: {
    invalidEvent: ({ event }) => !validEvent(event),
    hasSettlementBarrier: ({ context }) => hasSettlementBarrier(context),
    hasInitializationFailure: ({ context }) => context.diagnostic !== undefined,
    hasDirtyDraft: ({ context }) => context.draft?.dirty === true,
    hasCleanDraft: ({ context }) => context.draft?.dirty === false,
    hasCompleteDraft: ({ context }) => context.draft?.status === 'complete-valid',
    hasIncompleteDraft: ({ context }) => context.draft?.status === 'incomplete',
    hasSubmittableDraft: ({ context }) =>
      !hasSettlementBarrier(context) &&
      context.draft !== undefined &&
      submissionFor(context, context.draft, 'final') !== undefined,
    hasPendingSubmission: ({ context, event }) =>
      correlated(context, event) &&
      event.outcome.status === 'committed' &&
      context.submission?.pending !== undefined &&
      authorityMatchesActive(context),
    hasConflictedDraftAfterCommit: ({ context, event }) =>
      correlated(context, event) && event.outcome.status === 'committed' && context.draft?.conflict !== undefined,
    hasNewerDraftAfterCommit: ({ context, event }) =>
      correlated(context, event) &&
      event.outcome.status === 'committed' &&
      context.draft !== undefined &&
      context.draft.generation > event.generation,
    isCommittedOutcome: ({ context, event }) => correlated(context, event) && event.outcome.status === 'committed',
    isConflictOutcome: ({ context, event }) =>
      correlated(context, event) && event.outcome.status === 'rejected' && event.outcome.code === 'STALE_MANIFEST',
    isFailureOutcome: ({ context, event }) =>
      correlated(context, event) &&
      (event.outcome.status === 'known-not-applied-failure' ||
        event.outcome.status === 'indeterminate' ||
        event.outcome.status === 'rejected'),
    isCancelledOutcome: ({ context, event }) =>
      correlated(context, event) && event.outcome.status === 'cancelled-before-apply',
    observesActiveSubmission: ({ context, event }) => observesActiveSubmission(context, event),
    sameAuthorityValue: ({ context, event }) =>
      event.type === 'refreshAuthority' && validEvent(event) && sameAuthorityValue(context, event),
    hasPendingAfterCancellation: ({ context, event }) =>
      correlated(context, event) &&
      event.outcome.status === 'cancelled-before-apply' &&
      context.submission?.pending !== undefined,
    hasDraftAfterCancellation: ({ context, event }) =>
      correlated(context, event) && event.outcome.status === 'cancelled-before-apply' && context.draft !== undefined,
    canRetry: ({ context }) => context.submission?.outcome?.status === 'known-not-applied-failure',
    canRebind: ({ context }) => context.draft?.conflict?.rebindable === true,
    continualPressure: ({ context }) => context.pressure === 'continual',
    validPointerValue: ({ event }) => validEvent(event) && event.type === 'pointerChanged',
    submittableContinualPointer: ({ context, event }) => {
      if (
        hasSettlementBarrier(context) ||
        context.pressure !== 'continual' ||
        !validEvent(event) ||
        event.type !== 'pointerChanged'
      ) {
        return false;
      }
      const draft = pointerDraft(context, event);
      return submissionFor(context, draft, 'transient') !== undefined;
    },
    submittableStep: ({ context, event }) => {
      if (hasSettlementBarrier(context) || !validEvent(event) || event.type !== 'step') {
        return false;
      }
      const draft = stepDraft(context, event);
      return submissionFor(context, draft, 'final') !== undefined;
    },
  },
  actions: {
    recordInvalidEvent: assign({ diagnostic: invalidEventDiagnostic }),
    beginEditing: assign(({ context }) => {
      const draft = freshDraft(context, numericProjection(context.acknowledged), true);
      return {
        draft,
        sequence: draft.generation,
        submission: hasSettlementBarrier(context) ? context.submission : undefined,
        diagnostic: undefined,
      };
    }),
    updateDraft: assign(({ context, event }) => {
      const draft = event.type === 'changeRaw' ? revisedDraft(context, event.text) : context.draft;
      return {
        draft,
        sequence: draft?.generation ?? context.sequence,
        diagnostic: undefined,
      };
    }),
    focusDraft: assign(({ context }) => {
      const draft = context.draft
        ? { ...context.draft, focused: true }
        : freshDraft(context, numericProjection(context.acknowledged), true);
      return { draft, sequence: draft.generation };
    }),
    blurDraft: assign(({ context }) => ({
      draft: context.draft ? { ...context.draft, focused: false } : undefined,
    })),
    discardDraft: assign(({ context }) => ({
      draft: undefined,
      submission: hasSettlementBarrier(context) ? context.submission : undefined,
      diagnostic: undefined,
    })),
    updateDisplay: assign(({ context, event }) => ({
      acknowledged:
        event.type === 'changeDisplay'
          ? projectAcknowledged({
              ...context.acknowledged,
              display: event.display,
            })
          : context.acknowledged,
    })),
    updateAuthority: assign(({ context, event }) => ({
      acknowledged:
        event.type === 'refreshAuthority'
          ? (changedAuthority(context, event) ?? context.acknowledged)
          : context.acknowledged,
      bindingAvailable: event.type === 'refreshAuthority' && event.binding !== undefined,
      diagnostic:
        event.type === 'refreshAuthority' && event.binding === undefined
          ? {
              code: 'STALE_MANIFEST',
              message: 'The parameter binding was removed.',
            }
          : undefined,
    })),
    refreshCleanDraft: assign(({ context, event }) => {
      if (event.type !== 'refreshAuthority') {
        return {};
      }
      const acknowledged = changedAuthority(context, event);
      return {
        acknowledged: acknowledged ?? context.acknowledged,
        bindingAvailable: acknowledged !== undefined,
        draft: acknowledged
          ? evaluateDraft(acknowledged, {
              raw: numericProjection(acknowledged),
              locale: acknowledged.display.locale,
              inputUnit: acknowledged.display.unit,
              generation: nextGeneration(context),
              binding: acknowledged.binding,
              expected: acknowledged.revision,
              focused: context.draft?.focused ?? false,
              source: 'text',
            })
          : context.draft,
        sequence: acknowledged ? nextGeneration(context) : context.sequence,
        diagnostic: event.binding
          ? undefined
          : {
              code: 'STALE_MANIFEST',
              message: 'The parameter binding was removed.',
            },
      };
    }),
    markConflict: assign(({ context, event }) => ({
      draft: event.type === 'refreshAuthority' ? conflictDraft(context, event) : context.draft,
      acknowledged:
        event.type === 'refreshAuthority'
          ? (changedAuthority(context, event) ?? context.acknowledged)
          : context.acknowledged,
      bindingAvailable: event.type === 'refreshAuthority' && event.binding !== undefined,
      diagnostic:
        event.type === 'refreshAuthority' && event.binding === undefined
          ? {
              code: 'STALE_MANIFEST',
              message: 'The parameter binding was removed.',
            }
          : {
              code: 'STALE_MANIFEST',
              message: 'The authoritative parameter revision changed during editing.',
            },
    })),
    rebindDraft: assign(({ context }) => {
      const { draft } = context;
      return draft
        ? {
            draft: evaluateDraft(context.acknowledged, {
              raw: draft.raw,
              locale: draft.locale,
              inputUnit: draft.inputUnit,
              generation: nextGeneration(context),
              binding: context.acknowledged.binding,
              expected: context.acknowledged.revision,
              focused: draft.focused,
              source: 'text',
            }),
            sequence: nextGeneration(context),
            submission: context.submission,
            diagnostic: undefined,
          }
        : {};
    }),
    beginSubmission: enqueueActions(({ context, enqueue }) => {
      const active = context.draft ? submissionFor(context, context.draft, 'final') : undefined;
      if (!active) {
        return;
      }
      enqueue.emit(emittedIntent(active));
      enqueue.assign({ submission: { active }, diagnostic: undefined });
    }),
    beginContinualSubmission: enqueueActions(({ context, event, enqueue }) => {
      if (event.type !== 'pointerChanged') {
        return;
      }
      const draft = pointerDraft(context, event);
      const active = submissionFor(context, draft, 'transient');
      if (!active) {
        enqueue.assign({ draft, diagnostic: draft.diagnostic });
        return;
      }
      enqueue.emit(emittedIntent(active));
      enqueue.assign({
        draft,
        sequence: draft.generation,
        submission: { active },
        diagnostic: undefined,
      });
    }),
    beginPointerDraft: assign(({ context, event }) => ({
      draft: event.type === 'pointerChanged' ? pointerDraft(context, event) : context.draft,
      sequence: event.type === 'pointerChanged' ? nextGeneration(context) : context.sequence,
      diagnostic:
        event.type === 'pointerChanged' && !Number.isFinite(event.value)
          ? {
              code: 'NUMERIC_OVERFLOW',
              message: 'Pointer value must be finite.',
            }
          : undefined,
    })),
    queueContinualDraft: assign(({ context, event }) => {
      if (event.type !== 'pointerChanged') {
        return {};
      }
      const draft = pointerDraft(context, event);
      const pending = pendingSubmissionFor(context, draft, 'transient');
      return {
        draft,
        sequence: draft.generation,
        submission:
          context.submission && pending
            ? { ...context.submission, pending }
            : context.submission?.outcome === undefined
              ? context.submission && { active: context.submission.active }
              : {
                  active: context.submission.active,
                  outcome: context.submission.outcome,
                },
        diagnostic: draft.diagnostic,
      };
    }),
    finalizePendingDraft: assign(({ context }) => {
      const pending = context.submission?.pending;
      if (pending) {
        const finalPending = pendingWithPressure(pending, 'final');
        return {
          submission: { ...context.submission, pending: finalPending },
        };
      }
      if (!context.submission || !context.draft) {
        return {};
      }
      const releaseDraft = {
        ...context.draft,
        generation: nextGeneration(context),
      };
      const release = pendingSubmissionFor(context, releaseDraft, 'final');
      return release
        ? {
            draft: releaseDraft,
            sequence: releaseDraft.generation,
            submission: { ...context.submission, pending: release },
          }
        : {};
    }),
    cancelPointerDraft: assign(({ context }) => {
      const active = context.submission?.active;
      return {
        draft: context.draft?.generation === active?.request.draftGeneration ? context.draft : undefined,
        submission: active ? { active } : undefined,
        diagnostic: undefined,
      };
    }),
    submitStep: enqueueActions(({ context, event, enqueue }) => {
      if (event.type !== 'step') {
        return;
      }
      const draft = stepDraft(context, event);
      const active = submissionFor(context, draft, 'final');
      if (!active) {
        enqueue.assign({ draft, diagnostic: draft.diagnostic });
        return;
      }
      enqueue.emit(emittedIntent(active));
      enqueue.assign({
        draft,
        sequence: draft.generation,
        submission: { active },
        diagnostic: undefined,
      });
    }),
    acceptCommitted: assign(({ context, event }) =>
      event.type === 'settleSubmission'
        ? {
            acknowledged: acknowledgedFromOutcome(context, event),
            draft: undefined,
            submission: undefined,
            diagnostic: undefined,
          }
        : {},
    ),
    acceptCommittedWithDraft: assign(({ context, event }) => {
      if (event.type !== 'settleSubmission') {
        return {};
      }
      const mayReconcileDraft = authorityMatchesActive(context);
      const acknowledged = acknowledgedFromOutcome(context, event);
      const draft =
        mayReconcileDraft && context.draft
          ? evaluateDraft(acknowledged, {
              raw: context.draft.raw,
              locale: context.draft.locale,
              inputUnit: context.draft.inputUnit,
              generation: nextGeneration(context),
              binding: acknowledged.binding,
              expected: acknowledged.revision,
              focused: context.draft.focused,
              source: context.draft.source,
            })
          : context.draft;
      return {
        acknowledged,
        draft,
        sequence: draft?.generation ?? context.sequence,
        submission: undefined,
        diagnostic: draft?.diagnostic,
      };
    }),
    acceptAndSubmitPending: enqueueActions(({ context, event, enqueue }) => {
      if (event.type !== 'settleSubmission' || !context.submission?.pending) {
        return;
      }
      const acknowledged = acknowledgedFromOutcome(context, event);
      const pending = rebasedPending(context.submission.pending, acknowledged);
      enqueue.emit(emittedIntent(pending));
      enqueue.assign({
        acknowledged,
        submission: { active: pending },
        diagnostic: undefined,
      });
    }),
    recordConflictOutcome: assign(({ context, event }) => ({
      submission:
        event.type === 'settleSubmission' && context.submission
          ? { ...context.submission, outcome: event.outcome }
          : context.submission,
      draft: context.draft
        ? {
            ...context.draft,
            conflict: { reason: 'revision-changed', rebindable: true },
          }
        : context.draft,
      diagnostic: {
        code: 'STALE_MANIFEST',
        message: 'The submitted parameter revision is stale.',
      },
    })),
    recordFailureOutcome: assign(({ context, event }) => ({
      submission:
        event.type === 'settleSubmission' && context.submission
          ? { ...context.submission, outcome: event.outcome }
          : context.submission,
      diagnostic:
        event.type === 'settleSubmission' && 'code' in event.outcome
          ? { code: event.outcome.code, message: event.outcome.message }
          : invalidInputDiagnostic,
    })),
    adoptRevision: assign(({ context, event }) =>
      event.type === 'refreshAuthority'
        ? {
            acknowledged: { ...context.acknowledged, revision: event.revision },
            ...(context.draft === undefined ? {} : { draft: { ...context.draft, expected: event.revision } }),
          }
        : {},
    ),
    submitPendingAfterCancellation: enqueueActions(({ context, enqueue }) => {
      const pending = context.submission?.pending;
      if (pending === undefined) {
        return;
      }
      enqueue.emit(emittedIntent(pending));
      enqueue.assign({ submission: { active: pending }, diagnostic: undefined });
    }),
    /** Another edit displaced this one before it applied: keep the draft so Enter submits it again. */
    retainCancelledDraft: assign(({ context }) => ({
      submission: undefined,
      draft: context.draft === undefined ? undefined : { ...context.draft, expected: context.acknowledged.revision },
      diagnostic: {
        code: 'CANCELLED_BEFORE_APPLY',
        message: 'A newer edit to this parameter replaced this change before it was saved.',
      },
    })),
    recordCancelledOutcome: assign({ submission: undefined, diagnostic: undefined }),
    retrySubmission: enqueueActions(({ context, enqueue }) => {
      const active = context.submission?.active;
      if (!active) {
        return;
      }
      enqueue.emit(emittedIntent(active));
      enqueue.assign({
        submission: { ...context.submission, outcome: undefined },
        diagnostic: undefined,
      });
    }),
  },
}).createMachine({
  id: 'parameter-input',
  context: ({ input }) => initialContext(input),
  initial: 'active',
  states: {
    active: {
      type: 'parallel',
      on: {
        close: [
          {
            guard: 'invalidEvent',
            target: '#parameter-input.active.interaction.failed',
            actions: 'recordInvalidEvent',
          },
          { target: 'closed' },
        ],
        settleSubmission: [
          {
            guard: 'invalidEvent',
            target: '#parameter-input.active.interaction.failed',
            actions: 'recordInvalidEvent',
          },
          { guard: 'hasPendingSubmission', actions: 'acceptAndSubmitPending' },
          {
            guard: 'hasConflictedDraftAfterCommit',
            target: '#parameter-input.active.interaction.conflicted',
            actions: 'acceptCommittedWithDraft',
          },
          {
            guard: 'hasNewerDraftAfterCommit',
            target: '#parameter-input.active.interaction.editing.classifying',
            actions: 'acceptCommittedWithDraft',
          },
          {
            guard: 'isCommittedOutcome',
            target: '#parameter-input.active.interaction.viewing',
            actions: 'acceptCommitted',
          },
          {
            guard: 'isConflictOutcome',
            target: '#parameter-input.active.interaction.conflicted',
            actions: 'recordConflictOutcome',
          },
          {
            guard: 'isFailureOutcome',
            target: '#parameter-input.active.interaction.failed',
            actions: 'recordFailureOutcome',
          },
          { guard: 'hasPendingAfterCancellation', actions: 'submitPendingAfterCancellation' },
          {
            guard: 'hasDraftAfterCancellation',
            target: '#parameter-input.active.interaction.editing.classifying',
            actions: 'retainCancelledDraft',
          },
          {
            guard: 'isCancelledOutcome',
            target: '#parameter-input.active.interaction.viewing',
            actions: 'recordCancelledOutcome',
          },
        ],
        '*': {
          guard: 'invalidEvent',
          target: '#parameter-input.active.interaction.failed',
          actions: 'recordInvalidEvent',
        },
      },
      states: {
        attachment: {
          initial: 'attached',
          states: {
            attached: {
              on: {
                detach: [
                  {
                    guard: 'invalidEvent',
                    target: '#parameter-input.active.interaction.failed',
                    actions: 'recordInvalidEvent',
                  },
                  { target: 'detached' },
                ],
              },
            },
            detached: {
              on: {
                attach: [
                  {
                    guard: 'invalidEvent',
                    target: '#parameter-input.active.interaction.failed',
                    actions: 'recordInvalidEvent',
                  },
                  { target: 'attached' },
                ],
              },
            },
          },
        },
        interaction: {
          initial: 'initializing',
          states: {
            initializing: {
              always: [{ guard: 'hasInitializationFailure', target: 'failed' }, { target: 'viewing' }],
            },
            viewing: {
              on: {
                focus: [
                  {
                    guard: 'invalidEvent',
                    target: 'failed',
                    actions: 'recordInvalidEvent',
                  },
                  { target: 'editing.classifying', actions: 'beginEditing' },
                ],
                // A field that keeps focus through a commit starts its next draft from the first keystroke.
                changeRaw: [
                  {
                    guard: 'invalidEvent',
                    target: 'failed',
                    actions: 'recordInvalidEvent',
                  },
                  { target: 'editing.classifying', actions: ['beginEditing', 'updateDraft'] },
                ],
                changeDisplay: [
                  {
                    guard: 'invalidEvent',
                    target: 'failed',
                    actions: 'recordInvalidEvent',
                  },
                  { actions: 'updateDisplay' },
                ],
                refreshAuthority: [
                  {
                    guard: 'invalidEvent',
                    target: 'failed',
                    actions: 'recordInvalidEvent',
                  },
                  {
                    guard: ({ event }) => event.binding === undefined,
                    target: 'conflicted',
                    actions: 'updateAuthority',
                  },
                  { actions: 'updateAuthority' },
                ],
                pointerChanged: [
                  {
                    guard: 'invalidEvent',
                    target: 'failed',
                    actions: 'recordInvalidEvent',
                  },
                  {
                    guard: 'submittableContinualPointer',
                    target: 'submitting',
                    actions: 'beginContinualSubmission',
                  },
                  {
                    guard: 'validPointerValue',
                    target: 'dragging',
                    actions: 'beginPointerDraft',
                  },
                ],
                step: [
                  {
                    guard: 'invalidEvent',
                    target: 'failed',
                    actions: 'recordInvalidEvent',
                  },
                  { guard: 'hasSettlementBarrier' },
                  {
                    guard: 'submittableStep',
                    target: 'submitting',
                    actions: 'submitStep',
                  },
                  { target: 'failed', actions: 'submitStep' },
                ],
              },
            },
            editing: {
              initial: 'classifying',
              on: {
                focus: [
                  {
                    guard: 'invalidEvent',
                    target: 'failed',
                    actions: 'recordInvalidEvent',
                  },
                  { actions: 'focusDraft' },
                ],
                blur: [
                  {
                    guard: 'invalidEvent',
                    target: 'failed',
                    actions: 'recordInvalidEvent',
                  },
                  {
                    guard: 'hasCleanDraft',
                    target: 'viewing',
                    actions: 'discardDraft',
                  },
                  { actions: 'blurDraft' },
                ],
                changeRaw: [
                  {
                    guard: 'invalidEvent',
                    target: 'failed',
                    actions: 'recordInvalidEvent',
                  },
                  { target: '.classifying', actions: 'updateDraft' },
                ],
                pressEscape: [
                  {
                    guard: 'invalidEvent',
                    target: 'failed',
                    actions: 'recordInvalidEvent',
                  },
                  { target: 'viewing', actions: 'discardDraft' },
                ],
                changeDisplay: [
                  {
                    guard: 'invalidEvent',
                    target: 'failed',
                    actions: 'recordInvalidEvent',
                  },
                  { actions: 'updateDisplay' },
                ],
                refreshAuthority: [
                  {
                    guard: 'invalidEvent',
                    target: 'failed',
                    actions: 'recordInvalidEvent',
                  },
                  { guard: 'sameAuthorityValue', actions: 'adoptRevision' },
                  {
                    guard: 'hasDirtyDraft',
                    target: 'conflicted',
                    actions: 'markConflict',
                  },
                  { target: '.classifying', actions: 'refreshCleanDraft' },
                ],
                pointerChanged: [
                  {
                    guard: 'invalidEvent',
                    target: 'failed',
                    actions: 'recordInvalidEvent',
                  },
                  {
                    guard: 'submittableContinualPointer',
                    target: 'submitting',
                    actions: 'beginContinualSubmission',
                  },
                  {
                    guard: 'validPointerValue',
                    target: 'dragging',
                    actions: 'beginPointerDraft',
                  },
                ],
                step: [
                  {
                    guard: 'invalidEvent',
                    target: 'failed',
                    actions: 'recordInvalidEvent',
                  },
                  { guard: 'hasSettlementBarrier' },
                  {
                    guard: 'submittableStep',
                    target: 'submitting',
                    actions: 'submitStep',
                  },
                  { target: 'failed', actions: 'submitStep' },
                ],
                discard: [
                  {
                    guard: 'invalidEvent',
                    target: 'failed',
                    actions: 'recordInvalidEvent',
                  },
                  { target: 'viewing', actions: 'discardDraft' },
                ],
                detach: [
                  {
                    guard: 'invalidEvent',
                    target: 'failed',
                    actions: 'recordInvalidEvent',
                  },
                  {
                    guard: 'hasCleanDraft',
                    target: 'viewing',
                    actions: 'discardDraft',
                  },
                ],
              },
              states: {
                classifying: {
                  always: [
                    { guard: 'hasCompleteDraft', target: 'complete-valid' },
                    { guard: 'hasIncompleteDraft', target: 'incomplete' },
                    { target: 'invalid' },
                  ],
                },
                'complete-valid': {
                  on: {
                    pressEnter: [
                      {
                        guard: 'invalidEvent',
                        target: '#parameter-input.active.interaction.failed',
                        actions: 'recordInvalidEvent',
                      },
                      { guard: 'hasSettlementBarrier' },
                      {
                        guard: 'hasSubmittableDraft',
                        target: '#parameter-input.active.interaction.submitting',
                        actions: 'beginSubmission',
                      },
                      {
                        target: '#parameter-input.active.interaction.viewing',
                        actions: 'discardDraft',
                      },
                    ],
                  },
                },
                incomplete: {},
                invalid: {},
              },
            },
            dragging: {
              on: {
                pointerChanged: [
                  {
                    guard: 'invalidEvent',
                    target: 'failed',
                    actions: 'recordInvalidEvent',
                  },
                  { guard: 'validPointerValue', actions: 'beginPointerDraft' },
                ],
                pointerReleased: [
                  {
                    guard: 'invalidEvent',
                    target: 'failed',
                    actions: 'recordInvalidEvent',
                  },
                  {
                    guard: 'hasSubmittableDraft',
                    target: 'submitting',
                    actions: 'beginSubmission',
                  },
                  { target: 'viewing', actions: 'discardDraft' },
                ],
                pointerCancelled: [
                  {
                    guard: 'invalidEvent',
                    target: 'failed',
                    actions: 'recordInvalidEvent',
                  },
                  { target: 'viewing', actions: 'discardDraft' },
                ],
                pressEscape: [
                  {
                    guard: 'invalidEvent',
                    target: 'failed',
                    actions: 'recordInvalidEvent',
                  },
                  { target: 'viewing', actions: 'discardDraft' },
                ],
                changeDisplay: [
                  {
                    guard: 'invalidEvent',
                    target: 'failed',
                    actions: 'recordInvalidEvent',
                  },
                  { actions: 'updateDisplay' },
                ],
                refreshAuthority: [
                  {
                    guard: 'invalidEvent',
                    target: 'failed',
                    actions: 'recordInvalidEvent',
                  },
                  { guard: 'sameAuthorityValue', actions: 'adoptRevision' },
                  { target: 'conflicted', actions: 'markConflict' },
                ],
              },
            },
            submitting: {
              on: {
                blur: [
                  {
                    guard: 'invalidEvent',
                    target: 'failed',
                    actions: 'recordInvalidEvent',
                  },
                  { actions: 'blurDraft' },
                ],
                changeRaw: [
                  {
                    guard: 'invalidEvent',
                    target: 'failed',
                    actions: 'recordInvalidEvent',
                  },
                  { actions: 'updateDraft' },
                ],
                pointerChanged: [
                  {
                    guard: 'invalidEvent',
                    target: 'failed',
                    actions: 'recordInvalidEvent',
                  },
                  {
                    guard: 'continualPressure',
                    actions: 'queueContinualDraft',
                  },
                ],
                pointerReleased: [
                  {
                    guard: 'invalidEvent',
                    target: 'failed',
                    actions: 'recordInvalidEvent',
                  },
                  { actions: 'finalizePendingDraft' },
                ],
                pointerCancelled: [
                  {
                    guard: 'invalidEvent',
                    target: 'failed',
                    actions: 'recordInvalidEvent',
                  },
                  { actions: 'cancelPointerDraft' },
                ],
                pressEscape: [
                  {
                    guard: 'invalidEvent',
                    target: 'failed',
                    actions: 'recordInvalidEvent',
                  },
                  { actions: 'cancelPointerDraft' },
                ],
                changeDisplay: [
                  {
                    guard: 'invalidEvent',
                    target: 'failed',
                    actions: 'recordInvalidEvent',
                  },
                  { actions: 'updateDisplay' },
                ],
                refreshAuthority: [
                  {
                    guard: 'invalidEvent',
                    target: 'failed',
                    actions: 'recordInvalidEvent',
                  },
                  { guard: 'sameAuthorityValue', actions: 'adoptRevision' },
                  { guard: 'observesActiveSubmission', actions: 'updateAuthority' },
                  { target: 'conflicted', actions: 'markConflict' },
                ],
              },
            },
            conflicted: {
              on: {
                blur: [
                  { guard: 'invalidEvent', target: 'failed', actions: 'recordInvalidEvent' },
                  { actions: 'blurDraft' },
                ],
                rebind: [
                  {
                    guard: 'invalidEvent',
                    target: 'failed',
                    actions: 'recordInvalidEvent',
                  },
                  {
                    guard: 'canRebind',
                    target: 'editing.classifying',
                    actions: 'rebindDraft',
                  },
                ],
                refreshAuthority: [
                  {
                    guard: 'invalidEvent',
                    target: 'failed',
                    actions: 'recordInvalidEvent',
                  },
                  { guard: 'sameAuthorityValue', actions: 'adoptRevision' },
                  { actions: 'markConflict' },
                ],
                pressEscape: [
                  {
                    guard: 'invalidEvent',
                    target: 'failed',
                    actions: 'recordInvalidEvent',
                  },
                  { target: 'viewing', actions: 'discardDraft' },
                ],
                discard: [
                  {
                    guard: 'invalidEvent',
                    target: 'failed',
                    actions: 'recordInvalidEvent',
                  },
                  { target: 'viewing', actions: 'discardDraft' },
                ],
                changeDisplay: [
                  {
                    guard: 'invalidEvent',
                    target: 'failed',
                    actions: 'recordInvalidEvent',
                  },
                  { actions: 'updateDisplay' },
                ],
              },
            },
            failed: {
              on: {
                blur: [{ guard: 'invalidEvent', actions: 'recordInvalidEvent' }, { actions: 'blurDraft' }],
                retry: [
                  { guard: 'invalidEvent', actions: 'recordInvalidEvent' },
                  {
                    guard: 'canRetry',
                    target: 'submitting',
                    actions: 'retrySubmission',
                  },
                ],
                changeRaw: [
                  { guard: 'invalidEvent', actions: 'recordInvalidEvent' },
                  { target: 'editing.classifying', actions: 'updateDraft' },
                ],
                focus: [
                  { guard: 'invalidEvent', actions: 'recordInvalidEvent' },
                  { target: 'editing.classifying', actions: 'beginEditing' },
                ],
                refreshAuthority: [
                  { guard: 'invalidEvent', actions: 'recordInvalidEvent' },
                  { guard: 'sameAuthorityValue', actions: 'adoptRevision' },
                  { target: 'conflicted', actions: 'markConflict' },
                ],
                pressEscape: [
                  { guard: 'invalidEvent', actions: 'recordInvalidEvent' },
                  { target: 'viewing', actions: 'discardDraft' },
                ],
                discard: [
                  { guard: 'invalidEvent', actions: 'recordInvalidEvent' },
                  { target: 'viewing', actions: 'discardDraft' },
                ],
                changeDisplay: [{ guard: 'invalidEvent', actions: 'recordInvalidEvent' }, { actions: 'updateDisplay' }],
              },
            },
          },
        },
      },
    },
    closed: { type: 'final' },
  },
});
