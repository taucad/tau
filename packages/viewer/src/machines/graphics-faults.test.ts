import { createActor, createAsyncLogic, createCallbackLogic } from 'xstate';
import type { AnyStateMachine } from 'xstate';
import { describe, expect, it } from 'vitest';
import { canvasMachine } from '#machines/canvas.machine.js';
import { framingMachine } from '#machines/framing.machine.js';
import { graphicsMachine } from '#machines/graphics.machine.js';
import { kinematicsMachine } from '#machines/kinematics.machine.js';
import { measureInputMachine } from '#machines/measure-input.machine.js';
import { measureSessionMachine } from '#machines/measure-session.machine.js';
import { modelInteractionMachine } from '#machines/model-interaction.machine.js';
import { presentationMachine } from '#machines/presentation.machine.js';
import { sectionInputMachine } from '#machines/section-input.machine.js';
import { viewportGizmoGestureMachine } from '#machines/viewport-gizmo-gesture.machine.js';
import { webglContextMachine } from '#machines/webgl-context.machine.js';
import { parameterFieldEditMachine } from '#parameters/parameter-field-edit.machine.js';

type RootErrorHandler = (
  args: Readonly<{ context: unknown; event: Readonly<{ type: string; error: unknown }> }>,
  enq: unknown,
) => unknown;

// One row per graphics owner machine (MC-R12): its root `onError` records the defect and keeps the state it was in.
const owners: ReadonlyArray<readonly [name: string, machine: AnyStateMachine]> = [
  ['graphics', graphicsMachine],
  ['framing', framingMachine],
  ['canvas', canvasMachine],
  ['sectionInput', sectionInputMachine],
  ['measureSession', measureSessionMachine],
  ['kinematics', kinematicsMachine],
  ['presentation', presentationMachine],
  ['modelInteraction', modelInteractionMachine],
  ['measureInput', measureInputMachine],
  ['viewportGizmoGesture', viewportGizmoGestureMachine],
  ['webglContext', webglContextMachine],
  ['parameterFieldEdit', parameterFieldEditMachine],
];

describe('graphics owner machines record a defect at their root (MC-R12, G12)', () => {
  it.each(owners)(
    '%s should record the first defect in context, keep it over later ones and name no target',
    (_name, machine) => {
      const { onError } = machine.config as { onError?: RootErrorHandler };
      expect(onError).toBeTypeOf('function');
      const result = onError!({ context: {}, event: { type: 'xstate.error.execution', error: new Error('boom') } }, {});
      expect(result).toEqual({ context: { fault: 'boom' } });
      const later = onError!(
        { context: { fault: 'boom' }, event: { type: 'xstate.error.communication', error: { message: 'later' } } },
        {},
      );
      expect(later).toEqual({ context: { fault: 'boom' } });
    },
  );

  it('should keep graphics running and answering after a child fails', () => {
    const actor = createActor(
      graphicsMachine.provide({
        actors: {
          probeWebGpu: createAsyncLogic({ run: async () => false }),
          // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a failing stand-in for the presentation child.
          presentation: createCallbackLogic(() => {
            throw new Error('presentation failed');
          }) as unknown as typeof presentationMachine,
        },
      }),
      { input: {} },
    );
    actor.start();
    try {
      expect(actor.getSnapshot().status).toBe('active');
      expect(actor.getSnapshot().context.fault).toContain('presentation failed');
      actor.send({ type: 'setGizmoVisibility', payload: false });
      expect(actor.getSnapshot().status).toBe('active');
      expect(actor.getSnapshot().context.enableGizmo).toBe(false);
    } finally {
      actor.stop();
    }
  });
});
