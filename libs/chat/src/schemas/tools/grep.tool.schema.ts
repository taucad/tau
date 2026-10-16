import safeRegex from 'safe-regex';
import { z } from 'zod';
import { rootedFilePathSchema, rootedPathSchema } from '#schemas/rooted-path.schema.js';

/** A Perl or PCRE inline modifier group such as `(?i)` or `(?im)`, which JavaScript does not accept. */
const inlineModifierPattern = /\(\?[a-z-]+\)/u;

/**
 * Refuse a pattern for the reason that actually applies: invalid JavaScript syntax first, so an
 * unsupported inline flag is never reported as a backtracking risk, then the backtracking check.
 * `handle-grep` compiles the pattern with `new RegExp(pattern, 'g' | 'gi')`, so that is the syntax checked.
 */
const checkPattern = (pattern: string, context: z.RefinementCtx): void => {
  try {
    // oxlint-disable-next-line no-new -- compiling is the syntax check; the instance is discarded.
    new RegExp(pattern, 'g');
  } catch (error) {
    context.addIssue({
      code: 'custom',
      message: inlineModifierPattern.test(pattern)
        ? 'Inline flags such as (?i) are not JavaScript regex syntax. Remove them and pass caseSensitive: false for a case-insensitive search.'
        : `The pattern is not a valid JavaScript regular expression: ${error instanceof Error ? error.message : String(error)}.`,
    });
    return;
  }
  if (!safeRegex(pattern)) {
    context.addIssue({
      code: 'custom',
      message:
        'The regex pattern may cause catastrophic backtracking. Remove nested quantifiers such as (a+)+ or reduce the number of repeated groups; plain alternation such as foo|bar is fine.',
    });
  }
};

/** @public */
export const grepInputSchema = z.object({
  pattern: z
    .string()
    .superRefine(checkPattern)
    .describe(
      'A JavaScript regular expression searched in file contents. Inline flags such as (?i) are not supported; use caseSensitive.',
    ),
  path: rootedPathSchema.optional().describe('The file or directory path to search in. Defaults to project root.'),
  glob: z
    .string()
    .optional()
    .describe('Glob pattern to filter files (e.g., "*.ts", "*.scad"). Searches all files if not provided.'),
  caseSensitive: z.boolean().optional().describe('Whether the search should be case-sensitive. Defaults to true.'),
  headLimit: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional()
    .describe('Maximum number of matches to return (1-1000, default 50). Use with offset to paginate.'),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Number of leading matches to skip before applying headLimit. Defaults to 0.'),
  context: z
    .number()
    .int()
    .min(0)
    .max(20)
    .optional()
    .describe('Lines to return before and after each match (0-20, default 0), like ripgrep -C.'),
});

/** Canonical grep-match schema shared with the RPC transport. @public */
export const grepMatchSchema = z.object({
  file: rootedFilePathSchema.describe('The file path where the match was found.'),
  line: z.number().describe('The line number of the match (1-based).'),
  content: z.string().describe('The content of the matching line.'),
  before: z
    .array(z.string())
    .optional()
    .describe('Up to `context` lines immediately before the match, in file order. Present only when context > 0.'),
  after: z
    .array(z.string())
    .optional()
    .describe('Up to `context` lines immediately after the match, in file order. Present only when context > 0.'),
});

/** @public */
export const grepOutputSchema = z.object({
  matches: z.array(grepMatchSchema).describe('The list of matches found.'),
  totalMatches: z.number().describe('The total number of matches found.'),
  truncated: z.boolean().optional().describe('Whether results were truncated due to too many matches.'),
  appliedHeadLimit: z.number().int().nonnegative().describe('The effective headLimit used to slice the matches list.'),
  appliedOffset: z.number().int().nonnegative().describe('The effective offset used to slice the matches list.'),
});

/** @public */
export type GrepInput = z.infer<typeof grepInputSchema>;
/** @public */
export type GrepOutput = z.infer<typeof grepOutputSchema>;
/** @public */
export type GrepMatch = z.infer<typeof grepMatchSchema>;
