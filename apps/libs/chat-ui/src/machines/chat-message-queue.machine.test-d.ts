import { expectTypeOf } from 'vitest';
import type { AnyStateMachine } from 'xstate';

import { chatMessageQueueMachine } from '#machines/chat-message-queue.machine.js';
import type { ChatMessageQueueActors, ChatMessageQueueMachineInput } from '#machines/chat-message-queue.machine.js';

expectTypeOf(chatMessageQueueMachine).toExtend<AnyStateMachine>();

expectTypeOf<keyof ChatMessageQueueActors>().toEqualTypeOf<'advance' | 'read' | 'watch'>();
expectTypeOf<ChatMessageQueueMachineInput>().toEqualTypeOf<Readonly<{ chatId: string; projectId: string }>>();
