/**
 * Simple string hash function
 */
export function hashCode(string_: string): string {
  let hash = 0;
  for (let index = 0; index < string_.length; index++) {
    const char = string_.charCodeAt(index);
    hash = (hash << 5) - hash + char;
    hash &= hash; // Convert to 32bit integer
  }

  return hash.toString(16);
}
