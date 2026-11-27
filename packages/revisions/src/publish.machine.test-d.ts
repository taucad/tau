import { expectTypeOf } from 'vitest';
import type { AnyStateMachine } from 'xstate';

import { autoVersionName, publishMachine, selectPublishFacet } from '#publish.machine.js';
import type { PublishActors } from '#publish.machine.js';
import type {
  PublishDraft,
  PublishFacet,
  PublishPublicationActorInput,
  PublishPublicationActorOutput,
  PublishVisibility,
} from '#publish.types.js';

expectTypeOf(publishMachine).toExtend<AnyStateMachine>();
expectTypeOf(selectPublishFacet).returns.toEqualTypeOf<PublishFacet>();
expectTypeOf<PublishActors>().toHaveProperty('push');

/* The draft carries the project's name and description and no per-version title or invitees (stable cloud link D3). */
expectTypeOf<PublishDraft>().not.toHaveProperty('title');
expectTypeOf<PublishDraft>().not.toHaveProperty('sharedEmails');
expectTypeOf<PublishDraft['isAutoNamed']>().toEqualTypeOf<boolean | undefined>();
expectTypeOf<PublishDraft['visibility']>().toEqualTypeOf<PublishVisibility | undefined>();
/* The request body carries nothing only the machine needs. */
expectTypeOf<PublishPublicationActorInput>().not.toHaveProperty('note');
expectTypeOf<PublishPublicationActorInput>().not.toHaveProperty('isAutoNamed');
expectTypeOf<PublishPublicationActorOutput['visibility']>().toEqualTypeOf<PublishVisibility>();
expectTypeOf(autoVersionName).returns.toEqualTypeOf<string>();
