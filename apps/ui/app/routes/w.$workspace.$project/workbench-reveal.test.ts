import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EditorStateMachineRef } from '#machines/editor.machine.js';
import {
  heldRevealLifetimeMilliseconds,
  holdUnheardFileReveal,
  holdUnheardReveal,
  subscribeWorkbenchFileReveal,
  runWhenRendered,
  subscribeWorkbenchReveal,
} from '#routes/w.$workspace.$project/workbench-reveal.js';

const fileTarget = { path: 'parts/nested/wheel.ts', expandTarget: false };
const target = { entryPath: 'main.ts', unitId: 'unit-1', componentId: 'wheel' };

/** An editor whose reveal emits also reach the workspace, as `ProjectWorkspaceProvider` wires it. */
function createEditor(workspaceFirst = true): { editorRef: EditorStateMachineRef; emit: (type: string) => void } {
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
    const event = { type, ...(type === 'fileRevealRequested' ? fileTarget : target) };
    const hold = (): void => {
      if ('path' in event) {
        holdUnheardFileReveal(editorRef, event);
      } else {
        holdUnheardReveal(editorRef, type === 'modelComponentRevealRequested' ? 'model' : 'kinematics', target);
      }
    };
    if (workspaceFirst) {
      hold();
    }
    for (const handler of handlers.get(type) ?? []) {
      handler(event);
    }
    if (!workspaceFirst) {
      hold();
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

describe('subscribeWorkbenchFileReveal', () => {
  it('should hand a cold Files pane the latest exact target once, including folder expansion', () => {
    const { editorRef, emit } = createEditor();
    emit('fileRevealRequested');
    const folder = { path: 'parts/nested', expandTarget: true };
    holdUnheardFileReveal(editorRef, folder);
    const heard = vi.fn();
    const unsubscribe = subscribeWorkbenchFileReveal(editorRef, heard);
    expect(heard).toHaveBeenCalledExactlyOnceWith(folder);
    unsubscribe();
    const remounted = vi.fn();
    subscribeWorkbenchFileReveal(editorRef, remounted)();
    expect(remounted).not.toHaveBeenCalled();
  });

  it('should keep file reveals separate from component reveals and other editors', () => {
    const first = createEditor();
    const second = createEditor();
    first.emit('fileRevealRequested');
    const unrelated = vi.fn();
    subscribeWorkbenchReveal(first.editorRef, 'model', unrelated)();
    subscribeWorkbenchFileReveal(second.editorRef, unrelated)();
    expect(unrelated).not.toHaveBeenCalled();
    const heard = vi.fn();
    subscribeWorkbenchFileReveal(first.editorRef, heard)();
    expect(heard).toHaveBeenCalledExactlyOnceWith(fileTarget);
  });

  it('should leave a held file reveal for the next eligible tree', () => {
    const { editorRef, emit } = createEditor();
    const inactive = vi.fn();
    const stopInactive = subscribeWorkbenchFileReveal(editorRef, inactive, () => false);
    emit('fileRevealRequested');
    const active = vi.fn();
    subscribeWorkbenchFileReveal(editorRef, active, () => true)();
    expect(inactive).not.toHaveBeenCalled();
    expect(active).toHaveBeenCalledExactlyOnceWith(fileTarget);
    stopInactive();
  });

  it('should drop a stale file reveal after ten seconds', () => {
    vi.useFakeTimers();
    const { editorRef, emit } = createEditor();
    emit('fileRevealRequested');
    vi.advanceTimersByTime(10_001);
    const heard = vi.fn();
    subscribeWorkbenchFileReveal(editorRef, heard)();
    expect(heard).not.toHaveBeenCalled();
  });

  it.each([true, false])('should not replay live file reveals when workspace-first is %s', (workspaceFirst) => {
    const { editorRef, emit } = createEditor(workspaceFirst);
    const heard = vi.fn();
    const unsubscribe = subscribeWorkbenchFileReveal(editorRef, heard);
    emit('fileRevealRequested');
    expect(heard).toHaveBeenCalledExactlyOnceWith(fileTarget);
    unsubscribe();
    const remounted = vi.fn();
    subscribeWorkbenchFileReveal(editorRef, remounted)();
    expect(remounted).not.toHaveBeenCalled();
  });
});

describe('runWhenRendered', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should run the step on the first frame its target has rendered, once', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    let isRendered = false;
    const step = vi.fn<() => void>();
    runWhenRendered(() => (isRendered ? step : undefined));

    vi.advanceTimersByTime(16 * 5);
    expect(step).not.toHaveBeenCalled();

    isRendered = true;
    vi.advanceTimersByTime(16 * 5);
    expect(step).toHaveBeenCalledOnce();
  });

  it('should stop asking once a held reveal would have lapsed', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    const locate = vi.fn<() => (() => void) | undefined>(() => undefined);
    runWhenRendered(locate);

    vi.advanceTimersByTime(heldRevealLifetimeMilliseconds + 1000);
    const asked = locate.mock.calls.length;
    vi.advanceTimersByTime(1000);

    expect(asked).toBeGreaterThan(0);
    expect(locate).toHaveBeenCalledTimes(asked);
  });

  it('should never run the step once cancelled, as when a newer reveal replaces it or the pane unmounts', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    let isRendered = false;
    const step = vi.fn<() => void>();
    const locate = vi.fn<() => (() => void) | undefined>(() => (isRendered ? step : undefined));
    const cancel = runWhenRendered(locate);
    vi.advanceTimersByTime(16 * 3);
    const asked = locate.mock.calls.length;

    cancel();
    isRendered = true;
    vi.advanceTimersByTime(1000);

    expect(step).not.toHaveBeenCalled();
    expect(locate).toHaveBeenCalledTimes(asked);
  });
});
