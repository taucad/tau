/**
 * Fast non-cryptographic hash function using djb2 algorithm
 * Good for cache keys, checksums, and non-security use cases
 */
export function hashCode(input: string): string {
  let hash = 5381;

  for (let index = 0; index < input.length; index++) {
    const char = input.codePointAt(index) ?? 0;
    // Djb2: hash * 33 + char (avoiding bitwise operations)
    hash = hash * 33 + char;
    // Keep within 32-bit range
    hash %= 2 ** 32;
  }

  // Ensure positive value and convert to hex
  const unsignedHash = hash < 0 ? hash + 2 ** 32 : hash;
  return unsignedHash.toString(16).padStart(8, '0');
}

/**
 * Cryptographically secure hash function using SHA-256
 * Use for security-sensitive applications
 */
export async function hashCodeSecure(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = [...new Uint8Array(hashBuffer)];
  return hashArray.map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a cryptographically secure random string
 * Useful for IDs, tokens, and nonces
 */
export function generateSecureId(length = 16): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Compare two strings in constant time to prevent timing attacks
 * Use for comparing sensitive values like tokens or hashes
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let index = 0; index < a.length; index++) {
    const charA = a.codePointAt(index) ?? 0;
    const charB = b.codePointAt(index) ?? 0;
    result += charA === charB ? 0 : 1;
  }

  return result === 0;
}
