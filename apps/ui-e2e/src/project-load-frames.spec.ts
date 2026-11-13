/* oxlint-disable no-await-in-loop -- U16 samples warm opens one after another, as a person reloading would. */
import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import type { ProjectLoadFrame, ProjectLoadRecord, WorkerReadDelay } from '#support/home-load-recorder.js';
import {
  armWorkerReadDelay,
  delayRequests,
  inspectServerShell,
  installProjectLoadRecorder,
  installWorkerReadDelay,
  knownDefectRows,
  markProjectLoad,
  precondition,
  projectRowMoves,
  projectLoadProbe,
  readDelayedRequests,
  readProjectLoad,
  firstDelayedRead,
  readWorkerReads,
} from '#support/home-load-recorder.js';

/**
 * A0.10 (app state orchestration charter, D25): the project route's loading defects, frame by frame, in the
 * self-host tier. The recorder (`recordProjectLoad`) is installed before any page script and samples every
 * animation frame, so a state painted once is caught.
 *
 * Every row that pins a known defect forces it — a delayed workspace chunk, or a file-manager worker read
 * answered late — so it is red on every run, and is written `test.fails` so `main` stays green. Its title names
 * the defect; its failure is the defect's own assertion (a removed node, a mount count, a frame), and names the
 * frame. The fixing lane flips the row to `test` and never deletes it. A row measures first (seeding, the load,
 * the check that the forcing happened, its preconditions) and asserts after; an error while measuring never
 * passes as the defect (`knownDefectRows`). A row that cannot be forced is report-only: it records k of n with
 * every sample in n and asserts nothing about k.
 *
 * Shell rows assert on `[data-slot=sidebar-wrapper]`: on a phone the sidebar is a sheet, and
 * `[data-slot=sidebar]` leaves the DOM by design.
 */

const viewports = {
  wide: { width: 1440, height: 900 },
  phone: { width: 390, height: 844 },
} as const;
type ViewportName = keyof typeof viewports;

/** The workspace chunk `loadProjectWorkspace()` imports. */
const workspaceChunk = String.raw`/assets/project-live-sessions-[\w-]+\.js(?:\?|$)`;
/** U1: 1.5 s can pass on today's code. Milliseconds. */
const chunkDelay = 3000;
/** How late a delayed worker read answers. Milliseconds. */
const readDelay = 3000;
/** How long a loaded page is watched for a late change. Milliseconds. */
const settleWindow = 2000;
const projectNames = { a: 'Project Navigation A', b: 'Project Navigation B' } as const;
const usage = { inputTokens: 12, outputTokens: 6 };
const finalReply = 'The task list is up to date.';
const composer = selectors.getByCss('[aria-label="Ask Tau to build anything..."]');
const traySummary = selectors.getByRole('button', { name: /^Tasks: 0 of 2 done/u });

const cookieValue = (value: unknown): string => encodeURIComponent(JSON.stringify(value));
const describeFrame = (frame: ProjectLoadFrame): string => `frame ${frame.frame} (${frame.t} ms)`;
const describeFrames = (frames: readonly ProjectLoadFrame[]): string =>
  frames
    .slice(0, 5)
    .map((frame) => describeFrame(frame))
    .join(', ') + (frames.length > 5 ? ` and ${frames.length - 5} more` : '');

const knownDefect = knownDefectRows('project-load-frames');
/** The measure budget of a row that seeds projects and loads once; of one that also runs an agent turn. */
const loadBudget = 360_000;
const turnBudget = 600_000;

/** Wait until the project workspace is on screen (the wide workspace, or the phone's workbench bar), then watch it settle. */
const settleProject = async (): Promise<void> => {
  await target.waitFor(
    () =>
      document.querySelector('[data-slot="sidebar-wrapper"]') !== null &&
      document.querySelector('[data-project-workspace], nav[aria-label="Workbench"]') !== null,
    undefined,
    { timeout: 60_000 },
  );
  await target.delay(settleWindow);
};

/** Read the current document's record and keep it as evidence. */
const keepRecord = async (name: string, extra: Readonly<Record<string, unknown>> = {}): Promise<ProjectLoadRecord> => {
  const record = await readProjectLoad();
  const reads = await readWorkerReads();
  const delayed = await readDelayedRequests();
  await target.writeArtifact(
    `project-load-frames/${name}.json`,
    `${JSON.stringify({ ...extra, delayedRequests: delayed, record, workerReads: reads }, null, 2)}\n`,
  );
  return record;
};

/**
 * Two projects through the production create path (`/__e2e/project-navigation`): A with its first chat, then B,
 * and the route opens A. The analytics choice is made already, so its banner is not a paint of the load.
 *
 * @param viewport - The size every later load uses.
 * @returns A's path, with its chat.
 */
const seedProjects = async (
  viewport: ViewportName,
  options: { readonly laneBorders?: boolean } = {},
): Promise<{ readonly path: string; readonly chatId: string }> => {
  await target.addCookies([
    { domain: 'localhost', name: 'tau-cookie-consent', path: '/', value: cookieValue('declined') },
  ]);
  await target.setViewport(viewports.wide);
  await installProjectLoadRecorder(options);
  await installWorkerReadDelay();
  await target.installAgentHostGatewayFixture([]);
  await target.navigate('/__e2e/project-navigation');
  await target.expectUrl(/\/w\/[^/]+\/[^/?]+\?chat=/u, 60_000);
  await target.expectVisible(composer, 60_000);
  const url = new URL(await target.currentUrl());
  await target.setViewport(viewports[viewport]);
  return { path: `${url.pathname}${url.search}`, chatId: url.searchParams.get('chat') ?? '' };
};

/**
 * A's chat gets a transcript and a task list: one scripted turn calls `update_todos`, so the tray above the
 * composer is in the chat's files.
 *
 * @param chatId - A's chat.
 */
const seedTranscriptWithTray = async (chatId: string): Promise<void> => {
  await target.installAgentHostGatewayFixture([
    {
      text: 'Planning the bracket.',
      toolCalls: [
        {
          name: 'update_todos',
          args: {
            chatId,
            items: [
              { id: 'model', title: 'Model the bracket', status: 'in_progress' },
              { id: 'print', title: 'Print the bracket', status: 'pending' },
            ],
          },
        },
      ],
      usage,
    },
    { text: finalReply, usage },
  ]);
  await target.type(composer, 'Make a bracket.');
  await target.click(selectors.getByCss('button:has(svg.lucide-arrow-up)').last());
  await target.expectVisible(selectors.getByText(finalReply, { exact: true }), 120_000);
  await target.expectVisible(traySummary, 60_000);
  /* The turn's files settle before the measured load. */
  await target.delay(settleWindow);
};

/** The transcript stream's page read for one chat. */
const transcriptRead = (chatId: string): WorkerReadDelay => ({
  method: 'read',
  path: `"chatId":"${chatId}"`,
  milliseconds: readDelay,
});

/** The tray's file for one chat. */
const trayRead = (chatId: string): WorkerReadDelay => ({
  method: 'readFileWithDigest',
  path: String.raw`^\.tau/chats/${chatId}/todo\.yaml$`,
  milliseconds: readDelay,
});

/** The transcript stream's page read and the tray's file, for one chat. */
const transcriptReads = (chatId: string): WorkerReadDelay[] => [transcriptRead(chatId), trayRead(chatId)];

/** The project chat listing: every project's `.tau/chats` directory read. */
const chatListingRead: WorkerReadDelay = {
  method: 'readdir',
  path: String.raw`^\.tau/chats$`,
  milliseconds: readDelay,
};

/** A shift entry names a sidebar row when one of its moved nodes is a project row or a menu item. */
const sidebarRowSource = /\[(?:project-trigger|sidebar-menu-item|sidebar-menu-sub-item|chat-trigger)\]/u;

/**
 * The layout-shift entries that moved a sidebar row, with only those sources (box x,y,w,h before -> after).
 *
 * @param record - One load's record.
 * @returns One line per entry.
 */
const sidebarRowShifts = (record: ProjectLoadRecord): string[] =>
  record.shifts
    .filter((shift) => !shift.hadRecentInput && shift.sources.some((source) => sidebarRowSource.test(source)))
    .map((shift) => `${shift.t} ms: ${shift.sources.filter((source) => sidebarRowSource.test(source)).join('; ')}`);

/**
 * Hold the workspace chunk for the next load. The route also turns the context's HTTP cache off, so the reload that
 * follows fetches the chunk again, uncached, and is held.
 */
const delayWorkspaceChunk = async (): Promise<void> => delayRequests(workspaceChunk, chunkDelay);

/** The forcing happened: the load requested the workspace chunk and it was held. */
const requireChunkDelayed = async (row: string): Promise<void> => {
  const delayed = await readDelayedRequests();
  precondition(delayed.length > 0, `${row}: the workspace chunk was never delayed`);
};

/** The forcing happened: a read matching the row's own `rule` was answered late. Returns when the first was sent. */
const requireReadDelayed = async (row: string, rule: WorkerReadDelay): Promise<number> => {
  const since = firstDelayedRead(await readWorkerReads(), rule);
  precondition(since !== undefined, `${row}: no ${rule.method} read matching /${rule.path}/ was delayed`);
  return since!;
};

for (const viewport of ['wide', 'phone'] as const) {
  knownDefect(`U1: the sidebar wrapper is never removed on a ${viewport} reload with the workspace chunk 3 s late`, {
    artifact: `u1-${viewport}`,
    budget: loadBudget,
    measure: async () => {
      await seedProjects(viewport);
      await delayWorkspaceChunk();
      await target.reload();
      await settleProject();
      await requireChunkDelayed('U1');
      const record = await keepRecord(`u1-${viewport}`);
      precondition(record.wrapperFirstFrame !== undefined, 'U1: the sidebar wrapper never painted');
      return record;
    },
    assert: (record) => {
      const first = record.wrapperFirstFrame!;
      const gaps = record.wrapperAbsentFrames.filter((frame) => frame.frame > first.frame);
      expect(
        gaps,
        `U1: [data-slot=sidebar-wrapper] first painted in ${describeFrame(first)}, then was absent in ${describeFrames(gaps)}`,
      ).toEqual([]);
    },
  });

  knownDefect(`U2: the sidebar wrapper is not removed after its first mount on a ${viewport} reload`, {
    artifact: `u2-${viewport}`,
    budget: loadBudget,
    measure: async () => {
      await seedProjects(viewport);
      await target.reload();
      await settleProject();
      return keepRecord(`u2-${viewport}`);
    },
    assert: (record) => {
      expect(
        record.wrapperRemovals,
        `U2: [data-slot=sidebar-wrapper] was removed from the document before ${describeFrames(record.wrapperRemovals)}; ${record.wrapperMounts} wrapper nodes mounted`,
      ).toEqual([]);
    },
  });
}

knownDefect('U22: a click on a project row from Home removes the sidebar wrapper zero times', {
  artifact: 'u22-wide',
  budget: loadBudget,
  measure: async () => {
    await seedProjects('wide');
    await target.navigate('/');
    await target.expectVisible(composer, 60_000);
    await target.delay(settleWindow);
    const row = selectors.getByRole('link', { name: projectNames.a }).first();
    await target.expectVisible(row, 60_000);
    await markProjectLoad('click');
    await target.click(row);
    await target.expectUrl(/\/w\/[^/]+\/[^/?]+/u, 60_000);
    await settleProject();
    const record = await keepRecord('u22-wide');
    const click = record.marks.find((mark) => mark.name === 'click');
    precondition(click !== undefined, 'U22: the click was not marked');
    return { record, click: click! };
  },
  assert: ({ record, click }) => {
    const removals = record.wrapperRemovals.filter((removal) => removal.t >= click.t);
    expect(
      removals,
      `U22: after the click in ${describeFrame(click)}, [data-slot=sidebar-wrapper] was removed before ${describeFrames(removals)}`,
    ).toEqual([]);
  },
});

knownDefect(
  'U3: a direct load with the sidebar open has the wrapper and sidebar in the server HTML and in every frame',
  {
    artifact: 'u3-wide',
    budget: loadBudget,
    measure: async () => {
      const { path } = await seedProjects('wide');
      const server = await inspectServerShell(path);
      await target.reload();
      await settleProject();
      /* The shell's sidebar carries no open state of its own: it is open when it is shown with a width. */
      const isOpen = await target.evaluate(() =>
        [...document.querySelectorAll('[data-slot="sidebar"]')].some(
          (node) => node.getBoundingClientRect().width > 0 && node.checkVisibility(),
        ),
      );
      precondition(isOpen, 'U3: the sidebar is not open on the settled page');
      return { server, record: await keepRecord('u3-wide', { server }) };
    },
    assert: ({ server, record }) => {
      expect(
        {
          serverWrapper: server.wrapper,
          serverSidebar: server.sidebar,
          wrapperAbsentFrames: record.wrapperAbsentFrames.length,
          sidebarAbsentFrames: record.sidebarAbsentFrames.length,
        },
        `U3: the server HTML ${server.wrapper ? 'has' : 'lacks'} [data-slot=sidebar-wrapper] and ${server.sidebar ? 'has' : 'lacks'} [data-slot=sidebar]; the wrapper is absent in ${describeFrames(record.wrapperAbsentFrames) || 'no frame'}, the sidebar in ${describeFrames(record.sidebarAbsentFrames) || 'no frame'}`,
      ).toEqual({ serverWrapper: true, serverSidebar: true, wrapperAbsentFrames: 0, sidebarAbsentFrames: 0 });
    },
  },
);

knownDefect('U4: the workspace placeholder node is created at most once per load with the workspace chunk 3 s late', {
  artifact: 'u4-wide',
  budget: loadBudget,
  measure: async () => {
    await seedProjects('wide');
    await delayWorkspaceChunk();
    await target.reload();
    await settleProject();
    await requireChunkDelayed('U4');
    return keepRecord('u4-wide');
  },
  assert: (record) => {
    expect(
      record.placeholders.length,
      `U4: [data-testid=workspace-skeleton] was created ${record.placeholders.length} times, in ${describeFrames(record.placeholders)}`,
    ).toBeLessThanOrEqual(1);
  },
});

/**
 * The lane borders a frame drew that the settled page does not draw, inside the content region (right of the
 * sidebar). Whatever element draws it, a border where the settled two-lane page has none is a lane it lacks.
 */
const extraLaneBorders = (
  record: ProjectLoadRecord,
  contentLeft: number,
  windowWidth: number,
): Array<ProjectLoadFrame & { readonly xs: readonly number[] }> => {
  const settled = record.laneBorders.at(-1)?.xs ?? [];
  const isInside = (x: number): boolean => x > contentLeft + 2 && x < windowWidth - 2;
  const isSettled = (x: number): boolean => settled.some((known) => Math.abs(known - x) <= 2);
  return record.laneBorders
    .map((frame) => ({ ...frame, xs: frame.xs.filter((x) => isInside(x) && !isSettled(x)) }))
    .filter((frame) => frame.xs.length > 0);
};

knownDefect(
  'U5: a workbench-closed project never paints a third lane border in any frame with the workspace chunk 3 s late',
  {
    artifact: 'u5-wide',
    budget: loadBudget,
    measure: async () => {
      await seedProjects('wide', { laneBorders: true });
      const toggle = selectors.getByRole('button', { name: 'Toggle Workbench lane' }).first();
      await target.expectAttribute(toggle, 'aria-pressed', 'true', 60_000);
      await target.click(toggle);
      await target.expectAttribute(toggle, 'aria-pressed', 'false');
      /* The closed lane is persisted before the measured load. */
      await target.delay(settleWindow);
      await delayWorkspaceChunk();
      await target.reload();
      await settleProject();
      await requireChunkDelayed('U5');
      await target.expectAttribute(toggle, 'aria-pressed', 'false', 60_000);
      const contentLeft = await target.evaluate(() =>
        Math.round(document.querySelector('[data-slot="sidebar-container"]')?.getBoundingClientRect().right ?? 0),
      );
      const record = await keepRecord('u5-wide', { contentLeft });
      precondition(record.laneBorders.length > 0, 'U5: the settled page drew no lane border to compare frames with');
      return { record, contentLeft };
    },
    assert: ({ record, contentLeft }) => {
      const extra = extraLaneBorders(record, contentLeft, viewports.wide.width);
      expect(
        extra.slice(0, 5).map((frame) => `${describeFrame(frame)}: x ${frame.xs.join(', ')}`),
        `U5: a workbench-closed project painted a lane border the settled page lacks (settled: x ${(record.laneBorders.at(-1)?.xs ?? []).join(', ')}) in ${extra.length} frames`,
      ).toEqual([]);
    },
  },
);

knownDefect('U6: no sidebar project row moves on a reload with the chat listing 3 s late', {
  artifact: 'u6-wide',
  budget: loadBudget,
  measure: async () => {
    await seedProjects('wide');
    await armWorkerReadDelay([chatListingRead]);
    await target.reload();
    await settleProject();
    /* The delayed reads answer after the workspace is up; the row they move is watched until then. */
    await target.delay(readDelay);
    await target.expectVisible(selectors.getByRole('link', { name: projectNames.b }).first(), 60_000);
    const since = await requireReadDelayed('U6', chatListingRead);
    return { record: await keepRecord('u6-wide', { since }), since };
  },
  assert: ({ record, since }) => {
    /* Only what the late listing can move: a move before it was requested is the shell's (U2). */
    const moved = projectRowMoves(record, since);
    expect(
      moved,
      `U6: after the chat listing was requested at ${since} ms, a sidebar project row moved between frames: ${moved.join(' | ')}; layout shifts naming a sidebar row: ${sidebarRowShifts(record).join(' | ') || 'none'}`,
    ).toEqual([]);
  },
});

knownDefect('U7: the largest contentful paint is not the empty-chat state with the transcript read 3 s late', {
  artifact: 'u7-wide',
  budget: turnBudget,
  measure: async () => {
    const { chatId } = await seedProjects('wide');
    await seedTranscriptWithTray(chatId);
    await armWorkerReadDelay(transcriptReads(chatId));
    await target.reload();
    await settleProject();
    await target.delay(readDelay);
    await target.expectVisible(selectors.getByText(finalReply, { exact: true }), 60_000);
    await requireReadDelayed('U7', transcriptRead(chatId));
    const record = await keepRecord('u7-wide');
    precondition(record.largestPaints.length > 0, 'U7: no largest-contentful-paint entry');
    return record;
  },
  assert: (record) => {
    const largest = record.largestPaints.at(-1)!;
    expect(
      largest.isEmptyState,
      `U7: the largest contentful paint at ${largest.t} ms is the empty-chat state: ${largest.element}`,
    ).toBe(false);
  },
});

knownDefect(
  'U10: the composer keeps its height in every frame for a chat with a tray, with the transcript read 3 s late',
  {
    artifact: 'u10-wide',
    budget: turnBudget,
    measure: async () => {
      const { chatId } = await seedProjects('wide');
      await seedTranscriptWithTray(chatId);
      await armWorkerReadDelay(transcriptReads(chatId));
      await target.reload();
      await settleProject();
      await target.delay(readDelay);
      await target.expectVisible(traySummary, 60_000);
      await requireReadDelayed('U10', trayRead(chatId));
      const record = await keepRecord('u10-wide');
      precondition(record.composer.length > 0, 'U10: the composer was never on screen');
      return record;
    },
    assert: (record) => {
      const [first, ...later] = record.composer;
      const changes = later.filter((entry) => entry.height !== first!.height);
      expect(
        changes.map((entry) => `${describeFrame(entry)}: ${first!.height} -> ${entry.height} px`),
        `U10: the chat composer region is ${first!.height} px in ${describeFrame(first!)} and changes height after`,
      ).toEqual([]);
    },
  },
);

knownDefect(
  'M1: on a 390 by 844 reload with the workspace chunk 3 s late, first contentful paint is within 100 ms of first paint',
  {
    artifact: 'm1-phone',
    budget: loadBudget,
    measure: async () => {
      await seedProjects('phone');
      await delayWorkspaceChunk();
      await target.reload();
      await settleProject();
      await requireChunkDelayed('M1');
      const record = await keepRecord('m1-phone');
      precondition(record.firstPaint !== undefined, 'M1: no first-paint entry');
      precondition(record.firstContentfulPaint !== undefined, 'M1: no first-contentful-paint entry');
      return record;
    },
    assert: (record) => {
      const gap = record.firstContentfulPaint! - record.firstPaint!;
      expect(
        gap,
        `M1: first paint at ${record.firstPaint!} ms, first contentful paint at ${record.firstContentfulPaint!} ms`,
      ).toBeLessThanOrEqual(100);
    },
  },
);

/** U16 is class c: report-only by design. How many warm opens one run samples. */
const warmOpens = 20;
/** One warm open's worst case: the settle wait and the window after it. Milliseconds. */
const warmOpenBudget = 70_000;

test(
  'U16 (report-only): counts viewer dock header mounts on warm opens, k of n',
  { timeout: loadBudget + warmOpens * warmOpenBudget },
  async () => {
    await seedProjects('wide');
    await settleProject();
    const samples: Array<{
      readonly sample: number;
      readonly mounts?: number;
      /** Headers in the settled document: a mount count above it is a header built, removed and built again. */
      readonly settled?: number;
      readonly frames?: readonly number[];
      /** Why the sample has no count. It stays in n. */
      readonly error?: string;
    }> = [];
    for (let sample = 1; sample <= warmOpens; sample += 1) {
      try {
        await target.reload();
        await settleProject();
        const record = await readProjectLoad();
        samples.push({
          sample,
          mounts: record.viewerDockHeaders.length,
          settled: await target.evaluate(
            (selector) => document.querySelectorAll(selector).length,
            projectLoadProbe.viewerDockHeader,
          ),
          frames: record.viewerDockHeaders.map((header) => header.frame),
        });
      } catch (error) {
        samples.push({ sample, error: error instanceof Error ? error.message : String(error) });
      }
    }
    /* K, as the mapping states it, counts loads whose header mounted more than once. `rebuilt` is the stricter
     * reading: loads that mounted more headers than the settled page holds. A sample that failed stays in n. */
    const k = samples.filter((entry) => (entry.mounts ?? 0) > 1).length;
    const rebuilt = samples.filter((entry) => (entry.mounts ?? 0) > Math.max(entry.settled ?? 0, 1)).length;
    const failed = samples.filter((entry) => entry.error !== undefined).length;
    const report = { defect: 'U16', k, rebuilt, failed, n: samples.length, samples };
    await target.writeArtifact('project-load-frames/u16-report.json', `${JSON.stringify(report, null, 2)}\n`);
    expect(samples).toHaveLength(warmOpens);
  },
);
