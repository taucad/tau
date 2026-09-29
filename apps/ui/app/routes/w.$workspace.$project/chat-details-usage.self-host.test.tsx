// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { useChatRecords, useProjectChatUsage } = vi.hoisted(() => ({
  useChatRecords: vi.fn(() => ({ chats: [] })),
  useProjectChatUsage: vi.fn(() => new Map()),
}));
vi.mock('#hooks/use-chats.js', () => ({ useProjectChatUsage }));
vi.mock('#hooks/use-chat-records.js', () => ({ useChatRecords }));
vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ projectId: 'project_one' }) }));

const { ChatDetailsUsage } = await import('#routes/w.$workspace.$project/chat-details-usage.self-host.js');

describe('self-host chat usage', () => {
  it('delays the full transcript query for a hidden Details panel', () => {
    render(<ChatDetailsUsage enabled={false} />);
    expect(useChatRecords).toHaveBeenCalledWith('project_one', { enabled: false });
    expect(useProjectChatUsage).toHaveBeenCalledWith('project_one', [], false);
  });
});
