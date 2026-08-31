import { describe, expect, it } from 'vitest';
import { chatTabs } from '#routes/w.$workspace.$project/chat-interface-nav.js';

describe('mobile editor navigation', () => {
  it('exposes Share as a first-class drawer surface', () => {
    expect(chatTabs.map(({ id }) => id)).toContain('share');
    expect(chatTabs.find(({ id }) => id === 'share')?.label).toBe('Share');
  });
});
