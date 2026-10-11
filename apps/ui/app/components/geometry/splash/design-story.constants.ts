import { geospecRun } from '@taucad/planetary-gearbox';

const { passed, failed, inconclusive } = geospecRun.summary;

/** Milliseconds; the return from print to create is the fifth boundary. */
export const storyDuration = 28_000;
/** Milliseconds. Geometry and UI transitions share the design motion ceiling. */
export const storyTransitionDuration = 500;
/** The homepage gearbox story in five beats, on Tau's authored 34-part example. */
export const storySteps = [
  {
    id: 'create',
    label: 'Create',
    prompt: 'Create a planetary gearbox with a 4:1 reduction.',
    detail: '34 parts · One parametric Replicad design',
    start: 0,
    end: 5000,
  },
  {
    id: 'assemble',
    label: 'Assemble',
    prompt: 'Assemble it and turn the input.',
    detail: 'Fixed ring · Sun 360° → Carrier 90° · 4:1',
    start: 5000,
    end: 11_000,
  },
  {
    id: 'refine',
    label: 'Refine',
    prompt: 'Make the gears 18 mm wide.',
    detail: 'faceWidth 14 → 18 mm · Axial envelope 68 → 72 mm',
    start: 11_000,
    end: 16_000,
  },
  {
    id: 'check',
    label: 'Check',
    prompt: 'Check it with GeoSpec.',
    detail: `Recorded GeoSpec run · ${passed} passed · ${failed} failed · ${inconclusive} inconclusive`,
    start: 16_000,
    end: 21_000,
  },
  {
    id: 'print',
    label: 'Print',
    prompt: 'Prepare the ring gear for print.',
    detail: 'Print workflow preview · Ring gear only · No job is sent',
    start: 21_000,
    end: 28_000,
  },
] as const;
export type StoryBeat = (typeof storySteps)[number]['id'];
