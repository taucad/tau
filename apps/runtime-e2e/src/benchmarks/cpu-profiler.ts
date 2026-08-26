/**
 * CPU Profiler
 *
 * Thin wrapper around `node:inspector/promises` Session + Profiler API
 * for programmatic V8 CPU profiling during benchmark runs.
 *
 * Produces standard `.cpuprofile` JSON that can be opened in Chrome DevTools,
 * speedscope, or processed by the profile analyzer.
 */

import type { Session } from 'node:inspector/promises';

// =============================================================================
// Types — mirrors the V8 CPU profile format
// =============================================================================

/** A single call frame in the profiled call stack. */
export type ProfileCallFrame = {
  functionName: string;
  scriptId: string;
  url: string;
  lineNumber: number;
  columnNumber: number;
};

/** A node in the CPU profile tree representing a unique call stack position. */
export type ProfileNode = {
  id: number;
  callFrame: ProfileCallFrame;
  hitCount?: number;
  children?: number[];
};

/** V8 CPU profile — the standard `.cpuprofile` format. */
export type CpuProfile = {
  nodes: ProfileNode[];
  startTime: number;
  endTime: number;
  samples: number[];
  timeDeltas: number[];
};

// =============================================================================
// Profiler
// =============================================================================

/**
 * Wraps the V8 inspector Profiler for start/stop lifecycle management.
 * Each instance is single-use: call `start()` once, then `stop()` once.
 */
export class CpuProfiler {
  private session: Session | undefined;

  /**
   * Begin CPU profiling with the given sampling interval.
   *
   * @param samplingInterval - Sample interval in microseconds (default 100 = 100us).
   *   Lower values give higher resolution but slightly more overhead.
   */
  public async start(samplingInterval = 100): Promise<void> {
    const inspectorModule = await import('node:inspector/promises');
    this.session = new inspectorModule.Session();
    this.session.connect();
    await this.session.post('Profiler.enable');
    await this.session.post('Profiler.setSamplingInterval', { interval: samplingInterval });
    await this.session.post('Profiler.start');
  }

  /**
   * Stop profiling and return the collected CPU profile.
   * Disconnects the inspector session — the profiler cannot be reused.
   *
   * @returns the collected V8 CPU profile
   */
  public async stop(): Promise<CpuProfile> {
    if (!this.session) {
      throw new Error('CpuProfiler.stop() called before start()');
    }

    const { profile } = await this.session.post('Profiler.stop');
    this.session.disconnect();
    this.session = undefined;
    return profile as unknown as CpuProfile;
  }
}
