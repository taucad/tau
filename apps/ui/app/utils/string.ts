/**
 * Convert a string from camelCase or snake_case to Sentence Case. Acronyms are preserved.
 *
 * @example
 * toSentenceCase('firstName') // 'First Name'
 *
 * @example
 * toSentenceCase('first_name') // 'First Name'
 *
 * @example
 * toSentenceCase('HTML') // 'HTML'
 *
 * @example
 * toSentenceCase('xml_http_request') // 'Xml Http Request'
 *
 * @param string_ The camelCase or snake_case string to convert
 * @returns The converted Sentence Case string
 */
export const toSentenceCase = (string_: string): string => {
  return string_
    .replaceAll('_', ' ') // Convert snake_case underscores to spaces
    .replaceAll(/(?<=[a-z\d])([A-Z])/g, ' $1') // Add space before uppercase letters
    .replace(/^./, (char) => char.toUpperCase()); // Capitalize first character
};
