import '#styles/global.css';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { ChatMessageQueueView } from '#components/chat/chat-message-queue-view.js';

afterEach(() => {
  cleanup();
  document.documentElement.style.fontSize = '';
});

// These widths reproduce a narrow Dockview chat pane, independently of window size.
describe('message queue pane reflow', () => {
  it.each([280, 320, 400, 560])('should keep text and actions on one compact row at %s px', async (width) => {
    await page.viewport(1000, 720);
    render(
      <div style={{ width }}>
        <ChatMessageQueueView
          items={[
            {
              id: 'one',
              requestId: 'req_one',
              message: {
                id: 'one',
                role: 'user',
                parts: [{ type: 'text', text: 'Keep the four-wheel bogie and show the complete retraction linkage.' }],
              },
            },
          ]}
          onEdit={async () => undefined}
          onSteer={async () => undefined}
          onMoveFirst={async () => undefined}
          onRetry={() => undefined}
        />
      </div>,
    );
    const row = screen.getByRole('listitem');
    const preview = screen.getByText('Keep the four-wheel bogie and show the complete retraction linkage.');
    const steer = screen.getByRole('button', { name: 'Steer' });
    const textBox = preview.getBoundingClientRect();
    const actionBox = steer.getBoundingClientRect();
    expect(Math.abs((textBox.top + textBox.bottom) / 2 - (actionBox.top + actionBox.bottom) / 2)).toBeLessThan(2);
    expect(row.getBoundingClientRect().height).toBeLessThanOrEqual(40);
    expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth);
    expect(textBox.width).toBeGreaterThan(30);
    expect(getComputedStyle(steer).fontWeight).toBe('400');
  });
});

describe('message queue busy and enlarged text', () => {
  it.each([
    { enlarged: false, sending: true },
    { enlarged: true, sending: true },
    { enlarged: true, sending: false },
  ])('should keep status and every control inside the pane with enlarged text=%s', async ({ enlarged, sending }) => {
    await page.viewport(1000, 900);
    document.documentElement.style.fontSize = enlarged ? '200%' : '';
    render(
      <div style={{ width: 252 }}>
        <ChatMessageQueueView
          items={[
            {
              id: 'one',
              requestId: 'req_one',
              message: {
                id: 'one',
                role: 'user',
                parts: [{ type: 'text', text: 'A long follow-up instruction that stays saved while sending' }],
              },
            },
          ]}
          sendingId={sending ? 'one' : undefined}
          onEdit={async () => undefined}
          onSteer={async () => undefined}
          onMoveFirst={async () => undefined}
          onRetry={() => undefined}
        />
      </div>,
    );
    const row = screen.getByRole('listitem');
    expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth);
    const bounds = row.getBoundingClientRect();
    for (const button of screen.getAllByRole('button')) {
      const box = button.getBoundingClientRect();
      expect(box.left).toBeGreaterThanOrEqual(bounds.left);
      expect(box.right).toBeLessThanOrEqual(bounds.right);
    }
    if (sending) {
      expect(screen.getByRole('status').textContent).toBe('Sending…');
    }
    expect(getComputedStyle(screen.getByRole('button', { name: 'Steer' })).opacity).toBe('1');
  });
});
