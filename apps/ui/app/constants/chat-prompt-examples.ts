import type { KernelProvider } from '~/types/kernel.types.js';

export type ChatExample = {
  title: string;
  prompt: string;
  kernel: KernelProvider;
};

export const chatExamples: ChatExample[] = [
  {
    title: 'Birdhouse',
    prompt: 'Create a birdhouse with a custom entrance hole',
    kernel: 'openscad',
  },
  {
    title: 'Box',
    prompt: 'Design a hollow box with rounded corners',
    kernel: 'openscad',
  },
  {
    title: 'Glass',
    prompt: 'Create a drinking glass with custom dimensions',
    kernel: 'openscad',
  },
  {
    title: 'Tray',
    prompt: 'Design a multi-compartment storage tray',
    kernel: 'openscad',
  },
  {
    title: 'Vase',
    prompt: 'Make a decorative vase with custom profiles',
    kernel: 'openscad',
  },
  {
    title: 'Lego',
    prompt: 'Create a custom LEGO-compatible brick',
    kernel: 'openscad',
  },
  {
    title: 'Storage',
    prompt: 'Design a Gridfinity-compatible storage box',
    kernel: 'openscad',
  },
  {
    title: 'Table',
    prompt: 'Design a customizable table with specific dimensions',
    kernel: 'openscad',
  },
  {
    title: 'Keychain',
    prompt: 'Design a personalized keychain with custom text',
    kernel: 'openscad',
  },
  {
    title: 'Planter',
    prompt: 'Create a plant pot with drainage holes and saucer',
    kernel: 'openscad',
  },
  {
    title: 'Bookmark',
    prompt: 'Design a thin bookmark with decorative patterns',
    kernel: 'openscad',
  },
  {
    title: 'Phone Stand',
    prompt: 'Create an adjustable stand for a smartphone',
    kernel: 'openscad',
  },
  {
    title: 'Coaster',
    prompt: 'Design a set of coasters with custom patterns',
    kernel: 'openscad',
  },
  {
    title: 'Bottle',
    prompt: 'Create a reusable water bottle with custom cap',
    kernel: 'openscad',
  },
  {
    title: 'Pencil Holder',
    prompt: 'Design a desk organizer for pens and pencils',
    kernel: 'openscad',
  },
  {
    title: 'Lamp',
    prompt: 'Create a decorative lamp shade with pattern cutouts',
    kernel: 'openscad',
  },
  {
    title: 'Shelf',
    prompt: 'Design a wall-mounted shelf with brackets',
    kernel: 'openscad',
  },
  {
    title: 'Bracelet',
    prompt: 'Create a flexible bracelet with interlocking segments',
    kernel: 'openscad',
  },
  {
    title: 'Dice',
    prompt: 'Design custom polyhedral dice with engraved numbers',
    kernel: 'openscad',
  },
  {
    title: 'Hanger',
    prompt: 'Create a clothes hanger with custom hook design',
    kernel: 'openscad',
  },
  {
    title: 'Bowl',
    prompt: 'Design a fruit bowl with decorative patterns',
    kernel: 'openscad',
  },
  {
    title: 'Napkin Ring',
    prompt: 'Create napkin holders with personalized details',
    kernel: 'openscad',
  },
  {
    title: 'Chess Piece',
    prompt: 'Design a custom chess piece with unique styling',
    kernel: 'openscad',
  },
  {
    title: 'Cable Clip',
    prompt: 'Create cable management clips for desk organization',
    kernel: 'openscad',
  },
  {
    title: 'Clock',
    prompt: 'Design a wall clock with custom face and hands',
    kernel: 'openscad',
  },
  {
    title: 'Frame',
    prompt: 'Create a picture frame with decorative borders',
    kernel: 'openscad',
  },
  {
    title: 'Puzzle',
    prompt: 'Design interlocking 3D puzzle pieces',
    kernel: 'openscad',
  },
  {
    title: 'Whistle',
    prompt: 'Create a functional whistle with custom mouthpiece',
    kernel: 'openscad',
  },
];

export const getRandomExamples = (count = 3): ChatExample[] => {
  const shuffled = [...chatExamples].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(count, shuffled.length));
};
