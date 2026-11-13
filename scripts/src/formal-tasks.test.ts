import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { formalTasks } from '#formal-tasks.js';
import type { TaskGraphFile } from '#formal-tasks.js';

const graphOf = (ids: readonly string[]): TaskGraphFile => ({
  tasks: {
    tasks: Object.fromEntries(
      ids.map((id) => {
        const [project = '', ...target] = id.split(':');
        return [id, { target: { project, target: target.join(':') } }];
      }),
    ),
  },
});

describe('formal tasks', () => {
  it('should deal the families of a split project instead of its noop formal:tla', () => {
    expect(
      formalTasks(
        graphOf([
          'ui:formal:tla',
          'ui:formal:tla:record-sync',
          'ui:formal:tla:layout-apply',
          'agent-host:formal:tla',
          'agent-host:formal:lean',
          'chat-ui:formal:lean',
          'formal:formal:tla',
        ]),
      ),
    ).toEqual([
      'agent-host:formal:lean',
      'agent-host:formal:tla',
      'chat-ui:formal:lean',
      'formal:formal:tla',
      'ui:formal:tla:layout-apply',
      'ui:formal:tla:record-sync',
    ]);
  });

  it('should keep a formal:tla whose name only prefixes another project', () => {
    expect(formalTasks(graphOf(['api:formal:tla', 'api-billing:formal:tla', 'api-billing:formal:tla:x']))).toEqual([
      'api-billing:formal:tla:x',
      'api:formal:tla',
    ]);
  });

  it('should leave out every other target and tolerate an empty graph', () => {
    expect(formalTasks(graphOf(['ui:test', 'ui:formal:wide', 'host:formal:nightly', 'host:formal:logs']))).toEqual([]);
    expect(formalTasks({})).toEqual([]);
  });

  it('should be what ci.yml deals', () => {
    const ci = load(readFileSync(resolve(import.meta.dirname, '../../.github/workflows/ci.yml'), 'utf8')) as {
      jobs: Record<string, { steps?: ReadonlyArray<{ name?: string; run?: string }> }>;
    };
    const deal = ci.jobs['formal']?.steps?.find((step) => step.name === 'Deal affected formal tasks')?.run;

    expect(deal).toContain('tasks=$(node scripts/src/formal-tasks.ts "$RUNNER_TEMP/formal-graph.json")');
  });
});
