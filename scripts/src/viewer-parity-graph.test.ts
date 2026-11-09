import { createProjectGraphAsync, readCachedProjectGraph } from '@nx/devkit';
import type { ProjectGraph } from '@nx/devkit';
import { describe, expect, it } from 'vitest';

/*
 * `tau-examples:test:viewer-parity` scores nanoraster (`image`) against the references `viewer:capture:viewer-parity`
 * writes, but neither project is imported by `tau-examples`, so without a declared edge a viewer change never selects
 * the gate through `nx affected`. `libs/tau-examples/project.json` declares both as implicit dependencies; this test
 * keeps the edge from being dropped while the target still lives there.
 */

const projectGraph = async (): Promise<ProjectGraph> => {
  try {
    return readCachedProjectGraph();
  } catch {
    return createProjectGraphAsync();
  }
};

const closure = (graph: ProjectGraph, project: string): ReadonlySet<string> => {
  const seen = new Set<string>();
  const pending = [project];
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    for (const { target } of graph.dependencies[next] ?? []) {
      if (!seen.has(target)) {
        seen.add(target);
        pending.push(target);
      }
    }
  }
  return seen;
};

describe('viewer parity graph', () => {
  it('keeps test:viewer-parity on tau-examples and the viewer capture on viewer', async () => {
    const graph = await projectGraph();

    expect(Object.keys(graph.nodes['tau-examples']?.data.targets ?? {})).toContain('test:viewer-parity');
    expect(Object.keys(graph.nodes['viewer']?.data.targets ?? {})).toContain('capture:viewer-parity');
  });

  it('puts viewer and image in the closure of the project that owns test:viewer-parity', async () => {
    const graph = await projectGraph();
    const owners = Object.values(graph.nodes)
      .filter(({ data }) => Object.hasOwn(data.targets ?? {}, 'test:viewer-parity'))
      .map(({ name }) => name);

    expect(owners).toEqual(['tau-examples']);
    for (const owner of owners) {
      expect([...closure(graph, owner)]).toEqual(expect.arrayContaining(['viewer', 'image']));
    }
  });

  it('declares the edges directly, so they survive an import change in either project', async () => {
    const graph = await projectGraph();
    const direct = (graph.dependencies['tau-examples'] ?? []).map(({ target, type }) => ({ target, type }));

    expect(direct).toEqual(
      expect.arrayContaining([
        { target: 'viewer', type: 'implicit' },
        { target: 'image', type: 'implicit' },
      ]),
    );
  });
});
