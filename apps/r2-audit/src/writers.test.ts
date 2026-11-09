/* eslint-disable @typescript-eslint/naming-convention -- `token_ids` is the AUDIT_EXPECTED_WRITERS JSON key tau-cloud writes. */

import { describe, expect, it } from 'vitest';
import { parseExpectedWriters } from '#environment.js';
import { unexpectedWriter } from '#writers.js';

const expected = parseExpectedWriters(
  JSON.stringify({
    'tau-staging-au-dependencies': { token_ids: ['token-upload'], scripts: [] },
    'tau-staging-au-content-private': {
      token_ids: ['token-rw', 'token-storage'],
      scripts: ['tau-files-staging'],
    },
  }),
);

describe('parseExpectedWriters', () => {
  it('should read the tau-cloud JSON shape', () => {
    expect(expected.valid).toBe(true);
    expect([...expected.buckets.keys()]).toEqual(['tau-staging-au-dependencies', 'tau-staging-au-content-private']);
    expect(expected.buckets.get('tau-staging-au-content-private')?.scripts.has('tau-files-staging')).toBe(true);
  });

  it('should read a missing, malformed or mistyped binding as no buckets', () => {
    for (const raw of [
      undefined,
      '',
      'not json',
      '[]',
      '{"b":{"token_ids":"x","scripts":[]}}',
      '{"b":{"token_ids":[1],"scripts":[]}}',
    ]) {
      const parsed = parseExpectedWriters(raw);
      expect(parsed.valid).toBe(false);
      expect(parsed.buckets.size).toBe(0);
    }
  });

  it('should accept an empty map', () => {
    expect(parseExpectedWriters('{}')).toMatchObject({ valid: true });
  });
});

describe('unexpectedWriter', () => {
  it('should accept an expected token on its bucket', () => {
    expect(
      unexpectedWriter(expected, {
        bucket: 'tau-staging-au-dependencies',
        interface: 'S3',
        accessKeyId: 'token-upload',
      }),
    ).toBeUndefined();
  });

  it('should refuse a token expected only on another bucket', () => {
    expect(
      unexpectedWriter(expected, {
        bucket: 'tau-staging-au-dependencies',
        interface: 'S3',
        accessKeyId: 'token-rw',
      }),
    ).toBe('unknown-actor');
  });

  it('should refuse a write with no access key id', () => {
    expect(
      unexpectedWriter(expected, {
        bucket: 'tau-staging-au-dependencies',
        interface: 'S3',
      }),
    ).toBe('unknown-actor');
  });

  it('should match a Workers binding write by script name, not by key id', () => {
    const bucket = 'tau-staging-au-content-private';
    expect(
      unexpectedWriter(expected, {
        bucket,
        interface: 'Workers',
        scriptName: 'tau-files-staging',
      }),
    ).toBeUndefined();
    expect(
      unexpectedWriter(expected, {
        bucket,
        interface: 'Workers',
        scriptName: 'other',
      }),
    ).toBe('unknown-actor');
    expect(
      unexpectedWriter(expected, {
        bucket,
        interface: 'Workers',
        accessKeyId: 'token-rw',
      }),
    ).toBe('unknown-actor');
  });

  it('should refuse every interface = API write, even by an expected token', () => {
    expect(
      unexpectedWriter(expected, {
        bucket: 'tau-staging-au-dependencies',
        interface: 'API',
        accessKeyId: 'token-upload',
      }),
    ).toBe('api-interface');
  });

  it('should refuse a write on a bucket with no expected writers', () => {
    expect(
      unexpectedWriter(expected, {
        bucket: 'tau-unknown',
        interface: 'S3',
        accessKeyId: 'token-upload',
      }),
    ).toBe('unknown-bucket');
    expect(
      unexpectedWriter(parseExpectedWriters(undefined), {
        bucket: 'tau-staging-au-dependencies',
        interface: 'S3',
        accessKeyId: 'token-upload',
      }),
    ).toBe('unknown-bucket');
  });
});
