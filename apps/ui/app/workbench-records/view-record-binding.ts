/**
 * The composition root of `viewRecordBinding` (graphics event-driven state charter G6; xstate-policy MC-R4, MC-R8): it
 * gives the machine its one effect, an edit through the view's `recordSync` command surface, so the store's answers
 * hold (after a fault or a close the store answers the edit `false` without writing).
 */
import { createActor } from 'xstate';
import type { Actor, ActorOptions } from 'xstate';
import type { WorkbenchView } from '@taucad/workbench';
import { viewRecordBindingMachine } from '#workbench-records/view-record-binding.machine.js';
import type {
  ViewRecordBindingInput,
  ViewRecordBindingMachine,
} from '#workbench-records/view-record-binding.machine.js';

/** Options of {@link createViewRecordBindingActor} (MC-R4). */
export type ViewRecordBindingActorOptions = Pick<
  ActorOptions<ViewRecordBindingMachine>,
  'clock' | 'inspect' | 'onRejectedEvent'
> &
  Readonly<{
    input: ViewRecordBindingInput;
    /** The view's `recordSync` edit command. Its answer is not awaited: the store reports its own health. */
    edit: (next: WorkbenchView) => Promise<boolean>;
  }>;

/**
 * Creates a view's binding, not yet started.
 *
 * @param options - The machine input, the record's edit command, and the system's clock, inspector and rejection hook.
 * @returns An unstarted actor of {@link viewRecordBindingMachine}.
 */
export const createViewRecordBindingActor = ({
  input,
  edit,
  clock,
  inspect,
  onRejectedEvent,
}: ViewRecordBindingActorOptions): Actor<ViewRecordBindingMachine> =>
  createActor(
    viewRecordBindingMachine.provide({
      actions: {
        editRecord: ({ next }) => {
          void edit(next);
        },
      },
    }),
    {
      input,
      ...(clock === undefined ? {} : { clock }),
      ...(inspect === undefined ? {} : { inspect }),
      ...(onRejectedEvent === undefined ? {} : { onRejectedEvent }),
    },
  );
