import { describe, it, expect } from 'vitest';
import type { Chat, MyUIMessage } from '@taucad/chat';
import {
  activeOps,
  buildRevisions,
  buildTimeline,
  computeAbandonedTurnIds,
  extractOps,
  isDesignPath,
  latestTurnHasDesignOps,
  materializeAt,
  migrateHeadTurnId,
  resolveRestore,
} from '#lib/file-restore-timeline.js';
import type { FileOp } from '#lib/file-restore-timeline.js';

// ===========================================================================
// Fixtures — message parts are serialized data (persisted JSON), so a single
// assertion to the part/message/chat type is used per testing-policy §11.
// ===========================================================================

type Part = MyUIMessage['parts'][number];

let counter = 0;
const nextId = (prefix: string): string => `${prefix}${counter++}`;
const lineCount = (s: string): number => (s === '' ? 0 : s.split('\n').length);

const createPart = (targetFile: string, content: string, over = ''): Part =>
  ({
    type: 'tool-create_file',
    toolCallId: nextId('c'),
    state: 'output-available',
    input: { targetFile, content },
    output: {
      diffStats: {
        linesAdded: lineCount(content),
        linesRemoved: lineCount(over),
        originalContent: over,
        modifiedContent: content,
      },
    },
  }) as unknown as Part;

const editPart = (targetFile: string, before: string, after: string): Part =>
  ({
    type: 'tool-edit_file',
    toolCallId: nextId('e'),
    state: 'output-available',
    input: { targetFile, codeEdit: after },
    output: {
      diffStats: {
        linesAdded: lineCount(after),
        linesRemoved: lineCount(before),
        originalContent: before,
        modifiedContent: after,
      },
    },
  }) as unknown as Part;

/** `before === undefined` models a legacy (pre-capture) delete with no diffStats. */
const deletePart = (targetFile: string, before?: string): Part =>
  ({
    type: 'tool-delete_file',
    toolCallId: nextId('d'),
    state: 'output-available',
    input: { targetFile },
    output:
      before === undefined
        ? { message: `File deleted: ${targetFile}` }
        : {
            message: `File deleted: ${targetFile}`,
            diffStats: {
              linesAdded: 0,
              linesRemoved: lineCount(before),
              originalContent: before,
              modifiedContent: '',
            },
          },
  }) as unknown as Part;

const textPart = (text = 'ok'): Part => ({ type: 'text', text });

const user = (id: string, createdAt?: number): MyUIMessage =>
  ({
    id,
    role: 'user',
    parts: [textPart('prompt')],
    ...(createdAt === undefined ? {} : { metadata: { createdAt } }),
  }) as unknown as MyUIMessage;

const assistant = (createdAt: number | undefined, parts: Part[]): MyUIMessage =>
  ({
    id: nextId('a'),
    role: 'assistant',
    parts,
    ...(createdAt === undefined ? {} : { metadata: { createdAt } }),
  }) as unknown as MyUIMessage;

const chat = (id: string, createdAt: number, messages: MyUIMessage[]): Chat =>
  ({
    id,
    resourceId: 'res',
    name: id,
    messages,
    createdAt,
    updatedAt: createdAt,
  }) as unknown as Chat;

// ===========================================================================
// isDesignPath
// ===========================================================================

describe('isDesignPath', () => {
  it('should exclude .tau/ internal state and include design files', () => {
    expect(isDesignPath('main.ts')).toBe(true);
    expect(isDesignPath('lib/part.ts')).toBe(true);
    expect(isDesignPath('.tau/parameters/main.json')).toBe(false);
    expect(isDesignPath('.tau/cache/x')).toBe(false);
  });
});

describe('latestTurnHasDesignOps', () => {
  it('should qualify the latest turn only when it contains a committed design-file mutation', () => {
    const messages = [
      user('u1', 100),
      assistant(101, [createPart('main.ts', 'code')]),
      user('u2', 200),
      assistant(201, [textPart('No file changes.')]),
    ];

    expect(latestTurnHasDesignOps(messages)).toBe(false);
    expect(latestTurnHasDesignOps(messages.slice(0, 2))).toBe(true);
  });

  it('should reject internal-state mutations and no-op edits', () => {
    expect(
      latestTurnHasDesignOps([
        user('u1', 100),
        assistant(101, [createPart('.tau/parameters/main.json', '{}'), editPart('main.ts', '', '')]),
      ]),
    ).toBe(false);
  });
});

// ===========================================================================
// extractOps (T-EXTRACT-1, T-EXTRACT-2, T-TAU-EXCLUDE)
// ===========================================================================

describe('extractOps', () => {
  it('should map create/edit/delete parts with correct existedBefore/before/after and ignore non-file parts', () => {
    const c = chat('a', 100, [
      user('u1', 100),
      assistant(101, [
        textPart('reasoning'),
        createPart('new.ts', 'hello'),
        editPart('new.ts', 'hello', 'hello world'),
        deletePart('old.ts', 'gone'),
      ]),
    ]);

    const ops = extractOps(c);

    expect(ops).toHaveLength(3);
    expect(ops[0]).toMatchObject({
      path: 'new.ts',
      kind: 'create',
      existedBefore: false,
      after: 'hello',
    });
    expect(ops[1]).toMatchObject({
      path: 'new.ts',
      kind: 'edit',
      existedBefore: true,
      before: 'hello',
      after: 'hello world',
    });
    expect(ops[2]).toMatchObject({
      path: 'old.ts',
      kind: 'delete',
      existedBefore: true,
      before: 'gone',
    });
  });

  it('should mark a create over an existing file as existedBefore', () => {
    const c = chat('a', 100, [user('u1', 100), assistant(101, [createPart('main.ts', 'v2', 'v1')])]);
    expect(extractOps(c)[0]).toMatchObject({
      kind: 'create',
      existedBefore: true,
      before: 'v1',
      after: 'v2',
    });
  });

  it('should skip no-op edits with zero line changes (E6)', () => {
    const c = chat('a', 100, [user('u1', 100), assistant(101, [editPart('main.ts', '', '')])]);
    expect(extractOps(c)).toHaveLength(0);
  });

  it('should skip tool parts that are not output-available', () => {
    const streaming = {
      type: 'tool-create_file',
      toolCallId: 'x',
      state: 'input-available',
      input: { targetFile: 'a.ts', content: '' },
    } as unknown as Part;
    const c = chat('a', 100, [user('u1', 100), assistant(101, [streaming])]);
    expect(extractOps(c)).toHaveLength(0);
  });

  it('should exclude .tau/ paths (T-TAU-EXCLUDE / H10)', () => {
    const c = chat('a', 100, [
      user('u1', 100),
      assistant(101, [createPart('.tau/parameters/main.json', '{}'), createPart('main.ts', 'code')]),
    ]);
    const ops = extractOps(c);
    expect(ops).toHaveLength(1);
    expect(ops[0]?.path).toBe('main.ts');
  });

  it('should fall back to the preceding user createdAt for an untimed assistant message (T-EXTRACT-2 / H2)', () => {
    const c = chat('a', 100, [user('u1', 500), assistant(undefined, [createPart('main.ts', 'code')])]);
    expect(extractOps(c)[0]?.time).toBe(500);
  });

  it('should prefer the assistant createdAt when present (T-EXTRACT-2)', () => {
    const c = chat('a', 100, [user('u1', 500), assistant(555, [createPart('main.ts', 'code')])]);
    expect(extractOps(c)[0]?.time).toBe(555);
  });
});

// ===========================================================================
// buildTimeline (T-ORDER)
// ===========================================================================

describe('buildTimeline', () => {
  it('should produce a stable total order across chats with same-ms ties broken by (chatId, order)', () => {
    const a = chat('a', 100, [user('ua', 100), assistant(100, [createPart('x.ts', 'x')])]);
    const b = chat('b', 100, [user('ub', 100), assistant(100, [createPart('y.ts', 'y')])]);

    const tl = buildTimeline([b, a]); // Deliberately reversed input order

    expect(tl.map((o) => o.path)).toEqual(['x.ts', 'y.ts']); // ChatId 'a' < 'b'
    expect(tl.map((o) => o.seq)).toEqual([0, 1]);
  });

  it('should assign contiguous seq in time order', () => {
    const a = chat('a', 100, [
      user('u1', 100),
      assistant(101, [createPart('a.ts', '1')]),
      user('u2', 200),
      assistant(201, [editPart('a.ts', '1', '2')]),
    ]);
    const tl = buildTimeline([a]);
    expect(tl.map((o) => o.seq)).toEqual([0, 1]);
    expect(tl.map((o) => o.time)).toEqual([101, 201]);
  });
});

// ===========================================================================
// materializeAt (T-CREATE-EDIT-DELETE, T-CROSS-CHAT, T-IMPORT-CLOSE,
//   T-IDEMPOTENT, T-LEGACY-UNREC, T-MAT-SEQ, edge cases)
// ===========================================================================

describe('materializeAt', () => {
  it('should materialize create→edit→edit→delete correctly at each cutoff (T-CREATE-EDIT-DELETE)', () => {
    const c = chat('a', 0, [
      user('u1', 100),
      assistant(101, [createPart('main.ts', 'v1')]),
      user('u2', 200),
      assistant(201, [editPart('main.ts', 'v1', 'v2')]),
      user('u3', 300),
      assistant(301, [editPart('main.ts', 'v2', 'v3')]),
      user('u4', 400),
      assistant(401, [deletePart('main.ts', 'v3')]),
    ]);
    const tl = buildTimeline([c]);
    const revs = buildRevisions([c], tl);

    expect(materializeAt(tl, revs[0]!.cutoffSeq).write.get('main.ts')).toBe('v1');
    expect(materializeAt(tl, revs[1]!.cutoffSeq).write.get('main.ts')).toBe('v2');
    expect(materializeAt(tl, revs[2]!.cutoffSeq).write.get('main.ts')).toBe('v3');
    expect(materializeAt(tl, revs[3]!.cutoffSeq).remove.has('main.ts')).toBe(true);
  });

  it('should reconcile across chats (T-CROSS-CHAT)', () => {
    const a = chat('a', 0, [
      user('ua', 100),
      assistant(101, [createPart('main.ts', 'mainA'), createPart('util.ts', 'utilA')]),
    ]);
    const b = chat('b', 0, [
      user('ub', 200),
      assistant(201, [editPart('main.ts', 'mainA', 'mainB'), createPart('helper.ts', 'helperB')]),
    ]);
    const tl = buildTimeline([a, b]);
    const revs = buildRevisions([a, b], tl);

    // Restore to A's Revision (the state at the start of B's turn).
    const plan = materializeAt(tl, revs[0]!.cutoffSeq);

    expect(plan.write.get('main.ts')).toBe('mainA');
    expect(plan.write.get('util.ts')).toBe('utilA');
    expect(plan.remove.has('helper.ts')).toBe(true); // Created after the cutoff → removed
  });

  it('should reconstruct imported baseline content from captured ops and leave untouched imports alone (T-IMPORT-CLOSE)', () => {
    // Imported main.ts + README.md have no ops; a chat edits main and deletes README (F8 capture).
    const c = chat('a', 0, [
      user('u1', 100),
      assistant(101, [editPart('main.ts', 'IMPORTED_MAIN', 'edited'), deletePart('README.md', 'IMPORTED_README')]),
    ]);
    const tl = buildTimeline([c]);

    const plan = materializeAt(tl, 0); // Before the chat's only turn

    expect(plan.write.get('main.ts')).toBe('IMPORTED_MAIN'); // Reverts to pre-edit (imported) content
    expect(plan.write.get('README.md')).toBe('IMPORTED_README'); // Captured delete → recoverable
    expect(plan.write.has('untouched.ts')).toBe(false); // Never in the timeline
    expect(plan.remove.size).toBe(0);
  });

  it('should be idempotent — plans depend only on the cutoff, not the call order (T-IDEMPOTENT)', () => {
    const c = chat('a', 0, [
      user('u1', 100),
      assistant(101, [createPart('main.ts', 'v1')]),
      user('u2', 200),
      assistant(201, [editPart('main.ts', 'v1', 'v2')]),
      user('u3', 300),
      assistant(301, [createPart('extra.ts', 'e1')]),
    ]);
    const tl = buildTimeline([c]);

    const serialize = (seqCut: number): string => {
      const p = materializeAt(tl, seqCut);
      return JSON.stringify({
        write: [...p.write].sort((a, b) => a[0].localeCompare(b[0])),
        remove: [...p.remove].sort((a, b) => a.localeCompare(b)),
        unrec: [...p.unrecoverable].sort((a, b) => a.localeCompare(b)),
      });
    };

    // Arbitrary back/forward navigation yields byte-identical plans per cutoff.
    const forward = [1, 2, 3].map((cut) => serialize(cut));
    const shuffled = [3, 1, 2, 1, 3].map((cut) => serialize(cut));
    expect(shuffled).toEqual([forward[2], forward[0], forward[1], forward[0], forward[2]]);
  });

  it('should mark a legacy uncaptured delete as unrecoverable when no earlier op holds the content (T-LEGACY-UNREC)', () => {
    const c = chat('a', 0, [
      user('u1', 100),
      assistant(101, [createPart('a.ts', 'v1')]),
      user('u2', 200),
      assistant(201, [deletePart('orphan.ts' /* legacy: no captured content */)]),
    ]);
    const tl = buildTimeline([c]);
    const revs = buildRevisions([c], tl);

    const plan = materializeAt(tl, revs[0]!.cutoffSeq); // Restore to before the delete

    expect(plan.write.get('a.ts')).toBe('v1');
    expect(plan.unrecoverable.has('orphan.ts')).toBe(true);
    expect(plan.write.has('orphan.ts')).toBe(false);
    expect(plan.remove.has('orphan.ts')).toBe(false);
  });

  it('should split same-millisecond ops by total-order seq, not raw time (T-MAT-SEQ / H5)', () => {
    const a = chat('a', 0, [user('ua', 100), assistant(100, [createPart('x.ts', 'x')])]);
    const b = chat('b', 0, [user('ub', 100), assistant(100, [createPart('y.ts', 'y')])]);
    const tl = buildTimeline([a, b]); // X seq0, y seq1 — identical time 100

    const plan = materializeAt(tl, 1); // Include seq0 only

    expect(plan.write.get('x.ts')).toBe('x');
    expect(plan.write.has('y.ts')).toBe(false);
    expect(plan.remove.has('y.ts')).toBe(true);
  });

  // ---- Edge cases (E1, E2, E5, E7, E-CORNER) --------------------------------

  it('E1: a file created after the cutoff is removed on restore', () => {
    const c = chat('a', 0, [user('u1', 100), assistant(101, [createPart('late.ts', 'v1')])]);
    const tl = buildTimeline([c]);
    expect(materializeAt(tl, 0).remove.has('late.ts')).toBe(true);
  });

  it('E2: a file first edited after the cutoff reverts to its pre-edit content', () => {
    const c = chat('a', 0, [user('u1', 100), assistant(101, [editPart('main.ts', 'before', 'after')])]);
    const tl = buildTimeline([c]);
    expect(materializeAt(tl, 0).write.get('main.ts')).toBe('before');
  });

  it('E7: overwriting an imported file via create_file reverts to the imported content', () => {
    const c = chat('a', 0, [user('u1', 100), assistant(101, [createPart('main.ts', 'new', 'IMPORTED')])]);
    const tl = buildTimeline([c]);
    expect(materializeAt(tl, 0).write.get('main.ts')).toBe('IMPORTED');
  });

  it('E-CORNER: overwriting a pre-existing empty file is treated as a new file and removed on restore', () => {
    // OriginalContent '' and linesRemoved 0 are indistinguishable from a genuine creation.
    const c = chat('a', 0, [user('u1', 100), assistant(101, [createPart('empty.ts', 'content', '')])]);
    const tl = buildTimeline([c]);
    expect(materializeAt(tl, 0).remove.has('empty.ts')).toBe(true);
  });
});

// ===========================================================================
// buildRevisions (T-REV-NUMBER, T-REV-CUTOFF, T-REV-GLOBAL-CUTOFF,
//   T-REV-LEGACY-ANCHOR, T-REV-CHANGED-PATHS)
// ===========================================================================

describe('buildRevisions', () => {
  it('should number only mutating turns contiguously 1..N in global anchor order (T-REV-NUMBER / RV1)', () => {
    const c = chat('a', 0, [
      user('u1', 100),
      assistant(101, [createPart('a.ts', '1')]),
      user('u2', 200), // Q&A only — no ops
      assistant(201, [textPart('just talking')]),
      user('u3', 300),
      assistant(301, [editPart('a.ts', '1', '2')]),
    ]);
    const tl = buildTimeline([c]);
    const revs = buildRevisions([c], tl);

    expect(revs.map((r) => r.n)).toEqual([1, 2]);
    expect(revs.map((r) => r.messageId)).toEqual(['u1', 'u3']); // U2 produced no Revision
  });

  it('should bound a Revision by the next GLOBAL turn, not the next same-chat turn (T-REV-GLOBAL-CUTOFF / H1)', () => {
    const a = chat('a', 0, [user('ua', 10), assistant(11, [createPart('fileA.ts', 'A')])]); // Only turn in A
    const b = chat('b', 0, [user('ub', 100), assistant(101, [createPart('fileB.ts', 'B')])]);
    const tl = buildTimeline([a, b]);
    const revs = buildRevisions([a, b], tl);

    // Restoring A's Revision must yield A's state, NOT the tip (the same-chat-+∞ bug).
    const plan = materializeAt(tl, revs[0]!.cutoffSeq);
    expect(plan.write.get('fileA.ts')).toBe('A');
    expect(plan.remove.has('fileB.ts')).toBe(true);
    expect(plan.write.has('fileB.ts')).toBe(false);
  });

  it('should keep the latest Revision open-ended (+∞) so it materializes the whole timeline (T-REV-CUTOFF)', () => {
    const c = chat('a', 0, [
      user('u1', 100),
      assistant(101, [createPart('a.ts', '1')]),
      user('u2', 200),
      assistant(201, [createPart('b.ts', '2')]),
    ]);
    const tl = buildTimeline([c]);
    const revs = buildRevisions([c], tl);

    const plan = materializeAt(tl, revs.at(-1)!.cutoffSeq);
    expect(plan.write.get('a.ts')).toBe('1');
    expect(plan.write.get('b.ts')).toBe('2');
  });

  it('should build a monotonic anchor without throwing when a user message has no createdAt (T-REV-LEGACY-ANCHOR / H2)', () => {
    const c = chat('a', 50, [user('u1' /* no createdAt */), assistant(undefined, [createPart('a.ts', '1')])]);
    const tl = buildTimeline([c]);
    const revs = buildRevisions([c], tl);

    expect(revs).toHaveLength(1);
    expect(revs[0]!.anchor).toBe(50); // Falls back to chat.createdAt
  });

  it('should carry changedPaths and summed line deltas per Revision (T-REV-CHANGED-PATHS / H8)', () => {
    const c = chat('a', 0, [user('u1', 100), assistant(101, [createPart('a.ts', 'x\ny'), createPart('b.ts', 'z')])]);
    const tl = buildTimeline([c]);
    const revs = buildRevisions([c], tl);

    expect(revs[0]!.changedPaths.sort()).toEqual(['a.ts', 'b.ts']);
    expect(revs[0]!.linesAdded).toBe(3); // 2 + 1
    expect(revs[0]!.linesRemoved).toBe(0);
  });

  it('should carry per-file change totals in files[], one entry per path (T-REV-FILES)', () => {
    const c = chat('a', 0, [user('u1', 100), assistant(101, [createPart('a.ts', 'x\ny'), createPart('b.ts', 'z')])]);
    const revs = buildRevisions([c], buildTimeline([c]));

    expect(revs[0]!.files).toEqual([
      { path: 'a.ts', linesAdded: 2, linesRemoved: 0 },
      { path: 'b.ts', linesAdded: 1, linesRemoved: 0 },
    ]);
  });

  it('should sum repeated-path ops within one turn into a single files[] entry (T-REV-FILES-DEDUPE)', () => {
    const c = chat('a', 0, [
      user('u1', 100),
      assistant(101, [createPart('a.ts', 'x\ny'), editPart('a.ts', 'x\ny', 'x\ny\nz')]),
    ]);
    const revs = buildRevisions([c], buildTimeline([c]));

    expect(revs[0]!.files).toEqual([{ path: 'a.ts', linesAdded: 5, linesRemoved: 2 }]); // (2+3) / (0+2)
    expect(revs[0]!.changedPaths).toEqual(['a.ts']); // Derived — deduped.
  });

  it('should produce no Revision for a turn that only touched .tau/ (T-TAU-EXCLUDE)', () => {
    const c = chat('a', 0, [user('u1', 100), assistant(101, [createPart('.tau/parameters/main.json', '{}')])]);
    const tl = buildTimeline([c]);
    expect(buildRevisions([c], tl)).toHaveLength(0);
  });
});

// ===========================================================================
// buildRevisions — per-turn identity regressions (REVISION MARKER BUGS)
//
// Reproduces the "Cube Design / Initial design" session from the bug report:
//   Turn 1 "a cube"        -> create main.scad         (should be Revision 1)
//   Turn 2 "fillet edges"  -> two edits to main.scad   (should be Revision 2)
// The UI showed only ONE revision (folded onto the 2nd turn) and the first
// user message never got a marker. Root cause: a turn's identity/boundary is a
// non-unique `anchor` TIMESTAMP, so whenever two turns resolve to the SAME
// anchor the earlier turn gets an empty op-slice (`boundary(anchor) ..
// boundary(cutoff===sameAnchor)`) and is dropped, folding its ops into the
// later colliding turn. Two independent real-world triggers below.
// ===========================================================================

describe('buildRevisions — colliding anchors drop the first turn (REGRESSION)', () => {
  it('T-REV-COLLAPSE-USERANCHOR: two mutating turns whose user messages lack createdAt must each be a Revision', () => {
    // Both user messages have no `metadata.createdAt`, so `userAnchor` falls
    // back to `chat.createdAt` for BOTH turns → identical anchors. This is the
    // exact pictured state (single "Revision 1" on the 2nd turn, +10/-5 folded).
    const c = chat('chatA', 50, [
      user('u1' /* no createdAt */),
      assistant(200, [createPart('main.scad', 'a\nb\nc')]),
      user('u2' /* no createdAt */),
      assistant(400, [editPart('main.scad', 'a\nb', 'a\nB'), editPart('main.scad', 'a\nB', 'a\nB\nc\nd\ne')]),
    ]);
    const revs = buildRevisions([c], buildTimeline([c]));

    // BUG: currently returns 1 revision on 'u2' with all ops folded in.
    expect(revs.map((r) => r.messageId)).toEqual(['u1', 'u2']);
    expect(revs.map((r) => r.n)).toEqual([1, 2]);
    // Turn 1 owns the create; turn 2 owns the two edits — not both folded together.
    expect(revs[0]!.changedPaths).toEqual(['main.scad']);
    expect(revs[1]!.changedPaths).toEqual(['main.scad']);
  });

  it('T-REV-COLLAPSE-OPTIME: distinct user turns are kept even when assistant op-times collide past the next anchor', () => {
    // Distinct user anchors (100, 200), but both assistant messages carry the
    // SAME createdAt (500) — as happens when two turns get stamped in one late
    // persist (`stampMessageCreatedAt` uses Date.now() at persist time). Both
    // op-times (500) land at/after turn 2's anchor (200), so turn 1's op-slice
    // `[boundary(100), boundary(200))` is empty and the turn is dropped.
    const c = chat('chatA', 0, [
      user('u1', 100),
      assistant(500, [createPart('main.scad', 'a\nb\nc')]),
      user('u2', 200),
      assistant(500, [editPart('main.scad', 'a\nb', 'a\nB')]),
    ]);
    const revs = buildRevisions([c], buildTimeline([c]));

    // BUG: currently returns 1 revision on 'u2'.
    expect(revs.map((r) => r.messageId)).toEqual(['u1', 'u2']);
    expect(revs).toHaveLength(2);
  });

  it('T-REV-OWNERSHIP: colliding op-times partition files per owning turn and restore to the right cutoff', () => {
    // Both assistant ops share time 500 (late same-persist stamp) with distinct
    // user anchors. Ownership must partition the files per turn (not fold them),
    // and the cutoff must still restore only turn 1's file.
    const c = chat('chatA', 0, [
      user('u1', 100),
      assistant(500, [createPart('a.ts', 'x')]),
      user('u2', 200),
      assistant(500, [createPart('b.ts', 'y')]),
    ]);
    const tl = buildTimeline([c]);
    const revs = buildRevisions([c], tl);

    expect(revs.map((r) => r.messageId)).toEqual(['u1', 'u2']);
    expect(revs[0]!.changedPaths).toEqual(['a.ts']); // Not folded with b.ts.
    expect(revs[1]!.changedPaths).toEqual(['b.ts']);
    const plan = materializeAt(tl, revs[0]!.cutoffSeq);
    expect(plan.write.get('a.ts')).toBe('x');
    expect(plan.remove.has('b.ts')).toBe(true);
  });
});

// ===========================================================================
// computeAbandonedTurnIds (T-ABANDONED)
// ===========================================================================

describe('computeAbandonedTurnIds', () => {
  const revs = [
    {
      n: 1,
      chatId: 'a',
      messageId: 'u1',
      anchor: 100,
      cutoffSeq: 1,
      files: [],
      changedPaths: [],
      linesAdded: 0,
      linesRemoved: 0,
    },
    {
      n: 2,
      chatId: 'a',
      messageId: 'u2',
      anchor: 200,
      cutoffSeq: 2,
      files: [],
      changedPaths: [],
      linesAdded: 0,
      linesRemoved: 0,
    },
    {
      n: 3,
      chatId: 'a',
      messageId: 'u3',
      anchor: 300,
      cutoffSeq: 3,
      files: [],
      changedPaths: [],
      linesAdded: 0,
      linesRemoved: 0,
    },
  ];

  it('should return the message ids of Revisions ordered strictly after the head Revision', () => {
    expect(computeAbandonedTurnIds(revs, revs[0])).toEqual(['u2', 'u3']); // Head = Revision 1.
  });

  it('should return an empty set when the head is the newest Revision', () => {
    expect(computeAbandonedTurnIds(revs, revs[2])).toEqual([]); // Head = Revision 3 (tip).
  });

  it('should abandon everything when there is no head (undefined)', () => {
    expect(computeAbandonedTurnIds(revs, undefined)).toEqual(['u1', 'u2', 'u3']);
  });
});

// ===========================================================================
// migrateHeadTurnId — back-compat read of the persisted head (R6)
// ===========================================================================

describe('migrateHeadTurnId', () => {
  const twoTurnChat = (): Chat[] => [
    chat('a', 0, [
      user('u1', 100),
      assistant(101, [createPart('main.scad', 'a')]),
      user('u2', 200),
      assistant(201, [editPart('main.scad', 'a', 'b')]),
    ]),
  ];

  it('T-MIGRATE-NEW: returns an already-migrated headTurnId as-is (including the tip sentinel)', () => {
    expect(migrateHeadTurnId({ headTurnId: 'u2', supersededTurnIds: [] }, twoTurnChat())).toBe('u2');
    expect(migrateHeadTurnId({ headTurnId: '', supersededTurnIds: [] }, twoTurnChat())).toBe('');
  });

  it('T-MIGRATE-LEGACY-TIP: a legacy restorePoint of 0 maps to the tip sentinel', () => {
    expect(migrateHeadTurnId({ restorePoint: 0, supersededTurnIds: [] }, twoTurnChat())).toBe('');
    expect(migrateHeadTurnId(undefined, twoTurnChat())).toBe('');
  });

  it('T-MIGRATE-LEGACY-ANCHOR: a legacy restorePoint anchor translates to its Revision messageId', () => {
    // Revision 2 anchors on u2 (createdAt 200).
    expect(migrateHeadTurnId({ restorePoint: 200, supersededTurnIds: [] }, twoTurnChat())).toBe('u2');
  });

  it('T-MIGRATE-LEGACY-UNRESOLVED: an anchor that no longer resolves falls back to the tip', () => {
    expect(migrateHeadTurnId({ restorePoint: 999_999, supersededTurnIds: [] }, twoTurnChat())).toBe('');
  });
});

// ===========================================================================
// activeOps (T-BRANCH — the pure supersession filter)
// ===========================================================================

describe('activeOps', () => {
  it('should be identity when no turns are superseded (H11)', () => {
    const chats = [chat('a', 0, [user('u1', 100), assistant(101, [createPart('a.ts', '1')])])];
    expect(activeOps(chats, [])).toBe(chats);
  });

  it('should drop a superseded turn and its trailing assistant ops so forward materialization cannot re-introduce them (T-BRANCH)', () => {
    const c = chat('a', 0, [
      user('u1', 100),
      assistant(101, [createPart('base.ts', 'base')]),
      user('u2', 200), // Abandoned turn
      assistant(201, [createPart('abandoned.ts', 'gone')]),
    ]);

    const filtered = activeOps([c], ['u2']);
    const tl = buildTimeline(filtered);

    expect(tl.map((o) => o.path)).toEqual(['base.ts']); // Abandoned.ts dropped
    // The full (non-superseded) timeline would still contain it, forever.
    const fullPaths = buildTimeline([c]).map((o: FileOp) => o.path);
    expect(fullPaths).toContain('abandoned.ts');
  });
});

// ===========================================================================
// resolveRestore (T-APPLY-ANCHOR / R12)
// ===========================================================================

describe('resolveRestore', () => {
  const twoRevisionChat = (): Chat =>
    chat('a', 0, [
      user('u1', 100),
      assistant(101, [createPart('a.ts', 'v1')]),
      user('u2', 200),
      assistant(201, [editPart('a.ts', 'v1', 'v2')]),
    ]);

  it('should locate the target Revision by messageId and materialize its plan', () => {
    const resolved = resolveRestore([twoRevisionChat()], { messageId: 'u1', anchor: 100 }, []);
    expect(resolved.target).toEqual({ messageId: 'u1', anchor: 100 });
    expect(resolved.n).toBe(1);
    expect(resolved.isLatest).toBe(false); // Revision 1 of 2 — not the tip.
    expect(resolved.plan.write.get('a.ts')).toBe('v1');
  });

  it('should fall back to the anchor when the messageId is stale (R12)', () => {
    const resolved = resolveRestore([twoRevisionChat()], { messageId: 'stale-id', anchor: 100 }, []);
    expect(resolved.target.messageId).toBe('u1');
    expect(resolved.plan.write.get('a.ts')).toBe('v1');
  });

  it('should resolve the RETURN_TO_LATEST sentinel to the newest Revision (isLatest)', () => {
    const resolved = resolveRestore([twoRevisionChat()], { messageId: '', anchor: Number.POSITIVE_INFINITY }, []);
    expect(resolved.target).toEqual({ messageId: 'u2', anchor: 200 });
    expect(resolved.isLatest).toBe(true);
    expect(resolved.plan.write.get('a.ts')).toBe('v2');
  });

  it('should throw when the requested Revision no longer exists (H9)', () => {
    expect(() => resolveRestore([twoRevisionChat()], { messageId: 'nope', anchor: 99_999 }, [])).toThrow(
      'Revision no longer exists',
    );
  });
});
