/**
 * Converts a JavaScript object to XML string representation
 * @param object - The object to convert to XML
 * @returns XML string representation of the object
 */
export function objectToXml(object: Record<string, unknown>): string {
  if (object === null || object === undefined) {
    return '';
  }

  let xmlContent = '';

  for (const [key, value] of Object.entries(object)) {
    if (Array.isArray(value)) {
      xmlContent += convertArrayToXml(key, value);
    } else if (isObject(value)) {
      xmlContent += `<${key}>${objectToXml(value as Record<string, unknown>)}</${key}>`;
    } else {
      xmlContent += `<${key}>${escapeXmlContent(String(value))}</${key}>`;
    }
  }

  return xmlContent;
}

/**
 * Converts an array to XML elements
 */
function convertArrayToXml(elementName: string, array: unknown[]): string {
  return array
    .map((item) => {
      if (isObject(item)) {
        return `<${elementName}>${objectToXml(item as Record<string, unknown>)}</${elementName}>`;
      }

      return `<${elementName}>${escapeXmlContent(String(item))}</${elementName}>`;
    })
    .join('');
}

/**
 * Checks if a value is a plain object (not null, not array)
 */
function isObject(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Escapes special XML characters in content
 */
function escapeXmlContent(content: string): string {
  return content
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
