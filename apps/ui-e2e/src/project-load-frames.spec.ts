/* oxlint-disable no-await-in-loop -- U16 samples warm opens one after another, as a person reloading would. */
import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import { filesPane, treeItem } from '#support/file-tree.js';
import { writeWorkbenchFile } from '#support/workbench-files.js';
import type {
  ProjectLoadFrame,
  ProjectLoadBox,
  ProjectLoadRecord,
  ProjectLoadRegionEntry,
  WorkerReadDelay,
} from '#support/home-load-recorder.js';
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
  readLaneBordersNow,
  readWorkerDeliveries,
  readWorkerReads,
  openBeforeHydration,
} from '#support/home-load-recorder.js';

/**
 * A0.10 (app state orchestration charter, D25): the project route's loading defects, frame by frame, in the
 * self-host tier. The recorder (`recordProjectLoad`) is installed before any page script and samples every
 * animation frame, so a state painted once is caught.
 *
 * Every row that pins a known defect shows it on every run. Most force it: the workspace chunk or the agent host's
 * script held, or a file-manager worker reply delivered late. U2, U3 and U22 need no forcing: their defect is built
 * into the load on every run. Its title names the defect; its defect assertion (a removed
 * node, a mount count, a frame) names the frame. Each is a plain test that stands as an expected failure until the
 * fixing lane sets `expectedFailure: false`; it is never deleted. A row measures first (seeding, the load, the check
 * that the forcing happened, its preconditions) and asserts after: an error while measuring, in setup or teardown,
 * or the defect assertion passing fails the row (`knownDefectRows`). A row that cannot be forced is report-only: it
 * records k of n with every sample in n and asserts nothing about k.
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
/** The agent host worker's script (`browser-agent-worker.ts`): every transcript answer comes from the host it boots. */
const agentHostWorker = String.raw`/assets/agent-host\.worker-[\w-]+\.js(?:\?|$)`;
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
  const deliveries = await readWorkerDeliveries();
  const delayed = await readDelayedRequests();
  await target.writeArtifact(
    `project-load-frames/${name}.json`,
    `${JSON.stringify({ ...extra, delayedRequests: delayed, record, workerReads: reads, workerDeliveries: deliveries }, null, 2)}\n`,
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
  options: {
    readonly laneBorders?: boolean;
    readonly watchText?: string;
    readonly agentHost?: boolean;
    /** Regions the recorder watches in every frame, and sets of boxes it keeps (A15 frame rows). */
    readonly regions?: Readonly<Record<string, string>>;
    readonly boxSets?: Readonly<Record<string, string>>;
    readonly frameTimes?: boolean;
    /** Seed A as a project reopened with its entry file open in the Editor (A15 frame rows: F9). */
    readonly openEntry?: boolean;
  } = {},
): Promise<{ readonly path: string; readonly chatId: string }> => {
  await target.addCookies([
    { domain: 'localhost', name: 'tau-cookie-consent', path: '/', value: cookieValue('declined') },
  ]);
  await target.setViewport(viewports.wide);
  await installProjectLoadRecorder(options);
  await installWorkerReadDelay();
  /* The gateway fixture routes the context's requests, which turns its HTTP cache off; U16 needs warm opens. */
  if (options.agentHost !== false) {
    await target.installAgentHostGatewayFixture([]);
  }
  await target.navigate(`/__e2e/project-navigation${options.openEntry === true ? '?openEntry=1' : ''}`);
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

/**
 * The tray's file for one chat. The tray reads it on its own (`useFileContent`), apart from the transcript, which
 * waits for the agent host (U7).
 */
const trayRead = (chatId: string): WorkerReadDelay => ({
  method: 'readFileWithDigest',
  path: String.raw`^\.tau/chats/${chatId}/todo\.yaml$`,
  milliseconds: readDelay,
});

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
  const since = firstDelayedRead(await readWorkerDeliveries(), rule);
  precondition(since !== undefined, `${row}: no ${rule.method} reply matching /${rule.path}/ was delivered late`);
  return since!;
};

for (const viewport of ['wide', 'phone'] as const) {
  knownDefect(`U1: the sidebar wrapper is never removed on a ${viewport} reload with the workspace chunk 3 s late`, {
    artifact: `u1-${viewport}`,
    expectedFailure: true,
    budget: loadBudget,
    measure: async () => {
      await seedProjects(viewport);
      await delayWorkspaceChunk();
      await target.reload();
      await settleProject();
      await requireChunkDelayed('U1');
      const record = await keepRecord(`u1-${viewport}`);
      precondition(record.wrapperFirstFrame !== undefined, 'U1: the sidebar wrapper never painted');
      precondition(
        record.dropped['wrapperAbsentFrames'] === undefined,
        'U1: the record dropped absent-wrapper frames past its frame limit',
      );
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
    expectedFailure: true,
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

for (const viewport of ['wide', 'phone'] as const) {
  knownDefect(`U22: a click on a project row from Home removes the sidebar wrapper zero times at ${viewport} size`, {
    artifact: `u22-${viewport}`,
    expectedFailure: true,
    budget: loadBudget,
    measure: async () => {
      await seedProjects(viewport);
      await target.navigate('/');
      await target.expectVisible(composer, 60_000);
      await target.delay(settleWindow);
      const row = selectors.getByRole('link', { name: projectNames.a }).first();
      await target.expectVisible(row, 60_000);
      await markProjectLoad('click');
      await target.click(row);
      await target.expectUrl(/\/w\/[^/]+\/[^/?]+/u, 60_000);
      await settleProject();
      const record = await keepRecord(`u22-${viewport}`);
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
}

knownDefect(
  'U3: a direct load with the sidebar open has the wrapper and sidebar in the server HTML and in every frame',
  {
    artifact: 'u3-wide',
    expectedFailure: true,
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
  expectedFailure: true,
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
 * U8 (class c, no lane fixes it) mounts lanes 1, 17 and 16 px wide beside the sidebar for one unpainted layout before
 * they snap. A border this close to the content's left edge is that snap, not a lane. Pixels.
 */
const laneSnapBand = 24;

/**
 * The recorded changes that drew more lanes inside the content region than the settled page draws: a third lane on a
 * two-lane page, whatever element draws it. Each runs until the next change, so its frame span is reported.
 */
const extraLanes = (
  record: ProjectLoadRecord,
  settled: readonly number[],
  bounds: { readonly contentLeft: number; readonly windowWidth: number },
): string[] => {
  const inside = (xs: readonly number[]): number[] =>
    xs.filter((x) => x > bounds.contentLeft + laneSnapBand && x < bounds.windowWidth - 2);
  const settledLanes = inside(settled).length;
  return record.laneBorders.flatMap((entry, index) => {
    const lanes = inside(entry.xs);
    if (lanes.length <= settledLanes) {
      return [];
    }
    const next = record.laneBorders[index + 1];
    const last = next === undefined ? record.frames : next.frame - 1;
    return [`frames ${entry.frame} to ${last} (from ${entry.t} ms): x ${lanes.join(', ')}`];
  });
};

knownDefect(
  'U5: a workbench-closed project never paints a third lane border in any frame with the workspace chunk 3 s late',
  {
    artifact: 'u5-wide',
    expectedFailure: true,
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
      /* The desktop sidebar is the non-collapsible variant: the shown sidebar's right edge is the content's left. */
      const contentLeft = await target.evaluate(() =>
        Math.max(
          0,
          ...[...document.querySelectorAll('[data-slot="sidebar"]')]
            .filter((node) => node.checkVisibility())
            .map((node) => Math.round(node.getBoundingClientRect().right)),
        ),
      );
      /* The settled reference is the page as it stands now, not the last frame the record kept. */
      const settled = await readLaneBordersNow();
      const record = await keepRecord('u5-wide', { contentLeft, settled });
      precondition(contentLeft > 0, 'U5: no shown sidebar marks the content region');
      precondition(settled.length > 0, 'U5: the settled page drew no lane border to compare frames with');
      precondition(
        record.dropped['laneBorders'] === undefined,
        `U5: the record dropped ${String(record.dropped['laneBorders'])} lane border changes past its frame limit`,
      );
      return { record, settled, contentLeft };
    },
    assert: ({ record, settled, contentLeft }) => {
      const extra = extraLanes(record, settled, { contentLeft, windowWidth: viewports.wide.width });
      expect(
        extra.slice(0, 5),
        `U5: a workbench-closed project drew more lane borders right of the sidebar (x > ${contentLeft + laneSnapBand}) than the settled page (x ${settled.join(', ')})`,
      ).toEqual([]);
    },
  },
);

knownDefect('U6: no sidebar project row moves on a reload with the chat listing 3 s late', {
  artifact: 'u6-wide',
  expectedFailure: true,
  budget: loadBudget,
  measure: async () => {
    await seedProjects('wide');
    await armWorkerReadDelay([chatListingRead]);
    await target.reload();
    await settleProject();
    /* The delayed reads answer after the workspace is up; the row they move is watched until then. */
    await target.delay(readDelay);
    await target.expectVisible(selectors.getByRole('link', { name: projectNames.b }).first(), 60_000);
    const record = await keepRecord('u6-wide');
    return { record, since: await requireReadDelayed('U6', chatListingRead) };
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

knownDefect('U7: the largest contentful paint is not the empty-chat state with the agent host 3 s late', {
  artifact: 'u7-wide',
  expectedFailure: true,
  budget: turnBudget,
  measure: async () => {
    const { chatId } = await seedProjects('wide', { watchText: finalReply });
    await seedTranscriptWithTray(chatId);
    /* The transcript is shown only once the agent host answers its read, so holding the host's script holds it. */
    await delayRequests(agentHostWorker, readDelay);
    await target.reload();
    await settleProject();
    await target.delay(readDelay);
    await target.expectVisible(selectors.getByText(finalReply, { exact: true }), 60_000);
    const record = await keepRecord('u7-wide');
    const held = await readDelayedRequests();
    precondition(
      held.some((url) => new RegExp(agentHostWorker, 'u').test(url)),
      'U7: the agent host worker was never delayed',
    );
    precondition(
      record.textFirstFrame !== undefined && record.textFirstFrame.t >= readDelay,
      `U7: the transcript was shown at ${String(record.textFirstFrame?.t)} ms, before the ${readDelay} ms hold could end`,
    );
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
  'U10: the composer keeps its height in every frame for a chat with a tray, with the tray file answered 3 s late',
  {
    artifact: 'u10-wide',
    expectedFailure: true,
    budget: turnBudget,
    measure: async () => {
      const { chatId } = await seedProjects('wide');
      await seedTranscriptWithTray(chatId);
      await armWorkerReadDelay([trayRead(chatId)]);
      await target.reload();
      await settleProject();
      await target.delay(readDelay);
      await target.expectVisible(traySummary, 60_000);
      const record = await keepRecord('u10-wide');
      await requireReadDelayed('U10', trayRead(chatId));
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
    expectedFailure: true,
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
  /* A report keeps every sample: a retry would replace a run's samples with another run's. */
  { timeout: loadBudget + warmOpens * warmOpenBudget, retry: 0 },
  async () => {
    await seedProjects('wide', { agentHost: false });
    await settleProject();
    const samples: Array<{
      readonly sample: number;
      /** The workspace chunk came from the HTTP cache: a warm open. A cold sample stays in n, labelled. */
      readonly warm?: boolean;
      readonly mounts?: number;
      /** Headers in the settled document: a mount count above it is a header built, removed and built again. */
      readonly settled?: number;
      readonly frames?: readonly number[];
      /** Why the sample has no count. It stays in n. */
      readonly error?: string;
    }> = [];
    /* Written after every sample, so a run that times out still reports the samples it took. */
    const writeReport = async (): Promise<void> => {
      /* K, as the mapping states it, counts loads whose header mounted more than once. `rebuilt` is the stricter
       * reading: loads that mounted more headers than the settled page holds. A sample that failed stays in n. */
      const k = samples.filter((entry) => (entry.mounts ?? 0) > 1).length;
      const rebuilt = samples.filter((entry) => (entry.mounts ?? 0) > Math.max(entry.settled ?? 0, 1)).length;
      const failed = samples.filter((entry) => entry.error !== undefined).length;
      const warm = samples.filter((entry) => entry.warm === true).length;
      /* Mounts in more than one sampled frame: a person could have seen the first header before its rebuild. */
      const painted = samples.filter((entry) => new Set(entry.frames ?? []).size > 1).length;
      const perSample = samples.map((entry) => ({
        ...entry,
        /* This load mounted more headers than its settled page holds: one was built, removed and built again. */
        rebuilt: entry.mounts !== undefined && entry.mounts > Math.max(entry.settled ?? 0, 1),
      }));
      const statement = [
        `U16: ${k} of ${samples.length} opens mounted a viewer dock header more than once, ${rebuilt} of them rebuilt one the settled page holds, ${painted} mounted in more than one frame; ${warm} were warm (workspace chunk from the HTTP cache), ${failed} failed to sample`,
        ...perSample.map((entry) =>
          entry.error === undefined
            ? `sample ${entry.sample} (${entry.warm === true ? 'warm' : 'not warm'}): ${String(entry.mounts)} mounts in frames ${(entry.frames ?? []).join(', ') || 'none'}, ${String(entry.settled)} settled, rebuilt ${String(entry.rebuilt)}`
            : `sample ${entry.sample}: not sampled (${entry.error})`,
        ),
      ];
      const report = {
        defect: 'U16',
        k,
        rebuilt,
        painted,
        warm,
        failed,
        n: samples.length,
        statement,
        samples: perSample,
      };
      await target.writeArtifact('project-load-frames/u16-report.json', `${JSON.stringify(report, null, 2)}\n`);
    };
    for (let sample = 1; sample <= warmOpens; sample += 1) {
      try {
        await target.reload();
        await settleProject();
        const record = await readProjectLoad();
        const warm = await target.evaluate((pattern) => {
          const chunk = performance
            .getEntriesByType('resource')
            .find((entry) => new RegExp(pattern, 'u').test(entry.name)) as PerformanceResourceTiming | undefined;
          return chunk?.transferSize === 0 && chunk.decodedBodySize > 0;
        }, workspaceChunk);
        samples.push({
          sample,
          warm,
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
      await writeReport();
    }
    expect(samples).toHaveLength(warmOpens);
  },
);

/*
 * A15a and A15f frame rows (loading states UX blueprint, § Red-first tests, frame level), on A0.10's recorder. They
 * land after A0.10 so later lanes only flip (blueprint, § Hot files). F11 is not here: S-nav took its root-loader
 * half (`root-revalidation.spec.ts`) and A15b adds its destination-frame half (programme control, 2026-11-13T14:40Z).
 * A row whose fix has landed (F9, F10 and F12, through A15f) asserts as a plain passing row; every other row stands as
 * an expected failure, and its title names the lane that flips it. Each watches named regions frame by frame
 * (`regions`), so a failure names the frame, the region and what it drew.
 */

/** A row's defect assertion, with what was measured in its message, so a failure names every frame it counted. */
const expectMeasured = <Value>(actual: Value, message: string, expected: Value): void => {
  expect(actual, `${message}: ${JSON.stringify(actual)}`).toEqual(expected);
};

/** A region's entries in one record. */
const regionsOf = (record: ProjectLoadRecord, name: string): readonly ProjectLoadRegionEntry[] =>
  record.regions[name] ?? [];

const describeEntry = (entry: ProjectLoadRegionEntry): string =>
  entry.present
    ? `${describeFrame(entry)}: node ${entry.node} at ${entry.x},${entry.y} ${entry.width}x${entry.height}${entry.skeletons > 0 ? `, ${entry.skeletons} skeletons` : ''}${entry.animations > 0 ? `, ${entry.animations} animations` : ''}${entry.text === '' ? '' : ` "${entry.text.slice(0, 40)}"`}`
    : `${describeFrame(entry)}: absent`;

/**
 * The spans a region was shown in: present, visible and with words. `to` is `Infinity` while still shown. `longest`
 * bounds how long the span can have been on screen: from the frame before its first shown frame to its first hidden
 * frame, since a reveal or a hide lands between two sampled frames (`frameTimes`, when recorded).
 */
const shownSpans = (
  entries: readonly ProjectLoadRegionEntry[],
  frameTimes: readonly number[] = [],
): Array<{ readonly from: number; readonly to: number; readonly frame: number; readonly longest: number }> => {
  const spans: Array<{ from: number; to: number; frame: number; longest: number }> = [];
  let open: ProjectLoadRegionEntry | undefined;
  const close = (start: ProjectLoadRegionEntry, to: number): void => {
    const before = frameTimes[start.frame - 2] ?? start.t;
    spans.push({ from: start.t, to, frame: start.frame, longest: to - before });
  };
  for (const entry of entries) {
    const shown = entry.present && entry.visible && entry.text !== '';
    if (shown && open === undefined) {
      open = entry;
    } else if (!shown && open !== undefined) {
      close(open, entry.t);
      open = undefined;
    }
  }
  if (open !== undefined) {
    close(open, Number.POSITIVE_INFINITY);
  }
  return spans;
};

/** Two boxes are the same within 1 px. */
const sameBox = (left: ProjectLoadRegionEntry, right: ProjectLoadRegionEntry): boolean =>
  left.present === right.present &&
  Math.abs(left.x - right.x) <= 1 &&
  Math.abs(left.y - right.y) <= 1 &&
  Math.abs(left.width - right.width) <= 1 &&
  Math.abs(left.height - right.height) <= 1;

/** The entries of a region whose box differs from its settled box, from its first frame on. */
const boxChanges = (entries: readonly ProjectLoadRegionEntry[]): string[] => {
  const settled = entries.at(-1);
  return settled === undefined
    ? []
    : entries.filter((entry) => !sameBox(entry, settled)).map((entry) => describeEntry(entry));
};

/** The element that holds the workspace's lanes: the placeholder, then the workspace; one frame from A15b on. */
const workspaceFrame = '[data-slot="workspace-frame"], [data-testid="workspace-skeleton"], [data-project-workspace]';
/** The chat lane, by the history region it holds. */
const chatLane = '[data-slot="floating-panel"]:has([role="region"][aria-label="Chat history"])';
/** The entry chunk every page loads first: holding it holds hydration. */
const entryChunk = String.raw`/assets/entry\.client-[\w-]+\.js(?:\?|$)`;
/** The code editor's runtime chunk (`code-editor-view.client.tsx`). */
const editorRuntimeChunk = String.raw`/assets/code-editor-view\.client-[\w-]+\.js(?:\?|$)`;
const richComposer = '[aria-label="Ask Tau to build anything..."][contenteditable="true"]';
/** The served composer's input on any route, before or after hydration. */
const anyComposerInput = 'textarea[aria-label="Chat message"], [aria-label="Ask Tau to build anything..."]';

/** The regions F1 to F3 watch at wide size. */
const wideFrameRegions = {
  content: '[data-slot="sidebar-inset"]',
  workspaceFrame,
  skeletonLanes: '[data-slot="workspace-skeleton-lanes"]',
  lanes: '[data-project-workspace] .split-view',
} as const;
/**
 * The workspace's lanes, whatever draws them: the placeholder's lane columns, then the split view's panes. A lane that
 * draws the workspace frame of A15b differently re-points this selector in the same PR.
 */
const workspaceLanes = {
  lanes:
    '[data-slot="workspace-skeleton-lanes"] > div, [data-project-workspace] .split-view > .split-view-container > .split-view-view',
} as const;

/** Drag the sash between the chat and the viewer by `dx` pixels, as a person resizes the chat lane. */
const resizeChatLane = async (dx: number): Promise<void> => {
  const sash = selectors.getByRole('separator', { name: 'Resize Chat and Viewer' }).first();
  await target.expectVisible(sash, 60_000);
  const box = await target.boundingBox(sash);
  precondition(box !== undefined, 'the chat lane sash has no box');
  const x = box!.x + box!.width / 2;
  const y = box!.y + box!.height / 2;
  await target.mouseMove(x, y);
  await target.mouseDown();
  await target.mouseMove(x + dx, y, { steps: 8 });
  await target.mouseUp();
};

/** The lanes' boxes on the settled page, as the recorder keeps them. */
const readLanesNow = async (): Promise<ProjectLoadBox[]> =>
  target.evaluate(
    (selector) =>
      [...document.querySelectorAll(selector)]
        .filter((node) => node.checkVisibility())
        .map((node) => node.getBoundingClientRect())
        .filter((rect) => rect.width > 0 && rect.height > 0)
        .map((rect) => ({
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        }))
        .toSorted((left, right) => left.x - right.x || left.y - right.y),
    workspaceLanes.lanes,
  );

const describeBoxes = (boxes: readonly ProjectLoadBox[]): string =>
  boxes.map((box) => `${box.x}+${box.width}`).join(', ') || 'none';

/** Two lane sets are the same: as many lanes, each at the same x and width within 1 px. */
const sameLanes = (left: readonly ProjectLoadBox[], right: readonly ProjectLoadBox[]): boolean =>
  left.length === right.length &&
  left.every((box, index) => Math.abs(box.x - right[index]!.x) <= 1 && Math.abs(box.width - right[index]!.width) <= 1);

/** Every recorded lane set that differs from the settled one, from the first frame that drew a lane. */
const laneMismatches = (record: ProjectLoadRecord, settled: readonly ProjectLoadBox[]): string[] =>
  (record.boxSets['lanes'] ?? [])
    .filter((entry) => entry.boxes.length > 0 && !sameLanes(entry.boxes, settled))
    .map((entry) => `${describeFrame(entry)}: lanes ${describeBoxes(entry.boxes)}`);

type ClosedWorkbenchLoad = {
  readonly record: ProjectLoadRecord;
  readonly settled: readonly ProjectLoadBox[];
};

/**
 * F1 to F3 share one forced load: a workbench-closed project whose chat lane is not at its default width, reloaded
 * with the workspace chunk 3 s late. Measured once per run, by whichever of the three runs first.
 */
let closedWorkbenchLoad: Promise<ClosedWorkbenchLoad> | undefined;
const measureClosedWorkbenchLoad = async (): Promise<ClosedWorkbenchLoad> => {
  closedWorkbenchLoad ??= (async () => {
    await seedProjects('wide', { regions: wideFrameRegions, boxSets: workspaceLanes });
    const toggle = selectors.getByRole('button', { name: 'Toggle Workbench lane' }).first();
    await target.expectAttribute(toggle, 'aria-pressed', 'true', 60_000);
    await target.click(toggle);
    await target.expectAttribute(toggle, 'aria-pressed', 'false');
    await resizeChatLane(120);
    /* The closed lane and the chat's width are persisted before the measured load. */
    await target.delay(settleWindow);
    const chatWidth = await target.evaluate(
      (selector) => Math.round(document.querySelector(selector)?.getBoundingClientRect().width ?? 0),
      chatLane,
    );
    await delayWorkspaceChunk();
    await target.reload();
    await settleProject();
    await requireChunkDelayed('F1 to F3');
    await target.expectAttribute(toggle, 'aria-pressed', 'false', 60_000);
    const settled = await readLanesNow();
    const settledChatWidth = await target.evaluate(
      (selector) => Math.round(document.querySelector(selector)?.getBoundingClientRect().width ?? 0),
      chatLane,
    );
    const record = await keepRecord('f1-f3-wide', { settled, chatWidth, settledChatWidth });
    precondition(settled.length === 2, `F1 to F3: the settled page drew ${describeBoxes(settled)}, not two lanes`);
    precondition(
      Math.abs(settledChatWidth - chatWidth) <= 1,
      `F1 to F3: the chat lane came back ${settledChatWidth} px wide, not the ${chatWidth} px it was left at`,
    );
    precondition(
      Object.keys(record.dropped).every((key) => !key.startsWith('region:')),
      `F1 to F3: the record dropped entries past its frame limit: ${JSON.stringify(record.dropped)}`,
    );
    return { record, settled };
  })();
  return closedWorkbenchLoad;
};

knownDefect(
  'F1 (A15b): with the workspace chunk 3 s late, the content region draws no skeleton and every lane is at its final box from its first frame',
  {
    artifact: 'f1-wide',
    expectedFailure: true,
    budget: loadBudget,
    measure: measureClosedWorkbenchLoad,
    assert: ({ record, settled }) => {
      const skeletons = regionsOf(record, 'content').filter((entry) => entry.skeletons > 0);
      expectMeasured(
        {
          skeletons: skeletons.slice(0, 5).map((entry) => describeEntry(entry)),
          lanes: laneMismatches(record, settled).slice(0, 5),
        },
        `F1: the content region drew [data-slot=skeleton] blocks in ${skeletons.length} region changes, or lanes other than the settled ${describeBoxes(settled)}`,
        { skeletons: [], lanes: [] },
      );
    },
  },
);

knownDefect(
  'F2 (A15b): with the workspace chunk 3 s late, one workspace frame element is created and never removed, and no workspace placeholder exists',
  {
    artifact: 'f2-wide',
    expectedFailure: true,
    budget: loadBudget,
    measure: measureClosedWorkbenchLoad,
    assert: ({ record }) => {
      const mounts = record.regionMounts['workspaceFrame'] ?? [];
      const removals = record.regionRemovals['workspaceFrame'] ?? [];
      expectMeasured(
        { mounts: mounts.length, removals: removals.length, placeholders: record.placeholders.length },
        `F2: the workspace frame (${workspaceFrame}) was created in ${describeFrames(mounts)} and removed before ${describeFrames(removals) || 'no frame'}; [data-testid=workspace-skeleton] was created ${record.placeholders.length} times`,
        { mounts: 1, removals: 0, placeholders: 0 },
      );
    },
  },
);

knownDefect(
  'F3 (A15b): with the workspace chunk 3 s late, no lane container runs an animation and the first lanes drawn are the final ones',
  {
    artifact: 'f3-wide',
    expectedFailure: true,
    budget: loadBudget,
    measure: measureClosedWorkbenchLoad,
    assert: ({ record, settled }) => {
      const animated = (['workspaceFrame', 'skeletonLanes', 'lanes'] as const).flatMap((name) =>
        regionsOf(record, name)
          .filter((entry) => entry.animations > 0)
          .map((entry) => `${name} ${describeEntry(entry)}`),
      );
      const first = (record.boxSets['lanes'] ?? []).find((entry) => entry.boxes.length > 0);
      expectMeasured(
        {
          animated: animated.slice(0, 5),
          firstLanes: first === undefined ? 'none' : describeBoxes(first.boxes),
        },
        `F3: a lane container ran an animation, or the first lanes (${first === undefined ? 'none' : describeFrame(first)}) were not the settled ones`,
        { animated: [], firstLanes: describeBoxes(settled) },
      );
    },
  },
);

/** The sidebar's resting-width stand-in: a slab with the sidebar's background that is not the sidebar itself. */
const findSidebarStandIns = (html: Document): string[] =>
  [...html.querySelectorAll('[class~="bg-sidebar"]')]
    /* Not the sidebar, and not a bar fixed to the window's edge (the phone's), which no sidebar width can stand for. */
    .filter((node) => node.closest('[data-slot="sidebar"]') === null && !node.classList.contains('fixed'))
    .map((node) => `${node.tagName.toLowerCase()}.${node.className.split(' ').slice(0, 6).join('.')}`);

knownDefect('F4 (A11, A15b): with the sidebar closed, the server HTML for a project draws no sidebar stand-in', {
  artifact: 'f4-wide',
  expectedFailure: true,
  budget: loadBudget,
  measure: async () => {
    const { path } = await seedProjects('wide');
    await target.addCookies([{ domain: 'localhost', name: 'tau-shell-op-sidebar', path: '/', value: '0' }]);
    const server = await target.evaluate(async (url) => {
      const response = await fetch(url, { credentials: 'same-origin' });
      const text = await response.text();
      return { status: response.status, text };
    }, path);
    precondition(server.status === 200, `F4: the project document answered ${server.status}`);
    const html = new DOMParser().parseFromString(server.text, 'text/html');
    precondition(html.querySelector('main, [data-slot]') !== null, 'F4: the server HTML has no rendered body');
    const standIns = findSidebarStandIns(html);
    await target.writeArtifact('project-load-frames/f4-wide.json', `${JSON.stringify({ standIns }, null, 2)}\n`);
    return standIns;
  },
  assert: (standIns) => {
    expectMeasured(standIns, 'F4: the server HTML, with tau-shell-op-sidebar=0, draws a sidebar stand-in', []);
  },
});

/** The phone frame's four parts (blueprint P-h). */
const phoneFrameRegions = {
  topBar: '[data-slot="mobile-project-top-bar"]',
  viewer: '[data-slot="viewer-stage"]',
  sheet: '[role="dialog"]:has([aria-label="Drawer height"])',
  tabBar: 'nav[aria-label="Workbench"]',
} as const;

knownDefect(
  'F5 (A15c): on a 390 by 844 reload with the workspace chunk 3 s late, the top bar, viewer, sheet and tab bar hold their final boxes from the first frame, with no skeleton and no sheet animation',
  {
    artifact: 'f5-phone',
    expectedFailure: true,
    budget: loadBudget,
    measure: async () => {
      await seedProjects('phone', { regions: phoneFrameRegions });
      await delayWorkspaceChunk();
      await target.reload();
      await settleProject();
      await requireChunkDelayed('F5');
      const record = await keepRecord('f5-phone');
      precondition(
        regionsOf(record, 'tabBar').at(-1)?.present === true,
        'F5: the settled page has no Workbench tab bar',
      );
      return record;
    },
    assert: (record) => {
      const moved = Object.keys(phoneFrameRegions).flatMap((name) =>
        boxChanges(regionsOf(record, name)).map((change) => `${name} ${change}`),
      );
      const sheetAnimations = regionsOf(record, 'sheet').filter((entry) => entry.animations > 0);
      expectMeasured(
        {
          moved: moved.slice(0, 6),
          skeletonFrames: record.skeletonFrames.length,
          sheetAnimations: sheetAnimations.map((entry) => describeEntry(entry)),
        },
        'F5: a part of the phone frame was absent or away from its settled box, a skeleton was drawn, or the sheet animated',
        { moved: [], skeletonFrames: 0, sheetAnimations: [] },
      );
    },
  },
);

/** The chat lane's parts F6, F13 and the composer read. */
const chatLaneRegions = {
  lane: chatLane,
  emptyState: '[role="region"][aria-label="Chat history"] [data-slot="panel-empty-state"]',
  indicator: `${chatLane} [data-slot="wait-indicator-body"]`,
} as const;

/** F6 and F13: a chat with a transcript, reloaded with the agent host's script held 3 s. */
const measureHeldTranscript = async (label: string): Promise<ProjectLoadRecord> => {
  const { chatId } = await seedProjects('wide', { watchText: finalReply, regions: chatLaneRegions, frameTimes: true });
  await seedTranscriptWithTray(chatId);
  await delayRequests(agentHostWorker, readDelay);
  await target.reload();
  await settleProject();
  await target.delay(readDelay);
  await target.expectVisible(selectors.getByText(finalReply, { exact: true }), 60_000);
  const record = await keepRecord(label);
  const held = await readDelayedRequests();
  precondition(
    held.some((url) => new RegExp(agentHostWorker, 'u').test(url)),
    `${label}: the agent host worker was never delayed`,
  );
  precondition(
    record.textFirstFrame !== undefined && record.textFirstFrame.t >= readDelay,
    `${label}: the transcript was shown at ${String(record.textFirstFrame?.t)} ms, before the ${readDelay} ms hold could end`,
  );
  return record;
};

knownDefect(
  'F6 (A12, A15d): with the agent host 3 s late, the chat lane shows no empty state or skeleton, its header indicator shows from 1,000 ms for at least 500 ms, and the composer keeps its box',
  {
    artifact: 'f6-wide',
    expectedFailure: true,
    budget: turnBudget,
    measure: async () => measureHeldTranscript('f6-wide'),
    assert: (record) => {
      const empty = regionsOf(record, 'emptyState').filter((entry) => entry.present);
      const skeletons = regionsOf(record, 'lane').filter((entry) => entry.skeletons > 0);
      const shown = shownSpans(regionsOf(record, 'indicator'), record.frameTimes);
      const [first] = record.composer;
      const composerChanges = record.composer.filter((entry) => entry.height !== first?.height || entry.y !== first.y);
      expectMeasured(
        {
          emptyState: empty.slice(0, 3).map((entry) => describeEntry(entry)),
          skeletons: skeletons.slice(0, 3).map((entry) => describeEntry(entry)),
          indicatorShown: shown.length > 0,
          indicatorEarly: shown.filter((span) => span.from < 1000).map((span) => span.from),
          indicatorShort: shown.filter((span) => span.longest < 500).map((span) => span.longest),
          composer: composerChanges.map((entry) => `${describeFrame(entry)}: y ${entry.y}, ${entry.height} px`),
        },
        `F6: the chat lane's states during the held transcript (composer first ${first === undefined ? 'absent' : `y ${first.y}, ${first.height} px`})`,
        {
          emptyState: [],
          skeletons: [],
          indicatorShown: true,
          indicatorEarly: [],
          indicatorShort: [],
          composer: [],
        },
      );
    },
  },
);

knownDefect(
  'F7 (A15d): text typed at first paint on a project URL, with the entry chunk 2 s late, is in the composer after hydration with its caret and focus, and the composer never moved',
  {
    artifact: 'f7-wide',
    expectedFailure: true,
    budget: loadBudget,
    measure: async () => {
      const { path } = await seedProjects('wide');
      await target.navigate('/');
      await target.expectVisible(composer, 60_000);
      await delayRequests(entryChunk, 2000);
      const early = await openBeforeHydration({
        path,
        input: anyComposerInput,
        hydrated: richComposer,
        text: 'abc',
        wait: 1500,
        settle: 0,
      });
      await settleProject();
      const held = await readDelayedRequests();
      precondition(
        held.some((url) => new RegExp(entryChunk, 'u').test(url)),
        'F7: the entry chunk was never delayed',
      );
      const after = await target.evaluate((selector) => {
        const editor = document.querySelector(selector);
        const selection = getSelection();
        let caret: number | undefined;
        if (editor && selection && selection.rangeCount > 0 && editor.contains(selection.focusNode)) {
          const range = document.createRange();
          range.setStart(editor, 0);
          range.setEnd(selection.focusNode!, selection.focusOffset);
          caret = range.toString().length;
        }
        return {
          text: editor?.textContent.trim() ?? '',
          caret,
          focused: editor?.contains(document.activeElement) === true,
        };
      }, richComposer);
      const record = await keepRecord('f7-wide', { early: { ...early, before: undefined, after: undefined }, after });
      return { early, after, record };
    },
    assert: ({ early, after, record }) => {
      const [first] = record.composer;
      const moved = record.composer.filter((entry) => entry.y !== first?.y || entry.height !== first.height);
      expectMeasured(
        {
          servedInput: early.found && !early.hydratedBeforeAct,
          text: after.text,
          caret: after.caret,
          focused: after.focused,
          composerMoves: moved.map((entry) => `${describeFrame(entry)}: y ${entry.y}, ${entry.height} px`),
        },
        'F7: the served page had no composer to type in before hydration, or the typing was not adopted in place',
        { servedInput: true, text: 'abc', caret: 3, focused: true, composerMoves: [] },
      );
    },
  },
);

/** The viewer stage's parts F8 reads. */
const viewerRegions = {
  preparing: '[aria-label="Preparing model"]',
  canvas: '[data-slot="viewer-canvas-region"] canvas',
  pill: '[data-slot="viewer-stage"] [data-slot="wait-indicator-body"]',
} as const;

/** The first file check: the revision status that reports the tree filled, delivered 3 s late. */
const filledStatus: WorkerReadDelay = { method: 'revisionStatus', path: '^"filled"$', milliseconds: readDelay };

knownDefect(
  'F8 (A14, A15e): with the first file check 3 s late, no "Preparing model" block shows, one canvas is created at a real size, and the pill shows from 1,000 ms',
  {
    artifact: 'f8-wide',
    expectedFailure: true,
    budget: loadBudget,
    measure: async () => {
      await seedProjects('wide', { regions: viewerRegions });
      await armWorkerReadDelay([filledStatus]);
      await target.reload();
      await settleProject();
      await target.delay(readDelay);
      await target.expectVisible(selectors.getByCss(viewerRegions.canvas), 60_000);
      const record = await keepRecord('f8-wide');
      await requireReadDelayed('F8', filledStatus);
      return record;
    },
    assert: (record) => {
      const preparing = regionsOf(record, 'preparing').filter((entry) => entry.present);
      const canvases = record.regionMounts['canvas'] ?? [];
      const firstCanvas = regionsOf(record, 'canvas').find((entry) => entry.present);
      const pill = shownSpans(regionsOf(record, 'pill'));
      expectMeasured(
        {
          preparing: preparing.slice(0, 3).map((entry) => describeEntry(entry)),
          canvases: canvases.length,
          defaultSize: firstCanvas?.width === 300 && firstCanvas.height === 150,
          pillShown: pill.length > 0,
          pillEarly: pill.filter((span) => span.from < 1000).map((span) => span.from),
        },
        `F8: the viewer stage during the held file check (canvases created in ${describeFrames(canvases) || 'no frame'})`,
        { preparing: [], canvases: 1, defaultSize: false, pillShown: true, pillEarly: [] },
      );
    },
  },
);

/** The source pane's parts F9 reads: the pane, and its text (placeholder text, then the editor's lines). */
const sourcePaneRegions = {
  pane: '[data-slot="editor-pane-placeholder"], .cm-editor',
  text: '[data-slot="editor-pane-text"], .cm-content',
} as const;

/** F9: the entry file's read, delivered 500 ms late so its arrival has a time. */
const entryRead: WorkerReadDelay = { method: 'readFileWithDigest', path: String.raw`^alpha\.ts$`, milliseconds: 500 };

knownDefect(
  'F9 (A15f): with the editor runtime 3 s late and the code pane open, the file text shows within 100 ms of its read, with no skeleton, and the pane and its first line hold still when the editor mounts',
  {
    artifact: 'f9-wide',
    expectedFailure: false,
    budget: loadBudget,
    measure: async () => {
      await seedProjects('wide', { openEntry: true, regions: sourcePaneRegions, frameTimes: true });
      /* The Editor's tab for the entry file is the workbench's; the first `alpha.ts` tab is the viewer's. */
      await target.click(selectors.getByRole('tab', { name: 'alpha.ts', exact: true }).last());
      await target.expectVisible(selectors.getByCss('.cm-content'), 60_000);
      /* The open source tab is persisted before the measured load. */
      await target.delay(settleWindow);
      await delayRequests(editorRuntimeChunk, chunkDelay);
      await armWorkerReadDelay([entryRead]);
      await target.reload();
      await settleProject();
      await target.expectVisible(selectors.getByCss('.cm-content'), 60_000);
      await target.delay(settleWindow);
      const record = await keepRecord('f9-wide');
      const held = await readDelayedRequests();
      precondition(
        held.some((url) => new RegExp(editorRuntimeChunk, 'u').test(url)),
        'F9: the editor runtime was never delayed',
      );
      const deliveries = await readWorkerDeliveries();
      await requireReadDelayed('F9', entryRead);
      const read = deliveries.find(
        (entry) => entry.method === entryRead.method && (entry.path ?? '').endsWith('alpha.ts'),
      );
      const texts = regionsOf(record, 'text');
      const shown = texts.find((entry) => entry.present && entry.visible && entry.text !== '');
      precondition(shown !== undefined, 'F9: the file text never showed');
      const mounted = texts.find((entry) => entry.present && entry.node > 1);
      precondition(
        mounted !== undefined && mounted.t >= chunkDelay,
        `F9: the editor mounted at ${String(mounted?.t)} ms, before the ${chunkDelay} ms hold could end`,
      );
      return { record, readAt: read!.t, shown: shown!, mounted: mounted! };
    },
    assert: ({ record, readAt, shown, mounted }) => {
      /* The frame before the text showed was painted less than 100 ms after the read: no frame later lacked it. */
      const before = record.frameTimes[shown.frame - 2];
      const panes = regionsOf(record, 'pane').filter((entry) => entry.present);
      const atMount = panes.find((entry) => entry.t >= mounted.t);
      const paneMoves = panes.filter(
        (entry) => entry.t >= shown.t && entry.t <= mounted.t && atMount !== undefined && !sameBox(entry, atMount),
      );
      const glyphs = regionsOf(record, 'text').filter(
        (entry) => entry.present && entry.glyph !== undefined && entry.t >= shown.t && entry.t <= mounted.t,
      );
      const mountedGlyph = mounted.glyph;
      const lineMoves = glyphs.filter(
        (entry) =>
          mountedGlyph === undefined ||
          Math.abs(entry.glyph!.x - mountedGlyph.x) > 1 ||
          Math.abs(entry.glyph!.y - mountedGlyph.y) > 1,
      );
      const skeletons = [...panes, ...regionsOf(record, 'text')].filter((entry) => entry.skeletons > 0);
      expectMeasured(
        {
          textWithin100: before !== undefined && before < readAt + 100,
          skeletons: skeletons.map((entry) => describeEntry(entry)),
          paneMoves: paneMoves.map((entry) => describeEntry(entry)),
          lineMoves: lineMoves.map(
            (entry) => `${describeEntry(entry)} first glyph ${entry.glyph!.x},${entry.glyph!.y}`,
          ),
        },
        `F9: the file was read at ${readAt} ms; the frame before its text was at ${String(before)} ms and the text showed in ${describeEntry(shown)}; the editor mounted in ${describeEntry(mounted)}`,
        { textWithin100: true, skeletons: [], paneMoves: [], lineMoves: [] },
      );
    },
  },
);

/** The History pane's body. */
const historyRegions = {
  history: '[data-slot="revisions-panel-body"]',
  historyIndicator: '[data-slot="revisions-panel-body"] [data-slot="wait-indicator-body"]',
} as const;
const historyChip = selectors.getByRole('button', { name: /^Open History\./u });

/** A delay on History's own read of the line (`log`). */
const historyRead = (milliseconds: number): WorkerReadDelay => ({ method: 'revision:log', path: '', milliseconds });

knownDefect('F10 (A15f): with the History read 2 s late and History open, the pane draws no skeleton', {
  artifact: 'f10-wide',
  expectedFailure: false,
  budget: loadBudget,
  measure: async () => {
    await seedProjects('wide', { regions: historyRegions });
    await target.click(historyChip);
    await target.expectVisible(selectors.getByCss('[data-slot="revisions-panel-body"]'), 60_000);
    /* History stays open across the measured load. */
    await target.delay(settleWindow);
    await armWorkerReadDelay([historyRead(2000)]);
    await target.reload();
    await settleProject();
    await target.delay(2000);
    const record = await keepRecord('f10-wide');
    await requireReadDelayed('F10', historyRead(2000));
    precondition(
      regionsOf(record, 'history').some((entry) => entry.present),
      'F10: History was not open on the measured load',
    );
    return record;
  },
  assert: (record) => {
    const skeletons = regionsOf(record, 'history').filter((entry) => entry.skeletons > 0);
    expectMeasured(
      skeletons.map((entry) => describeEntry(entry)),
      'F10: History drew [data-slot=skeleton] blocks',
      [],
    );
  },
});

/**
 * F12 on a wait a person starts: opening a file from the Files tree with its read held, so the clock starts at the
 * click. The blueprint names the chat lane, whose indicator A15d adds; the source pane's "Opening file" is the
 * indicator on `main` today (A15f), so the ladder is asserted there.
 */
const openedFile = 'notes.ts';
const openedFileRegions = {
  fileIndicator: `[role="region"][aria-label="${openedFile}"] [data-slot="wait-indicator-body"]`,
  text: `[role="region"][aria-label="${openedFile}"] :is([data-slot="editor-pane-text"], .cm-content)`,
} as const;
const measureSourceOpen = async (
  label: string,
  milliseconds: number,
): Promise<{ readonly record: ProjectLoadRecord; readonly click: ProjectLoadFrame; readonly answeredAt: number }> => {
  const read: WorkerReadDelay = { method: 'readFileWithDigest', path: String.raw`^notes\.ts$`, milliseconds };
  await seedProjects('wide', { regions: openedFileRegions, frameTimes: true });
  await writeWorkbenchFile(openedFile, 'export const note = "A file no pane has read yet.";\n');
  await armWorkerReadDelay([read]);
  await target.reload();
  await settleProject();
  if (!(await target.isVisible(filesPane()))) {
    await target.click(selectors.getByRole('button', { name: /Search/u }));
    const search = selectors.getByPlaceholder('Search projects, chats, and actions…');
    await target.expectVisible(search, 15_000);
    await target.fill(search, 'Open files');
    await target.click(selectors.getByText('Open files', { exact: true }));
  }
  const entry = treeItem(openedFile);
  await target.expectVisible(entry, 60_000);
  await markProjectLoad('click');
  await target.click(entry);
  await target.expectVisible(selectors.getByCss(openedFileRegions.text), 60_000);
  await target.delay(milliseconds + settleWindow);
  const record = await keepRecord(label);
  const click = record.marks.find((mark) => mark.name === 'click');
  precondition(click !== undefined, `${label}: the click was not marked`);
  const deliveries = await readWorkerDeliveries();
  const late = deliveries.filter(
    (delivery) =>
      delivery.method === read.method &&
      delivery.path === openedFile &&
      delivery.sentAt >= click!.t &&
      delivery.t - delivery.sentAt >= milliseconds - 20,
  );
  precondition(late.length > 0, `${label}: no read of ${openedFile} sent after the click was answered late`);
  return { record, click: click!, answeredAt: Math.min(...late.map((delivery) => delivery.t)) };
};

knownDefect('F12 (A15f): a file opened from the tree with its read 600 ms late shows no wait indicator', {
  artifact: 'f12-600-wide',
  expectedFailure: false,
  budget: loadBudget,
  measure: async () => measureSourceOpen('f12-600-wide', 600),
  assert: ({ record, click }) => {
    const shown = shownSpans(regionsOf(record, 'fileIndicator')).filter((span) => span.from >= click.t);
    expectMeasured(
      shown.map((span) => `from ${span.from - click.t} ms after the click`),
      'F12: a 600 ms wait drew its indicator',
      [],
    );
  },
});

knownDefect(
  'F12 (A15f): a file opened from the tree with its read 1,100 ms late shows its indicator from 1,000 ms after the click for at least 500 ms',
  {
    artifact: 'f12-1100-wide',
    expectedFailure: false,
    budget: loadBudget,
    measure: async () => measureSourceOpen('f12-1100-wide', 1100),
    assert: ({ record, click, answeredAt }) => {
      const shown = shownSpans(regionsOf(record, 'fileIndicator'), record.frameTimes).filter(
        (span) => span.from >= click.t,
      );
      const [first] = shown;
      const text = regionsOf(record, 'text').find((entry) => entry.present && entry.text !== '' && entry.t >= click.t);
      expectMeasured(
        {
          spans: shown.length,
          revealAfterClick: first === undefined ? undefined : first.from - click.t >= 1000,
          revealBeforeAnswer: first === undefined ? undefined : first.from <= answeredAt + 20,
          heldMinimum: first === undefined ? undefined : first.longest >= 500,
          textAtAnswer: text === undefined ? undefined : text.t - answeredAt < 200,
        },
        `F12: after the click at ${click.t} ms the indicator showed ${shown.map((span) => `${span.from}-${span.to}`).join(', ') || 'never'}; the read answered at ${answeredAt} ms and the text showed at ${String(text?.t)} ms`,
        { spans: 1, revealAfterClick: true, revealBeforeAnswer: true, heldMinimum: true, textAtAnswer: true },
      );
    },
  },
);

knownDefect(
  'F13 (A15d): under reduced motion, with the agent host 3 s late, the chat lane indicator has words and runs no animation',
  {
    artifact: 'f13-wide',
    expectedFailure: true,
    budget: turnBudget,
    measure: async () => {
      await target.emulateReducedMotion('reduce');
      return measureHeldTranscript('f13-wide');
    },
    assert: (record) => {
      const indicator = regionsOf(record, 'indicator').filter((entry) => entry.present && entry.visible);
      expectMeasured(
        {
          shownWithWords: indicator.some((entry) => entry.text !== ''),
          animated: indicator.filter((entry) => entry.subtreeAnimations > 0).map((entry) => describeEntry(entry)),
        },
        'F13: the chat lane indicator under reduced motion',
        { shownWithWords: true, animated: [] },
      );
    },
  },
);

knownDefect('F15 (A15b): a project at its default layout draws its lanes at their final boxes from the first frame', {
  artifact: 'f15-wide',
  expectedFailure: true,
  budget: loadBudget,
  measure: async () => {
    await seedProjects('wide', { boxSets: workspaceLanes });
    await target.reload();
    await settleProject();
    const settled = await readLanesNow();
    const record = await keepRecord('f15-wide', { settled });
    precondition(settled.length === 3, `F15: the settled page drew ${describeBoxes(settled)}, not three lanes`);
    return { record, settled };
  },
  assert: ({ record, settled }) => {
    expectMeasured(
      laneMismatches(record, settled).slice(0, 5),
      `F15: lanes other than the settled ${describeBoxes(settled)}`,
      [],
    );
  },
});
