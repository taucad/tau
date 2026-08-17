import type { KernelProvider } from '@taucad/runtime';

export type ChatExample = {
  title: string;
  prompt: string;
  kernel: KernelProvider;
};

export const chatExamples: ChatExample[] = [
  {
    title: 'Birdhouse',
    prompt: 'Create a birdhouse with a custom entrance hole',
    kernel: 'openrscad',
  },
  {
    title: 'Box',
    prompt: 'Design a hollow box with rounded corners',
    kernel: 'openrscad',
  },
  {
    title: 'Glass',
    prompt: 'Create a drinking glass with custom dimensions',
    kernel: 'openrscad',
  },
  {
    title: 'Tray',
    prompt: 'Design a multi-compartment storage tray',
    kernel: 'openrscad',
  },
  {
    title: 'Vase',
    prompt: 'Make a decorative vase with custom profiles',
    kernel: 'openrscad',
  },
  {
    title: 'Interlocking Brick',
    prompt: 'Create a custom LEGO-compatible brick',
    kernel: 'openrscad',
  },
  {
    title: 'Storage',
    prompt: 'Design a Gridfinity-compatible storage box',
    kernel: 'openrscad',
  },
  {
    title: 'Table',
    prompt: 'Design a customizable table with specific dimensions',
    kernel: 'openrscad',
  },
  {
    title: 'Keychain',
    prompt: 'Design a personalized keychain with custom text',
    kernel: 'openrscad',
  },
  {
    title: 'Planter',
    prompt: 'Create a plant pot with drainage holes and saucer',
    kernel: 'openrscad',
  },
  {
    title: 'Bookmark',
    prompt: 'Design a thin bookmark with decorative patterns',
    kernel: 'openrscad',
  },
  {
    title: 'Phone Stand',
    prompt: 'Create an adjustable stand for a smartphone',
    kernel: 'openrscad',
  },
  {
    title: 'Coaster',
    prompt: 'Design a set of coasters with custom patterns',
    kernel: 'openrscad',
  },
  {
    title: 'Bottle',
    prompt: 'Create a reusable water bottle with custom cap',
    kernel: 'openrscad',
  },
  {
    title: 'Pencil Holder',
    prompt: 'Design a desk organizer for pens and pencils',
    kernel: 'openrscad',
  },
  {
    title: 'Lamp',
    prompt: 'Create a decorative lamp shade with pattern cutouts',
    kernel: 'openrscad',
  },
  {
    title: 'Shelf',
    prompt: 'Design a wall-mounted shelf with brackets',
    kernel: 'openrscad',
  },
  {
    title: 'Bracelet',
    prompt: 'Create a flexible bracelet with interlocking segments',
    kernel: 'openrscad',
  },
  {
    title: 'Dice',
    prompt: 'Design custom polyhedral dice with engraved numbers',
    kernel: 'openrscad',
  },
  {
    title: 'Hanger',
    prompt: 'Create a clothes hanger with custom hook design',
    kernel: 'openrscad',
  },
  {
    title: 'Bowl',
    prompt: 'Design a fruit bowl with decorative patterns',
    kernel: 'openrscad',
  },
  {
    title: 'Napkin Ring',
    prompt: 'Create napkin holders with personalized details',
    kernel: 'openrscad',
  },
  {
    title: 'Chess Piece',
    prompt: 'Design a custom chess piece with unique styling',
    kernel: 'openrscad',
  },
  {
    title: 'Cable Clip',
    prompt: 'Create cable management clips for desk organization',
    kernel: 'openrscad',
  },
  {
    title: 'Clock',
    prompt: 'Design a wall clock with custom face and hands',
    kernel: 'openrscad',
  },
  {
    title: 'Frame',
    prompt: 'Create a picture frame with decorative borders',
    kernel: 'openrscad',
  },
  {
    title: 'Puzzle',
    prompt: 'Design interlocking 3D puzzle pieces',
    kernel: 'openrscad',
  },
  {
    title: 'Whistle',
    prompt: 'Create a functional whistle with custom mouthpiece',
    kernel: 'openrscad',
  },
];

export const getRandomExamples = (count = 3): ChatExample[] => {
  const shuffled = [...chatExamples].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(count, shuffled.length));
};
