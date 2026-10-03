import { z } from 'zod';
import { askQuestionsDefaultWaitSeconds, askQuestionsMaxWaitSeconds } from '#schemas/questions.schema.js';

const uniqueIds = (items: ReadonlyArray<{ readonly id: string }>): boolean =>
  new Set(items.map((item) => item.id)).size === items.length;

const uniqueLabels = (options: ReadonlyArray<{ readonly label: string }>): boolean =>
  new Set(options.map((option) => option.label.toLowerCase())).size === options.length;

/** One choice the person can pick. @public */
export const askQuestionsOptionSchema = z.object({
  label: z.string().min(1).max(48).describe('1–5 words naming the choice, e.g. "Drop seeds".'),
  description: z.string().min(1).max(160).describe('One short sentence: what happens if the person picks this.'),
});

/** One question in a call. @public */
export const askQuestionsQuestionSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u, 'Use a lowercase slug such as "wall-material".')
    .describe('Lowercase slug that keys the answer, e.g. "wall-material".'),
  header: z.string().min(1).max(16).describe('A 1–2 word topic shown above the question, e.g. "Material".'),
  question: z
    .string()
    .min(1)
    .max(300)
    .describe('One self-contained sentence the person can answer without scrolling back.'),
  options: z
    .array(askQuestionsOptionSchema)
    .min(2)
    .max(4)
    .refine(uniqueLabels, 'Option labels must be distinct.')
    .describe(
      'Distinct choices, recommended first: the first option is adopted if nobody answers in time. The person can always answer in their own words, so do not add an "Other" option.',
    ),
});

/** @public */
export const askQuestionsInputSchema = z.object({
  chatId: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,128}$/u, 'chatId is one path segment: letters, digits, "-" and "_".')
    .describe('Your chat id: the <chatId> segment of your conversation log path.'),
  questions: z
    .array(askQuestionsQuestionSchema)
    .min(1)
    .max(3)
    .refine(uniqueIds, 'Every question id must be unique.')
    .describe('1–3 related questions asked together; prefer one.'),
  waitSeconds: z
    .number()
    .int()
    .min(0)
    .max(askQuestionsMaxWaitSeconds)
    .optional()
    .describe(
      `How long to wait for the person before adopting the recommended options (default ${String(askQuestionsDefaultWaitSeconds)}). Use 0 to continue at once on the recommendations; a later answer arrives as a message.`,
    ),
});

/** One question's answer as the agent receives it. @public */
export const askQuestionsAnswerSchema = z.object({
  id: z.string().describe('The question id.'),
  answer: z.string().describe('The chosen option label, or the person’s own words.'),
  source: z.enum(['person', 'recommended']).describe('Who settled it: the person, or the recommended default.'),
  text: z.literal(true).optional().describe('Present when the person typed their own answer.'),
});

/** @public */
export const askQuestionsOutputSchema = z.object({
  status: z
    .enum(['answered', 'partial', 'defaulted'])
    .describe('answered: the person answered all; partial: some; defaulted: none in time.'),
  path: z.string().describe('Where the questions are recorded, relative to the project root.'),
  answers: z.array(askQuestionsAnswerSchema),
  note: z.string().optional().describe('What to do about defaulted answers.'),
});

/** @public */
export type AskQuestionsInput = z.infer<typeof askQuestionsInputSchema>;
/** @public */
export type AskQuestionsOutput = z.infer<typeof askQuestionsOutputSchema>;
