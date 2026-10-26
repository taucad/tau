/* oxlint-disable no-eval -- axe-core crosses the trusted browser-command evaluation boundary as source text (the page-audit precedent). */
/**
 * A shell page on a touch phone, as the phone page sweep measures it: the 48px top bar, WCAG 2.2 AA axe, horizontal
 * overflow and target sizes, plus the evidence reads the page states need (busy states seen in passing, fixture bytes).
 */

import axe from 'axe-core';
import { base64ToUint8Array, uint8ArrayToBase64 } from 'uint8array-extras';
import * as target from '#support/external-target.js';
import { measureHorizontalOverflow, seriousAxeViolations } from '#support/page-audit.js';
import type { AxeFinding, HorizontalOverflow } from '#support/page-audit.js';
import type { PhoneViewport } from '#support/phone-shell.js';

/** WCAG 2.0–2.2 A and AA only: the conformance target, without axe's best-practice rules. */
const wcagTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/**
 * Open a coarse-pointer touch phone at `viewport` (a fresh browser context) and, when given, a path on it.
 *
 * @param viewport - The phone size.
 * @param path - The route to open; omitted, the context opens blank.
 */
export const openTouchPhone = async (viewport: PhoneViewport, path?: string): Promise<void> => {
  await target.commands.uiOpenTarget({ hasTouch: true, isMobile: true });
  await target.setViewport(viewport);
  if (path !== undefined) {
    await target.navigate(path);
  }
};

export type PhoneBar = {
  /** The shell's route header (`main > header`), when the page has one and it paints. */
  readonly height: number | undefined;
  readonly overflow: number | undefined;
  readonly trigger: number | undefined;
  readonly title: string | undefined;
  readonly crumb: { readonly label: string; readonly height: number; readonly right: number } | undefined;
};

/** The phone top bar: its box, its own overflow, the sidebar trigger, its title and its back crumb. */
export const readPhoneBar = async (): Promise<PhoneBar> =>
  target.evaluate(() => {
    const header = document.querySelector<HTMLElement>('main > header');
    if (!header?.checkVisibility()) {
      return { height: undefined, overflow: undefined, trigger: undefined, title: undefined, crumb: undefined };
    }
    const crumb = header.querySelector<HTMLElement>('[data-slot=page-parent-crumb]');
    const crumbBox = crumb?.getBoundingClientRect();
    return {
      height: header.getBoundingClientRect().height,
      overflow: header.scrollWidth - header.clientWidth,
      trigger: header.querySelector('[data-slot=sidebar-trigger]')?.getBoundingClientRect().height,
      title: header.querySelector('[data-slot=page-title]')?.textContent ?? undefined,
      crumb:
        crumb && crumbBox
          ? { label: crumb.textContent.trim(), height: crumbBox.height, right: crumbBox.right }
          : undefined,
    };
  });

/** Every WCAG 2.2 A/AA axe violation in the document, whatever its impact. */
export const wcagAxeViolations = async (): Promise<AxeFinding[]> =>
  target.evaluate(
    async ({ axeSource, tags }) => {
      type AxeResult = { id: string; impact?: string; nodes: Array<{ target: unknown[] }> };
      const scope = globalThis as typeof globalThis & {
        axe?: { run(root: Document, options: unknown): Promise<{ violations: AxeResult[] }> };
      };
      if (!scope.axe) {
        globalThis.eval(axeSource);
      }
      if (!scope.axe) {
        throw new Error('axe-core did not load into the page.');
      }
      const { violations } = await scope.axe.run(document, { runOnly: { type: 'tag', values: tags } });
      return violations.map(({ id, impact, nodes }) => ({
        id,
        impact: impact ?? undefined,
        targets: nodes.slice(0, 5).map((node) => node.target.join(' ')),
      }));
    },
    { axeSource: axe.source, tags: wcagTags },
  );

export type UndersizedTarget = { readonly name: string; readonly width: number; readonly height: number };

/**
 * Visible controls whose own box is under 24 × 24 px. Links inside a run of text are left out: WCAG 2.5.8 exempts
 * inline targets, and their size is the sentence's line height. The axe `target-size` rule in
 * {@link wcagAxeViolations} is the gate (it also applies 2.5.8's spacing exception); this list is the strict reading,
 * kept as evidence.
 */
export const undersizedTargets = async (): Promise<UndersizedTarget[]> =>
  target.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        'a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=checkbox], [role=switch], [role=tab], [role=combobox], [role=menuitem]',
      ),
    ]
      .filter((element) => {
        if (!element.checkVisibility() || element.closest('[aria-hidden="true"], [inert]')) {
          return false;
        }
        const box = element.getBoundingClientRect();
        if (box.width <= 1 || box.height <= 1 || (box.width >= 24 && box.height >= 24)) {
          return false;
        }
        const parent = element.parentElement;
        const inSentence =
          element.tagName === 'A' &&
          parent !== null &&
          [...parent.childNodes].some(
            (node) => node !== element && node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '',
          );
        return !inSentence;
      })
      .map((element) => {
        const box = element.getBoundingClientRect();
        const labelled = element.id ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`) : null;
        return {
          name: (element.getAttribute('aria-label') ?? labelled?.textContent ?? element.textContent)
            .trim()
            .slice(0, 60),
          width: Math.round(box.width),
          height: Math.round(box.height),
        };
      }),
  );

export type PhonePageAudit = {
  readonly wcag: readonly AxeFinding[];
  readonly serious: readonly AxeFinding[];
  readonly overflow: HorizontalOverflow;
  readonly undersized: readonly UndersizedTarget[];
};

/**
 * The page rules every phone page meets, read once and written as evidence: WCAG 2.2 AA axe (all impacts), serious
 * and critical axe including best practice, horizontal overflow, and the strict target-size list.
 *
 * @param name - The evidence name, e.g. `auth-sign-in-320`.
 * @returns The audit.
 */
export const auditPhonePage = async (name: string): Promise<PhonePageAudit> => {
  const audit = {
    wcag: await wcagAxeViolations(),
    serious: await seriousAxeViolations(),
    overflow: await measureHorizontalOverflow(),
    undersized: await undersizedTargets(),
  };
  const bar = await readPhoneBar();
  await target.writeArtifact(`mobile-pages/${name}.json`, `${JSON.stringify({ name, bar, ...audit }, null, 2)}\n`);
  await target.screenshot(undefined, `mobile-pages-${name}.png`);
  return audit;
};

/**
 * Record, from the first byte of every document the context opens, each busy status the page shows
 * (`[aria-busy="true"]`, by its accessible label or text), so a state that lasts a frame is still evidence. Read it
 * with {@link readBusyStatuses}.
 */
export const recordBusyStatuses = async (): Promise<void> =>
  target.addInitScript(() => {
    const seen: string[] = [];
    Object.defineProperty(globalThis, '__tauBusyStatuses', { value: seen });
    const note = (): void => {
      for (const element of document.querySelectorAll<HTMLElement>('[aria-busy="true"]')) {
        const label = (element.getAttribute('aria-label') ?? element.textContent).replaceAll(/\s+/gu, ' ').trim();
        if (label !== '' && !seen.includes(label)) {
          seen.push(label);
        }
      }
    };
    new MutationObserver(note).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['aria-busy'],
    });
  });

/** The busy statuses {@link recordBusyStatuses} has seen in the current document, in order. */
export const readBusyStatuses = async (): Promise<string[]> =>
  target.evaluate(() => [...((globalThis as { __tauBusyStatuses?: string[] }).__tauBusyStatuses ?? [])]);

/**
 * A repository file's bytes as base64, read through the bounded fixture command.
 *
 * @param repositoryPath - The path from the repository root, e.g. `apps/ui/app/routes/convert/gear-8.glb`.
 * @returns The file's bytes, base64-encoded.
 */
export const readRepositoryFileBase64 = async (repositoryPath: string): Promise<string> => {
  // The fixture command resolves relative paths against `out/test-results/vitest-browser/apps/ui-e2e/test-output`.
  const path = `../../../../../../${repositoryPath}`;
  const parts: Array<Uint8Array<ArrayBuffer>> = [];
  let offset = 0;
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- Exact ordered chunks.
    const chunk = await target.commands.uiReadFixtureChunk(path, offset);
    const bytes = base64ToUint8Array(chunk.base64);
    parts.push(bytes);
    offset += bytes.length;
    if (chunk.eof) {
      break;
    }
    if (bytes.length === 0) {
      throw new Error(`Reading ${repositoryPath} made no progress.`);
    }
  }
  const whole = new Uint8Array(offset);
  let at = 0;
  for (const part of parts) {
    whole.set(part, at);
    at += part.length;
  }
  return uint8ArrayToBase64(whole);
};
