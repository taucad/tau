import type { KernelRepresentation } from '@taucad/types/constants';

/**
 * The goals an example suits: setup's goals other than "Just exploring", or `general` for a visitor who chose none.
 * These mirror `goalIds` in `@taucad/preferences`; the app checks the two agree.
 *
 * @public
 */
export const exampleGoals = ['printing', 'mechanical', 'electronics', 'product', 'art', 'general'] as const;

/** One of {@link exampleGoals}. @public */
export type ExampleGoal = (typeof exampleGoals)[number];

/**
 * A prompt Tau suggests. It names no kernel: under Auto the agent picks one from whatever is sent. `needs` names the
 * representation the example cannot be made without, for the few that have one.
 *
 * @public
 */
export type ChatExample = {
  /** Stable id, the only thing analytics records about a suggestion. */
  readonly id: string;
  readonly title: string;
  readonly prompt: string;
  readonly goals: readonly ExampleGoal[];
  readonly needs?: KernelRepresentation;
};

/** @public */
export const chatExamples: readonly ChatExample[] = [
  {
    id: 'birdhouse',
    title: 'Birdhouse',
    prompt: 'Create a birdhouse with a custom entrance hole',
    goals: ['printing', 'general'],
  },
  {
    id: 'box',
    title: 'Box',
    prompt: 'Design a hollow box with rounded corners',
    goals: ['printing', 'general'],
  },
  {
    id: 'glass',
    title: 'Glass',
    prompt: 'Create a drinking glass with custom dimensions',
    goals: ['general'],
  },
  {
    id: 'tray',
    title: 'Tray',
    prompt: 'Design a multi-compartment storage tray',
    goals: ['printing'],
  },
  {
    id: 'vase',
    title: 'Vase',
    prompt: 'Make a decorative vase with custom profiles',
    goals: ['printing', 'art'],
  },
  {
    id: 'interlocking-brick',
    title: 'Interlocking Brick',
    prompt: 'Create a custom LEGO-compatible brick',
    goals: ['printing'],
  },
  {
    id: 'storage',
    title: 'Storage',
    prompt: 'Design a Gridfinity-compatible storage box',
    goals: ['printing'],
  },
  {
    id: 'table',
    title: 'Table',
    prompt: 'Design a customizable table with specific dimensions',
    goals: ['general'],
  },
  {
    id: 'keychain',
    title: 'Keychain',
    prompt: 'Design a personalized keychain with custom text',
    goals: ['printing', 'general'],
  },
  {
    id: 'planter',
    title: 'Planter',
    prompt: 'Create a plant pot with drainage holes and saucer',
    goals: ['printing', 'general'],
  },
  {
    id: 'bookmark',
    title: 'Bookmark',
    prompt: 'Design a thin bookmark with decorative patterns',
    goals: ['printing'],
  },
  {
    id: 'phone-stand',
    title: 'Phone Stand',
    prompt: 'Create an adjustable stand for a smartphone',
    goals: ['printing', 'general'],
  },
  {
    id: 'coaster',
    title: 'Coaster',
    prompt: 'Design a set of coasters with custom patterns',
    goals: ['printing'],
  },
  {
    id: 'bottle',
    title: 'Bottle',
    prompt: 'Create a reusable water bottle with custom cap',
    goals: ['product'],
  },
  {
    id: 'pencil-holder',
    title: 'Pencil Holder',
    prompt: 'Design a desk organizer for pens and pencils',
    goals: ['printing', 'general'],
  },
  {
    id: 'lamp',
    title: 'Lamp',
    prompt: 'Create a decorative lamp shade with pattern cutouts',
    goals: ['printing', 'art'],
  },
  {
    id: 'shelf',
    title: 'Shelf',
    prompt: 'Design a wall-mounted shelf with brackets',
    goals: ['general'],
  },
  {
    id: 'bracelet',
    title: 'Bracelet',
    prompt: 'Create a flexible bracelet with interlocking segments',
    goals: ['printing', 'art'],
  },
  {
    id: 'dice',
    title: 'Dice',
    prompt: 'Design custom polyhedral dice with engraved numbers',
    goals: ['printing', 'art'],
  },
  {
    id: 'hanger',
    title: 'Hanger',
    prompt: 'Create a clothes hanger with custom hook design',
    goals: ['printing'],
  },
  {
    id: 'bowl',
    title: 'Bowl',
    prompt: 'Design a fruit bowl with decorative patterns',
    goals: ['printing'],
  },
  {
    id: 'napkin-ring',
    title: 'Napkin Ring',
    prompt: 'Create napkin holders with personalized details',
    goals: ['printing'],
  },
  {
    id: 'chess-piece',
    title: 'Chess Piece',
    prompt: 'Design a custom chess piece with unique styling',
    goals: ['art', 'printing'],
  },
  {
    id: 'cable-clip',
    title: 'Cable Clip',
    prompt: 'Create cable management clips for desk organization',
    goals: ['printing'],
  },
  {
    id: 'clock',
    title: 'Clock',
    prompt: 'Design a wall clock with custom face and hands',
    goals: ['product'],
  },
  {
    id: 'frame',
    title: 'Frame',
    prompt: 'Create a picture frame with decorative borders',
    goals: ['printing'],
  },
  {
    id: 'puzzle',
    title: 'Puzzle',
    prompt: 'Design interlocking 3D puzzle pieces',
    goals: ['printing'],
  },
  {
    id: 'whistle',
    title: 'Whistle',
    prompt: 'Create a functional whistle with custom mouthpiece',
    goals: ['printing'],
  },
];

/**
 * Three examples at random, as the project chat's empty state shows them while onboarding is off.
 *
 * @param count - How many.
 * @returns The examples.
 * @public
 */
export const getRandomExamples = (count = 3): ChatExample[] => {
  const shuffled = [...chatExamples].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(count, shuffled.length));
};
