/**
 * Convert a string from identifier casing to Title Case. Acronyms are preserved.
 *
 * @example
 * toTitleCase('firstName') // 'First Name'
 *
 * @example
 * toTitleCase('first_name') // 'First Name'
 *
 * @example
 * toTitleCase('HTML') // 'HTML'
 *
 * @example
 * toTitleCase('xml_http_request') // 'Xml Http Request'
 *
 * @example
 * toTitleCase('test123Name') // 'Test 123 Name'
 *
 * @example
 * toTitleCase('api2Response') // 'Api 2 Response'
 *
 * @param string_ The identifier or display string to convert
 * @returns The converted Title Case string
 */
export const toTitleCase = (string_: string): string => {
  return (
    string_
      // Convert snake_case and kebab-case separators to spaces
      .replaceAll(/[_-]/g, ' ')
      // Add space before uppercase letters when preceded by lowercase letters or digits
      .replaceAll(/(?<=[\da-z])([A-Z])/g, ' $1')
      // Add space between letters and digits (e.g., 'test123' -> 'test 123')
      .replaceAll(/(?<=[A-Za-z])(\d)/g, ' $1')
      // Add space between digits and letters (e.g., '123test' -> '123 test')
      .replaceAll(/(?<=\d)([A-Za-z])/g, ' $1')
      // Add space after special characters when followed by alphanumeric
      .replaceAll(/([^\s\w])([\dA-Za-z])/g, '$1 $2')
      // Remove extra spaces
      .replaceAll(/\s+/g, ' ')
      .trim()
      // Capitalize the first letter of each word
      .replaceAll(/\b\w/g, (char) => char.toUpperCase())
  );
};

/**
 * Format a user-visible display label in Tau's Title Case style.
 *
 * @param label The identifier or display label to format
 * @returns The formatted display label
 */
export const formatDisplayLabel = (label: string): string => toTitleCase(label);

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
