// oxlint-disable-next-line eslint-plugin-import/no-named-as-default -- standard zod default import
import z from 'zod';

/**
 * Schema for a single skill's metadata as discovered from `.agents/skills/`
 * SKILL.md frontmatter — the only filesystem skills root.
 *
 * @public
 */
export const skillMetadataSchema = z.object({
  name: z.string(),
  description: z.string(),
  resourceUri: z.string().optional(),
  path: z.string().optional(),
  skillPath: z.string().optional(),
  source: z.string().optional(),
  version: z.string().optional(),
  whenToUse: z.string().optional(),
  fingerprint: z.string().optional(),
  enabled: z.boolean().optional(),
  shadowedSources: z
    .array(
      z.object({
        source: z.string(),
        resourceUri: z.string().optional(),
        path: z.string().optional(),
        skillPath: z.string().optional(),
        fingerprint: z.string().optional(),
      }),
    )
    .optional(),
});

/**
 * Context payload assembled client-side from the project filesystem and attached to message metadata.
 * Carries the skills catalog and the project's root `AGENTS.md` (as `memory`, keyed by its path) so the
 * agent host can place them in the turn context without RPC round-trips.
 * @public
 */
/**
 * CH-10 payload caps: memory entries are head-truncated client-side to the first
 * {@link contextMemoryMaxLines} lines / {@link contextMemoryMaxBytes} bytes, and the
 * schema enforces the byte ceiling (with slack for the truncation notice) plus a
 * bound on catalog size so the uncached dynamic block cannot grow without limit.
 * @public
 */
export const contextMemoryMaxLines = 200;
/** @public */
export const contextMemoryMaxBytes = 25_000;
/** @public */
export const contextSkillsMaxEntries = 64;

export const contextPayloadSchema = z.object({
  skills: z.array(skillMetadataSchema).max(contextSkillsMaxEntries).optional(),
  memory: z.record(z.string(), z.string().max(contextMemoryMaxBytes + 256)).optional(),
});
