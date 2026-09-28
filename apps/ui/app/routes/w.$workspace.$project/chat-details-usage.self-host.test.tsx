// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const useChats = vi.hoisted(() => vi.fn(() => ({ chats: [] })));
vi.mock('#hooks/use-chats.js', () => ({ useChats }));
vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ projectId: 'project_one' }) }));

const { ChatDetailsUsage } = await import('#routes/w.$workspace.$project/chat-details-usage.self-host.js');

describe('self-host chat usage', () => {
  it('delays the full transcript query for a hidden Details panel', () => {
    render(<ChatDetailsUsage enabled={false} />);
    expect(useChats).toHaveBeenCalledWith('project_one', { enabled: false });
  });
});
