// @vitest-environment jsdom
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useProjectListShape } from '#hooks/use-project-list-shape.js';
import { projectListShapeOf, projectListShapeStore } from '#lib/project-list-shape.lib.js';
import { forgetClientFacts } from '#lib/client-facts.js';

afterEach(() => {
  globalThis.localStorage.clear();
  forgetClientFacts();
  projectListShapeStore.reset();
});

describe('useProjectListShape', () => {
  /* P2: the document is the same for every visitor; the head script's count reserves the rows before paint. */
  it('reports an unknown shape on the server, whatever this device remembers', () => {
    projectListShapeStore.remember(projectListShapeOf([{}]));
    const probe = (): React.JSX.Element => createElement('span', null, String(useProjectListShape()?.count));

    expect(renderToString(createElement(probe))).toContain('undefined');
  });

  it('reports an unknown shape without a remembered listing', () => {
    const { result } = renderHook(() => useProjectListShape());

    expect(result.current).toBeUndefined();
  });

  it('follows the client snapshot after a listing', () => {
    projectListShapeStore.remember(projectListShapeOf([{}]));

    const { result } = renderHook(() => useProjectListShape());

    expect(result.current).toEqual({ count: 1, projects: [] });
  });
});
