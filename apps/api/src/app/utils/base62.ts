/* eslint-disable no-bitwise -- Encoding and decoding Base62 strings is a valid use of bitwise operations. */
/**
 * Taken from: https://github.com/sindresorhus/base62
 */

const base = 62;
const baseBigint = 62n;
const alphabet = [...'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'];
const indices = new Map(alphabet.map((character, index) => [character, index]));

const cachedEncoder = new globalThis.TextEncoder();
const cachedDecoder = new globalThis.TextDecoder();

function assertString(value: unknown, label: string): void {
  if (typeof value !== 'string') {
    throw new TypeError(`The \`${label}\` parameter must be a string, got \`${String(value)}\` (${typeof value}).`);
  }
}

function getIndex(character: string): number {
  const index = indices.get(character);

  if (index === undefined) {
    throw new TypeError(`Unexpected character for Base62 encoding: \`${character}\`.`);
  }

  return index;
}

export function encodeString(string: string): string {
  assertString(string, 'string');
  return encodeBytes(cachedEncoder.encode(string));
}

export function decodeString(encodedString: string): string {
  assertString(encodedString, 'encodedString');
  return cachedDecoder.decode(decodeBytes(encodedString));
}

export function encodeBytes(bytes: Uint8Array): string {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError('The `bytes` parameter must be an instance of Uint8Array.');
  }

  if (bytes.length === 0) {
    return '';
  }

  // Prepend 0x01 to the byte array before encoding to ensure the BigInt conversion
  // does not strip any leading zeros and to prevent any byte sequence from being
  // interpreted as a numerically zero value.
  let value = 1n;

  for (const byte of bytes) {
    value = (value << 8n) | BigInt(byte);
  }

  return encodeBigInt(value);
}

export function decodeBytes(encodedString: string): Uint8Array {
  assertString(encodedString, 'encodedString');

  if (encodedString.length === 0) {
    return new Uint8Array();
  }

  let value = decodeBigInt(encodedString);

  const byteArray = [];
  while (value > 0n) {
    byteArray.push(Number(value & 0xffn));
    value >>= 8n;
  }

  // Remove the 0x01 that was prepended during encoding.
  return Uint8Array.from(byteArray.reverse().slice(1));
}

export function encodeInteger(integer: number): string {
  if (!Number.isInteger(integer)) {
    throw new TypeError(`Expected an integer, got \`${integer}\` (${typeof integer}).`);
  }

  if (integer < 0) {
    throw new TypeError('The integer must be non-negative.');
  }

  if (integer === 0) {
    return alphabet[0];
  }

  let encodedString = '';
  while (integer > 0) {
    encodedString = alphabet[integer % base] + encodedString;
    integer = Math.floor(integer / base);
  }

  return encodedString;
}

export function decodeInteger(encodedString: string): number {
  assertString(encodedString, 'encodedString');

  let integer = 0;
  for (const character of encodedString) {
    integer = integer * base + getIndex(character);
  }

  return integer;
}

export function encodeBigInt(bigint: bigint): string {
  if (typeof bigint !== 'bigint') {
    throw new TypeError(`Expected a bigint, got \`${String(bigint)}\` (${typeof bigint}).`);
  }

  if (bigint < 0) {
    throw new TypeError('The bigint must be non-negative.');
  }

  if (bigint === 0n) {
    return alphabet[0];
  }

  let encodedString = '';
  while (bigint > 0n) {
    encodedString = alphabet[Number(bigint % baseBigint)] + encodedString;
    bigint /= BigInt(base);
  }

  return encodedString;
}

export function decodeBigInt(encodedString: string): bigint {
  assertString(encodedString, 'encodedString');

  let bigint = 0n;
  for (const character of encodedString) {
    bigint = bigint * baseBigint + BigInt(getIndex(character));
  }

  return bigint;
}
