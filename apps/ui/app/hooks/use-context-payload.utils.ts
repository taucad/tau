/* oxlint-disable no-barrel-files/no-barrel-files -- relocation shim: this module's whole job is to keep the app's import path stable. */
/**
 * Skill-metadata helpers, relocated to `@taucad/agent-tools/skills`.
 *
 * Kept as a re-export so the React half of `use-context-payload` and its tests
 * keep their import path: the parsing rules are host-neutral and now travel
 * with the resolver that uses them.
 *
 * @module
 */

export {
  canonicalSkillsDirectory,
  fingerprintSkillContent,
  mergeSkillMetadata,
  parseSkillFrontmatter,
} from '@taucad/agent-tools/skills';
