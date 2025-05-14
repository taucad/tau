export type ChatExample = {
  title: string;
  prompt: string;
};

export const chatExamples: ChatExample[] = [
  {
    title: 'Birdhouse',
    prompt: 'Create a birdhouse with a custom entrance hole',
  },
  {
    title: 'Box',
    prompt: 'Design a hollow box with rounded corners',
  },
  {
    title: 'Glass',
    prompt: 'Create a drinking glass with custom dimensions',
  },
  {
    title: 'Tray',
    prompt: 'Design a multi-compartment storage tray',
  },
  {
    title: 'Vase',
    prompt: 'Make a decorative vase with custom profiles',
  },
  {
    title: 'Lego',
    prompt: 'Create a custom LEGO-compatible brick',
  },
  {
    title: 'Storage',
    prompt: 'Design a Gridfinity-compatible storage box',
  },
  {
    title: 'Table',
    prompt: 'Design a customizable table with specific dimensions',
  },
  {
    title: 'Keychain',
    prompt: 'Design a personalized keychain with custom text',
  },
  {
    title: 'Planter',
    prompt: 'Create a plant pot with drainage holes and saucer',
  },
  {
    title: 'Bookmark',
    prompt: 'Design a thin bookmark with decorative patterns',
  },
  {
    title: 'Phone Stand',
    prompt: 'Create an adjustable stand for a smartphone',
  },
  {
    title: 'Coaster',
    prompt: 'Design a set of coasters with custom patterns',
  },
  {
    title: 'Bottle',
    prompt: 'Create a reusable water bottle with custom cap',
  },
  {
    title: 'Pencil Holder',
    prompt: 'Design a desk organizer for pens and pencils',
  },
  {
    title: 'Lamp',
    prompt: 'Create a decorative lamp shade with pattern cutouts',
  },
  {
    title: 'Shelf',
    prompt: 'Design a wall-mounted shelf with brackets',
  },
  {
    title: 'Bracelet',
    prompt: 'Create a flexible bracelet with interlocking segments',
  },
  {
    title: 'Dice',
    prompt: 'Design custom polyhedral dice with engraved numbers',
  },
  {
    title: 'Hanger',
    prompt: 'Create a clothes hanger with custom hook design',
  },
  {
    title: 'Bowl',
    prompt: 'Design a fruit bowl with decorative patterns',
  },
  {
    title: 'Napkin Ring',
    prompt: 'Create napkin holders with personalized details',
  },
  {
    title: 'Chess Piece',
    prompt: 'Design a custom chess piece with unique styling',
  },
  {
    title: 'Cable Clip',
    prompt: 'Create cable management clips for desk organization',
  },
  {
    title: 'Clock',
    prompt: 'Design a wall clock with custom face and hands',
  },
  {
    title: 'Frame',
    prompt: 'Create a picture frame with decorative borders',
  },
  {
    title: 'Puzzle',
    prompt: 'Design interlocking 3D puzzle pieces',
  },
  {
    title: 'Whistle',
    prompt: 'Create a functional whistle with custom mouthpiece',
  },
];

export const getRandomExamples = (count = 3): ChatExample[] => {
  const shuffled = [...chatExamples].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(count, shuffled.length));
};
