/**
 * Convert a string from camelCase to Sentence Case
 *
 * @param string_ The camelCase string to convert
 * @returns The converted Sentence Case string
 */
export const camelCaseToSentenceCase = (string_: string): string => {
  return string_.replaceAll(/([A-Z])/g, ' $1').replace(/^./, function (string_) {
    return string_.toUpperCase();
  });
};
