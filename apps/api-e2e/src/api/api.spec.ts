import axios from 'axios';
import { describe, it, expect } from 'vitest';

describe('GET /api', () => {
  it('should return a message', async () => {
    const response = await axios.get(`/api`);

    expect(response.status).toBe(200);
    expect(response.data).toEqual({ message: 'Hello API' });
  });
});
