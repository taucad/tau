import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';
import { prepareComposerPage } from '#support/chat-attachments.js';

/**
 * W2 on a real phone route (D2, D3, EQ2 = H1; canvas HDR-03, HDR-07, HDR-08): the project's top bar is one 48px row of
 * three controls — sidebar, title with its status line, Share — each a 40px target inside the bar, with no horizontal
 * overflow at 320px and 390px. The title opens the project sheet, where Revisions, Export and Details live once and
 * open their surfaces; the viewer's dock strip no longer carries Share, Export or the revision trigger.
 */

const topBar = (): Locator => selectors.getByCss('[data-slot="mobile-project-top-bar"]');
const titleButton = (): Locator => selectors.getByCss('[data-slot="project-title-button"]');
const projectSheet = (): Locator => selectors.getByCss('[data-slot="project-sheet"]');

type BarGeometry = {
  readonly bar: { readonly top: number; readonly height: number; readonly left: number; readonly right: number };
  readonly overflow: number;
  readonly documentOverflow: number;
  readonly controls: ReadonlyArray<{
    readonly name: string;
    readonly top: number;
    readonly bottom: number;
    readonly left: number;
    readonly right: number;
    readonly width: number;
    readonly height: number;
  }>;
  /** Text lines inside the title button: the name and the status line, each one line high. */
  readonly titleLines: ReadonlyArray<{ readonly height: number; readonly scrollWidth: number; readonly width: number }>;
  readonly statusText: string;
};

const readBar = async (): Promise<BarGeometry> =>
  target.evaluateLocator(topBar(), (bar) => {
    const box = bar.getBoundingClientRect();
    const controls = [...bar.querySelectorAll<HTMLElement>('button')].map((button) => {
      const rect = button.getBoundingClientRect();
      return {
        name: button.getAttribute('aria-label') ?? button.textContent.trim(),
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        width: rect.width,
        height: rect.height,
      };
    });
    const title = bar.querySelector<HTMLElement>('[data-slot="project-title-button"]');
    const titleLines = title
      ? [...title.querySelectorAll<HTMLElement>(':scope > span')].map((line) => {
          const rect = line.getBoundingClientRect();
          return { height: rect.height, scrollWidth: line.scrollWidth, width: line.clientWidth };
        })
      : [];
    return {
      bar: { top: box.top, height: box.height, left: box.left, right: box.right },
      overflow: bar.scrollWidth - bar.clientWidth,
      documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
      controls,
      titleLines,
      statusText: bar.querySelector('[data-slot="status-line"]')?.textContent.trim() ?? '',
    };
  });

test.each([
  { width: 320, height: 640 },
  { width: 390, height: 844 },
])('fits three 40px controls in one 48px project bar at $width×$height', async (viewport) => {
  await target.commands.uiOpenTarget({ hasTouch: true, isMobile: true });
  await prepareComposerPage();
  await target.setViewport(viewport);
  await target.navigate('/__e2e/chat-attachments');
  await target.expectUrl(/\/w\/[^/]+\/[^/?]+\?/u, 60_000);
  await target.expectVisible(topBar(), 60_000);
  // The status line answers once the revision root has; before that it says History is loading, never empty.
  await expect
    .poll(
      async () => {
        const bar = await readBar();
        return bar.statusText;
      },
      { timeout: 60_000 },
    )
    .not.toBe('');

  const geometry = await readBar();
  expect(geometry.bar.top).toBeLessThanOrEqual(0.5);
  expect(geometry.bar.height).toBeGreaterThanOrEqual(47.5);
  expect(geometry.bar.height).toBeLessThanOrEqual(48.5);
  expect(geometry.bar.right).toBeLessThanOrEqual(viewport.width + 0.5);
  expect(geometry.overflow).toBeLessThanOrEqual(0);
  expect(geometry.documentOverflow).toBeLessThanOrEqual(0);

  // At most three controls (D2): sidebar, title, Share, left to right, none overlapping.
  expect(geometry.controls).toHaveLength(3);
  const [sidebar, title, share] = geometry.controls;
  expect(sidebar?.name).toBe('Open sidebar');
  expect(share?.name).toBe('Share');
  for (const control of geometry.controls) {
    expect(control.height).toBeGreaterThanOrEqual(40);
    expect(control.top).toBeGreaterThanOrEqual(geometry.bar.top - 0.5);
    expect(control.bottom).toBeLessThanOrEqual(geometry.bar.top + geometry.bar.height + 0.5);
  }
  expect(sidebar!.width).toBeGreaterThanOrEqual(40);
  expect(share!.width).toBeGreaterThanOrEqual(40);
  expect(sidebar!.right).toBeLessThanOrEqual(title!.left + 0.5);
  expect(title!.right).toBeLessThanOrEqual(share!.left + 0.5);
  // The title takes the rest, and its name and status line each stay one line, truncating on their own.
  expect(geometry.titleLines).toHaveLength(2);
  for (const line of geometry.titleLines) {
    expect(line.height).toBeLessThanOrEqual(20.5);
  }

  // The dock strip no longer repeats the project's controls (I4).
  await target.expectCount(selectors.getByCss('[data-slot="revision-trigger"]'), 0);
  await target.expectCount(selectors.getByRole('button', { name: 'Export', exact: true }), 0);
  await target.expectCount(selectors.getByRole('button', { name: 'Share', exact: true }), 1);
  await target.screenshot(undefined, `mobile-project-top-bar-${String(viewport.width)}.png`);
});

test.each([
  { width: 320, height: 640 },
  { width: 390, height: 844 },
])('opens the project sheet from the title and each destination once at $width×$height', async (viewport) => {
  await target.commands.uiOpenTarget({ hasTouch: true, isMobile: true });
  await prepareComposerPage();
  await target.setViewport(viewport);
  await target.navigate('/__e2e/chat-attachments');
  await target.expectUrl(/\/w\/[^/]+\/[^/?]+\?/u, 60_000);
  await target.expectVisible(titleButton(), 60_000);

  await target.click(titleButton(), { touch: true });
  await target.expectVisible(projectSheet());
  await target.expectAttribute(titleButton(), 'aria-expanded', 'true');
  const rows = await target.evaluateLocator(projectSheet(), (sheet) =>
    [...sheet.querySelectorAll<HTMLElement>('[data-slot="project-sheet-row"]')].map((row) => {
      const rect = row.getBoundingClientRect();
      // The row is named by its label alone; the meta beside it describes it.
      const label = row.querySelector('span[id]');
      return {
        name: (label ?? row).textContent.trim(),
        height: rect.height,
        right: rect.right,
      };
    }),
  );
  const names = rows.map((row) => row.name);
  for (const name of ['Revisions', 'Export', 'Details']) {
    expect(names.filter((candidate) => candidate === name)).toHaveLength(1);
  }
  expect(names).not.toContain('Share');
  for (const row of rows) {
    expect(row.height).toBeGreaterThanOrEqual(40);
    expect(row.right).toBeLessThanOrEqual(viewport.width + 0.5);
  }
  await target.screenshot(undefined, `mobile-project-sheet-${String(viewport.width)}.png`);

  await target.click(projectSheet().getByRole('button', { name: 'Export', exact: true }), { touch: true });
  await target.expectVisible(selectors.getByRole('region', { name: 'Export', exact: true }), 60_000);
  await target.expectCount(projectSheet(), 0);
});
