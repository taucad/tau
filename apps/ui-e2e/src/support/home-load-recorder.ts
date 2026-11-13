/* oxlint-disable typescript/consistent-type-definitions -- The recorder's record crosses the page boundary as plain JSON shapes. */
import { test } from 'vitest';
import { commands } from 'vitest/browser';
import { cloudDefectRow } from '#support/cloud-stand-ins.js';
import * as target from '#support/external-target.js';

/**
 * What the home page load gate looks for, by selector. Passed to the page as JSON, so the recorder that runs
 * there and the spec that reads its record name the same elements.
 */
export type HomeLoadProbe = {
  /** The composer's text input: the native stand-in the server renders, or the rich editor that replaces it. */
  readonly composerEditor: string;
  /** The composer's agent and model trigger. */
  readonly modelTrigger: string;
  /** The trigger's fixed-width neutral placeholder, drawn while the model's display name is unknown. */
  readonly modelPlaceholder: string;
  /** The trigger's model name. */
  readonly modelName: string;
  /** A label shaped like a catalog id (`anthropic-claude-haiku-5.5`) rather than a display name. */
  readonly catalogIdPattern: string;
  /** The skills catalog's failure notice, by its words. */
  readonly skillsNoticeText: string;
  /** The skills catalog's retry control. */
  readonly skillsRetry: string;
  /** A loading spinner inside the application shell's panes. */
  readonly shellSpinner: string;
};

export const homeLoadProbe: HomeLoadProbe = {
  composerEditor: 'textarea[aria-label="Chat message"], [aria-label="Ask Tau to build anything..."]',
  modelTrigger: '[data-slot="agent-trigger"]',
  modelPlaceholder: '[data-slot="trigger-model-placeholder"]',
  modelName: '[data-slot="trigger-model"]',
  catalogIdPattern: String.raw`^[a-z0-9]+(?:[-/.][a-z0-9]+)+$`,
  skillsNoticeText: 'Skill updates unavailable',
  skillsRetry: '[aria-label="Retry skill updates"], [data-slot="skills-recovery"]',
  shellSpinner: '.pane-resize-allotment [role="status"][aria-label="Loading"]',
};

/** How the composer's model trigger reads. */
export type ModelLabelState =
  | { readonly kind: 'absent' }
  | { readonly kind: 'placeholder' }
  | { readonly kind: 'name'; readonly name: string }
  /** An empty label, or one that prints a catalog id. */
  | { readonly kind: 'invalid'; readonly name: string; readonly accessibleName: string };

/** What one look at a home document found. */
export type HomeInspection = {
  /** The skills notice's words or its retry control, when either is in the document. */
  readonly skillsNotice: boolean;
  readonly shellSpinner: boolean;
  readonly modelLabel: ModelLabelState;
};

/** The composer's box and border as painted: any difference between two frames is visible. */
export type ComposerFace = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly border: string;
  readonly radius: string;
  readonly outline: string;
  readonly shadow: string;
};

export type HomeLoadShift = {
  /** Milliseconds from navigation start. */
  readonly t: number;
  readonly value: number;
  readonly hadRecentInput: boolean;
  /** Each moved node, with its box before and after. */
  readonly sources: readonly string[];
};

export type HomeLoadViolation = {
  readonly kind: 'model-label' | 'shell-spinner' | 'skills-notice';
  /** Milliseconds from navigation start of the first frame that showed it. */
  readonly t: number;
  readonly frames: number;
  readonly detail: string;
};

/** Everything one document's load put on screen, frame by frame, from its first frame on. */
export type HomeLoadRecord = {
  readonly frames: number;
  readonly shifts: readonly HomeLoadShift[];
  readonly violations: readonly HomeLoadViolation[];
  /** The composer's face each time it changed, from the first frame it was on screen. */
  readonly composer: ReadonlyArray<{ readonly t: number; readonly face: ComposerFace }>;
};

type HomeLoadGlobal = typeof globalThis & {
  __TAU_HOME_LOAD__: HomeLoadRecord & {
    inspect(root: Document): HomeInspection;
  };
};

/**
 * Installed before any page script: records every `layout-shift` entry from navigation start, and on every
 * animation frame — the paint that follows it is what the visitor sees — whether the skills notice, a shell
 * spinner or a bad model label is in the document, and the composer's box and border whenever they change.
 *
 * Runs in the page, so it is self-contained: everything it needs arrives in `probe`.
 *
 * @param probe - The selectors to look for.
 */
export const recordHomeLoad = (probe: HomeLoadProbe): void => {
  const catalogId = new RegExp(probe.catalogIdPattern, 'u');
  const noticeXpath = `//text()[contains(., '${probe.skillsNoticeText}')][not(ancestor::script)]`;
  const describe = (node: Node | undefined): string => {
    if (!(node instanceof HTMLElement)) {
      return node?.nodeName ?? 'unknown';
    }
    const label = node.dataset['slot'] ?? node.getAttribute('aria-label') ?? node.getAttribute('role');
    const classes = node.className.split(' ').slice(0, 4).join('.');
    const text = node.textContent.trim().slice(0, 40);
    return `${node.tagName.toLowerCase()}${label ? `[${label}]` : ''}${classes ? `.${classes}` : ''}${text ? ` "${text}"` : ''}`;
  };
  const box = (rect: DOMRectReadOnly): string =>
    [rect.x, rect.y, rect.width, rect.height].map((value) => Math.round(value)).join(',');

  /* The composer's bordered box: the nearest ancestor of its input, inclusive, that draws a border. */
  const composerFrame = (editor: Element | undefined): Element | undefined => {
    for (let element = editor; element && element !== document.body; element = element.parentElement ?? undefined) {
      if (getComputedStyle(element).borderTopWidth !== '0px') {
        return element;
      }
    }
    return undefined;
  };
  /* The trigger that belongs to the composer: the nearest ancestor of the input that holds one. */
  const composerTrigger = (editor: Element | undefined): Element | undefined => {
    for (
      let element = editor?.parentElement ?? undefined;
      element && element.tagName !== 'MAIN';
      element = element.parentElement ?? undefined
    ) {
      const trigger = element.querySelector(probe.modelTrigger);
      if (trigger) {
        return trigger;
      }
    }
    return undefined;
  };

  const inspect = (root: Document): HomeInspection => {
    const editor = root.querySelector(probe.composerEditor) ?? undefined;
    const trigger = composerTrigger(editor);
    let modelLabel: ModelLabelState = { kind: 'absent' };
    if (trigger?.querySelector(probe.modelPlaceholder)) {
      modelLabel = { kind: 'placeholder' };
    } else if (trigger) {
      const name = (trigger.querySelector(probe.modelName)?.textContent ?? '').trim();
      const accessibleName = (trigger.getAttribute('aria-label') ?? '').replace(/^Agent and model:\s*/u, '').trim();
      const isBad = (text: string): boolean => text === '' || catalogId.test(text);
      modelLabel =
        isBad(name) || (trigger.hasAttribute('aria-label') && isBad(accessibleName))
          ? { kind: 'invalid', name, accessibleName }
          : { kind: 'name', name };
    }
    const notice = root.evaluate(noticeXpath, root, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    return {
      skillsNotice: notice !== null || root.querySelector(probe.skillsRetry) !== null,
      shellSpinner: root.querySelector(probe.shellSpinner) !== null,
      modelLabel,
    };
  };

  const shifts: HomeLoadShift[] = [];
  const violations: HomeLoadViolation[] = [];
  const composer: Array<{ t: number; face: ComposerFace }> = [];
  const record = { frames: 0, shifts, violations, composer, inspect };
  Object.defineProperty(globalThis, '__TAU_HOME_LOAD__', { value: record });

  new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as Array<
      PerformanceEntry & {
        value: number;
        hadRecentInput: boolean;
        sources?: Array<{ node?: Node; previousRect: DOMRectReadOnly; currentRect: DOMRectReadOnly }>;
      }
    >) {
      shifts.push({
        t: Math.round(entry.startTime),
        value: entry.value,
        hadRecentInput: entry.hadRecentInput,
        sources: (entry.sources ?? []).map(
          (source) => `${describe(source.node)} ${box(source.previousRect)} -> ${box(source.currentRect)}`,
        ),
      });
    }
  }).observe({ type: 'layout-shift', buffered: true });

  const violate = (kind: HomeLoadViolation['kind'], detail: string): void => {
    const seen = violations.find((violation) => violation.kind === kind);
    if (seen) {
      (seen as { frames: number }).frames += 1;
      return;
    }
    violations.push({ kind, t: Math.round(performance.now()), frames: 1, detail });
  };

  let lastFace = '';
  const sample = (): void => {
    record.frames += 1;
    const found = inspect(document);
    if (found.skillsNotice) {
      violate('skills-notice', 'the skills notice or its retry control is in the document');
    }
    if (found.shellSpinner) {
      violate('shell-spinner', 'a loading spinner is inside the application shell');
    }
    if (found.modelLabel.kind === 'invalid') {
      violate(
        'model-label',
        `the model trigger reads "${found.modelLabel.name}" (accessible name "${found.modelLabel.accessibleName}")`,
      );
    }
    const frame = composerFrame(document.querySelector(probe.composerEditor) ?? undefined);
    if (frame) {
      const style = getComputedStyle(frame);
      const rect = frame.getBoundingClientRect();
      const face: ComposerFace = {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        border: `${style.borderTopWidth} ${style.borderTopStyle} ${style.borderTopColor}`,
        radius: style.borderTopLeftRadius,
        outline: `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor} ${style.outlineOffset}`,
        shadow: style.boxShadow,
      };
      const key = JSON.stringify(face);
      if (key !== lastFace) {
        lastFace = key;
        composer.push({ t: Math.round(performance.now()), face });
      }
    }
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
};

/** Install the recorder on every document the target page loads from now on. */
export const installHomeLoadRecorder = async (): Promise<void> => target.addInitScript(recordHomeLoad, homeLoadProbe);

/** The current document's load record, without its page-side inspector. */
export const readHomeLoad = async (): Promise<HomeLoadRecord> =>
  target.evaluate(() => {
    const { frames, shifts, violations, composer } = (globalThis as HomeLoadGlobal).__TAU_HOME_LOAD__;
    return { frames, shifts, violations, composer };
  });

/**
 * Fetch `path` as the server renders it, with the page's cookies, and inspect the HTML before any script runs.
 *
 * @param path - The document to fetch.
 * @returns What the server-rendered document shows.
 */
export const inspectServerHtml = async (path: string): Promise<HomeInspection> =>
  target.evaluate(async (url) => {
    const response = await fetch(url, { credentials: 'same-origin' });
    const html = new DOMParser().parseFromString(await response.text(), 'text/html');
    return (globalThis as HomeLoadGlobal).__TAU_HOME_LOAD__.inspect(html);
  }, path);

/*
 * Project loads (app state orchestration A0.10): the same per-frame pattern, for a project route and for a Home →
 * project click. Each defect row reads one field of the record, so its failure names the frame and the node.
 */

/** What the project load recorder looks for, by selector. Passed to the page as JSON. */
export type ProjectLoadProbe = {
  /** The application shell's outermost node. On a phone the sidebar is a sheet, so shell rows assert on this. */
  readonly wrapper: string;
  /** The desktop sidebar itself, which leaves the DOM on a phone by design. */
  readonly sidebar: string;
  /** The workspace's loading placeholder (`WorkspaceSkeleton`). */
  readonly placeholder: string;
  /** The placeholder's lanes, and the workbench lane among their children. */
  readonly placeholderLanes: string;
  readonly placeholderWorkbenchLane: string;
  /** The chat composer's region: the tray and the textarea. */
  readonly composer: string;
  /** The empty-chat state. */
  readonly emptyState: string;
  /** The viewer dock's header (Dockview's tab strip inside the viewer container). */
  readonly viewerDockHeader: string;
  /** A skeleton block of the design system. */
  readonly skeleton: string;
  /** The rich composer, which replaces the server's textarea only once the page has hydrated. */
  readonly hydrated: string;
  /** A project row of the sidebar, followed by its top offset. */
  readonly projectRow: string;
  /** The row's disclosure button; its accessible name carries the project's name and nothing else. */
  readonly projectRowDisclosure: string;
};

export const projectLoadProbe: ProjectLoadProbe = {
  wrapper: '[data-slot="sidebar-wrapper"]',
  sidebar: '[data-slot="sidebar"]',
  placeholder: '[data-testid="workspace-skeleton"]',
  placeholderLanes: '[data-slot="workspace-skeleton-lanes"]',
  placeholderWorkbenchLane: ':scope > .border-l',
  composer: '[role="region"][aria-label="Chat composer"]',
  emptyState: '[data-slot="panel-empty-state"]',
  viewerDockHeader: String.raw`.\@container\/viewer .dv-tabs-and-actions-container`,
  skeleton: '[data-slot="skeleton"]',
  hydrated: '[aria-label="Ask Tau to build anything..."][contenteditable="true"]',
  projectRow: '[data-slot="project-trigger"]',
  projectRowDisclosure: 'button[aria-expanded][aria-label]',
};

/** One frame the recorder saw something in: the animation-frame index (1 is the first) and its time. */
export type ProjectLoadFrame = {
  readonly frame: number;
  /** Milliseconds from navigation start. */
  readonly t: number;
};

export type ProjectLoadRecord = {
  readonly frames: number;
  /** The first frame the wrapper was in, if it ever was. */
  readonly wrapperFirstFrame: ProjectLoadFrame | undefined;
  /** Distinct wrapper nodes the document held. More than one means the shell was mounted again. */
  readonly wrapperMounts: number;
  /** Each time the wrapper node in the document left it, seen by a mutation observer (one-commit remounts too). */
  readonly wrapperRemovals: readonly ProjectLoadFrame[];
  /** Frames with no wrapper, counted from the first frame. */
  readonly wrapperAbsentFrames: readonly ProjectLoadFrame[];
  /** Frames with no desktop sidebar, counted from the first frame. */
  readonly sidebarAbsentFrames: readonly ProjectLoadFrame[];
  /** Each distinct workspace placeholder node, when it was created. */
  readonly placeholders: readonly ProjectLoadFrame[];
  /** Frames where a placeholder drew its workbench lane, and the lane's width. */
  readonly placeholderWorkbenchLane: ReadonlyArray<ProjectLoadFrame & { readonly width: number }>;
  /** The composer region's box each time it changed, from its first frame. */
  readonly composer: ReadonlyArray<ProjectLoadFrame & { readonly y: number; readonly height: number }>;
  /** Each distinct viewer dock header node, when it was mounted. */
  readonly viewerDockHeaders: readonly ProjectLoadFrame[];
  /** Each project row's top offset whenever it changed, by the row's name, from its first frame on. */
  readonly projectRows: ReadonlyArray<ProjectLoadFrame & { readonly row: string; readonly y: number }>;
  /**
   * Frames that drew a tall vertical lane border, with each border's x offset, whatever element drew it. Recorded
   * only when the recorder was installed with `laneBorders`, since it reads every element's box in every frame.
   */
  readonly laneBorders: ReadonlyArray<ProjectLoadFrame & { readonly xs: readonly number[] }>;
  /** The first frame the rich composer was in: the page had hydrated by then. */
  readonly hydratedFirstFrame: ProjectLoadFrame | undefined;
  /** Frames with a skeleton block, and how many. */
  readonly skeletonFrames: ReadonlyArray<ProjectLoadFrame & { readonly count: number }>;
  readonly shifts: readonly HomeLoadShift[];
  /** Each largest-contentful-paint candidate, in order; the last is the page's LCP. */
  readonly largestPaints: ReadonlyArray<{
    readonly t: number;
    readonly size: number;
    readonly element: string;
    readonly isEmptyState: boolean;
  }>;
  readonly firstPaint: number | undefined;
  readonly firstContentfulPaint: number | undefined;
  /** Named moments the spec marked in the page, such as a click. */
  readonly marks: ReadonlyArray<ProjectLoadFrame & { readonly name: string }>;
};

type ProjectLoadGlobal = typeof globalThis & {
  __TAU_PROJECT_LOAD__: ProjectLoadRecord & { mark(name: string): void };
};

/** How many frames of one kind a record keeps; the count past it is still right in `frames`. */
const projectLoadFrameLimit = 400;

/**
 * Installed before any page script: watches the shell, the placeholder, the composer and the viewer dock on every
 * animation frame and on every DOM mutation, and records layout shifts, largest-contentful-paint candidates and the
 * first paints from navigation start. Runs in the page, so it is self-contained: everything arrives in `probe`.
 *
 * @param input - The selectors, and how many frames of one kind to keep.
 */
export const recordProjectLoad = (input: {
  readonly probe: ProjectLoadProbe;
  readonly limit: number;
  readonly laneBorders: boolean;
}): void => {
  const { probe, limit } = input;
  const describe = (node: Node | undefined): string => {
    if (!(node instanceof HTMLElement)) {
      return node?.nodeName ?? 'unknown';
    }
    const label = node.dataset['slot'] ?? node.getAttribute('aria-label') ?? node.getAttribute('role');
    const classes = (typeof node.className === 'string' ? node.className : '').split(' ').slice(0, 4).join('.');
    const text = node.textContent.trim().slice(0, 40);
    return `${node.tagName.toLowerCase()}${label ? `[${label}]` : ''}${classes ? `.${classes}` : ''}${text ? ` "${text}"` : ''}`;
  };
  const box = (rect: DOMRectReadOnly): string =>
    [rect.x, rect.y, rect.width, rect.height].map((value) => Math.round(value)).join(',');
  const now = (): number => Math.round(performance.now());

  const record = {
    frames: 0,
    wrapperFirstFrame: undefined as ProjectLoadFrame | undefined,
    wrapperMounts: 0,
    wrapperRemovals: [] as ProjectLoadFrame[],
    wrapperAbsentFrames: [] as ProjectLoadFrame[],
    sidebarAbsentFrames: [] as ProjectLoadFrame[],
    placeholders: [] as ProjectLoadFrame[],
    placeholderWorkbenchLane: [] as Array<ProjectLoadFrame & { width: number }>,
    composer: [] as Array<ProjectLoadFrame & { y: number; height: number }>,
    viewerDockHeaders: [] as ProjectLoadFrame[],
    projectRows: [] as Array<ProjectLoadFrame & { row: string; y: number }>,
    laneBorders: [] as Array<ProjectLoadFrame & { xs: number[] }>,
    hydratedFirstFrame: undefined as ProjectLoadFrame | undefined,
    skeletonFrames: [] as Array<ProjectLoadFrame & { count: number }>,
    shifts: [] as HomeLoadShift[],
    largestPaints: [] as Array<{ t: number; size: number; element: string; isEmptyState: boolean }>,
    firstPaint: undefined as number | undefined,
    firstContentfulPaint: undefined as number | undefined,
    marks: [] as Array<ProjectLoadFrame & { name: string }>,
    mark: (name: string): void => {
      record.marks.push({ frame: record.frames + 1, t: now(), name });
    },
  };
  Object.defineProperty(globalThis, '__TAU_PROJECT_LOAD__', { value: record });
  const keep = <Entry>(list: Entry[], entry: Entry): void => {
    if (list.length < limit) {
      list.push(entry);
    }
  };
  /* A mutation is painted in the next frame, so it carries that frame's index. */
  const nextFrame = (): ProjectLoadFrame => ({ frame: record.frames + 1, t: now() });

  const seenWrappers = new WeakSet<Element>();
  const seenPlaceholders = new WeakSet<Element>();
  const seenHeaders = new WeakSet<Element>();
  let wrapper: Element | undefined;
  const track = (): void => {
    if (wrapper && !wrapper.isConnected) {
      keep(record.wrapperRemovals, nextFrame());
      wrapper = undefined;
    }
    const current = document.querySelector(probe.wrapper) ?? undefined;
    if (current && current !== wrapper) {
      if (!seenWrappers.has(current)) {
        seenWrappers.add(current);
        record.wrapperMounts += 1;
      }
      wrapper = current;
    }
    for (const node of document.querySelectorAll(probe.placeholder)) {
      if (!seenPlaceholders.has(node)) {
        seenPlaceholders.add(node);
        keep(record.placeholders, nextFrame());
      }
    }
    for (const node of document.querySelectorAll(probe.viewerDockHeader)) {
      if (!seenHeaders.has(node)) {
        seenHeaders.add(node);
        keep(record.viewerDockHeaders, nextFrame());
      }
    }
  };
  new MutationObserver(track).observe(document, { childList: true, subtree: true });

  new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as Array<
      PerformanceEntry & {
        value: number;
        hadRecentInput: boolean;
        sources?: Array<{ node?: Node; previousRect: DOMRectReadOnly; currentRect: DOMRectReadOnly }>;
      }
    >) {
      keep(record.shifts, {
        t: Math.round(entry.startTime),
        value: entry.value,
        hadRecentInput: entry.hadRecentInput,
        sources: (entry.sources ?? []).map(
          (source) => `${describe(source.node)} ${box(source.previousRect)} -> ${box(source.currentRect)}`,
        ),
      });
    }
  }).observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as Array<PerformanceEntry & { size: number; element?: Element }>) {
      keep(record.largestPaints, {
        t: Math.round(entry.startTime),
        size: entry.size,
        element: describe(entry.element ?? undefined),
        isEmptyState: Boolean(entry.element?.closest(probe.emptyState)),
      });
    }
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.name === 'first-paint') {
        record.firstPaint = Math.round(entry.startTime);
      } else if (entry.name === 'first-contentful-paint') {
        record.firstContentfulPaint = Math.round(entry.startTime);
      }
    }
  }).observe({ type: 'paint', buffered: true });

  /* A lane border is a visible left or right border on a box at least half the window tall. */
  const scanLaneBorders = (frame: ProjectLoadFrame): void => {
    const xs = new Set<number>();
    for (const element of document.body.querySelectorAll('*')) {
      const rect = element.getBoundingClientRect();
      if (rect.height < innerHeight / 2 || rect.width === 0) {
        continue;
      }
      if (!element.checkVisibility({ opacityProperty: true, visibilityProperty: true })) {
        continue;
      }
      const style = getComputedStyle(element);
      if (Number.parseFloat(style.borderLeftWidth) > 0 && style.borderLeftStyle !== 'none') {
        xs.add(Math.round(rect.left));
      }
      if (Number.parseFloat(style.borderRightWidth) > 0 && style.borderRightStyle !== 'none') {
        xs.add(Math.round(rect.right));
      }
    }
    if (xs.size > 0) {
      keep(record.laneBorders, { ...frame, xs: [...xs].toSorted((left, right) => left - right) });
    }
  };
  let lastComposer = '';
  const rowOffsets = new Map<string, number>();
  const scanProjectRows = (frame: ProjectLoadFrame): void => {
    for (const row of document.querySelectorAll(probe.projectRow)) {
      /* Keyed by the project's name alone: the row's text also carries its status, which changes as it opens. */
      const disclosure = row.querySelector(probe.projectRowDisclosure)?.getAttribute('aria-label') ?? '';
      const name = disclosure.replace(/^(?:Expand|Collapse)\s+/u, '').trim() || row.textContent.trim().slice(0, 60);
      const y = Math.round(row.getBoundingClientRect().y);
      if (name !== '' && rowOffsets.get(name) !== y) {
        rowOffsets.set(name, y);
        keep(record.projectRows, { ...frame, row: name, y });
      }
    }
  };
  const sample = (): void => {
    record.frames += 1;
    const frame: ProjectLoadFrame = { frame: record.frames, t: now() };
    track();
    if (wrapper) {
      record.wrapperFirstFrame ??= frame;
    } else {
      keep(record.wrapperAbsentFrames, frame);
    }
    if (!document.querySelector(probe.sidebar)) {
      keep(record.sidebarAbsentFrames, frame);
    }
    for (const lanes of document.querySelectorAll(probe.placeholderLanes)) {
      const lane = lanes.querySelector(probe.placeholderWorkbenchLane);
      const width = lane ? lane.getBoundingClientRect().width : 0;
      if (lane && getComputedStyle(lane).display !== 'none' && width > 0) {
        keep(record.placeholderWorkbenchLane, { ...frame, width: Math.round(width) });
      }
    }
    const composer = document.querySelector(probe.composer);
    if (composer) {
      const rect = composer.getBoundingClientRect();
      const face = { y: Math.round(rect.y), height: Math.round(rect.height) };
      const key = JSON.stringify(face);
      if (key !== lastComposer) {
        lastComposer = key;
        keep(record.composer, { ...frame, ...face });
      }
    }
    scanProjectRows(frame);
    if (input.laneBorders) {
      scanLaneBorders(frame);
    }
    if (document.querySelector(probe.hydrated)) {
      record.hydratedFirstFrame ??= frame;
    }
    const skeletons = document.querySelectorAll(probe.skeleton).length;
    if (skeletons > 0) {
      keep(record.skeletonFrames, { ...frame, count: skeletons });
    }
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
};

/**
 * Each move of a sidebar project row between two frames, by name, frame and pixels.
 *
 * @param record - One load's record.
 * @param since - Count only moves painted at or after this time (milliseconds from navigation start).
 * @returns One line per move.
 */
export const projectRowMoves = (record: ProjectLoadRecord, since = 0): string[] => {
  const last = new Map<string, number>();
  const moves: string[] = [];
  for (const entry of record.projectRows) {
    const before = last.get(entry.row);
    if (before !== undefined && before !== entry.y && entry.t >= since) {
      moves.push(
        `frame ${entry.frame} (${entry.t} ms): "${entry.row}" top ${before} -> ${entry.y} px (${entry.y - before} px)`,
      );
    }
    last.set(entry.row, entry.y);
  }
  return moves;
};

/**
 * Install the project load recorder on every document the target page loads from now on.
 *
 * @param options - `laneBorders` also records every frame's lane borders, which costs a pass over the document.
 */
export const installProjectLoadRecorder = async (options: { readonly laneBorders?: boolean } = {}): Promise<void> =>
  target.addInitScript(recordProjectLoad, {
    probe: projectLoadProbe,
    limit: projectLoadFrameLimit,
    laneBorders: options.laneBorders === true,
  });

/** The current document's project load record, without its page-side helpers. */
export const readProjectLoad = async (): Promise<ProjectLoadRecord> =>
  target.evaluate(() => {
    const { mark: _mark, ...record } = (globalThis as ProjectLoadGlobal).__TAU_PROJECT_LOAD__;
    return structuredClone(record) as ProjectLoadRecord;
  });

/**
 * Mark a moment in the current document's record, such as the click that starts a client navigation.
 *
 * @param name - What happened.
 */
export const markProjectLoad = async (name: string): Promise<void> =>
  target.evaluate((label) => {
    (globalThis as ProjectLoadGlobal).__TAU_PROJECT_LOAD__.mark(label);
  }, name);

/** What the server's HTML for a document holds, before any script runs. */
export type ServerShellInspection = {
  readonly wrapper: boolean;
  readonly sidebar: boolean;
  readonly placeholder: boolean;
};

/**
 * Fetch `path` as the server renders it, with the page's cookies, and look for the shell in the HTML.
 *
 * @param path - The document to fetch.
 * @returns Whether the server HTML holds the wrapper, the desktop sidebar and the workspace placeholder.
 */
export const inspectServerShell = async (path: string): Promise<ServerShellInspection> =>
  target.evaluate(
    async ({ url, probe }) => {
      const response = await fetch(url, { credentials: 'same-origin' });
      const html = new DOMParser().parseFromString(await response.text(), 'text/html');
      return {
        wrapper: html.querySelector(probe.wrapper) !== null,
        sidebar: html.querySelector(probe.sidebar) !== null,
        placeholder: html.querySelector(probe.placeholder) !== null,
      };
    },
    { url: path, probe: projectLoadProbe },
  );

/*
 * Worker reads answered late (A0.10). The chat listing, the transcript and the project listing are file-manager
 * worker calls over a `MessagePort`, not network requests, so they cannot be routed. This wraps the page's ports: a
 * call whose method and first argument match a rule is sent at once, and its reply is handed to the page's listeners
 * `milliseconds` late, as a slow disk would answer. Heartbeats still arrive, so the call never looks dead.
 */

/** One rule: a worker call by method and by its first argument (a path), and how late its reply arrives. */
export type WorkerReadDelay = {
  readonly method: string;
  /** A regular expression source, matched against the call's first argument: a path, or its JSON when not a string. */
  readonly path: string;
  readonly milliseconds: number;
};

/** The `sessionStorage` key the rules are read from when each document starts. */
export const workerReadDelayKey = 'tau:e2e:worker-read-delay';

export type WorkerReadLog = ReadonlyArray<{
  readonly t: number;
  readonly method: string;
  readonly path: string | undefined;
  readonly delayed: boolean;
}>;

/** The held replies as they reached the page, each with when its request was sent. */
export type WorkerReadDeliveries = ReadonlyArray<{
  readonly t: number;
  readonly sentAt: number;
  readonly method: string;
  readonly path: string | undefined;
}>;

type WorkerReadGlobal = typeof globalThis & {
  __TAU_WORKER_READS__: { log: WorkerReadLog; delivered: WorkerReadDeliveries };
};

/**
 * Installed before any page script. Reads its rules from `sessionStorage` under `key`, so a spec arms a delay for
 * the next load and the seeding loads before it run undelayed.
 *
 * @param key - The `sessionStorage` key holding the rules as JSON.
 */
export const delayWorkerReads = (key: string): void => {
  let rules: Array<{ method: string; path: RegExp; milliseconds: number }> = [];
  try {
    const raw = sessionStorage.getItem(key);
    rules = (raw ? (JSON.parse(raw) as WorkerReadDelay[]) : []).map((rule) => ({
      ...rule,
      path: new RegExp(rule.path, 'u'),
    }));
  } catch {
    rules = [];
  }
  const log: Array<{ t: number; method: string; path: string | undefined; delayed: boolean }> = [];
  /* Each held reply as it reached the page's listener: proof the late answer was late, not only that it was held. */
  const delivered: Array<{ t: number; sentAt: number; method: string; path: string | undefined }> = [];
  Object.defineProperty(globalThis, '__TAU_WORKER_READS__', { value: { log, delivered } });
  const held = new Map<string, { milliseconds: number; sentAt: number; method: string; path: string | undefined }>();

  const { postMessage } = MessagePort.prototype;
  MessagePort.prototype.postMessage = function (this: MessagePort, message: unknown, ...rest: unknown[]): void {
    const frame = message as { k?: unknown; i?: unknown; n?: unknown; a?: unknown } | undefined;
    if (frame && typeof frame === 'object' && frame.k === 'rq' && typeof frame.i === 'string') {
      const first: unknown = Array.isArray(frame.a) ? frame.a[0] : frame.a;
      let path: string | undefined;
      try {
        path =
          typeof first === 'string'
            ? first
            : first === undefined
              ? undefined
              : String(JSON.stringify(first)).slice(0, 300);
      } catch {
        path = undefined;
      }
      const method = String(frame.n);
      const rule = rules.find((candidate) => candidate.method === method && candidate.path.test(path ?? ''));
      if (rule) {
        held.set(frame.i, { milliseconds: rule.milliseconds, sentAt: Math.round(performance.now()), method, path });
      }
      if (log.length < 2000) {
        log.push({ t: Math.round(performance.now()), method, path, delayed: rule !== undefined });
      }
    }
    // oxlint-disable-next-line typescript/no-unsafe-argument -- forwards the caller's own transfer arguments.
    (postMessage as (...parameters: unknown[]) => void).call(this, message, ...rest);
  };

  const wrappers = new WeakMap<EventListenerOrEventListenerObject, EventListener>();
  const wrap = (listener: EventListenerOrEventListenerObject): EventListener => {
    const known = wrappers.get(listener);
    if (known) {
      return known;
    }
    const deliver = (target: unknown, event: Event): void => {
      if (typeof listener === 'function') {
        listener.call(target, event);
      } else {
        listener.handleEvent(event);
      }
    };
    const wrapper = function (this: unknown, event: Event): void {
      const { data } = event as MessageEvent<{ k?: unknown; i?: unknown } | undefined>;
      const late =
        data && typeof data === 'object' && data.k === 'rs' && typeof data.i === 'string'
          ? held.get(data.i)
          : undefined;
      if (late === undefined) {
        deliver(this, event);
        return;
      }
      setTimeout(() => {
        if (delivered.length < 2000) {
          delivered.push({
            t: Math.round(performance.now()),
            sentAt: late.sentAt,
            method: late.method,
            path: late.path,
          });
        }
        deliver(this, event);
      }, late.milliseconds);
    };
    wrappers.set(listener, wrapper);
    return wrapper;
  };
  const { addEventListener, removeEventListener } = MessagePort.prototype;
  type ListenerCall = [type: string, listener?: EventListenerOrEventListenerObject, options?: unknown];
  /* `this` and the DOM's three arguments arrive as one tuple; a listener-less call passes through untouched. */
  const routed = (parameters: ListenerCall): ListenerCall => {
    const [type, listener, options] = parameters;
    return type === 'message' && listener ? [type, wrap(listener), options] : parameters;
  };
  MessagePort.prototype.addEventListener = function (this: MessagePort, ...parameters: ListenerCall): void {
    (addEventListener as (...call: ListenerCall) => void).apply(this, routed(parameters));
  };
  MessagePort.prototype.removeEventListener = function (this: MessagePort, ...parameters: ListenerCall): void {
    (removeEventListener as (...call: ListenerCall) => void).apply(this, routed(parameters));
  };
};

/** Install the worker read delay on every document the target page loads from now on; it is idle until armed. */
export const installWorkerReadDelay = async (): Promise<void> =>
  target.addInitScript(delayWorkerReads, workerReadDelayKey);

/**
 * Arm `rules` for every later load in this tab, or disarm with none.
 *
 * @param rules - The worker calls to answer late.
 */
export const armWorkerReadDelay = async (rules: readonly WorkerReadDelay[]): Promise<void> =>
  target.evaluate(
    ({ key, value }) => {
      if (value.length === 0) {
        sessionStorage.removeItem(key);
      } else {
        sessionStorage.setItem(key, JSON.stringify(value));
      }
    },
    { key: workerReadDelayKey, value: rules },
  );

/** The worker calls the current document made, and which were answered late. */
export const readWorkerReads = async (): Promise<WorkerReadLog> =>
  target.evaluate(() => (globalThis as WorkerReadGlobal).__TAU_WORKER_READS__.log);

/**
 * The held replies the page has received so far.
 *
 * @returns Each delivery, with its request's send time.
 */
export const readWorkerDeliveries = async (): Promise<WorkerReadDeliveries> =>
  target.evaluate(() => (globalThis as WorkerReadGlobal).__TAU_WORKER_READS__.delivered);

/**
 * When the first read that `rule` itself held was sent, counting only a read whose reply then reached the page at
 * least the rule's delay later. A row checks that its own delay was forced, rather than any delay armed beside it,
 * and that the late answer was delivered late rather than only held.
 *
 * @param deliveries - The held replies the page received.
 * @param rule - One armed delay rule.
 * @returns Milliseconds from navigation start, or `undefined` when no reply matching the rule was delivered late.
 */
export const firstDelayedRead = (deliveries: WorkerReadDeliveries, rule: WorkerReadDelay): number | undefined => {
  const path = new RegExp(rule.path, 'u');
  const late = deliveries.filter(
    (entry) =>
      entry.method === rule.method && path.test(entry.path ?? '') && entry.t - entry.sentAt >= rule.milliseconds - 20,
  );
  return late.length === 0 ? undefined : Math.min(...late.map((entry) => entry.sentAt));
};

/* A0.10's request delay: the commands `browser-command.ts` registers, declared here so the lane adds nothing to
 * `external-target.ts`. */
declare module 'vitest/browser' {
  interface BrowserCommands {
    uiDelayTargetRequests: (pattern: string, milliseconds: number) => Promise<void>;
    uiReadDelayedTargetRequests: () => Promise<readonly string[]>;
  }
}

/**
 * Hold every request whose URL matches `pattern` for `milliseconds`, for the rest of the test. Routing turns the
 * context's HTTP cache off, so a reload after this fetches every matching file again and is held.
 *
 * @param pattern - A regular expression source matched against the request URL.
 * @param milliseconds - How long each request is held.
 */
export const delayRequests = async (pattern: string, milliseconds: number): Promise<void> =>
  commands.uiDelayTargetRequests(pattern, milliseconds);

/** The URLs {@link delayRequests} held in this target context so far. */
export const readDelayedRequests = async (): Promise<readonly string[]> => commands.uiReadDelayedTargetRequests();

/** How long an overrun measure is given to settle before its row fails, so it cannot act on the next row's target. */
const overrunGrace = 60_000;

/**
 * Run `measure` with a bound. Past it the work still running is awaited for `overrunGrace` more, so it settles
 * before the row's teardown and the next row; then the returned promise rejects with the overrun.
 */
const withinBudget = async <Measured>(measure: () => Promise<Measured>, milliseconds: number): Promise<Measured> => {
  /* Settled into a value either way, so a measure that fails after the bound is never an unhandled rejection. */
  const running = (async (): Promise<{ readonly value: Measured } | { readonly error: unknown }> => {
    try {
      return { value: await measure() };
    } catch (error) {
      return { error };
    }
  })();
  const after = async (wait: number): Promise<'late'> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = await new Promise<'late'>((resolve) => {
      timer = setTimeout(() => {
        resolve('late');
      }, wait);
    });
    clearTimeout(timer);
    return late;
  };
  const outcome = await Promise.race([running, after(milliseconds)]);
  if (outcome !== 'late') {
    if ('error' in outcome) {
      throw outcome.error;
    }
    return outcome.value;
  }
  const settled = await Promise.race([running, after(overrunGrace)]);
  throw new Error(
    `the measure phase did not finish within ${milliseconds} ms${settled === 'late' ? `, and was still running ${overrunGrace} ms later` : ''}`,
  );
};

/**
 * Define the known-defect rows of one spec (A0.10, D25), on A0.11's `cloudDefectRow`. Each row is a plain test, so
 * a fault anywhere in it (a load, a wait, a precondition, the budget, setup or teardown) fails it. It runs in two
 * phases:
 *
 * - `measure` seeds, loads, checks the forcing happened and checks every precondition, within `budget`. An error in
 *   it is kept as a `measure-failure` artifact and fails the row.
 * - `assert` is the defect's own assertion. While `expectedFailure` is true its assertion error passes the row,
 *   recorded as an `<id> stands` notice and a `failure` artifact naming the frame; its passing fails the row with
 *   `<id>: defect no longer reproduces`. The fixing lane sets `expectedFailure: false`, and the row then measures
 *   and asserts as a plain passing test.
 *
 * @param directory - The artifact directory of the spec.
 * @returns The row definer.
 */
export const knownDefectRows =
  (directory: string) =>
  <Measured>(
    title: string,
    row: {
      readonly artifact: string;
      /** Whether the defect still stands. The fixing lane sets it to false. */
      readonly expectedFailure: boolean;
      /** The measure phase's bound. Milliseconds. */
      readonly budget: number;
      readonly measure: () => Promise<Measured>;
      readonly assert: (measured: Measured) => void;
    },
  ): void => {
    const keep = async (kind: string, error: unknown): Promise<void> => {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      await target.writeArtifact(`${directory}/${row.artifact}/${kind}-${Date.now()}.txt`, `${message}\n`);
    };
    cloudDefectRow(
      {
        api: (name, body) => {
          test(name, { timeout: row.budget + overrunGrace + 60_000 }, body);
        },
        expectedFailure: row.expectedFailure,
        title,
      },
      async (defect) => {
        let measured: Measured;
        try {
          measured = await withinBudget(row.measure, row.budget);
        } catch (error) {
          await keep('measure-failure', error).catch(() => undefined);
          throw error;
        }
        await defect(async () => {
          try {
            row.assert(measured);
          } catch (error) {
            await keep('failure', error);
            throw error;
          }
        });
      },
    );
  };

/**
 * A measure-phase precondition: throws a plain error, which fails the row as a measure failure, never as the defect.
 *
 * @param condition - What must hold for the row to measure its defect.
 * @param message - What did not hold.
 */
export const precondition = (condition: boolean, message: string): void => {
  if (!condition) {
    throw new Error(`precondition: ${message}`);
  }
};
