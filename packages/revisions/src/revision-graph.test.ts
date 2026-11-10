/**
 * The History graph read, over a real port (History D1).
 *
 * The claim under test is the line each entry is drawn on: `main`'s first-parent
 * chain, then each other branch's chain until it meets an owned entry, then any
 * side a merge brought in that no branch names. Chat records and conflict lines
 * are never read as branches.
 */

import { describe, expect, it } from 'vitest';

import { MemoryProvider } from '@taucad/filesystem/backend';
import { ImmutableRevisionTree, revisionId } from '#algorithms/index.js';
import type { RevisionId } from '#algorithms/index.js';

import { createIsomorphicGitRevisionPort } from '#isomorphic-git-adapter.js';
import { readRevisionGraph } from '#revision-graph.js';
import type { RevisionGraph } from '#revision-graph.js';
import type { RevisionPort } from '#revision-port.js';

const openPort = async (): Promise<RevisionPort> => {
  const port = createIsomorphicGitRevisionPort({ filesystem: new MemoryProvider() });
  await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
  await port.setHead('main');
  return port;
};

/** A small history writer: each entry a second newer than the last, so the walk's clock never inverts. */
const historyOf = (port: RevisionPort) => {
  let clock = Date.UTC(2026, 10, 10, 9, 0, 0);
  const entry = async (summary: string, parents: readonly RevisionId[]): Promise<RevisionId> => {
    clock += 1000;
    const receipt = await port.writeRevision({
      parents,
      tree: new ImmutableRevisionTree([['part.ts', summary]]),
      provenance: { source: 'user', actorId: 'ada', createdAt: clock },
      summary: { generated: summary },
    });
    return revisionId(receipt.commitId);
  };
  const point = async (name: string, head: RevisionId): Promise<void> => {
    await port.updateRef({ name, expectedHead: await port.readRef(name), head });
  };
  return { entry, point };
};

/** Each row as `summary: line`, newest first. */
const linesOf = (graph: RevisionGraph): readonly string[] =>
  graph.rows.map((row) => `${row.summary}: ${row.branch ?? '(no branch)'}`);

describe('readRevisionGraph', () => {
  it('should answer an empty project with no branches and no rows', async () => {
    const port = await openPort();

    await expect(readRevisionGraph(port)).resolves.toEqual({ branches: [], rows: [] });
  });

  it('should draw one branch on one line and number nothing', async () => {
    const port = await openPort();
    const { entry, point } = historyOf(port);
    const first = await entry('First', []);
    await point('main', await entry('Second', [first]));

    const graph = await readRevisionGraph(port);

    expect(linesOf(graph)).toEqual(['Second: main', 'First: main']);
    expect(graph.rows.map((row) => row.revisionNumber)).toEqual([undefined, undefined]);
    expect(graph.rows[0]?.parent).toBe(first);
  });

  it('should put a fork on its own line from the entry it starts from', async () => {
    const port = await openPort();
    const { entry, point } = historyOf(port);
    const start = await entry('Start', []);
    const bosses = await entry('Add mounting bosses', [start]);
    await point('main', await entry('Tidy', [bosses]));
    await point('enclosure-v2', await entry('Thicker walls', [bosses]));

    const graph = await readRevisionGraph(port);

    expect(graph.branches.map((branch) => branch.name)).toEqual(['main', 'enclosure-v2']);
    expect(new Set(linesOf(graph))).toEqual(
      new Set(['Tidy: main', 'Thicker walls: enclosure-v2', 'Add mounting bosses: main', 'Start: main']),
    );
    expect(graph.rows.find((row) => row.summary === 'Thicker walls')?.parent).toBe(bosses);
  });

  it('should give two forks from one entry a line each', async () => {
    const port = await openPort();
    const { entry, point } = historyOf(port);
    const start = await entry('Start', []);
    await point('main', start);
    await point('lid', await entry('Lid', [start]));
    await point('base', await entry('Base', [start]));

    const graph = await readRevisionGraph(port);

    // `main` first, the rest by name.
    expect(graph.branches.map((branch) => branch.name)).toEqual(['main', 'base', 'lid']);
    expect(new Set(linesOf(graph))).toEqual(new Set(['Lid: lid', 'Base: base', 'Start: main']));
  });

  it('should keep a merged branch on its own line, with the merge on main', async () => {
    const port = await openPort();
    const { entry, point } = historyOf(port);
    const start = await entry('Start', []);
    const side = await entry('Vents', [start]);
    await point('vents', side);
    const merge = await entry('Merge vents into main', [start, side]);
    await point('main', merge);

    const graph = await readRevisionGraph(port);

    expect(linesOf(graph)).toEqual(['Merge vents into main: main', 'Vents: vents', 'Start: main']);
    expect(graph.rows[0]?.otherParents).toEqual([side]);
  });

  it('should start a branch from an older entry below what main did after it', async () => {
    const port = await openPort();
    const { entry, point } = historyOf(port);
    const start = await entry('Start', []);
    const bosses = await entry('Add mounting bosses', [start]);
    await point('main', await entry('Fillets', [await entry('Ribs', [bosses])]));
    await point('older', await entry('Try a hinge', [bosses]));

    const graph = await readRevisionGraph(port);
    const lines = new Map(graph.rows.map((row) => [row.summary, row.line]));

    expect(lines.get('Try a hinge')).toBe('older');
    expect(['Fillets', 'Ribs', 'Add mounting bosses', 'Start'].map((summary) => lines.get(summary))).toEqual([
      'main',
      'main',
      'main',
      'main',
    ]);
  });

  it('should draw an imported merge whose branch has no name on a line of its own', async () => {
    const port = await openPort();
    const { entry, point } = historyOf(port);
    const start = await entry('Initial import', []);
    const sideTip = await entry('Second side change', [await entry('First side change', [start])]);
    await point('main', await entry("Merge branch 'gone'", [start, sideTip]));

    const graph = await readRevisionGraph(port);
    const side = graph.rows.filter((row) => row.summary.includes('side change'));

    expect(side.map((row) => [row.line, row.branch])).toEqual([
      [sideTip, undefined],
      [sideTip, undefined],
    ]);
    expect(graph.rows.filter((row) => row.line === 'main').map((row) => row.summary)).toEqual([
      "Merge branch 'gone'",
      'Initial import',
    ]);
  });

  it('should read neither chat records nor conflict lines as branches', async () => {
    const port = await openPort();
    const { entry, point } = historyOf(port);
    const start = await entry('Start', []);
    await point('main', start);
    await point('refs/tau/chats/chat-1', await entry('Chat record', []));
    await point('conflicts/main/device-1', await entry('Conflict', [start]));

    const graph = await readRevisionGraph(port);

    expect(graph.branches.map((branch) => branch.name)).toEqual(['main']);
    expect(linesOf(graph)).toEqual(['Start: main']);
  });

  it('should let the requested order decide which branch owns a shared chain', async () => {
    const port = await openPort();
    const { entry, point } = historyOf(port);
    const start = await entry('Start', []);
    await point('main', start);
    const lid = await entry('Lid', [start]);
    await point('lid', lid);
    await point('lid-hinge', await entry('Hinge', [lid]));

    const lidFirst = await readRevisionGraph(port, { branches: ['main', 'lid', 'lid-hinge', 'missing'] });
    const hingeFirst = await readRevisionGraph(port, { branches: ['main', 'lid-hinge', 'lid'] });

    expect(lidFirst.branches.map((branch) => branch.name)).toEqual(['main', 'lid', 'lid-hinge']);
    expect(lidFirst.rows.find((row) => row.summary === 'Lid')?.line).toBe('lid');
    expect(hingeFirst.rows.find((row) => row.summary === 'Lid')?.line).toBe('lid-hinge');
  });

  it('should bound the walk across every branch by the limit', async () => {
    const port = await openPort();
    const { entry, point } = historyOf(port);
    const start = await entry('Start', []);
    await point('main', await entry('Main two', [await entry('Main one', [start])]));
    await point('side', await entry('Side one', [start]));

    const graph = await readRevisionGraph(port, { limit: 2 });

    expect(graph.rows).toHaveLength(2);
    await expect(readRevisionGraph(port, { limit: 0 })).resolves.toMatchObject({ rows: [] });
  });
});
