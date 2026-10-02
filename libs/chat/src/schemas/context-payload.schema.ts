// oxlint-disable-next-line eslint-plugin-import/no-named-as-default -- standard zod default import
import z from 'zod';

/**
 * Schema for a single skill's metadata as discovered from `.tau/skills/` SKILL.md frontmatter.
 * @public
 */
export const skillMetadataSchema = z.object({
  name: z.string(),
  description: z.string(),
  path: z.string(),
  source: z.string().optional(),
});

/**
 * Context payload assembled client-side from ZenFS and attached to message metadata.
 * Carries skills catalog and memory (AGENTS.md) content so the API can inject them
 * into the system prompt without RPC round-trips.
 * @public
 */
export const contextPayloadSchema = z.object({
  skills: z.array(skillMetadataSchema).optional(),
  memory: z.record(z.string(), z.string()).optional(),
});
