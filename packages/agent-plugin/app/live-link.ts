/**
 * The page's live link to `tau mcp` (agent plugin UI blueprint W6): a long poll of `app_sync` that reports what the
 * person sees and hears of models `show_model` handed over and of captures the agent waits for.
 */

import { tauViewerToolName } from '@taucad/mcp/viewer-protocol';
import type {
  TauViewerCamera,
  TauViewerComponent,
  TauViewerImage,
  TauViewerModel,
  TauViewerShowResult,
  TauViewerSyncResult,
  TauViewerViewState,
} from '@taucad/mcp/viewer-protocol';
import type { GeometryComponentManifest } from '@taucad/types';
import type { HostBridge } from '#app/host-bridge.js';

/** What the page knows about one unit of the model it draws. */
export type ShownUnit = Readonly<{
  manifest?: GeometryComponentManifest | undefined;
  selectedComponentIds: readonly string[];
  hiddenComponentIds: readonly string[];
  isolatedComponentIds: readonly string[];
}>;

/**
 * The view the page reports.
 *
 * @param input - The shown model, its unit's interaction state, the camera and the page's composition.
 * @returns The view state.
 */
export const viewStateOf = (
  input: Readonly<{
    model: TauViewerModel;
    unit: ShownUnit;
    camera: TauViewerCamera | undefined;
    sectionActive: boolean;
    measurementCount: number;
    composition: 'inline' | 'tab';
    interactedAt: number;
  }>,
): TauViewerViewState => {
  const { model, unit, camera } = input;
  const selected = unit.selectedComponentIds.slice(0, 64).flatMap((componentId): TauViewerComponent[] => {
    const node = unit.manifest?.nodesById[componentId];
    return node === undefined
      ? []
      : [
          {
            componentId,
            label: node.name,
            kind: node.kind,
            ...(node.selector === '' ? {} : { selector: node.selector }),
          },
        ];
  });
  return {
    model: {
      id: model.id,
      title: model.title,
      path: model.path,
      ...(model.sourceFile === undefined ? {} : { sourceFile: model.sourceFile }),
    },
    selected,
    hidden: unit.hiddenComponentIds.slice(0, 1024),
    isolated: unit.isolatedComponentIds.slice(0, 1024),
    ...(camera === undefined ? {} : { camera }),
    sectionActive: input.sectionActive,
    measurementCount: input.measurementCount,
    composition: input.composition,
    interactedAt: input.interactedAt,
  };
};

/** The widest capture the page sends; the agent reads a frame, not a print. */
const captureWidth = 1280;

/**
 * Capture the live view: the largest canvas in `root`, scaled down to at most 1280 px wide, as PNG.
 *
 * @param root - The element holding the viewer.
 * @returns The image, or why there is none.
 */
export const captureLiveView = (root: ParentNode): TauViewerImage | Readonly<{ error: string }> => {
  const canvases = [...root.querySelectorAll('canvas')].filter((canvas) => canvas.width > 0 && canvas.height > 0);
  const [canvas] = canvases.sort((left, right) => right.width * right.height - left.width * left.height);
  if (canvas === undefined) {
    return { error: 'The viewer draws no 3D canvas (a 2D drawing is captured with screenshot).' };
  }
  let source: HTMLCanvasElement = canvas;
  if (canvas.width > captureWidth) {
    const scaled = document.createElement('canvas');
    scaled.width = captureWidth;
    scaled.height = Math.round((canvas.height * captureWidth) / canvas.width);
    const context = scaled.getContext('2d');
    if (context === null) {
      return { error: 'The browser gave no 2D context to scale the capture.' };
    }
    context.drawImage(canvas, 0, 0, scaled.width, scaled.height);
    source = scaled;
  }
  const dataUrl = source.toDataURL('image/png');
  const data = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return data === '' ? { error: 'The canvas could not be read.' } : { mimeType: 'image/png', data };
};

/** Milliseconds a capture or a selection waits for the model to be drawn. */
const drawnTimeout = 15_000;

/** Milliseconds one frame wait lasts at most: a hidden tab or an off-screen frame paints no frame at all. */
const frameTimeout = 250;

/** Resolve at the next animation frame, or after {@link frameTimeout} when the browser paints none. */
const nextFrame = async (): Promise<void> =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, frameTimeout);
    requestAnimationFrame(() => {
      clearTimeout(timer);
      resolve();
    });
  });

/**
 * Wait until `isDrawn` holds, checking every 100 ms, then let two frames paint (at most half a second when the page
 * paints none).
 *
 * @param isDrawn - Whether the page shows its model.
 * @returns Whether it was drawn in time.
 */
export const whenDrawn = async (isDrawn: () => boolean): Promise<boolean> => {
  const started = Date.now();
  while (!isDrawn()) {
    if (Date.now() - started > drawnTimeout) {
      return false;
    }
    // oxlint-disable-next-line eslint/no-await-in-loop -- Each check waits for the one before it.
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
  }
  await nextFrame();
  await nextFrame();
  return true;
};

/** Characters of a capture failure the reply carries (`app_capture_reply` takes 1000). */
const captureErrorLimit = 500;

/** What the live link asks of the page. */
export type LiveLinkPage = Readonly<{
  /** The view to report, or `undefined` before a model is shown. */
  view(): TauViewerViewState | undefined;
  /** Whether the page follows `show_model` (a page the person opened does; a card keeps its model). */
  follows(): boolean;
  /** Whether the page opened on the model its link names, so it follows only the shows made after it opened. */
  linked(): boolean;
  /** The `tools/call` whose result opened the page, which tells the server the page's conversation. */
  toolCallId(): string | undefined;
  /** A model `show_model` handed over that this page has not seen. */
  show(result: TauViewerShowResult): void;
  /** Capture the live view once its model is drawn. */
  capture(): Promise<TauViewerImage | Readonly<{ error: string }>>;
}>;

/** Timing of the live link; tests shorten it. */
export type LiveLinkOptions = Readonly<{
  /**
   * How long a card keeps its long poll after it opened, the person used it or the agent captured it. Milliseconds.
   * A page that follows `show_model` polls for its whole life.
   */
  activeFor?: number;
}>;

/** The running link. */
export type LiveLink = Readonly<{
  /** Report the view now, outside the poll (after the person changed it). */
  nudge(): void;
  stop(): void;
}>;

const isSyncResult = (value: unknown): value is TauViewerSyncResult =>
  typeof value === 'object' && value !== null && 'version' in value && typeof value.version === 'number';

/** Milliseconds between retries after a failed sync, doubling to the cap. */
const retryFloor = 1000;
const retryCap = 30_000;

const sleep = async (duration: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, duration);
  });

/**
 * Start the page's long poll.
 *
 * A card that nobody uses holds no call open through the host: past its active window it stops polling, drops out of
 * `view_state` and resumes when the person uses it again. Scrolled-back history then costs nothing.
 *
 * @param callTool - The host bridge's tool call.
 * @param page - What the link reads from and hands to the page.
 * @param options - Timing.
 * @returns The running link.
 */
export const startLiveLink = (
  callTool: HostBridge['callTool'],
  page: LiveLinkPage,
  options: LiveLinkOptions = {},
): LiveLink => {
  /** Milliseconds. */
  const activeFor = options.activeFor ?? 60_000;
  /* `randomUUID` needs a secure context, which a sandboxed host frame may not be. */
  const pageId = `page-${[...crypto.getRandomValues(new Uint8Array(12))].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
  let version = 0;
  const control: { stopped: boolean; resume?: (() => void) | undefined } = { stopped: false };
  let retry = retryFloor;
  const answered = new Set<string>();
  let activeUntil = Date.now() + activeFor;
  /* A page that opened on its link's model first takes the server's version without following, so a show made before
   * it opened never replaces that model; it follows every show after. */
  let caughtUp = !page.linked();
  const keepActive = (): void => {
    activeUntil = Date.now() + activeFor;
    control.resume?.();
  };

  /* A capture that throws is answered with its error, and its reply failing leaves the server to time it out: neither
   * is a failed sync, so neither puts the poll into back-off. */
  const answerCapture = async (requestId: string): Promise<void> => {
    let captured: TauViewerImage | Readonly<{ error: string }>;
    try {
      captured = await page.capture();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      captured = { error: `The viewer could not capture its view: ${reason}`.slice(0, captureErrorLimit) };
    }
    try {
      await callTool(tauViewerToolName.appCaptureReply, {
        requestId,
        pageId,
        ...('error' in captured ? { error: captured.error } : { image: captured }),
      });
    } catch {
      // The server answers view_state that the viewer did not answer in time.
    }
  };

  const handle = (result: TauViewerSyncResult): void => {
    version = Math.max(version, result.version);
    if (result.show !== undefined && page.follows()) {
      page.show(result.show);
    }
    const requestId = result.capture?.requestId;
    if (requestId !== undefined && !answered.has(requestId)) {
      answered.add(requestId);
      keepActive();
      // async-iife: bootstrap — the capture runs beside the poll, so a slow or hidden frame never stalls the link.
      void answerCapture(requestId);
    }
  };

  const sync = async (wait: boolean): Promise<void> => {
    const view = page.view();
    const toolCallId = page.toolCallId();
    const result = await callTool(tauViewerToolName.appSync, {
      pageId,
      version,
      follow: page.follows() && caughtUp,
      wait,
      ...(view === undefined ? {} : { view }),
      ...(toolCallId === undefined ? {} : { toolCallId }),
    });
    if (isSyncResult(result)) {
      handle(result);
    }
  };

  const loop = async (): Promise<void> => {
    while (!control.stopped) {
      if (!page.follows() && Date.now() >= activeUntil) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- An idle card waits for its next use before it polls again.
        await new Promise<void>((resolve) => {
          control.resume = resolve;
        });
        control.resume = undefined;
        continue;
      }
      try {
        // oxlint-disable-next-line eslint/no-await-in-loop -- One sync at a time: each answers the version the last one saw.
        await sync(caughtUp);
        caughtUp = true;
        retry = retryFloor;
      } catch {
        // A host without the tool, or a server that went away: try again later, less often.
        // oxlint-disable-next-line eslint/no-await-in-loop -- The back-off waits between serial syncs.
        await sleep(retry);
        retry = Math.min(retry * 2, retryCap);
      }
    }
  };
  // async-iife: bootstrap — the poll runs for the page's life; stop() ends it.
  void loop();

  return {
    nudge() {
      if (!control.stopped) {
        keepActive();
        // async-iife: bootstrap — a report the next poll repeats if it fails.
        void (async () => {
          try {
            await sync(false);
          } catch {
            // The next poll reports the same view.
          }
        })();
      }
    },
    stop() {
      control.stopped = true;
      control.resume?.();
    },
  };
};
