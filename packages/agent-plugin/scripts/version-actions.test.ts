import { readJson } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

// oxlint-disable-next-line no-restricted-imports -- Nx loads this script by path; the `#` import map covers only src/.
import AgentPluginVersionActions, { pluginManifests } from './version-actions.js';

type VersionActionsParameters = ConstructorParameters<typeof AgentPluginVersionActions>;

describe('AgentPluginVersionActions', () => {
  it('should write a release version into package.json and both plugin manifests', async () => {
    const root = 'packages/agent-plugin';
    const tree = createTreeWithEmptyWorkspace();
    tree.write(`${root}/package.json`, JSON.stringify({ name: '@taucad/agent-plugin', version: '0.1.0-beta.1' }));
    for (const manifest of pluginManifests) {
      tree.write(
        `${root}/${manifest}`,
        JSON.stringify({ name: 'tau', version: '0.1.0-beta.1', license: 'Apache-2.0' }),
      );
    }
    const actions = new AgentPluginVersionActions(
      mock<VersionActionsParameters[0]>(),
      { name: 'agent-plugin', type: 'lib', data: { root } },
      mock<VersionActionsParameters[2]>({ manifestRootsToUpdate: [], preserveLocalDependencyProtocols: true }),
    );

    await actions.init(tree);
    const logMessages = await actions.updateProjectVersion(tree, '0.1.0-beta.2');

    expect(readJson(tree, `${root}/package.json`)).toEqual({ name: '@taucad/agent-plugin', version: '0.1.0-beta.2' });
    for (const manifest of pluginManifests) {
      expect(readJson(tree, `${root}/${manifest}`)).toEqual({
        name: 'tau',
        version: '0.1.0-beta.2',
        license: 'Apache-2.0',
      });
    }
    expect(logMessages).toHaveLength(3);
  });
});
