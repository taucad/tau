/**
 * Setup copy, as data. Every string setup shows lives here, so an audit reads one module and a
 * later translation replaces one module. Nothing is built by concatenating fragments of a sentence.
 */
import type { GizmoStyleId, GoalId, LanguageId, MousePresetId, ToolId } from '@taucad/preferences';
import type { CameraGesture } from '@taucad/viewer/graphics/three/controls/camera-presets';
import { gizmoStyleCopy, mousePresetCopy } from '#components/settings/viewer/viewer-settings-copy.js';

/** The setup steps, in order. `viewer` is left out while `viewerControls` is off. */
export const setupStepIds = ['goals', 'background', 'viewer', 'how'] as const;

/** One of {@link setupStepIds}. */
export type SetupStepId = (typeof setupStepIds)[number];

/** Each step's name in the progress list and its heading. */
export const setupStepCopy: Readonly<Record<SetupStepId, Readonly<{ name: string; heading: string; intro: string }>>> =
  {
    goals: {
      name: 'What you make',
      heading: 'What do you want to make?',
      intro: 'Pick any that fit. Tau works for all of them; this sets where it starts.',
    },
    background: {
      name: 'Where you come from',
      heading: 'Where are you coming from?',
      intro: 'Tau sets the mouse controls to match the tool you know best.',
    },
    viewer: {
      name: 'Viewer',
      heading: 'Make the viewer feel like home',
      intro: 'Try the controls in the preview. You can change them later in Settings.',
    },
    how: {
      name: 'How Tau works',
      heading: 'Design, verify, build',
      intro: 'The three things you do in Tau, in the order you do them.',
    },
  };

/** The header, the progress list and the footer. */
export const setupChromeCopy = {
  pageTitle: 'Set up Tau',
  stepsLabel: 'Setup steps',
  skip: 'Skip setup',
  back: 'Back',
  continue: 'Continue',
  finish: 'Finish',
  stepDone: 'done',
  stepCurrent: 'current',
} as const;

/**
 * The progress line under the step bars.
 *
 * @param position - The current step, counted from 1.
 * @param total - How many steps setup has.
 * @returns The line.
 */
export const stepCountLabel = (position: number, total: number): string => `${position} of ${total}`;

/** Where the answers are saved (launch: the device only), and the line when the browser refused the write. */
export const setupStorageCopy = {
  saved: 'Your choices are saved on this device.',
  refused: 'Tau could not save this on this device. Your choices apply until you close Tau.',
} as const;

/** Step 1's six goals, in order. */
export const goalCopy: Readonly<Record<GoalId, Readonly<{ label: string; hint: string }>>> = {
  printing: { label: '3D printing', hint: 'Parts, fixtures and enclosures for a printer' },
  mechanical: { label: 'Mechanical parts', hint: 'Machined parts, assemblies and mechanisms' },
  electronics: { label: 'Electronics', hint: 'Circuits, boards and their enclosures' },
  product: { label: 'Hardware products', hint: 'A whole device: mechanics, electronics and fit' },
  art: { label: '3D art and game props', hint: 'Props, hard-surface models and stylised shapes, exported as GLB' },
  exploring: { label: 'Just exploring', hint: 'No project yet' },
};

/** Step 2's twelve tools, in order. */
export const toolCopy: Readonly<Record<ToolId, string>> = {
  new: "I'm new to 3D tools",
  tinkercad: 'Tinkercad',
  slicer: 'A slicer (Bambu Studio, PrusaSlicer, Cura)',
  openscad: 'OpenSCAD',
  fusion: 'Fusion or Inventor',
  solidworks: 'SolidWorks',
  onshape: 'Onshape',
  blender: 'Blender',
  'nx-creo': 'NX or Creo',
  'game-engine': 'Maya, Unity or Unreal',
  kicad: 'KiCad or another ECAD tool',
  other: 'Something else',
};

/** Step 2's languages, in order. `none` is exclusive. */
export const languageCopy: Readonly<Record<LanguageId, string>> = {
  typescript: 'TypeScript or JavaScript',
  python: 'Python',
  openscad: 'OpenSCAD',
  csharp: 'C#',
  none: "I'd rather not write code",
};

/** Step 2's labels. */
export const backgroundCopy = {
  toolsLabel: 'The 3D tool you know best',
  languagesLabel: 'Do you write code?',
  languagesHint: 'Tau writes the code either way. This tells the agent which languages you can read and edit.',
} as const;

/** The "What your answers change" panel. */
export const answersPanelCopy = {
  title: 'What your answers change',
  agent: 'Agent',
  viewer: 'Viewer',
  home: 'Home',
  agentDefault: 'Picks the kernel from each prompt',
  viewerDefault: 'Tau default controls',
  storage:
    'What the agent is told is saved with your chats in the project, where people you share it with can read it. Turn it off in Settings, under Agents.',
} as const;

/**
 * The Agent row: what the agent is told, and nothing more. No copy names a kernel or a kernel family.
 *
 * @param parts - What the person told setup, as label lists.
 * @returns The row's text, or `undefined` when nothing was told.
 */
export const agentRowText = (
  parts: Readonly<{ makes: readonly string[]; reads: readonly string[]; noCode: boolean }>,
): string | undefined => {
  const makes = parts.makes.length > 0 ? `what you make (${parts.makes.join(', ')})` : undefined;
  let reads: string | undefined;
  if (parts.reads.length > 0) {
    reads = `the code you read (${parts.reads.join(', ')})`;
  } else if (parts.noCode) {
    reads = 'that you would rather not write code';
  }
  if (makes !== undefined && reads !== undefined) {
    return `Knows ${makes} and ${reads} when it picks a kernel`;
  }
  const only = makes ?? reads;
  return only === undefined ? undefined : `Knows ${only} when it picks a kernel`;
};

/** The short name each language has in the Agent row. */
export const languageShortName: Readonly<Record<Exclude<LanguageId, 'none'>, string>> = {
  typescript: 'TypeScript',
  python: 'Python',
  openscad: 'OpenSCAD',
  csharp: 'C#',
};

/**
 * The host line: a chosen language with no kernel on this host. It states availability only.
 *
 * @param languages - The short names of the missing languages.
 * @param isDesktopAvailable - Whether the desktop app has a kernel for each of them.
 * @returns The line.
 */
export const hostLineText = (languages: readonly string[], isDesktopAvailable: boolean): string => {
  const names = languages.join(' or ');
  return isDesktopAvailable
    ? `No ${names} kernel is available in the browser yet. The desktop app has one.`
    : `No ${names} kernel is available in the browser yet.`;
};

/**
 * The Viewer row once a preset is in effect.
 *
 * @param preset - The preset's name.
 * @param gizmo - The gizmo style's name, or "no" for None.
 * @returns The row's text.
 */
export const viewerRowText = (preset: string, gizmo: string): string => `${preset}, ${gizmo} gizmo`;

/**
 * The Home row: the first suggestion home starts from. Each goal's first example; with none, the
 * general one. Home's own suggestions replace this table once they exist.
 */
export const homeRowExample: Readonly<Record<Exclude<GoalId, 'exploring'>, string>> & { general: string } = {
  printing: 'A wall hook that holds 5 kg and prints without supports',
  mechanical: 'An L-bracket with four M4 clearance holes',
  electronics: 'A USB-C breakout board with a 3.3 V regulator',
  product: 'An enclosure that fits a 60 × 40 mm board with a USB-C cutout',
  art: 'A low-poly treasure chest with a hinged lid',
  general: 'A phone stand with an adjustable angle',
};

/**
 * The Home row's text.
 *
 * @param example - The suggestion it starts from.
 * @returns The row's text.
 */
export const homeRowText = (example: string): string => `Suggests “${example}”`;

/** Step 3's mouse preset names: Settings → Viewer's, so the two cannot drift apart. */
export const presetCopy: Readonly<Record<MousePresetId, Readonly<{ name: string }>>> = {
  tau: { name: mousePresetCopy.tau.name },
  'right-orbit': { name: mousePresetCopy['right-orbit'].name },
  'middle-ctrl': { name: mousePresetCopy['middle-ctrl'].name },
  'middle-shift': { name: mousePresetCopy['middle-shift'].name },
  'shift-middle': { name: mousePresetCopy['shift-middle'].name },
  alt: { name: mousePresetCopy.alt.name },
};

/**
 * A list of product names for a sentence: "A", "A and B", "A, B and C".
 *
 * @param names - The names, in order.
 * @param conjunction - The word before the last name.
 * @returns The list.
 */
const nameList = (names: readonly string[], conjunction: 'and' | 'or'): string =>
  names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} ${conjunction} ${names.at(-1) ?? ''}`;

/**
 * A preset's "Familiar from …" line, from the products `familiarProducts` in `@taucad/preferences`
 * lists for it, or nothing when it lists none.
 *
 * @param names - The products.
 * @returns The line, or `undefined`.
 */
export const familiarFromText = (names: readonly string[]): string | undefined =>
  names.length === 0 ? undefined : `Familiar from ${nameList(names, 'and')}`;

/** The gizmo choices: the four styles and None, which hides the gizmo. */
export type GizmoChoiceId = GizmoStyleId | 'none';

/** Step 3's gizmo choices, in order: Settings → Viewer's names and hints, and None. */
export const gizmoCopy: Readonly<Record<GizmoChoiceId, Readonly<{ name: string; rowName: string; hint: string }>>> = {
  cube: { ...gizmoStyleCopy.cube, rowName: 'cube' },
  'classic-cube': { ...gizmoStyleCopy['classic-cube'], rowName: 'classic cube' },
  'axis-balls': { ...gizmoStyleCopy['axis-balls'], rowName: 'axis balls' },
  axes: { ...gizmoStyleCopy.axes, rowName: 'axes' },
  none: { name: 'None', rowName: 'no', hint: 'Hide the gizmo' },
};

/** Step 3's labels and lines. */
export const viewerStepCopy = {
  mouseControls: 'Mouse controls',
  trackpad: 'I use a trackpad',
  trackpadHint: 'Two-finger scroll pans and pinch zooms on this device',
  trackpadNote: 'Trackpad gestures are on for this device. Mouse controls apply where they are off',
  gizmo: 'Orientation gizmo',
  pickAnother: 'Pick another if it is closer to what you know',
  legendLabel: 'How to move the view',
  legendAlways: 'Always',
  legendAlwaysText:
    'Click selects, F fits the view, the gizmo snaps to standard views. Arrow keys orbit and Shift with arrow keys pans, so nothing needs a drag',
  or: 'or',
  previewLabel: 'Viewer preview',
  previewLoading: 'Loading the preview',
  fallbackTitle: 'How the controls move the view',
  fallbackRetry: 'Try again',
} as const;

/**
 * Why a preset is preselected: a product is named only when `@taucad/preferences` lists it
 * for that preset, so the line names the tool answer's listed products (`toolSuggestions[tool].names`), never the answer itself.
 *
 * @param input - Whether there is a tool answer, the products it may name, and whether the suggestion is Tau's own
 *   default.
 * @returns The line.
 */
export const presetReasonText = (
  input: Readonly<{ isAnswered: boolean; names: readonly string[]; isTauDefault: boolean }>,
): string => {
  if (input.isAnswered && input.names.length > 0) {
    return `Suggested because you use ${nameList(input.names, 'or')}`;
  }
  if (!input.isAnswered || input.isTauDefault) {
    return `Tau’s default. ${viewerStepCopy.pickAnother}`;
  }
  return `Suggested from your answer. ${viewerStepCopy.pickAnother}`;
};

/** The legend's gesture names. */
export const gestureCopy: Readonly<Record<Exclude<CameraGesture, 'none'>, string>> = {
  orbit: 'Orbit',
  pan: 'Pan',
  zoom: 'Zoom',
};

/** Key cap text for the parts of a binding. */
export const keyCapCopy = {
  shift: 'Shift',
  ctrl: 'Ctrl',
  alt: 'Alt',
  left: 'Left drag',
  middle: 'Middle drag',
  right: 'Right drag',
  trackpadLeft: 'Click drag',
  scroll: 'Scroll',
  trackpadScroll: 'Two-finger scroll',
  pinch: 'Pinch',
} as const;

/** Step 4's cards. The three headline sentences are the marketing site's copy. */
export const howTauWorksCopy = {
  design: {
    step: 'Design',
    title: 'Describe the part',
    body: 'Tell the agent what the part does and where it fits, or write the code yourself. You get parametric source with dimensions you control.',
    kernel: 'Kernel',
    auto: 'Auto',
    autoLine: 'picks the kernel from your prompt and tells you why',
    autoLineWithGoals: 'picks the kernel from your prompt and what you make, and tells you why',
  },
  verify: {
    step: 'Verify',
    title: 'Check the geometry',
    body: 'Declare the dimensions, clearances and hole patterns the part needs. GeoSpec checks the geometry against them and flags anything it cannot measure.',
    checks: [
      { state: 'pass', text: 'Fits in 60 × 40 × 40 mm' },
      { state: 'pass', text: 'Four Ø4.5 mm holes on a 50 × 30 mm pattern' },
      { state: 'unknown', text: 'Minimum wall 2 mm' },
    ],
    passed: 'Passed: ',
    unknown: 'Could not measure: ',
  },
  build: {
    step: 'Build',
    title: 'Export and make it',
    body: 'Export STEP for machining, or STL and 3MF for 3D printing. Keep the source so you can revise the part after testing it.',
    note: 'The Export pane lists what this model’s kernel can write',
  },
  kernels: {
    title: 'One project, more than one kernel',
    body: 'A kernel is the engine that turns code into geometry. Each model in a project has its own, so each part can use the engine that suits it. Auto picks for the first; you start another by picking its kernel.',
    bodyElectronics:
      'A kernel is the engine that turns code into geometry. Each model in a project has its own, so a board and its enclosure can live side by side. Auto picks for the first; you start another by picking its kernel.',
    filesLabel: 'Files in one project and the kernel each uses',
    files: [
      { file: 'bracket.ts', kernel: 'Replicad', family: 'BRep' },
      { file: 'knob.scad', kernel: 'OpenSCAD', family: 'Mesh' },
      { file: 'lattice.ts', kernel: 'PicoVoxel', family: 'Voxel' },
    ],
    filesElectronics: [
      { file: 'board.circuit.tsx', kernel: 'tscircuit', family: 'Electronics' },
      { file: 'enclosure.ts', kernel: 'Replicad', family: 'BRep' },
      { file: 'standoff.scad', kernel: 'OpenSCAD', family: 'Mesh' },
    ],
  },
  warehouse: {
    title: 'Start from real parts',
    body: 'Fasteners, bearings, connectors and modules come from the parts warehouse with their real dimensions, so the agent designs around what you will actually buy.',
    partsLabel: 'Example warehouse parts',
    parts: ['M3 × 8 socket head cap screw', '608 bearing, 8 × 22 × 7 mm', 'USB-C receptacle, 16 pin'],
  },
  desktop: {
    title: 'Runs on your machine',
    body: 'Projects are folders on your disk. Native kernels such as Build123d and PicoGK download the first time a project needs one, then work offline.',
    firstUse: 'First use of a native kernel',
    firstUseLine: 'Downloads once, with progress in the status bar',
  },
} as const;

/** Step 4's tour switch, and its replacement once the tour has ended. */
export const tourSwitchCopy = {
  title: 'Show me around the next project I open',
  hint: 'Five short tips that appear as you work. Stop them any time',
  taken: 'You have taken the tour',
  again: 'Take it again',
} as const;

/** The screen after Finish or Skip. */
export const setupFinishCopy = {
  doneHeading: 'You’re set',
  doneIntro: 'Tau starts from your answers. Everything here can be changed in Settings.',
  skippedHeading: 'Setup skipped',
  skippedIntro: 'Tau uses its defaults. Finish setup any time from Help, or change one thing in Settings.',
  startBuilding: 'Start building',
  openFolder: 'Open a folder',
  openFolderFailed: 'Tau could not open that folder.',
  viewerSettings: 'Open Viewer settings',
  changeAnswers: 'Change answers',
  nothingChosen: 'nothing chosen',
  tourOn: 'Tips will appear in the next project you open',
  tourOff: 'No tips. Start the tour from Help when you want it',
} as const;

/**
 * The summary's first line.
 *
 * @param goals - The goal labels, lowercased, or the "nothing chosen" line.
 * @returns The line.
 */
export const summaryMakesText = (goals: string): string => `You make: ${goals}`;

/**
 * The summary's viewer line.
 *
 * @param viewer - The Viewer row's text.
 * @returns The line.
 */
export const summaryViewerText = (viewer: string): string => `Viewer: ${viewer}`;

/** The entries that open setup. */
export const setupEntryCopy = {
  setUpTau: 'Set up Tau',
  howTauWorks: 'How Tau works',
  inviteTitle: 'Make Tau yours in a minute',
  inviteBody: 'Tell Tau what you make and the tool you know, and it sets the viewer and the agent to match.',
  inviteAction: 'Set up',
  inviteDismiss: 'Dismiss',
} as const;
