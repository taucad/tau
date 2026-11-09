import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearEditorNavigation, registerEditorView, requestEditorNavigation } from '#lib/editor-navigation-service.js';

const projectId = 'navigation-test';
const jump = { projectId, path: 'std/sketch.kcl', paneId: 'pane-a', line: 153, column: 11 } as const;

describe('editor navigation', () => {
  let frames: Array<() => void> = [];
  const nextFrame = (): void => {
    const pending = frames;
    frames = [];
    for (const frame of pending) {
      frame();
    }
  };

  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => frames.push(callback));
  });

  afterEach(() => {
    clearEditorNavigation(projectId);
    vi.unstubAllGlobals();
    frames = [];
  });

  it('should reveal in a view that mounts after the request', () => {
    requestEditorNavigation(jump);
    const reveal = vi.fn();
    const dispose = registerEditorView({ projectId, path: jump.path, paneId: 'pane-a', reveal });
    expect(reveal).toHaveBeenCalledWith(153, 11);
    nextFrame();
    dispose();
  });

  it('should reveal again in the replacement when the first view is torn down before a frame', () => {
    requestEditorNavigation(jump);
    const discarded = vi.fn();
    registerEditorView({ projectId, path: jump.path, paneId: 'pane-a', reveal: discarded })();
    const replacement = vi.fn();
    const dispose = registerEditorView({ projectId, path: jump.path, paneId: 'pane-a', reveal: replacement });
    expect(discarded).toHaveBeenCalledOnce();
    expect(replacement).toHaveBeenCalledWith(153, 11);
    nextFrame();
    dispose();
  });

  it('should not reveal again once the view survived a frame', () => {
    const first = vi.fn();
    const disposeFirst = registerEditorView({ projectId, path: jump.path, paneId: 'pane-a', reveal: first });
    requestEditorNavigation(jump);
    expect(first).toHaveBeenCalledOnce();
    nextFrame();
    disposeFirst();
    const later = vi.fn();
    const dispose = registerEditorView({ projectId, path: jump.path, paneId: 'pane-a', reveal: later });
    expect(later).not.toHaveBeenCalled();
    dispose();
  });
});
