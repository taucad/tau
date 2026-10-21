import { describe, expect, it } from 'vitest';
import { permitsPrivatePut } from '#storage/private-storage-probe.js';

const origin = 'https://taucad.dev';
const requested = ['content-type', 'x-amz-checksum-sha256'];
const response = (headers: Record<string, string> = {}) =>
  new Response(null, {
    headers: {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'GET, PUT, HEAD',
      'access-control-allow-headers': 'Content-Type, X-Amz-Checksum-Sha256',
      ...headers,
    },
  });
describe('private transfer preflight acceptance', () => {
  it('requires the checksum header grant even when origin and status are valid', () => {
    expect(permitsPrivatePut(response({ 'access-control-allow-headers': 'Content-Type' }), origin, requested)).toBe(
      false,
    );
  });
  it('requires the PUT method', () => {
    expect(permitsPrivatePut(response({ 'access-control-allow-methods': 'GET, HEAD' }), origin, requested)).toBe(false);
  });
  it('rejects a wildcard or different origin', () => {
    expect(permitsPrivatePut(response({ 'access-control-allow-origin': '*' }), origin, requested)).toBe(false);
    expect(permitsPrivatePut(response(), 'https://not-tau.invalid', requested)).toBe(false);
  });
  it('accepts explicit method and case-insensitive header grants for the exact origin', () => {
    expect(permitsPrivatePut(response(), origin, requested)).toBe(true);
  });
});
