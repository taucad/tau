/**
 * Order-preserving assistant activity grouping and semantic tool summaries.
 *
 * Adjacent reasoning parts form one reasoning disclosure. Adjacent tool parts
 * form one activity disclosure. Text, data, and exported artifacts remain
 * standalone chronological barriers.
 */

import type { MyMessagePart } from '@taucad/chat';
import { isRecord } from '@taucad/utils/schema';
import { agentApprovalToolName } from '#services/agent-host-event-projection.js';
import { summarizeExternalCall } from '#utils/external-call-summary.js';

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
  ['tool-revisions', 'chat'],
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
]);

const nativeFamilies = new Map<string, ActivityFamily>([
  ['arrange_workbench', 'edit'],
  ['use_skill', 'skill'],
  ['read_file', 'read'],
  ['list_directory', 'read'],
  ['get_parameters', 'read'],
  ['revisions', 'chat'],
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
};

/** External agents' own question tools, whose forms Tau presents as question cards. */
const questionToolNames = new Set(['AskUserQuestion', 'request_user_input']);

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
      return 'skip';
    }
    const nativeName = tauMcpToolName(part);
    /* A question is a decision, never folded into routine activity (agent questions blueprint D7). */
    if (nativeName === 'ask_questions' || questionToolNames.has(String(tauFacts(part)?.['nativeName']))) {
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

const familyState = (parts: readonly MyMessagePart[]): { state: ActivityState; suffix: string } => {
  const states = new Set(parts.map((part) => partState(part)));
  if (states.has('approval')) {
    return { state: 'approval', suffix: '' };
  }
  if (states.has('active')) {
    return {
      state: 'active',
      suffix: states.has('error') ? ' (some failed)' : states.has('denied') ? ' (some denied)' : '',
    };
  }
  if (states.has('completed')) {
    return {
      state: 'completed',
      suffix: states.has('error') ? ' (some failed)' : states.has('denied') ? ' (some denied)' : '',
    };
  }
  return states.has('error') ? { state: 'error', suffix: '' } : { state: 'denied', suffix: '' };
};

const lowerInitial = (value: string): string => `${value.charAt(0).toLowerCase()}${value.slice(1)}`;

/** Describe every live family represented by an adjacent tool group. */
export const describeActivity = (parts: readonly MyMessagePart[]): string => {
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

  return orderedFamilies
    .map((family, index) => {
      const familyParts = byFamily.get(family)!;
      const { state, suffix } = familyState(familyParts);
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
