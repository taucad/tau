import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import { dismissCookies } from '#support/chat-attachments.js';

/**
 * What a person sees while a project opens (editor loading splash removal
 * blueprint, W7). A recorder installed before the app's first script samples
 * the document on every mutation, so short-lived states are caught too:
 *
 * - I2: the words "Loading editor…" never stand in for the workspace; the only
 *   loading state a code pane owns is its placeholder.
 * - I1: Monaco is never fetched from the loader's CDN default.
 * - I4: once the workspace container exists it is never an empty frame.
 * - R3: once anything has painted on a project URL, the window never goes back
 *   to nothing — every gate before the live workspace shows the skeleton.
 */

type FirstPaintSample = Readonly<{
  path: string;
  splashOutsidePlaceholder: boolean;
  emptyWorkspace: boolean;
  /** Nothing of the app on screen: no shell, no skeleton, no notice, no editor. */
  blank: boolean;
  skeleton: boolean;
  placeholder: boolean;
  editor: boolean;
}>;

type FirstPaintRecord = Readonly<{
  samples: readonly FirstPaintSample[];
  cdnRequests: readonly string[];
}>;

const recordFirstPaint = (): void => {
  const samples: FirstPaintSample[] = [];
  const cdnRequests: string[] = [];
  let lastKey = '';
  const sample = (): void => {
    /* The recorder is installed before `<body>` exists. */
    if (document.querySelector('body') === null) {
      return;
    }
    const workspace = document.querySelector('[data-project-workspace]');
    const splashOutsidePlaceholder = [...document.querySelectorAll('body *')].some(
      (element) =>
        element.childElementCount === 0 &&
        element.textContent.includes('Loading editor…') &&
        element.closest('[data-slot="editor-pane-placeholder"]') === null,
    );
    const skeleton = document.querySelector('[data-testid="workspace-skeleton"]') !== null;
    const editor = document.querySelector('.monaco-editor .view-lines') !== null;
    const next: FirstPaintSample = {
      path: location.pathname,
      splashOutsidePlaceholder,
      emptyWorkspace: workspace?.childElementCount === 0,
      blank:
        !skeleton &&
        !editor &&
        document.querySelector('[data-slot="application-shell"]') === null &&
        document.querySelector('[data-slot="project-route-notice"]') === null,
      skeleton,
      placeholder: document.querySelector('[data-slot="editor-pane-placeholder"]') !== null,
      editor,
    };
    const key = JSON.stringify(next);
    if (key !== lastKey) {
      lastKey = key;
      samples.push(next);
    }
  };
  new MutationObserver(sample).observe(document, { subtree: true, childList: true, characterData: true });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.name.includes('cdn.jsdelivr.net')) {
        cdnRequests.push(entry.name);
      }
    }
  }).observe({ type: 'resource', buffered: true });
  Object.defineProperty(globalThis, '__TAU_FIRST_PAINT__', { value: { samples, cdnRequests } });
};

const readFirstPaint = async (): Promise<FirstPaintRecord> =>
  target.evaluate(
    () => (globalThis as typeof globalThis & { __TAU_FIRST_PAINT__: FirstPaintRecord }).__TAU_FIRST_PAINT__,
  );

const editorLines = selectors.getByCss('.monaco-editor .view-lines').first();

test('opens a project without a page-wide editor splash, a blank workspace, or CDN Monaco', async () => {
  await target.setViewport({ width: 1440, height: 960 });
  await target.addInitScript(recordFirstPaint);
  await target.navigate('/projects/new');
  await dismissCookies();

  await target.fill(selectors.getByCss('input#project-name'), 'First paint');
  await target.click(selectors.getByRole('button', { name: /Create Project/u }));
  /* A new project's workbench opens on its launcher; bring the source forward so
   * the reload below restores a code pane. */
  const sourceTab = selectors.getByRole('tab', { name: 'main.scad', exact: true }).last();
  await target.expectVisible(sourceTab, 60_000);
  await target.click(sourceTab);
  await target.expectVisible(editorLines, 60_000);
  await expect
    .poll(async () => target.evaluate(() => document.querySelector('[role="tab"][aria-selected="true"]') !== null))
    .toBe(true);
  /* The workbench layout persists on a 500 ms debounce. */
  await new Promise((resolve) => {
    setTimeout(resolve, 1500);
  });
  const projectUrl = await target.evaluate(() => `${location.pathname}${location.search}`);

  /* A hard load of the project is the path the splash used to cover. */
  await target.navigate(projectUrl);
  await target.expectVisible(editorLines, 60_000);

  const { samples, cdnRequests } = await readFirstPaint();
  expect(samples.length).toBeGreaterThan(0);
  expect(samples.filter((sample) => sample.splashOutsidePlaceholder)).toEqual([]);
  expect(samples.filter((sample) => sample.emptyWorkspace)).toEqual([]);
  /* From the first thing that paints on the project URL onwards, every gate above the workspace
   * owns the skeleton rather than leaving an unowned window (R3). The skeleton holds its own lanes
   * back for a blink, so this asserts the frame is mounted throughout, not that lanes are drawn. */
  const projectSamples = samples.filter((sample) => sample.path.startsWith('/w/'));
  const firstPainted = projectSamples.findIndex((sample) => !sample.blank);
  expect(firstPainted).toBeGreaterThanOrEqual(0);
  expect(projectSamples.slice(firstPainted).filter((sample) => sample.blank)).toEqual([]);
  expect(cdnRequests).toEqual([]);
  expect(samples.at(-1)).toMatchObject({ editor: true, placeholder: false, skeleton: false });
  await target.expectHidden(selectors.getByRole('status', { name: 'Opening project' }));
});
