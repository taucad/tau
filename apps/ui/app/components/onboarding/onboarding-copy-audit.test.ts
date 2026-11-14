/**
 * The copy audit over every onboarding surface's typed copy module: setup, the tour, Home's suggestions, Settings →
 * Viewer and Settings → Agents' setup answers. It reads the modules as data, renders every copy function over every
 * answer a person can give, and holds the whole set to the onboarding copy rules:
 *
 * - the mode is called Auto, and no string says "Automatic kernel";
 * - no string names a kernel or predicts the one Auto will pick, except the few places listed below that name a
 *   kernel as an example of what a project can hold, or that name a product or language the person uses;
 * - no string promises Gerber or drill files, or an export format chosen for the person;
 * - no preset string says "identical to";
 * - a preset or suggestion names a product only when the camera research verified that product's orbit, pan and zoom
 *   against its vendor's own documentation.
 */
import { describe, expect, it } from 'vitest';
import { chatExamples } from '@taucad/ui-core/constants/chat-prompt-examples';
import {
  familiarProducts,
  gizmoStyleIds,
  goalIds,
  mousePresetIds,
  toolIds,
  toolSuggestions,
  tourStepIds,
} from '@taucad/preferences';
import type { GoalId } from '@taucad/preferences';
import { kernelConfigurations } from '@taucad/types/constants';
import * as setupCopy from '#components/onboarding/setup-copy.js';
import * as tourCopy from '#components/tour/tour-copy.js';
import type { TourCopyInput } from '#components/tour/tour-copy.js';
import * as viewerSettingsCopy from '#components/settings/viewer/viewer-settings-copy.js';
import { setupAnswersCopy } from '#components/settings/setup-answers-copy.js';

/** One rendered string and where it came from. */
type CopyString = Readonly<{ path: string; text: string }>;

/**
 * Every string a value holds, with its path. Functions are left to {@link renderedCopy}, which calls each one over
 * every input it can take.
 *
 * @param value - A copy module export.
 * @param path - Its path so far.
 * @returns The strings.
 */
const stringsOf = (value: unknown, path: string): CopyString[] => {
  if (typeof value === 'string') {
    return [{ path, text: value }];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => stringsOf(item, `${path}[${String(index)}]`));
  }
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, item]) => stringsOf(item, `${path}.${key}`));
  }
  return [];
};

const gizmoChoices = [...gizmoStyleIds, 'none'] as const;
const mappings = [...mousePresetIds, 'trackpad'] as const;
/** A board kernel's list, a BRep kernel's list, a mesh kernel's one format and an empty list. */
const formatLists: ReadonlyArray<readonly string[]> = [['GLB'], ['STEP', 'STL', '3MF'], ['STL'], []];

/** Every tour input a person and a project can give: each goal alone and none, every mapping, gizmo and host. */
const tourInputs = (): TourCopyInput[] => {
  const axes: Readonly<Record<keyof TourCopyInput, readonly unknown[]>> = {
    mode: ['guided', 'replay'],
    arrival: ['empty', 'prompt'],
    goals: [[], ...goalIds.map((goal): readonly GoalId[] => [goal])],
    mapping: mappings,
    gizmo: gizmoChoices,
    formats: formatLists,
    host: ['browser', 'desktop'],
    hasTestRun: [true, false],
  };
  let rows: ReadonlyArray<Record<string, unknown>> = [{}];
  for (const [key, values] of Object.entries(axes)) {
    rows = rows.flatMap((row) => values.map((value) => ({ ...row, [key]: value })));
  }
  return rows as TourCopyInput[];
};

/**
 * Every string the onboarding surfaces can show: the modules' data, and each copy function over every input.
 *
 * @returns The strings, with the export or call each came from.
 */
const renderedCopy = (): CopyString[] => {
  const strings: CopyString[] = [
    ...Object.entries(setupCopy).flatMap(([name, value]) => stringsOf(value, `setup.${name}`)),
    ...Object.entries(tourCopy).flatMap(([name, value]) => stringsOf(value, `tour.${name}`)),
    ...Object.entries(viewerSettingsCopy).flatMap(([name, value]) => stringsOf(value, `viewer.${name}`)),
    ...stringsOf(setupAnswersCopy, 'agents.setupAnswersCopy'),
    ...chatExamples.flatMap((example) => [
      { path: `home.chatExamples.${example.id}.title`, text: example.title },
      { path: `home.chatExamples.${example.id}.prompt`, text: example.prompt },
    ]),
  ];
  const add = (path: string, text: string | undefined): void => {
    if (text !== undefined) {
      strings.push({ path, text });
    }
  };

  // Setup's rows and lines, over every answer.
  const goalLabels = goalIds.map((goal) => setupCopy.goalCopy[goal].label.toLowerCase());
  const languageNames = Object.values(setupCopy.languageShortName);
  for (const makes of [[], goalLabels.slice(0, 1), goalLabels]) {
    for (const reads of [[], languageNames.slice(0, 1), languageNames]) {
      for (const noCode of [true, false]) {
        add('setup.agentRowText()', setupCopy.agentRowText({ makes, reads, noCode }));
      }
    }
  }
  for (const isDesktopAvailable of [true, false]) {
    add('setup.hostLineText()', setupCopy.hostLineText(['C#'], isDesktopAvailable));
    add('setup.hostLineText()', setupCopy.hostLineText(['Python', 'C#'], isDesktopAvailable));
  }
  for (const preset of mousePresetIds) {
    add(`setup.familiarFromText(${preset})`, setupCopy.familiarFromText(familiarProducts(preset)));
    for (const gizmo of gizmoChoices) {
      add(
        'setup.viewerRowText()',
        setupCopy.viewerRowText(setupCopy.presetCopy[preset].name, setupCopy.gizmoCopy[gizmo].rowName),
      );
    }
  }
  for (const tool of toolIds) {
    const suggestion = toolSuggestions[tool];
    add(
      `setup.presetReasonText(${tool})`,
      setupCopy.presetReasonText({
        isAnswered: true,
        names: suggestion.names,
        isTauDefault: suggestion.preset === 'tau',
      }),
    );
  }
  add('setup.presetReasonText()', setupCopy.presetReasonText({ isAnswered: false, names: [], isTauDefault: true }));
  for (const example of Object.values(setupCopy.homeRowExample)) {
    add('setup.homeRowText()', setupCopy.homeRowText(example));
  }
  add('setup.summaryMakesText()', setupCopy.summaryMakesText(setupCopy.setupFinishCopy.nothingChosen));
  add('setup.summaryViewerText()', setupCopy.summaryViewerText('Tau default, cube gizmo'));
  add('setup.stepCountLabel()', setupCopy.stepCountLabel(1, 4));

  // Every tip over every input, and the tour's chrome.
  for (const input of tourInputs()) {
    for (const step of tourStepIds) {
      const tip = tourCopy.tourTipCopy(step, input);
      for (const [key, value] of Object.entries(tip)) {
        strings.push(...stringsOf(value, `tour.tourTipCopy(${step}).${key}`));
      }
    }
  }
  for (const [index, step] of tourStepIds.entries()) {
    for (const mode of ['guided', 'replay'] as const) {
      const title = tourCopy.tourTipTitle(step, { mode, arrival: 'prompt' });
      add(`tour.tourTipTitle(${step})`, title);
      add('tour.tourTipLabel()', tourCopy.tourTipLabel(index, title));
      add('tour.tourChromeCopy.announceTip()', tourCopy.tourChromeCopy.announceTip(index, title, mode));
    }
    add('tour.tourChromeCopy.position()', tourCopy.tourChromeCopy.position(index));
    add('tour.tourChromeCopy.paused()', tourCopy.tourChromeCopy.paused(index + 1));
    add('tour.tourMenuCopy.resume()', tourCopy.tourMenuCopy.resume(index + 1));
  }
  for (const platform of ['mac', 'other'] as const) {
    add('tour.tourPaletteHint()', tourCopy.tourPaletteHint(platform));
  }
  return strings;
};

const copy = renderedCopy();

/** The paths of the strings that match. */
const pathsMatching = (pattern: RegExp): string[] => [
  ...new Set(copy.filter(({ text }) => pattern.test(text)).map(({ path }) => path)),
];

/** The texts of the strings that match, with their paths. */
const matching = (pattern: RegExp): CopyString[] => copy.filter(({ text }) => pattern.test(text));

const escape = (text: string): string => text.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);

/** Every kernel's display name, and its short name where the display name carries one in brackets. */
const kernelNames = [
  ...new Set(
    Object.values(kernelConfigurations).flatMap(({ name }) => {
      const short = /^(?<base>.+?) \((?<alias>.+)\)$/u.exec(name)?.groups;
      return short === undefined ? [name] : [short['base']!, short['alias']!];
    }),
  ),
];
const kernelNamePattern = new RegExp(`\\b(?:${kernelNames.map((name) => escape(name)).join('|')})\\b`, 'u');

/**
 * The strings that may name a kernel, and why. OpenSCAD is a tool and a language as well as a kernel; the kernel card
 * and the desktop card name kernels as examples of what a project can hold or a desktop can download.
 */
const kernelNamedOn = new Set([
  // A project holding more than one kernel, shown as example files.
  ...(['files', 'filesElectronics'] as const).flatMap((list) =>
    setupCopy.howTauWorksCopy.kernels[list].map(
      (_, index) => `setup.howTauWorksCopy.kernels.${list}[${String(index)}].kernel`,
    ),
  ),
  // The native kernels a desktop downloads on first use.
  'setup.howTauWorksCopy.desktop.body',
  // The person's own tool and language answers.
  'setup.toolCopy.openscad',
  'setup.languageCopy.openscad',
  'setup.languageShortName.openscad',
  'setup.agentRowText()',
  // The product a preset is familiar from, named as camera research allows.
  'setup.familiarFromText(tau)',
  'setup.presetReasonText(openscad)',
]);

/**
 * The products a preset or a suggestion may name: those whose orbit, pan and zoom the camera research verified
 * against the vendor's own documentation. Tinkercad, PrusaSlicer, Cura, KiCad and Unreal map to a preset but are
 * not verified, so they are never named on one.
 */
const verifiedProducts = [
  'OpenSCAD',
  'Bambu Studio',
  'Onshape',
  'SolidWorks',
  'Blender',
  'NX',
  'Creo',
  'Fusion',
  'Inventor',
  'Maya',
  'Unity',
];
const unverifiedProducts = ['Tinkercad', 'PrusaSlicer', 'Cura', 'KiCad', 'Unreal', 'Altium'];

describe('onboarding copy audit', () => {
  it('reads every surface’s copy module', () => {
    const surfaces = new Set(copy.map(({ path }) => path.split('.')[0]));
    expect([...surfaces].toSorted((left, right) => (left ?? '').localeCompare(right ?? ''))).toStrictEqual([
      'agents',
      'home',
      'setup',
      'tour',
      'viewer',
    ]);
    expect(copy.length).toBeGreaterThan(1000);
  });

  it('calls the mode Auto and never says "Automatic kernel"', () => {
    expect(matching(/automatic/iu)).toStrictEqual([]);
    expect(setupCopy.howTauWorksCopy.design.auto).toBe('Auto');
    // Tip 1 points at the composer's Auto menu for anyone who does not make boards or products.
    expect(pathsMatching(/\bAuto\b/u)).toContain('tour.tourTipCopy(ask).text[2]');
  });

  it('names a kernel only as an example of what a project holds, or as the person’s own tool or language', () => {
    expect(pathsMatching(kernelNamePattern).filter((path) => !kernelNamedOn.has(path))).toStrictEqual([]);
  });

  it('never predicts the kernel Auto will pick', () => {
    expect(matching(/\b(?:will|usually|probably|likely|tends? to)\s+(?:pick|choose|use|lean)/iu)).toStrictEqual([]);
    expect(matching(/\bleans?\b/iu)).toStrictEqual([]);
    // Each kernel family the kernel card shows is an example file's label and nothing else.
    const families = new Set(
      [...setupCopy.howTauWorksCopy.kernels.files, ...setupCopy.howTauWorksCopy.kernels.filesElectronics].map(
        ({ family }) => family,
      ),
    );
    const familyPattern = new RegExp(
      `\\b(?:${[...families].filter((family) => family !== 'Electronics').join('|')})\\b`,
      'u',
    );
    expect(
      pathsMatching(familyPattern).filter((path) => !path.startsWith('setup.howTauWorksCopy.kernels.files')),
    ).toStrictEqual([]);
  });

  it('promises no Gerber or drill files and no export format chosen for the person', () => {
    expect(matching(/\b(?:gerber|drill|excellon)\b/iu)).toStrictEqual([]);
    expect(
      matching(/\b(?:default|starting|starts? (?:on|with|in))\b[^.]*\b(?:format|STEP|STL|3MF|GLB)\b/iu),
    ).toStrictEqual([]);
  });

  it('lists in tip 5 only the formats the active kernel offers', () => {
    const formats = ['STEP', 'STL', '3MF', 'GLB', 'OBJ', 'DXF'];
    for (const offered of formatLists) {
      const text = tourCopy.tourTipCopy('build', { ...tourInputs()[0]!, formats: offered }).text.join(' ');
      for (const format of formats) {
        expect(new RegExp(`\\b${format}\\b`, 'u').test(text), `${format} with ${offered.join(', ')}`).toBe(
          offered.includes(format),
        );
      }
    }
  });

  it('says "familiar from", never "identical to"', () => {
    expect(matching(/\bidentical\b/iu)).toStrictEqual([]);
  });

  it('names on a preset or suggestion only the products the camera research verified', () => {
    const presetLines = copy.filter(({ path }) => /^setup\.(?:familiarFromText|presetReasonText)\(/u.test(path));
    const named = new Set(presetLines.flatMap(({ text }) => verifiedProducts.filter((name) => text.includes(name))));
    for (const name of unverifiedProducts) {
      expect(
        presetLines.filter(({ text }) => new RegExp(`\\b${name}\\b`, 'u').test(text)),
        `${name} is not verified`,
      ).toStrictEqual([]);
    }
    for (const tool of toolIds) {
      for (const name of toolSuggestions[tool].names) {
        expect(verifiedProducts, `${tool} names ${name}`).toContain(name);
      }
    }
    expect(named.size).toBeGreaterThan(0);
  });
});
