import { base64ToUint8Array, stringToBase64 } from 'uint8array-extras';
import { describe, expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';
import { openFromAll, phoneViewports, surface } from '#support/phone-shell.js';
import type { PhoneViewport } from '#support/phone-shell.js';
import {
  auditPhonePage,
  openTouchPhone,
  readBusyStatuses,
  readPhoneBar,
  readRepositoryFileBase64,
  recordBusyStatuses,
} from '#support/phone-page.js';
import type { PhonePageAudit } from '#support/phone-page.js';
import { waitForStageReady } from '#support/viewer-stage.js';

/*
 * The phone page sweep (canvas PG; charter D11, W9, I2, I3, I6; ledger § 3 item 10): each shell page and page state
 * the canvas draws, on a coarse-pointer touch phone at 320×640 and 390×844, on the production route. Every state
 * meets the page rules (WCAG 2.2 AA axe with no violation of any impact, no serious axe finding, no horizontal
 * overflow, the 48px bar with its title where the route has one) and shows the outcome the canvas states.
 *
 * The e2e build is the self-host variant with no API behind it, so every page here is signed out and every account
 * request fails: the sign-in, invitation and session states below are the ones a visitor whose session cannot be
 * checked meets. `/usage` is not in this build (`apps/ui/app/routes.ts`) and Parts is off with no override.
 */

const seedRoute = '/__e2e/project-navigation?activity=1';
const seededProjects = ['Project Navigation A', 'Project Navigation B'] as const;
const sharePassword = 'local-review-password-32-characters';
const wrongPassword = 'wrong-review-password-32-characters';
const noOverflow = { document: 0, scroller: 0, offenders: [] };

const size = (viewport: PhoneViewport): string => `${String(viewport.width)}x${String(viewport.height)}`;

/** The page rules, as soft assertions so one run names every rule a state breaks. */
const expectPageRules = (audit: PhonePageAudit, state: string): void => {
  expect.soft(audit.wcag, `${state}: WCAG 2.2 AA axe violations`).toEqual([]);
  expect.soft(audit.serious, `${state}: serious or critical axe violations`).toEqual([]);
  expect.soft(audit.overflow, `${state}: horizontal overflow`).toEqual(noOverflow);
};

/**
 * The shell's 48px phone bar: the sidebar trigger, the route's title when it names one, and the back crumb when the
 * route is nested (`undefined` for a top-level route, which must show none).
 */
const expectShellBar = async (title: string | undefined, width: number, crumb?: string): Promise<void> => {
  const bar = await readPhoneBar();
  expect.soft(bar.height, 'a 48px top bar').toBe(48);
  expect.soft(bar.overflow, 'the bar does not scroll sideways').toBe(0);
  expect.soft(bar.trigger, 'a 40px sidebar trigger').toBeGreaterThanOrEqual(40);
  expect.soft(bar.title, 'the bar title').toBe(title);
  expect.soft(bar.crumb?.label, 'the back crumb').toBe(crumb);
  expect.soft(bar.crumb?.right ?? 0, 'the crumb fits the bar').toBeLessThanOrEqual(width);
};

/** Whether the page paints no shell bar: full-screen pages (sign-in, shared links) bring their own. */
const expectNoShellBar = async (): Promise<void> => {
  const bar = await readPhoneBar();
  expect(bar.height).toBeUndefined();
};

/** The page's `h1`s and its document title: one heading that names the page, and a title that is not the bare app's. */
const expectPageNamed = async (heading: string, title: string): Promise<void> => {
  const named = await target.evaluate(() => ({
    headingOnes: [...document.querySelectorAll('h1')].map((element) => element.textContent.trim()),
    title: document.title,
  }));
  expect.soft(named.headingOnes, 'exactly one h1, naming the page').toEqual([heading]);
  expect.soft(named.title, 'a page-specific document title').toBe(title);
};

const box = async (locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> => {
  const found = await target.boundingBox(locator);
  if (!found) {
    throw new Error('The element has no layout box.');
  }
  return found;
};

const seedProjects = async (): Promise<void> => {
  await target.navigate(seedRoute);
  // The seed writes both projects through the file-manager worker before it opens the first.
  await target.expectUrl(/\/w\/[^/]+\/[^/?]+/u, 60_000);
};

describe.each(phoneViewports)('phone pages at $width×$height', (viewport) => {
  test('PG-HOME-1/2: home leads with the composer, then the recent projects grid', async () => {
    await openTouchPhone(viewport);
    await seedProjects();
    await target.navigate('/');
    const composer = selectors.getByRole('textbox', { name: 'Ask Tau to build anything...', exact: true });
    await target.expectVisible(composer, 60_000);
    const projectsHeading = selectors.getByRole('heading', { level: 2, name: 'Projects', exact: true });
    await target.expectVisible(projectsHeading, 60_000);
    const cards = seededProjects.map((name) => selectors.getByRole('link', { name: `Open ${name}`, exact: true }));
    for (const card of cards) {
      // oxlint-disable-next-line no-await-in-loop -- one card at a time.
      await target.expectVisible(card, 60_000);
    }

    const audit = await auditPhonePage(`home-${size(viewport)}`);
    expectPageRules(audit, 'home');
    // Home is untitled and session-neutral: the bar is the sidebar trigger alone, with no action.
    await expectShellBar(undefined, viewport.width);
    const homeHeading = selectors.getByRole('heading', { level: 1, name: 'What can I help you build?' });
    const [headingBox, composerBox, projectsBox] = await Promise.all([
      box(homeHeading),
      box(composer),
      box(projectsHeading),
    ]);
    expect(headingBox.y).toBeLessThan(composerBox.y);
    expect(composerBox.y).toBeLessThan(projectsBox.y);
    // The recent projects follow as a two-column grid at both phone widths.
    const [first, second] = await Promise.all(cards.map(async (card) => box(card)));
    expect(first?.y).toBeCloseTo(second?.y ?? Number.NaN, 0);
    expect(first?.x).not.toBeCloseTo(second?.x ?? Number.NaN, 0);
  });

  test('PG-PROJ-2: the library shows skeleton cards at their final size while it loads', async () => {
    await openTouchPhone(viewport);
    await seedProjects();
    // From the first byte of the document: the loading grid's first card, re-measured while it is shown.
    await target.addInitScript(() => {
      const record: { seen: boolean; width?: number; columns?: number } = { seen: false };
      Object.defineProperty(globalThis, '__tauLoadingGrid', { value: record });
      new MutationObserver(() => {
        const grid = document.querySelector('main [role="status"][aria-label="Loading projects"]');
        const cards = grid ? [...grid.children] : [];
        const firstCard = cards[0];
        if (firstCard) {
          const { top } = firstCard.getBoundingClientRect();
          record.seen = true;
          record.width = firstCard.getBoundingClientRect().width;
          record.columns = cards.filter((card) => Math.abs(card.getBoundingClientRect().top - top) < 1).length;
        }
      }).observe(document, { subtree: true, childList: true, attributes: true });
    });
    await target.navigate('/projects');
    const card = selectors.getByRole('link', { name: `Open ${seededProjects[0]}`, exact: true });
    await target.expectVisible(card, 60_000);
    const loading = await target.evaluate(
      () => (globalThis as { __tauLoadingGrid?: { seen: boolean; width?: number; columns?: number } }).__tauLoadingGrid,
    );
    const loaded = await target.evaluateLocator(card, (link) => {
      const article = link.closest('[data-slot=card]') ?? link;
      return article.getBoundingClientRect().width;
    });
    await target.writeArtifact(
      `mobile-pages/projects-loading-${size(viewport)}.json`,
      `${JSON.stringify({ loading, loaded }, null, 2)}\n`,
    );
    expect(loading?.seen, 'the loading grid was shown before the projects').toBe(true);
    expect(loading?.width, 'skeleton card width matches a loaded card').toBeCloseTo(loaded, 0);
    expect(loading?.columns, 'two skeleton columns, as the loaded grid').toBe(2);
    await expectShellBar('Projects', viewport.width);
  });

  test('PG-PROJ-5: a copied project folder shows as needing attention, and Use this folder opens it', async () => {
    await openTouchPhone(viewport);
    await seedProjects();
    // A copy of a project folder keeps its identity: the library's duplicate-folder conflict, on this device's OPFS.
    await target.evaluate(async () => {
      const copy = async (from: FileSystemDirectoryHandle, to: FileSystemDirectoryHandle): Promise<void> => {
        for await (const [name, handle] of from.entries()) {
          if (handle.kind === 'directory') {
            await copy(handle, await to.getDirectoryHandle(name, { create: true }));
          } else {
            const file = await handle.getFile();
            const created = await to.getFileHandle(name, { create: true });
            const writable = await created.createWritable();
            await writable.write(await file.arrayBuffer());
            await writable.close();
          }
        }
      };
      const root = await navigator.storage.getDirectory();
      const original = await root.getDirectoryHandle('project-navigation-a');
      const originalMarker = await original.getFileHandle('chosen-folder.md', { create: true });
      const originalWriter = await originalMarker.createWritable();
      await originalWriter.write('# Original folder content');
      await originalWriter.close();
      await copy(
        await root.getDirectoryHandle('project-navigation-a'),
        await root.getDirectoryHandle('project-navigation-a-copy', { create: true }),
      );
      const copied = await root.getDirectoryHandle('project-navigation-a-copy');
      const copiedMarker = await copied.getFileHandle('chosen-folder.md');
      const copiedWriter = await copiedMarker.createWritable();
      await copiedWriter.write('# Chosen copy content');
      await copiedWriter.close();
    });
    await target.navigate('/projects');
    const conflicts = selectors.getByRole('group', { name: 'Project conflicts' });
    await target.expectVisible(conflicts, 60_000);
    // The folder the library already opens stays a project; the copy is the one that needs a choice.
    const useThisFolder = conflicts.getByRole('button', { name: 'Use this folder', exact: true });
    await target.expectCount(useThisFolder, 1, 30_000);
    await target.expectVisible(
      conflicts.getByText(
        'This copied project shares an identity with another directory. Choose which folder Tau opens.',
        { exact: true },
      ),
    );
    await target.expectVisible(selectors.getByRole('link', { name: `Open ${seededProjects[0]}`, exact: true }));

    const audit = await auditPhonePage(`projects-attention-${size(viewport)}`);
    expectPageRules(audit, 'projects needing attention');
    await expectShellBar('Projects', viewport.width);
    const action = await box(useThisFolder);
    expect(action.height).toBeGreaterThanOrEqual(24);
    expect(action.x + action.width).toBeLessThanOrEqual(viewport.width);

    // Choosing the copy rebinds the project to it; no other route may still claim that folder.
    await target.click(useThisFolder, { touch: true });
    await target.expectVisible(
      selectors.getByText(`Tau now opens ${seededProjects[0]} from this folder`, { exact: true }),
      30_000,
    );
    await target.expectCount(selectors.getByText(/^Could not open /u), 0);
    await target.expectVisible(selectors.getByRole('link', { name: `Open ${seededProjects[0]}`, exact: true }));
    await target.click(selectors.getByRole('link', { name: `Open ${seededProjects[0]}`, exact: true }), {
      touch: true,
    });
    await target.expectUrl(/\/w\/[^/]+\/project-navigation-a-copy(?:[/?#]|$)/u, 60_000);
    await waitForStageReady();
    await openFromAll('Files');
    await target.click(surface('Files').getByText('chosen-folder.md', { exact: true }), { touch: true });
    await target.expectVisible(selectors.getByRole('heading', { name: 'Chosen copy content', exact: true }), 60_000);
    await target.expectCount(selectors.getByRole('heading', { name: 'Original folder content', exact: true }), 0);
  });

  test('PG-COM-2: a community search with no match names it and Clear filters restores every example', async () => {
    // The unfiltered count, read off the page, is what Clear filters must bring back.
    const status = selectors.getByRole('status').filter({ hasText: /^\d+ examples?$/u });
    await openTouchPhone(viewport, '/community');
    await target.expectVisible(status, 60_000);
    const unfiltered = await target.textContent(status);
    expect(unfiltered).toMatch(/^\d+ examples?$/u);
    await target.navigate('/community?q=zzzqqq&kernel=openscad');
    const empty = selectors.getByText('No examples match “zzzqqq”', { exact: true });
    await target.expectVisible(empty, 60_000);
    const clear = selectors.getByRole('button', { name: 'Clear filters', exact: true });
    await target.expectVisible(clear);

    const audit = await auditPhonePage(`community-no-match-${size(viewport)}`);
    expectPageRules(audit, 'community no match');
    await expectShellBar('Examples', viewport.width);
    const clearBox = await box(clear);
    expect(clearBox.height).toBeGreaterThanOrEqual(24);

    await target.click(clear, { touch: true });
    await target.expectHidden(empty);
    await target.expectText(status, unfiltered ?? '');
    expect(Object.fromEntries(new URL(await target.currentUrl()).searchParams)).toEqual({});
  });

  test('PG-PARTS-2: Parts, turned off in this build, says it is unavailable without pointing to a setting', async () => {
    await openTouchPhone(viewport, '/parts');
    // The state's title is one level under the page's h1 (heading order).
    const off = selectors.getByRole('heading', { level: 2, name: 'Parts is turned off', exact: true });
    await target.expectVisible(off, 60_000);
    await target.expectVisible(
      selectors.getByText('Parts is not available in this version of Tau yet.', { exact: true }),
    );
    // No setting turns the flag on (`showInExperimental` is false), so the page offers none.
    await target.expectCount(selectors.getByRole('button', { name: 'Open settings', exact: true }), 0);
    const audit = await auditPhonePage(`parts-off-${size(viewport)}`);
    expectPageRules(audit, 'parts turned off');
    await expectShellBar('Parts', viewport.width);
  });

  test('PG-AUTH-1: sign-in says when the session cannot be checked, then offers its forms', async () => {
    await openTouchPhone(viewport, '/auth/sign-in');
    // No API answers here, so the session check fails and the page says so, with a way on.
    const alert = selectors.getByRole('alert').filter({ hasText: "We couldn't check your session." });
    const proceed = selectors.getByRole('button', { name: 'Continue to sign in', exact: true });
    await target.expectVisible(proceed, 60_000);
    await target.expectVisible(alert);
    await target.expectVisible(selectors.getByRole('button', { name: 'Retry', exact: true }));
    expectPageRules(await auditPhonePage(`auth-session-${size(viewport)}`), 'session check failed');
    await expectNoShellBar();
    await expectPageNamed('Sign in', 'Sign in · Tau');

    await target.click(proceed, { touch: true });
    const email = selectors.getByRole('textbox', { name: 'Email' });
    await target.expectVisible(email, 30_000);
    await target.expectVisible(selectors.getByLabelText('Password', { exact: true }));
    await target.expectVisible(selectors.getByRole('button', { name: 'Sign in', exact: true }));
    // Named by the text they show (WCAG 2.5.3), so a voice user can say what they read.
    await target.expectVisible(selectors.getByRole('button', { name: 'Continue with GitHub', exact: true }));
    expect.soft(await target.evaluate(() => document.querySelectorAll('main').length), 'one main landmark').toBe(1);
    expectPageRules(await auditPhonePage(`auth-sign-in-${size(viewport)}`), 'sign-in form');
    await expectNoShellBar();
    await expectPageNamed('Sign in', 'Sign in · Tau');
    for (const field of [email, selectors.getByRole('button', { name: 'Sign in', exact: true })]) {
      // oxlint-disable-next-line no-await-in-loop -- one field at a time.
      const fieldBox = await box(field);
      expect(fieldBox.x).toBeGreaterThanOrEqual(0);
      expect(fieldBox.x + fieldBox.width).toBeLessThanOrEqual(viewport.width);
      expect(fieldBox.height).toBeGreaterThanOrEqual(24);
    }

    await target.navigate('/auth/forgot-password');
    await target.expectVisible(selectors.getByRole('textbox', { name: 'Email' }), 60_000);
    expect.soft(await target.evaluate(() => document.querySelectorAll('main').length), 'one main landmark').toBe(1);
    expectPageRules(await auditPhonePage(`auth-forgot-password-${size(viewport)}`), 'forgot-password form');
    await expectPageNamed('Forgot password', 'Forgot password · Tau');
    // The way back says what every other sign-in entry says (I6).
    await target.expectVisible(selectors.getByRole('link', { name: 'Sign in', exact: true }));
  });

  test('PG-INV-1: a signed-out invitation asks to sign in and keeps the link to come back', async () => {
    await openTouchPhone(viewport);
    await target.addInitScript(() => {
      Object.defineProperties(navigator, {
        userAgent: {
          value: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36',
        },
        userAgentData: { value: undefined },
        platform: { value: 'Linux armv8l' },
      });
    });
    await target.navigate('/invitations/e2e-invitation-token');
    const notice = selectors.getByText('Sign in to accept this invitation', { exact: true });
    // The session check retries before it settles as signed out.
    await target.expectVisible(notice, 60_000);
    const signIn = selectors.getByRole('link', { name: 'Sign in', exact: true });
    await target.expectVisible(signIn);
    expect(await target.getAttribute(signIn, 'href')).toBe(
      `/auth/sign-in?redirectTo=${encodeURIComponent('/invitations/e2e-invitation-token')}`,
    );
    // Tau Desktop runs on computers: a touch phone is not offered it, nor its 16px "always open" checkbox.
    const openInDesktop = selectors.getByRole('button', { name: 'Open in Tau Desktop', exact: true });
    await target.expectHidden(openInDesktop);
    await target.expectHidden(selectors.getByRole('checkbox', { name: 'Always open Tau links in the desktop app' }));
    const audit = await auditPhonePage(`invitation-signed-out-${size(viewport)}`);
    expectPageRules(audit, 'invitation signed out');
    expect.soft(audit.undersized, 'no target under 24px, by the strict reading').toEqual([]);
    await expectShellBar('Project invitation', viewport.width);
    const signInBox = await box(signIn);
    expect(signInBox.height).toBeGreaterThanOrEqual(24);
  });

  test('PG-IMP-1: importing local files reviews them with the main-file chooser, then opens the project', async () => {
    await openTouchPhone(viewport, '/import');
    const selectFiles = selectors.getByRole('button', { name: 'Select files', exact: true });
    await target.expectVisible(selectFiles, 60_000);
    expectPageRules(await auditPhonePage(`import-${size(viewport)}`), 'import');
    await expectShellBar('Import', viewport.width);

    await target.chooseFile(selectFiles, {
      base64: stringToBase64(
        "import { drawRoundedRectangle } from 'replicad';\nexport default function main() { return drawRoundedRectangle(30, 20, 3).sketchOnPlane().extrude(6); }\n",
      ),
      mimeType: 'text/javascript',
      name: 'bracket.js',
    });
    const review = selectors.getByRole('heading', { level: 2, name: 'Review import', exact: true });
    await target.expectVisible(review, 60_000);
    const mainFile = selectors.getByRole('group', { name: 'Main file' });
    await target.expectVisible(mainFile);
    const importProject = selectors.getByRole('button', { name: 'Import project', exact: true });
    await target.expectVisible(importProject);
    await target.expectVisible(selectors.getByRole('button', { name: 'Cancel', exact: true }));
    // A single source is the main file already, so the import can go ahead.
    await target.expectVisible(mainFile.getByText('bracket.js', { exact: true }).first());
    expect(await target.evaluateLocator(importProject, (button) => (button as HTMLButtonElement).disabled)).toBe(false);
    expectPageRules(await auditPhonePage(`import-review-${size(viewport)}`), 'import review');
    await expectShellBar('Import', viewport.width);
    const confirm = await box(importProject);
    expect(confirm.x + confirm.width).toBeLessThanOrEqual(viewport.width);

    await target.click(importProject, { touch: true });
    await target.expectUrl(/\/w\/[^/]+\/[^/?]+/u, 60_000);
  });

  test('PG-CONV-1: a GLB opened in Convert downloads as a real STL', async () => {
    await openTouchPhone(viewport, '/convert');
    const openModel = selectors.getByRole('button', { name: /^Open model/u });
    await target.expectVisible(openModel, 60_000);
    // The drop zone is a native button, disabled until the converter worker is up; the audit and the file wait for it.
    await expect
      .poll(async () => target.evaluateLocator(openModel, (zone) => (zone as HTMLButtonElement).disabled), {
        timeout: 60_000,
      })
      .toBe(false);
    expectPageRules(await auditPhonePage(`convert-${size(viewport)}`), 'convert');
    await expectShellBar('Convert', viewport.width);

    await target.chooseFile(openModel, {
      base64: await readRepositoryFileBase64('apps/ui/app/routes/convert/gear-8.glb'),
      mimeType: 'model/gltf-binary',
      name: 'gear-8.glb',
    });
    // Below `md` the export options fold behind an Export toggle over the model.
    const exportToggle = selectors.getByRole('button', { name: 'Export', exact: true });
    await target.expectVisible(exportToggle, 120_000);
    await target.expectVisible(selectors.getByRole('button', { name: 'Start over', exact: true }));
    await target.click(exportToggle, { touch: true });
    await target.expectAttribute(exportToggle, 'aria-expanded', 'true');
    const download = selectors.getByRole('button', { name: 'Download STL', exact: true });
    await target.expectVisible(download, 30_000);
    expectPageRules(await auditPhonePage(`convert-loaded-${size(viewport)}`), 'convert with a model');
    await expectShellBar('Convert', viewport.width);
    const action = await box(download);
    expect(action.x + action.width).toBeLessThanOrEqual(viewport.width);

    const file = await target.download(download);
    expect(file.suggestedFilename).toMatch(/\.stl$/u);
    const bytes = base64ToUint8Array(file.base64);
    // A real STL, binary (80-byte header, triangle count, 50 bytes a triangle) or ASCII (solid … endsolid).
    const triangles =
      bytes.byteLength >= 84 ? new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(80, true) : 0;
    const isBinary = triangles > 0 && bytes.byteLength === 84 + 50 * triangles;
    const text = isBinary ? '' : new TextDecoder().decode(bytes);
    const facets = text.match(/^\s*facet normal /gmu)?.length ?? 0;
    await target.writeArtifact(
      `mobile-pages/convert-download-${size(viewport)}.json`,
      `${JSON.stringify({ name: file.suggestedFilename, bytes: bytes.byteLength, isBinary, triangles, facets }, null, 2)}\n`,
    );
    const isAscii = text.startsWith('solid') && /endsolid[^\n]*$/u.test(text.trimEnd()) && facets > 0;
    expect(isBinary || isAscii, 'a binary or an ASCII STL with facets').toBe(true);
  });

  test('PG-404: an unknown route says so and offers two ways forward', async () => {
    await openTouchPhone(viewport, '/community');
    await target.expectVisible(selectors.getByRole('heading', { level: 1, name: 'Examples' }), 60_000);
    await target.navigate('/no-such-page');
    await target.expectVisible(selectors.getByRole('heading', { level: 1, name: 'Page not found' }), 60_000);
    await expectPageNamed('Page not found', 'Page not found · Tau');
    const goBack = selectors.getByRole('button', { name: 'Go Back', exact: true });
    const goHome = selectors.getByRole('link', { name: 'Go Home', exact: true });
    await target.expectVisible(goBack);
    await target.expectVisible(goHome);
    expectPageRules(await auditPhonePage(`not-found-${size(viewport)}`), 'not found');
    await expectShellBar(undefined, viewport.width);
    for (const way of [goBack, goHome]) {
      // oxlint-disable-next-line no-await-in-loop -- one control at a time.
      const wayBox = await box(way);
      expect(wayBox.height).toBeGreaterThanOrEqual(24);
      expect(wayBox.x + wayBox.width).toBeLessThanOrEqual(viewport.width);
    }

    await target.click(goBack, { touch: true });
    await target.expectUrl(/\/community$/u);
    await target.navigate('/no-such-page');
    await target.click(selectors.getByRole('link', { name: 'Go Home', exact: true }), { touch: true });
    await target.expectUrl(/\/$/u);
  });
});

/** D12: a supported desktop OS keeps the offer even on a touch-first tablet. */
test.each([false, true])('a signed-out invitation on Windows offers Tau Desktop with touch=%s', async (hasTouch) => {
  await target.commands.uiOpenTarget({ hasTouch });
  await target.addInitScript(() => {
    Object.defineProperties(navigator, {
      userAgent: {
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36',
      },
      userAgentData: { value: undefined },
      platform: { value: 'Win32' },
    });
  });
  await target.setViewport({ width: 1280, height: 800 });
  await target.navigate('/invitations/e2e-invitation-token');
  await target.expectVisible(selectors.getByText('Sign in to accept this invitation', { exact: true }), 60_000);
  await target.expectVisible(selectors.getByRole('button', { name: 'Open in Tau Desktop', exact: true }));
  const preference = selectors.getByRole('checkbox', { name: 'Always open Tau links in the desktop app' });
  await target.expectVisible(preference);
  if (hasTouch) {
    const bounds = await box(preference);
    expect(bounds.width).toBeGreaterThanOrEqual(24);
    expect(bounds.height).toBeGreaterThanOrEqual(24);
  }
});

/**
 * PG-SHARE-1/2. The protected link is made the way an author makes one, in the desktop Share pane, sealed under a
 * password that stays out of the link; then a phone opens it.
 */
describe('a password-protected shared link on a phone', () => {
  const makeProtectedLink = async (): Promise<string> => {
    await target.setViewport({ width: 1440, height: 900 });
    await target.navigate('/__e2e/project-file-tree');
    await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 60_000);
    await target.expectVisible(selectors.getByTestId('cad-viewer-canvas-region').getByCss('canvas').first(), 60_000);
    await waitForStageReady();
    await target.click(selectors.getByRole('button', { name: 'Share', exact: true }).first());
    const share = selectors.getByRole('region', { name: 'Share project' });
    await target.expectVisible(share, 15_000);
    await target.click(share.getByRole('checkbox', { name: 'Encrypt with a password' }));
    await target.fill(share.getByLabelText('Password', { exact: true }), sharePassword);
    await target.click(share.getByRole('checkbox', { name: 'Include password in the link' }));
    await target.expectAttribute(
      share.getByRole('checkbox', { name: 'Include password in the link' }),
      'data-state',
      'unchecked',
    );
    await target.click(share.getByRole('button', { name: 'Copy direct link' }));
    const link = share.getByRole('textbox', { name: 'Share link' });
    await target.expectVisible(link, 60_000);
    const { value: url } = await target.read(link);
    if (!url) {
      throw new Error('The Share pane did not show its link.');
    }
    expect(url).toMatch(/\/s\/direct#.*jwe=/u);
    expect(url).not.toMatch(/[#&]p=/u);
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  };

  test.each(phoneViewports)(
    'stays on the form with the error after a wrong password and opens with the right one at $width×$height',
    async (viewport) => {
      const link = await makeProtectedLink();
      await openTouchPhone(viewport);
      await recordBusyStatuses();
      await target.navigate(link);
      const field = selectors.getByLabelText('Password', { exact: true });
      const open = selectors.getByRole('button', { name: 'Open project', exact: true });
      await target.expectVisible(selectors.getByRole('heading', { level: 1, name: 'Password required' }), 60_000);
      // PG-SHARE-2: the link opened busy before it knew it needed a password.
      expect(await readBusyStatuses()).toContain('Opening shared project…');
      expectPageRules(await auditPhonePage(`share-password-${size(viewport)}`), 'shared link password');
      await expectNoShellBar();

      await target.fill(field, wrongPassword);
      // While a password is tried the form takes no second submit: the field is disabled, then given back.
      await target.evaluateLocator(field, (input) => {
        const disabledStates: boolean[] = [];
        Object.defineProperty(globalThis, '__tauPasswordDisabled', { value: disabledStates, configurable: true });
        // One entry per change, from its old value, so a batched disable and enable still records both.
        new MutationObserver((records) => {
          for (const record of records) {
            disabledStates.push(record.oldValue === null);
          }
        }).observe(input, { attributes: true, attributeFilter: ['disabled'], attributeOldValue: true });
      });
      await target.click(open, { touch: true });
      await target.expectVisible(
        selectors.getByText('That password could not open this project.', { exact: true }),
        60_000,
      );
      expect(
        await target.evaluate(() => (globalThis as { __tauPasswordDisabled?: boolean[] }).__tauPasswordDisabled),
      ).toEqual([true, false]);
      expect(await target.getAttribute(field, 'aria-invalid')).toBe('true');
      // PG-SHARE-2: the try was announced busy (the button's spinner is aria-hidden), and is not busy now.
      expect(await readBusyStatuses()).toContain('Open project');
      expect(await target.getAttribute(open, 'aria-busy')).toBe('false');
      expectPageRules(await auditPhonePage(`share-wrong-password-${size(viewport)}`), 'wrong password');

      await target.fill(field, sharePassword);
      await target.click(open, { touch: true });
      // A shared model is someone's code, so the opened link asks before it runs.
      await target.expectVisible(selectors.getByRole('button', { name: 'Run this model' }), 60_000);
      await target.expectHidden(selectors.getByRole('heading', { level: 1, name: 'Password required' }));
    },
  );
});
