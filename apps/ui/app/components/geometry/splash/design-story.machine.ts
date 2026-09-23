import { setup, types } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import { storyDuration } from '#components/geometry/splash/design-story.constants.js';
import { eventSchemas } from '#lib/xstate.lib.js';

type StoryContext = { elapsed: number };
type StoryEvent = { type: 'advance'; delta: number } | { type: 'play' } | { type: 'pause' };
type StoryInput = Record<string, never>;

/** One clock owns every visual, including the loop seam. Milliseconds. */
export const designStoryMachine = setup({
  schemas: {
    context: types<StoryContext>(),
    events: eventSchemas<StoryEvent>(),
    input: types<StoryInput>(),
  },
}).createMachine({
  id: 'design-story',
  initial: 'paused',
  context: { elapsed: 0 },
  states: {
    paused: { on: { play: { target: 'playing' } } },
    playing: {
      on: {
        pause: { target: 'paused' },
        advance: {
          context: ({ context, event }) => ({
            elapsed:
              Number.isFinite(event.delta) && event.delta > 0
                ? (context.elapsed + Math.min(event.delta, 100)) % storyDuration
                : context.elapsed,
          }),
        },
      },
    },
  },
});

export type DesignStoryActor = ActorRefFrom<typeof designStoryMachine>;
