/* oxlint-disable no-barrel-files/no-barrel-files -- relocation shim: this module's whole job is to keep the app's import path stable. */
/**
 * The Tau Store catalog, relocated to `@taucad/agent-tools/skills`.
 *
 * It is plain data with no bundler-only imports, so it travels with the
 * resolver; this re-export keeps the app's own import path.
 *
 * @module
 */

export { tauStoreSkills, type TauStoreSkill } from '@taucad/agent-tools/skills';
