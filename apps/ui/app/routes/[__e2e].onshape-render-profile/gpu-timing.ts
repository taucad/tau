import type { WebGLRenderer } from 'three';

type TimerQueryExtension = {
  readonly TIME_ELAPSED_EXT: number;
  readonly GPU_DISJOINT_EXT: number;
  readonly QUERY_COUNTER_BITS_EXT: number;
};

export type GpuPassRange = {
  readonly uid: string;
  /** Milliseconds relative to this sampled frame's earliest pass start. */
  readonly start: number;
  readonly end: number;
};

export type FrameGpuTimer = {
  readonly support: { readonly extension: string; readonly counterBits: number };
  /** Returns false when another query is active or eight samples are pending. */
  begin: () => boolean;
  end: () => void;
  /** Returns completed samples without waiting; discarded count is cumulative. */
  poll: () => {
    milliseconds: number[];
    passRanges?: GpuPassRange[][];
    pending: number;
    disjointDiscarded: number;
    failedSamples?: number;
  };
  dispose: () => void;
};

/** Times submitted WebGL2 frame commands using the Khronos elapsed-query extension. */
export function createFrameGpuTimer(renderer: Pick<WebGLRenderer, 'getContext'>): FrameGpuTimer | undefined {
  const gl = renderer.getContext();
  if (!('createQuery' in gl)) {
    return undefined;
  }
  const extensionName = 'EXT_disjoint_timer_query_webgl2';
  const extension = (gl.getExtension(extensionName) ?? undefined) as TimerQueryExtension | undefined;
  if (!extension) {
    return undefined;
  }
  const counterBits = gl.getQuery(extension.TIME_ELAPSED_EXT, extension.QUERY_COUNTER_BITS_EXT) as number;
  if (counterBits === 0) {
    return undefined;
  }

  const pending: WebGLQuery[] = [];
  let active: WebGLQuery | undefined;
  let disjointDiscarded = 0;
  let disposed = false;

  const clearQueries = (): number => {
    const count = pending.length + (active ? 1 : 0);
    if (active) {
      gl.endQuery(extension.TIME_ELAPSED_EXT);
      gl.deleteQuery(active);
      active = undefined;
    }
    for (const query of pending) {
      gl.deleteQuery(query);
    }
    pending.length = 0;
    return count;
  };

  const discardDisjointQueries = (): boolean => {
    if (gl.getParameter(extension.GPU_DISJOINT_EXT)) {
      disjointDiscarded += clearQueries();
      return true;
    }
    return false;
  };

  return {
    support: { extension: extensionName, counterBits },
    begin() {
      if (disposed || active !== undefined || pending.length >= 8 || gl.isContextLost()) {
        return false;
      }
      if (discardDisjointQueries() || gl.getQuery(extension.TIME_ELAPSED_EXT, gl.CURRENT_QUERY)) {
        return false;
      }
      const query = gl.createQuery();
      gl.beginQuery(extension.TIME_ELAPSED_EXT, query);
      active = query;
      return true;
    },
    end() {
      if (!active) {
        return;
      }
      gl.endQuery(extension.TIME_ELAPSED_EXT);
      pending.push(active);
      active = undefined;
    },
    poll() {
      const milliseconds: number[] = [];
      if (!disposed && gl.isContextLost()) {
        clearQueries();
      } else if (!disposed && !discardDisjointQueries()) {
        while (pending.length > 0) {
          const query = pending[0]!;
          if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) {
            break;
          }
          milliseconds.push((gl.getQueryParameter(query, gl.QUERY_RESULT) as number) / 1_000_000);
          gl.deleteQuery(query);
          pending.shift();
        }
      }
      return { milliseconds, pending: pending.length + (active ? 1 : 0), disjointDiscarded };
    },
    dispose() {
      if (!disposed) {
        clearQueries();
        disposed = true;
      }
    },
  };
}

/**
 * Correlate ordered results with successful query submissions; never zip across missing results.
 * @param frames - Render callbacks in workload order, including callbacks skipped by the timer.
 * @param results - Resolved count and cumulative failure state for the same measurement window.
 * @returns Sample frame indices only when every accepted query completed successfully.
 */
export function correlateGpuFrames(
  frames: ReadonlyArray<{ gpuQueryStarted: boolean }>,
  results: { samples: number; pending: number; disjointDiscarded: number; failedSamples?: number },
): number[] | undefined {
  if (results.pending > 0 || results.disjointDiscarded > 0 || (results.failedSamples ?? 0) > 0) {
    return undefined;
  }
  const indices = frames.flatMap((frame, index) => (frame.gpuQueryStarted ? [index] : []));
  return indices.length === results.samples ? indices : undefined;
}
