import ky from 'ky';
import { describe, it, expect } from 'vitest';

describe('GET /api', () => {
  it('should return a message', async () => {
    const response = await ky.get(`/api`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ message: 'Hello API' });
  });
});
