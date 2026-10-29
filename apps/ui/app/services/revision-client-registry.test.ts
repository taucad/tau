import { describe, expect, it, vi } from 'vitest';

vi.mock('#hooks/use-revision-status.js', () => {
  throw new Error('Peeking at resident revision clients must not load project hooks');
});

describe('revision client lookup entry', () => {
  it('reports no resident client without loading project hooks or opening a connection', async () => {
    const { peekRevisionClient } = await import('#services/revision-client-registry.js');
    expect(peekRevisionClient('unopened-project')).toBeUndefined();
  });
});
