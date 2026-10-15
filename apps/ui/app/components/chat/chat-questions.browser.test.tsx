import '#styles/global.css';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { ChatPermissionRequest } from '#components/chat/chat-permission-request.js';
import { QuestionCard } from '#components/chat/question-card.js';
import type { Ask } from '@taucad/chat';

vi.mock('#flags/use-feature.js', () => ({ useFeature: () => false }));
afterEach(() => {
  cleanup();
  document.documentElement.className = '';
  document.documentElement.style.fontSize = '';
});
const ask: Ask = {
  id: 'ask-1',
  callId: 'call-1',
  source: 'tau',
  askedAt: new Date(0).toISOString(),
  deadline: new Date(120_000).toISOString(),
  questions: [
    {
      id: 'q-1',
      header: 'Attachment',
      question: 'How should the bracket attach?',
      options: [
        { label: 'A two-piece clamp around the existing suspension tube without drilling' },
        { label: 'A bolted mounting plate with two new holes in the frame' },
      ],
      recommended: 0,
      allowsText: true,
    },
  ],
};
it.each(['', 'dark', 'dark black', 'dark high-contrast'])(
  'keeps compact permission actions readable in theme %s at 320px',
  async (theme) => {
    await page.viewport(1000, 800);
    document.documentElement.className = theme;
    render(
      <div style={{ width: 320 }}>
        <ChatPermissionRequest
          approval={{
            interruptId: 'request-1',
            kind: 'approval',
            prompt: 'Inspect the Tau model view',
            options: [
              { optionId: 'once', kind: 'allow_once', name: 'Allow' },
              { optionId: 'session', kind: 'allow_always', name: 'Allow for this session' },
              { optionId: 'always', kind: 'allow_always', name: 'Always allow' },
            ],
          }}
          name='Codex'
          onRespond={async () => undefined}
        />
      </div>,
    );
    const region = screen.getByRole('region');
    expect(region.scrollWidth).toBeLessThanOrEqual(region.clientWidth);
    expect(screen.getByRole('button', { name: 'Allow' }).getBoundingClientRect().height).toBe(24);
    expect(screen.queryByText('Request details')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Allow for this session' }));
    expect(screen.getByRole('button', { name: 'Allow for this session', busy: true })).toBeDisabled();
    expect(screen.getAllByRole('button', { busy: true })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Allow' })).toBeDisabled();
    expect(region.scrollWidth).toBeLessThanOrEqual(region.clientWidth);
    await page.screenshot({
      path: `../../../../../out/test-results/message-queue/permission-${theme.replaceAll(' ', '-') || 'light'}.png`,
    });
  },
);
it('wraps long question choices at enlarged text size and preserves keyboard choice', async () => {
  await page.viewport(1000, 900);
  document.documentElement.style.fontSize = '200%';
  const onAnswer = vi.fn();
  render(
    <div style={{ width: 320 }}>
      <QuestionCard
        ask={ask}
        answers={undefined}
        now={0}
        onAnswer={onAnswer}
        onHold={() => undefined}
        onDecline={() => undefined}
      />
    </div>,
  );
  const group = screen.getByRole('group');
  expect(group.scrollWidth).toBeLessThanOrEqual(group.clientWidth);
  await userEvent.click(screen.getByRole('button', { name: /^A,/u }));
  expect(onAnswer).toHaveBeenCalledWith('q-1', { choice: ask.questions[0]!.options[0]!.label });
  await page.screenshot({ path: '../../../../../out/test-results/message-queue/question-enlarged.png' });
});

it.each(['', 'dark', 'dark black', 'dark high-contrast'])(
  'should preserve multiple typed selections at 320px in theme %s',
  async (theme) => {
    await page.viewport(1000, 900);
    document.documentElement.className = theme;
    const onAnswer = vi.fn();
    const typedAsk: Ask = {
      ...ask,
      deadline: null,
      questions: [
        {
          id: 'materials',
          question: 'Which materials should be compared?',
          allowsText: false,
          field: { type: 'array', required: true, minItems: 2, maxItems: 2 },
          options: [
            { label: 'PLA', value: 'pla' },
            { label: 'PETG', value: 'petg' },
          ],
        },
      ],
    };
    render(
      <div style={{ width: 320 }}>
        <QuestionCard
          ask={typedAsk}
          answers={undefined}
          now={0}
          onAnswer={onAnswer}
          onHold={() => undefined}
          onDecline={() => undefined}
        />
      </div>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'PLA' }));
    await userEvent.click(screen.getByRole('button', { name: 'PETG' }));
    expect(onAnswer).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'PLA' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm selection' }));
    expect(onAnswer).toHaveBeenCalledWith('materials', { value: ['pla', 'petg'] });
    const group = screen.getByRole('group');
    expect(group.scrollWidth).toBeLessThanOrEqual(group.clientWidth);
  },
);

it('should wrap provider readback status at 320px with enlarged text', async () => {
  await page.viewport(1000, 900);
  document.documentElement.className = 'dark';
  document.documentElement.style.fontSize = '200%';
  render(
    <div style={{ width: 320 }}>
      <ChatPermissionRequest
        approval={{
          interruptId: 'readback-1',
          kind: 'approval',
          prompt: 'Inspect the Tau model view',
          options: [],
          providerPermission: {
            owner: 'provider',
            persistence: 'unverified',
            options: [{ optionId: 'allow_always', requestedScope: 'persistent' }],
          },
        }}
        name='Codex'
        resolution={{
          outcome: 'approved',
          optionId: 'allow_always',
          observation: {
            version: 1,
            provider: 'codex',
            optionId: 'allow_always',
            toolCallId: 'call-1',
            requestedScope: 'persistent',
            stored: 'present',
            effective: 'overridden',
            preexisting: false,
            observation: 'config-readback',
            reason: 'policy-overridden',
          },
        }}
      />
    </div>,
  );
  const region = screen.getByRole('region');
  expect(region.scrollWidth).toBeLessThanOrEqual(region.clientWidth);
  expect(screen.getByText('Preference found · another Codex rule takes precedence')).toBeVisible();
  expect(screen.queryByRole('button')).toBeNull();
  await page.screenshot({ path: '../../../../../out/test-results/message-queue/provider-readback-enlarged.png' });
});
