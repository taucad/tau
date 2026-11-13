import { describe, expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import type { CloudLoadRecord, CloudRequestCounts, CloudStandInDelays } from '#support/cloud-stand-ins.js';
import {
  cloudLoadProbe,
  cloudStandInCommands,
  cloudStandInOwner,
  cloudStandInProject,
  readCloudLoadRecord,
  recordCloudLoad,
} from '#support/cloud-stand-ins.js';

/**
 * The cloud-build load tier (lane A0.11, `ui-e2e:test:e2e:cloud-load`): the loading defects a self-host build cannot
 * show, because it has no billing fence and asks for `/v1/projects` only for a project on the Tau remote. The tier
 * serves the cloud UI variant with no API: stand-ins answer `get-session`, `/v1/projects` and `/v1/agents` for a
 * signed-in owner whose listing holds one project on the Tau remote (`#support/cloud-stand-ins.js`).
 *
 * Each row pins a known defect and is an expected failure, so `main` stays green; the lane that fixes the defect
 * flips its row. Each is forced by holding a stand-in answer, never sampled, and fails on the defect's own
 * assertion: a request count, a removed node or an offset.
 */

const cloud = cloudStandInCommands(target.commands);
/** Only the cloud-build tier sets this; in the self-host tiers every row here is out of scope. */
const cloudLoadTier = await cloud.uiIsCloudLoadTier();

const wide = { width: 1440, height: 900 } as const;
/** How long a held answer is held, as the audit's discriminators held them. Milliseconds. */
const held = 2000;
/** How long a settled load is watched for a late request or change. Milliseconds. */
const settleWindow = 3000;
const workspace = selectors.getByCss('[data-project-workspace]');

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
  test.fails('N2: requests get-session, /v1/projects, /v1/agents and the file-manager worker once per load of Home', async () => {
    await openSignedIn();
    await target.navigate('/');
    await waitForSettledHome();
    const counts = await cloud.uiReadCloudRequestCounts();
    await keep('n2-home', counts);
    expect(counts, `N2: requests per load of Home ${JSON.stringify(counts)}`).toEqual({
      session: 1,
      projects: 1,
      agents: 1,
      fileManagerWorker: 1,
    });
  });

  test.fails('N2: requests get-session, /v1/agents and the file-manager worker once per load of a project route', async () => {
    await openSignedIn();
    const route = await seedLocalProject();
    await target.delay(settleWindow);
    await cloud.uiReadCloudRequestCounts(true);
    await target.navigate(route);
    await waitForSettledProject();
    const counts = await cloud.uiReadCloudRequestCounts();
    await keep('n2-project', counts);
    /* A project with no Tau remote never asks for the listing (`use-cloud-projects.ts`, `useProjectAccessRole`). */
    expect(counts, `N2: requests per load of a project route ${JSON.stringify(counts)}`).toEqual({
      session: 1,
      projects: 0,
      agents: 1,
      fileManagerWorker: 1,
    });
  });

  test.fails(`U1: keeps the sidebar wrapper on a project route while get-session is held ${String(held)} ms, the chunk undelayed`, async () => {
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
    expect(record.wrapperRemovals, 'U1: the sidebar wrapper was removed at these times (ms)').toEqual([]);
  });

  test.fails(`H6: holds the project grid's top offset on Home while /v1/projects is held ${String(held)} ms`, async () => {
    await openSignedIn();
    await seedLocalProject();
    await target.navigate('/');
    await waitForSettledHome();
    await cloud.uiSetCloudStandInDelays({ projects: held });
    await target.navigate('/');
    await waitForSettledHome();
    const record = await keep('h6-listing-held');
    expect(record.gridTops.length, 'the project grid was never on screen').toBeGreaterThan(0);
    const tops = [...new Set(record.gridTops.map((sample) => sample.top))];
    expect(tops, `H6: the project grid's top offset moved (${JSON.stringify(record.gridTops)})`).toEqual([
      record.gridTops.at(-1)?.top,
    ]);
  });
});
