/**
 * The project's print intent at `.tau/machines/printer.json`: the printer model plus the print
 * settings a person or agent changed. It is read and watched through the file manager and written
 * with checked writes whose one precondition is the last bytes this hook saw, as the parameter
 * record is: a conflict re-reads and applies the change again, the third conflict gives up with
 * `RECORD_CONFLICT`, and the watch echo of its own write changes nothing. The record's state
 * machine is not needed here: this file has no manifest revision, queue or confirmation step.
 *
 * @module
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSelector } from '@xstate/react';
import { printIntentPath, readPrintIntent, serializePrintIntent } from '@taucad/slicer/print-intent';
import type { PrintIntent } from '@taucad/slicer/print-intent';
import { joinPath } from '@taucad/utils/path';
import { useFileManager } from '#hooks/use-file-manager.js';

/** The print intent file as last read. @public */
export type PrintIntentFile =
  | Readonly<{ status: 'loading' | 'absent' | 'invalid' }>
  | Readonly<{ status: 'current'; intent: PrintIntent }>;

/** One change to the print intent; after a conflict it is applied again to the newer file. @public */
export type PrintIntentEdit = (intent: PrintIntent) => PrintIntent;

/** The print intent, why its last change failed, and its two writes. @public */
export type PrintIntentHandle = Readonly<{
  file: PrintIntentFile;
  /** The file's intent when it names the selected printer's model; otherwise every default applies. */
  intent: PrintIntent | undefined;
  /** Why the last change was not saved. */
  error: string | undefined;
  /**
   * Save a change, creating the file on the first one. A file written for another model is replaced;
   * a file that cannot be read is left as it is, because only a reset may discard it.
   */
  update: (edit: PrintIntentEdit) => void;
  /** Rewrite the file as `{ model }`, including a file that cannot be read. */
  reset: () => void;
}>;

/** What this hook last saw on disk: `bytes` is absent when the file is. */
type Seen = Readonly<{ bytes?: Uint8Array<ArrayBuffer> }>;

const maximumAttempts = 3;
const conflictMessage =
  'The print settings changed elsewhere three times while saving, so this change was not saved (RECORD_CONFLICT). Make it again.';
const loadingFile: PrintIntentFile = { status: 'loading' };

const sameBytes = (left: Uint8Array<ArrayBuffer> | undefined, right: Uint8Array<ArrayBuffer> | undefined): boolean => {
  if (left === undefined || right === undefined) {
    return left === right;
  }
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
};

const describeFile = ({ bytes }: Seen): PrintIntentFile => {
  if (bytes === undefined) {
    return { status: 'absent' };
  }
  const read = readPrintIntent(bytes);
  return read.status === 'current' ? read : { status: 'invalid' };
};

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * Read, watch and write the project's print intent for one printer model.
 *
 * @param model - The selected printer's manifest `identity.model`; without one nothing is written.
 * @returns The file, the intent that applies to `model`, the last save error, and `update` and `reset`.
 * @public
 */
export const usePrintIntent = (model: string | undefined): PrintIntentHandle => {
  const { parameterFiles, contentService, fileManagerRef } = useFileManager();
  const root = useSelector(fileManagerRef, (state) => state.context.rootDirectory);
  // ponytail: the parameter sidecar's slice already is the checked single-file writer; the print intent shares it.
  const path = joinPath(root, printIntentPath);
  /* Keyed by path, so a new project root reads as loading without resetting state in an effect. */
  const [read, setRead] = useState<Readonly<{ path: string; file: PrintIntentFile }>>();
  const [failure, setFailure] = useState<string>();
  const seenRef = useRef<Seen>(undefined);
  /* Every read and write takes a ticket; a read that finishes after a newer one started is dropped. */
  const ticketRef = useRef(0);
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  const take = useCallback(
    (seen: Seen): void => {
      if (seenRef.current !== undefined && sameBytes(seenRef.current.bytes, seen.bytes)) {
        return; // The echo of this hook's own write, or a notification that changed nothing.
      }
      seenRef.current = seen;
      setRead({ path, file: describeFile(seen) });
    },
    [path],
  );

  const load = useCallback(async (): Promise<Seen> => {
    ticketRef.current += 1;
    const ticket = ticketRef.current;
    const seen: Seen = (await parameterFiles.exists(path)) ? { bytes: await parameterFiles.readFile(path) } : {};
    if (ticket === ticketRef.current) {
      take(seen);
    }
    return seen;
  }, [parameterFiles, path, take]);

  useEffect(() => {
    seenRef.current = undefined;
    const refresh = async (): Promise<void> => {
      try {
        await load();
      } catch (error) {
        setFailure(`The print settings could not be read: ${errorText(error)}`);
      }
    };
    // async-iife: bootstrap -- the watch starts a newer read for every change, which supersedes this one.
    void refresh();
    return contentService?.subscribe(printIntentPath, () => {
      void refresh();
    });
  }, [contentService, load]);

  const save = useCallback(
    async (edit: PrintIntentEdit, isReset: boolean): Promise<void> => {
      if (model === undefined) {
        // ponytail: a provider without a manifest has no model to name, so its settings stay unsaved.
        return;
      }
      setFailure(undefined);
      try {
        let seen = seenRef.current ?? (await load());
        for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
          const current = describeFile(seen);
          if (current.status === 'invalid' && !isReset) {
            return;
          }
          const base = current.status === 'current' && current.intent.model === model ? current.intent : { model };
          // oxlint-disable-next-line eslint/no-await-in-loop -- each attempt writes against what the last one lost to.
          const result = await parameterFiles.writeFileChecked({
            path,
            data: serializePrintIntent(edit(base)),
            preconditions: [{ path, expected: seen.bytes ?? null }],
          });
          if (result.status !== 'conflict') {
            ticketRef.current += 1;
            take({ bytes: result.content });
            return;
          }
          // oxlint-disable-next-line eslint/no-await-in-loop -- the next attempt applies the change to this read.
          seen = await load();
        }
        setFailure(conflictMessage);
      } catch (error) {
        setFailure(`The print settings were not saved: ${errorText(error)}`);
      }
    },
    [load, model, parameterFiles, path, take],
  );

  /* One change at a time, so this pane's own changes never conflict with each other. */
  const enqueue = useCallback(
    (edit: PrintIntentEdit, isReset: boolean): void => {
      const previous = queueRef.current;
      queueRef.current = (async () => {
        await previous;
        await save(edit, isReset);
      })();
    },
    [save],
  );
  const update = useCallback(
    (edit: PrintIntentEdit): void => {
      enqueue(edit, false);
    },
    [enqueue],
  );
  const reset = useCallback((): void => {
    enqueue((intent) => ({ model: intent.model }), true);
  }, [enqueue]);

  const file = read?.path === path ? read.file : loadingFile;
  const intent = file.status === 'current' && file.intent.model === model ? file.intent : undefined;
  return { file, intent, error: failure, update, reset };
};
