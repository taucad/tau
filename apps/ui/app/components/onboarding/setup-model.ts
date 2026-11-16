/**
 * Pure derivations behind setup: which steps it has, the exclusivity rules of its
 * answers, the rows of "What your answers change" and the key caps of the binding legend. Nothing here reads storage
 * or the host; the components pass in what they read.
 */
import type {
  GoalId,
  LanguageId,
  OnboardingState,
  PersonProfile,
  ToolId,
  ViewerPreferences,
} from '@taucad/preferences';
import { effectiveGizmoStyle, effectivePreset, suggestedPreset, toolSuggestions } from '@taucad/preferences';
import { cameraMappings } from '@taucad/viewer/graphics/three/controls/camera-presets';
import type {
  CameraGesture,
  CameraModifier,
  CameraPresetId,
} from '@taucad/viewer/graphics/three/controls/camera-presets';
import {
  agentRowText,
  answersPanelCopy,
  gizmoCopy,
  goalCopy,
  homeRowExample,
  homeRowText,
  hostLineText,
  keyCapCopy,
  languageShortName,
  presetCopy,
  presetReasonText,
  setupStepIds,
  viewerRowText,
} from '#components/onboarding/setup-copy.js';
import type { GizmoChoiceId, SetupStepId } from '#components/onboarding/setup-copy.js';

/**
 * The steps setup shows. Step 3 needs `viewerControls`: while it is off a viewer choice changes nothing, so the step
 * is left out.
 *
 * @param isViewerControlsEnabled - The `viewerControls` flag.
 * @returns The steps, in order.
 */
export const setupSteps = (isViewerControlsEnabled: boolean): readonly SetupStepId[] =>
  isViewerControlsEnabled ? setupStepIds : setupStepIds.filter((step) => step !== 'viewer');

/**
 * Step 1's rule: "Just exploring" clears the other goals, and any other goal clears it.
 *
 * @param goals - The goals checked now.
 * @param goal - The goal changed.
 * @param isChecked - Whether it is now checked.
 * @returns The goals after the change, in the order step 1 lists them.
 */
export const toggleGoal = (goals: readonly GoalId[], goal: GoalId, isChecked: boolean): GoalId[] => {
  if (!isChecked) {
    return goals.filter((id) => id !== goal);
  }
  if (goal === 'exploring') {
    return ['exploring'];
  }
  const next = new Set<GoalId>([...goals.filter((id) => id !== 'exploring'), goal]);
  return (Object.keys(goalCopy) as GoalId[]).filter((id) => next.has(id));
};

/**
 * Step 2's language rule: "I'd rather not write code" clears the other languages, and any other language clears it.
 *
 * @param languages - The languages chosen now.
 * @param language - The language changed.
 * @param isChosen - Whether it is now chosen.
 * @returns The languages after the change.
 */
export const toggleLanguage = (
  languages: readonly LanguageId[],
  language: LanguageId,
  isChosen: boolean,
): LanguageId[] => {
  if (!isChosen) {
    return languages.filter((id) => id !== language);
  }
  if (language === 'none') {
    return ['none'];
  }
  const next = new Set<LanguageId>([...languages.filter((id) => id !== 'none'), language]);
  return (Object.keys(languageShortName) as LanguageId[]).filter((id) => next.has(id));
};

/** The languages for which this host and the desktop app have a kernel. */
export type KernelLanguages = Readonly<{
  /** The host this page runs in. */
  host: 'browser' | 'desktop';
  /** Languages with a kernel this host can run now. */
  onHost: ReadonlySet<LanguageId>;
  /** Languages with a kernel the desktop app can run. */
  onDesktop: ReadonlySet<LanguageId>;
}>;

/**
 * The host line for the chosen languages, or nothing when each has a kernel on this host. The second
 * sentence appears only in the browser and only when the desktop app has a kernel for every missing language.
 *
 * @param languages - The chosen languages.
 * @param kernels - Which languages have a kernel here and on the desktop.
 * @returns The line, or `undefined`.
 */
export const hostLine = (languages: readonly LanguageId[], kernels: KernelLanguages): string | undefined => {
  const missing = languages.filter((id): id is Exclude<LanguageId, 'none'> => id !== 'none' && !kernels.onHost.has(id));
  if (missing.length === 0) {
    return undefined;
  }
  const isDesktopAvailable = kernels.host === 'browser' && missing.every((id) => kernels.onDesktop.has(id));
  return hostLineText(
    missing.map((id) => languageShortName[id]),
    isDesktopAvailable,
  );
};

/**
 * The gizmo choice in effect: None when the person's view default hides the gizmo, else the style in effect.
 *
 * @param viewer - The person's viewer preferences.
 * @param profile - The person's profile.
 * @returns The choice.
 */
export const gizmoChoice = (viewer: ViewerPreferences, profile: PersonProfile): GizmoChoiceId =>
  viewer.viewDefaults['display.gizmo'] === false ? 'none' : effectiveGizmoStyle(viewer, profile);

/**
 * Why the preset is preselected, for the line under the preset choice.
 *
 * @param tool - The tool answer.
 * @returns The line.
 */
export const presetReason = (tool: ToolId | undefined): string => {
  if (tool === undefined) {
    return presetReasonText({ isAnswered: false, names: [], isTauDefault: true });
  }
  const suggestion = toolSuggestions[tool];
  return presetReasonText({
    isAnswered: true,
    names: suggestion.names,
    isTauDefault: suggestion.preset === suggestedPreset(undefined) && suggestion.names.length === 0,
  });
};

/** One row of "What your answers change". */
export type AnswerRow = Readonly<{
  id: 'agent' | 'viewer' | 'home';
  label: string;
  text: string;
  /** Nothing answered yet changes this row. */
  isPending: boolean;
}>;

/** What the rows read. */
export type AnswerRowsInput = Readonly<{
  profile: PersonProfile;
  viewer: ViewerPreferences;
  kernels: KernelLanguages;
  /** The Viewer row is shown only while `viewerControls` is on: otherwise the answer changes no viewer. */
  isViewerControlsEnabled: boolean;
}>;

/**
 * The Viewer row's text for the choices in effect.
 *
 * @param viewer - The person's viewer preferences.
 * @param profile - The person's profile.
 * @returns The text.
 */
export const viewerSummary = (viewer: ViewerPreferences, profile: PersonProfile): string =>
  viewerRowText(presetCopy[effectivePreset(viewer, profile)].name, gizmoCopy[gizmoChoice(viewer, profile)].rowName);

/**
 * The rows of "What your answers change".
 *
 * @param input - The record and the host facts.
 * @returns The rows, in order.
 */
export const answerRows = ({
  profile,
  viewer,
  kernels,
  isViewerControlsEnabled,
}: AnswerRowsInput): readonly AnswerRow[] => {
  const makes = profile.goals.filter((goal) => goal !== 'exploring').map((goal) => goalCopy[goal].label.toLowerCase());
  const reads = profile.languages.flatMap((language) => (language === 'none' ? [] : [languageShortName[language]]));
  const told = agentRowText({ makes, reads, noCode: profile.languages.includes('none') });
  const line = hostLine(profile.languages, kernels);
  const agentText = told ?? answersPanelCopy.agentDefault;
  const chosen = profile.goals.find((goal): goal is Exclude<GoalId, 'exploring'> => goal !== 'exploring');
  const hasViewerAnswer =
    profile.tool !== undefined ||
    viewer.controls.preset !== undefined ||
    viewer.gizmo.style !== undefined ||
    viewer.viewDefaults['display.gizmo'] !== undefined;
  const rows: AnswerRow[] = [
    {
      id: 'agent',
      label: answersPanelCopy.agent,
      text: line === undefined ? agentText : `${agentText}. ${line}`,
      isPending: told === undefined,
    },
  ];
  if (isViewerControlsEnabled) {
    rows.push({
      id: 'viewer',
      label: answersPanelCopy.viewer,
      text: hasViewerAnswer ? viewerSummary(viewer, profile) : answersPanelCopy.viewerDefault,
      isPending: !hasViewerAnswer,
    });
  }
  rows.push({
    id: 'home',
    label: answersPanelCopy.home,
    text: homeRowText(chosen === undefined ? homeRowExample.general : homeRowExample[chosen]),
    isPending: chosen === undefined,
  });
  return rows;
};

/**
 * What the status region announces after an answer: only the rows whose text changed, or nothing.
 *
 * @param before - The rows before the answer.
 * @param after - The rows after it.
 * @returns The announcement, or an empty string.
 */
export const announceChangedRows = (before: readonly AnswerRow[], after: readonly AnswerRow[]): string =>
  after
    .filter((row) => before.find((previous) => previous.id === row.id)?.text !== row.text)
    .map((row) => `${row.label}: ${row.text}`)
    .join('. ');

/** One binding in the legend: its key caps, in the order they are pressed. */
export type LegendBinding = readonly string[];

const modifierCaps: Readonly<Record<CameraModifier, string>> = {
  shift: keyCapCopy.shift,
  ctrl: keyCapCopy.ctrl,
  alt: keyCapCopy.alt,
};

const modifierOrder: readonly CameraModifier[] = ['shift', 'ctrl', 'alt'];

/**
 * The legend's key caps for a mapping, taken from the preset data `@taucad/viewer` routes by, so the legend cannot
 * disagree with the viewer.
 *
 * @param mapping - The mapping in effect.
 * @returns Each gesture's bindings.
 */
export const legendBindings = (
  mapping: CameraPresetId,
): Readonly<Record<Exclude<CameraGesture, 'none'>, readonly LegendBinding[]>> => {
  const caps = (modifiers: readonly CameraModifier[]): string[] =>
    modifierOrder.filter((name) => modifiers.includes(name)).map((name) => modifierCaps[name]);
  const out: Record<Exclude<CameraGesture, 'none'>, LegendBinding[]> = { orbit: [], pan: [], zoom: [] };
  for (const binding of cameraMappings[mapping].drag) {
    out[binding.gesture].push([...caps(binding.modifiers), keyCapCopy[binding.button]]);
  }
  for (const binding of cameraMappings[mapping].wheel) {
    out[binding.gesture].push([...caps(binding.modifiers), keyCapCopy[binding.input]]);
  }
  return out;
};

/**
 * Whether the person answered a step, for `onboarding_step_completed`.
 *
 * @param step - The step.
 * @param record - What is stored.
 * @returns Whether anything on the step is answered.
 */
export const isStepAnswered = (
  step: SetupStepId,
  record: Readonly<{ profile: PersonProfile; viewer: ViewerPreferences }>,
): boolean => {
  switch (step) {
    case 'goals': {
      return record.profile.goals.length > 0;
    }
    case 'background': {
      return record.profile.tool !== undefined || record.profile.languages.length > 0;
    }
    case 'viewer': {
      return (
        record.viewer.controls.preset !== undefined ||
        record.viewer.gizmo.style !== undefined ||
        record.viewer.viewDefaults['display.gizmo'] !== undefined
      );
    }
    case 'how': {
      return true;
    }
  }
};

/**
 * Whether the tour has ended, so step 4 shows "You have taken the tour" instead of its switch.
 *
 * @param onboarding - The onboarding section.
 * @returns Whether `tour.ended` is set.
 */
export const hasTakenTour = (onboarding: OnboardingState): boolean => onboarding.tour.ended !== undefined;
