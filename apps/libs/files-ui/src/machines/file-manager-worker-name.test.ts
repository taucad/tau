import { describe, expect, it } from 'vitest';
import {
  fileManagerWorkerName,
  homeBackendFromWorkerName,
  isSafeModeWorkerName,
} from '#machines/file-manager-worker-name.js';

describe('file-manager worker name', () => {
  it('carries the Home engine, and safe mode only when the page load started in it (W9 R5)', () => {
    const normal = fileManagerWorkerName('opfs');
    const safe = fileManagerWorkerName('opfs', { safeMode: true });

    expect(homeBackendFromWorkerName(normal)).toBe('opfs');
    expect(homeBackendFromWorkerName(safe)).toBe('opfs');
    expect(isSafeModeWorkerName(normal)).toBe(false);
    expect(isSafeModeWorkerName(safe)).toBe(true);
  });
});
