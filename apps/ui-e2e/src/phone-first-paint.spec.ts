import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';

/**
 * D13 / T8: a phone paints the phone layout first. A recorder installed before
 * the app's first script watches the document and every resource the page
 * requests, so a desktop workbench that mounts for one frame, or whose chunk is
 * merely requested and then discarded, is caught on each path that opens a
 * project:
 *
 * - SSR and hydration: a hard load of the project URL.
 * - Cold client navigation: the router opens the project from another route.
 *
 * The desktop leg is the positive control: at 1280px the same recorder sees the
 * desktop workbench mount and its chunk load, so the phone legs' empty results
 * mean "never requested", not "named differently".
 */

type LayoutRecord = Readonly<{
  /** `[data-project-workspace]` is the desktop shell's workspace container. */
  desktopShellMounted: boolean;
  skeletonSeen: boolean;
  desktopChunks: readonly string[];
  mobileChunks: readonly string[];
  hydrationErrors: readonly string[];
}>;

const recordLayout = (): void => {
  const record = {
    desktopShellMounted: false,
    skeletonSeen: false,
    desktopChunks: [] as string[],
    mobileChunks: [] as string[],
    hydrationErrors: [] as string[],
  };
  const sample = (): void => {
    if (document.querySelector('[data-project-workspace]') !== null) {
      record.desktopShellMounted = true;
    }
    if (document.querySelector('[data-testid="workspace-skeleton"]') !== null) {
      record.skeletonSeen = true;
    }
  };
  new MutationObserver(sample).observe(document, { subtree: true, childList: true, attributes: true });
  /* Built chunks are named after their entry module; development serves the module path itself. */
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (/chat-interface-desktop[.-]|chat-workbench-dockview[.-]/u.test(entry.name)) {
        record.desktopChunks.push(entry.name);
      } else if (/chat-interface-mobile[.-]/u.test(entry.name)) {
        record.mobileChunks.push(entry.name);
      }
    }
  }).observe({ type: 'resource', buffered: true });
  const consoleError = console.error.bind(console);
  console.error = (...values: unknown[]): void => {
    const message = values.map(String).join(' ');
    if (/hydrat/iu.test(message)) {
      record.hydrationErrors.push(message.slice(0, 300));
    }
    consoleError(...values);
  };
  Object.defineProperty(globalThis, '__TAU_LAYOUT_RECORD__', { value: record });
};

const readLayout = async (): Promise<LayoutRecord> =>
  target.evaluate(
    () => (globalThis as typeof globalThis & { __TAU_LAYOUT_RECORD__: LayoutRecord }).__TAU_LAYOUT_RECORD__,
  );

/** The phone layout is live: its chunk arrived and no gate is still showing the skeleton. */
const waitForPhoneLayout = async (): Promise<void> =>
  target.waitFor(
    () => {
      const { __TAU_LAYOUT_RECORD__: record } = globalThis as typeof globalThis & {
        __TAU_LAYOUT_RECORD__: LayoutRecord;
      };
      return record.mobileChunks.length > 0 && document.querySelector('[data-testid="workspace-skeleton"]') === null;
    },
    undefined,
    { timeout: 120_000 },
  );

/** Long enough for a discarded or late desktop mount to have shown up in the record. */
const settle = async (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 1500);
  });

const desktopWorkspace = selectors.getByCss('[data-project-workspace]');

test('a phone never mounts or requests the desktop workbench on SSR, hydration or client navigation', async () => {
  await target.addInitScript(recordLayout);

  /* Desktop: create a project, then hard-load it — the positive control for the recorder. */
  await target.setViewport({ width: 1280, height: 900 });
  await target.navigate('/projects/new');
  await target.fill(selectors.getByCss('input#project-name'), 'Phone first paint');
  await target.click(selectors.getByRole('button', { name: /Create Project/u }));
  await target.expectUrl(/\/w\/[^/]+\/[^/?]+/u, 60_000);
  await target.expectVisible(desktopWorkspace, 60_000);
  const projectUrl = await target.evaluate(() => `${location.pathname}${location.search}`);

  await target.navigate(projectUrl);
  await target.expectVisible(desktopWorkspace, 60_000);
  const desktop = await readLayout();
  expect(desktop.desktopShellMounted).toBe(true);
  expect(desktop.desktopChunks.length).toBeGreaterThan(0);
  expect(desktop.mobileChunks).toEqual([]);

  /* The server render of a project URL is the skeleton, never a layout chosen without a viewport. */
  const serverHtml = await target.evaluate(async (url) => {
    const response = await fetch(url);
    return response.text();
  }, projectUrl);
  expect(serverHtml).toContain('data-testid="workspace-skeleton"');
  expect(serverHtml).not.toContain('data-project-workspace');

  /* Phone, SSR + hydration. */
  await target.setViewport({ width: 390, height: 844 });
  await target.navigate(projectUrl);
  await waitForPhoneLayout();
  await settle();
  const hydrated = await readLayout();
  expect(hydrated).toMatchObject({
    desktopShellMounted: false,
    desktopChunks: [],
    hydrationErrors: [],
  });
  expect(hydrated.skeletonSeen).toBe(true);
  expect(hydrated.mobileChunks.length).toBeGreaterThan(0);

  /* Phone, cold client navigation: a fresh document on another route, then the router opens the project. */
  await target.navigate('/');
  await target.expectVisible(selectors.getByRole('main'), 60_000);
  await target.evaluate((url) => {
    /* React Router's history reads `idx` from the entry it pops to. */
    const current: unknown = history.state;
    const index = typeof current === 'object' && current !== null && 'idx' in current ? Number(current.idx) : 0;
    const state = { usr: undefined, key: 'phone-first-paint', idx: index + 1 };
    history.pushState(state, '', url);
    globalThis.dispatchEvent(new PopStateEvent('popstate', { state }));
  }, projectUrl);
  await target.expectUrl(/\/w\/[^/]+\/[^/?]+/u, 30_000);
  await waitForPhoneLayout();
  await settle();
  const navigated = await readLayout();
  expect(navigated).toMatchObject({
    desktopShellMounted: false,
    desktopChunks: [],
    hydrationErrors: [],
  });
  expect(navigated.mobileChunks.length).toBeGreaterThan(0);
});
