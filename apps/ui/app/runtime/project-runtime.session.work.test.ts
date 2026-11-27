/**
 * What a session asks of a built project runtime (A7c, row S6): its close flush over the runtime's producer set,
 * parameter service and both stores, its leave and unload flushes, with no React and no timer. The rows moved here
 * from the project route suite with `flushProjectSessionPersistence`, which the session's `project` child replaced.
 */
import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { ActorRefFrom } from 'xstate';
import { createParameterSetService } from '@taucad/ui-core/services/parameter-set-service';
import type { ParameterSetService } from '@taucad/ui-core/services/parameter-set-service';
import { EditorSaveConflictError } from '@taucad/fs-client/file-content-service';
import type { FileContentService } from '@taucad/fs-client/file-content-service';
import type { projectMachine } from '#machines/project.machine.js';
import type { editorMachine } from '#machines/editor.machine.js';
import { EditorDocumentSession, isRecordingEditorConflict } from '@taucad/editor-ui/lib/editor-document-session';
import { sessionRuntimeWork } from '#runtime/project-runtime.session.js';
import type { SessionRuntimeFlushKind } from '#services/sessions-store.js';

/** One flush of the runtime's parts, as its session's `project` child asks it. */
const flushOf =
  (kind: SessionRuntimeFlushKind) =>
  async ({
    projectId = 'proj-work',
    parameterService,
    projectRef,
    editorRef,
    flushWorkbenchRecords = async () => undefined,
  }: Readonly<{
    projectId?: string;
    parameterService: Pick<ParameterSetService, 'close'>;
    projectRef: ActorRefFrom<typeof projectMachine>;
    editorRef: ActorRefFrom<typeof editorMachine>;
    flushWorkbenchRecords?: () => Promise<void>;
  }>): Promise<void> =>
    sessionRuntimeWork({
      projectId,
      producers: { flushAll: flushWorkbenchRecords },
      parameterService: () => parameterService,
      projectRef,
      editorRef,
    }).flush(kind, new AbortController().signal);

const closeFlush = flushOf('close');

/** Stores that report storing idle at once, recording each `flushNow` in `order`. */
const idleStores = (order: string[]) => {
  const project = mock<ActorRefFrom<typeof projectMachine>>();
  const editor = mock<ActorRefFrom<typeof editorMachine>>();
  const projectSnapshot = mock<ReturnType<ActorRefFrom<typeof projectMachine>['getSnapshot']>>();
  const editorSnapshot = mock<ReturnType<ActorRefFrom<typeof editorMachine>['getSnapshot']>>();
  projectSnapshot.matches.mockReturnValue(true);
  editorSnapshot.matches.mockReturnValue(true);
  project.getSnapshot.mockReturnValue(projectSnapshot);
  editor.getSnapshot.mockReturnValue(editorSnapshot);
  project.send.mockImplementation(() => {
    order.push('project');
  });
  editor.send.mockImplementation(() => {
    order.push('editor');
  });
  return { project, editor };
};

describe('sessionRuntimeWork — the close flush (A7c, S6)', () => {
  it('should settle both stores for a close and leave the parameters open', async () => {
    const order: string[] = [];
    const parameters = mock<ParameterSetService>();
    const project = mock<ActorRefFrom<typeof projectMachine>>();
    const editor = mock<ActorRefFrom<typeof editorMachine>>();
    const projectSnapshot = mock<ReturnType<ActorRefFrom<typeof projectMachine>['getSnapshot']>>();
    const editorSnapshotValue = mock<ReturnType<ActorRefFrom<typeof editorMachine>['getSnapshot']>>();
    projectSnapshot.matches.mockReturnValue(true);
    editorSnapshotValue.matches.mockReturnValue(true);
    project.getSnapshot.mockReturnValue(projectSnapshot);
    editor.getSnapshot.mockReturnValue(editorSnapshotValue);
    parameters.close.mockImplementation(async () => {
      order.push('parameters');
    });
    project.send.mockImplementation(() => {
      order.push('project');
    });
    editor.send.mockImplementation(() => {
      order.push('editor');
    });

    await closeFlush({
      parameterService: parameters,
      projectRef: project,
      editorRef: editor,
    });

    /* An expired close flush leaves a live session, so the flush closes nothing: the parameters close in their own
     * step (A7c review round 1). */
    expect(order).toEqual(['project', 'editor']);
    expect(parameters.close).not.toHaveBeenCalled();
  });

  it('should close the parameter service in its own step, and refuse when parameter settlement fails', async () => {
    const parameters = mock<ParameterSetService>();
    const project = mock<ActorRefFrom<typeof projectMachine>>();
    const editor = mock<ActorRefFrom<typeof editorMachine>>();
    parameters.close.mockRejectedValue(new Error('checked parameter flush failed'));

    const work = sessionRuntimeWork({
      projectId: 'proj-work',
      producers: { flushAll: async () => undefined },
      parameterService: () => parameters,
      projectRef: project,
      editorRef: editor,
    });

    await expect(work.closeParameters()).rejects.toThrow('checked parameter flush failed');
    expect(parameters.close).toHaveBeenCalledTimes(1);
    expect(project.send).not.toHaveBeenCalled();
    expect(editor.send).not.toHaveBeenCalled();
  });

  it('keeps project close retryable until workbench record producers save their latest bytes', async () => {
    const order: string[] = [];
    let offline = true;
    const parameters = mock<ParameterSetService>();
    const project = mock<ActorRefFrom<typeof projectMachine>>();
    const editor = mock<ActorRefFrom<typeof editorMachine>>();
    const projectSnapshot = mock<ReturnType<ActorRefFrom<typeof projectMachine>['getSnapshot']>>();
    const editorSnapshot = mock<ReturnType<ActorRefFrom<typeof editorMachine>['getSnapshot']>>();
    projectSnapshot.matches.mockReturnValue(true);
    editorSnapshot.matches.mockReturnValue(true);
    project.getSnapshot.mockReturnValue(projectSnapshot);
    editor.getSnapshot.mockReturnValue(editorSnapshot);
    parameters.close.mockImplementation(async () => {
      order.push('parameters');
    });
    project.send.mockImplementation(() => {
      order.push('project');
    });
    editor.send.mockImplementation(() => {
      order.push('editor');
    });
    const flushWorkbenchRecords = async (): Promise<void> => {
      order.push('workbench');
      if (offline) {
        throw new Error('checked workbench write unavailable');
      }
    };
    const flush = async () =>
      closeFlush({
        parameterService: parameters,
        projectRef: project,
        editorRef: editor,
        flushWorkbenchRecords,
      });
    await expect(flush()).rejects.toThrow('checked workbench write unavailable');
    expect(order).toEqual(['workbench']);
    offline = false;
    await flush();
    expect(order).toEqual(['workbench', 'workbench', 'project', 'editor']);
  });

  it('should keep the real parameter service usable after record confirmation refuses close', async () => {
    const parameters = createParameterSetService({
      rootDirectory: '/project',
      client: mock<Parameters<typeof createParameterSetService>[0]['client']>(),
      watchReady: vi.fn(),
    });
    const project = mock<ActorRefFrom<typeof projectMachine>>();
    const editor = mock<ActorRefFrom<typeof editorMachine>>();
    try {
      await expect(
        closeFlush({
          parameterService: parameters,
          projectRef: project,
          editorRef: editor,
          flushWorkbenchRecords: async () => {
            throw new Error('Pane layout is not confirmed saved.');
          },
        }),
      ).rejects.toThrow('Pane layout is not confirmed saved.');
      const operation = await parameters.prepareFileOperation({
        kind: 'move',
        oldPath: 'main.ts',
        newPath: 'renamed.ts',
      });
      await operation.rollback();
      expect(project.send).not.toHaveBeenCalled();
      expect(editor.send).not.toHaveBeenCalled();
    } finally {
      await parameters.close();
    }
  });

  it('should refuse the close flush while an editor conflict is being recorded, before anything is torn down (RV-W5b2 R2-1)', async () => {
    const parameters = mock<ParameterSetService>();
    const project = mock<ActorRefFrom<typeof projectMachine>>();
    const editor = mock<ActorRefFrom<typeof editorMachine>>();
    const content = mock<FileContentService>();
    content.addEditorSaveFlusher.mockReturnValue(() => undefined);
    content.retain.mockReturnValue(() => undefined);
    const encode = (value: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(value);
    content.resolve.mockResolvedValue({ kind: 'text', content: encode('one') });
    content.peekOutcome.mockReturnValue({ kind: 'text', content: encode('theirs') });
    content.saveEditor.mockRejectedValueOnce(new EditorSaveConflictError('main.ts', encode('one')));
    content.onDidContentChange.mockReturnValue(() => undefined);
    content.onDidChangeOutcome.mockReturnValue(() => undefined);
    const gate = Promise.withResolvers<void>();
    const session = new EditorDocumentSession({
      contentService: content,
      projectId: 'proj-recording',
      recordEditorConflict: async () => {
        await gate.promise;
        return { status: 'recorded', revisionId: 'r1', line: 'main', into: 'main' };
      },
    });
    try {
      await session.acquire('main.ts');
      session.apply('main.ts', { origin: 'view', expectedVersion: 1, changes: [{ from: 0, to: 3, insert: 'mine' }] });
      const saved = session.save('main.ts');
      await vi.waitFor(() => {
        expect(isRecordingEditorConflict('proj-recording')).toBe(true);
      });
      await expect(
        closeFlush({
          projectId: 'proj-recording',
          parameterService: parameters,
          projectRef: project,
          editorRef: editor,
        }),
      ).rejects.toThrow('An edit that overlapped another change is still being recorded. Try again in a moment.');
      expect(parameters.close).not.toHaveBeenCalled();
      expect(project.send).not.toHaveBeenCalled();
      gate.resolve();
      await saved;
    } finally {
      gate.resolve();
      session.dispose();
    }
  });

  it('should refuse the close flush when project storage reports idle with an error', async () => {
    const parameters = mock<ParameterSetService>();
    const project = mock<ActorRefFrom<typeof projectMachine>>();
    const editor = mock<ActorRefFrom<typeof editorMachine>>();
    const projectFailure = new Error('project save failed');
    const projectSnapshot = {
      matches: () => true,
      context: { error: projectFailure },
    } as unknown as ReturnType<ActorRefFrom<typeof projectMachine>['getSnapshot']>;
    const editorSnapshotValue = {
      matches: () => true,
      context: { error: undefined },
    } as unknown as ReturnType<ActorRefFrom<typeof editorMachine>['getSnapshot']>;
    project.getSnapshot.mockReturnValue(projectSnapshot);
    editor.getSnapshot.mockReturnValue(editorSnapshotValue);

    await expect(
      closeFlush({
        parameterService: parameters,
        projectRef: project,
        editorRef: editor,
      }),
    ).rejects.toThrow('project save failed');
  });
});

describe('sessionRuntimeWork — the leave and unload flushes (A7c, I3, I6)', () => {
  it('should flush the producers and then the editor store for a leave, and leave the parameters open', async () => {
    const order: string[] = [];
    const parameters = mock<ParameterSetService>();
    const { project, editor } = idleStores(order);

    await flushOf('leave')({
      parameterService: parameters,
      projectRef: project,
      editorRef: editor,
      flushWorkbenchRecords: async () => {
        order.push('workbench');
      },
    });

    expect(order).toEqual(['workbench', 'editor']);
    expect(parameters.close).not.toHaveBeenCalled();
  });

  it('should flush the producers and then both stores for an unload, and not refuse on a store write error', async () => {
    const order: string[] = [];
    const parameters = mock<ParameterSetService>();
    const project = mock<ActorRefFrom<typeof projectMachine>>();
    const { editor } = idleStores(order);
    project.getSnapshot.mockReturnValue({
      matches: () => true,
      context: { error: new Error('project save failed') },
    } as unknown as ReturnType<ActorRefFrom<typeof projectMachine>['getSnapshot']>);
    project.send.mockImplementation(() => {
      order.push('project');
    });

    await flushOf('unload')({
      parameterService: parameters,
      projectRef: project,
      editorRef: editor,
      flushWorkbenchRecords: async () => {
        order.push('workbench');
      },
    });

    expect(order).toEqual(['workbench', 'project', 'editor']);
    expect(parameters.close).not.toHaveBeenCalled();
  });

  it("should hold both stores on an unload until the producers' writes settle (A0.2 item 10, S40)", async () => {
    const order: string[] = [];
    const parameters = mock<ParameterSetService>();
    const { project, editor } = idleStores(order);
    const producer = Promise.withResolvers<void>();

    const flushed = flushOf('unload')({
      parameterService: parameters,
      projectRef: project,
      editorRef: editor,
      flushWorkbenchRecords: async () => producer.promise,
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(order).toEqual([]);

    producer.resolve();
    await flushed;
    expect(order).toEqual(['project', 'editor']);
  });

  it("should still ask both stores to write on an unload a producer refuses, and reject with the producer's refusal", async () => {
    const order: string[] = [];
    const parameters = mock<ParameterSetService>();
    const { project, editor } = idleStores(order);

    const flushed = flushOf('unload')({
      parameterService: parameters,
      projectRef: project,
      editorRef: editor,
      flushWorkbenchRecords: async () => {
        throw new Error('Pane layout is not confirmed saved.');
      },
    });

    await expect(flushed).rejects.toThrow('Pane layout is not confirmed saved.');
    expect(order).toEqual(['project', 'editor']);
  });

  it("should refuse an unload only with a producer's refusal when a store fails before it settles", async () => {
    const order: string[] = [];
    const parameters = mock<ParameterSetService>();
    const { project, editor } = idleStores(order);
    const failing = mock<ReturnType<ActorRefFrom<typeof projectMachine>['getSnapshot']>>();
    failing.matches.mockImplementation((value) => value === 'ready');
    project.getSnapshot.mockReturnValue(failing);
    project.subscribe.mockImplementation(((observer: { error?: (error: unknown) => void }) => {
      observer.error?.(new Error('project store failed'));
      return { unsubscribe: () => undefined };
    }) as unknown as ActorRefFrom<typeof projectMachine>['subscribe']);
    const input = (refusal: boolean) => ({
      parameterService: parameters,
      projectRef: project,
      editorRef: editor,
      flushWorkbenchRecords: async () => {
        if (refusal) {
          throw new Error('Pane layout is not confirmed saved.');
        }
      },
    });

    await expect(flushOf('unload')(input(true))).rejects.toThrow('Pane layout is not confirmed saved.');
    await expect(flushOf('unload')(input(false))).resolves.toBeUndefined();
    expect(order).toEqual(['project', 'editor', 'project', 'editor']);
  });
});
