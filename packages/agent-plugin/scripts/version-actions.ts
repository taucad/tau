/**
 * Nx Release version actions for `@taucad/agent-plugin`.
 *
 * Both hosts key a plugin's cache and its updates on the manifest `version`, so
 * the two plugin manifests must carry the package's version at every release.
 * `nx release version` writes them in the same change as `package.json`, and
 * the release commit carries all three.
 *
 * @module
 */
import { join } from 'node:path';
import { updateJson } from '@nx/devkit';
import type { Tree } from '@nx/devkit';
import JsVersionActions from '@nx/js/src/release/version-actions.js';

/** The plugin manifests whose `version` follows `package.json`, relative to the project root. */
export const pluginManifests = ['.codex-plugin/plugin.json', '.claude-plugin/plugin.json'] as const;

/** The JavaScript version actions, plus the plugin manifests. */
export default class AgentPluginVersionActions extends JsVersionActions {
  /**
   * Write the new version into `package.json`, as the JavaScript actions do, then into both plugin manifests.
   *
   * @param tree - The virtual file tree Nx Release writes or previews.
   * @param newVersion - The version being released.
   * @returns One log line per file written.
   */
  public override async updateProjectVersion(tree: Tree, newVersion: string): Promise<string[]> {
    const logMessages = await super.updateProjectVersion(tree, newVersion);
    for (const manifest of pluginManifests) {
      const manifestPath = join(this.projectGraphNode.data.root, manifest);
      updateJson(tree, manifestPath, (json: Record<string, unknown>) => ({ ...json, version: newVersion }));
      logMessages.push(`✍️  New version ${newVersion} written to manifest: ${manifestPath}`);
    }
    return logMessages;
  }
}
