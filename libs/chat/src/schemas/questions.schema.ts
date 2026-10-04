import { dump, load } from 'js-yaml';
import { z } from 'zod';

/** How long an ask waits for the person unless the agent chooses otherwise. @public */
export const askQuestionsDefaultWaitSeconds = 120;

/**
 * The longest an ask may wait. It stays under the shortest MCP tool timeout an
 * adapter applies by default (Codex: 300 s), so a waiting call is never killed
 * by its own carrier. Starting to answer extends the wait to this cap.
 *
 * @public
 */
export const askQuestionsMaxWaitSeconds = 240;

const isoTimestampSchema = z.iso.datetime();

/** One choice offered for a question. @public */
export const askedOptionSchema = z.object({
  label: z.string().min(1).max(120),
  description: z.string().max(400).optional(),
});

/** One question as the record keeps it, whichever agent asked it. @public */
export const askedQuestionSchema = z.object({
  id: z.string().min(1).max(128),
  header: z.string().max(64).optional(),
  question: z.string().min(1).max(2000),
  options: z.array(askedOptionSchema).max(12),
  /** Index of the option adopted when nobody answers in time; absent when the question has no default. */
  recommended: z.number().int().nonnegative().optional(),
  /** Whether the person may answer in their own words. */
  allowsText: z.boolean(),
  /** The asking agent expects a list (an ACP multi-select field); Tau answers it with one item. */
  isList: z.literal(true).optional(),
});

/** How an ask's wait ended. @public */
export const askOutcomes = ['answered', 'partial', 'defaulted', 'declined', 'cancelled'] as const;

/** @public */
export type AskOutcome = (typeof askOutcomes)[number];

/** One call's questions, written once by the host and resolved by it when the wait ends. @public */
export const askSchema = z.object({
  id: z.string().regex(/^ask_[A-Za-z0-9_-]{1,64}$/u),
  /** The asking tool call, when the carrier knows it (native calls and ACP elicitations). */
  callId: z.string().min(1).max(256).optional(),
  askedAt: isoTimestampSchema,
  /** When the recommended options are adopted; `null` waits for the person. */
  deadline: isoTimestampSchema.nullable(),
  source: z.enum(['tau', 'acp']),
  /** The external agent that asked (ACP only). */
  agentId: z.string().min(1).max(64).optional(),
  /** Context an ACP form sent beside its fields. */
  message: z.string().max(4000).optional(),
  questions: z.array(askedQuestionSchema).min(1).max(12),
  resolution: z.object({ at: isoTimestampSchema, outcome: z.enum(askOutcomes) }).optional(),
});

/** Most asks one chat keeps; the oldest fall off when a new one is recorded. */
const maxRecordedAsks = 200;

/** The whole of `questions.yaml`. Only the host writes it. @public */
export const questionsFileSchema = z.object({
  version: z.literal(1),
  asks: z.array(askSchema).max(maxRecordedAsks),
});

/** A person's answer to one question: a choice or their own words. @public */
export const questionAnswerSchema = z.union([
  z.object({ choice: z.string().min(1).max(120), at: isoTimestampSchema }),
  z.object({ text: z.string().min(1).max(4000), at: isoTimestampSchema }),
]);

/** Everything the person did with one ask. @public */
export const askAnswersSchema = z.object({
  /** The person started answering; the wait extends to the cap. */
  heldAt: isoTimestampSchema.optional(),
  /** The person declined a form with no default. */
  declined: z.literal(true).optional(),
  questions: z.record(z.string(), questionAnswerSchema),
});

/** The whole of `answers.yaml`. Only the person's client writes it. @public */
export const answersFileSchema = z.object({
  version: z.literal(1),
  answers: z.record(z.string(), askAnswersSchema),
});

/** @public */
export type AskedOption = z.infer<typeof askedOptionSchema>;
/** @public */
export type AskedQuestion = z.infer<typeof askedQuestionSchema>;
/** @public */
export type Ask = z.infer<typeof askSchema>;
/** @public */
export type QuestionsFile = z.infer<typeof questionsFileSchema>;
/** @public */
export type QuestionAnswer = z.infer<typeof questionAnswerSchema>;
/** @public */
export type AskAnswers = z.infer<typeof askAnswersSchema>;
/** @public */
export type AnswersFile = z.infer<typeof answersFileSchema>;

/**
 * Where a chat keeps the questions its agents asked.
 *
 * @param chatId - The owning chat.
 * @returns `.tau/chats/<chatId>/questions.yaml`, relative to the project root.
 * @public
 */
export const questionsPath = (chatId: string): string => `.tau/chats/${chatId}/questions.yaml`;

/**
 * Where a chat keeps the person's answers.
 *
 * @param chatId - The owning chat.
 * @returns `.tau/chats/<chatId>/answers.yaml`, relative to the project root.
 * @public
 */
export const answersPath = (chatId: string): string => `.tau/chats/${chatId}/answers.yaml`;

/** An empty questions record. @public */
export const emptyQuestionsFile = (): QuestionsFile => ({ version: 1, asks: [] });

/** An empty answers record. @public */
export const emptyAnswersFile = (): AnswersFile => ({ version: 1, answers: {} });

const parseYaml = <T>(text: string, schema: z.ZodType<T>, name: string): T | undefined => {
  let document: unknown;
  try {
    document = load(text);
  } catch {
    return undefined;
  }
  const parsed = schema.safeParse(document);
  if (!parsed.success) {
    // ponytail: an unreadable record reads as empty; the next write replaces it whole.
    console.warn(`Ignoring malformed ${name}: ${z.prettifyError(parsed.error)}`);
    return undefined;
  }
  return parsed.data;
};

/**
 * Read `questions.yaml` text; malformed or missing text reads as no asks.
 *
 * @param text - The file's text, or `undefined` when it does not exist.
 * @returns The record.
 * @public
 */
export const parseQuestionsFile = (text: string | undefined): QuestionsFile =>
  (text === undefined ? undefined : parseYaml(text, questionsFileSchema, 'questions.yaml')) ?? emptyQuestionsFile();

/**
 * Read `answers.yaml` text; malformed or missing text reads as no answers.
 *
 * @param text - The file's text, or `undefined` when it does not exist.
 * @returns The record.
 * @public
 */
export const parseAnswersFile = (text: string | undefined): AnswersFile =>
  (text === undefined ? undefined : parseYaml(text, answersFileSchema, 'answers.yaml')) ?? emptyAnswersFile();

/**
 * The bytes a questions record is stored as.
 *
 * @param file - A validated record; only the newest asks are kept.
 * @returns YAML text ending in one newline.
 * @public
 */
export const serializeQuestionsFile = (file: QuestionsFile): string =>
  dump({ version: 1, asks: file.asks.slice(-maxRecordedAsks) }, { lineWidth: -1 });

/**
 * The bytes an answers record is stored as.
 *
 * @param file - A validated record.
 * @returns YAML text ending in one newline.
 * @public
 */
export const serializeAnswersFile = (file: AnswersFile): string => dump(file, { lineWidth: -1 });

/**
 * When the host stops waiting for this ask, in epoch milliseconds.
 *
 * @param ask - The recorded ask.
 * @param answers - What the person did with it so far.
 * @returns The effective deadline, or `undefined` when the ask waits for the person.
 * @public
 */
export const effectiveDeadline = (ask: Ask, answers: AskAnswers | undefined): number | undefined => {
  if (ask.deadline === null) {
    return undefined;
  }
  const deadline = Date.parse(ask.deadline);
  return answers?.heldAt === undefined
    ? deadline
    : Math.max(deadline, Date.parse(ask.askedAt) + askQuestionsMaxWaitSeconds * 1000);
};

/** One question's settled answer, as the asking agent receives it. @public */
export type ResolvedAnswer = {
  readonly id: string;
  /** The chosen label or the person's text. */
  readonly answer: string;
  readonly source: 'person' | 'recommended';
  /** The person typed this answer rather than choosing an option. */
  readonly text?: true;
};

/**
 * Each question's answer: the person's when given, otherwise its recommended option.
 *
 * @param ask - The recorded ask.
 * @param answers - What the person did with it.
 * @returns One entry per question that has an answer or a default, in question order.
 * @public
 */
export const resolveAnswers = (ask: Ask, answers: AskAnswers | undefined): ResolvedAnswer[] =>
  ask.questions.flatMap((question): ResolvedAnswer[] => {
    const given = answers?.questions[question.id];
    if (given !== undefined) {
      return 'choice' in given
        ? [{ id: question.id, answer: given.choice, source: 'person' }]
        : [{ id: question.id, answer: given.text, source: 'person', text: true }];
    }
    const fallback = question.recommended === undefined ? undefined : question.options[question.recommended];
    return fallback === undefined ? [] : [{ id: question.id, answer: fallback.label, source: 'recommended' }];
  });

/** Where an ask stands for the person, derived from both records and the clock. @public */
export type AskStatus =
  | {
      readonly kind: 'open';
      /** Milliseconds until the recommended options are adopted; `undefined` when the ask waits for the person. */
      readonly remaining: number | undefined;
      readonly held: boolean;
    }
  | { readonly kind: 'answered' }
  | { readonly kind: 'declined' }
  /** The agent moved on with the recommended options; the person may still answer. */
  | { readonly kind: 'defaulted' }
  /** The run stopped before anyone answered; the person may still answer. */
  | { readonly kind: 'cancelled' };

/**
 * Where an ask stands now.
 *
 * @param ask - The recorded ask.
 * @param answers - What the person did with it.
 * @param now - Epoch milliseconds.
 * @returns The status the card and the tray present.
 * @public
 */
export const askStatus = (ask: Ask, answers: AskAnswers | undefined, now: number): AskStatus => {
  if (answers?.declined) {
    return { kind: 'declined' };
  }
  if (ask.questions.every((question) => answers?.questions[question.id] !== undefined)) {
    return { kind: 'answered' };
  }
  if (ask.resolution !== undefined) {
    return ask.resolution.outcome === 'cancelled' || ask.resolution.outcome === 'declined'
      ? { kind: 'cancelled' }
      : { kind: 'defaulted' };
  }
  const deadline = effectiveDeadline(ask, answers);
  if (deadline !== undefined && now >= deadline) {
    return { kind: 'defaulted' };
  }
  return {
    kind: 'open',
    remaining: deadline === undefined ? undefined : deadline - now,
    held: answers?.heldAt !== undefined,
  };
};

/**
 * How an ask's wait ended, from what the person did.
 *
 * @param ask - The recorded ask.
 * @param answers - What the person did with it when the wait ended.
 * @returns `declined`, `cancelled` (nothing answered, nothing to default to), or how much the person answered.
 * @public
 */
export const askOutcomeOf = (ask: Ask, answers: AskAnswers | undefined): AskOutcome => {
  if (answers?.declined) {
    return 'declined';
  }
  const resolved = resolveAnswers(ask, answers);
  const defaulted = resolved.filter((answer) => answer.source === 'recommended').length;
  if (resolved.length === 0) {
    return 'cancelled';
  }
  if (defaulted === 0) {
    return 'answered';
  }
  return defaulted === resolved.length ? 'defaulted' : 'partial';
};
