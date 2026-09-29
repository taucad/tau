// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ToolInvocation } from '@taucad/chat';
import type { toolName } from '@taucad/chat/constants';
import { workbenchPaths } from '@taucad/workbench';
import type { WorkbenchLayoutSnapshot } from '#routes/w.$workspace.$project/workbench-layout-controller.js';
import { ChatMessageToolArrangeWorkbench } from '#routes/w.$workspace.$project/chat-message-tool-arrange-workbench.js';

const controller = vi.hoisted(() => ({ snapshot: vi.fn(), subscribe: vi.fn(), restorePreviousArrangement: vi.fn() }));
vi.mock('#routes/w.$workspace.$project/project-workspace-context.js', () => ({ useWorkbenchLayoutController: () => controller }));
let appliedWorkbenchRevisions = new Map<string, `sha256:${string}`>();
let appliedEntryRevisions = new Map<string, `sha256:${string}`>();
vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ appliedWorkbenchRevisions, appliedEntryRevisions }) }));

type Invocation = ToolInvocation<typeof toolName.arrangeWorkbench>;
const digest = `sha256:${'a'.repeat(64)}` as const;
const viewDigest = `sha256:${'b'.repeat(64)}` as const;
const entriesDigest = `sha256:${'c'.repeat(64)}` as const;
const output: Extract<Invocation, { state: 'output-available' }> = {
  toolCallId: 'arrange-1', state: 'output-available', input: { open: [{ kind: 'view', view: 'iso' }] },
  output: { status: 'written', revisions: [{ path: '.tau/workbench/layout.json', digest, previousDigest: 'missing' }],
    visible: [{ kind: 'view', view: 'iso' }, { kind: 'file', path: 'docs/review.md' }] },
};
const layout: WorkbenchLayoutSnapshot['layout'] = { version: 1, lanes: { chat: true, workbench: true },
  viewer: { kind: 'group', tabs: [{ kind: 'view', view: 'iso' }] },
  workbench: { kind: 'group', tabs: [{ kind: 'file', path: 'docs/review.md' }] },
};

afterEach(() => { cleanup(); vi.clearAllMocks(); appliedWorkbenchRevisions = new Map(); appliedEntryRevisions = new Map(); });

describe('ChatMessageToolArrangeWorkbench', () => {
  it('starts Written, reacts to adoption and refusal, and keeps Restore focusable at rest', async () => {
    let current: WorkbenchLayoutSnapshot | undefined;
    let listener: (() => void) | undefined;
    controller.snapshot.mockImplementation(() => current);
    controller.subscribe.mockImplementation((next: () => void) => { listener = next; return () => { listener = undefined; }; });
    controller.restorePreviousArrangement.mockResolvedValue(true);
    const rendered = render(<ChatMessageToolArrangeWorkbench part={output} />);

    expect(screen.getByText('Arranged:').parentElement).toHaveTextContent('Arranged: iso view, docs/review.md');
    expect(screen.getByRole('status')).toHaveTextContent('Written · shown when the project opens');
    const restore = screen.getByRole('button', { name: 'Restore' });
    restore.focus();
    expect(restore).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(controller.restorePreviousArrangement).toHaveBeenCalledOnce();

    act(() => { current = { layout, layoutDigest: digest, refused: [] }; listener?.(); });
    expect(screen.getByRole('status')).toHaveTextContent('Written · shown when the project opens');
    appliedWorkbenchRevisions = new Map([[workbenchPaths.layout, digest]]);
    rendered.rerender(<ChatMessageToolArrangeWorkbench part={output} />);
    expect(screen.getByRole('status')).toHaveTextContent('Shown');
    act(() => { current = { layout, layoutDigest: digest, refused: [{ tab: { kind: 'pane', pane: 'kernel' }, reason: 'debug-only' }] }; listener?.(); });
    expect(screen.getByRole('status')).toHaveTextContent('Shown partly');
  });

  it('waits for both a view and an entry owner even when the layout digest is unchanged', () => {
    controller.snapshot.mockReturnValue({ layout, layoutDigest: digest, refused: [] });
    controller.subscribe.mockReturnValue(() => undefined);
    const part: Extract<Invocation, { state: 'output-available' }> = {
      ...output,
      input: { views: [{ id: 'iso', name: 'Review' }], entries: [
        { path: 'model/main.ts', renderTimeout: 15_000 }, { path: 'model/other.ts', renderTimeout: 30_000 },
      ] },
      output: { ...output.output, revisions: [
        { path: workbenchPaths.view('iso'), digest: viewDigest, previousDigest: 'missing' },
        { path: workbenchPaths.entries, digest: entriesDigest, previousDigest: 'missing' },
        { path: workbenchPaths.layout, digest, previousDigest: digest },
      ] },
    };
    appliedWorkbenchRevisions = new Map([[workbenchPaths.layout, digest]]);
    const rendered = render(<ChatMessageToolArrangeWorkbench part={part} />);
    expect(screen.getByRole('status')).toHaveTextContent('Written');

    appliedEntryRevisions = new Map([['model/main.ts', entriesDigest]]);
    rendered.rerender(<ChatMessageToolArrangeWorkbench part={part} />);
    expect(screen.getByRole('status')).toHaveTextContent('Written');

    appliedEntryRevisions = new Map([['model/main.ts', entriesDigest], ['model/other.ts', entriesDigest]]);
    rendered.rerender(<ChatMessageToolArrangeWorkbench part={part} />);
    expect(screen.getByRole('status')).toHaveTextContent('Written');

    appliedWorkbenchRevisions = new Map([[workbenchPaths.layout, digest], [workbenchPaths.view('iso'), entriesDigest]]);
    rendered.rerender(<ChatMessageToolArrangeWorkbench part={part} />);
    expect(screen.getByRole('status')).toHaveTextContent('Written');

    appliedWorkbenchRevisions = new Map([[workbenchPaths.layout, digest], [workbenchPaths.view('iso'), viewDigest]]);
    rendered.rerender(<ChatMessageToolArrangeWorkbench part={part} />);
    expect(screen.getByRole('status')).toHaveTextContent('Shown');

    appliedEntryRevisions = new Map([['model/main.ts', viewDigest], ['model/other.ts', entriesDigest]]);
    rendered.rerender(<ChatMessageToolArrangeWorkbench part={part} />);
    expect(screen.getByRole('status')).toHaveTextContent('Written');

    appliedEntryRevisions = new Map([['model/main.ts', entriesDigest], ['model/other.ts', entriesDigest]]);
    rendered.rerender(<ChatMessageToolArrangeWorkbench part={part} />);
    expect(screen.getByRole('status')).toHaveTextContent('Shown');
  });

  it('waits for the matching acknowledged layout and a removed view to leave that layout', () => {
    const closedDigest = `sha256:${'d'.repeat(64)}` as const;
    const closedLayout: WorkbenchLayoutSnapshot['layout'] = { ...layout, viewer: { kind: 'group', tabs: [] } };
    const part: Extract<Invocation, { state: 'output-available' }> = { ...output,
      output: { ...output.output, revisions: [
        { path: workbenchPaths.view('iso'), digest: 'missing', previousDigest: viewDigest },
        { path: workbenchPaths.layout, digest: closedDigest, previousDigest: digest },
      ], visible: [{ kind: 'file', path: 'docs/review.md' }] },
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

  it.each(['VALIDATION_ERROR', 'FILE_NOT_FOUND', 'RECORD_CONFLICT', 'INVALID_RECORD'] as const)(
    'preserves the %s refusal and its message', async (code) => {
      controller.snapshot.mockReturnValue(undefined);
      controller.subscribe.mockReturnValue(() => undefined);
      render(<ChatMessageToolArrangeWorkbench part={{ toolCallId: output.toolCallId, input: output.input, state: 'output-error', errorText: JSON.stringify({ errorCode: code, message: `${code} exact refusal` }) }} />);
      const header = screen.getByRole('button');
      await userEvent.click(header);
      expect(screen.getByText(new RegExp(`${code} exact refusal`, 'u'))).toBeVisible();
    },
  );

  it.each(['false', 'reject'] as const)('reports a %s Restore outcome and enables retry', async (outcome) => {
    controller.snapshot.mockReturnValue(undefined);
    controller.subscribe.mockReturnValue(() => undefined);
    if (outcome === 'false') { controller.restorePreviousArrangement.mockResolvedValue(false); }
    else { controller.restorePreviousArrangement.mockRejectedValue(new Error('storage offline')); }
    render(<ChatMessageToolArrangeWorkbench part={output} />);
    const restore = screen.getByRole('button', { name: 'Restore' });
    await userEvent.click(restore);
    expect(await screen.findByRole('alert')).toHaveTextContent('Previous arrangement could not be restored.');
    expect(restore).toBeEnabled();
  });
});
