import { describe, it, expect, vi } from 'vitest';
import { serializeParameterRecord } from '@taucad/parameters';
import { mock } from 'vitest-mock-extended';
import { EditorDocumentSession, isRecordingEditorConflict } from '#lib/editor-document-session.js';
import type { EditorConflictInput, EditorConflictOutcome } from '@taucad/revisions/revision-effects';
import { FileContentService } from '@taucad/fs-client/file-content-service';
import type { ComposedViewClient } from '@taucad/fs-client/composed-view-client';
import { RefreshGenerationGuard } from '@taucad/fs-client/refresh-generation-guard';
import { WorkerChangeChannel } from '@taucad/fs-client/worker-change-channel';
import { WorkspacePathResolver } from '@taucad/fs-client/workspace-path-resolver';

/*
 * RV-W5b F4 / RV-W5b2 N1–N3: an auto-applied revision (D12) writes a file the
 * editor has open. An editor save is a checked write against the bytes the
 * model was made from; a refused save merges the model's edit onto the file as
 * it now is — never as conflict markers (I7) — or asks the person to choose.
 * The apply's own events are the real pair the mutation pipeline emits: the
 * file moved aside to its backup, then the staged copy renamed onto it.
 */
describe('an editor save racing an applied revision (RV-W5b F4, RV-W5b2 N1–N3)', () => {
  const encode = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);
  const decode = (bytes: Uint8Array<ArrayBuffer> | undefined): string | undefined =>
    bytes === undefined ? undefined : new TextDecoder().decode(bytes);
  const base = 'a\nb\nc\n';
  const typed = 'A\nb\nc\n';
  const arrived = 'a\nb\nC\n';
  const both = 'A\nb\nC\n';
  const backup = '.part.scad.tau-backup.00000000-0000-4000-8000-000000000001.tmp';
  const staged = '.part.scad.tau-staged.00000000-0000-4000-8000-000000000002.tmp';

  const createRace = (path = 'part.scad', initial = base, projectId = 'project') => {
    const file = `/project/${path}`;
    const disk = new Map<string, Uint8Array<ArrayBuffer>>([[file, encode(initial)]]);
    /* Holds the editor's next write in flight, as the worker round trip does. */
    let gate: PromiseWithResolvers<void> | undefined;
    let checkedWrites = 0;
    let failure: { readonly error: Error; readonly from: number } | undefined;
    const inFlight = async (): Promise<void> => {
      const held = gate;
      if (held !== undefined) {
        await held.promise;
      }
    };
    function readFile(filepath: string, options: 'utf8' | { encoding: 'utf8' }): Promise<string>;
    function readFile(filepath: string, options?: { encoding?: undefined }): Promise<Uint8Array<ArrayBuffer>>;
    async function readFile(
      filepath: string,
      options?: 'utf8' | { encoding?: 'utf8' },
    ): Promise<string | Uint8Array<ArrayBuffer>> {
      const data = disk.get(filepath);
      if (data === undefined) {
        throw Object.assign(new Error(`ENOENT: ${filepath}`), { code: 'ENOENT' });
      }
      return options === 'utf8' || options?.encoding === 'utf8' ? new TextDecoder().decode(data) : new Uint8Array(data);
    }
    const proxy = mock<ComposedViewClient>({ readFile });
    proxy.writeFile.mockImplementation(async (filepath, data) => {
      await inFlight();
      disk.set(filepath, typeof data === 'string' ? encode(data) : new Uint8Array(data));
    });
    proxy.writeFileChecked.mockImplementation(async ({ path: target, data, preconditions }) => {
      const index = checkedWrites;
      checkedWrites += 1;
      await inFlight();
      if (failure !== undefined && index >= failure.from) {
        const { error } = failure;
        failure = undefined;
        throw error;
      }
      const actual = disk.get(target) ?? null;
      const expected = preconditions[0]?.expected;
      const wanted = typeof expected === 'string' ? encode(expected) : expected;
      const matches =
        actual === null || wanted === null || wanted === undefined
          ? actual === wanted
          : decode(actual) === decode(wanted);
      if (!matches) {
        return { status: 'conflict', conflicts: [{ path: target, actual }] };
      }
      const content = typeof data === 'string' ? encode(data) : new Uint8Array(data);
      disk.set(target, content);
      return { status: 'applied', content };
    });
    /* The revision client's record: every edit it was handed, held while `recordGate` is. */
    const records: EditorConflictInput[] = [];
    let recordGate: PromiseWithResolvers<void> | undefined;
    let recordFailure: Error | undefined;
    const recordEditorConflict = async (input: EditorConflictInput): Promise<EditorConflictOutcome> => {
      records.push(input);
      await recordGate?.promise;
      if (recordFailure !== undefined) {
        throw recordFailure;
      }
      return { status: 'recorded', revisionId: 'c1', line: `conflicts/main/${projectId}`, into: 'main' };
    };
    let emitWorkerChange: ((event: unknown) => void) | undefined;
    const channel = new WorkerChangeChannel({
      transport: {
        listen: (_event, handler) => {
          emitWorkerChange = handler;
          return vi.fn();
        },
      },
    });
    const contentService = new FileContentService({
      proxy,
      paths: new WorkspacePathResolver('/project'),
      channel,
      refreshGuard: new RefreshGenerationGuard(),
    });
    const session = new EditorDocumentSession({ contentService, projectId, recordEditorConflict });
    const rename = (oldPath: string, newPath: string): void => {
      emitWorkerChange?.({ type: 'fileRenamed', oldPath, newPath, backend: 'indexeddb' });
    };
    return {
      disk,
      file,
      session,
      document: () => session.get(path),
      /** The user types: the model changes, and the change is saved (`handleCodeChange`). */
      type: async (text: string): Promise<void> => {
        const document = session.get(path)!;
        session.apply(path, {
          expectedVersion: document.version,
          origin: 'view',
          changes: [{ from: 0, to: document.text.length, insert: text }],
        });
        await session.save(path);
      },
      holdWrites: (): PromiseWithResolvers<void> => {
        gate = Promise.withResolvers<void>();
        return gate;
      },
      releaseWrites: (held: PromiseWithResolvers<void>): void => {
        gate = undefined;
        held.resolve();
      },
      /** Fail the next checked write that starts from now on. */
      failNextCheckedWrite: (error: Error): void => {
        failure = { error, from: checkedWrites };
      },
      /** An apply that wrote the file in place, as a merge landing does. */
      applied: (text: string): void => {
        disk.set(file, encode(text));
        emitWorkerChange?.({ type: 'fileWritten', path, backend: 'indexeddb' });
      },
      /** `applyTree` moves the file aside before it publishes the staged copy. */
      moveAside: (): void => {
        const held = disk.get(file);
        disk.delete(file);
        if (held !== undefined) {
          disk.set(`/project/${backup}`, held);
        }
        rename(path, backup);
      },
      /** …then renames the staged bytes onto the path. */
      publish: (text: string): void => {
        disk.set(file, encode(text));
        disk.delete(`/project/${backup}`);
        rename(staged, path);
      },
      /** …or, refused, puts the moved bytes back. */
      rollBack: (): void => {
        const held = disk.get(`/project/${backup}`);
        disk.delete(`/project/${backup}`);
        if (held !== undefined) {
          disk.set(file, held);
        }
        rename(backup, path);
      },
      /** A worker rename event, for a swap whose events arrive after the save's answer. */
      rename,
      /** What the revision client was asked to record. */
      records,
      /** Hold the next record in flight. */
      holdRecord: (): PromiseWithResolvers<void> => {
        recordGate = Promise.withResolvers<void>();
        return recordGate;
      },
      /** Refuse the next record. */
      failRecord: (error: Error): void => {
        recordFailure = error;
      },
      dispose: (): void => {
        session.dispose();
        contentService.dispose();
        channel.dispose();
      },
    };
  };

  /** Let the worker round trips and outcome events settle. */
  const drain = async (): Promise<void> => {
    for (let turn = 0; turn < 10; turn += 1) {
      // oxlint-disable-next-line no-await-in-loop -- draining is sequential by definition.
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
    }
  };

  it('scenario A: a keystroke save in flight does not revert the hunk the apply just wrote', async () => {
    const race = createRace();
    try {
      await race.session.acquire('part.scad');
      expect(race.document()?.text).toBe(base);

      const held = race.holdWrites();
      const save = race.type(typed);
      /* The file was clean at the dirty check, so the apply writes the other side's hunk. */
      race.applied(arrived);
      race.releaseWrites(held);
      await save;

      await vi.waitFor(() => {
        expect(decode(race.disk.get(race.file))).toBe(both);
      });
      expect(race.document()?.text).toBe(both);
    } finally {
      race.dispose();
    }
  });

  it('scenario B: a keystroke that lands while the apply swaps the file is kept, and the model survives the swap (N2)', async () => {
    const race = createRace();
    try {
      await race.session.acquire('part.scad');

      const held = race.holdWrites();
      const save = race.type(typed);
      race.moveAside();
      race.releaseWrites(held);
      await drain();
      race.publish(arrived);
      await save;

      await vi.waitFor(() => {
        expect(decode(race.disk.get(race.file))).toBe(both);
      });
      expect(race.document()?.text).toBe(both);
      expect(race.document()?.path).toBe('part.scad');
    } finally {
      race.dispose();
    }
  });

  it('keeps a keystroke refused by a swap whose rename pair arrives after the refusal (RV-W5b2 test gap)', async () => {
    const race = createRace();
    try {
      await race.session.acquire('part.scad');

      const held = race.holdWrites();
      const save = race.type(typed);
      /* The apply swapped the file on disk; its renames are still in the coalescer. */
      race.disk.set(race.file, encode(arrived));
      race.releaseWrites(held);
      await drain();
      /* The worker's batch, about 50 ms after the refusal answered the save. */
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 50);
      });
      race.rename('part.scad', backup);
      race.rename(staged, 'part.scad');
      await save;

      await vi.waitFor(() => {
        expect(decode(race.disk.get(race.file))).toBe(both);
      });
      expect(race.document()?.text).toBe(both);
      expect(race.document()?.path).toBe('part.scad');
    } finally {
      race.dispose();
    }
  });

  it('keeps the model and its undo history when an apply swaps an open file nobody is typing in (N2)', async () => {
    const race = createRace();
    try {
      await race.session.acquire('part.scad');
      const model = race.document();

      race.moveAside();
      await drain();
      race.publish(arrived);

      await vi.waitFor(() => {
        expect(model?.text).toBe(arrived);
      });
      expect(model?.undo()).toMatchObject({ origin: 'undo' });
      expect(model?.text).toBe(base);
      expect(model?.redo()).toMatchObject({ origin: 'redo' });
      expect(model?.text).toBe(arrived);
      expect(race.document()).toBe(model);
    } finally {
      race.dispose();
    }
  });

  it('never writes conflict markers when both sides changed a line: it records the edit as a conflict (N1, I7, D14)', async () => {
    const race = createRace();
    const mine = 'A\nb\nmine\n';
    try {
      await race.session.acquire('part.scad');
      const held = race.holdWrites();
      const save = race.type(mine);
      race.applied(arrived);
      race.releaseWrites(held);
      await save;

      /* The graph holds the edit; the files keep the arrived bytes, and so does the model. */
      expect(race.records).toEqual([{ path: 'part.scad', base, mine }]);
      expect(decode(race.disk.get(race.file))).toBe(arrived);
      expect(race.document()?.text).toBe(arrived);
      for (const bytes of race.disk.values()) {
        expect(decode(bytes)).not.toContain('<<<<<<<');
      }
    } finally {
      race.dispose();
    }
  });

  it('holds only its own project open while a record is in flight, even when its service goes away (RV-W5b2 R2-1)', async () => {
    const alpha = createRace('part.scad', base, 'alpha');
    const beta = createRace('part.scad', base, 'beta');
    try {
      await alpha.session.acquire('part.scad');
      const recording = alpha.holdRecord();
      const held = alpha.holdWrites();
      const save = alpha.type('A\nb\nmine\n');
      alpha.applied(arrived);
      alpha.releaseWrites(held);
      await vi.waitFor(() => {
        expect(alpha.records).toHaveLength(1);
      });
      expect(isRecordingEditorConflict('alpha')).toBe(true);
      expect(isRecordingEditorConflict('beta')).toBe(false);

      /* Switching project disposes the focused project's model service; the record still lands. */
      alpha.session.dispose();
      expect(isRecordingEditorConflict('alpha')).toBe(true);
      recording.resolve();
      await save;
      expect(isRecordingEditorConflict('alpha')).toBe(false);
    } finally {
      alpha.dispose();
      beta.dispose();
    }
  });

  it('records what was typed during the record too, so no keystroke is dropped (RV-W6 F3)', async () => {
    const race = createRace();
    const mine = 'A\nb\nmine\n';
    const more = 'A\nb\nmine and more\n';
    try {
      await race.session.acquire('part.scad');
      const recording = race.holdRecord();
      const held = race.holdWrites();
      const save = race.type(mine);
      race.applied(arrived);
      race.releaseWrites(held);
      await vi.waitFor(() => {
        expect(race.records).toHaveLength(1);
      });
      /* A keystroke inside the round trip: refused like the first, and joined to it. */
      const later = race.type(more);
      recording.resolve();
      await Promise.all([save, later]);

      expect(race.records.map((input) => input.mine)).toStrictEqual([mine, more]);
      expect(race.document()?.text).toBe(arrived);
      expect(decode(race.disk.get(race.file))).toBe(arrived);
    } finally {
      race.dispose();
    }
  });

  it('keeps the text and reports a record that fails, so the next keystroke tries again (RV-W5b2 N3)', async () => {
    const race = createRace();
    const mine = 'A\nb\nmine\n';
    try {
      await race.session.acquire('part.scad');
      race.failRecord(new Error('record refused'));
      const held = race.holdWrites();
      const save = race.type(mine);
      race.applied(arrived);
      race.releaseWrites(held);

      await expect(save).rejects.toThrow('record refused');
      expect(race.document()?.text).toBe(mine);
      expect(decode(race.disk.get(race.file))).toBe(arrived);
      expect(isRecordingEditorConflict('project')).toBe(false);
    } finally {
      race.dispose();
    }
  });

  it('merges a parameter record per key through its codec, never as text (N1)', async () => {
    const record = (values: Record<string, number>): string =>
      new TextDecoder().decode(
        serializeParameterRecord({ activeGroup: 'default', groups: { default: { values } } } as Parameters<
          typeof serializeParameterRecord
        >[0]),
      );
    const path = '.tau/parameters/main.json';
    const race = createRace(path, record({ height: 10, width: 10 }));
    try {
      await race.session.acquire(path);
      const held = race.holdWrites();
      const save = race.type(record({ height: 20, width: 10 }));
      race.applied(record({ height: 10, width: 30 }));
      race.releaseWrites(held);
      await save;

      await vi.waitFor(() => {
        expect(JSON.parse(decode(race.disk.get(race.file)) ?? '{}')).toMatchObject({
          groups: { default: { values: { height: 20, width: 30 } } },
        });
      });
      expect(race.records).toEqual([]);
    } finally {
      race.dispose();
    }
  });

  it('records rather than marking a parameter both sides changed (N1, D14)', async () => {
    const record = (values: Record<string, number>): string =>
      new TextDecoder().decode(
        serializeParameterRecord({ activeGroup: 'default', groups: { default: { values } } } as Parameters<
          typeof serializeParameterRecord
        >[0]),
      );
    const path = '.tau/parameters/main.json';
    const race = createRace(path, record({ height: 10 }));
    try {
      await race.session.acquire(path);
      const held = race.holdWrites();
      void race.type(record({ height: 20 }));
      race.applied(record({ height: 30 }));
      race.releaseWrites(held);
      await drain();

      expect(decode(race.disk.get(race.file))).toBe(record({ height: 30 }));
      expect(race.records).toEqual([{ path, base: record({ height: 10 }), mine: record({ height: 20 }) }]);
    } finally {
      race.dispose();
    }
  });

  it('saves the typed text once an apply that refused it rolls back (N3)', async () => {
    const race = createRace();
    try {
      await race.session.acquire('part.scad');
      const held = race.holdWrites();
      const save = race.type(typed);
      race.moveAside();
      race.releaseWrites(held);
      await drain();
      race.rollBack();
      await save;

      await vi.waitFor(() => {
        expect(decode(race.disk.get(race.file))).toBe(typed);
      });
      expect(race.document()?.text).toBe(typed);
    } finally {
      race.dispose();
    }
  });

  it('reports a failed save of the merged text through the keystroke save it answers (N3)', async () => {
    const race = createRace();
    try {
      await race.session.acquire('part.scad');
      const held = race.holdWrites();
      const save = race.type(typed);
      race.applied(arrived);
      /* The keystroke's checked write is refused; the merged text's save then fails. */
      race.failNextCheckedWrite(new Error('disk full'));
      race.releaseWrites(held);

      await expect(save).rejects.toThrow('disk full');
      expect(decode(race.disk.get(race.file))).toBe(arrived);
      expect(race.document()?.text).toBe(both);
    } finally {
      race.dispose();
    }
  });
});
