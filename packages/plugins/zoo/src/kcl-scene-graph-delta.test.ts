// @vitest-environment node
/* eslint-disable @typescript-eslint/naming-convention -- Scene graph delta fixtures use Rust field names */
import { describe, expect, it } from 'vitest';
import { normalizeSceneGraphDelta } from '#kcl-scene-graph-delta.js';

describe('normalizeSceneGraphDelta', () => {
  it('unwraps snake_case SceneGraphDelta from execute()', () => {
    const execOutcome = { variables: { a: { type: 'Number', value: 1 } } };
    const raw = {
      new_graph: { nodes: [] },
      new_objects: ['id1'],
      invalidates_ids: true,
      exec_outcome: execOutcome,
    };

    const delta = normalizeSceneGraphDelta(raw);
    expect(delta.newGraph).toEqual({ nodes: [] });
    expect(delta.newObjects).toEqual(['id1']);
    expect(delta.invalidatesIds).toBe(true);
    expect(delta.execOutcome).toBe(execOutcome);
  });

  it('accepts legacy flat ExecOutcome-shaped payloads', () => {
    const legacy = {
      variables: {},
      issues: [],
      operations: [],
    };

    const delta = normalizeSceneGraphDelta(legacy);
    expect(delta.execOutcome).toBe(legacy);
    expect(delta.newObjects).toEqual([]);
    expect(delta.invalidatesIds).toBe(false);
  });
});
