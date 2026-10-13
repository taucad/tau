/**
 * Convert a string from identifier casing to Title Case. Acronyms are preserved.
 *
 * @param string_ - The identifier or display string to convert.
 * @returns The converted Title Case string.
 * @public
 * @example <caption>Identifier casings become Title Case</caption>
 * ```typescript
 * import { toTitleCase } from '@taucad/ui/utils/label';
 *
 * toTitleCase('firstName'); // 'First Name'
 * toTitleCase('xml_http_request'); // 'Xml Http Request'
 * toTitleCase('api2Response'); // 'Api 2 Response'
 * toTitleCase('HTML'); // 'HTML'
 * ```
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
 * @param label - The identifier or display label to format.
 * @returns The formatted display label.
 * @public
 * @example <caption>Format a parameter name for display</caption>
 * ```typescript
 * import { formatDisplayLabel } from '@taucad/ui/utils/label';
 *
 * formatDisplayLabel('bankAngle'); // 'Bank Angle'
 * ```
 */
export const formatDisplayLabel = (label: string): string => toTitleCase(label);
