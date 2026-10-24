/**
 * The live link between `tau mcp` and the viewer pages it serves (agent plugin UI blueprint W6).
 *
 * A page long-polls `app_sync`: it reports what the person sees and hears of models `show_model` handed over and of
 * captures the agent waits for. `view_state` reads the page the person used last and, when asked, has that page
 * capture its live view. Everything lives in memory for one server process.
 *
 * One process can serve several conversations (Claude Desktop runs one configured server for all of them). A call
 * that names its conversation scopes what it touches: a show reaches the pages of that conversation, and `view_state`
 * reads only them. A page or call without a scope (the loopback page, a host that names no conversation) shares the
 * process scope with everyone.
 *
 * A source the server watches (`mcp-entry-sessions.ts`) renders again whenever its files or parameters change: each
 * newer render reaches the pages that show that source, in any conversation, and the pages that follow it; its build
 * status rides every answer to those pages.
 */

import { randomUUID } from 'node:crypto';

import type { TauMcpViewerFailure } from '@taucad/mcp';
import { tauViewerAcceptedViewFields } from '@taucad/mcp/viewer-protocol';
import type {
  TauViewerCaptureReplyInput,
  TauViewerImage,
  TauViewerPoseCommand,
  TauViewerShowResult,
  TauViewerEntryStatus,
  TauViewerSyncInput,
  TauViewerSyncResult,
  TauViewerViewState,
} from '@taucad/mcp/viewer-protocol';

/** Timing knobs; tests shorten them. */
export type McpViewerSessionsOptions = Readonly<{
  /** How long a waiting `app_sync` is held before it answers unchanged. Milliseconds. */
  hold?: number;
  /** How long after its last sync a page still counts as open. Milliseconds. */
  live?: number;
  /** How long `view_state` waits for a capture. Milliseconds. */
  captureTimeout?: number;
  now?: () => number;
}>;

/** What `view_state` returns. */
export type McpViewerViewStateResult = Readonly<{
  view: TauViewerViewState;
  image?: TauViewerImage;
  captureError?: string;
}>;

/** The conversation a call belongs to, and its cancellation. */
export type McpViewerCallContext = Readonly<{
  /** The conversation the host named for the call; `undefined` is the process scope every conversation shares. */
  scope?: string | undefined;
  signal?: AbortSignal | undefined;
}>;

/** A page's sync, with the watched source the model it reports was rendered from. */
export type McpViewerSyncContext = McpViewerCallContext &
  Readonly<{
    /** The watched source's key, when the page's reported model is one of its renders. */
    entry?: string | undefined;
  }>;

/** The sessions of one server process. */
export type McpViewerSessions = Readonly<{
  /**
   * A model was shown in `scope`: pages of that conversation that follow `show_model` switch to it.
   *
   * @param result - What `show_model` answered.
   * @param scope - The conversation it was shown in, when the host names one.
   * @param entry - The watched source's key, when the model is one of its renders.
   */
  shown(result: TauViewerShowResult, scope?: string, entry?: string): void;
  /** A watched source rendered again: every page that shows it, and every page following it, gets the newer model. */
  rendered(entry: string, result: TauViewerShowResult): void;
  /** A watched source's build status changed: the pages that show it hear of it, under its project-relative path. */
  status(entry: string, entryPath: string, status: TauViewerEntryStatus): void;
  sync(input: TauViewerSyncInput, context?: McpViewerSyncContext): Promise<TauViewerSyncResult>;
  viewState(
    input: Readonly<{ capture?: boolean | undefined }>,
    context?: McpViewerCallContext,
  ): Promise<McpViewerViewStateResult | TauMcpViewerFailure>;
  captureReply(input: TauViewerCaptureReplyInput): Readonly<{ accepted: boolean }>;
  /** A `pose_model` command for the pages of `scope`: each page showing its model applies it once. */
  posed(command: Omit<TauViewerPoseCommand, 'sequence'>, scope?: string): void;
  /** How many live pages of `scope` show a model. */
  viewers(modelId: string, scope?: string): number;
  /** The freshest view a live page of `scope` reports for a model. */
  viewOf(modelId: string, scope?: string): TauViewerViewState | undefined;
  /** Answer every held sync and fail every pending capture. */
  close(): void;
}>;

type Page = {
  view?: TauViewerViewState;
  /** The conversation the page belongs to; `undefined` shares the process scope. */
  scope?: string;
  lastSeen: number;
  /** Capture requests this page has not answered, oldest first. */
  captures: string[];
  /** Captures a sync already handed the page; they no longer cut a held sync short while the page works on them. */
  delivered: Set<string>;
  /** The last pose command a sync handed the page. */
  posed: number;
  wake?: () => void;
  /** Whether the page's last sync followed `show_model`. */
  follows: boolean;
  /** The watched source the page shows, when it shows one of its renders. */
  entry?: string;
  /** The newest render of {@link entry} the page was handed or reported. */
  liveSeen: number;
  /** The newest status of {@link entry} the page was handed. */
  statusSeen: number;
};

type Latest = Readonly<{ version: number; result: TauViewerShowResult; entry?: string | undefined }>;

type StatusRecord = Readonly<{ version: number; entryPath: string; status: TauViewerEntryStatus }>;

type CaptureOutcome = Readonly<{ image: TauViewerImage } | { error: string }>;

type PendingCapture = Readonly<{ pageId: string; settle: (outcome: CaptureOutcome) => void }>;

const unref = (timer: ReturnType<typeof setTimeout>): void => {
  // Node timers keep the process alive; a held sync must not keep `tau mcp` running after stdin closes.
  if (typeof timer === 'object' && 'unref' in timer) {
    timer.unref();
  }
};

/**
 * Create the sessions of one `tau mcp` process.
 *
 * @param options - Timing knobs.
 * @returns The sessions.
 */
export const createMcpViewerSessions = (options: McpViewerSessionsOptions = {}): McpViewerSessions => {
  /** Milliseconds. */
  const hold = options.hold ?? 20_000;
  /** Milliseconds. */
  const live = options.live ?? 45_000;
  /** Milliseconds. */
  const captureTimeout = options.captureTimeout ?? 20_000;
  const now = options.now ?? Date.now;
  const pages = new Map<string, Page>();
  const captures = new Map<string, PendingCapture>();
  let version = 0;
  /** The model shown last in each scope; the `undefined` key is the process scope. */
  const latestByScope = new Map<string | undefined, Latest>();
  let newest: Latest | undefined;
  /** The newest render of each watched source. */
  const liveByEntry = new Map<string, Latest>();
  /** The newest status of each watched source. */
  const statusByEntry = new Map<string, StatusRecord>();
  /** The latest pose command in each scope; the `undefined` key is the process scope. */
  const poseByScope = new Map<string | undefined, TauViewerPoseCommand>();
  let poseSequence = 0;
  let closed = false;

  /** Whether a page and a call share a conversation: either names none, or both name the same one. */
  const sharesScope = (page: Page, scope: string | undefined): boolean =>
    scope === undefined || page.scope === undefined || page.scope === scope;

  /** The model a page should show: its conversation's or the process scope's, whichever came later. */
  const latestFor = (page: Page): Latest | undefined => {
    if (page.scope === undefined) {
      return newest;
    }
    const own = latestByScope.get(page.scope);
    const shared = latestByScope.get(undefined);
    return own === undefined || (shared !== undefined && shared.version > own.version) ? shared : own;
  };
  /** A newer render of the watched source the page shows, which the page neither reported nor was handed. */
  const unseenLive = (page: Page, input: TauViewerSyncInput): Latest | undefined => {
    const live = page.entry === undefined ? undefined : liveByEntry.get(page.entry);
    return live !== undefined && live.version > page.liveSeen && live.result.model.id !== input.view?.model.id
      ? live
      : undefined;
  };
  const unseen = (page: Page, input: TauViewerSyncInput): Latest | undefined => {
    const latest = input.follow ? latestFor(page) : undefined;
    return latest !== undefined && latest.version > input.version ? latest : unseenLive(page, input);
  };
  const unseenStatus = (page: Page): boolean =>
    page.entry !== undefined && (statusByEntry.get(page.entry)?.version ?? 0) > page.statusSeen;

  /** The pose command a page has not been handed: its conversation's or the process scope's, whichever came later. */
  const unposed = (page: Page): TauViewerPoseCommand | undefined => {
    const own = page.scope === undefined ? undefined : poseByScope.get(page.scope);
    const shared = poseByScope.get(undefined);
    const latest = own === undefined || (shared !== undefined && shared.sequence > own.sequence) ? shared : own;
    return latest !== undefined && latest.sequence > page.posed ? latest : undefined;
  };

  const answer = (page: Page, input: TauViewerSyncInput): TauViewerSyncResult => {
    /* A capture the page has not heard of goes first; one it works on is repeated in case a reply was lost. */
    const requestId = page.captures.find((id) => !page.delivered.has(id)) ?? page.captures[0];
    if (requestId !== undefined) {
      page.delivered.add(requestId);
    }
    const show = unseen(page, input);
    if (show !== undefined) {
      /* The page now shows what it was handed: a drawn file has no watched source. */
      page.entry = show.entry;
      page.liveSeen = show.entry === undefined ? 0 : (liveByEntry.get(show.entry)?.version ?? show.version);
    }
    const status = page.entry === undefined ? undefined : statusByEntry.get(page.entry);
    if (status !== undefined) {
      page.statusSeen = status.version;
    }
    const pose = unposed(page);
    if (pose !== undefined) {
      page.posed = pose.sequence;
    }
    return {
      version,
      accepts: tauViewerAcceptedViewFields,
      ...(show === undefined ? {} : { show: show.result }),
      ...(status === undefined ? {} : { status: { [status.entryPath]: status.status } }),
      ...(requestId === undefined ? {} : { capture: { requestId } }),
      ...(pose === undefined ? {} : { pose }),
    };
  };
  const isReady = (page: Page, input: TauViewerSyncInput): boolean =>
    page.captures.some((id) => !page.delivered.has(id)) ||
    unseen(page, input) !== undefined ||
    unseenStatus(page) ||
    unposed(page) !== undefined;

  /** Wake every page the watched source's news reaches: those showing it, and those following `show_model`. */
  const wakeFor = (entry: string): void => {
    for (const page of pages.values()) {
      if (page.entry === entry || page.follows) {
        page.wake?.();
      }
    }
  };

  const livePages = (scope: string | undefined): Array<readonly [string, Page & { view: TauViewerViewState }]> =>
    [...pages.entries()]
      .filter((entry): entry is [string, Page & { view: TauViewerViewState }] => {
        const [, page] = entry;
        return page.view !== undefined && now() - page.lastSeen <= live && sharesScope(page, scope);
      })
      .sort(
        ([, left], [, right]) => right.view.interactedAt - left.view.interactedAt || right.lastSeen - left.lastSeen,
      );

  const sessions: McpViewerSessions = {
    shown(result, scope, entry) {
      version += 1;
      newest = { version, result, entry };
      latestByScope.set(scope, newest);
      if (entry !== undefined) {
        liveByEntry.set(entry, newest);
      }
      for (const page of pages.values()) {
        if (sharesScope(page, scope)) {
          page.wake?.();
        }
      }
    },
    rendered(entry, result) {
      version += 1;
      const next: Latest = { version, result, entry };
      liveByEntry.set(entry, next);
      /* A conversation whose last show was this source now has its newer render as its last show. */
      for (const [scope, latest] of latestByScope) {
        if (latest.entry === entry) {
          latestByScope.set(scope, next);
        }
      }
      if (newest?.entry === entry) {
        newest = next;
      }
      wakeFor(entry);
    },
    status(entry, entryPath, status) {
      version += 1;
      statusByEntry.set(entry, { version, entryPath, status });
      wakeFor(entry);
    },
    async sync(input, context = {}) {
      const { scope, signal, entry } = context;
      let page = pages.get(input.pageId);
      if (page === undefined) {
        /* A page that opens later takes the pose that holds now. */
        page = {
          lastSeen: now(),
          captures: [],
          delivered: new Set(),
          posed: 0,
          follows: input.follow,
          liveSeen: 0,
          statusSeen: 0,
        };
        pages.set(input.pageId, page);
      }
      page.lastSeen = now();
      page.follows = input.follow;
      if (input.view !== undefined) {
        /* The model the page reports names what it shows: a render of a watched source, or a drawn file. */
        if (entry !== page.entry) {
          page.statusSeen = 0;
        }
        page.entry = entry;
        const live = entry === undefined ? undefined : liveByEntry.get(entry);
        if (live !== undefined && live.result.model.id === input.view.model.id) {
          page.liveSeen = Math.max(page.liveSeen, live.version);
        }
      }
      if (scope !== undefined) {
        page.scope = scope;
      }
      if (input.view !== undefined) {
        page.view = input.view;
      }
      // A newer sync from the same page supersedes the one it held.
      page.wake?.();
      if (closed || !input.wait || isReady(page, input)) {
        return answer(page, input);
      }
      const held = page;
      await new Promise<void>((resolve) => {
        const finish = (): void => {
          clearTimeout(timer);
          signal?.removeEventListener('abort', finish);
          if (held.wake === finish) {
            held.wake = undefined;
          }
          resolve();
        };
        const timer = setTimeout(finish, hold);
        unref(timer);
        signal?.addEventListener('abort', finish, { once: true });
        held.wake = finish;
      });
      held.lastSeen = now();
      return answer(held, input);
    },
    async viewState(input, context = {}) {
      const { scope, signal } = context;
      const [target] = livePages(scope);
      if (target === undefined) {
        return {
          errorCode: 'NO_VIEWER',
          message: 'No Tau viewer page is open. Call show_model to open one, then ask again.',
        };
      }
      const [pageId, page] = target;
      if (input.capture !== true) {
        return { view: page.view };
      }
      const requestId = randomUUID();
      const outcome = await new Promise<CaptureOutcome>((resolve) => {
        const settle = (value: CaptureOutcome): void => {
          clearTimeout(timer);
          signal?.removeEventListener('abort', aborted);
          captures.delete(requestId);
          page.captures = page.captures.filter((id) => id !== requestId);
          page.delivered.delete(requestId);
          resolve(value);
        };
        const aborted = (): void => {
          settle({ error: 'The call was cancelled.' });
        };
        const timer = setTimeout(() => {
          settle({ error: 'The viewer did not answer in time; it may be hidden or still drawing the model.' });
        }, captureTimeout);
        unref(timer);
        signal?.addEventListener('abort', aborted, { once: true });
        captures.set(requestId, { pageId, settle });
        page.captures.push(requestId);
        page.wake?.();
      });
      // The page reports its view with each sync; the freshest one goes with the image.
      const { view } = page;
      return 'image' in outcome ? { view, image: outcome.image } : { view, captureError: outcome.error };
    },
    captureReply(input) {
      const pending = captures.get(input.requestId);
      if (pending === undefined || pending.pageId !== input.pageId) {
        return { accepted: false };
      }
      pending.settle(
        input.image === undefined ? { error: input.error ?? 'The viewer sent no image.' } : { image: input.image },
      );
      return { accepted: true };
    },
    posed(command, scope) {
      poseSequence += 1;
      poseByScope.set(scope, { ...command, sequence: poseSequence });
      for (const page of pages.values()) {
        if (sharesScope(page, scope)) {
          page.wake?.();
        }
      }
    },
    viewers(modelId, scope) {
      return livePages(scope).filter(([, page]) => page.view.model.id === modelId).length;
    },
    viewOf(modelId, scope) {
      return livePages(scope).find(([, page]) => page.view.model.id === modelId)?.[1].view;
    },
    close() {
      closed = true;
      for (const pending of captures.values()) {
        pending.settle({ error: 'The server is closing.' });
      }
      for (const page of pages.values()) {
        page.wake?.();
      }
    },
  };
  return sessions;
};
