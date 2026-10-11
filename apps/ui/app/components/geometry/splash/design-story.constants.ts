import { geospecRun } from '@taucad/planetary-gearbox';

const { passed, failed, inconclusive } = geospecRun.summary;

/** Milliseconds. Geometry and UI transitions share the design motion ceiling. */
export const storyTransitionDuration = 500;
/** The sentence the homepage story starts from; the whole gearbox follows from it. */
export const storyPrompt = 'Create a planetary gearbox with a 4:1 reduction, three planets and socket screws on top.';
/** The three illustrative tasks the homepage story splits the parts into. */
export const storyLanes = [
  ['Ring', 'Internal ring gear · 72 teeth'],
  ['Gear train', 'Sun · 3 planets · bushings'],
  ['Carrier & hardware', '2 carriers · pins · spacers · screws'],
] as const;
/**
 * The homepage gearbox story, chapter for chapter, on Tau's authored 34-part example: from a
 * sentence to the print bed. Copy mirrors apps/www so the app and the site sell one story.
 */
export const storySteps = [
  {
    id: 'prompt',
    label: 'Prompt',
    title: 'Say it in a sentence.',
    detail: '4:1 reduction · 174 mm rim · M3 socket screws',
    start: 0,
    end: 5000,
  },
  {
    id: 'parts',
    label: 'Parts',
    title: 'Every part gets its own task.',
    detail: 'Ring gear · Gear train · Carrier & hardware · Illustration of a design session',
    start: 5000,
    end: 10_000,
  },
  {
    id: 'geometry',
    label: 'Geometry',
    title: 'Code becomes geometry.',
    detail: '34 solids · 24 / 24 / 72 teeth · One parametric Replicad source',
    start: 10_000,
    end: 15_500,
  },
  {
    id: 'assembly',
    label: 'Assembly',
    title: 'Then it goes together.',
    detail: 'Fixed ring · sun input · carrier output · Sun 360° → Carrier 90°',
    start: 15_500,
    end: 22_500,
  },
  {
    id: 'parameter',
    label: 'Parameter',
    title: 'Change one number.',
    detail: 'faceWidth 14 → 18 mm · Axial envelope 68 → 72 mm',
    start: 22_500,
    end: 27_500,
  },
  {
    id: 'evidence',
    label: 'Evidence',
    title: 'Check it against the requirements.',
    detail: `Recorded GeoSpec run · ${passed} passed · ${failed} failed · ${inconclusive} inconclusive`,
    start: 27_500,
    end: 33_000,
  },
  {
    id: 'print',
    label: 'Print',
    title: 'Prepare it for the printer.',
    detail: 'Ring gear on a 256 mm build plate · Illustration · no print job is sent',
    start: 33_000,
    end: 40_000,
  },
] as const;
/** Milliseconds; the return from print to the prompt is the seventh boundary. */
export const storyDuration = 40_000;
export type StoryBeat = (typeof storySteps)[number]['id'];
