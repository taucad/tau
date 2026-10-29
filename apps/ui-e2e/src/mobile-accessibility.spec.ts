import { describe, expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';
import { axeAudit } from '#support/page-audit.js';
import type { AxeNodeFinding } from '#support/page-audit.js';

/**
 * T6 on the phone project route (charter I2, I3, I6, I7): an axe WCAG 2.2 AA sweep of every interactive state the
 * Option B shell has — the stage with the sheet closed, the sheet at each detent, All, the project sheet, each pane, the
 * AR recovery alert, the sidebar sheet and the search sheet — and a keyboard-only pass through the same flow, at 320 and
 * 390 under a touch screen with a coarse pointer.
 *
 * The sweep allows no violation of any impact. Axe's incomplete results are checks it could not decide; each one this
 * route produces is adjudicated below with the reason it passes, matched by rule and node, so a new undecided node
 * still fails the sweep.
 */

const seedRoute = '/__e2e/project-file-tree?main=touch-parameters';
const seedProjectName = 'Touch parameters e2e';
const viewports = [
  { width: 320, height: 640 },
  { width: 390, height: 844 },
] as const;

/**
 * Axe's undecided results on this route, adjudicated. Each entry names the rule, the reason axe gives up (its check
 * message) and why the check passes there, and says how the sweep measures that: by re-running the rule under a
 * stylesheet that removes only what blocked axe (accepting a node only when axe then decides it passes), or by keyboard.
 * An adjudication is measured, never assumed, and a node undecided for any other reason still fails the sweep.
 */
type Adjudication = Readonly<{
  rule: string;
  message: RegExp;
  reason: string;
}> &
  (
    | Readonly<{ recheck: string }>
    | Readonly<{ keyboard: true }>
    /** Measured in the page, and only on nodes matching `only` (axe's markup excerpt is truncated, so not by text). */
    | Readonly<{ measure: 'opaque-on-top'; only: string }>
  );

const adjudications: readonly Adjudication[] = [
  {
    rule: 'color-contrast',
    message: /due to a pseudo element/u,
    // Vaul's sheet extends its background below the viewport with `[data-vaul-drawer]::after` (top: 100%, height:
    // 200%), so a rubber-band drag never shows a gap. axe sees a painted pseudo-element on an ancestor and stops; it sits
    // below the sheet's box and is never behind the sheet's text, which stands on the sheet's own fill.
    reason: 'vaul paints its overscroll extension as an ::after below the sheet, never behind its text',
    recheck: '[data-vaul-drawer]::after { content: none !important; }',
  },
  {
    rule: 'color-contrast',
    message: /due to a background gradient/u,
    // A filled button's sheen is a gradient around --primary-action. The re-check paints the button flat with a colour
    // lighter than the sheen's lightest stop plus the hover glint (white 16% + 8%), the worst case for its light label.
    reason: 'the filled button label is measured against a flat fill lighter than its sheen and glint',
    recheck:
      '.primary-action { background-image: none !important; background-color: color-mix(in oklch, white 24%, var(--primary-action)) !important; }',
  },
  {
    rule: 'color-contrast',
    message: /due to a pseudo element/u,
    // An agent row draws its state as a 2px rail, `[data-agent-id]::before` (inset-y-0 left-0 w-0.5), inside the row's
    // 12px padding: it is never behind the row's text, which stands on the row's bg-card.
    reason: 'the agent row state rail is a 2px ::before at the row edge, inside its padding',
    recheck: '[data-agent-id]::before { content: none !important; }',
  },
  {
    rule: 'color-contrast',
    message: /overlapped by another element/u,
    // The debug-only FPS readout (TAU_DEBUG builds) sits in the stage's top right, where axe's overlap sampling meets
    // the viewport gizmo's layer and gives up. The sweep measures it instead: it is the topmost element at its centre
    // (with hit testing on), its own fill is opaque, and its text meets 4.5:1 against that fill.
    reason: 'the debug FPS readout is on top, on its own opaque fill, at 4.5:1 or more',
    measure: 'opaque-on-top',
    only: 'output[aria-label="Render-loop submission FPS"]',
  },
  {
    rule: 'aria-hidden-focus',
    message: /not tabbable in the current state/u,
    // A modal sheet (All, the project sheet, the sidebar and search sheets) hides the page behind it with aria-hidden
    // and traps focus in itself; the controls behind stay in the DOM, so axe cannot tell whether Tab reaches them. The
    // sweep presses Tab past every control in the sheet and requires focus never to land behind it.
    reason: 'the open modal traps focus, so Tab never reaches the aria-hidden page behind it',
    keyboard: true,
  },
];

type Undecided = Readonly<{
  rule: string;
  target: string;
  html: string;
  messages: readonly string[];
  /** Why an adjudication's measurement did not accept the node, or what covers a node axe found overlapped. */
  note?: string;
}>;

/**
 * Tabs forward until focus wraps back to the first stop, so every control in the open modal is passed, and returns the
 * first stop inside an aria-hidden subtree with the stops before it, or why the pass could not finish.
 */
async function focusLandsBehindModal(limit = 300): Promise<string | undefined> {
  const trail: string[] = [];
  try {
    for (let step = 0; step < limit; step++) {
      // oxlint-disable-next-line no-await-in-loop -- one key at a time, as a person presses.
      await target.keyboardPress('Tab');
      // oxlint-disable-next-line no-await-in-loop -- see above.
      const stop = await target.evaluate((isFirst) => {
        const focused = document.activeElement;
        if (!(focused instanceof HTMLElement) || focused === document.body) {
          return { behind: false, wrapped: false, html: 'nothing' };
        }
        const wrapped = focused.dataset['firstTabStop'] !== undefined;
        if (isFirst) {
          focused.dataset['firstTabStop'] = '';
        }
        return {
          behind: focused.closest('[aria-hidden=true]') !== null,
          wrapped,
          html: focused.outerHTML.slice(0, 120),
        };
      }, step === 0);
      if (stop.behind) {
        return `${stop.html} after ${trail.slice(-3).join(' → ')}`;
      }
      if (stop.wrapped) {
        return undefined;
      }
      trail.push(stop.html);
    }
    return `focus did not wrap within ${String(limit)} presses (last: ${trail.slice(-3).join(' → ')})`;
  } finally {
    await target.evaluate(() => {
      for (const element of document.querySelectorAll<HTMLElement>('[data-first-tab-stop]')) {
        delete element.dataset['firstTabStop'];
      }
    });
  }
}

/** Re-runs `rule` under `css` and returns the targets axe still flags, with their messages. */
async function recheckUnder(rule: string, css: string): Promise<Map<string, readonly string[]>> {
  await target.evaluate((sheet) => {
    const style = document.createElement('style');
    style.dataset['axeRecheck'] = '';
    style.textContent = sheet;
    document.head.append(style);
  }, css);
  try {
    const audit = await axeAudit({ rules: [rule] });
    return new Map(
      [...audit.violations, ...audit.incomplete].flatMap((result) =>
        result.nodes.map((node) => [node.target, [`${result.id} ${result.impact ?? ''}`, ...node.messages]] as const),
      ),
    );
  } finally {
    await target.evaluate(() => {
      for (const style of document.querySelectorAll('style[data-axe-recheck]')) {
        style.remove();
      }
    });
  }
}

/**
 * Whether the node is the topmost element at its centre, draws an opaque fill of its own, and its text meets 4.5:1
 * against that fill: the measurement axe could not make.
 */
const isOpaqueOnTop = async (selector: string, only: string): Promise<boolean> =>
  target.evaluate(
    ({ css, allowed }) => {
      const node = document.querySelector<HTMLElement>(css);
      if (!node?.matches(allowed)) {
        return false;
      }
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) {
        return false;
      }
      // The canvas resolves any CSS colour (oklch included) to sRGB bytes, alpha included.
      const rgba = (color: string): number[] => {
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = '#000';
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        return [...context.getImageData(0, 0, 1, 1).data];
      };
      const luminance = ([red = 0, green = 0, blue = 0]: number[]): number => {
        const [r = 0, g = 0, b = 0] = [red, green, blue].map((channel) => {
          const value = channel / 255;
          return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const style = getComputedStyle(node);
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = style.backgroundColor;
      context.fillRect(0, 0, 1, 1);
      const fillAlpha = context.getImageData(0, 0, 1, 1).data.at(3);
      const [lighter = 0, darker = 0] = [luminance(rgba(style.color)), luminance(rgba(style.backgroundColor))].sort(
        (a, b) => b - a,
      );
      const { pointerEvents } = node.style;
      node.style.pointerEvents = 'auto';
      const box = node.getBoundingClientRect();
      const onTop = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2) === node;
      node.style.pointerEvents = pointerEvents;
      // The text's own alpha too: a translucent colour would blend toward the fill and lose contrast.
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = style.color;
      context.fillRect(0, 0, 1, 1);
      const textAlpha = context.getImageData(0, 0, 1, 1).data.at(3);
      return onTop && fillAlpha === 255 && textAlpha === 255 && (lighter + 0.05) / (darker + 0.05) >= 4.5;
    },
    { css: selector, allowed: only },
  );

/**
 * Whether the node is a one-glyph separator hidden from assistive technology (a `·` between facts): decoration, which
 * WCAG 1.4.3 exempts, and which axe, once it can read the background, reports as too short to judge.
 */
const isDecorativeGlyph = async (selector: string): Promise<boolean> =>
  target.evaluate((css) => {
    const node = document.querySelector(css);
    return node?.getAttribute('aria-hidden') === 'true' && /^[^\p{L}\p{N}]$/u.test(node.textContent.trim());
  }, selector);

/** What sits on top of a node axe found overlapped, for the report. */
const coverOf = async (selector: string): Promise<string> =>
  target.evaluate((css) => {
    const node = document.querySelector(css);
    if (!node) {
      return 'node gone';
    }
    const box = node.getBoundingClientRect();
    const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return `covered by ${top?.outerHTML.slice(0, 160) ?? 'nothing'}`;
  }, selector);

/** The incomplete nodes no adjudication covers, or whose measurement does not accept them. */
async function unadjudicated(incomplete: readonly AxeNodeFinding[]): Promise<Undecided[]> {
  const undecided: Undecided[] = [];
  const rechecks = new Map<string, Map<string, readonly string[]>>();
  // The keyboard pass runs once per sweep: `checked` records that it ran, `keyboardEscape` what it found.
  let checked = false;
  let keyboardEscape: string | undefined;
  for (const finding of incomplete) {
    for (const node of finding.nodes) {
      const adjudication = adjudications.find(
        ({ rule, message }) => rule === finding.id && node.messages.some((text) => message.test(text)),
      );
      if (!adjudication) {
        const note = node.messages.some((text) => /overlapped/u.test(text))
          ? // oxlint-disable-next-line no-await-in-loop -- diagnostics for a failing node only.
            await coverOf(node.target)
          : undefined;
        undecided.push({ rule: finding.id, ...node, ...(note === undefined ? {} : { note }) });
        continue;
      }
      if ('measure' in adjudication) {
        // oxlint-disable-next-line no-await-in-loop -- one node at a time.
        if (!(await isOpaqueOnTop(node.target, adjudication.only))) {
          // oxlint-disable-next-line no-await-in-loop -- diagnostics for a failing node only.
          undecided.push({ rule: finding.id, ...node, note: `not measured clean: ${await coverOf(node.target)}` });
        }
        continue;
      }
      if ('keyboard' in adjudication) {
        // Once per sweep: Tab until focus wraps, past every control in the sheet.
        if (!checked) {
          // oxlint-disable-next-line no-await-in-loop -- one keyboard pass, shared by every node.
          keyboardEscape = await focusLandsBehindModal();
          checked = true;
        }
        if (keyboardEscape !== undefined) {
          undecided.push({ rule: finding.id, ...node, note: `Tab reached ${keyboardEscape}` });
        }
        continue;
      }
      // One re-check per rule, under every stylesheet adjudicated for it: a node can be blocked by more than one cause
      // (a filled button inside the sheet sits under vaul's ::after and has a sheen), and each is removed only where named.
      let flagged = rechecks.get(finding.id);
      if (!flagged) {
        const css = adjudications
          .flatMap((candidate) => (candidate.rule === finding.id && 'recheck' in candidate ? [candidate.recheck] : []))
          .join('\n');
        // oxlint-disable-next-line no-await-in-loop -- one re-check per rule, shared by its nodes.
        flagged = await recheckUnder(finding.id, css);
        rechecks.set(finding.id, flagged);
      }
      const still = flagged.get(node.target);
      if (still) {
        const isTooShort = still.some((text) => /too short to determine/u.test(text));
        // oxlint-disable-next-line no-await-in-loop -- one node at a time.
        const decorative = isTooShort && (await isDecorativeGlyph(node.target));
        if (!decorative) {
          undecided.push({ rule: finding.id, ...node, note: `re-check (${adjudication.reason}): ${still.join('; ')}` });
        }
      }
    }
  }
  return undecided;
}

const navigation = (): Locator => selectors.getByRole('navigation', { name: 'Workbench' });
const navButton = (name: string): Locator => navigation().getByRole('button', { name, exact: true });
const allSheet = (): Locator => selectors.getByRole('dialog', { name: 'All surfaces' });
const surface = (title: string): Locator => selectors.getByRole('region', { name: title, exact: true });
const grabber = (): Locator => selectors.getByRole('slider', { name: 'Drawer height' });
const titleButton = (): Locator => selectors.getByCss('[data-slot="project-title-button"]');
const projectSheet = (): Locator => selectors.getByCss('[data-slot="project-sheet"]');
const sidebarSheet = (): Locator => selectors.getByCss('[data-slot="sidebar"][data-mobile="true"]');

/** Opens the touch-parameters seed on a touch phone, from the project list when a reused browser already holds it. */
async function openSeed(viewport: { readonly width: number; readonly height: number }): Promise<void> {
  await target.commands.uiOpenTarget({ hasTouch: true, isMobile: true });
  await target.setViewport(viewport);
  await target.navigate(seedRoute);
  try {
    await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 10_000);
  } catch {
    const project = selectors.getByRole('link', { name: seedProjectName }).first();
    await target.expectVisible(project, 60_000);
    const href = await target.getAttribute(project, 'href');
    if (!href) {
      throw new Error('Seeded project link did not include an href.');
    }
    await target.navigate(href);
    await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 60_000);
  }
  await target.expectVisible(navigation(), 60_000);
  await target.expectVisible(selectors.getByRole('group', { name: 'Viewer controls' }).first(), 60_000);
  expect(await target.evaluate(() => globalThis.matchMedia('(pointer: coarse)').matches)).toBe(true);
}

/**
 * Waits for the sheet to finish moving to its detent, so neither axe nor a focus check reads a box mid-slide (the
 * mobile-shell precedent).
 */
const sheetSettled = async (): Promise<void> =>
  target.evaluate(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    });
    await Promise.all(
      [...document.querySelectorAll('[data-slot=drawer-content], [data-slot=sheet-content]')].flatMap((sheet) =>
        sheet.getAnimations().map(async (animation) => animation.finished.catch(() => undefined)),
      ),
    );
  });

type StateAudit = Readonly<{ violations: readonly AxeNodeFinding[]; incomplete: readonly Undecided[] }>;

/**
 * Waits until the state is ready to audit: the sheets have stopped moving, nothing in the open surface is busy, and the
 * DOM has been still for 750ms (lazy pane bodies and their data mount after the region does). The debug FPS readout's
 * own ticking is not a change of state. Throws, naming what kept changing, if the page never settles.
 */
async function settled(state: string): Promise<void> {
  await sheetSettled();
  const restless = await target.evaluate(async () => {
    const quietFor = 750;
    const deadline = performance.now() + 30_000;
    const ignored = (node: Node): boolean => {
      const element = node instanceof Element ? node : node.parentElement;
      return element?.closest('output[aria-label="Render-loop submission FPS"]') !== null;
    };
    const changed: string[] = [];
    let lastChange = performance.now();
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (!ignored(record.target)) {
          lastChange = performance.now();
          const element = record.target instanceof Element ? record.target : record.target.parentElement;
          changed.push(`${record.type} ${element?.outerHTML.slice(0, 80) ?? ''}`);
        }
      }
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'hidden', 'aria-hidden', 'aria-busy', 'data-state', 'open'],
    });
    try {
      while (performance.now() < deadline) {
        const busy = document.querySelector('[data-slot=mobile-surface] [aria-busy=true]');
        if (!busy && performance.now() - lastChange >= quietFor) {
          return undefined;
        }
        // oxlint-disable-next-line no-await-in-loop -- polls until the page is still.
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 100);
        });
      }
      return changed.slice(-3).join(' | ');
    } finally {
      observer.disconnect();
    }
  });
  if (restless !== undefined) {
    throw new Error(`${state} never settled: ${restless}`);
  }
}

/**
 * Sweeps the page in one state, once it is ready, with one audit: a finding that comes and goes fails as surely as one
 * that stays. Every state's findings are kept, and the test asserts them all at the end so one run reports every state
 * that fails.
 */
async function sweep(state: string, report: Map<string, StateAudit>): Promise<void> {
  await settled(state);
  const audit = await axeAudit();
  report.set(state, { violations: audit.violations, incomplete: await unadjudicated(audit.incomplete) });
}

/** The states whose sweep did not come back clean. */
const failingStates = (report: ReadonlyMap<string, StateAudit>): Record<string, StateAudit> =>
  Object.fromEntries([...report].filter(([, audit]) => audit.violations.length > 0 || audit.incomplete.length > 0));

/**
 * Closes a modal sheet with Escape. A Tab pass can end on a control whose tooltip is open, and Escape dismisses the
 * top layer first (WCAG 1.4.13), so the tooltip goes on the first press, with the sheet still open, and the sheet on
 * the next.
 */
async function escapeClose(sheet: Locator): Promise<void> {
  const tooltip = selectors.getByRole('tooltip');
  if (await target.isVisible(tooltip)) {
    await target.keyboardPress('Escape');
    await target.expectCount(tooltip, 0);
    await target.expectVisible(sheet);
  }
  await target.keyboardPress('Escape');
  await target.expectCount(sheet, 0);
}

/** Opens a pane as a person does: Chat and Parameters from the nav, the rest from All. */
async function openPane(title: string): Promise<void> {
  if (title === 'Chat' || title === 'Parameters') {
    await target.click(navButton(title), { touch: true });
  } else {
    await target.click(navButton('All'), { touch: true });
    await target.click(allSheet().getByRole('button', { name: title, exact: true }), { touch: true });
  }
  await target.expectVisible(surface(title), 60_000);
  await target.expectVisible(surface(title).getByRole('button', { name: `Close ${title}`, exact: true }), 60_000);
  if (title === 'Parameters') {
    // The seed's number and boolean render once the model has evaluated, never an empty pane.
    await target.expectVisible(surface(title).getByCss('[data-slot=parameters] input').first(), 60_000);
  }
}

async function returnToStage(): Promise<void> {
  await target.click(navButton('Model'), { touch: true });
  await target.expectCount(selectors.getByCss('[data-slot="mobile-surface"]'), 0);
}

const panes = [
  'Chat',
  'Parameters',
  'Files',
  'Model tree',
  'Kinematics',
  'Revisions',
  'Share',
  'Export',
  'Details',
  'Agents',
] as const;

describe('phone project route accessibility (T6)', () => {
  test.each(viewports)(
    'meets WCAG 2.2 AA in every interactive state at $width×$height',
    async (viewport) => {
      await openSeed(viewport);
      const report = new Map<string, StateAudit>();

      await sweep('stage, sheet closed', report);

      // The sheet at each detent, with Chat in it: a surface opens at half (D4).
      await openPane('Chat');
      await expect.poll(async () => target.getAttribute(grabber(), 'aria-valuetext')).toBe('Half');
      await sweep('sheet at half', report);
      await target.press(grabber(), 'Home');
      await expect.poll(async () => target.getAttribute(grabber(), 'aria-valuetext')).toBe('Peek');
      await sweep('sheet at peek', report);
      await target.press(grabber(), 'End');
      await expect.poll(async () => target.getAttribute(grabber(), 'aria-valuetext')).toBe('Full');
      await sweep('sheet at full', report);
      await target.press(grabber(), 'ArrowDown');
      await expect.poll(async () => target.getAttribute(grabber(), 'aria-valuetext')).toBe('Half');
      await returnToStage();

      await target.click(navButton('All'), { touch: true });
      await target.expectVisible(allSheet());
      await sweep('All', report);
      await escapeClose(allSheet());

      await target.click(titleButton(), { touch: true });
      await target.expectVisible(projectSheet());
      await sweep('project sheet', report);
      await escapeClose(projectSheet());

      for (const title of panes) {
        // oxlint-disable-next-line no-await-in-loop -- one pane at a time, as a person taps.
        await openPane(title);
        // oxlint-disable-next-line no-await-in-loop -- one pane at a time.
        await sweep(`${title} pane`, report);
        // oxlint-disable-next-line no-await-in-loop -- one pane at a time.
        await returnToStage();
      }

      await target.click(selectors.getByRole('button', { name: 'Open sidebar', exact: true }), { touch: true });
      await target.expectVisible(sidebarSheet());
      await sweep('sidebar sheet', report);
      await target.click(sidebarSheet().getByRole('button', { name: 'Search', exact: true }), { touch: true });
      const searchSheet = selectors.getByRole('dialog', { name: 'Search' });
      await target.expectVisible(searchSheet);
      await sweep('search sheet', report);

      await target.writeArtifact(
        `mobile-accessibility-axe-${String(viewport.width)}.json`,
        // The report keeps 50 nodes a finding; the assertions below see them all.
        JSON.stringify(
          Object.fromEntries(
            [...report].map(([state, audit]) => [
              state,
              {
                violations: audit.violations.map((finding) => ({ ...finding, nodes: finding.nodes.slice(0, 50) })),
                incomplete: audit.incomplete.slice(0, 50),
              },
            ]),
          ),
          undefined,
          2,
        ),
      );
      expect(report.size).toBe(8 + panes.length);
      expect(failingStates(report)).toEqual({});
      // Eighteen states, each audited at least once with re-checks: well past the default 300s on the software renderer.
    },
    900_000,
  );

  /**
   * The AR recovery alert. Chromium has no AR runtime, so Android Chrome's `immersive-ar` is emulated (the viewer-ar
   * precedent) with a session request the person's camera permission refuses, which raises the named alert.
   */
  test.each(viewports)('meets WCAG 2.2 AA with the AR recovery alert open at $width×$height', async (viewport) => {
    await target.commands.uiOpenTarget({ hasTouch: true, isMobile: true });
    await target.addInitScript(() => {
      Object.defineProperty(globalThis, 'XRSession', {
        configurable: true,
        value: class {
          public requestHitTestSource(): undefined {
            return undefined;
          }
        },
      });
      Object.defineProperty(navigator, 'xr', {
        configurable: true,
        value: {
          isSessionSupported: async (mode: string) => mode === 'immersive-ar',
          requestSession: async () => {
            throw new DOMException('Emulated permission refusal', 'NotAllowedError');
          },
        },
      });
    });
    await target.setViewport(viewport);
    await target.navigate('/__e2e/example-fixture?locator=jscad.section-picking-fixture&graphicsBackend=webgl');
    await target.expectVisible(selectors.getByCss('canvas[data-engine]'), 60_000);
    await target.expectGeometryFramed();
    const arButton = selectors.getByRole('button', { name: 'View in your space', exact: true });
    await target.expectVisible(arButton, 30_000);
    await target.click(arButton, { touch: true });
    await target.expectVisible(selectors.getByRole('alertdialog', { name: 'Camera access is off' }));
    const report = new Map<string, StateAudit>();
    await sweep('AR recovery alert', report);
    expect(failingStates(report)).toEqual({});
    await target.click(selectors.getByRole('button', { name: 'Dismiss' }), { touch: true });
    await target.expectFocused(arButton);
  });
});

type FocusReading = Readonly<{
  /** The focused element's accessible-name source: aria-label, its labelling element's text, or its own text. */
  name: string;
  focusVisible: boolean;
  /** Whether the element or the ring-bearing ancestor within two levels draws a visible outline. */
  ring: boolean;
  /** Whether the ring's box lies inside the viewport and is the topmost thing at its centre (not under the sheet). */
  unobscured: boolean;
  /** The tooltip open for the focused control, if any. */
  tooltip: string | undefined;
}>;

/** Reads the focused element: its name, whether its focus ring shows, and whether anything covers it. */
const readFocus = async (): Promise<FocusReading> =>
  target.evaluate(() => {
    const element = document.activeElement;
    if (!(element instanceof HTMLElement) || element === document.body) {
      return { name: '', focusVisible: false, ring: false, unobscured: false, tooltip: undefined };
    }
    const nameOf = (control: HTMLElement): string => {
      const labelledBy = control.getAttribute('aria-labelledby');
      const labels = labelledBy
        ? labelledBy.split(/\s+/u).map((id) => document.querySelector(`#${CSS.escape(id)}`)?.textContent ?? '')
        : [control.textContent];
      return (control.getAttribute('aria-label') ?? labels.join(' ')).trim();
    };
    const name = nameOf(element);
    const draws = (candidate: Element): boolean => {
      const style = getComputedStyle(candidate);
      return (
        (style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0) ||
        (style.boxShadow !== 'none' && style.boxShadow !== '')
      );
    };
    // The grabber is a transparent slider; its row draws the ring (`has-[:focus-visible]:focus-outline`).
    const lineage = [element, element.parentElement ?? undefined, element.parentElement?.parentElement ?? undefined];
    const ringBearer = lineage.find((candidate) => candidate !== undefined && draws(candidate));
    const box = (ringBearer ?? element).getBoundingClientRect();
    const x = Math.min(Math.max(box.left + box.width / 2, 0), innerWidth - 1);
    const y = Math.min(Math.max(box.top + box.height / 2, 0), innerHeight - 1);
    const hit = document.elementFromPoint(x, y);
    const inside = box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth;
    const unobscured =
      inside && hit !== null && (element.contains(hit) || hit.contains(element) || ringBearer?.contains(hit) === true);
    const tooltip = document.querySelector('[data-slot=tooltip-content]');
    return {
      name,
      focusVisible: element.matches(':focus-visible'),
      ring: ringBearer !== undefined,
      unobscured,
      // The rendered words only: a key chip hidden under a coarse pointer (I7) is not part of what the tooltip says.
      // oxlint-disable-next-line unicorn/prefer-dom-node-text-content -- innerText is the rendered text, which this reads.
      tooltip: tooltip instanceof HTMLElement && tooltip.checkVisibility() ? tooltip.innerText.trim() : undefined,
    };
  });

const focusedName = async (): Promise<string> => {
  const focus = await readFocus();
  return focus.name;
};

/** Presses Tab (or Shift+Tab) until the focused element's name is `name`, as a keyboard user would. */
async function tabTo(
  name: string | RegExp,
  options: { readonly backwards?: boolean; readonly limit?: number } = {},
): Promise<FocusReading> {
  const limit = options.limit ?? 60;
  for (let step = 0; step < limit; step++) {
    // oxlint-disable-next-line no-await-in-loop -- one key at a time, as a person presses.
    await target.keyboardPress(options.backwards ? 'Shift+Tab' : 'Tab');
    // oxlint-disable-next-line no-await-in-loop -- see above.
    const focus = await readFocus();
    if (typeof name === 'string' ? focus.name === name : name.test(focus.name)) {
      return focus;
    }
  }
  throw new Error(`Tab never reached “${String(name)}” within ${String(limit)} presses.`);
}

/** Every focus stop must show its ring and stay uncovered (WCAG 2.4.7, 2.4.11). */
function expectFocusShown(focus: FocusReading, what: string): void {
  expect(focus, `${what}: focus ring`).toMatchObject({ focusVisible: true, ring: true });
  expect(focus.unobscured, `${what}: focus is not covered`).toBe(true);
}

/** The focused element sits inside the dialog the locator names. */
const focusInside = async (dialog: Locator): Promise<boolean> =>
  target.evaluateLocator(dialog, (element) => element.contains(document.activeElement));

/** Tabs `presses` times and asserts focus never leaves the modal (focus trap). */
async function expectTrapped(dialog: Locator, presses: number): Promise<void> {
  for (let step = 0; step < presses; step++) {
    // oxlint-disable-next-line no-await-in-loop -- one key at a time.
    await target.keyboardPress(step % 2 === 0 ? 'Tab' : 'Shift+Tab');
    // oxlint-disable-next-line no-await-in-loop -- see above.
    expect(await focusInside(dialog), `focus left the modal after ${String(step + 1)} presses`).toBe(true);
  }
  // Forward only: past the last control focus wraps to the first, never to the page behind.
  for (let step = 0; step < presses; step++) {
    // oxlint-disable-next-line no-await-in-loop -- one key at a time.
    await target.keyboardPress('Tab');
    // oxlint-disable-next-line no-await-in-loop -- see above.
    expect(await focusInside(dialog), `focus left the modal after ${String(step + 1)} forward presses`).toBe(true);
  }
}

/** An icon-only control's tooltip repeats its accessible name (I6). */
async function expectTooltipMatchesName(name: string): Promise<void> {
  await expect
    .poll(
      async () => {
        const focus = await readFocus();
        return focus.tooltip;
      },
      { timeout: 5000 },
    )
    .toBe(name);
}

/** Every visible button in `container` is named by the words it shows (label in name, WCAG 2.5.3; I6). */
async function expectNamesMatchLabels(container: Locator): Promise<void> {
  const labels = await target.evaluateLocator(container, (root) =>
    [...root.querySelectorAll<HTMLElement>('button')]
      .filter((button) => button.checkVisibility())
      .map((button) => {
        const byId = (ids: string | undefined): Element[] =>
          (ids ?? '')
            .split(/\s+/u)
            .filter(Boolean)
            .flatMap((id) => [...document.querySelectorAll(`#${CSS.escape(id)}`)]);
        const labelledBy = byId(button.getAttribute('aria-labelledby') ?? undefined);
        const name = (
          button.getAttribute('aria-label') ??
          (labelledBy.length > 0 ? labelledBy.map((label) => label.textContent).join(' ') : button.textContent)
        ).trim();
        // The words a sighted person reads as the label: visible text, less a description (a row's meta).
        const descriptions = byId(button.getAttribute('aria-describedby') ?? undefined);
        const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
        const words: string[] = [];
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const parent = node.parentElement;
          if (parent?.checkVisibility() && !descriptions.some((description) => description.contains(parent))) {
            words.push(node.textContent ?? '');
          }
        }
        return { name, visible: words.join(' ').replaceAll(/\s+/gu, ' ').trim() };
      })
      .filter(({ visible }) => visible !== ''),
  );
  expect(labels.length).toBeGreaterThan(0);
  for (const { name, visible } of labels) {
    expect(name.toLowerCase(), `“${visible}” is named “${name}”`).toContain(visible.toLowerCase());
  }
}

describe('phone project route keyboard-only completion (T6)', () => {
  test.each(viewports)(
    'reaches and operates the grabber, All, a pane and the project sheet by keyboard at $width×$height',
    async (viewport) => {
      await openSeed(viewport);
      await target.evaluate(() => {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      });

      // The top bar's icon controls: focus shows, and each tooltip says the control's name.
      const sidebar = await tabTo('Open sidebar');
      expectFocusShown(sidebar, 'Open sidebar');
      await expectTooltipMatchesName('Open sidebar');
      // The title is named by the project name it shows, then its status line.
      const title = await tabTo(new RegExp(`^${seedProjectName}`, 'u'), { limit: 3 });
      expectFocusShown(title, 'Project title');
      const share = await tabTo('Share', { limit: 3 });
      expectFocusShown(share, 'Share');
      await expectTooltipMatchesName('Share');

      // The nav: reach Parameters, open it, and focus moves into the surface (D4).
      const parameters = await tabTo('Parameters');
      expectFocusShown(parameters, 'Parameters destination');
      await expectNamesMatchLabels(navigation());
      await target.keyboardPress('Enter');
      await target.expectVisible(surface('Parameters'), 60_000);
      await expect.poll(async () => focusInside(surface('Parameters'))).toBe(true);
      await sheetSettled();

      // The grabber, one Shift+Tab above the surface, is an APG slider: every detent by key, never by drag alone.
      const handle = await tabTo('Drawer height', { backwards: true, limit: 3 });
      expectFocusShown(handle, 'Drawer height');
      expect(await target.getAttribute(grabber(), 'aria-valuetext')).toBe('Half');
      for (const [key, detent] of [
        ['ArrowUp', 'Full'],
        ['ArrowDown', 'Half'],
        ['Home', 'Peek'],
        ['End', 'Full'],
        ['Enter', 'Peek'],
        [' ', 'Half'],
      ] as const) {
        // oxlint-disable-next-line no-await-in-loop -- one key at a time.
        await target.keyboardPress(key);
        // oxlint-disable-next-line no-await-in-loop -- see above.
        await expect.poll(async () => target.getAttribute(grabber(), 'aria-valuetext')).toBe(detent);
        // oxlint-disable-next-line no-await-in-loop -- see above.
        await sheetSettled();
        // oxlint-disable-next-line no-await-in-loop -- see above.
        expectFocusShown(await readFocus(), `Drawer height at ${detent}`);
      }

      // The pane's Close: its tooltip and name agree (I6); every stop between is visible and uncovered.
      const closeParameters = await tabTo('Close Parameters', { limit: 10 });
      expectFocusShown(closeParameters, 'Close Parameters');
      await expectTooltipMatchesName('Close Parameters');
      await target.keyboardPress('Enter');
      await target.expectCount(selectors.getByCss('[data-slot="mobile-surface"]'), 0);
      // Closing returns focus to the nav's current destination, the Model (the stage the person is back on).
      await expect.poll(focusedName).toBe('Model');
      expectFocusShown(await readFocus(), 'Model after Close');

      // All: open by keyboard, focus is trapped inside, Escape returns it to All.
      const all = await tabTo('All', { limit: 3 });
      expectFocusShown(all, 'All destination');
      await target.keyboardPress('Enter');
      await target.expectVisible(allSheet());
      await expect.poll(async () => focusInside(allSheet())).toBe(true);
      await expectNamesMatchLabels(allSheet());
      await expectTrapped(allSheet(), 24);
      await target.keyboardPress('Escape');
      await target.expectCount(allSheet(), 0);
      await expect.poll(focusedName).toBe('All');

      // All → a pane by keyboard: focus moves into the opened surface.
      await target.keyboardPress('Enter');
      await target.expectVisible(allSheet());
      await sheetSettled();
      const files = await tabTo('Files', { limit: 30 });
      expectFocusShown(files, 'Files in All');
      await target.keyboardPress('Enter');
      await target.expectVisible(surface('Files'), 60_000);
      await expect.poll(async () => focusInside(surface('Files'))).toBe(true);
      // Escape on the surface closes the sheet and focus lands on the nav's current destination.
      await target.keyboardPress('Escape');
      await target.expectCount(selectors.getByCss('[data-slot="mobile-surface"]'), 0);
      await expect.poll(focusedName).toBe('Model');

      // The project sheet: open from the title, trapped, Escape and its Close both return focus to the title.
      await target.focus(titleButton());
      await target.keyboardPress('Enter');
      await target.expectVisible(projectSheet());
      await expect.poll(async () => focusInside(projectSheet())).toBe(true);
      await expectNamesMatchLabels(projectSheet());
      await expectTrapped(projectSheet(), 12);
      await target.keyboardPress('Escape');
      await target.expectCount(projectSheet(), 0);
      await expect.poll(focusedName).toMatch(new RegExp(`^${seedProjectName}`, 'u'));
      expect(await target.getAttribute(titleButton(), 'aria-expanded')).toBe('false');

      await target.keyboardPress('Enter');
      await target.expectVisible(projectSheet());
      const closeSheet = await tabTo('Close project sheet', { limit: 12 });
      expectFocusShown(closeSheet, 'Close project sheet');
      await expectTooltipMatchesName('Close project sheet');
      await target.keyboardPress('Enter');
      await target.expectCount(projectSheet(), 0);
      await expect.poll(focusedName).toMatch(new RegExp(`^${seedProjectName}`, 'u'));
      expectFocusShown(await readFocus(), 'Project title after Close');

      // The sidebar sheet: open from its trigger, focus moves in, Tab wraps inside it, Escape returns to the trigger.
      const openSidebar = await tabTo('Open sidebar', { backwards: true, limit: 3 });
      expectFocusShown(openSidebar, 'Open sidebar before the sheet');
      await target.keyboardPress('Enter');
      await target.expectVisible(sidebarSheet());
      await expect.poll(async () => focusInside(sidebarSheet())).toBe(true);
      expect(await focusLandsBehindModal()).toBeUndefined();
      await escapeClose(sidebarSheet());
      await expect.poll(focusedName).toBe('Open sidebar');
      expectFocusShown(await readFocus(), 'Open sidebar after Escape');
    },
  );
});
