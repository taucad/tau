import '#styles/global.css';
import { Button } from '@taucad/ui/components/button';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
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
          onMove={async () => undefined}
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
          onMove={async () => undefined}
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

describe('message queue pointer reordering', () => {
  it.each([
    { source: 3, target: 0, y: 2, id: 'three', beforeId: 'one' },
    { source: 1, target: 2, y: 26, id: 'one', beforeId: undefined },
  ])(
    'should keep row geometry stable when dragging message $source to row $target',
    async ({ source, target, y, id, beforeId }) => {
      await page.viewport(1000, 720);
      const onMove = vi.fn(async () => undefined);
      render(
        <div style={{ width: 400 }}>
          <Button variant='ghost' size='icon-sm'>
            Standard button
          </Button>
          <ChatMessageQueueView
            items={['one', 'two', 'three'].map((id) => ({
              id,
              requestId: `req_${id}`,
              message: { id, role: 'user', parts: [{ type: 'text', text: id }] },
            }))}
            onEdit={async () => undefined}
            onSteer={async () => undefined}
            onMove={onMove}
            onRetry={() => undefined}
          />
        </div>,
      );
      const rows = screen.getAllByRole('listitem');
      const geometry = () =>
        rows.map((row) => {
          const { top, height } = row.getBoundingClientRect();
          return { top, height };
        });
      const initial = geometry();
      const duringDrag: Array<ReturnType<typeof geometry>> = [];
      const observer = new MutationObserver(() => duringDrag.push(geometry()));
      observer.observe(screen.getByRole('region', { name: 'Queued messages' }), {
        subtree: true,
        attributes: true,
        childList: true,
      });
      try {
        await userEvent.dragAndDrop(
          screen.getByRole('button', { name: `Reorder queued message ${String(source)}` }),
          rows[target]!,
          {
            targetPosition: { x: 12, y },
          },
        );
      } finally {
        observer.disconnect();
      }
      expect(duringDrag.length).toBeGreaterThan(0);
      for (const frame of duringDrag) {
        expect(frame).toEqual(initial);
      }
      expect(onMove).toHaveBeenCalledExactlyOnceWith(id, beforeId);
      onMove.mockClear();
      await userEvent.dragAndDrop(screen.getByRole('button', { name: 'Reorder queued message 2' }), rows[1]!, {
        targetPosition: { x: 12, y: 24 },
      });
      expect(onMove).not.toHaveBeenCalled();
      await userEvent.dragAndDrop(
        screen.getByRole('button', { name: 'Reorder queued message 2' }),
        screen.getByRole('button', { name: 'Standard button' }),
      );
      expect(onMove).not.toHaveBeenCalled();
      expect(getComputedStyle(screen.getByText('one')).fontSize).toBe('12px');
      const button = screen.getByRole('button', { name: 'Options for queued message 1' });
      expect(getComputedStyle(button).borderRadius).toBe(
        getComputedStyle(screen.getByRole('button', { name: 'Standard button' })).borderRadius,
      );
      expect(getComputedStyle(screen.getAllByRole('listitem')[0]!).borderBottomWidth).toBe('1px');
    },
  );
});
