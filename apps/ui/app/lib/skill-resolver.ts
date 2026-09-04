/* oxlint-disable no-barrel-files/no-barrel-files -- the app keeps this import path while the resolver itself moved to the library. */
/**
 * The app's skill resolver: `@taucad/agent-tools/skills` plus this app's
 * system-skill layer.
 *
 * Only the system catalog stays here, and only because it is built from `?raw`
 * imports of each kernel package's agent guide — a bundler capability a daemon
 * does not have. Everything else about skill discovery is host-neutral and
 * lives in the library.
 *
 * @module
 */

import { createSkillResolver as createAgentSkillResolver } from '@taucad/agent-tools/skills';
import type { SkillResolver, SkillResolverDependencies } from '@taucad/agent-tools/skills';
import { builtInSystemSkills } from '#lib/system-skills-catalog.js';

export { titleFromSkillName } from '@taucad/agent-tools/skills';
export type { SkillResolver, SkillResolverDependencies, SkillResolverDirectoryEntry } from '@taucad/agent-tools/skills';

/**
 * Build the editor's skill resolver over a filesystem reader.
 *
 * @param deps - Reader and directory lister for the active project.
 * @returns A resolver that also sees this app's compiled-in system skills.
 */
export function createSkillResolver(
  deps: Pick<SkillResolverDependencies, 'readFile' | 'listDirectory'>,
): SkillResolver {
  return createAgentSkillResolver({ ...deps, systemSkills: builtInSystemSkills });
}
