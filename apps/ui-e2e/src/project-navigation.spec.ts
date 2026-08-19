import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const projectNames = {
  a: 'Project Navigation A',
  b: 'Project Navigation B',
} as const;

async function expectProject(page: Page, options: { name: string; entryPath: string }): Promise<void> {
  await expect(page.getByText(options.name, { exact: true }).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(`[data-testid="file-tree-item"][data-file-tree-path="${options.entryPath}"]`)).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByTestId('cad-viewer-canvas-region').locator('canvas').first()).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.locator('.tiptap[contenteditable="true"]').first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/doesn't exist|may have been deleted|project not found/i)).toHaveCount(0);
}

async function openRecentProject(page: Page, name: string): Promise<void> {
  const link = page.getByRole('link', { name }).first();
  await expect(link).toBeVisible({ timeout: 60_000 });
  await link.click();
  await expect(page).toHaveURL(/\/w\/[^/]+\/[^/]+$/u, { timeout: 60_000 });
}

async function observeProjectShellContinuity(page: Page): Promise<void> {
  await expect(page.locator('[data-slot="sidebar-wrapper"]')).toBeVisible();
  await page.evaluate(() => {
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

async function stopObservingProjectShell(page: Page): Promise<string | undefined> {
  return page.evaluate(() => {
    const scope = globalThis as typeof globalThis & {
      __tauProjectShellObserver?: MutationObserver;
    };
    scope.__tauProjectShellObserver?.disconnect();
    delete scope.__tauProjectShellObserver;
    return document.documentElement.dataset['projectShellMissing'];
  });
}

test('client navigation keeps every project-scoped resource on one logical project ID', async ({ page }) => {
  test.setTimeout(240_000);
  const lifecycleFailures: string[] = [];
  page.on('pageerror', (error) => {
    if (/modelInteraction actor is not available|null.*addEventListener/iu.test(error.message)) {
      lifecycleFailures.push(error.message);
    }
  });
  page.on('console', (message) => {
    const text = message.text();
    if (/modelInteraction actor is not available|null.*addEventListener/iu.test(text)) {
      lifecycleFailures.push(text);
    }
  });
  await page.addInitScript(() => {
    (globalThis as typeof globalThis & { __tauDocumentIdentity?: string }).__tauDocumentIdentity = crypto.randomUUID();
  });

  await page.goto('/__e2e/project-navigation');
  await expect(page).toHaveURL(/\/w\/[^/]+\/[^/]+$/u, { timeout: 60_000 });
  const documentIdentity = await page.evaluate(
    () => (globalThis as typeof globalThis & { __tauDocumentIdentity?: string }).__tauDocumentIdentity,
  );
  await expectProject(page, { name: projectNames.a, entryPath: 'alpha.ts' });
  await observeProjectShellContinuity(page);

  try {
    await openRecentProject(page, projectNames.b);
    await expectProject(page, { name: projectNames.b, entryPath: 'beta.ts' });
    await openRecentProject(page, projectNames.a);
    await expectProject(page, { name: projectNames.a, entryPath: 'alpha.ts' });
    await openRecentProject(page, projectNames.b);
    await expectProject(page, { name: projectNames.b, entryPath: 'beta.ts' });
  } finally {
    expect(await stopObservingProjectShell(page)).toBeUndefined();
  }

  await expect
    .poll(async () =>
      page.evaluate(() => (globalThis as typeof globalThis & { __tauDocumentIdentity?: string }).__tauDocumentIdentity),
    )
    .toBe(documentIdentity);
  expect(lifecycleFailures).toEqual([]);
});
