import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { acceptInvitationSchema } from '#collaboration/collaboration.dto.js';

describe('acceptInvitationSchema', () => {
  it('should admit a token as the invite route mints it', () => {
    const token = randomBytes(32).toString('base64url');
    expect(acceptInvitationSchema.parse({ token })).toEqual({ token });
  });

  it.each([{}, { token: '' }, { token: 7 }, { token: 'x'.repeat(129) }])('should refuse %o', (body) => {
    expect(acceptInvitationSchema.safeParse(body).success).toBe(false);
  });
});
