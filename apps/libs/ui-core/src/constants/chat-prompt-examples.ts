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
  {
    id: 'wall-hook',
    title: 'Wall Hook',
    prompt: 'A wall hook that holds 5 kg and prints without supports',
    goals: ['printing'],
  },
  {
    id: 'battery-box',
    title: 'Battery Box',
    prompt: 'A snap-fit box for an 18650 cell',
    goals: ['printing'],
  },
  {
    id: 'l-bracket',
    title: 'L-Bracket',
    prompt: 'An L-bracket with four M4 clearance holes',
    goals: ['mechanical'],
  },
  {
    id: 'planetary-gear-set',
    title: 'Planetary Gears',
    prompt: 'A planetary gear set, 4:1, module 1',
    goals: ['mechanical'],
  },
  {
    id: 'shaft-coupler',
    title: 'Shaft Coupler',
    prompt: 'A shaft coupler for a 5 mm and an 8 mm shaft with M3 set screws',
    goals: ['mechanical'],
  },
  {
    id: 'bearing-block',
    title: 'Bearing Block',
    prompt: 'A pillow block that holds a 608 bearing, with two M5 mounting holes',
    goals: ['mechanical'],
  },
  {
    id: 'pin-hinge',
    title: 'Pin Hinge',
    prompt: 'A two-part pin hinge, 40 mm long, with a 3 mm pin',
    goals: ['mechanical', 'printing'],
  },
  {
    id: 'usb-c-breakout',
    title: 'USB-C Breakout',
    prompt: 'A USB-C breakout board with a 3.3 V regulator',
    goals: ['electronics'],
    needs: 'electronics',
  },
  {
    id: '555-blinker',
    title: '555 Blinker',
    prompt: 'A 555 blinker on a 30 mm round board',
    goals: ['electronics'],
    needs: 'electronics',
  },
  {
    id: 'led-matrix-board',
    title: 'LED Matrix',
    prompt: 'An 8 × 8 LED matrix board with a header for a microcontroller',
    goals: ['electronics'],
    needs: 'electronics',
  },
  {
    id: 'sensor-breakout',
    title: 'Sensor Breakout',
    prompt: 'A breakout board for an I2C temperature sensor with pull-up resistors',
    goals: ['electronics'],
    needs: 'electronics',
  },
  {
    id: 'board-enclosure',
    title: 'Board Enclosure',
    prompt: 'An enclosure that fits a 60 × 40 mm board with a USB-C cutout',
    goals: ['product', 'printing'],
  },
  {
    id: 'remote-shell',
    title: 'Remote Shell',
    prompt: 'A handheld remote shell with a battery door',
    goals: ['product'],
  },
  {
    id: 'sensor-housing',
    title: 'Sensor Housing',
    prompt: 'A wall-mounted sensor housing with vent slots and a cable hole',
    goals: ['product'],
  },
  {
    id: 'treasure-chest',
    title: 'Treasure Chest',
    prompt: 'A low-poly treasure chest with a hinged lid',
    goals: ['art'],
  },
  {
    id: 'sci-fi-wall-panel',
    title: 'Sci-Fi Wall Panel',
    prompt: 'A modular sci-fi wall panel, 2 m wide',
    goals: ['art'],
  },
  {
    id: 'sci-fi-crate',
    title: 'Sci-Fi Crate',
    prompt: 'A hard-surface sci-fi crate with panel lines and handles',
    goals: ['art'],
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
