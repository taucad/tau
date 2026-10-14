import { describe, expect, it } from 'vitest';
import type { TaskGraphExport } from '#plan-geospec-ci.js';
import { planGeospecCi } from '#plan-geospec-ci.js';

type ProjectNode = { data: { targets?: Record<string, unknown>; tags?: string[] } };

/** The projects of the workspace graph that decide GeoSpec routing, as `project.json` tags them. */
const nodes: Record<string, ProjectNode> = {
  'geospec-engine-native': {
    data: {
      tags: ['scope:shared', 'type:package', 'host:darwin-arm64'],
      targets: { test: {}, 'prepare-geospec-ci-artifacts': {}, 'require-geospec-artifacts': {} },
    },
  },
  geospec: { data: { tags: ['scope:shared', 'type:package', 'host:darwin-arm64'], targets: { test: {} } } },
  'runtime-e2e': {
    data: { tags: ['scope:shared', 'type:e2e', 'host:darwin-arm64', 'ci:quarantined'], targets: { test: {} } },
  },
  'agent-tools': { data: { tags: ['scope:shared', 'type:lib'], targets: { test: {} } } },
  ui: { data: { tags: ['scope:ui', 'type:app'], targets: { test: {} } } },
};

const dependencies: Record<string, Array<{ target: string }>> = {
  geospec: [{ target: 'geospec-engine-native' }],
  'runtime-e2e': [{ target: 'geospec-engine-native' }, { target: 'geospec' }],
  'agent-tools': [{ target: 'geospec' }],
  ui: [{ target: 'agent-tools' }],
};

/** An expanded `nx affected -t test --graph` export holding the given `project:target` tasks. */
const taskGraph = (...taskIds: string[]): TaskGraphExport => ({
  graph: { nodes, dependencies },
  tasks: {
    tasks: Object.fromEntries(
      taskIds.map((id) => {
        const [project, target] = id.split(':');
        return [id, { target: { project, target } }];
      }),
    ),
  },
});

describe('planGeospecCi', () => {
  describe('Darwin lane selection', () => {
    it('should not select the Darwin lane when only a non-GeoSpec project is affected', () => {
      expect(planGeospecCi([taskGraph('ui:test')])).toEqual({
        required: false,
        artifactTasks: [],
        darwinTests: [],
        darwinProjects: [],
        consumerTests: [],
      });
    });

    it('should select the Darwin lane for the engine and its dependents when the native engine changes', () => {
      const plan = planGeospecCi([
        taskGraph(
          'geospec-engine-native:test',
          'geospec-engine-native:require-geospec-artifacts',
          'geospec:test',
          'agent-tools:test',
        ),
      ]);

      expect(plan).toMatchObject({
        required: true,
        darwinTests: ['geospec-engine-native:test', 'geospec:test'],
        darwinProjects: ['geospec', 'geospec-engine-native'],
      });
    });

    it('should select the Darwin lane for geospec alone when only geospec changes', () => {
      const plan = planGeospecCi([taskGraph('geospec:test', 'agent-tools:test')]);

      expect(plan).toMatchObject({
        required: true,
        darwinTests: ['geospec:test'],
        darwinProjects: ['geospec'],
        consumerTests: ['geospec:test'],
      });
    });

    it('should not select the Darwin lane or products when the only affected Darwin project is quarantined', () => {
      expect(planGeospecCi([taskGraph('runtime-e2e:test', 'ui:test')])).toEqual({
        required: false,
        artifactTasks: [],
        darwinTests: [],
        darwinProjects: [],
        consumerTests: [],
      });
    });

    it('should leave a quarantined project out of a Darwin selection that runs for another project', () => {
      const plan = planGeospecCi([taskGraph('runtime-e2e:test', 'geospec:test')]);

      expect(plan.darwinProjects).toEqual(['geospec']);
      expect(plan.darwinTests).toEqual(['geospec:test']);
    });
  });

  describe('artifact prerequisites', () => {
    it('should require products for a non-Darwin task that expands to the artifact gate', () => {
      expect(planGeospecCi([taskGraph('geospec-engine-native:require-geospec-artifacts')])).toMatchObject({
        required: true,
        artifactTasks: ['geospec-engine-native:require-geospec-artifacts'],
        darwinTests: [],
      });
    });

    it('should reject a graph export without expanded tasks', () => {
      expect(() => planGeospecCi([{ graph: { nodes } }])).toThrow('Expected an expanded Nx task graph');
    });
  });
});
