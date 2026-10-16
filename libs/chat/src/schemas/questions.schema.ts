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
  /** Exact provider value, independent of the displayed label. */
  value: z.string().max(4000).optional(),
  description: z.string().max(400).optional(),
});

/** Supported form constraints, retained for validation at the host boundary. @public */
export const questionFieldSchema = z.object({
  type: z.enum(['string', 'number', 'integer', 'boolean', 'array']),
  required: z.boolean(),
  minimum: z.number().optional(),
  maximum: z.number().optional(),
  minLength: z.number().int().nonnegative().optional(),
  maxLength: z.number().int().nonnegative().optional(),
  minItems: z.number().int().nonnegative().optional(),
  maxItems: z.number().int().nonnegative().optional(),
  format: z.enum(['email', 'uri', 'date', 'date-time']).optional(),
});

/** Primitive form values supported by the negotiated form capability. @public */
export const questionValueSchema = z.union([
  z.string().max(4000),
  z.number(),
  z.boolean(),
  z.array(z.string().max(4000)).max(12),
]);
/** @public */
export type QuestionValue = z.infer<typeof questionValueSchema>;

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
  /** The asking agent expects a list (an ACP multi-select field). */
  isList: z.literal(true).optional(),
  field: questionFieldSchema.optional(),
});

/** How an ask's wait ended. @public */
export const askOutcomes = ['answered', 'partial', 'defaulted', 'declined', 'cancelled'] as const;

/** @public */
export type AskOutcome = (typeof askOutcomes)[number];

/** One call's questions, written once by the host and resolved by it when the wait ends. @public */
export const askSchema = z.object({
  id: z.string().regex(/^ask_[A-Za-z0-9_-]{1,64}$/u),
  /** The host consumes typed answers from the v2 record. Absent on legacy asks. */
  answerVersion: z.literal(2).optional(),
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

/** The whole of a v1/v2 questions record. Only the host writes it. @public */
export const questionsFileSchema = z.object({
  version: z.union([z.literal(1), z.literal(2)]),
  asks: z.array(askSchema).max(maxRecordedAsks),
});

/** A person's exact typed answer, legacy choice/text, or explicit optional skip. @public */
export const questionAnswerSchema = z.union([
  z.strictObject({ choice: z.string().min(1).max(120), at: isoTimestampSchema }),
  z.strictObject({ text: z.string().min(1).max(4000), at: isoTimestampSchema }),
  z.strictObject({ value: questionValueSchema, at: isoTimestampSchema }),
  z.strictObject({ skipped: z.literal(true), at: isoTimestampSchema }),
]);

/** Everything the person did with one ask. @public */
export const askAnswersSchema = z.object({
  /** The person started answering; the wait extends to the cap. */
  heldAt: isoTimestampSchema.optional(),
  /** The person declined a form with no default. */
  declined: z.literal(true).optional(),
  questions: z.record(z.string(), questionAnswerSchema),
});

/** The whole of a v1/v2 answers record. Only the person's client writes it. @public */
export const answersFileSchema = z.object({
  version: z.union([z.literal(1), z.literal(2)]),
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
/** A submitted answer before the record owner timestamps it. @public */
export type QuestionReply = QuestionAnswer extends infer Answer
  ? Answer extends QuestionAnswer
    ? Omit<Answer, 'at'>
    : never
  : never;
/** @public */
export type AskAnswers = z.infer<typeof askAnswersSchema>;
/** @public */
export type AnswersFile = z.infer<typeof answersFileSchema>;

/**
 * Where a chat keeps the questions its agents asked.
 *
 * @param chatId - The owning chat.
 * @returns `.tau/chats/<chatId>/questions.v2.yaml`, relative to the project root.
 * @public
 */
export const questionsPath = (chatId: string): string => `.tau/chats/${chatId}/questions.v2.yaml`;

/** Preserved v1 record path, read only by new clients. @public */
export const legacyQuestionsPath = (chatId: string): string => `.tau/chats/${chatId}/questions.yaml`;

/**
 * Where a chat keeps the person's answers.
 *
 * @param chatId - The owning chat.
 * @returns `.tau/chats/<chatId>/answers.v2.yaml`, relative to the project root.
 * @public
 */
export const answersPath = (chatId: string): string => `.tau/chats/${chatId}/answers.v2.yaml`;

/** Preserved v1 answers path, read only by new clients. @public */
export const legacyAnswersPath = (chatId: string): string => `.tau/chats/${chatId}/answers.yaml`;

/** An empty questions record. @public */
export const emptyQuestionsFile = (): QuestionsFile => ({ version: 2, asks: [] });

/** An empty answers record. @public */
export const emptyAnswersFile = (): AnswersFile => ({ version: 2, answers: {} });

const parseYaml = <T>(text: string, schema: z.ZodType<T>, name: string): T | undefined => {
  let document: unknown;
  try {
    document = load(text);
  } catch {
    throw new Error(`Invalid ${name}; restore the record before editing it.`);
  }
  if (
    typeof document === 'object' &&
    document !== null &&
    'version' in document &&
    document.version !== 1 &&
    document.version !== 2
  ) {
    throw new Error(`Unsupported ${name} version; update Tau before editing this record.`);
  }
  const parsed = schema.safeParse(document);
  if (!parsed.success) {
    throw new Error(`Invalid ${name}; restore the record before editing it.`);
  }
  return parsed.data;
};

/**
 * Read `questions.yaml` text; missing text reads as no asks; invalid records are refused.
 *
 * @param text - The file's text, or `undefined` when it does not exist.
 * @returns The record.
 * @public
 */
export const parseQuestionsFile = (text: string | undefined): QuestionsFile =>
  (text === undefined ? undefined : parseYaml(text, questionsFileSchema, 'questions.yaml')) ?? emptyQuestionsFile();

/**
 * Read `answers.yaml` text; missing text reads as no answers; invalid records are refused.
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
  dump({ version: 2, asks: file.asks.slice(-maxRecordedAsks) }, { lineWidth: -1 });

/**
 * The bytes an answers record is stored as.
 *
 * @param file - A validated record.
 * @returns YAML text ending in one newline.
 * @public
 */
export const serializeAnswersFile = (file: AnswersFile): string => dump({ ...file, version: 2 }, { lineWidth: -1 });

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
  /** Exact typed provider value; absent on legacy ordinary text responses. */
  readonly value?: QuestionValue;
};

/**
 * Validate an answer against its immutable question; no coercion or label guessing.
 * @param question - Recorded field and choices.
 * @param answer - Untrusted persisted answer.
 * @returns Whether the answer satisfies the field.
 * @public
 */
export const isQuestionAnswerValid = (
  question: AskedQuestion,
  answer: (QuestionReply & { readonly at?: string }) | undefined,
): boolean => {
  if (answer !== undefined && !questionAnswerSchema.safeParse({ ...answer, at: '1970-01-01T00:00:00.000Z' }).success) {
    return false;
  }
  if (answer === undefined) {
    return false;
  }
  if ('skipped' in answer) {
    return question.field?.required === false;
  }
  if ('choice' in answer) {
    const options = question.options.filter((option) => option.label === answer.choice);
    const [option] = options;
    if (options.length !== 1 || option === undefined) {
      return false;
    }
    if (question.field === undefined) {
      return true;
    }
    const raw = option.value ?? option.label;
    const value = question.field.type === 'array' ? [raw] : question.field.type === 'boolean' ? raw === 'true' : raw;
    return isQuestionAnswerValid(question, { value });
  }
  if ('text' in answer) {
    if (!question.allowsText || answer.text.trim() === '') {
      return false;
    }
    if (question.field === undefined || question.field.type === 'array') {
      return true;
    }
    return (
      question.field.type === 'string' && isQuestionAnswerValid({ ...question, options: [] }, { value: answer.text })
    );
  }
  const { value } = answer;
  const { field } = question;
  if (field === undefined) {
    return false;
  }
  if (field.type === 'array') {
    return (
      Array.isArray(value) &&
      new Set(value).size === value.length &&
      value.length >= (field.minItems ?? 0) &&
      value.length <= (field.maxItems ?? 12) &&
      value.every((item) => question.options.some((option) => (option.value ?? option.label) === item))
    );
  }
  if (field.type === 'boolean') {
    return typeof value === 'boolean';
  }
  if (field.type === 'number' || field.type === 'integer') {
    return (
      typeof value === 'number' &&
      Number.isFinite(value) &&
      (field.type !== 'integer' || Number.isInteger(value)) &&
      (field.minimum === undefined || value >= field.minimum) &&
      (field.maximum === undefined || value <= field.maximum)
    );
  }
  if (typeof value !== 'string' || value.length < (field.minLength ?? 0) || value.length > (field.maxLength ?? 4000)) {
    return false;
  }
  if (question.options.length > 0 && !question.options.some((option) => (option.value ?? option.label) === value)) {
    return false;
  }
  switch (field.format) {
    case 'email': {
      return z.email().safeParse(value).success;
    }
    case 'uri': {
      return z.url().safeParse(value).success;
    }
    case 'date': {
      return z.iso.date().safeParse(value).success;
    }
    case 'date-time': {
      return z.iso.datetime({ offset: true }).safeParse(value).success;
    }
    default: {
      return true;
    }
  }
};

/** Display a typed value without changing its wire representation. @public */
export const questionValueText = (value: QuestionValue): string =>
  Array.isArray(value) ? value.join(', ') : String(value);

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
      if (!isQuestionAnswerValid(question, given) || 'skipped' in given) {
        return [];
      }
      if ('value' in given) {
        return [{ id: question.id, answer: questionValueText(given.value), value: given.value, source: 'person' }];
      }
      return 'choice' in given
        ? [{ id: question.id, answer: given.choice, source: 'person' }]
        : [{ id: question.id, answer: given.text, source: 'person', text: true }];
    }
    const fallback = question.recommended === undefined ? undefined : question.options[question.recommended];
    if (fallback === undefined) {
      return [];
    }
    if (question.field === undefined) {
      return [{ id: question.id, answer: fallback.label, source: 'recommended' }];
    }
    const raw = fallback.value ?? fallback.label;
    const value = question.field.type === 'array' ? [raw] : question.field.type === 'boolean' ? raw === 'true' : raw;
    return isQuestionAnswerValid(question, { value })
      ? [{ id: question.id, answer: fallback.label, value, source: 'recommended' }]
      : [];
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
  if (ask.questions.every((question) => isQuestionAnswerValid(question, answers?.questions[question.id]))) {
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
    return ask.questions.every((question) => isQuestionAnswerValid(question, answers?.questions[question.id]))
      ? 'answered'
      : 'cancelled';
  }
  if (defaulted === 0) {
    return 'answered';
  }
  return defaulted === resolved.length ? 'defaulted' : 'partial';
};
