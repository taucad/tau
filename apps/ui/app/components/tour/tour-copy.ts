/**
 * Every string the product tour shows, as data and functions over the person's answers, so one module can be read and
 * audited on its own. No tip is longer than three sentences.
 */

import type { GoalId, TourStepId } from '@taucad/preferences';
import type { CameraMappingId } from '@taucad/viewer/graphics/three/controls/camera-presets';
import type { GizmoChoiceId } from '#components/onboarding/setup-copy.js';
import { legendBindings } from '#components/onboarding/setup-model.js';
import type { LegendBinding } from '#components/onboarding/setup-model.js';

/** How the project was reached: an empty project, or a prompt already sent from Home. */
export type TourCopyArrival = 'empty' | 'prompt';

/** What the copy reads about the person and the project. */
export type TourCopyInput = Readonly<{
  mode: 'guided' | 'replay';
  arrival: TourCopyArrival;
  goals: readonly GoalId[];
  /** The mapping the viewer applies: the person's preset, or trackpad gestures on this device. */
  mapping: CameraMappingId;
  /** The gizmo style in effect, or None. */
  gizmo: GizmoChoiceId;
  /** The formats the active entry's kernel writes: the list the Export pane shows. */
  formats: readonly string[];
  host: 'browser' | 'desktop';
  /** The transcript holds a row with a test run. */
  hasTestRun: boolean;
}>;

/** One tip's content. */
export type TourTipCopy = Readonly<{
  title: string;
  /** The tip's sentences, in order. */
  text: readonly string[];
  /** Look around: the person's own orbit, pan and zoom bindings as key caps. */
  bindings?: Readonly<Record<'orbit' | 'pan' | 'zoom', readonly LegendBinding[]>>;
  /** Look around: the link to Settings → Viewer. */
  link?: string;
  /** Verify with no test run: the button that fills the composer. */
  action?: string;
  /** Guided only: the line under the text, saying what to do. */
  tryIt?: string;
}>;

/** The five titles, in order. */
export const tourStepTitles: Readonly<Record<TourStepId, string>> = {
  ask: 'Describe what you want',
  look: 'Look around',
  adjust: 'Change it without asking again',
  verify: 'Check it against what you need',
  build: 'Export and make it',
};

/** What "Ask Tau to check it" puts in the composer. It is never sent for the person. */
export const tourCheckPrompt = 'Check this part against the sizes I gave';

/** The gestures, as the tip names them. */
export const tourGestureCopy = { orbit: 'Orbit', pan: 'Pan', zoom: 'Zoom' } as const;

/** People who make boards and enclosures, or whole products, may hold several models in one project. */
const makesSeveralModels = (goals: readonly GoalId[]): boolean =>
  goals.includes('electronics') || goals.includes('product');

/**
 * Join formats as a sentence lists them: "STEP, STL and 3MF".
 *
 * @param formats - The formats.
 * @returns The list.
 */
export const formatList = (formats: readonly string[]): string =>
  formats.length < 2 ? (formats[0] ?? '') : `${formats.slice(0, -1).join(', ')} and ${formats.at(-1) ?? ''}`;

const gizmoName = (gizmo: GizmoChoiceId): string => (gizmo === 'axis-balls' ? 'axis balls' : 'cube');

/**
 * The content of one tip.
 *
 * @param step - The tip.
 * @param input - The person, the project and how the tour runs.
 * @returns Its title, text, and any link, button and line under it.
 */
export const tourTipCopy = (step: TourStepId, input: TourCopyInput): TourTipCopy => {
  const isGuided = input.mode === 'guided';
  const tryIt = (line: string): Pick<TourTipCopy, 'tryIt'> => (isGuided ? { tryIt: line } : {});
  switch (step) {
    case 'ask': {
      const fromHome = isGuided && input.arrival === 'prompt';
      const third = makesSeveralModels(input.goals)
        ? 'A board and its enclosure can live in one project; each model has its own kernel.'
        : 'You can pick a kernel yourself from the Auto menu.';
      return fromHome
        ? {
            title: 'Tau is building your part',
            text: [
              'Tau picked a kernel, the engine that builds the geometry, and is writing the code.',
              'Ask for changes here at any time.',
              third,
            ],
            ...tryIt('The next tip appears when the model does'),
          }
        : {
            title: tourStepTitles.ask,
            text: [
              'Say what the part does and the sizes that matter.',
              'Tau picks the kernel, the engine that builds the geometry, tells you which one and why, and writes the code.',
              third,
            ],
            ...tryIt('Press Send to build this example'),
          };
    }
    case 'look': {
      const bindings = legendBindings(input.mapping);
      return {
        title: tourStepTitles.look,
        text: [
          input.gizmo === 'none' || input.gizmo === 'axes'
            ? 'Press F to fit the model in view.'
            : `Click the ${gizmoName(input.gizmo)} in the corner to snap to a standard view.`,
        ],
        bindings: { orbit: bindings.orbit, pan: bindings.pan, zoom: bindings.zoom },
        link: 'Change controls',
        ...tryIt('Drag in the view, or use the arrow buttons under it'),
      };
    }
    case 'adjust': {
      return {
        title: tourStepTitles.adjust,
        text: [
          'Parameters are the model’s named dimensions.',
          'Change one and the model rebuilds.',
          'The code is one tab away when you want it.',
        ],
        ...tryIt('Move a slider or type a value'),
      };
    }
    case 'verify': {
      return input.hasTestRun
        ? {
            title: tourStepTitles.verify,
            text: [
              'Tau wrote checks for the sizes you gave and ran them with GeoSpec.',
              'A check passes, fails, or is marked as not measurable.',
              'Nothing is guessed.',
            ],
            ...tryIt('Open this row to see each check'),
          }
        : {
            title: tourStepTitles.verify,
            text: [
              'Tau can check a part against the sizes you gave with GeoSpec.',
              'A check passes, fails, or is marked as not measurable.',
              'Nothing is guessed.',
            ],
            action: 'Ask Tau to check it',
            ...tryIt('Ask for a check when you want one'),
          };
    }
    case 'build': {
      return {
        title: tourStepTitles.build,
        text: [
          input.formats.length === 0
            ? 'Export writes the formats this model’s kernel offers.'
            : `Export writes the formats this model’s kernel offers: ${formatList(input.formats)}.`,
          ...(input.host === 'desktop' ? ['Save it to a folder or straight into the project.'] : []),
          'The source stays in the project, so you can revise the part after testing it.',
        ],
        ...tryIt('Press Export'),
      };
    }
  }
};

/** The concept each tip belongs to. */
export const tourConceptCopy: Readonly<Record<TourStepId, 'Design' | 'Verify' | 'Build'>> = {
  ask: 'Design',
  look: 'Design',
  adjust: 'Design',
  verify: 'Verify',
  build: 'Build',
};

/** The command palette's shortcut, as the tip shows it beside its position. */
export const tourPaletteHint = (platform: 'mac' | 'other'): string =>
  `${platform === 'mac' ? '⌘K' : 'Ctrl K'}, then Go to tour tip`;

/**
 * The tip's accessible name: the tip and its position.
 *
 * @param index - Zero-based position.
 * @param title - The tip's title.
 * @returns The name.
 */
export const tourTipLabel = (index: number, title: string): string => `Tour tip ${index + 1} of 5: ${title}`;

/** The coach mark's controls and the tour's announcements. */
export const tourChromeCopy = {
  next: 'Next',
  done: 'Done',
  back: 'Back',
  skip: 'Skip tour',
  close: 'Close',
  pause: 'Pause tour',
  closeTour: 'Close tour',
  showMe: 'Show me',
  position: (index: number): string => `${index + 1} of 5`,
  announceTip: (index: number, title: string, mode: 'guided' | 'replay'): string =>
    mode === 'guided'
      ? `Tip ${index + 1} of 5: ${title}. To go to it, open the command palette and choose Go to tour tip.`
      : `Tip ${index + 1} of 5: ${title}.`,
  paused: (tipNumber: number): string => `Tour paused at tip ${tipNumber}. Resume it from Help.`,
  skipped: 'Tour skipped. Take it any time from Help.',
  finished: 'Tour finished. Take it again from Help.',
  replayClosed: 'Tour closed. Take it any time from Help.',
} as const;

/** Help's one tour item, by state, and the command palette's entries. */
export const tourMenuCopy = {
  pause: 'Pause tour',
  resume: (tipNumber: number): string => `Resume tour (tip ${tipNumber} of 5)`,
  close: 'Close tour',
  take: 'Take the tour',
  goToTip: 'Go to tour tip',
  returnFromTip: 'Return from tour tip',
} as const;
