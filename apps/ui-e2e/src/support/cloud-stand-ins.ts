/* oxlint-disable typescript/consistent-type-definitions -- The stand-ins' shapes cross the browser and Node command boundary as plain JSON. */
import type { TestContext } from 'vitest';
/**
 * The cloud-build load tier's stand-in API (`ui-e2e:test:e2e:cloud-load`, lane A0.11).
 *
 * The cloud UI variant (`TAU_CLOUD_ENABLED=true`) is served with no API behind it. The three answers a signed-in
 * load of Home or a project route needs are given by request interception instead: the session (`get-session`),
 * the account's Tau Cloud listing (`/v1/projects`) and its paired hosts (`/v1/agents`). The owner is a stand-in
 * and the listing holds one project on the Tau remote. Nothing here is a secret; every other API path stays
 * unanswered, as an absent API would leave it.
 *
 * This module imports nothing at run time, so the Node command (`browser-command.ts`) and the specs in the browser
 * can both import it.
 */

/** The answers the stand-ins give, by name. */
export type CloudStandInEndpoint = 'session' | 'projects' | 'agents';

/** What a load requested: the three stand-in answers, and the file-manager worker's script. */
export type CloudRequestName = CloudStandInEndpoint | 'fileManagerWorker';

/** How many times each was requested since the stand-ins were installed or last counted. */
export type CloudRequestCounts = Readonly<Record<CloudRequestName, number>>;

/**
 * How each answer is held before it is given: milliseconds, or `'held'` until the spec releases it
 * (`uiReleaseCloudStandIn`). An answer not named is given at once.
 */
export type CloudStandInDelays = Readonly<Partial<Record<CloudStandInEndpoint, number | 'held'>>>;

/** The HTTP status an endpoint answers with in place of its body, as a failing API would (K-c). */
export type CloudStandInFailures = Readonly<Partial<Record<CloudStandInEndpoint, number>>>;

/** Whether this run is the cloud-build load tier, so a spec runs its cloud-only cases there and nowhere else. */
export const cloudLoadTierVariable = 'TAU_E2E_CLOUD_LOAD';

/** The analytics decision cookie (`@taucad/consent`); the stand-in visitor has declined, so no banner is served. */
export const consentCookieName = 'tau-cookie-consent';

/** The signed-in stand-in owner. Its address is on a reserved domain, so it can never reach a person. */
export const cloudStandInOwner = {
  id: 'cloud-load-owner',
  email: 'cloud-load-owner@example.invalid',
  name: 'Cloud Load Owner',
} as const;

/** The owner's one project on the Tau remote, as `/v1/projects` lists it. */
export const cloudStandInProject = {
  id: 'cloud-load-project',
  name: 'Cloud load gearbox',
} as const;

/** Each answer's request, by the API path it asks for. The query string is ignored. */
export const cloudStandInPaths: Readonly<Record<CloudStandInEndpoint, RegExp>> = {
  session: /^\/v1\/auth\/get-session$/u,
  projects: /^\/v1\/projects$/u,
  agents: /^\/v1\/agents$/u,
};

/** The file-manager worker's script, as the build names it (`file-manager.worker-<hash>.js`). */
export const fileManagerWorkerPath = /\/file-manager\.worker[-.][^/]*\.js$/u;

/** A fixed instant, so every answer is the same on every run. */
const standInInstant = '2026-11-12T00:00:00.000Z';
const standInExpiry = '2099-01-01T00:00:00.000Z';

/**
 * The body of one stand-in answer, as the API would give it to the signed-in owner.
 *
 * @param endpoint - The answer to give.
 * @returns Its JSON body.
 */
export const cloudStandInBody = (endpoint: CloudStandInEndpoint): unknown => {
  switch (endpoint) {
    case 'session': {
      return {
        session: {
          id: 'cloud-load-session',
          userId: cloudStandInOwner.id,
          token: 'cloud-load-stand-in',
          expiresAt: standInExpiry,
          createdAt: standInInstant,
          updatedAt: standInInstant,
        },
        user: {
          ...cloudStandInOwner,
          emailVerified: true,
          image: null,
          createdAt: standInInstant,
          updatedAt: standInInstant,
        },
      };
    }
    case 'projects': {
      return [
        {
          ...cloudStandInProject,
          role: 'owner',
          updatedAt: standInInstant,
          canDeleteCloud: false,
          cloudState: 'active',
        },
      ];
    }
    case 'agents': {
      return [];
    }
  }
};

/** The commands `browser-command.ts` adds for this tier, as a spec calls them. */
export type CloudStandInCommands = {
  /** Whether this run is the cloud-build load tier ({@link cloudLoadTierVariable}). */
  uiIsCloudLoadTier(): Promise<boolean>;
  /** Answer the session, the listing and the hosts for every page the target opens from now on; start counting. */
  uiInstallCloudStandIns(delays?: CloudStandInDelays): Promise<void>;
  /** Change how long each answer is held, for the requests that arrive from now on. */
  uiSetCloudStandInDelays(delays: CloudStandInDelays): Promise<void>;
  /** Answer each named endpoint with its status instead of its body, for the requests that arrive from now on. */
  uiSetCloudStandInFailures(failures: CloudStandInFailures): Promise<void>;
  /** Give every `'held'` answer for `endpoint` now, and answer its later requests at once. */
  uiReleaseCloudStandIn(endpoint: CloudStandInEndpoint): Promise<void>;
  /** The counts since install or the last reset; with `reset`, start again from zero. */
  uiReadCloudRequestCounts(reset?: boolean): Promise<CloudRequestCounts>;
};

/**
 * The tier's commands, typed, from the browser side's command proxy (`vitest/browser`'s `server.commands`).
 *
 * @param commands - The proxy.
 * @returns The same proxy, typed for this tier's commands.
 */
export const cloudStandInCommands = (commands: unknown): CloudStandInCommands => commands as CloudStandInCommands;

/** Runs a row's defect assertion: the one expectation the defect makes fail. */
export type CloudDefect = (assertion: () => Promise<void> | void) => Promise<void>;

/** The part of Vitest's `test` (or `test.runIf(...)`) a pinned row is declared with. */
export type CloudRowApi = (name: string, body: (context: TestContext) => Promise<void>) => void;

/**
 * Declare a row that pins a known defect (D25). The row is always a plain test, so a fault anywhere in it (a load,
 * a wait, a precondition, the timeout, setup or teardown) fails it. Only the assertion passed to `defect` is treated
 * specially, and only while `expectedFailure` is true:
 *
 * - it fails, as the defect makes it: the row passes and records the failure as a `notice` annotation that starts
 *   `<id> stands`, so a standing defect is visible in the report;
 * - it passes: the row fails with `<id>: defect no longer reproduces: flip expectedFailure`;
 * - it throws anything but an assertion error: the row fails with that error.
 *
 * The fixing lane flips the row by setting `expectedFailure` to false and nothing else: `defect` then runs the
 * assertion as a plain call.
 *
 * @param row - `api` is `test`, or `test.runIf(...)` for a row that runs in one tier only; `expectedFailure` is whether
 * the defect still stands; `title` starts with the defect id and a colon.
 * @param body - The row, given `defect`, which it calls once with the defect's assertion, and the test context.
 */
export const cloudDefectRow = (
  {
    api,
    expectedFailure,
    title,
  }: { readonly api: CloudRowApi; readonly expectedFailure: boolean; readonly title: string },
  body: (defect: CloudDefect, context: TestContext) => Promise<void>,
): void => {
  const id = title.slice(0, title.indexOf(':'));
  api(title, async (context) => {
    const reached = { assertion: false };
    const defect: CloudDefect = async (assertion) => {
      reached.assertion = true;
      if (!expectedFailure) {
        await assertion();
        return;
      }
      try {
        await assertion();
      } catch (error) {
        if (!(error instanceof Error) || error.name !== 'AssertionError') {
          throw error;
        }
        await context.annotate(`${id} stands (expected failure): ${error.message}`, 'notice');
        return;
      }
      throw new Error(`${id}: defect no longer reproduces: flip expectedFailure`);
    };
    await body(defect, context);
    if (!reached.assertion) {
      throw new Error(`${id}: the row never reached its defect assertion`);
    }
  });
};

/** What the tier's recorder looks for, by selector. Passed to the page as JSON. */
export type CloudLoadProbe = {
  /** The application shell's sidebar wrapper; on a phone the sidebar itself is a sheet, the wrapper stays. */
  readonly sidebarWrapper: string;
  /** The rich composer the plain textarea upgrades to. */
  readonly richComposer: string;
  /** The plain textarea the server renders and the composer starts as. */
  readonly plainComposer: string;
  /** The library's project grid on Home. */
  readonly projectGrid: string;
  /** The line Home shows while the Tau Cloud listing is read, by its words. */
  readonly cloudListingText: string;
  /** Words every Tau Cloud listing state Home shows carries: its wait, its slow words and its failure. */
  readonly cloudStateText: string;
  /** The Projects header's status slot, which shows a wait it does not announce. */
  readonly statusSlot: string;
  /** The session request's path, so its answer's arrival is timed on the page's own clock. */
  readonly sessionPath: string;
};

export const cloudLoadProbe: CloudLoadProbe = {
  sidebarWrapper: '[data-slot="sidebar-wrapper"]',
  richComposer: '[aria-label="Ask Tau to build anything..."]',
  plainComposer: 'textarea[aria-label="Chat message"]',
  projectGrid: 'ul[aria-label="Projects"]',
  cloudListingText: 'Loading Tau Cloud projects',
  cloudStateText: 'Tau Cloud projects',
  statusSlot: '[data-slot="project-library-status"]',
  sessionPath: '/v1/auth/get-session',
};

/** Everything one document's load removed or moved that the tier's rows assert on. */
export type CloudLoadRecord = {
  /** Each element removed from `body` itself, described, with its time from navigation start in milliseconds. */
  readonly bodyChildRemovals: ReadonlyArray<{ readonly t: number; readonly node: string }>;
  /** When each `get-session` answer finished arriving, in milliseconds from navigation start. */
  readonly sessionAnsweredAt: readonly number[];
  /** Each time the sidebar wrapper, or a subtree holding it, was removed, in milliseconds from navigation start. */
  readonly wrapperRemovals: readonly number[];
  /** When the rich composer was first in the document, if it was. */
  readonly composerUpgradedAt?: number;
  /** Each time the plain textarea stood in the rich composer's place after it had upgraded. */
  readonly composerReplacements: readonly number[];
  /** The project grid's top offset, in CSS pixels, each time it or the cloud listing line changed. */
  readonly gridTops: ReadonlyArray<{ readonly t: number; readonly top: number; readonly cloudListing: boolean }>;
  /**
   * Each change of what the Tau Cloud listing's state shows on screen (P-k): a live region, alert or the library's
   * header slot carrying `cloudStateText`, its visible words (`innerText`, so words a wait indicator still hides are left out), its role,
   * and whether it sits in the row of the Projects heading.
   */
  readonly cloudStates: ReadonlyArray<{
    readonly t: number;
    readonly role: string;
    readonly text: string;
    readonly inHeader: boolean;
  }>;
};

type CloudLoadGlobal = typeof globalThis & { __TAU_CLOUD_LOAD__: CloudLoadRecord };

/**
 * Installed before any page script, on every document: records each removal of a `body` child and of the sidebar
 * wrapper as the DOM reports it, so a node removed and put back in one task is still seen; whether the plain
 * textarea took the rich composer's place after the upgrade; and on every animation frame the project grid's top
 * offset. Runs in the page, so it is self-contained: everything it needs arrives in `probe`.
 *
 * @param probe - The selectors to look for.
 */
export const recordCloudLoad = (probe: CloudLoadProbe): void => {
  const now = (): number => Math.round(performance.now());
  const describe = (node: Element): string => {
    const slot = node instanceof HTMLElement ? node.dataset['slot'] : undefined;
    const id = node.id ? `#${node.id}` : '';
    const classes = typeof node.className === 'string' ? node.className.split(' ').slice(0, 3).join('.') : '';
    return `${node.tagName.toLowerCase()}${id}${slot ? `[${slot}]` : ''}${classes ? `.${classes}` : ''}`;
  };
  const record = {
    bodyChildRemovals: [] as Array<{ t: number; node: string }>,
    sessionAnsweredAt: [] as number[],
    wrapperRemovals: [] as number[],
    composerUpgradedAt: undefined as number | undefined,
    composerReplacements: [] as number[],
    gridTops: [] as Array<{ t: number; top: number; cloudListing: boolean }>,
    cloudStates: [] as Array<{ t: number; role: string; text: string; inHeader: boolean }>,
  };
  Object.defineProperty(globalThis, '__TAU_CLOUD_LOAD__', { value: record });

  new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as PerformanceResourceTiming[]) {
      if (new URL(entry.name).pathname === probe.sessionPath) {
        record.sessionAnsweredAt.push(Math.round(entry.responseEnd));
      }
    }
  }).observe({ type: 'resource', buffered: true });

  let composerRich = false;
  const checkComposer = (): void => {
    const rich = document.querySelector(probe.richComposer) !== null;
    if (rich && record.composerUpgradedAt === undefined) {
      record.composerUpgradedAt = now();
    }
    if (composerRich && !rich && document.querySelector(probe.plainComposer) !== null) {
      record.composerReplacements.push(now());
    }
    composerRich = rich;
  };

  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const removed of mutation.removedNodes) {
        if (!(removed instanceof Element)) {
          continue;
        }
        if (mutation.target === document.body) {
          record.bodyChildRemovals.push({ t: now(), node: describe(removed) });
        }
        if (removed.matches(probe.sidebarWrapper) || removed.querySelector(probe.sidebarWrapper) !== null) {
          record.wrapperRemovals.push(now());
        }
      }
    }
    checkComposer();
  }).observe(document, { childList: true, subtree: true });

  const sample = (): void => {
    checkComposer();
    const grid = document.querySelector(probe.projectGrid);
    if (grid) {
      const top = Math.round(grid.getBoundingClientRect().top + globalThis.scrollY);
      /* The Projects header's slot holds the wait whether or not it is announced; only a Retry's wait is. */
      const cloudListing = [...document.querySelectorAll(probe.statusSlot)].some((slot) =>
        slot.textContent.includes(probe.cloudListingText),
      );
      const last = record.gridTops.at(-1);
      if (last?.top !== top || last.cloudListing !== cloudListing) {
        record.gridTops.push({ t: now(), top, cloudListing });
      }
    }
    sampleCloudState();
    requestAnimationFrame(sample);
  };
  /* The heading's row: the title cell's parent holds the header's trailing slot (`page-header.tsx`). */
  const headerRow = (): Element | undefined =>
    [...document.querySelectorAll('main h1, main h2, main h3')]
      .find((heading) => heading.textContent.trim() === 'Projects')
      ?.closest('[data-slot="page-header-title"]')?.parentElement ?? undefined;
  let lastCloudState = '';
  const sampleCloudState = (): void => {
    const row = headerRow();
    /* The library's header slot too: a wait that belongs to the page's open is seen there, not announced. */
    const shown = [...document.querySelectorAll(`[role="status"], [role="alert"], ${probe.statusSlot}`)]
      .filter((region) => region.textContent.includes(probe.cloudStateText))
      .map((region) => ({
        role: region.getAttribute('role') ?? '',
        // oxlint-disable-next-line unicorn/prefer-dom-node-text-content -- the visible words only: a wait indicator lays its words out hidden.
        text: region instanceof HTMLElement ? region.innerText.replaceAll(/\s+/gu, ' ').trim() : '',
        inHeader: row?.contains(region) === true,
      }))
      .filter((region) => region.text.includes(probe.cloudStateText));
    const key = JSON.stringify(shown);
    if (key !== lastCloudState) {
      lastCloudState = key;
      if (shown.length === 0) {
        record.cloudStates.push({ t: now(), role: '', text: '', inHeader: false });
      }
      for (const region of shown) {
        record.cloudStates.push({ t: now(), ...region });
      }
    }
  };
  requestAnimationFrame(sample);
};

/**
 * The current document's record, read in the page.
 *
 * @returns The record, as JSON.
 */
export const readCloudLoadRecord = (): CloudLoadRecord => {
  const {
    bodyChildRemovals,
    sessionAnsweredAt,
    wrapperRemovals,
    composerUpgradedAt,
    composerReplacements,
    gridTops,
    cloudStates,
  } = (globalThis as CloudLoadGlobal).__TAU_CLOUD_LOAD__;
  return {
    bodyChildRemovals,
    sessionAnsweredAt,
    wrapperRemovals,
    ...(composerUpgradedAt === undefined ? {} : { composerUpgradedAt }),
    composerReplacements,
    gridTops,
    cloudStates,
  };
};
