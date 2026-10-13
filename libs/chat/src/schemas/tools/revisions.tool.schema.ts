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
    .enum(['log', 'diff', 'describe', 'conflict'])
    .describe(
      'log: list a branch’s revisions, newest first. diff: list the files that changed between two revisions. describe: say which branch this project is on and what else it holds. conflict: read both sides of a conflict waiting for a decision.',
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
  revision: z
    .string()
    .optional()
    .describe('conflict only. The conflicted revision id; defaults to the conflict waiting on this branch.'),
  path: z.string().optional().describe('conflict only. One conflicted file; defaults to all of them.'),
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

/** One conflicted file's three versions. @public */
export const revisionConflictFileSchema = z.object({
  path: z.string(),
  chooseOne: z
    .boolean()
    .describe('Not text (parametric, binary or a file/folder clash): the user keeps one side; no content is read.'),
  base: z.string().optional().describe('What both sides started from.'),
  ours: z.string().optional().describe('This branch’s version, which its files hold now.'),
  theirs: z.string().optional().describe('The other side’s version.'),
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
  conflict: z
    .object({
      revisionId: z.string(),
      labels: z.object({ ours: z.string(), theirs: z.string() }),
      files: z.array(revisionConflictFileSchema),
    })
    .optional()
    .describe('Present for conflict.'),
});

/** @public */
export type RevisionsInput = z.infer<typeof revisionsInputSchema>;
/** @public */
export type RevisionsOutput = z.infer<typeof revisionsOutputSchema>;
/** @public */
export type RevisionRowOutput = z.infer<typeof revisionRowSchema>;
/** @public */
export type RevisionChangeOutput = z.infer<typeof revisionChangeSchema>;
