import { assign, setup } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import { storyDuration } from '#components/geometry/splash/design-story.constants.js';

type StoryContext = { elapsed: number };
type StoryEvent = { type: 'advance'; delta: number } | { type: 'play' } | { type: 'pause' };
type StoryInput = Record<string, never>;

/** One clock owns every visual, including the loop seam. Milliseconds. */
export const designStoryMachine = setup({
  types: {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- XState setup type declaration.
    context: {} as StoryContext,
    // oxlint-disable-next-line typescript/consistent-type-assertions -- XState setup type declaration.
    events: {} as StoryEvent,
    // oxlint-disable-next-line typescript/consistent-type-assertions -- XState setup type declaration.
    input: {} as StoryInput,
  },
  actions: {
    advance: assign({
      elapsed: ({ context, event }) =>
        event.type === 'advance' && Number.isFinite(event.delta) && event.delta > 0
          ? (context.elapsed + Math.min(event.delta, 100)) % storyDuration
          : context.elapsed,
    }),
  },
}).createMachine({
  id: 'design-story',
  initial: 'paused',
  context: { elapsed: 0 },
  states: {
    paused: { on: { play: 'playing' } },
    playing: { on: { pause: 'paused', advance: { actions: 'advance' } } },
  },
});

export type DesignStoryActor = ActorRefFrom<typeof designStoryMachine>;
