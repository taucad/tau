import type { ClientTextPlan, ClientTextSnapshot } from '#rpc/client-text-mutation.js';
import { rpcClientErrorCode } from '#schemas/rpc.schema.js';

type MatchSpan = Readonly<{ start: number; end: number }>;
type LineEnding = '\n' | '\r' | '\r\n';

const allOccurrences = (content: string, needle: string): number[] => {
  const indices: number[] = [];
  for (let index = content.indexOf(needle); index !== -1; index = content.indexOf(needle, index + needle.length)) {
    indices.push(index);
  }
  return indices;
};

const exactSpans = (content: string, needle: string): MatchSpan[] =>
  allOccurrences(content, needle).map((start) => ({ start, end: start + needle.length }));

const foldCharacter = (character: string): string => {
  if (/^[\u2010-\u2015\u2212]$/u.test(character)) {
    return '-';
  }
  if (/^[\u2018-\u201B]$/u.test(character)) {
    return "'";
  }
  if (/^[\u201C-\u201F]$/u.test(character)) {
    return '"';
  }
  if (/^[\u00A0\u2002-\u200A\u202F\u205F\u3000]$/u.test(character)) {
    return ' ';
  }
  return character;
};

const trailingFoldCharacter = /^[\t \u00A0\u2002-\u200A\u202F\u205F\u3000]$/u;

const foldText = (value: string): { content: string; boundaries: number[] } => {
  let content = '';
  const boundaries = [0];
  let lineStart = 0;

  const appendLine = (start: number, end: number): void => {
    while (end > start && trailingFoldCharacter.test(value[end - 1]!)) {
      end -= 1;
    }
    let originalOffset = start;
    for (const character of value.slice(start, end)) {
      const folded = foldCharacter(character);
      content += folded;
      for (let offset = 1; offset <= folded.length; offset += 1) {
        boundaries.push(originalOffset + Math.min(offset, character.length));
      }
      originalOffset += character.length;
    }
  };

  for (const match of value.matchAll(/\r\n|\r|\n/gu)) {
    const lineBreakStart = match.index;
    const lineBreakEnd = lineBreakStart + match[0].length;
    appendLine(lineStart, lineBreakStart);
    content += '\n';
    boundaries.push(lineBreakEnd);
    lineStart = lineBreakEnd;
  }
  appendLine(lineStart, value.length);

  return { content, boundaries };
};

const foldedSpans = (content: string, needle: string): MatchSpan[] => {
  const foldedContent = foldText(content);
  const foldedNeedle = foldText(needle).content;
  if (foldedNeedle.length === 0) {
    return [];
  }
  return allOccurrences(foldedContent.content, foldedNeedle).map((start) => ({
    start: foldedContent.boundaries[start]!,
    end: foldedContent.boundaries[start + foldedNeedle.length]!,
  }));
};

const lineEndingForSpan = (content: string, span: MatchSpan): LineEnding => {
  const following = /\r\n|\r|\n/u.exec(content.slice(span.start))?.[0];
  if (following) {
    return following as LineEnding;
  }
  const preceding = [...content.slice(0, span.start).matchAll(/\r\n|\r|\n/gu)].at(-1)?.[0];
  return (preceding as LineEnding | undefined) ?? '\n';
};

const normalizeReplacementEol = (value: string, eol: LineEnding): string => value.replaceAll(/\r\n?|\n/gu, eol);

const replaceSpans = (content: string, spans: readonly MatchSpan[], replacement: string): string => {
  let updated = content;
  for (const span of spans.toReversed()) {
    const normalized = normalizeReplacementEol(replacement, lineEndingForSpan(content, span));
    updated = updated.slice(0, span.start) + normalized + updated.slice(span.end);
  }
  return updated;
};

const planAtTier = ({
  snapshot,
  spans,
  newString,
  replaceAll,
}: {
  snapshot: ClientTextSnapshot;
  spans: readonly MatchSpan[];
  newString: string;
  replaceAll: boolean;
}): ClientTextPlan => {
  if (spans.length > 1 && !replaceAll) {
    return {
      ok: false,
      errorCode: rpcClientErrorCode.ambiguousMatch,
      message: `oldString matched ${spans.length} locations. Include more context or set replaceAll.`,
    };
  }
  const selected = replaceAll ? spans : spans.slice(0, 1);
  return {
    ok: true,
    content: replaceSpans(snapshot.content, selected, newString),
    occurrences: selected.length,
  };
};

/** Build the deterministic exact-then-folded replacement planner. @public */
export const createExactReplacementPlan = ({
  oldString,
  newString,
  replaceAll = false,
}: {
  oldString: string;
  newString: string;
  replaceAll?: boolean;
}): ((snapshot: ClientTextSnapshot) => ClientTextPlan) => {
  return (snapshot) => {
    if (!oldString.isWellFormed() || !newString.isWellFormed()) {
      return {
        ok: false,
        errorCode: rpcClientErrorCode.validationError,
        message: 'oldString and newString must be well-formed UTF-16.',
      };
    }
    if (oldString.length === 0) {
      return {
        ok: false,
        errorCode: rpcClientErrorCode.validationError,
        message: 'oldString must not be empty.',
      };
    }

    const exact = exactSpans(snapshot.content, oldString);
    if (exact.length > 0) {
      return planAtTier({ snapshot, spans: exact, newString, replaceAll });
    }

    const folded = foldedSpans(snapshot.content, oldString);
    if (folded.length > 0) {
      return planAtTier({ snapshot, spans: folded, newString, replaceAll });
    }

    return {
      ok: false,
      errorCode: rpcClientErrorCode.contextNotFound,
      message: 'oldString was not found. Read the file again and copy a larger exact context.',
    };
  };
};
