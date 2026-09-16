import { expectTypeOf } from 'vitest';
import type { AnyStateMachine } from 'xstate';

import type { ComposerRecord, ComposerRecordPatch } from '#db/composer-record-store.js';
import { composerRecordMachine } from './composer-record.machine.js';
import type {
  ComposerRecordMachineContext,
  ComposerRecordMachineEmitted,
  ComposerRecordMachineEvent,
} from './composer-record.machine.js';

expectTypeOf(composerRecordMachine).toExtend<AnyStateMachine>();

// The public unions consumers switch on: a new member is a contract change, not a detail.
expectTypeOf<ComposerRecordMachineEvent['type']>().toEqualTypeOf<'patch' | 'flushNow' | 'remove' | 'recordRead'>();
expectTypeOf<ComposerRecordMachineEmitted['type']>().toEqualTypeOf<
  'recordLoaded' | 'recordUnreadable' | 'writeFailed' | 'writeStalled' | 'writeRecovered' | 'recordRemoved'
>();

// The record and its patches are the store's types, never a second copy.
expectTypeOf<ComposerRecordMachineContext['record']>().toEqualTypeOf<ComposerRecord | undefined>();
expectTypeOf<ComposerRecordMachineContext['pending']>().toEqualTypeOf<ComposerRecordPatch>();
expectTypeOf<Extract<ComposerRecordMachineEmitted, { type: 'recordLoaded' }>['record']>().toEqualTypeOf<
  ComposerRecord | 'absent'
>();
