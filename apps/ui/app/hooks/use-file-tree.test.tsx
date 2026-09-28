import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileEntry } from '@taucad/types';
import { useFileTreeEntry } from '#hooks/use-file-tree.js';

let tree = new Map<string, FileEntry>();
const listeners = new Set<() => void>();
const treeService = {
  getTreeSnapshot: () => tree,
  subscribeTree: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

vi.mock('#hooks/use-file-manager.js', () => ({
  useOptionalFileManager: () => ({ treeService }),
}));

const entry = (path: string): FileEntry => ({
  path,
  name: path,
  type: 'file',
  contentKind: 'binary',
  size: 1,
  mtimeMs: 1,
  isLoaded: true,
});

const publish = (next: Map<string, FileEntry>): void => {
  act(() => {
    tree = next;
    for (const listener of listeners) {
      listener();
    }
  });
};

describe('useFileTreeEntry', () => {
  beforeEach(() => {
    listeners.clear();
    tree = new Map([['image.png', entry('image.png')]]);
  });

  it('keeps the selected file stable when another file changes', () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useFileTreeEntry('image.png');
    });
    const selected = result.current;
    const initialRenders = renders;

    publish(new Map([...tree, ['other.txt', entry('other.txt')]]));
    expect(renders).toBe(initialRenders);
    expect(result.current).toBe(selected);

    const changed = entry('image.png');
    publish(new Map([...tree, ['image.png', changed]]));
    expect(result.current).toBe(changed);
    expect(renders).toBeGreaterThan(initialRenders);
  });
});
