import safeRegex from 'safe-regex';
import { z } from 'zod';

/** @public */
export const grepInputSchema = z.object({
  pattern: z
    .string()
    .refine((pattern) => safeRegex(pattern), {
      message:
        'The regex pattern is potentially unsafe (may cause catastrophic backtracking). Please simplify the pattern by reducing nested quantifiers or alternations.',
    })
    .describe('The regular expression pattern to search for in file contents.'),
  path: z.string().optional().describe('The file or directory path to search in. Defaults to project root.'),
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
});

const grepMatchSchema = z.object({
  file: z.string().describe('The file path where the match was found.'),
  line: z.number().describe('The line number of the match (1-based).'),
  content: z.string().describe('The content of the matching line.'),
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
