import { describe, expect, it } from 'vitest';
import { maxSnapshotFileTreeEntries, messageMetadataSchema, snapshotSchema } from '#schemas/metadata.schema.js';

describe('messageMetadataSchema', () => {
  it('should accept a row carrying the live createdAt + status fields', () => {
    const row = { createdAt: 1_700_000_000_000, status: 'success' };

    const result = messageMetadataSchema.safeParse(row);

    expect(result.success, result.success ? '' : JSON.stringify(result.error.issues)).toBe(true);
  });

  it('should accept the empty object — every field is optional', () => {
    const result = messageMetadataSchema.safeParse({});

    expect(result.success, result.success ? '' : JSON.stringify(result.error.issues)).toBe(true);
  });

  it('should reject a row whose status field is the wrong type', () => {
    const result = messageMetadataSchema.safeParse({ status: 42 });

    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues[0];
      expect(issue?.path).toEqual(['status']);
    }
  });
});

describe('snapshotSchema', () => {
  it('accepts the kernel object and refuses a reason that is not the neutral one', () => {
    const kernel = {
      preference: 'auto',
      owner: { kernel: 'openscad', entryPath: 'main.scad' },
      available: ['openscad'],
      unavailable: [{ kernel: 'zoo', reason: 'not available here' }],
      guidance: 'This project uses OpenSCAD.',
    };

    expect(snapshotSchema.safeParse({ kernel }).success).toBe(true);
    expect(
      snapshotSchema.safeParse({ kernel: { ...kernel, unavailable: [{ kernel: 'zoo', reason: 'requires Pro' }] } })
        .success,
    ).toBe(false);
    expect(snapshotSchema.safeParse({ kernel: { ...kernel, preference: 'Auto' } }).success).toBe(false);
  });

  it('accepts a basic file when its text line count is unknown', () => {
    expect(
      snapshotSchema.safeParse({
        fileTree: [{ path: 'main.ts', name: 'main.ts', type: 'file', size: 5 }],
        activeFile: { path: 'main.ts', name: 'main.ts' },
      }).success,
    ).toBe(true);
    expect(
      snapshotSchema.safeParse({
        fileTree: [{ path: 'main.ts', name: 'main.ts', type: 'file', size: 5, contentKind: 'text' }],
      }).success,
    ).toBe(false);
  });

  it("accepts an older client's unbounded file tree rather than refusing the turn", () => {
    const fileTree = Array.from({ length: maxSnapshotFileTreeEntries + 1 }, (_, index) => ({
      path: `src/f-${String(index)}.ts`,
      name: `f-${String(index)}.ts`,
      type: 'file',
      size: 1,
    }));

    expect(snapshotSchema.safeParse({ fileTree }).success).toBe(true);
  });
});

describe('workbench snapshot', () => {
  it('accepts adoption and refusal facts and rejects a pane outside the approved vocabulary', () => {
    const workbench = {
      layoutDigest: 'missing',
      lanes: { chat: true, workbench: true },
      visible: [{ kind: 'pane', pane: 'parameters' }],
      views: [{ id: 'front', name: 'Front', entryPath: 'main.ts', camera: 'front' }],
      entries: [{ path: 'main.ts', renderTimeout: 180_000, hidden: 2 }],
      unavailable: ['kernel', 'console'],
      refused: [{ tab: { kind: 'pane', pane: 'kernel' }, reason: 'debug-only' }],
    };
    expect(snapshotSchema.safeParse({ workbench }).success).toBe(true);
    expect(snapshotSchema.safeParse({ workbench: { ...workbench, unavailable: ['unknown'] } }).success).toBe(false);
  });
});
