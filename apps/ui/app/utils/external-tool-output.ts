import { isRecord } from '@taucad/utils/schema';

/** Decode only the byte-array fields the Grok adapter declares as text. */
const grokText = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    return value;
  }
  if (
    !Array.isArray(value) ||
    !value.every((byte: unknown) => typeof byte === 'number' && Number.isInteger(byte) && byte >= 0 && byte <= 255)
  ) {
    return undefined;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(value));
  } catch {
    return undefined;
  }
};

/** Read display text without changing the adapter's durable result envelope. */
export const externalToolOutputText = (output: unknown): string | undefined => {
  if (typeof output === 'string') {
    return output;
  }
  if (!isRecord(output)) {
    return undefined;
  }
  if (output['type'] === 'Bash') {
    return grokText(output['output']);
  }
  if (output['type'] === 'GrepSearch') {
    return (
      [grokText(output['stdout']), grokText(output['stderr'])]
        .filter((text) => text !== undefined && text !== '')
        .join('\n') || undefined
    );
  }
  return [output['formatted_output'], output['aggregated_output'], output['output'], output['text']].find(
    (value): value is string => typeof value === 'string' && value.trim() !== '',
  );
};
