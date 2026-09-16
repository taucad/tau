// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { readUIMessageStream } from 'ai';
import type { DynamicToolUIPart, UIMessageChunk } from 'ai';
import type { AgentLogEvent } from '@taucad/agent-host';
import { tauToolKinds } from '@taucad/agent-host';
import { toolNames } from '@taucad/chat/constants';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import {
  ChatMessageToolExternal,
  externalToolKinds,
  externalToolPresentation,
  sanitizeAgentText,
} from '#routes/w.$workspace.$project/chat-message-tool-external.js';
import { projectAgentHostEvent } from '#services/agent-host-event-projection.js';
import { classifyActivityPart } from '#utils/assistant-message-activity.js';
import chatMessageSource from '#routes/w.$workspace.$project/chat-message.tsx?raw';

vi.mock('#hooks/use-cookie.js', () => ({ useCookie: () => [false, vi.fn(), vi.fn()] }));
vi.mock('#components/files/file-link.js', () => ({
  FileLink: ({ children }: { readonly children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock('#components/code/diff-viewer.js', () => ({
  DiffViewer: ({ modifiedContent }: { readonly modifiedContent: string }) => <pre>{modifiedContent}</pre>,
  getFirstChangedLine: () => 1,
}));
vi.mock('#components/code/code-viewer.js', () => ({
  CodeViewer: ({ text }: { readonly text: string }) => <pre>{text}</pre>,
}));

const base = {
  version: 1,
  leaderEpoch: 'leader-1',
  sequence: 1,
  recordedAt: '2026-09-08T00:00:00.000Z',
  runId: 'run-1',
} as const;

const externalMetadata = { tauInternal: { kind: 'external-tool', origin: 'external', agentId: 'codex' } } as const;

/**
 * Build the dynamic tool part a durable pair produces, through the real chain:
 * the log rows the ACP projection writes, the UI chunk projection, and the AI
 * SDK's own stream reader.
 */
const partFromLog = async (
  rows: ReadonlyArray<Extract<AgentLogEvent, { type: 'message.appended' }>['message']>,
): Promise<DynamicToolUIPart> => {
  const chunks = rows.flatMap((message) => [...projectAgentHostEvent({ ...base, type: 'message.appended', message })]);
  const stream = new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
  let last;
  for await (const message of readUIMessageStream({ stream })) {
    last = message;
  }
  const part = last?.parts.find((candidate) => candidate.type === 'dynamic-tool');
  expect(part, 'every external tool row must project to a dynamic-tool part').toBeDefined();
  return part!;
};

const partFromEvents = async (events: readonly AgentLogEvent[]): Promise<DynamicToolUIPart> => {
  const stream = new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of events.flatMap((event) => [...projectAgentHostEvent(event)])) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
  let last;
  for await (const message of readUIMessageStream({ stream })) {
    last = message;
  }
  const part = last?.parts.find((candidate) => candidate.type === 'dynamic-tool');
  expect(part).toBeDefined();
  return part!;
};

const listFilesRows = [
  {
    id: 'm1',
    role: 'tool-input',
    toolCallId: 'call-1',
    toolName: 'listFiles',
    call: { toolCallId: 'list-1', kind: 'read', title: 'List files', status: 'pending', nativeName: 'listFiles' },
    content: { path: '.' },
    metadata: externalMetadata,
  },
  {
    id: 'm2',
    role: 'tool-output',
    toolCallId: 'call-1',
    toolName: 'listFiles',
    call: { toolCallId: 'list-1', kind: 'read', title: 'List files', status: 'completed', nativeName: 'listFiles' },
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Codex's own `rawOutput` field names.
    content: { formatted_output: 'tau.json\npackage.json', exit_code: 0 },
    isError: false,
    metadata: externalMetadata,
  },
] as const;

const renderExternal = (part: DynamicToolUIPart) =>
  render(
    <TooltipProvider>
      <ChatMessageToolExternal part={part} />
    </TooltipProvider>,
  );

afterEach(cleanup);

describe('the external tool-call renderer', () => {
  it('resolves every ACP tool kind, and an absent one, to a card', () => {
    for (const kind of [...externalToolKinds, undefined, 'a_kind_from_a_later_protocol']) {
      const presentation = externalToolPresentation(kind);
      expect(presentation.icon, `no card for kind ${String(kind)}`).toBeDefined();
      expect(presentation.verb).not.toBe('');
    }
  });

  it('keeps a bespoke renderer and a durable kind for every Tau tool', () => {
    for (const name of toolNames) {
      expect(chatMessageSource, `no renderer branch for ${name}`).toContain(`case 'tool-${name}':`);
      expect(tauToolKinds.has(name), `no durable kind for ${name}`).toBe(true);
    }
    /* And back the other way (3-review N5): a kind left behind for a tool that
     * no longer exists is a cross-package contract that has quietly rotted, and
     * one direction cannot see it. */
    for (const name of tauToolKinds.keys()) {
      expect(toolNames, `kind for unknown tool ${name}`).toContain(name);
    }
    // The external card, not the red unknown-part fallback, owns every other call.
    expect(chatMessageSource).toContain('<ChatMessageToolExternal key={part.toolCallId} part={part} />');
  });

  it('renders the Codex "List files" pair as a titled card holding the files it found', async () => {
    const user = userEvent.setup();
    const part = await partFromLog(listFilesRows);
    expect(part.title).toBe('List files');
    /* No `status`: the part's own state is the lifecycle, and the SDK carries a
     * part's metadata from the call chunk, where the emitter's status is stale. */
    expect(part.toolMetadata).toEqual({
      tau: {
        toolCallId: 'list-1',
        kind: 'read',
        title: 'List files',
        nativeName: 'listFiles',
        origin: 'external',
        agentId: 'codex',
      },
    });
    expect(part.state).toBe('output-available');

    renderExternal(part);
    await user.click(screen.getByRole('button', { name: /List files/ }));
    expect(screen.getByText('tau.json')).toBeVisible();
    expect(screen.getByText('package.json')).toBeVisible();
    expect(screen.queryByText(/Received unknown part/)).not.toBeInTheDocument();
  });

  it.each([
    { kind: 'read', title: "Read file '/workspace/main.py'", expected: "Read file '/workspace/main.py'" },
    { kind: 'search', title: "Search for 'make_bezier'", expected: "Searched for 'make_bezier'" },
    { kind: 'search', title: 'Searchlight', expected: 'Searched Searchlight' },
  ])('should not repeat a whole tool-kind verb in $title', async ({ kind, title, expected }) => {
    const part = await partFromLog(listFilesRows.map((row) => ({ ...row, call: { ...row.call, kind, title } })));

    renderExternal(part);
    expect(screen.getByRole('button', { name: expected })).toBeVisible();
    expect(screen.queryByRole('button', { name: /Read Read/u })).not.toBeInTheDocument();
  });

  it('renders an edit call as a file diff, from a refinement the agent only sent once', async () => {
    const user = userEvent.setup();
    const diff = [{ type: 'diff', path: 'main.scad', oldText: 'cube(10);\n', newText: 'cube(12);\n' }];
    /* Codex's `applyPatch` sends its diff at `in_progress` and its completion
     * carries nothing, so the ACP projection folds it into the result row. */
    const part = await partFromLog([
      {
        id: 'm3',
        role: 'tool-input',
        toolCallId: 'call-2',
        toolName: 'applyPatch',
        call: {
          toolCallId: 'edit-1',
          kind: 'edit',
          title: 'Editing files',
          status: 'pending',
          nativeName: 'applyPatch',
        },
        content: {},
        metadata: externalMetadata,
      },
      {
        id: 'm4',
        role: 'tool-output',
        toolCallId: 'call-2',
        toolName: 'applyPatch',
        call: { toolCallId: 'edit-1', kind: 'edit', status: 'completed', nativeName: 'applyPatch', content: diff },
        content: diff,
        isError: false,
        metadata: externalMetadata,
      },
    ]);

    renderExternal(part);
    await user.click(screen.getByRole('button', { name: /main.scad/ }));
    expect(screen.getByText('cube(12);')).toBeVisible();
    expect(screen.queryByText(/Received unknown part/)).not.toBeInTheDocument();
  });

  it('applies a terminal ACP input replacement through the real AI SDK stream reader', async () => {
    const part = await partFromEvents([
      {
        ...base,
        type: 'message.appended',
        message: {
          id: 'terminal-input',
          role: 'tool-input',
          toolCallId: 'call-terminal',
          toolName: 'shell',
          call: { toolCallId: 'vendor-terminal', status: 'pending', title: 'Starting shell' },
          content: { command: 'old' },
          metadata: externalMetadata,
        },
      },
      {
        ...base,
        type: 'message.envelope-replaced',
        messageId: 'terminal-input',
        replacement: {
          id: 'terminal-input',
          role: 'tool-input',
          toolCallId: 'call-terminal',
          toolName: 'shell',
          call: { toolCallId: 'vendor-terminal', status: 'completed', title: 'Finished shell' },
          content: { command: 'final' },
          metadata: externalMetadata,
        },
      },
      {
        ...base,
        type: 'message.appended',
        message: {
          id: 'terminal-output',
          role: 'tool-output',
          toolCallId: 'call-terminal',
          toolName: 'shell',
          content: { stdout: 'done' },
          isError: false,
          metadata: externalMetadata,
        },
      },
    ]);

    expect(part).toMatchObject({
      state: 'output-available',
      input: { command: 'final' },
      output: { stdout: 'done' },
      title: 'Finished shell',
      toolMetadata: { tau: { toolCallId: 'vendor-terminal', status: 'completed' } },
    });
  });

  it("renders an execute call's captured output, never the terminal id it cannot resolve", async () => {
    const user = userEvent.setup();
    const part = await partFromLog([
      {
        id: 'm4',
        role: 'tool-input',
        toolCallId: 'call-3',
        toolName: 'shell',
        call: {
          toolCallId: 'shell-1',
          kind: 'execute',
          title: 'openscad main.scad',
          status: 'pending',
          nativeName: 'shell',
          content: [{ type: 'terminal', terminalId: 'terminal-1' }],
        },
        content: { command: 'openscad main.scad' },
        metadata: externalMetadata,
      },
      {
        id: 'm5',
        role: 'tool-output',
        toolCallId: 'call-3',
        toolName: 'shell',
        call: { toolCallId: 'shell-1', kind: 'execute', status: 'completed', nativeName: 'shell' },
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Codex's own `rawOutput` field names.
        content: { formatted_output: 'ERROR: Parser error', exit_code: 1 },
        isError: false,
        metadata: externalMetadata,
      },
    ]);

    renderExternal(part);
    await user.click(screen.getByRole('button', { name: /openscad main.scad/ }));
    expect(screen.getByText(/ERROR: Parser error/)).toBeVisible();
    expect(screen.queryByText(/terminal-1/)).not.toBeInTheDocument();
  });

  it('strips control and bidirectional-override characters from an agent-authored title', async () => {
    const hostile = `rm -rf ‮gpj.exe‬ ${'x'.repeat(400)}`;
    expect(sanitizeAgentText(hostile)).not.toMatch(/[‬‮]/u);
    expect(sanitizeAgentText(hostile).length).toBeLessThanOrEqual(201);

    const part = await partFromLog([
      {
        id: 'm6',
        role: 'tool-input',
        toolCallId: 'call-4',
        toolName: 'shell',
        call: { toolCallId: 'shell-2', kind: 'execute', title: hostile, status: 'pending' },
        content: {},
        metadata: externalMetadata,
      },
    ]);

    renderExternal(part);
    expect(document.body.textContent).not.toMatch(/[‬‮]/u);
    expect(screen.getByText(/rm -rf gpj.exe/)).toBeVisible();
  });

  it('strips the same characters from an agent-authored path, in both places one is rendered', async () => {
    const user = userEvent.setup();
    const hostilePath = 'src/\u202Edcs.exe';
    const diff = [{ type: 'diff', path: hostilePath, oldText: 'cube(10);\n', newText: 'cube(12);\n' }];

    const located = await partFromLog([
      {
        id: 'm7',
        role: 'tool-input',
        toolCallId: 'call-5',
        toolName: 'readFile',
        call: {
          toolCallId: 'read-1',
          kind: 'read',
          title: 'Read file',
          status: 'pending',
          locations: [{ path: hostilePath }],
        },
        content: {},
        metadata: externalMetadata,
      },
    ]);
    renderExternal(located);
    await user.click(screen.getByRole('button', { name: 'Reading file' }));
    /* The link still navigates to the path the agent named; only what is read
     * out is stripped, so a reordered name cannot stand in for another file. */
    expect(document.body.textContent).not.toMatch(/[\u202A-\u202E\u2066-\u2069]/u);
    expect(screen.getByText('src/dcs.exe')).toBeVisible();
    cleanup();

    const edited = await partFromLog([
      {
        id: 'm8',
        role: 'tool-input',
        toolCallId: 'call-6',
        toolName: 'applyPatch',
        call: {
          toolCallId: 'edit-2',
          kind: 'edit',
          title: 'Editing files',
          status: 'pending',
          nativeName: 'applyPatch',
        },
        content: {},
        metadata: externalMetadata,
      },
      {
        id: 'm9',
        role: 'tool-output',
        toolCallId: 'call-6',
        toolName: 'applyPatch',
        call: { toolCallId: 'edit-2', kind: 'edit', status: 'completed', nativeName: 'applyPatch', content: diff },
        content: diff,
        isError: false,
        metadata: externalMetadata,
      },
    ]);
    renderExternal(edited);
    expect(document.body.textContent).not.toMatch(/[\u202A-\u202E\u2066-\u2069]/u);
  });

  it('groups external calls, including a think call, as tool activity', async () => {
    const readPart = await partFromLog(listFilesRows);
    expect(classifyActivityPart(readPart)).toBe('research');

    const thinkPart = await partFromLog([
      {
        id: 'm7',
        role: 'tool-input',
        toolCallId: 'call-5',
        toolName: 'think',
        call: { toolCallId: 'think-1', kind: 'think', title: 'Consider the fillet radius', status: 'pending' },
        content: {},
        metadata: externalMetadata,
      },
    ]);
    expect(classifyActivityPart(thinkPart)).toBe('research');
  });
});
