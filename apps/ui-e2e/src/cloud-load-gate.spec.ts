import { describe, expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import type { CloudLoadRecord, CloudRequestCounts, CloudStandInDelays } from '#support/cloud-stand-ins.js';
import { setTargetOffline, waitForOfflineShell } from '#support/billing-usage-fixture.js';
import {
  cloudDefectRow,
  cloudLoadProbe,
  cloudStandInCommands,
  cloudStandInPaths,
  cloudStandInOwner,
  cloudStandInProject,
  readCloudLoadRecord,
  recordCloudLoad,
} from '#support/cloud-stand-ins.js';

/** F14: what an offline reload of a project draws. */
type OfflineRead = {
  readonly url: string;
  readonly frame: boolean;
  readonly workspace: boolean;
  readonly alerts: readonly string[];
};

/**
 * The cloud-build load tier (lane A0.11, `ui-e2e:test:e2e:cloud-load`): the loading defects a self-host build cannot
 * show, because it has no billing fence and asks for `/v1/projects` only for a project on the Tau remote. The tier
 * serves the cloud UI variant with no API: stand-ins answer `get-session`, `/v1/projects` and `/v1/agents` for a
 * signed-in owner whose listing holds one project on the Tau remote (`#support/cloud-stand-ins.js`).
 *
 * Each row pins a known defect and is an expected failure, so `main` stays green; the lane that fixes the defect
 * flips its row. Each is forced by holding a stand-in answer, never sampled, and fails on the defect's own
 * assertion: a request count, a removed node or an offset. Each row is a plain test (`cloudDefectRow`): only that
 * assertion's failure is recorded as the standing defect, and any other fault fails the row.
 */

const cloud = cloudStandInCommands(target.commands);
/** Only the cloud-build tier sets this; in the self-host tiers every row here is out of scope. */
const cloudLoadTier = await cloud.uiIsCloudLoadTier();

const wide = { width: 1440, height: 900 } as const;
/** How long a held answer is held, as the audit's discriminators held them. Milliseconds. */
const held = 2000;
/** How long a settled load is watched for a late request or change. Milliseconds. */
const settleWindow = 3000;
/** The timing ladder (UI Policy § 6): an indicator shows from 1,000 ms and says the wait is long at 10,000 ms. */
const indicatorDelay = 1000;
const slowWait = 10_000;
/** K-b's late listing, past the indicator delay; K-d's, past the slow mark. Milliseconds. */
const cloudWait = 3000;
const longCloudWait = 12_000;
/** How long K-c counts requests after its Retry. Milliseconds. */
const retryWatch = 9000;
/** A row's own setup failed: not the defect, so it fails the row whatever `expectedFailure` says. */
const precondition = (condition: boolean, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};
const workspace = selectors.getByCss('[data-project-workspace]');
/** How long K-f holds the usage document, as the audit's 17 to 19 s stalls held it. Milliseconds. */
const documentStall = 20_000;
/** K-f's bound: the 3,000 ms shell fallback plus the paint. Milliseconds. */
const shellPaintBound = 3500;

/** The browser command K-f forces its stall with (`uiOpenWithStalledDocument` in `#support/browser-command.ts`). */
type StalledDocumentCommands = {
  uiOpenWithStalledDocument(
    path: string,
    stall: number,
  ): Promise<{
    readonly stalledRequests: number;
    readonly firstContentfulPaint: number;
    readonly responseStart: number;
  }>;
};
const stalledDocument = (commands: unknown): StalledDocumentCommands => commands as StalledDocumentCommands;

/** Open the target as the signed-in stand-in owner, with the recorder on every document. */
const openSignedIn = async (delays?: CloudStandInDelays): Promise<void> => {
  await target.setViewport(wide);
  await cloud.uiInstallCloudStandIns(delays);
  await target.addInitScript(recordCloudLoad, cloudLoadProbe);
};

/** The session has resolved to the owner: the shell names them. */
const waitForSignedIn = async (): Promise<void> => {
  await target.waitFor((name) => document.body.textContent.includes(name), cloudStandInOwner.name, {
    timeout: 60_000,
  });
};

/** Home has nothing left to arrive: the owner, the rich composer and the listing's project; then the watch window. */
const waitForSettledHome = async (): Promise<void> => {
  await waitForSignedIn();
  await target.expectVisible(selectors.getByCss(cloudLoadProbe.richComposer), 60_000);
  await target.waitFor(
    (name) => document.querySelector('main')?.textContent.includes(name) === true,
    cloudStandInProject.name,
    {
      timeout: 60_000,
    },
  );
  await target.delay(settleWindow);
};

/** A project route has nothing left to arrive: the owner and the workspace; then the watch window. */
const waitForSettledProject = async (): Promise<void> => {
  await target.expectVisible(workspace, 60_000);
  await waitForSignedIn();
  await target.delay(settleWindow);
};

/**
 * A project on this device, created through `/projects/new` as a person would, once the session has resolved.
 *
 * @returns Its route.
 */
const seedLocalProject = async (): Promise<string> => {
  await target.navigate('/projects/new');
  await waitForSignedIn();
  await target.fill(selectors.getByCss('input#project-name'), 'Local gearbox');
  await target.click(selectors.getByRole('button', { name: /Create Project/u }));
  await target.expectUrl(/\/w\/[^/]+\/[^/?]+/u, 60_000);
  await target.expectVisible(workspace, 60_000);
  await waitForSignedIn();
  return target.evaluate(() => `${location.pathname}${location.search}`);
};

/** Read the load's record and keep it, with the request counts, as evidence. */
const keep = async (name: string, counts?: CloudRequestCounts): Promise<CloudLoadRecord> => {
  const record = await target.evaluate(readCloudLoadRecord);
  await target.writeArtifact(`cloud-load-gate/${name}.json`, `${JSON.stringify({ counts, record }, null, 2)}\n`);
  return record;
};

describe.runIf(cloudLoadTier)('cloud-build tier: load gate', () => {
  /* Each row is `cloudDefectRow({ expectedFailure: true, ... })`: the fixing lane flips it by setting `false`. */
  cloudDefectRow(
    {
      api: test,
      expectedFailure: false,
      title: 'N2: requests get-session, /v1/projects, /v1/agents and the file-manager worker once per load of Home',
    },
    async (defect) => {
      await openSignedIn();
      await target.navigate('/');
      await waitForSettledHome();
      const counts = await cloud.uiReadCloudRequestCounts();
      await keep('n2-home', counts);
      await defect(() => {
        expect(counts, `N2: requests per load of Home ${JSON.stringify(counts)}`).toEqual({
          session: 1,
          projects: 1,
          agents: 1,
          fileManagerWorker: 1,
        });
      });
    },
  );

  cloudDefectRow(
    {
      api: test,
      // Expected-failure: @rifont until 2026-12-15
      expectedFailure: true,
      title: 'N2: requests get-session and /v1/agents once per load of a project route',
    },
    async (defect, { annotate }) => {
      await openSignedIn();
      const route = await seedLocalProject();
      await target.delay(settleWindow);
      await cloud.uiReadCloudRequestCounts(true);
      await target.navigate(route);
      await waitForSettledProject();
      const counts = await cloud.uiReadCloudRequestCounts();
      await keep('n2-project', counts);
      /* Report-only: on a project route the worker is requested twice in some loads and once in others, so its
         count is sampled, not forced. It is recorded, never asserted. */
      await annotate(
        `N2 report-only: the file-manager worker was requested ${String(counts.fileManagerWorker)} times on this load of a project route`,
        'notice',
      );
      /* The route is a project on this device, not the Tau-remote one: the stand-ins do not serve the Tau remote's
         connect path (the API's git proxy) or the billing entitlements it needs, so no project here is on the Tau
         remote, and such a project never asks for the listing (`useProjectAccessRole` in `use-cloud-projects.ts`).
         `projects: 0` is that harness consequence, not a claim about the route. The Tau-remote project route's
         `/v1/projects` count is a recorded gap of this tier, accepted by programme control. */
      const { fileManagerWorker: _sampled, ...asserted } = counts;
      await defect(() => {
        expect(asserted, `N2: requests per load of a project route ${JSON.stringify(counts)}`).toEqual({
          session: 1,
          projects: 0,
          agents: 1,
        });
      });
    },
  );

  cloudDefectRow(
    {
      api: test,
      expectedFailure: false,
      title: `U1: keeps the sidebar wrapper on a project route while get-session is held ${String(held)} ms, the chunk undelayed`,
    },
    async (defect) => {
      await openSignedIn();
      const route = await seedLocalProject();
      await cloud.uiSetCloudStandInDelays({ session: held });
      await target.navigate(route);
      await waitForSettledProject();
      const record = await keep('u1-session-held');
      expect(
        await target.evaluate((wrapper) => document.querySelector(wrapper) !== null, cloudLoadProbe.sidebarWrapper),
        'the settled project route has no sidebar wrapper to keep',
      ).toBe(true);
      await defect(() => {
        expect(
          record.wrapperRemovals,
          `U1: the sidebar wrapper was removed at these times (ms); get-session was answered at ${JSON.stringify(record.sessionAnsweredAt)} ms`,
        ).toEqual([]);
      });
    },
  );

  cloudDefectRow(
    {
      api: test,
      expectedFailure: false,
      title: `H6: holds the project grid's top offset on Home while /v1/projects is held ${String(held)} ms`,
    },
    async (defect) => {
      await openSignedIn();
      await seedLocalProject();
      await target.navigate('/');
      await waitForSettledHome();
      await cloud.uiSetCloudStandInDelays({ projects: held });
      await target.navigate('/');
      await waitForSettledHome();
      const record = await keep('h6-listing-held');
      expect(record.gridTops.length, 'the project grid was never on screen').toBeGreaterThan(0);
      precondition(
        record.gridTops.some((sample) => sample.cloudListing),
        'H6: the Tau Cloud listing was never awaited while the grid was on screen',
      );
      const tops = [...new Set(record.gridTops.map((sample) => sample.top))];
      await defect(() => {
        expect(tops, `H6: the project grid's top offset moved (${JSON.stringify(record.gridTops)})`).toEqual([
          record.gridTops.at(-1)?.top,
        ]);
      });
    },
  );

  /* K-b to K-d (P-k): the Tau Cloud listing's wait, slow notice and failure are said in the Projects header's slot. */
  cloudDefectRow(
    {
      api: test,
      expectedFailure: false,
      title: `K-b: says Home waits for Tau Cloud in the Projects header's slot from ${String(indicatorDelay)} ms, the grid still, while /v1/projects is ${String(cloudWait)} ms late`,
    },
    async (defect) => {
      await openSignedIn();
      await seedLocalProject();
      await target.navigate('/');
      await waitForSettledHome();
      await cloud.uiSetCloudStandInDelays({ projects: cloudWait });
      await target.navigate('/');
      await waitForSettledHome();
      const record = await keep('k-b-listing-late');
      const waits = record.cloudStates.filter((state) => state.text.includes('Loading cloud projects'));
      precondition(waits.length > 0, 'K-b: the Tau Cloud wait was never shown');
      const tops = [...new Set(record.gridTops.map((sample) => sample.top))];
      await defect(() => {
        expect(
          {
            firstShownAt: Math.min(...waits.map((state) => state.t)) >= indicatorDelay,
            inHeader: waits.every((state) => state.inHeader),
            gridMoved: tops.length > 1,
          },
          `K-b: the Tau Cloud wait as shown ${JSON.stringify(waits)}, grid tops ${JSON.stringify(record.gridTops)}`,
        ).toEqual({ firstShownAt: true, inHeader: true, gridMoved: false });
      });
    },
  );

  cloudDefectRow(
    {
      api: test,
      expectedFailure: false,
      title:
        "K-c: reports a failed Tau Cloud listing in the Projects header's slot, the grid still, and its Retry asks once",
    },
    async (defect) => {
      await openSignedIn();
      await seedLocalProject();
      await target.navigate('/');
      await waitForSettledHome();
      await cloud.uiSetCloudStandInFailures({ projects: 500 });
      await target.navigate('/');
      await waitForSignedIn();
      await target.waitFor(
        () =>
          (
            globalThis as typeof globalThis & { __TAU_CLOUD_LOAD__: CloudLoadRecord }
          ).__TAU_CLOUD_LOAD__.cloudStates.some((state) => state.role === 'alert'),
        undefined,
        { timeout: 60_000 },
      );
      await target.delay(settleWindow);
      await cloud.uiReadCloudRequestCounts(true);
      await target.click(selectors.getByRole('button', { name: 'Try loading cloud projects again' }));
      /* Long enough for react-query's own retries of a failed listing (1, 2 and 4 s) to be counted. */
      await target.delay(retryWatch);
      const counts = await cloud.uiReadCloudRequestCounts();
      const record = await keep('k-c-listing-failed', counts);
      const alerts = record.cloudStates.filter((state) => state.role === 'alert');
      const tops = [...new Set(record.gridTops.map((sample) => sample.top))];
      await defect(() => {
        expect(
          {
            words: alerts.every((state) => state.text.includes('Couldn’t load cloud projects')),
            inHeader: alerts.every((state) => state.inHeader),
            gridMoved: tops.length > 1,
            retryRequests: counts.projects,
          },
          `K-c: alerts ${JSON.stringify(alerts)}, grid tops ${JSON.stringify(record.gridTops)}, requests after Retry ${JSON.stringify(counts)}`,
        ).toEqual({ words: true, inHeader: true, gridMoved: false, retryRequests: 1 });
      });
    },
  );

  cloudDefectRow(
    {
      api: test,
      expectedFailure: false,
      title: `K-d: says the Tau Cloud wait is long, with Retry, in the Projects header's slot at ${String(slowWait)} ms, while /v1/projects is ${String(longCloudWait)} ms late`,
    },
    async (defect) => {
      await openSignedIn();
      await seedLocalProject();
      await target.navigate('/');
      await waitForSettledHome();
      await cloud.uiSetCloudStandInDelays({ projects: longCloudWait });
      await target.navigate('/');
      await waitForSettledHome();
      const record = await keep('k-d-listing-long');
      const slow = record.cloudStates.filter((state) => state.text.includes('Still loading cloud projects'));
      await defect(() => {
        expect(
          slow.some((state) => state.inHeader && state.t >= slowWait && state.text.includes('Try again')),
          `K-d: the Tau Cloud states shown ${JSON.stringify(record.cloudStates)}`,
        ).toBe(true);
      });
    },
  );

  cloudDefectRow(
    {
      api: test,
      expectedFailure: false,
      title: `U24: paints the usage shell within ${String(shellPaintBound)} ms while its document is stalled ${String(documentStall)} ms, the service worker installed`,
    },
    async (defect) => {
      await target.commands.uiOpenTarget({ serviceWorker: true });
      await openSignedIn();
      await target.navigate('/usage');
      expect(await waitForOfflineShell(), 'the offline shell never installed').toMatch(/^tau-precache-/u);
      const load = await stalledDocument(target.commands).uiOpenWithStalledDocument('/usage', documentStall);
      await target.writeArtifact('cloud-load-gate/u24-document-stalled.json', `${JSON.stringify(load, null, 2)}\n`);
      expect(load.stalledRequests, 'the usage document was never held, so nothing forced the stall').toBeGreaterThan(0);
      await defect(() => {
        expect(
          load.firstContentfulPaint,
          `U24: first contentful paint (ms) with the document held ${String(documentStall)} ms; its response started at ${String(load.responseStart)} ms`,
        ).toBeLessThanOrEqual(shellPaintBound);
      });
    },
  );

  /*
   * F14 (A15b2, programme control 2026-11-16T12:12Z): with the service worker installed and the browser offline, a
   * reload of a project on this device draws the workspace frame and the workspace, with no error state.
   */
  cloudDefectRow(
    {
      api: test,
      // Expected-failure: @rifont until 2026-12-15
      expectedFailure: true,
      title:
        'F14: an offline reload of a project on this device renders the workspace frame and the workspace, the service worker installed',
    },
    async (defect) => {
      await target.commands.uiOpenTarget({ serviceWorker: true });
      await openSignedIn();
      const route = await seedLocalProject();
      await waitForSettledProject();
      /* The page registers the service worker outside a project workspace (B-27); the project then opens under it,
         which caches its deferred files on first use. */
      await target.navigate('/projects');
      expect(await waitForOfflineShell(), 'the offline shell never installed').toMatch(/^tau-precache-/u);
      await target.navigate(route);
      await waitForSettledProject();
      await setTargetOffline(true);
      let reloadError = '';
      let offline: OfflineRead;
      /* Back online whatever happens, so a later row never runs offline. */
      try {
        try {
          await target.reload();
        } catch (error) {
          reloadError = error instanceof Error ? error.message.split('\n')[0]! : String(error);
        }
        const readOffline = async (): Promise<OfflineRead> =>
          target.evaluate(() => ({
            url: location.href,
            frame: document.querySelector('[data-slot="workspace-frame"]') !== null,
            workspace: document.querySelector('[data-project-workspace]') !== null,
            alerts: [...document.querySelectorAll('[role="alert"]')].map((node) =>
              node.textContent.trim().slice(0, 120),
            ),
          }));
        /* Up to 30 s for the workspace; a page that never draws it is the defect, read as it stands. */
        await target
          .waitFor(() => document.querySelector('[data-project-workspace]') !== null, undefined, { timeout: 30_000 })
          .catch(() => undefined);
        /* Not caught: a failed read is a harness fault, which must fail the row, not stand as the defect. */
        offline = await readOffline();
        await target.writeArtifact(
          'cloud-load-gate/f14-offline-reload.json',
          `${JSON.stringify({ route, reloadError, offline }, null, 2)}\n`,
        );
      } finally {
        await setTargetOffline(false);
      }
      await defect(() => {
        expect(
          { frame: offline.frame, workspace: offline.workspace, alerts: offline.alerts },
          `F14: after an offline reload of ${route} (${reloadError || 'the reload resolved'}), the page at ${offline.url || 'unknown'}`,
        ).toEqual({ frame: true, workspace: true, alerts: [] });
      });
    },
  );

  /* K-e (A15e), report-only, ruled by programme control on 2026-11-15: the first open of a Tau Cloud project with its
     download held. The viewer stage should stay mounted and show the status pill with the download's percent, never be
     replaced. This tier cannot force it: its stand-ins answer only the session, the listing and the paired hosts. The
     listing names `cloudStandInProject` as on the Tau remote, but nothing here serves its repository (see N2's
     project-route note), so no clone or large-object download ever starts. The forced row needs a stand-in for the API's git proxy that serves a clone of `cloudStandInProject` with
     at least one large object, and holds either the clone (`git-upload-pack`) or the large-object answer
     (`info/lfs/objects/batch` or the object itself). That need joins the git-proxy stand-in item carried to A10's
     handback. The stage's own half is pinned by `chat-viewer.test.tsx` (the download pill with its percent, the
     failure overlay) and the frame row F8. This row records the gap and fails once a stand-in answers anything else,
     so the lane that adds one turns it into the forced row. */
  test('K-e report-only: the first open of a Tau Cloud project with its download held cannot be forced in this tier', async ({
    annotate,
  }) => {
    await annotate(
      'K-e report-only: needs a git-proxy stand-in serving the Tau-remote project with a large object, holding its clone or its large-object answer',
      'notice',
    );
    expect(
      Object.keys(cloudStandInPaths),
      'K-e: a stand-in now answers more than the session, the listing and the paired hosts; turn this row into the forced K-e row',
    ).toEqual(['session', 'projects', 'agents']);
  });
});
