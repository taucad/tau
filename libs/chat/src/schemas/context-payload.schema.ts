// oxlint-disable-next-line eslint-plugin-import/no-named-as-default -- standard zod default import
import z from 'zod';

/**
 * Schema for a single skill's metadata as discovered from `.agents/skills/`
 * SKILL.md frontmatter — the only filesystem skills root.
 *
 * `name` and `description` are the Agent Skills specification's own fields;
 * `source`, `version` and `enabled` are read from the frontmatter's `metadata`
 * mapping. `diagnostics` lists where a loaded skill departs from the
 * specification: such a skill still loads, and the list is there to show its
 * author.
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
  diagnostics: z.array(z.string()).optional(),
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
 * The most a memory entry may hold: 32 KiB of UTF-8, with no line limit.
 *
 * The project's root `AGENTS.md` is head-truncated client-side to this many bytes, and a cut is marked with one
 * notice line. The number is Codex's default (`project_doc_max_bytes`), so a file Codex reads whole Tau's agent also
 * reads whole. The memory message is per-request and uncached; at the cap it is about 8,000 tokens.
 * @public
 */
export const contextMemoryMaxBytes = 32_768;
/**
 * The most skills one context payload may list, so the uncached turn block cannot grow without limit.
 * @public
 */
export const contextSkillsMaxEntries = 64;

/**
 * Context payload assembled client-side from the project filesystem and attached to message metadata.
 * Carries the skills catalog and the project's root `AGENTS.md` (as `memory`, keyed by its path) so the
 * agent host can place them in the turn context without RPC round-trips.
 *
 * A memory value is bounded by {@link contextMemoryMaxBytes} plus 256 for the truncation notice. The bound counts
 * UTF-16 code units, and a value cut to the cap in UTF-8 bytes is never longer than the cap in code units, so a
 * truncated file always parses.
 * @public
 */
export const contextPayloadSchema = z.object({
  skills: z.array(skillMetadataSchema).max(contextSkillsMaxEntries).optional(),
  memory: z.record(z.string(), z.string().max(contextMemoryMaxBytes + 256)).optional(),
});
