import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  firstTurnBackupDeadline,
  firstTurnBackupHold,
  holdFirstTurnBackup,
  releaseFirstTurnBackup,
} from '#lib/first-turn-backup-gate.js';

describe('first-turn backup gate (WP-12 step 5)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should hold nothing for a project it was never asked to hold', () => {
    expect(firstTurnBackupHold('proj_none')).toBeUndefined();
  });

  it('should let the backup go when the first turn streams', async () => {
    holdFirstTurnBackup('proj_streamed');
    const settled = vi.fn();
    const watch = async (): Promise<void> => {
      await firstTurnBackupHold('proj_streamed');
      settled();
    };
    void watch();
    await vi.advanceTimersByTimeAsync(100);
    expect(settled).not.toHaveBeenCalled();
    releaseFirstTurnBackup('proj_streamed');
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toHaveBeenCalledOnce();
    expect(firstTurnBackupHold('proj_streamed')).toBeUndefined();
  });

  it('should let the backup go at the deadline when the first turn never streams', async () => {
    holdFirstTurnBackup('proj_silent');
    const settled = vi.fn();
    const watch = async (): Promise<void> => {
      await firstTurnBackupHold('proj_silent');
      settled();
    };
    void watch();
    await vi.advanceTimersByTimeAsync(firstTurnBackupDeadline - 1);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toHaveBeenCalledOnce();
    expect(firstTurnBackupHold('proj_silent')).toBeUndefined();
  });

  it('should keep the first hold when asked twice, and ignore a release with nothing held', async () => {
    holdFirstTurnBackup('proj_twice');
    const first = firstTurnBackupHold('proj_twice');
    holdFirstTurnBackup('proj_twice');
    expect(firstTurnBackupHold('proj_twice')).toBe(first);
    releaseFirstTurnBackup('proj_other');
    expect(firstTurnBackupHold('proj_twice')).toBe(first);
    releaseFirstTurnBackup('proj_twice');
    await vi.advanceTimersByTimeAsync(0);
    expect(firstTurnBackupHold('proj_twice')).toBeUndefined();
  });
});
