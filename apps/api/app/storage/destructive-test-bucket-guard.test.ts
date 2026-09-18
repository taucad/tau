import { describe, it, expect } from 'vitest';
import {
  assertDestructiveTestBucketAllowed,
  isDestructiveTestBucketAllowed,
} from '#storage/destructive-test-bucket-guard.js';

describe('destructive-test bucket guard', () => {
  describe('allowed buckets', () => {
    it.each(['tau-content', 'tau-content-private', 'TAU-Content-Private', '  tau-content  '])(
      'should allow the local MinIO bucket %j',
      (bucket) => {
        expect(isDestructiveTestBucketAllowed(bucket)).toBe(true);
      },
    );

    it.each(['tau-staging-conformance', 'tau-staging-conformance-w1', 'TAU-Staging-Conformance'])(
      'should allow the dedicated scratch bucket %j',
      (bucket) => {
        expect(isDestructiveTestBucketAllowed(bucket)).toBe(true);
      },
    );
  });

  describe('refused buckets', () => {
    it.each([
      'tau-staging-content',
      'tau-staging-content-private',
      'TAU-Staging-Content-Private',
      'Tau-Staging-Content',
      'tau-prod-content',
      'tau-content-private-2',
      '',
    ])('should refuse %j, which is not an allowlisted destructive-test bucket (D32)', (bucket) => {
      expect(isDestructiveTestBucketAllowed(bucket)).toBe(false);
      expect(() => {
        assertDestructiveTestBucketAllowed(bucket, 'unit test');
      }).toThrow(/scratch bucket/u);
    });

    it('should name the caller and the bucket in the refusal so a misconfigured run is obvious', () => {
      expect(() => {
        assertDestructiveTestBucketAllowed('tau-staging-content', 'the repository-store conformance suite');
      }).toThrow(
        /the repository-store conformance suite.*tau-staging-content|tau-staging-content.*conformance suite/su,
      );
    });
  });
});
