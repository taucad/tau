import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';
import { prepareComposerPage, readHomeJson } from '#support/chat-attachments.js';
import { waitForStageReady } from '#support/viewer-stage.js';

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

/** Open the seeded project on a touch phone and wait for its stage to draw before the first tap or screenshot. */
const openPhoneProject = async (viewport: { readonly width: number; readonly height: number }): Promise<void> => {
  await target.commands.uiOpenTarget({ hasTouch: true, isMobile: true });
  await prepareComposerPage();
  await target.setViewport(viewport);
  await target.navigate('/__e2e/chat-attachments');
  await target.expectUrl(/\/w\/[^/]+\/[^/?]+\?/u, 60_000);
  await waitForStageReady();
};

test.each([
  { width: 320, height: 640 },
  { width: 390, height: 844 },
])('fits three 40px controls in one 48px project bar at $width×$height', async (viewport) => {
  await openPhoneProject(viewport);
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
  await openPhoneProject(viewport);
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

/*
 * HDR-05 and HDR-06 on the real route: each state is reached through the real stores — a write the store refuses, a
 * chat placed on a branch — never by painting the DOM. The refusal is S19's fault (`routes/[__e2e].project-file-tree`):
 * another holder takes a project file's exclusive handle, as a second tab or a full disk would.
 */

/**
 * The status line's words, as text in the title button under the project's name.
 *
 * @param words - The line, whole.
 */
const statusLine = (words: string): Locator => titleButton().getByText(words, { exact: true });
/** Wait for the status line to read `words`, whole. */
const expectStatus = async (words: string, timeout = 60_000): Promise<void> =>
  target.expectVisible(statusLine(words), timeout);
/** Wait for the status line to stop mentioning `words`. */
const expectStatusWithout = async (words: string): Promise<void> =>
  target.expectCount(titleButton().getByText(words), 0, 60_000);
/** The status glyph, named for what its colour says to a person who does not see it. */
const attentionGlyph = (): Locator => titleButton().getByRole('img', { name: 'Needs attention', exact: true });

const holdProjectFile = async (path: string): Promise<void> =>
  target.evaluate(async (held) => {
    const hold = (globalThis as typeof globalThis & { __tauE2eHoldProjectFile?: (path: string) => Promise<void> })
      .__tauE2eHoldProjectFile;
    if (!hold) {
      throw new Error('The project-file-tree fixture did not install its hold.');
    }
    await hold(held);
  }, path);

const releaseProjectFile = async (path: string): Promise<void> =>
  target.evaluate(async (held) => {
    const release = (globalThis as typeof globalThis & { __tauE2eReleaseProjectFile?: (path: string) => Promise<void> })
      .__tauE2eReleaseProjectFile;
    if (!release) {
      throw new Error('The project-file-tree fixture did not install its release.');
    }
    await release(held);
  }, path);

const openTouchPhone = async (viewport: { width: number; height: number }, route: string): Promise<void> => {
  await target.commands.uiOpenTarget({ hasTouch: true, isMobile: true });
  await prepareComposerPage();
  await target.setViewport(viewport);
  await target.navigate(route);
  await target.expectUrl(/\/w\/[^/]+\/[^/?]+/u, 120_000);
  await target.expectVisible(titleButton(), 60_000);
};

/** The project's directory in Home, which the fixture names after the URL's last segment. */
const projectDirectory = async (): Promise<string> => target.evaluate(() => location.pathname.split('/').pop() ?? '');

const navButton = (name: string): Locator =>
  selectors.getByRole('navigation', { name: 'Workbench' }).getByRole('button', { name, exact: true });

/** Open a destination from the project sheet, as the person does from the title. */
const openFromProjectSheet = async (name: 'Revisions' | 'Export' | 'Details'): Promise<void> => {
  await target.click(titleButton(), { touch: true });
  await target.expectVisible(projectSheet());
  await target.click(projectSheet().getByRole('button', { name, exact: true }), { touch: true });
  await target.expectVisible(selectors.getByRole('region', { name, exact: true }), 60_000);
  await target.expectCount(projectSheet(), 0);
};

const revisionsStrip = (): Locator =>
  selectors
    .getByRole('region', { name: 'Revisions', exact: true })
    .getByRole('region', { name: 'Where you are', exact: true });

/** Change the seed's Width parameter, which lives in versioned `.tau/parameters`, so the files differ from the head. */
const editWidth = async (value: string): Promise<void> => {
  await target.click(navButton('Parameters'), { touch: true });
  const width = selectors.getByRole('region', { name: 'Parameters', exact: true }).getByLabelText('Input for Width');
  await target.expectVisible(width.first(), 60_000);
  await target.fill(width.first(), value);
  await target.press(width.first(), 'Enter');
  await target.expectValue(width.first(), value, 30_000);
};

/** Save a revision from the Revisions strip, reached through the project sheet. */
const saveRevisionFromSheet = async (): Promise<void> => {
  await openFromProjectSheet('Revisions');
  const save = revisionsStrip().getByRole('button', { name: 'Save revision', exact: true });
  await target.expectVisible(save, 60_000);
  await target.click(save, { touch: true });
};

test.each([
  { width: 320, height: 640 },
  { width: 390, height: 844 },
])(
  'says Save not confirmed when the store refuses a settings save, and Retry save in the sheet recovers at $width×$height (HDR-05)',
  async (viewport) => {
    await openTouchPhone(viewport, '/__e2e/project-file-tree');
    await expectStatusWithout('Save not confirmed');
    const directory = await projectDirectory();
    let viewId: string | undefined;
    await expect
      .poll(
        async () => {
          const layout = await readHomeJson<{ viewer?: { tabs?: ReadonlyArray<{ view?: string }> } }>(
            `/${directory}/.tau/workbench/layout.json`,
          );
          viewId = layout?.viewer?.tabs?.[0]?.view;
          return viewId;
        },
        { timeout: 60_000 },
      )
      .toBeTruthy();
    const viewRecord = `.tau/workbench/views/${viewId!}.json`;
    const sectionActive = async (): Promise<boolean | undefined> => {
      const view = await readHomeJson<{ section?: { active?: boolean } }>(`/${directory}/${viewRecord}`);
      return view?.section?.active;
    };
    expect(await sectionActive()).not.toBe(true);

    // The view record's write is refused: turning the section on is a change the store cannot confirm.
    await holdProjectFile(viewRecord);
    await target.click(
      selectors
        .getByRole('group', { name: 'Viewer controls' })
        .getByRole('button', { name: 'Section view', exact: true }),
      { touch: true },
    );
    await expectStatus('Save not confirmed · 1 issue', 60_000);
    await target.expectVisible(attentionGlyph());
    // Still three controls: the record issues have no trigger of their own on a phone (I4).
    await target.expectCount(topBar().getByRole('button'), 3);
    await target.screenshot(undefined, `mobile-status-save-not-confirmed-${String(viewport.width)}.png`);

    // The title opens the project sheet, which carries the recovery.
    await target.click(titleButton(), { touch: true });
    await target.expectVisible(projectSheet());
    const retry = projectSheet().getByRole('button', { name: 'Retry save', exact: true });
    await target.expectVisible(retry, 30_000);
    await target.screenshot(undefined, `mobile-project-sheet-retry-save-${String(viewport.width)}.png`);

    await releaseProjectFile(viewRecord);
    await target.click(retry, { touch: true });
    await expectStatusWithout('Save not confirmed');
    await expectStatusWithout('issue');
    await target.expectCount(projectSheet().getByRole('button', { name: 'Retry save', exact: true }), 0);
    await expect.poll(sectionActive, { timeout: 30_000 }).toBe(true);
  },
);

test.each([
  { width: 320, height: 640 },
  { width: 390, height: 844 },
])(
  'says Save not confirmed when the store refuses a revision, and keeps where you are at $width×$height (HDR-05, S19)',
  async (viewport) => {
    await openTouchPhone(viewport, '/__e2e/project-file-tree?main=touch-parameters');
    await editWidth('31');
    await saveRevisionFromSheet();
    await expectStatus('Saved', 120_000);

    // The branch ref's update is refused by the store itself.
    await holdProjectFile('.git/refs/heads/main');
    await editWidth('32');
    await saveRevisionFromSheet();
    await expectStatus('Save not confirmed', 120_000);
    await target.expectVisible(attentionGlyph());
    // The project sheet names the head it still holds: main at Rev 1, never *Setting up*.
    await target.click(titleButton(), { touch: true });
    await target.expectVisible(projectSheet());
    await target.expectContainingText(
      projectSheet().getByRole('button', { name: 'Revisions', exact: true }),
      'Rev 1 · main',
      30_000,
    );
    await target.screenshot(undefined, `mobile-status-revision-not-confirmed-${String(viewport.width)}.png`);
    await target.keyboardPress('Escape');
    await target.expectCount(projectSheet(), 0);

    // Released, the next save lands and the line rests on Saved again.
    await releaseProjectFile('.git/refs/heads/main');
    await saveRevisionFromSheet();
    await expectStatus('Saved', 120_000);
  },
);

test.each([
  { width: 320, height: 640 },
  { width: 390, height: 844 },
])(
  'names the branch only off main and says Follow chat as a fact, with the verb in the sheet at $width×$height (HDR-06)',
  async (viewport) => {
    const branch = 'fillet-exploration';
    await openTouchPhone(viewport, '/__e2e/project-file-tree?main=touch-parameters&chat=1');
    await editWidth('31');
    await saveRevisionFromSheet();
    await expectStatus('Saved', 120_000);

    await openFromProjectSheet('Revisions');
    await target.click(revisionsStrip().getByRole('button', { name: 'New branch' }), { touch: true });
    await target.fill(selectors.getByRole('textbox', { name: 'Name for the new branch' }), branch);
    await target.click(selectors.getByRole('button', { name: 'Create branch' }), { touch: true });
    const row = selectors
      .getByRole('region', { name: 'Revisions', exact: true })
      .getByRole('list', { name: 'Branches', exact: true })
      .getByRole('listitem')
      .filter({ has: selectors.getByRole('button', { name: `Actions for ${branch}`, exact: true }) });
    await target.expectVisible(row, 60_000);
    // On main the line names no branch.
    await expectStatus('Saved');

    // The chat in focus is placed on the branch: the line says so as a fact, and the bar gains no control.
    await target.click(row.getByRole('button', { name: `Actions for ${branch}`, exact: true }), { touch: true });
    await target.click(selectors.getByRole('menuitem', { name: `Use ${branch} in this chat`, exact: true }), {
      touch: true,
    });
    await expectStatus('Saved · Follow chat', 60_000);
    await target.expectCount(topBar().getByRole('button'), 3);

    // Following is the sheet's verb; the workbench then works on the branch, which the line names.
    await target.click(titleButton(), { touch: true });
    await target.expectVisible(projectSheet());
    await target.click(projectSheet().getByRole('button', { name: 'Follow chat', exact: true }), { touch: true });
    await expectStatus(`Saved · on ${branch}`, 60_000);
    await target.screenshot(undefined, `mobile-status-on-branch-${String(viewport.width)}.png`);
  },
);
