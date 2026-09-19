export type SseEvent = {
  readonly event?: string;
  readonly data: unknown;
};

const utf8Bytes = (character: string): number => {
  const codePoint = character.codePointAt(0)!;
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
};

const parseEvent = (lines: readonly string[]): SseEvent | undefined => {
  let event: string | undefined;
  const data: string[] = [];
  for (const line of lines) {
    if (line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    const field = colon < 0 ? line : line.slice(0, colon);
    const rawValue = colon < 0 ? '' : line.slice(colon + 1);
    const value = rawValue.startsWith(' ') ? rawValue.slice(1) : rawValue;
    if (field === 'event') event = value;
    if (field === 'data') data.push(value);
  }
  const dataText = data.join('\n');
  if (dataText === '' || dataText.trim() === '[DONE]') return undefined;
  try {
    return { ...(event === undefined ? {} : { event }), data: JSON.parse(dataText) as unknown };
  } catch {
    return { ...(event === undefined ? {} : { event }), data: dataText };
  }
};

export const createSseDecoder = (input: {
  readonly onEvent: (event: SseEvent) => void;
  readonly maxEventBytes?: number;
}) => {
  const maxEventBytes = input.maxEventBytes ?? 256 * 1024;
  const decoder = new TextDecoder();
  let currentBytes = 0;
  let line = '';
  let lines: string[] = [];
  let swallowLf = false;

  const finishLine = (): void => {
    if (line !== '') {
      lines.push(line);
      line = '';
      return;
    }
    const event = parseEvent(lines);
    lines = [];
    currentBytes = 0;
    if (event !== undefined) input.onEvent(event);
  };

  const processText = (text: string): void => {
    for (const character of text) {
      if (swallowLf) {
        swallowLf = false;
        if (character === '\n') continue;
      }
      currentBytes += utf8Bytes(character);
      if (currentBytes > maxEventBytes) {
        throw new Error(`SSE event exceeds ${String(maxEventBytes)} bytes`);
      }
      if (character === '\r') {
        finishLine();
        swallowLf = true;
      } else if (character === '\n') {
        finishLine();
      } else {
        line += character;
      }
    }
  };

  return {
    write(chunk: Uint8Array<ArrayBuffer>): void {
      processText(decoder.decode(chunk, { stream: true }));
    },
    end(): void {
      processText(decoder.decode());
      if (line !== '') lines.push(line);
      line = '';
      const event = parseEvent(lines);
      lines = [];
      currentBytes = 0;
      if (event !== undefined) input.onEvent(event);
    },
  };
};
