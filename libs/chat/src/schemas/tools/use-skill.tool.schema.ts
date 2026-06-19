import { z } from 'zod';

/** @public */
export const useSkillInputSchema = z
  .object({
    skillName: z.string().describe('The name of the skill to activate from the available skills catalog.'),
    reason: z.string().optional().describe('Why this skill applies to the current task.'),
  })
  .strict();

/** @public */
export const useSkillOutputSchema = z.object({
  skillName: z.string(),
  resourceUri: z.string(),
  skillPath: z.string().optional(),
  baseDirectory: z.string().optional(),
  source: z.string(),
  fingerprint: z.string().optional(),
  frontmatter: z.record(z.string(), z.unknown()),
  content: z.string().describe('The raw SKILL.md markdown content without read_file gutters.'),
  supportingFiles: z.array(z.string()).describe('Supporting files discovered in the skill directory.'),
});

/** @public */
export type UseSkillInput = z.infer<typeof useSkillInputSchema>;
/** @public */
export type UseSkillOutput = z.infer<typeof useSkillOutputSchema>;
