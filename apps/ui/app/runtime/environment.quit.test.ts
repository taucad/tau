/**
 * `environment`'s desktop quit hold (D31, moved from `SessionsQuitHold` in A5b): a quit ask that reaches a registry
 * already quiesced is answered at once, so main never waits on a hold the registry can no longer end.
 */
import { expect, it } from 'vitest';
import { createActor } from 'xstate';
import { StepClock } from '@taucad/xstate-testing/clock';
import { createEnvironmentLogic, createUnloadSequencer } from '#runtime/environment.js';
import { createSessionsActor } from '#services/sessions-store.js';

it('should answer a second quit ask once the registry is already quiesced (round 9)', async () => {
  const registry = createSessionsActor({ clock: new StepClock() }).start();
  const asks: Array<(attemptId: string) => void> = [];
  const answers: string[] = [];
  const environment = createActor(
    createEnvironmentLogic(() => undefined, {
      sequencer: createUnloadSequencer(),
      desktopQuit: {
        onQuitRequested: (handler) => {
          asks.push(handler);
          return () => undefined;
        },
        reportQuiesced: (attemptId) => {
          answers.push(attemptId);
        },
      },
    }),
    { input: { registry } },
  ).start();

  asks[0]?.('first');
  await new Promise((resolve) => {
    setTimeout(resolve, 10);
  });
  expect(answers).toEqual(['first']);
  expect(registry.getSnapshot().status).toBe('done');

  asks[0]?.('second');
  await new Promise((resolve) => {
    setTimeout(resolve, 10);
  });

  expect(answers).toEqual(['first', 'second']);
  environment.stop();
  registry.stop();
});
