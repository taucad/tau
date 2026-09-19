/** Milliseconds; the return from print to create is the fifth boundary. */
export const storyDuration = 28_000;
/** Milliseconds. Geometry and UI transitions share the design motion ceiling. */
export const storyTransitionDuration = 500;
export const storyColors = {
  teal: '#14b8a6',
  blue: '#5B8FD9',
  housing: '#9ca9b6',
  ring: '#526575',
  carrier: '#bdcbd5',
  bolt: '#61717f',
  printer: '#758da0',
  bed: '#9fb8c2',
};
export const storySteps = [
  {
    id: 'create',
    label: 'Create',
    prompt: 'Create a planetary gearbox.',
    detail: '14 parts. One parametric design.',
    start: 0,
    end: 5000,
  },
  {
    id: 'check',
    label: 'Check',
    prompt: 'Make sure it fits my printer bed.',
    detail: 'GeoSpec · 252 mm / 236 mm usable · Doesn’t fit',
    start: 5000,
    end: 10_000,
  },
  {
    id: 'refine',
    label: 'Refine',
    prompt: 'Reduce module. Keep the 4:1 ratio.',
    detail: 'Module 3.5 → 3.0 mm · GeoSpec · 220 mm · Fits',
    start: 10_000,
    end: 15_000,
  },
  {
    id: 'assemble',
    label: 'Assemble',
    prompt: 'Assemble and check the clearances.',
    detail: 'Fixed ring · Three planets · 4:1 reduction',
    start: 15_000,
    end: 21_000,
  },
  {
    id: 'print',
    label: 'Print',
    prompt: 'Prepare the housing for print.',
    detail: 'Print workflow preview · Housing only',
    start: 21_000,
    end: 28_000,
  },
] as const;
export type StoryBeat = (typeof storySteps)[number]['id'];
