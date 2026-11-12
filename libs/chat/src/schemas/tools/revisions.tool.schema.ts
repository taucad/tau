import { z } from 'zod';

/**
 * The agent's read-only view of a project's history (S28, I10): the `history` tool.
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
      'log: list a branch’s history entries, newest first. diff: list the files that changed between two entries. describe: say which branch this project is on and what else it holds. conflict: read both sides of a conflict waiting for a decision.',
    ),
  branch: z.string().optional().describe('log only. Branch to list; defaults to the one this project is on.'),
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .describe('log only. Most recent entries to list; defaults to all of them.'),
  from: z.string().optional().describe('diff only. The older entry’s id. Omit to compare against an empty project.'),
  to: z.string().optional().describe('diff only. The newer entry’s id. Required for diff.'),
  revision: z
    .string()
    .optional()
    .describe('conflict only. The conflicted entry’s id; defaults to the conflict waiting on this branch.'),
  path: z.string().optional().describe('conflict only. One conflicted file; defaults to all of them.'),
});

const revisionPersonSchema = z.object({
  kind: z.literal('user'),
  id: z.string(),
  name: z.string().optional(),
  email: z.string().optional(),
  anonymous: z.boolean().optional(),
});

/**
 * Who made one history entry, as the store holds it (blueprint B2): the identity a
 * commit Tau wrote records, or the git author of one it did not. Never a name
 * to print as is; the pane resolves who a row shows.
 *
 * @public
 */
export const revisionWhoSchema = z
  .discriminatedUnion('kind', [
    z.object({
      kind: z.literal('recorded'),
      identity: z.discriminatedUnion('kind', [
        revisionPersonSchema,
        z.object({ kind: z.literal('agent'), id: z.string(), runId: z.string(), onBehalfOf: revisionPersonSchema }),
      ]),
    }),
    z.object({ kind: z.literal('unrecorded'), authorName: z.string().optional() }),
  ])
  .describe(
    'Who made it: the identity Tau recorded (a person, or an agent run for a person), or a commit’s git author.',
  );

/**
 * One history entry, as the History pane and the chat card show it (blueprint
 * M11): an entry has no number; a version carries its project-wide `V<n>`.
 *
 * @public
 */
export const revisionRowSchema = z.object({
  revisionId: z.string().describe('The entry’s id, for `diff`. History shows its first seven characters.'),
  who: revisionWhoSchema,
  source: z.string().describe('What made it: user, agent, restore, merge or import.'),
  createdAt: z.number().describe('Milliseconds since the Unix epoch.'),
  summary: z.string().describe('The entry’s title.'),
  conflicted: z.boolean().describe('Whether this entry still needs a person to resolve it.'),
  version: z
    .object({ number: z.number().int().positive(), name: z.string() })
    .optional()
    .describe('Present when the entry is a version: its number, shown as "V3", and its name.'),
});

/** One changed path. @public */
export const revisionChangeSchema = z.object({
  path: z.string(),
  kind: z.enum(['added', 'modified', 'deleted']),
});

/** One conflicted file's three sides. @public */
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
  where: z.string().describe('Where this project is right now, in one line: the branch name, or "No history yet".'),
  branch: z.string().optional(),
  revisions: z.array(revisionRowSchema).optional().describe('Present for log.'),
  changes: z.array(revisionChangeSchema).optional().describe('Present for diff.'),
  branches: z
    .array(z.object({ name: z.string(), revisionId: z.string() }))
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
