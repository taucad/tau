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
 */

import { randomUUID } from 'node:crypto';

import type { TauMcpViewerFailure } from '@taucad/mcp';
import { tauViewerAcceptedViewFields } from '@taucad/mcp/viewer-protocol';
import type {
  TauViewerCaptureReplyInput,
  TauViewerImage,
  TauViewerShowResult,
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

/** The sessions of one server process. */
export type McpViewerSessions = Readonly<{
  /** A model was shown in `scope`: pages of that conversation that follow `show_model` switch to it. */
  shown(result: TauViewerShowResult, scope?: string): void;
  sync(input: TauViewerSyncInput, context?: McpViewerCallContext): Promise<TauViewerSyncResult>;
  viewState(
    input: Readonly<{ capture?: boolean | undefined }>,
    context?: McpViewerCallContext,
  ): Promise<McpViewerViewStateResult | TauMcpViewerFailure>;
  captureReply(input: TauViewerCaptureReplyInput): Readonly<{ accepted: boolean }>;
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
  wake?: () => void;
};

type Latest = Readonly<{ version: number; result: TauViewerShowResult }>;

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
  const unseen = (page: Page, input: TauViewerSyncInput): TauViewerShowResult | undefined => {
    const latest = input.follow ? latestFor(page) : undefined;
    return latest !== undefined && latest.version > input.version ? latest.result : undefined;
  };

  const answer = (page: Page, input: TauViewerSyncInput): TauViewerSyncResult => {
    /* A capture the page has not heard of goes first; one it works on is repeated in case a reply was lost. */
    const requestId = page.captures.find((id) => !page.delivered.has(id)) ?? page.captures[0];
    if (requestId !== undefined) {
      page.delivered.add(requestId);
    }
    const show = unseen(page, input);
    return {
      version,
      accepts: tauViewerAcceptedViewFields,
      ...(show === undefined ? {} : { show }),
      ...(requestId === undefined ? {} : { capture: { requestId } }),
    };
  };
  const isReady = (page: Page, input: TauViewerSyncInput): boolean =>
    page.captures.some((id) => !page.delivered.has(id)) || unseen(page, input) !== undefined;

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
    shown(result, scope) {
      version += 1;
      newest = { version, result };
      latestByScope.set(scope, newest);
      for (const page of pages.values()) {
        if (sharesScope(page, scope)) {
          page.wake?.();
        }
      }
    },
    async sync(input, context = {}) {
      const { scope, signal } = context;
      let page = pages.get(input.pageId);
      if (page === undefined) {
        page = { lastSeen: now(), captures: [], delivered: new Set() };
        pages.set(input.pageId, page);
      }
      page.lastSeen = now();
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
