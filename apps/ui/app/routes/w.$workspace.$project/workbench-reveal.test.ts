import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EditorStateMachineRef } from '#machines/editor.machine.js';
import { holdUnheardReveal, subscribeWorkbenchReveal } from '#routes/w.$workspace.$project/workbench-reveal.js';

const target = { entryPath: 'main.ts', unitId: 'unit-1', componentId: 'wheel' };

/** An editor whose reveal emits also reach the workspace, as `ProjectWorkspaceProvider` wires it. */
function createEditor(): { editorRef: EditorStateMachineRef; emit: (type: string) => void } {
  const handlers = new Map<string, Set<(event: unknown) => void>>();
  const editorRef = {
    on(type: string, handler: (event: unknown) => void) {
      const set = handlers.get(type) ?? new Set();
      set.add(handler);
      handlers.set(type, set);
      return {
        unsubscribe() {
          set.delete(handler);
        },
      };
    },
  } as unknown as EditorStateMachineRef;
  const emit = (type: string): void => {
    holdUnheardReveal(editorRef, type === 'modelComponentRevealRequested' ? 'model' : 'kinematics', target);
    for (const handler of handlers.get(type) ?? []) {
      handler({ type, ...target });
    }
  };
  return { editorRef, emit };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('subscribeWorkbenchReveal', () => {
  it('should drop a held reveal no pane took within 10s, so a pane opened later does not jump to it', () => {
    vi.useFakeTimers();
    const { editorRef, emit } = createEditor();
    emit('modelComponentRevealRequested');
    vi.advanceTimersByTime(10_001);

    const late = vi.fn();
    subscribeWorkbenchReveal(editorRef, 'model', late);
    expect(late).not.toHaveBeenCalled();
  });

  it('should still hand over a held reveal taken within 10s, as a slow cold chunk needs', () => {
    vi.useFakeTimers();
    const { editorRef, emit } = createEditor();
    emit('kinematicsRevealRequested');
    vi.advanceTimersByTime(9000);

    const prompt = vi.fn();
    subscribeWorkbenchReveal(editorRef, 'kinematics', prompt);
    expect(prompt).toHaveBeenCalledExactlyOnceWith(target);
  });

  it('should hand a reveal no pane heard to the next pane that subscribes, once', () => {
    const { editorRef, emit } = createEditor();
    emit('modelComponentRevealRequested');

    const first = vi.fn();
    const unsubscribe = subscribeWorkbenchReveal(editorRef, 'model', first);
    expect(first).toHaveBeenCalledExactlyOnceWith(target);
    unsubscribe();

    const second = vi.fn();
    subscribeWorkbenchReveal(editorRef, 'model', second);
    expect(second).not.toHaveBeenCalled();
  });

  it('should not hold a reveal a mounted pane heard, so a remount does not replay it', () => {
    const { editorRef, emit } = createEditor();
    const mounted = vi.fn();
    const unsubscribe = subscribeWorkbenchReveal(editorRef, 'model', mounted);
    emit('modelComponentRevealRequested');
    expect(mounted).toHaveBeenCalledExactlyOnceWith(target);
    unsubscribe();

    const remounted = vi.fn();
    subscribeWorkbenchReveal(editorRef, 'model', remounted);
    expect(remounted).not.toHaveBeenCalled();
  });

  it('should keep model and kinematics reveals apart', () => {
    const { editorRef, emit } = createEditor();
    emit('kinematicsRevealRequested');

    const model = vi.fn();
    subscribeWorkbenchReveal(editorRef, 'model', model);
    expect(model).not.toHaveBeenCalled();

    const kinematics = vi.fn();
    subscribeWorkbenchReveal(editorRef, 'kinematics', kinematics);
    expect(kinematics).toHaveBeenCalledExactlyOnceWith(target);
  });
});
