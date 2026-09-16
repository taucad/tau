import { expectTypeOf } from 'vitest';
import type { ActorRefFrom, EmittedFrom, EventFromLogic } from 'xstate';

import type { DraftPersistenceActors } from '#hooks/composer-record.js';
import { draftMachine } from '#hooks/draft.machine.js';
import type { DraftAttachment, DraftMachineContext } from '#hooks/draft.machine.js';
import type { Attachment } from '#utils/attachment.utils.js';

type DraftEvent = EventFromLogic<typeof draftMachine>;
type DraftEmitted = EmittedFrom<typeof draftMachine>;

// The public unions surfaces switch on: a new member is a contract change, not a detail.
expectTypeOf<DraftEvent['type']>().toEqualTypeOf<
  | 'initializeFromChat'
  | 'hydrateDraft'
  | 'setDraftText'
  | 'addDraftAttachment'
  | 'removeDraftAttachment'
  | 'setDraftToolChoice'
  | 'setDraftMode'
  | 'clearDraft'
  | 'loadDraftFromMessageTransient'
  | 'setEditDraftText'
  | 'addEditDraftAttachment'
  | 'removeEditDraftAttachment'
  | 'startEditingMessage'
  | 'exitEditMode'
  | 'clearEditDraft'
  | 'clearMessageEdit'
  | 'flushNow'
  | 'imageResized'
  | 'attachmentStored'
>();
expectTypeOf<DraftEmitted['type']>().toEqualTypeOf<
  'imageResizeFailed' | 'attachmentStoreFailed' | 'attachmentRefused'
>();

// Drafts hold references, never data URLs; a stored attachment is a draft attachment.
expectTypeOf<DraftMachineContext['draftAttachments']>().toEqualTypeOf<DraftAttachment[]>();
expectTypeOf<Attachment>().toExtend<DraftAttachment>();

// The record seam's actors provide into this machine as they are.
declare const persistence: DraftPersistenceActors;
draftMachine.provide({ actors: persistence });

// Every add names the selected model, so no surface can skip the kind refusal (D20).
declare const draft: ActorRefFrom<typeof draftMachine>;
draft.send({ type: 'addDraftAttachment', dataUrl: 'data:image/png;base64,AA', model: { name: 'Model' } });
// @ts-expect-error -- `model` is required
draft.send({ type: 'addDraftAttachment', dataUrl: 'data:image/png;base64,AA' });
