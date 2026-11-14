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
  readLaneBordersNow,
  readWorkerDeliveries,
  readWorkerReads,
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
  options: { readonly laneBorders?: boolean; readonly watchText?: string; readonly agentHost?: boolean } = {},
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
  expectedFailure: false,
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
  expectedFailure: false,
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
    expectedFailure: false,
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
