import { createActor } from 'xstate';
import { expect, it } from 'vitest';
import { foreignEventChanges } from '@taucad/xstate-testing/paths';
import { guardActors } from '@taucad/xstate-testing/inspect';
import { StepClock } from '@taucad/xstate-testing/clock';
import { projectTaskProjectionLogic } from '#project-tasks/projection.js';

it('folds only acknowledged journal rows and ignores foreign and initialization events', () => {
  expect(foreignEventChanges(projectTaskProjectionLogic)).toEqual([]);
  const guard = guardActors();
  const actor = createActor(projectTaskProjectionLogic, { clock: new StepClock(), inspect: guard.inspect });
  actor.start();
  expect(actor.getSnapshot().context.records).toEqual([]);
  actor.send({ type: 'append', record: { version: 1, projectId: 'project', sequence: 1, tasks: [] } });
  actor.send({ type: 'foreign' });
  expect(actor.getSnapshot().context.records).toHaveLength(1);
  actor.stop();
});
