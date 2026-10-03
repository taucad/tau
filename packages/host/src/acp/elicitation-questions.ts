/**
 * ACP form elicitation ↔ Tau's question record (agent questions blueprint D6).
 *
 * Codex's `request_user_input` and Claude's `AskUserQuestion` reach Tau as ACP
 * `elicitation/create` forms once the client advertises `elicitation.form`.
 * Each choice field becomes one question; the adapters' companion text fields
 * (Codex `<id>_note` tagged `_meta.codex.role = 'user_note'`, Claude
 * `question_<n>_custom` tagged `_meta._askUserQuestionCustomAnswer`) become that
 * question's own-words answer. Only those two question tools get a recommended
 * default; any other form waits for the person and can be declined.
 */
import type { CreateElicitationRequest, CreateElicitationResponse } from '@agentclientprotocol/sdk';
import { askQuestionsDefaultWaitSeconds, resolveAnswers } from '@taucad/chat';
import type { Ask, AskAnswers, AskedQuestion } from '@taucad/chat';
import { isRecord } from '@taucad/utils/schema';

type FieldKind = 'choice' | 'list' | 'boolean' | 'text' | 'number';

/** How one question maps back to the form's fields. */
type QuestionField = {
  readonly key: string;
  readonly kind: FieldKind;
  /** The wire value of each option, by option index. */
  readonly values: ReadonlyArray<string | boolean>;
  /** The companion own-words field, when the form has one. */
  readonly textKey?: string;
  /** Codex's "None of the above" value, chosen when the person answers in their own words. */
  readonly otherValue?: string;
};

/** An elicitation read as an ask, with the map back to its fields. @public */
export type ElicitationAsk = {
  readonly ask: Ask;
  readonly fields: ReadonlyMap<string, QuestionField>;
  readonly dialect: 'claude' | 'codex' | 'form';
};

const recommendedSuffix = /\s*\(recommended\)\s*$/iu;
const codexOther = 'None of the above';
const claudeCustomMarker = '_askUserQuestionCustomAnswer';

const metaOf = (value: Record<string, unknown>): Record<string, unknown> | undefined =>
  isRecord(value['_meta']) ? value['_meta'] : undefined;

const stringOf = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;

/** The question a companion text field answers, if it is one. */
const companionOf = (property: Record<string, unknown>): string | undefined => {
  const meta = metaOf(property);
  const claude = meta?.[claudeCustomMarker];
  if (isRecord(claude) && typeof claude['questionId'] === 'string') {
    return claude['questionId'];
  }
  const codex = meta?.['codex'];
  if (isRecord(codex) && codex['role'] === 'user_note' && typeof codex['questionId'] === 'string') {
    return codex['questionId'];
  }
  return undefined;
};

type Option = { readonly value: string; readonly title: string; readonly description?: string };

const optionsOf = (choices: unknown): Option[] | undefined => {
  if (!Array.isArray(choices)) {
    return undefined;
  }
  const options = choices.flatMap((choice): Option[] => {
    if (!isRecord(choice) || typeof choice['const'] !== 'string') {
      return [];
    }
    const description = stringOf(choice['description']);
    return [
      {
        value: choice['const'],
        title: stringOf(choice['title']) ?? choice['const'],
        ...(description === undefined ? {} : { description }),
      },
    ];
  });
  return options.length > 0 ? options : undefined;
};

const enumOptionsOf = (property: Record<string, unknown>): Option[] | undefined => {
  const values = property['enum'];
  if (!Array.isArray(values)) {
    return undefined;
  }
  const names = Array.isArray(property['enumNames']) ? property['enumNames'] : [];
  return values
    .filter((value): value is string => typeof value === 'string')
    .map((value, index) => ({ value, title: stringOf(names[index]) ?? value }));
};

/**
 * Read one `elicitation/create` form as an ask.
 *
 * @param request - The form request as received.
 * @param context - Who asked, a fresh ask id and the clock.
 * @returns The ask and its field map, or `undefined` for a form Tau cannot present.
 * @public
 */
export const askOfElicitation = (
  request: CreateElicitationRequest,
  context: { readonly agentId: string; readonly askId: string; readonly now: number },
): ElicitationAsk | undefined => {
  if (request.mode !== 'form' || !('requestedSchema' in request) || !isRecord(request.requestedSchema)) {
    return undefined;
  }
  const properties = isRecord(request.requestedSchema['properties']) ? request.requestedSchema['properties'] : {};
  const entries = Object.entries(properties).filter((entry): entry is [string, Record<string, unknown>] =>
    isRecord(entry[1]),
  );
  const meta = isRecord(request._meta) ? request._meta : undefined;
  const codexMeta = isRecord(meta?.['codex']) ? meta['codex'] : undefined;
  const companions = new Map<string, string>();
  for (const [key, property] of entries) {
    const questionId = companionOf(property);
    if (questionId !== undefined) {
      companions.set(questionId, key);
    }
  }
  const dialect: ElicitationAsk['dialect'] =
    codexMeta !== undefined || entries.some(([, property]) => isRecord(metaOf(property)?.['codex']))
      ? 'codex'
      : entries.some(([, property]) => isRecord(metaOf(property)?.[claudeCustomMarker]))
        ? 'claude'
        : 'form';
  const isQuestionTool = dialect !== 'form';
  const companionKeys = new Set(companions.values());
  const single = entries.filter(([key]) => !companionKeys.has(key)).length === 1;
  const fields = new Map<string, QuestionField>();
  const questions: AskedQuestion[] = [];

  for (const [key, property] of entries) {
    if (companionKeys.has(key)) {
      continue;
    }
    const title = stringOf(property['title']);
    const description = stringOf(property['description']);
    /* Codex puts the question in `title` and its header in `description`; Claude
     * the reverse, with a single question's text in `message`. */
    const question =
      dialect === 'codex'
        ? (title ?? description ?? key)
        : (description ?? (single && dialect === 'claude' ? request.message : undefined) ?? title ?? key);
    const header = dialect === 'codex' ? description : description === undefined && !single ? undefined : title;
    const items = isRecord(property['items']) ? property['items'] : undefined;
    let kind: FieldKind;
    let options: Option[] = [];
    switch (property['type']) {
      case 'array': {
        kind = 'list';
        options = optionsOf(items?.['anyOf']) ?? (items ? enumOptionsOf(items) : undefined) ?? [];
        break;
      }
      case 'boolean': {
        kind = 'boolean';
        options = [
          { value: 'true', title: 'Yes' },
          { value: 'false', title: 'No' },
        ];
        break;
      }
      case 'number':
      case 'integer': {
        kind = 'number';
        break;
      }
      default: {
        options = optionsOf(property['oneOf']) ?? enumOptionsOf(property) ?? [];
        kind = options.length > 0 ? 'choice' : 'text';
      }
    }
    const textKey = companions.get(key);
    const otherValue = options.find((option) => option.value === codexOther)?.value;
    const visible = options.filter((option) => option.value !== otherValue);
    const recommendedIndex = visible.findIndex((option) => recommendedSuffix.test(option.title));
    const allowsText = textKey !== undefined || kind === 'text' || kind === 'number';
    questions.push({
      id: key,
      ...(header === undefined || header === question ? {} : { header: header.slice(0, 64) }),
      question: question.slice(0, 2000),
      options: visible.map((option) => ({
        label: option.title.replace(recommendedSuffix, '').slice(0, 120),
        ...(option.description === undefined ? {} : { description: option.description.slice(0, 400) }),
      })),
      ...(isQuestionTool && visible.length > 0 ? { recommended: Math.max(0, recommendedIndex) } : {}),
      allowsText,
      ...(kind === 'list' ? { isList: true } : {}),
    });
    fields.set(key, {
      key,
      kind,
      values: kind === 'boolean' ? [true, false] : visible.map((option) => option.value),
      ...(textKey === undefined ? {} : { textKey }),
      ...(otherValue === undefined ? {} : { otherValue }),
    });
  }
  if (questions.length === 0 || questions.length > 12) {
    return undefined;
  }
  /* Milliseconds Codex lets the question wait before it resolves without answers. */
  const autoResolution = codexMeta?.['autoResolutionMs'];
  /** Milliseconds until the recommended options are adopted. */
  const wait = typeof autoResolution === 'number' ? autoResolution : askQuestionsDefaultWaitSeconds * 1000;
  const toolCallId = 'toolCallId' in request ? stringOf(request.toolCallId) : undefined;
  return {
    dialect,
    fields,
    ask: {
      id: context.askId,
      ...(toolCallId === undefined ? {} : { callId: toolCallId }),
      askedAt: new Date(context.now).toISOString(),
      deadline: isQuestionTool ? new Date(context.now + wait).toISOString() : null,
      source: 'acp',
      agentId: context.agentId,
      ...(single && dialect === 'claude' ? {} : { message: request.message.slice(0, 4000) }),
      questions,
    },
  };
};

/**
 * Answer the form from the person's answers, filling defaults where the wait ran out.
 *
 * @param elicitation - The ask and field map {@link askOfElicitation} returned.
 * @param answers - What the person did with it.
 * @returns The elicitation response for the adapter.
 * @public
 */
export const elicitationResponseOf = (
  elicitation: ElicitationAsk,
  answers: AskAnswers | undefined,
): CreateElicitationResponse => {
  if (answers?.declined) {
    return { action: 'decline' };
  }
  const resolved = resolveAnswers(elicitation.ask, answers);
  if (resolved.length === 0) {
    /* Nothing answered and nothing to default to: the person never decided. */
    return { action: elicitation.dialect === 'form' ? 'cancel' : 'decline' };
  }
  const content: Record<string, string | number | boolean | string[]> = {};
  for (const answer of resolved) {
    const field = elicitation.fields.get(answer.id);
    const question = elicitation.ask.questions.find((candidate) => candidate.id === answer.id);
    if (field === undefined || question === undefined) {
      continue;
    }
    const index = question.options.findIndex((option) => option.label === answer.answer);
    const value = answer.text === true ? undefined : field.values[index];
    if (value !== undefined) {
      content[field.key] = field.kind === 'list' ? [String(value)] : value;
    } else if (field.kind === 'number') {
      const number = Number(answer.answer);
      if (Number.isFinite(number)) {
        content[field.key] = number;
      }
    } else if (field.textKey === undefined) {
      content[field.key] = answer.answer;
    } else if (field.otherValue !== undefined) {
      content[field.key] = field.otherValue;
    }
    if (field.textKey !== undefined && answer.text === true) {
      content[field.textKey] = answer.answer;
    }
    if (field.textKey !== undefined && answer.source === 'recommended') {
      content[field.textKey] =
        elicitation.dialect === 'claude'
          ? `${answer.answer} (no reply from the person in time; Tau adopted the recommended option)`
          : 'No reply from the person in time; Tau adopted the recommended option.';
    }
  }
  return { action: 'accept', content };
};
