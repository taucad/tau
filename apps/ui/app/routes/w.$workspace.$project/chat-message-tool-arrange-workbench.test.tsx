// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ToolInvocation } from '@taucad/chat';
import type { toolName } from '@taucad/chat/constants';
import { workbenchPaths } from '@taucad/workbench';
import type {
  WorkbenchLayoutController,
  WorkbenchLayoutSnapshot,
} from '#routes/w.$workspace.$project/workbench-layout-controller.js';
import { ChatMessageToolArrangeWorkbench } from '#routes/w.$workspace.$project/chat-message-tool-arrange-workbench.js';

const controller = vi.hoisted(() => ({
  snapshot: vi.fn(),
  subscribe: vi.fn(),
  restorePreviousArrangement: vi.fn<WorkbenchLayoutController['restorePreviousArrangement']>(),
}));
vi.mock('#routes/w.$workspace.$project/project-workspace-context.js', () => ({
  useWorkbenchLayoutController: () => controller,
}));
let appliedWorkbenchRevisions = new Map<string, `sha256:${string}`>();
let appliedEntryRevisions = new Map<string, `sha256:${string}`>();
vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ appliedWorkbenchRevisions, appliedEntryRevisions }) }));

type Invocation = ToolInvocation<typeof toolName.arrangeWorkbench>;
const digest = `sha256:${'a'.repeat(64)}` as const;
const viewDigest = `sha256:${'b'.repeat(64)}` as const;
const entriesDigest = `sha256:${'c'.repeat(64)}` as const;
const output: Extract<Invocation, { state: 'output-available' }> = {
  toolCallId: 'arrange-1',
  state: 'output-available',
  input: { open: [{ kind: 'view', view: 'iso' }] },
  output: {
    status: 'written',
    revisions: [{ path: '.tau/workbench/layout.json', digest, previousDigest: 'missing' }],
    visible: [
      { kind: 'view', view: 'iso' },
      { kind: 'file', path: 'docs/review.md' },
    ],
  },
};
const layout: WorkbenchLayoutSnapshot['layout'] = {
  version: 1,
  lanes: { chat: true, workbench: true },
  viewer: { kind: 'group', tabs: [{ kind: 'view', view: 'iso' }] },
  workbench: { kind: 'group', tabs: [{ kind: 'file', path: 'docs/review.md' }] },
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  appliedWorkbenchRevisions = new Map();
  appliedEntryRevisions = new Map();
});

describe('ChatMessageToolArrangeWorkbench', () => {
  it('should hide routine details until the compact row is expanded', async () => {
    controller.snapshot.mockReturnValue(undefined);
    controller.subscribe.mockReturnValue(() => undefined);
    render(<ChatMessageToolArrangeWorkbench part={output} />);
    const header = screen.getByRole('button', { name: /Arranged 1 view, 1 file.*Written/u });
    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: 'Restore previous layout' })).not.toBeInTheDocument();
    await userEvent.click(header);
    expect(screen.getByText('Requested arrangement')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Restore previous layout' })).toBeDisabled();
  });

  it('should preserve disclosure and focus while adoption and refusal update', async () => {
    let current: WorkbenchLayoutSnapshot | undefined;
    let listener: (() => void) | undefined;
    controller.snapshot.mockImplementation(() => current);
    controller.subscribe.mockImplementation((next: () => void) => {
      listener = next;
      return () => {
        listener = undefined;
      };
    });
    const rendered = render(
      <ChatMessageToolArrangeWorkbench
        part={{ toolCallId: output.toolCallId, state: 'input-available', input: output.input }}
      />,
    );
    const header = screen.getByRole('button', { name: 'Arranging workbench' });
    header.focus();
    await userEvent.keyboard('{Enter}');
    expect(header).toHaveAttribute('aria-expanded', 'true');
    rendered.rerender(<ChatMessageToolArrangeWorkbench part={output} />);
    expect(header).toHaveAttribute('aria-expanded', 'true');
    expect(header).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('Written');
    act(() => {
      current = { layout, layoutDigest: digest, refused: [], restoreTarget: 'prior' };
      listener?.();
    });
    expect(screen.getByRole('status')).toHaveTextContent('Written');
    appliedWorkbenchRevisions = new Map([[workbenchPaths.layout, digest]]);
    rendered.rerender(<ChatMessageToolArrangeWorkbench part={output} />);
    expect(screen.getByRole('status')).toHaveTextContent('Shown');
    expect(screen.getByRole('button', { name: 'Restore previous layout' })).toBeEnabled();
    act(() => {
      current = {
        layout,
        layoutDigest: digest,
        refused: [{ tab: { kind: 'pane', pane: 'kernel' }, reason: 'debug-only' }],
      };
      listener?.();
    });
    expect(screen.getByRole('status')).toHaveTextContent('Shown partly');
    await userEvent.keyboard(' ');
    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('alert')).toHaveTextContent('Telemetry could not be shown');
  });

  it('should keep a restore receipt visible when collapsed and disable an immediate toggle', async () => {
    const current = { layout, layoutDigest: digest, refused: [], restoreTarget: 'prior' };
    controller.snapshot.mockReturnValue(current);
    controller.subscribe.mockReturnValue(() => undefined);
    appliedWorkbenchRevisions = new Map([[workbenchPaths.layout, digest]]);
    const gate = Promise.withResolvers<boolean>();
    controller.restorePreviousArrangement.mockReturnValue(gate.promise);
    const rendered = render(<ChatMessageToolArrangeWorkbench part={output} />);
    const header = screen.getByRole('button', { name: /Arranged/u });
    await userEvent.click(header);
    const restore = screen.getByRole('button', { name: 'Restore previous layout' });
    await userEvent.dblClick(restore);
    expect(controller.restorePreviousArrangement).toHaveBeenCalledOnce();
    const [submitted] = controller.restorePreviousArrangement.mock.calls[0]!;
    expect(submitted.layoutDigest).toBe(digest);
    expect(submitted.target).toBe('prior');
    expect(submitted.eligible()).toBe(true);
    appliedWorkbenchRevisions = new Map();
    rendered.rerender(<ChatMessageToolArrangeWorkbench part={output} />);
    expect(submitted.eligible()).toBe(false);
    appliedWorkbenchRevisions = new Map([[workbenchPaths.layout, digest]]);
    rendered.rerender(<ChatMessageToolArrangeWorkbench part={output} />);
    expect(restore).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(header);
    await act(async () => {
      gate.resolve(true);
    });
    expect(screen.getByText('Restore written. Adoption is tracked separately.')).toBeVisible();
    await userEvent.click(header);
    expect(screen.getByRole('button', { name: 'Restore previous layout' })).toBeDisabled();
  });

  it('should render safe empty and unchanged summaries without inferring adoption', () => {
    controller.snapshot.mockReturnValue(undefined);
    controller.subscribe.mockReturnValue(() => undefined);
    const part = {
      ...output,
      output: {
        ...output.output,
        visible: [],
        revisions: [{ path: workbenchPaths.layout, digest, previousDigest: digest }],
      },
    };
    const rendered = render(<ChatMessageToolArrangeWorkbench part={part} />);
    expect(screen.getByRole('button')).toHaveTextContent('Unchanged workbench');
    expect(screen.getByRole('status')).toHaveTextContent('Written');
    rendered.rerender(
      <ChatMessageToolArrangeWorkbench
        part={{ ...part, output: { ...part.output, revisions: output.output.revisions } }}
      />,
    );
    expect(screen.getByRole('button')).toHaveTextContent('Arranged workbench');
  });

  it.each(['approval-requested', 'approval-responded', 'output-denied'] as const)(
    'should present %s without duplicate approval controls',
    (state) => {
      controller.snapshot.mockReturnValue(undefined);
      controller.subscribe.mockReturnValue(() => undefined);
      render(
        <ChatMessageToolArrangeWorkbench
          part={
            state === 'approval-requested'
              ? { toolCallId: 'approval', input: output.input, state, approval: { id: 'a' } }
              : { toolCallId: 'approval', input: output.input, state, approval: { id: 'a', approved: false } }
          }
        />,
      );
      expect(screen.queryByRole('button', { name: /Approve/u })).not.toBeInTheDocument();
      expect(screen.getByRole('button')).toHaveTextContent(
        state === 'output-denied' ? 'Denied' : state === 'approval-requested' ? 'Awaiting approval' : 'Awaiting result',
      );
    },
  );

  it('waits for both a view and an entry owner even when the layout digest is unchanged', () => {
    controller.snapshot.mockReturnValue({ layout, layoutDigest: digest, refused: [] });
    controller.subscribe.mockReturnValue(() => undefined);
    const part: Extract<Invocation, { state: 'output-available' }> = {
      ...output,
      input: {
        views: [{ id: 'iso', name: 'Review' }],
        entries: [
          { path: 'model/main.ts', operationTimeout: 15_000 },
          { path: 'model/other.ts', operationTimeout: 30_000 },
        ],
      },
      output: {
        ...output.output,
        revisions: [
          { path: workbenchPaths.view('iso'), digest: viewDigest, previousDigest: 'missing' },
          { path: workbenchPaths.entries, digest: entriesDigest, previousDigest: 'missing' },
          { path: workbenchPaths.layout, digest, previousDigest: digest },
        ],
      },
    };
    appliedWorkbenchRevisions = new Map([[workbenchPaths.layout, digest]]);
    const rendered = render(<ChatMessageToolArrangeWorkbench part={part} />);
    expect(screen.getByRole('status')).toHaveTextContent('Written');

    appliedEntryRevisions = new Map([['model/main.ts', entriesDigest]]);
    rendered.rerender(<ChatMessageToolArrangeWorkbench part={part} />);
    expect(screen.getByRole('status')).toHaveTextContent('Written');

    appliedEntryRevisions = new Map([
      ['model/main.ts', entriesDigest],
      ['model/other.ts', entriesDigest],
    ]);
    rendered.rerender(<ChatMessageToolArrangeWorkbench part={part} />);
    expect(screen.getByRole('status')).toHaveTextContent('Written');

    appliedWorkbenchRevisions = new Map([
      [workbenchPaths.layout, digest],
      [workbenchPaths.view('iso'), entriesDigest],
    ]);
    rendered.rerender(<ChatMessageToolArrangeWorkbench part={part} />);
    expect(screen.getByRole('status')).toHaveTextContent('Written');

    appliedWorkbenchRevisions = new Map([
      [workbenchPaths.layout, digest],
      [workbenchPaths.view('iso'), viewDigest],
    ]);
    rendered.rerender(<ChatMessageToolArrangeWorkbench part={part} />);
    expect(screen.getByRole('status')).toHaveTextContent('Shown');

    appliedEntryRevisions = new Map([
      ['model/main.ts', viewDigest],
      ['model/other.ts', entriesDigest],
    ]);
    rendered.rerender(<ChatMessageToolArrangeWorkbench part={part} />);
    expect(screen.getByRole('status')).toHaveTextContent('Written');

    appliedEntryRevisions = new Map([
      ['model/main.ts', entriesDigest],
      ['model/other.ts', entriesDigest],
    ]);
    rendered.rerender(<ChatMessageToolArrangeWorkbench part={part} />);
    expect(screen.getByRole('status')).toHaveTextContent('Shown');
  });

  it('waits for the matching acknowledged layout and a removed view to leave that layout', () => {
    const closedDigest = `sha256:${'d'.repeat(64)}` as const;
    const closedLayout: WorkbenchLayoutSnapshot['layout'] = { ...layout, viewer: { kind: 'group', tabs: [] } };
    const part: Extract<Invocation, { state: 'output-available' }> = {
      ...output,
      output: {
        ...output.output,
        revisions: [
          { path: workbenchPaths.view('iso'), digest: 'missing', previousDigest: viewDigest },
          { path: workbenchPaths.layout, digest: closedDigest, previousDigest: digest },
        ],
        visible: [{ kind: 'file', path: 'docs/review.md' }],
      },
    };
    controller.subscribe.mockReturnValue(() => undefined);
    controller.snapshot.mockReturnValue({ layout, layoutDigest: closedDigest, refused: [] });
    appliedWorkbenchRevisions = new Map([[workbenchPaths.layout, digest]]);
    const rendered = render(<ChatMessageToolArrangeWorkbench part={part} />);
    expect(screen.getByRole('status')).toHaveTextContent('Written');

    appliedWorkbenchRevisions = new Map([[workbenchPaths.layout, closedDigest]]);
    rendered.rerender(<ChatMessageToolArrangeWorkbench part={part} />);
    expect(screen.getByRole('status')).toHaveTextContent('Written');

    controller.snapshot.mockReturnValue({ layout: closedLayout, layoutDigest: closedDigest, refused: [] });
    rendered.rerender(<ChatMessageToolArrangeWorkbench part={part} />);
    expect(screen.getByRole('status')).toHaveTextContent('Shown');
  });

  it.each([
    'VALIDATION_ERROR',
    'FILE_NOT_FOUND',
    'RECORD_CONFLICT',
    'INVALID_RECORD',
    'USER_INTERRUPTED',
    'CLIENT_DISCONNECTED',
    'TOOL_EXECUTION_TIMEOUT',
    'TOOL_OUTPUT_VALIDATION_FAILED',
  ] as const)('preserves the %s refusal and its message', async (code) => {
    controller.snapshot.mockReturnValue(undefined);
    controller.subscribe.mockReturnValue(() => undefined);
    render(
      <ChatMessageToolArrangeWorkbench
        part={{
          toolCallId: output.toolCallId,
          input: output.input,
          state: 'output-error',
          errorText: JSON.stringify({ errorCode: code, message: `${code} exact refusal`, validationErrors: [] }),
        }}
      />,
    );
    const header = screen.getByRole('button');
    await userEvent.click(header);
    expect(screen.getByText(new RegExp(`${code} exact refusal`, 'u'))).toBeVisible();
  });

  it.each(['false', 'reject'] as const)('reports a %s Restore outcome and enables retry', async (outcome) => {
    controller.snapshot.mockReturnValue({ layout, layoutDigest: digest, refused: [], restoreTarget: 'prior' });
    controller.subscribe.mockReturnValue(() => undefined);
    appliedWorkbenchRevisions = new Map([[workbenchPaths.layout, digest]]);
    if (outcome === 'false') {
      controller.restorePreviousArrangement.mockResolvedValue(false);
    } else {
      controller.restorePreviousArrangement.mockRejectedValue(new Error('storage offline'));
    }
    render(<ChatMessageToolArrangeWorkbench part={output} />);
    await userEvent.click(screen.getByRole('button', { name: /Arranged/u }));
    const restore = screen.getByRole('button', { name: 'Restore previous layout' });
    await userEvent.click(restore);
    expect(await screen.findByRole('alert')).toHaveTextContent('Previous layout could not be restored.');
    expect(restore).toBeEnabled();
  });
});
