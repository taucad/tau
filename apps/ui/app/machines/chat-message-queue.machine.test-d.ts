import { expectTypeOf, it } from 'vitest';
import type { AnyStateMachine } from 'xstate';

import { chatMessageQueueMachine } from './chat-message-queue.machine.js';
import type { ChatMessageQueueActors, ChatMessageQueueMachineInput } from './chat-message-queue.machine.js';

it('preserves the complete chat-message-queue.machine type contracts', () => {
  expectTypeOf(chatMessageQueueMachine).toExtend<AnyStateMachine>();

  expectTypeOf<keyof ChatMessageQueueActors>().toEqualTypeOf<'advance' | 'read' | 'watch'>();
  expectTypeOf<ChatMessageQueueMachineInput>().toEqualTypeOf<Readonly<{ chatId: string; projectId: string }>>();
});
