import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';

const projectNames = {
  a: 'Project Navigation A',
  b: 'Project Navigation B',
} as const;

async function expectProject(options: { name: string; entryPath: string }): Promise<void> {
  await target.expectVisible(selectors.getByText(options.name, { exact: true }).first(), 60_000);
  await target.expectVisible(
    selectors.getByCss(`[data-testid="file-tree-item"][data-file-tree-path="${options.entryPath}"]`),
    60_000,
  );
  await target.expectVisible(selectors.getByTestId('cad-viewer-canvas-region').getByCss('canvas').first(), 60_000);
  await target.expectVisible(selectors.getByCss('.tiptap[contenteditable="true"]').first(), 60_000);
  await target.expectCount(selectors.getByText(/doesn't exist|may have been deleted|project not found/i), 0);
}

async function openRecentProject(name: string): Promise<void> {
  const link = selectors.getByRole('link', { name }).first();
  await target.expectVisible(link, 60_000);
  await target.click(link);
  await target.expectUrl(/\/w\/[^/]+\/[^/]+$/u, 60_000);
}

async function observeProjectShellContinuity(): Promise<void> {
  await target.expectVisible(selectors.getByCss('[data-slot="sidebar-wrapper"]'));
  await target.evaluate(() => {
    const scope = globalThis as typeof globalThis & {
      __tauProjectShellObserver?: MutationObserver;
    };
    scope.__tauProjectShellObserver?.disconnect();
    delete document.documentElement.dataset['projectShellMissing'];
    scope.__tauProjectShellObserver = new MutationObserver(() => {
      if (!document.querySelector('[data-slot="sidebar-wrapper"]')) {
        document.documentElement.dataset['projectShellMissing'] = 'true';
      }
    });
    scope.__tauProjectShellObserver.observe(document.body, { childList: true, subtree: true });
  });
}

async function stopObservingProjectShell(): Promise<string | undefined> {
  return target.evaluate(() => {
    const scope = globalThis as typeof globalThis & {
      __tauProjectShellObserver?: MutationObserver;
    };
    scope.__tauProjectShellObserver?.disconnect();
    delete scope.__tauProjectShellObserver;
    return document.documentElement.dataset['projectShellMissing'];
  });
}

test('client navigation keeps every project-scoped resource on one logical project ID', async () => {
  await target.addInitScript(() => {
    (globalThis as typeof globalThis & { __tauDocumentIdentity?: string }).__tauDocumentIdentity = crypto.randomUUID();
  });

  await target.navigate('/__e2e/project-navigation');
  await target.delay(5000);
  const initialState = await target.evaluate(() => ({ href: location.href, text: document.body.textContent }));
  if (!/\/w\/[^/]+\/[^/]+$/u.test(new URL(initialState.href).pathname)) {
    const diagnostics = await target.events();
    throw new Error(`Project-navigation seed did not open: ${JSON.stringify({ ...initialState, diagnostics })}`);
  }
  const documentIdentity = await target.evaluate(
    () => (globalThis as typeof globalThis & { __tauDocumentIdentity?: string }).__tauDocumentIdentity,
  );
  await expectProject({ name: projectNames.a, entryPath: 'alpha.ts' });
  await observeProjectShellContinuity();

  try {
    await openRecentProject(projectNames.b);
    await expectProject({ name: projectNames.b, entryPath: 'beta.ts' });
    await openRecentProject(projectNames.a);
    await expectProject({ name: projectNames.a, entryPath: 'alpha.ts' });
    await openRecentProject(projectNames.b);
    await expectProject({ name: projectNames.b, entryPath: 'beta.ts' });
  } finally {
    expect(await stopObservingProjectShell()).toBeUndefined();
  }

  await expect
    .poll(async () =>
      target.evaluate(
        () => (globalThis as typeof globalThis & { __tauDocumentIdentity?: string }).__tauDocumentIdentity,
      ),
    )
    .toBe(documentIdentity);
  const events = await target.events();
  const lifecycleFailures = [...events.pageErrors, ...events.consoleMessages.map(({ text }) => text)].filter(
    (message) => /modelInteraction actor is not available|null.*addEventListener/iu.test(message),
  );
  expect(lifecycleFailures).toEqual([]);
});
