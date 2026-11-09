/* oxlint-disable typescript/consistent-type-definitions -- The recorder's record crosses the page boundary as plain JSON shapes. */
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
