import type { ChatSnapshot } from '@taucad/chat';
import { describe, expect, it } from 'vitest';
import { buildSnapshotContextText } from '#api/chat/utils/snapshot-context.js';

describe('buildSnapshotContextText', () => {
  it('builds tagged editor context without mutating UI messages', () => {
    const snapshot = {
      fileTree: [
        { path: 'src', name: 'src', type: 'dir', size: 0 },
        { path: 'src/main.scad', name: 'main.scad', type: 'file', size: 1024, contentKind: 'text', lineCount: 64 },
      ],
      activeFile: { path: 'src/main.scad', name: 'main.scad' },
      openFiles: [{ path: 'src/main.scad', name: 'main.scad' }],
    } as const satisfies ChatSnapshot;

    const text = buildSnapshotContextText(snapshot);

    expect(text).toContain('<system-reminder>');
    expect(text).toContain('<active_file>');
    expect(text).toContain('src/main.scad');
    expect(text).toContain('<open_files>');
    expect(text).toContain('<project_layout>');
    expect(text).toContain('main.scad (64 lines, 1KB)');
    expect(text).toContain('</system-reminder>');
  });

  it('returns undefined when there is no snapshot context to add', () => {
    expect(buildSnapshotContextText({ fileTree: [], openFiles: [] })).toBeUndefined();
  });
});
