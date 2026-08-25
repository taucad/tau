import { describe, expect, it, vi } from 'vitest';
import type { TelemetryEntry } from '@taucad/runtime/types';
import { buildExportProfile, createPhaseLedger } from '#commands/export-profile.js';

const span = (options: {
  id: string;
  parentId?: string;
  name: string;
  startTime: number;
  duration: number;
}): TelemetryEntry => ({
  name: options.name,
  startTime: options.startTime,
  duration: options.duration,
  workerTimeOrigin: performance.timeOrigin,
  detail: {
    spanId: options.id,
    ...(options.parentId === undefined ? {} : { parentSpanId: options.parentId }),
  },
});

describe('export profile', () => {
  it('uses interval unions for exclusive time and keeps the export residual explicit', () => {
    const runtimeExportPhase = { name: 'runtime.export', startTime: 0, duration: 120, endTime: 120 };
    const profile = buildExportProfile({
      phases: [runtimeExportPhase],
      runtimeExportPhase,
      telemetry: [
        span({ id: 'root', name: 'kernel.export-model', startTime: 0, duration: 100 }),
        span({ id: 'left', parentId: 'root', name: 'left', startTime: 10, duration: 60 }),
        span({ id: 'right', parentId: 'root', name: 'right', startTime: 40, duration: 60 }),
      ],
      workload: { inputPath: '/model.ts', outputPath: '/model.glb', format: 'glb', artifacts: [] },
    });

    expect(profile.runtime.rootSpanCoverage).toBe(100);
    expect(profile.runtime.unattributedWithinExport).toBe(20);
    expect(profile.runtime.spans.find(({ id }) => id === 'root')?.selfDuration).toBe(10);
    expect(profile.runtime.spanSelfDurationSum).toBe(130);
    expect(profile.runtime.spanSelfReconciliation).toBe(-30);
    expect(
      profile.runtime.spanSelfDurationSum +
        profile.runtime.spanSelfReconciliation +
        profile.runtime.unattributedWithinExport,
    ).toBe(profile.runtime.exportPhaseDuration);
    expect(profile.accounting.unaccounted).toBe(0);
  });

  it('records contiguous process-relative CLI phases', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValueOnce(12).mockReturnValueOnce(20);
    const ledger = createPhaseLedger();

    expect(ledger.checkpoint('process.startup')).toEqual({
      name: 'process.startup',
      startTime: 0,
      duration: 12,
      endTime: 12,
    });
    expect(ledger.checkpoint('cli.prepare')).toEqual({
      name: 'cli.prepare',
      startTime: 12,
      duration: 8,
      endTime: 20,
    });

    now.mockRestore();
  });
});
