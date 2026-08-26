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
 * Context payload assembled client-side from ZenFS and attached to message metadata.
 * Carries skills catalog and memory (AGENTS.md) content so the API can inject them
 * into the system prompt without RPC round-trips.
 * @public
 */
export const contextPayloadSchema = z.object({
  skills: z.array(skillMetadataSchema).optional(),
  memory: z.record(z.string(), z.string()).optional(),
});
