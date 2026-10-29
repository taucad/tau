import { useEffect, useMemo, useState } from 'react';
import { EditorDocument } from '#lib/editor-document.js';
import { Button } from '@taucad/ui/components/button';
import { cn } from '@taucad/ui/utils/cn';
import { CodeEditor } from '#components/code/code-editor.client.js';
import type { CodeEditorProps } from '#components/code/code-editor.client.js';

/** One `<<<<<<< / ======= / >>>>>>>` block, by zero-based line index. */
type ConflictHunk = Readonly<{ open: number; middle: number; close: number }>;

const openMarker = '<<<<<<<';
const splitMarker = '=======';
const closeMarker = '>>>>>>>';

/**
 * Find the marker blocks in materialized conflict text.
 *
 * The format is the one every merge tool writes, so the parser is the one every
 * merge tool has: an open line, a split line, a close line. A block that never
 * closes is skipped rather than guessed at — half a hunk has no side to keep.
 *
 * @param lines - The materialized text, split on newlines.
 * @returns Each complete block, in file order.
 */
export const conflictHunks = (lines: readonly string[]): readonly ConflictHunk[] => {
  const hunks: ConflictHunk[] = [];
  let open: number | undefined;
  let middle: number | undefined;
  for (const [index, line] of lines.entries()) {
    if (line.startsWith(openMarker)) {
      open = index;
      middle = undefined;
      continue;
    }
    if (open !== undefined && line.startsWith(splitMarker)) {
      middle = index;
      continue;
    }
    if (open !== undefined && middle !== undefined && line.startsWith(closeMarker)) {
      hunks.push({ open, middle, close: index });
      open = undefined;
      middle = undefined;
    }
  }
  return hunks;
};

/**
 * Replace one block with the side a person kept.
 *
 * @param lines - The current buffer, split on newlines.
 * @param hunk - The block to settle.
 * @param side - Which half survives.
 * @returns The buffer with that block replaced by the chosen half.
 */
export const keepHunkSide = (
  lines: readonly string[],
  hunk: ConflictHunk,
  side: 'mine' | 'theirs',
): readonly string[] => [
  ...lines.slice(0, hunk.open),
  ...(side === 'mine' ? lines.slice(hunk.open + 1, hunk.middle) : lines.slice(hunk.middle + 1, hunk.close)),
  ...lines.slice(hunk.close + 1),
];

/**
 * The editable conflict mode (canvas "Conflicts", brief item 5, P43).
 *
 * A conflicted file has no bytes on disk to open — the markers exist only as a
 * value the worker renders from the three recorded terms (A22) — so this is a
 * buffer, not a file: a local document holds the materialized text, the markers are
 * decorated so the blocks are findable, and *Mark resolved* hands the bytes
 * back through `resolvedInEditor`. Nothing here writes a tree, and the file's
 * row closes when the machine records the choice.
 *
 * Per-hunk *Keep mine* / *Keep theirs* rewrite the buffer rather than sending a
 * verb: a file with two blocks can want one of each, which a single side for
 * the whole path cannot say.
 *
 * @param props - The file, its materialized text, and where a resolution goes.
 * @returns The buffer, its per-block verbs, and *Mark resolved*.
 */
export function RevisionConflictEditor({
  path,
  text,
  isBusy,
  onResolved,
  className,
}: {
  readonly path: string;
  readonly text: string;
  readonly isBusy: boolean;
  readonly onResolved: (content: string) => void;
  readonly className?: string;
}): React.JSX.Element {
  const [document, setDocument] = useState(() => new EditorDocument(`conflict/${path}`, text));
  const [draft, setDraft] = useState(text);

  useEffect(() => {
    const next = new EditorDocument(`conflict/${path}`, text);
    // oxlint-disable-next-line react/set-state-in-effect -- a new conflict materialization replaces the entire local draft.
    setDocument(next);
    setDraft(text);
  }, [path, text]);

  const lines = useMemo(() => draft.split('\n'), [draft]);
  const hunks = useMemo(() => conflictHunks(lines), [lines]);
  const lineHighlights = useMemo<NonNullable<CodeEditorProps['lineHighlights']>>(
    () =>
      hunks.flatMap((hunk) => [
        { fromLine: hunk.open + 1, toLine: hunk.middle, tone: 'mine' },
        { fromLine: hunk.middle + 1, toLine: hunk.close + 1, tone: 'theirs' },
      ]),
    [hunks],
  );
  const replaceDraft = (next: string): void => {
    const accepted = document.apply({
      changes: [{ from: 0, to: document.text.length, insert: next }],
      origin: 'conflict-resolution',
      expectedVersion: document.version,
    });
    if (accepted) {
      setDraft(document.text);
    }
  };

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className='flex flex-wrap items-center gap-1'>
        {hunks.map((hunk, index) => (
          <span key={hunk.open} className='flex items-center gap-1'>
            <span className='text-xs text-muted-foreground'>{`Change ${String(index + 1)}`}</span>
            <Button
              size='xs'
              variant='ghost'
              disabled={isBusy}
              aria-label={`Keep mine in change ${String(index + 1)} of ${path}`}
              onClick={() => {
                replaceDraft(keepHunkSide(lines, hunk, 'mine').join('\n'));
              }}
            >
              Keep mine
            </Button>
            <Button
              size='xs'
              variant='ghost'
              disabled={isBusy}
              aria-label={`Keep theirs in change ${String(index + 1)} of ${path}`}
              onClick={() => {
                replaceDraft(keepHunkSide(lines, hunk, 'theirs').join('\n'));
              }}
            >
              Keep theirs
            </Button>
          </span>
        ))}
        <span className='flex-1' />
        <Button
          size='xs'
          /* Only once no marker is left: handing back a buffer that still holds
             `<<<<<<<` would write the markers into the tree, which is the one
             thing a conflict value exists to prevent (A22). */
          disabled={isBusy || hunks.length > 0}
          aria-label={`Mark ${path} resolved`}
          onClick={() => {
            onResolved(draft);
          }}
        >
          Mark resolved
        </Button>
      </div>
      <CodeEditor
        className='h-64 rounded-md border'
        document={document}
        viewId={`conflict/${path}`}
        languageId='plaintext'
        showLineNumbers={false}
        lineHighlights={lineHighlights}
        onApply={(transaction) => {
          const accepted = document.apply(transaction);
          if (accepted) {
            setDraft(document.text);
          }
          return accepted;
        }}
        onHistory={(kind) => {
          const changed = document[kind](`conflict/${path}`);
          if (changed) {
            setDraft(document.text);
          }
          return changed;
        }}
      />
    </div>
  );
}
