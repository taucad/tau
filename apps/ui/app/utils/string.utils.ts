/**
 * Convert a string from camelCase, PascalCase, Title Case, or kebab-case to snake_case.
 *
 * @example toSnakeCase('chatTranscript') // 'chat_transcript'
 * @example toSnakeCase('Chat Transcript') // 'chat_transcript'
 * @example toSnakeCase('chat-transcript') // 'chat_transcript'
 *
 * @param string_ The string to convert
 * @returns The snake_case string
 */
export const toSnakeCase = (string_: string): string => {
  return string_
    .replaceAll(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replaceAll(/([\da-z])([A-Z])/g, '$1_$2')
    .replaceAll(/[\s-]+/g, '_')
    .toLowerCase();
};
