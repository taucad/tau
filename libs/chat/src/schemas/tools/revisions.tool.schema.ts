import { z } from 'zod';

/**
 * The agent's read-only view of a project's revision history (S28, I10).
 *
 * Read-only by design: an agent can see where it is, what changed and what came
 * before, and cannot branch, merge, restore, discard or sync. Those are a
 * person's verbs, and the host — never the agent — records what a turn wrote.
 *
 * @public
 */
export const revisionsInputSchema = z.object({
  action: z
    .enum(['log', 'diff', 'describe'])
    .describe(
      'log: list a branch’s revisions, newest first. diff: list the files that changed between two revisions. describe: say which branch this project is on and what else it holds.',
    ),
  branch: z.string().optional().describe('log only. Branch to list; defaults to the one this project is on.'),
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .describe('log only. Most recent revisions to list; defaults to all of them.'),
  from: z.string().optional().describe('diff only. The older revision id. Omit to compare against an empty project.'),
  to: z.string().optional().describe('diff only. The newer revision id. Required for diff.'),
});

/** One revision, as the history pane and the chat card show it. @public */
export const revisionRowSchema = z.object({
  revisionNumber: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Position on this branch — the "Rev 12" a person sees. Absent for a revision merged in from elsewhere.'),
  revisionId: z.string(),
  actor: z.string().describe('Who made it: a model id for an agent turn, a person otherwise.'),
  source: z.string().describe('What made it: user, agent, restore, merge or import.'),
  createdAt: z.number().describe('Milliseconds since the Unix epoch.'),
  summary: z.string(),
  conflicted: z.boolean().describe('Whether this revision still needs a person to resolve it.'),
});

/** One changed path. @public */
export const revisionChangeSchema = z.object({
  path: z.string(),
  kind: z.enum(['added', 'modified', 'deleted']),
});

/** What one read answers with. @public */
export const revisionsOutputSchema = z.object({
  where: z.string().describe('Where this project is right now, in one line: "main · Rev 12".'),
  branch: z.string().optional(),
  revisions: z.array(revisionRowSchema).optional().describe('Present for log.'),
  changes: z.array(revisionChangeSchema).optional().describe('Present for diff.'),
  branches: z
    .array(z.object({ name: z.string(), revisionNumber: z.number().int().nonnegative(), revisionId: z.string() }))
    .optional()
    .describe('Present for describe.'),
});

/** @public */
export type RevisionsInput = z.infer<typeof revisionsInputSchema>;
/** @public */
export type RevisionsOutput = z.infer<typeof revisionsOutputSchema>;
/** @public */
export type RevisionRowOutput = z.infer<typeof revisionRowSchema>;
/** @public */
export type RevisionChangeOutput = z.infer<typeof revisionChangeSchema>;
