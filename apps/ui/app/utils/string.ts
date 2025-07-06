/**
 * Convert a string from camelCase to Sentence Case
 *
 * @param string_ The camelCase string to convert
 * @returns The converted Sentence Case string
 */
export const camelCaseToSentenceCase = (string_: string): string => {
  return string_.replaceAll(/(?<=[a-z\d])([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase());
};
