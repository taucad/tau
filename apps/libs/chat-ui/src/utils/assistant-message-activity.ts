/**
 * Order-preserving assistant activity grouping and semantic tool summaries.
 *
 * Adjacent reasoning parts form one reasoning disclosure. Adjacent tool parts
 * form one activity disclosure. Text, visible data, and exported artifacts
 * remain standalone chronological barriers.
 */

import type { MyMessagePart } from '@taucad/chat';
import { isRecord } from '@taucad/utils/schema';
import { agentApprovalToolName } from '#services/agent-host-event-projection.js';
import { summarizeExternalCall } from '#utils/external-call-summary.js';
import { isQuestionTool } from '#utils/question-tool.js';

export type ActivityCategory = 'text' | 'reasoning' | 'research' | 'write' | 'data' | 'skip';

export type ActivityFamily =
  | 'skill'
  | 'read'
  | 'search'
  | 'web-search'
  | 'web-read'
  | 'execute'
  | 'edit'
  | 'render'
  | 'screenshot'
  | 'test'
  | 'chat'
  | 'plan'
  | 'other';

type ActivityState = 'active' | 'approval' | 'completed' | 'denied' | 'error';

export type SingletonGroup = {
  readonly kind: 'singleton';
  readonly part: MyMessagePart;
  readonly partIndex: number;
  readonly category: ActivityCategory;
};

export type AggregatedGroup = {
  readonly kind: 'aggregated';
  readonly category: 'reasoning' | 'research';
  readonly parts: readonly MyMessagePart[];
  readonly partIndices: readonly number[];
  readonly summary: string;
  readonly families: readonly ActivityFamily[];
};

export type ActivityGroup = SingletonGroup | AggregatedGroup;

const staticFamilies = new Map<string, ActivityFamily>([
  ['tool-use_skill', 'skill'],
  ['tool-read_file', 'read'],
  ['tool-list_directory', 'read'],
  ['tool-get_parameters', 'read'],
  ['tool-history', 'chat'],
  ['tool-grep', 'search'],
  ['tool-glob_search', 'search'],
  ['tool-web_search', 'web-search'],
  ['tool-web_browser', 'web-read'],
  ['tool-edit_file', 'edit'],
  ['tool-create_file', 'edit'],
  ['tool-delete_file', 'edit'],
  ['tool-apply_parameter_operation', 'edit'],
  ['tool-arrange_workbench', 'edit'],
  ['tool-install_packages', 'edit'],
  ['tool-evaluate_model', 'render'],
  // Durable pre-migration turns remain readable; these names are display-only, never tool registrations.
  ['tool-get_kernel_result', 'render'],
  ['tool-screenshot', 'screenshot'],
  ['tool-test_model', 'test'],
  ['tool-shell', 'execute'],
  // The tray above the composer owns the live task list; an update is one more routine row of the turn's record.
  ['tool-update_todos', 'plan'],
]);

const nativeFamilies = new Map<string, ActivityFamily>([
  ['arrange_workbench', 'edit'],
  ['use_skill', 'skill'],
  ['read_file', 'read'],
  ['list_directory', 'read'],
  ['get_parameters', 'read'],
  ['history', 'chat'],
  ['grep', 'search'],
  ['glob_search', 'search'],
  ['web_search', 'web-search'],
  ['web_browser', 'web-read'],
  ['edit_file', 'edit'],
  ['create_file', 'edit'],
  ['delete_file', 'edit'],
  ['apply_parameter_operation', 'edit'],
  ['install_packages', 'edit'],
  ['evaluate_model', 'render'],
  ['get_kernel_result', 'render'],
  ['screenshot', 'screenshot'],
  ['test_model', 'test'],
  ['shell', 'execute'],
  ['update_todos', 'plan'],
]);

const externalFamilies = new Map<string, ActivityFamily>([
  ['read', 'read'],
  ['search', 'search'],
  ['fetch', 'web-read'],
  ['execute', 'execute'],
  ['edit', 'edit'],
  ['delete', 'edit'],
  ['move', 'edit'],
  ['think', 'other'],
]);

const familyLabels: Record<Exclude<ActivityFamily, 'other'>, Record<ActivityState, string>> = {
  skill: {
    active: 'Loading tools',
    approval: 'Tool loading awaiting approval',
    completed: 'Loaded tools',
    denied: 'Tool loading denied',
    error: 'Tool loading failed',
  },
  read: {
    active: 'Reading files',
    approval: 'File reads awaiting approval',
    completed: 'Read files',
    denied: 'File reads denied',
    error: 'File reads failed',
  },
  search: {
    active: 'Searching files',
    approval: 'File search awaiting approval',
    completed: 'Searched files',
    denied: 'File search denied',
    error: 'File search failed',
  },
  'web-search': {
    active: 'Searching the web',
    approval: 'Web search awaiting approval',
    completed: 'Searched the web',
    denied: 'Web search denied',
    error: 'Web search failed',
  },
  'web-read': {
    active: 'Reading web pages',
    approval: 'Web reads awaiting approval',
    completed: 'Read web pages',
    denied: 'Web reads denied',
    error: 'Web reads failed',
  },
  execute: {
    active: 'Running commands',
    approval: 'Commands awaiting approval',
    completed: 'Ran commands',
    denied: 'Commands denied',
    error: 'Commands failed',
  },
  edit: {
    active: 'Editing files',
    approval: 'File edits awaiting approval',
    completed: 'Edited files',
    denied: 'File edits denied',
    error: 'File edits failed',
  },
  render: {
    active: 'Rendering models',
    approval: 'Model rendering awaiting approval',
    completed: 'Rendered models',
    denied: 'Model rendering denied',
    error: 'Model rendering failed',
  },
  screenshot: {
    active: 'Capturing images',
    approval: 'Image capture awaiting approval',
    completed: 'Captured images',
    denied: 'Image capture denied',
    error: 'Image capture failed',
  },
  test: {
    active: 'Running tests',
    approval: 'Tests awaiting approval',
    completed: 'Ran tests',
    denied: 'Tests denied',
    error: 'Tests failed',
  },
  chat: {
    active: 'Reading chat',
    approval: 'Chat read awaiting approval',
    completed: 'Read chat',
    denied: 'Chat read denied',
    error: 'Chat read failed',
  },
  plan: {
    active: 'Updating tasks',
    approval: 'Task update awaiting approval',
    completed: 'Updated tasks',
    denied: 'Task update denied',
    error: 'Task update failed',
  },
};

const tauFacts = (part: MyMessagePart): Record<string, unknown> | undefined =>
  part.type === 'dynamic-tool' && isRecord(part.toolMetadata?.['tau']) ? part.toolMetadata['tau'] : undefined;

/** ACP tool kind carried by a dynamic tool part. */
export const externalToolKind = (part: MyMessagePart): string | undefined => {
  const kind = tauFacts(part)?.['kind'];
  return typeof kind === 'string' ? kind : undefined;
};

/** The title and located paths an external call reported. */
const externalCallFacts = (part: MyMessagePart): { title: string | undefined; locations: string[] } => {
  const facts = tauFacts(part);
  const title = facts?.['title'];
  const locations = Array.isArray(facts?.['locations']) ? facts['locations'] : [];
  return {
    title: typeof title === 'string' ? title : undefined,
    locations: locations.flatMap((location: unknown) =>
      isRecord(location) && typeof location['path'] === 'string' ? [location['path']] : [],
    ),
  };
};

/** The summary an external call renders under, when Tau can name it. */
const externalSummary = (part: MyMessagePart) =>
  part.type === 'dynamic-tool'
    ? summarizeExternalCall({ ...externalCallFacts(part), kind: externalToolKind(part), input: part.input })
    : undefined;

const tauMcpToolName = (part: MyMessagePart): string | undefined => {
  const tau = tauFacts(part);
  const nativeName = tau?.['nativeName'];
  return tau?.['presentation'] === 'tau-mcp' && typeof nativeName === 'string' ? nativeName : undefined;
};

/** Map a tool part to the visible semantic family shared by native and ACP agents. */
export const activityFamily = (part: MyMessagePart): ActivityFamily => {
  const staticFamily = staticFamilies.get(part.type);
  if (staticFamily) {
    return staticFamily;
  }
  const nativeName = tauMcpToolName(part);
  if (nativeName) {
    return nativeFamilies.get(nativeName) ?? 'other';
  }
  const kind = externalToolKind(part);
  return externalSummary(part)?.family ?? externalFamilies.get(kind ?? '') ?? 'other';
};

/** Classify one message part without reordering it. */
export const classifyActivityPart = (part: MyMessagePart): ActivityCategory => {
  if (part.type === 'text') {
    return part.text.trim() === '' ? 'skip' : 'text';
  }
  if (part.type === 'reasoning') {
    return part.text.trim() === '' ? 'skip' : 'reasoning';
  }
  if (part.type === 'dynamic-tool') {
    if (part.toolName === agentApprovalToolName) {
      return part.state === 'output-available' ? 'data' : 'skip';
    }
    const nativeName = tauMcpToolName(part);
    /* A question is a decision, never folded into routine activity (agent questions blueprint D7). */
    if (isQuestionTool(nativeName ?? tauFacts(part)?.['nativeName'])) {
      return 'data';
    }
    return nativeName === 'export_model' || nativeName === 'export_geometry' || nativeName === 'arrange_workbench'
      ? 'write'
      : 'research';
  }
  if (part.type === 'tool-export_model' || part.type === 'tool-arrange_workbench') {
    return 'write';
  }
  if (staticFamilies.has(part.type)) {
    return 'research';
  }
  if (['step-start', 'data-usage', 'data-context-usage'].includes(part.type)) {
    return 'skip';
  }
  /* A session record without a plan draws nothing, so it must not split the activity around it. */
  if (part.type === 'data-acp-session' && part.data.plan === undefined) {
    return 'skip';
  }
  if (part.type === 'file' || part.type === 'source-url' || part.type === 'source-document') {
    return 'text';
  }
  return 'data';
};

const partState = (part: MyMessagePart): ActivityState => {
  const rawState: unknown = Reflect.get(part, 'state');
  const state = typeof rawState === 'string' ? rawState : undefined;
  if (
    Reflect.get(part, 'preliminary') === true ||
    state === 'input-streaming' ||
    state === 'input-available' ||
    state === 'approval-responded'
  ) {
    return 'active';
  }
  if (state === 'approval-requested') {
    return 'approval';
  }
  if (state === 'output-error') {
    return 'error';
  }
  if (state === 'output-denied') {
    return 'denied';
  }
  return 'completed';
};

/**
 * Whether a part is still running: receiving input, executing, reporting
 * progress, or resuming after an answered approval. The activity summary's verb
 * and a collapsed group's spinner both read this one test.
 */
export const isActivityPartActive = (part: MyMessagePart): boolean => partState(part) === 'active';

const displayTitle = (part: MyMessagePart, isActive: boolean): string => {
  if (part.type !== 'dynamic-tool') {
    return 'Tool call';
  }
  /* The card's own phrase, so "Interact with subagent x" reads "Messaged subagent x" in both. */
  const summary = externalSummary(part);
  if (summary !== undefined) {
    return `${isActive ? summary.activeVerb : summary.verb} ${isActive ? summary.activeDetail : summary.detail}`.trim();
  }
  const title = tauFacts(part)?.['title'];
  return typeof title === 'string' && title.trim() !== '' ? title.trim() : part.toolName;
};

/** " (2 of 3 failed)": how many of a family's calls did not go through, so the closed line says it without being opened. */
const shortfallSuffix = (states: readonly ActivityState[]): string => {
  const failed = states.filter((state) => state === 'error').length;
  if (failed > 0) {
    return ` (${String(failed)} of ${String(states.length)} failed)`;
  }
  const denied = states.filter((state) => state === 'denied').length;
  return denied > 0 ? ` (${String(denied)} of ${String(states.length)} denied)` : '';
};

const familyState = (parts: readonly MyMessagePart[]): { state: ActivityState; suffix: string } => {
  const partStates = parts.map((part) => partState(part));
  const states = new Set(partStates);
  if (states.has('approval')) {
    return { state: 'approval', suffix: '' };
  }
  if (states.has('active')) {
    return { state: 'active', suffix: shortfallSuffix(partStates) };
  }
  if (states.has('completed')) {
    return { state: 'completed', suffix: shortfallSuffix(partStates) };
  }
  return states.has('error') ? { state: 'error', suffix: '' } : { state: 'denied', suffix: '' };
};

const lowerInitial = (value: string): string => `${value.charAt(0).toLowerCase()}${value.slice(1)}`;

/**
 * Describe every live family represented by an adjacent tool group, in the order each first ran.
 *
 * @param parts - The group's tool parts.
 * @param options - `failuresFirst` leads with the families where something did not go through; `omitShortfall` leaves
 *   out each family's "(1 of 3 failed)" count, for a line that states the tally on its own; `settled` reads a call the
 *   turn ended without settling (a steered segment's) as done, never as still running or awaiting approval.
 * @returns The summary, such as "Read files, ran commands (1 of 3 failed)".
 */
export const describeActivity = (
  parts: readonly MyMessagePart[],
  options: { readonly failuresFirst?: boolean; readonly omitShortfall?: boolean; readonly settled?: boolean } = {},
): string => {
  const orderedFamilies: ActivityFamily[] = [];
  const byFamily = new Map<ActivityFamily, MyMessagePart[]>();
  for (const part of parts) {
    const family = activityFamily(part);
    if (!byFamily.has(family)) {
      orderedFamilies.push(family);
      byFamily.set(family, []);
    }
    byFamily.get(family)!.push(part);
  }

  const fellShort = (family: ActivityFamily): boolean => {
    const { state, suffix } = familyState(byFamily.get(family)!);
    return state === 'error' || state === 'denied' || suffix !== '';
  };
  const families = options.failuresFirst
    ? [
        ...orderedFamilies.filter((family) => fellShort(family)),
        ...orderedFamilies.filter((family) => !fellShort(family)),
      ]
    : orderedFamilies;
  return families
    .map((family, index) => {
      const familyParts = byFamily.get(family)!;
      const { state: outcome, suffix: shortfall } = familyState(familyParts);
      const state = options.settled && (outcome === 'active' || outcome === 'approval') ? 'completed' : outcome;
      /* With the tally stated apart, a family that partly failed reads as the work it did; one that only failed still
       * says so ("model rendering failed"). */
      const suffix = options.omitShortfall ? '' : shortfall;
      const phrase =
        family === 'other'
          ? `${displayTitle(familyParts.at(-1)!, state === 'active')}${
              state === 'active'
                ? externalSummary(familyParts.at(-1)!) === undefined
                  ? ' — running'
                  : ''
                : state === 'approval'
                  ? ' — awaiting approval'
                  : state === 'error'
                    ? ' — failed'
                    : state === 'denied'
                      ? ' — denied'
                      : ''
            }${suffix}`
          : `${familyLabels[family][state]}${suffix}`;
      return index === 0 ? phrase : lowerInitial(phrase);
    })
    .join(', ');
};

/** Last message-part index that produces visible assistant history. */
export const findLastMeaningfulPartIndex = (parts: readonly MyMessagePart[]): number => {
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    if (classifyActivityPart(parts[index]!) !== 'skip') {
      return index;
    }
  }
  return -1;
};

/**
 * Group adjacent reasoning and tool activity while preserving order.
 *
 * Reasoning between or beside tool calls belongs to that activity group, so a
 * thought never splits one semantic summary. A run with no tool call stays a
 * standalone reasoning group.
 */
export const groupAssistantParts = (parts: readonly MyMessagePart[]): ActivityGroup[] => {
  const groups: ActivityGroup[] = [];
  let pendingParts: MyMessagePart[] = [];
  let pendingIndices: number[] = [];

  const flush = (): void => {
    if (pendingParts.length === 0) {
      return;
    }
    const toolParts = pendingParts.filter((part) => cachedCategory(part) === 'research');
    const isReasoning = toolParts.length === 0;
    groups.push({
      kind: 'aggregated',
      category: isReasoning ? 'reasoning' : 'research',
      parts: pendingParts,
      partIndices: pendingIndices,
      summary: isReasoning ? '' : describeActivity(toolParts),
      families: [...new Set(toolParts.map((part) => activityFamily(part)))],
    });
    pendingParts = [];
    pendingIndices = [];
  };

  for (const [partIndex, part] of parts.entries()) {
    const category = cachedCategory(part);
    if (category === 'skip') {
      continue;
    }
    if (category === 'reasoning' || category === 'research') {
      pendingParts.push(part);
      pendingIndices.push(partIndex);
      continue;
    }
    flush();
    groups.push({ kind: 'singleton', part, partIndex, category });
  }
  flush();
  const first = parts[0];
  if (first !== undefined) {
    const previous = activityGroups.get(first);
    for (const [index, group] of groups.entries()) {
      const old = previous?.[index];
      if (
        old?.kind === 'singleton' &&
        group.kind === 'singleton' &&
        old.part === group.part &&
        old.partIndex === group.partIndex
      ) {
        groups[index] = old;
      } else if (
        old?.kind === 'aggregated' &&
        group.kind === 'aggregated' &&
        old.category === group.category &&
        old.parts.length === group.parts.length &&
        old.parts.every((part, at) => part === group.parts[at] && old.partIndices[at] === group.partIndices[at])
      ) {
        groups[index] = old;
      }
    }
    activityGroups.set(first, groups);
  }
  return groups;
};

/** An older turn's groups, split into the working narrative its fold holds and what stays in view. */
export type WorkingNarrative = {
  /** Commentary and activity before the last tool call, in order: what the fold holds. */
  readonly narrative: readonly ActivityGroup[];
  /** Decisions and deliverables that came before any of the work, kept in view above the fold line. */
  readonly leading: readonly ActivityGroup[];
  /** The other decisions and deliverables from that stretch, kept in view below the fold line in their own order. */
  readonly kept: readonly ActivityGroup[];
  /** The turn's answer: everything after the last tool call, or its last text when a tool call came after it. */
  readonly answer: readonly ActivityGroup[];
  /** The fold line's detail, naming every tool family the narrative ran, failures first. */
  readonly summary: string;
  /** What did not go through, tallied across the narrative ("2 failed, 1 denied"); empty when everything did. */
  readonly shortfall: string;
};

/**
 * Split a finished turn's groups at its answer: what came before is its working narrative.
 *
 * The answer is everything after the last tool call. A turn that ends on a tool call (ticking off its task list, or
 * stopped mid-call) after some work answered in its last text, so that text is the answer and the tool calls after it
 * fold with the rest; a turn whose only text opened it folds whole. Commentary and activity fold; a decision, a deliverable or an attachment never does, so those stay in view,
 * ahead of the fold line when they came before any of the work.
 * Whether a one-line narrative is worth folding is the caller's call: it is when the fold line adds the time worked.
 *
 * @param groups - The turn's groups, from {@link groupAssistantParts}.
 * @returns The split, or `undefined` when no tool call comes before the answer.
 */
export const splitWorkingNarrative = (groups: readonly ActivityGroup[]): WorkingNarrative | undefined => {
  const isText = (group: ActivityGroup): boolean => group.kind === 'singleton' && group.part.type === 'text';
  const isWork = (group: ActivityGroup): boolean => group.kind === 'aggregated' || isText(group);
  const isTool = (group: ActivityGroup): boolean => group.kind === 'aggregated' && group.category === 'research';
  const afterTools = groups.findLastIndex((group) => isTool(group)) + 1;
  const lastText = groups.findLastIndex((group) => isText(group));
  /* Last words count as the answer only once some work came before them; an opening line is commentary. */
  const answersBetween = lastText < afterTools && lastText > groups.findIndex((group) => isTool(group));
  const inAnswer = (group: ActivityGroup, index: number): boolean =>
    answersBetween ? index === lastText || (index > lastText && !isWork(group)) : index >= afterTools;
  const narrative: ActivityGroup[] = [];
  const leading: ActivityGroup[] = [];
  const kept: ActivityGroup[] = [];
  const answer: ActivityGroup[] = [];
  for (const [index, group] of groups.entries()) {
    if (inAnswer(group, index)) {
      answer.push(group);
    } else if (isWork(group)) {
      narrative.push(group);
    } else {
      (narrative.length === 0 ? leading : kept).push(group);
    }
  }
  const toolParts = narrative.flatMap((group) =>
    group.kind === 'aggregated' ? group.parts.filter((part) => cachedCategory(part) === 'research') : [],
  );
  if (toolParts.length === 0) {
    return undefined;
  }
  const states = toolParts.map((part) => partState(part));
  const count = (state: ActivityState, label: string): string[] => {
    const total = states.filter((each) => each === state).length;
    return total === 0 ? [] : [`${String(total)} ${label}`];
  };
  return {
    narrative,
    leading,
    kept,
    answer,
    summary: describeActivity(toolParts, { failuresFirst: true, omitShortfall: true, settled: true }),
    shortfall: [...count('error', 'failed'), ...count('denied', 'denied')].join(', '),
  };
};

const partCategories = new WeakMap<MyMessagePart, ActivityCategory>();
const activityGroups = new WeakMap<MyMessagePart, ActivityGroup[]>();
const cachedCategory = (part: MyMessagePart): ActivityCategory => {
  const prior = partCategories.get(part);
  if (prior !== undefined) {
    return prior;
  }
  const category = classifyActivityPart(part);
  partCategories.set(part, category);
  return category;
};
