import { assertRootedPath } from '@taucad/utils/path';

type Navigation = Readonly<{ projectId: string; path: string; paneId?: string; line: number; column: number }>;
type ViewPort = Readonly<{ paneId: string; reveal: (line: number, column: number) => void }>;

const mounted = new Map<string, Set<ViewPort>>();
const pending = new Map<string, Navigation>();
const keyOf = (projectId: string, path: string): string => `${projectId}\u0000${assertRootedPath(path)}`;

/** Queue a rooted jump until the requested source view has mounted. */
export function requestEditorNavigation(navigation: Navigation): void {
  const key = keyOf(navigation.projectId, navigation.path);
  const views = mounted.get(key);
  const target = [...(views ?? [])].find((view) => view.paneId === navigation.paneId) ?? [...(views ?? [])][0];
  pending.set(key, navigation);
  if (target) {
    deliver(key, navigation, target);
  }
}

/**
 * Reveal in a view, keeping the jump queued until that view survives a frame. A view torn down sooner, such as
 * by an effect replay, never laid out the scroll, so its replacement for the same pane reveals it again.
 */
function deliver(key: string, navigation: Navigation, view: ViewPort): void {
  view.reveal(navigation.line, navigation.column);
  requestAnimationFrame(() => {
    if (pending.get(key) === navigation && mounted.get(key)?.has(view)) {
      pending.delete(key);
    }
  });
}

/** Register a visible source view; its teardown removes the navigation handle. */
export function registerEditorView(input: {
  projectId: string;
  path: string;
  paneId: string;
  reveal: ViewPort['reveal'];
}): () => void {
  const key = keyOf(input.projectId, input.path);
  const views = mounted.get(key) ?? new Set<ViewPort>();
  const view = { paneId: input.paneId, reveal: input.reveal };
  views.add(view);
  mounted.set(key, views);
  const queued = pending.get(key);
  if (queued && (!queued.paneId || queued.paneId === input.paneId)) {
    deliver(key, queued, view);
  }
  return () => {
    views.delete(view);
    if (views.size === 0) {
      mounted.delete(key);
    }
  };
}

/** Discard pending jumps when a project provider exits. */
export function clearEditorNavigation(projectId: string): void {
  for (const key of pending.keys()) {
    if (key.startsWith(`${projectId}\u0000`)) {
      pending.delete(key);
    }
  }
}
