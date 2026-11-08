import { describe, it, expect } from 'vitest';
import { mapPostgresErrorToHint } from '#postgres-error-hint.utils.js';

describe('mapPostgresErrorToHint', () => {
  describe('top-level error.code', () => {
    it('should return paused-provider hint when code is ECONNREFUSED', () => {
      const error = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
      expect(mapPostgresErrorToHint(error)).toContain('Postgres host refused connection');
    });

    it('should return DNS hint when code is ENOTFOUND', () => {
      const error = Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });
      expect(mapPostgresErrorToHint(error)).toContain('DNS resolution failed');
    });

    it('should return TCP timeout hint when code is ETIMEDOUT', () => {
      const error = Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' });
      expect(mapPostgresErrorToHint(error)).toContain('TCP timeout');
    });

    it('should return auth-rotation hint when code is 28P01', () => {
      const error = Object.assign(new Error('password authentication failed'), { code: '28P01' });
      expect(mapPostgresErrorToHint(error)).toContain('Authentication failed');
    });

    it('should return privilege hint when code is 42501', () => {
      const error = Object.assign(new Error('permission denied for database'), { code: '42501' });
      expect(mapPostgresErrorToHint(error)).toContain('Insufficient privilege');
    });

    it('should return TLS hint when code is ERR_TLS_CERT_ALTNAME_INVALID', () => {
      const error = Object.assign(new Error('TLS cert alt name invalid'), {
        code: 'ERR_TLS_CERT_ALTNAME_INVALID',
      });
      expect(mapPostgresErrorToHint(error)).toContain('TLS certificate hostname mismatch');
    });
  });

  describe('error.cause.code (postgres-js wraps node:net errors)', () => {
    it('should walk cause chain and return DNS hint when only cause has the code', () => {
      const cause = Object.assign(new Error('getaddrinfo ENOTFOUND db.example'), { code: 'ENOTFOUND' });
      const error = new Error('Failed query: select 1', { cause });
      expect(mapPostgresErrorToHint(error)).toContain('DNS resolution failed');
    });

    it('should prefer top-level code over cause code', () => {
      const cause = Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });
      const error = Object.assign(new Error('connect ECONNREFUSED'), {
        code: 'ECONNREFUSED',
        cause,
      });
      expect(mapPostgresErrorToHint(error)).toContain('Postgres host refused connection');
    });
  });

  describe('fallback', () => {
    it('should return fallback when error has no code and no cause', () => {
      expect(mapPostgresErrorToHint(new Error('opaque'))).toContain('Unmapped Postgres error class');
    });

    it('should return fallback when error code is unknown', () => {
      const error = Object.assign(new Error('mystery'), { code: 'XX999' });
      expect(mapPostgresErrorToHint(error)).toContain('Unmapped Postgres error class');
    });

    it('should return fallback for non-Error thrown values', () => {
      expect(mapPostgresErrorToHint('string error')).toContain('Unmapped Postgres error class');
      expect(mapPostgresErrorToHint(undefined)).toContain('Unmapped Postgres error class');
      expect(mapPostgresErrorToHint(null)).toContain('Unmapped Postgres error class');
    });
  });
});
