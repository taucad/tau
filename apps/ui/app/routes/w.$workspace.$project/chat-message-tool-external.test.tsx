// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { readUIMessageStream } from 'ai';
import type { DynamicToolUIPart, UIMessageChunk } from 'ai';
import type { AgentLogEvent, JsonObject, JsonValue } from '@taucad/agent-host';
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
import { ChatAttachmentDirectoriesContext } from '#components/chat/attachment-preview.js';
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
const imageHash = 'c'.repeat(64);
const attachmentDirectory = '/projects/p1/.tau/chats/c1/attachments';
vi.mock('#hooks/use-file-manager.js', () => {
  // The provider memoizes its record client; attachment sources are keyed by that identity.
  const fileManager = {
    recordFiles: {
      readFile: async (path: string) => {
        if (path === `${attachmentDirectory}/${imageHash}.png`) {
          return new Uint8Array([137, 80, 78, 71]);
        }
        throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
      },
    },
  };
  return { useOptionalFileManager: () => fileManager };
});
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

const directories = { transcript: attachmentDirectory, composer: attachmentDirectory };
const renderExternal = (part: DynamicToolUIPart) =>
  render(
    <ChatAttachmentDirectoriesContext.Provider value={directories}>
      <TooltipProvider>
        <ChatMessageToolExternal part={part} />
      </TooltipProvider>
    </ChatAttachmentDirectoriesContext.Provider>,
  );

beforeAll(() => {
  // Jsdom has no object URLs; the attachment hook only needs a string per blob.
  URL.createObjectURL = vi.fn(() => 'blob:agent-image');
  URL.revokeObjectURL = vi.fn();
});

afterEach(cleanup);

/**
 * The image generation codex-acp 1.7.0 reports, as the host records it: the call row, its
 * envelope replaced with the completed facts, then the result row.
 */
const imageGenerationEvents = (image: JsonObject, result: JsonValue): AgentLogEvent[] => {
  const call = { toolCallId: 'exec-1', kind: 'other', title: 'Image generation' };
  const content = [
    { type: 'content', content: { type: 'text', text: 'Revised prompt: a clean relief render' } },
    { type: 'content', content: image },
  ];
  const input = {
    id: 'g1',
    role: 'tool-input',
    toolCallId: 'call-g',
    toolName: 'Image generation',
    call: { ...call, status: 'in_progress' },
    content: { id: 'exec-1' },
    metadata: externalMetadata,
  } as const;
  return [
    { ...base, sequence: 1, type: 'message.appended', message: input },
    {
      ...base,
      sequence: 2,
      type: 'message.envelope-replaced',
      messageId: 'g1',
      replacement: { ...input, call: { ...call, status: 'completed', content } },
    },
    {
      ...base,
      sequence: 3,
      type: 'message.appended',
      message: {
        id: 'g2',
        role: 'tool-output',
        toolCallId: 'call-g',
        toolName: 'Image generation',
        call: { ...call, status: 'completed', content },
        content: { status: 'completed', revisedPrompt: 'a clean relief render', result, savedPath: '/x/exec-1.png' },
        isError: false,
        metadata: externalMetadata,
      },
    },
  ];
};

describe('external tool media', () => {
  it("shows Codex's render open under its card, and keeps the revised prompt in the card", async () => {
    const user = userEvent.setup();
    const reference = { type: 'file-ref', path: `attachments/${imageHash}.png`, mimeType: 'image/png', byteLength: 4 };
    renderExternal(await partFromEvents(imageGenerationEvents(reference, `attachments/${imageHash}.png`)));

    await vi.waitFor(() => {
      expect(screen.getByRole('img', { name: 'Image generation' })).toHaveAttribute('src', 'blob:agent-image');
    });
    expect(screen.getByRole('button', { name: 'Open Image generation' })).toHaveClass('rounded-xl');
    expect(screen.queryByText(/Revised prompt/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Generated image$/ }));
    expect(screen.getByText(/Revised prompt: a clean relief render/)).toBeVisible();
  });

  it('renders a render recorded inline before media moved to attachments, without printing its bytes', async () => {
    const data = 'iVBORw0KGgoAAAANSUhEUg';
    renderExternal(
      await partFromEvents(
        imageGenerationEvents({ type: 'image', data, mimeType: 'image/png', uri: '/x/exec-1.png' }, data),
      ),
    );

    expect(screen.getByRole('img', { name: 'Image generation' })).toHaveAttribute(
      'src',
      `data:image/png;base64,${data}`,
    );
    expect(document.body.textContent).not.toContain(data);
  });

  it("shows a foreign MCP server's image once, from its result, beside the call's own copy", async () => {
    const image = { type: 'image', data: 'c2NyZWVu', mimeType: 'image/png' };
    const part = await partFromLog([
      {
        id: 'b1',
        role: 'tool-input',
        toolCallId: 'call-b',
        toolName: 'mcp.browser.screenshot',
        call: {
          toolCallId: 'mcp-1',
          kind: 'execute',
          title: 'Browser screenshot',
          status: 'pending',
          content: [{ type: 'content', content: image }],
        },
        content: { server: 'browser', tool: 'screenshot', arguments: {} },
        metadata: externalMetadata,
      },
      {
        id: 'b2',
        role: 'tool-output',
        toolCallId: 'call-b',
        toolName: 'mcp.browser.screenshot',
        call: { toolCallId: 'mcp-1', kind: 'execute', title: 'Browser screenshot', status: 'completed' },
        content: {
          result: { content: [image, { type: 'image', data: 'c2Vjb25k', mimeType: 'image/png' }] },
          error: null,
        },
        isError: false,
        metadata: externalMetadata,
      },
    ]);
    renderExternal(part);

    expect(screen.getAllByRole('img').map((image_) => image_.getAttribute('src'))).toEqual([
      'data:image/png;base64,c2NyZWVu',
      'data:image/png;base64,c2Vjb25k',
    ]);
  });

  it("reads an embedded resource's text and a link the call's locations do not already name", async () => {
    const user = userEvent.setup();
    const part = await partFromLog([
      {
        id: 'r1',
        role: 'tool-input',
        toolCallId: 'call-r',
        toolName: 'fetch',
        call: {
          toolCallId: 'fetch-1',
          kind: 'fetch',
          title: 'Fetch notes',
          status: 'completed',
          locations: [{ path: 'notes.md' }],
          content: [
            {
              type: 'content',
              content: { type: 'resource', resource: { uri: 'file:///notes.md', text: 'Wall thickness is 2 mm' } },
            },
            {
              type: 'content',
              content: { type: 'resource_link', uri: 'https://example.test/spec', name: 'spec', title: 'Bracket spec' },
            },
            { type: 'content', content: { type: 'resource_link', uri: 'notes.md', name: 'notes.md' } },
          ],
        },
        content: { url: 'https://example.test/spec' },
        metadata: externalMetadata,
      },
    ]);
    renderExternal(part);
    await user.click(screen.getByRole('button', { name: /Fetch notes/ }));

    expect(screen.getByText('Wall thickness is 2 mm')).toBeVisible();
    expect(screen.getByText('Bracket spec')).toBeVisible();
    expect(screen.getAllByText('notes.md')).toHaveLength(1);
  });

  it('plays audio a call produced', async () => {
    const part = await partFromLog([
      {
        id: 'a1',
        role: 'tool-input',
        toolCallId: 'call-a',
        toolName: 'speak',
        call: {
          toolCallId: 'speak-1',
          kind: 'other',
          title: 'Speak',
          status: 'completed',
          content: [{ type: 'content', content: { type: 'audio', data: 'UklGRg==', mimeType: 'audio/wav' } }],
        },
        content: {},
        metadata: externalMetadata,
      },
    ]);
    const { container } = renderExternal(part);

    expect(container.querySelector('audio')).toHaveAttribute('src', 'data:audio/wav;base64,UklGRg==');
  });
});

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
    // The external card (or its question card, for an agent's own question tool), not the red
    // unknown-part fallback, owns every other call.
    expect(chatMessageSource).toContain('<ChatMessageToolExternalOrQuestion key={part.toolCallId} part={part} />');
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
    await user.click(screen.getByRole('button', { name: /^Listed files$/ }));
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

  it('names the skills a compound read command loaded, and keeps the command in the body', async () => {
    const user = userEvent.setup();
    const skills = String.raw`/Users/me/Library/Application\ Support/Tau/acp-skills/6948/.agents/skills`;
    const command = `sed -n '1,240p' ${skills}/cad-openscad/SKILL.md && sed -n '1,280p' ${skills}/geospec-authoring/SKILL.md`;
    const part = await partFromLog([
      {
        id: 'm-skill',
        role: 'tool-input',
        toolCallId: 'call-skill',
        toolName: command,
        call: { toolCallId: 'exec-1', kind: 'execute', title: command, status: 'pending' },
        content: { command, cwd: '/work' },
        metadata: externalMetadata,
      },
      {
        id: 'm-skill-out',
        role: 'tool-output',
        toolCallId: 'call-skill',
        toolName: command,
        call: { toolCallId: 'exec-1', kind: 'execute', status: 'completed' },
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Codex's own `rawOutput` field names.
        content: { formatted_output: '--- name: cad-openscad', exit_code: 0 },
        isError: false,
        metadata: externalMetadata,
      },
    ]);

    renderExternal(part);
    const header = screen.getByRole('button', { name: /skills cad-openscad, geospec-authoring/ });
    expect(header).toHaveTextContent(/^Read skills cad-openscad, geospec-authoring$/u);
    await user.click(header);
    expect(screen.getByText(/\$ sed -n '1,240p'.*--- name: cad-openscad/u)).toBeVisible();
    /* Each file read is linked, as an adapter-labelled read's locations are. */
    expect(screen.getByText(/cad-openscad\/SKILL\.md$/u)).toBeVisible();
    expect(screen.getByText(/geospec-authoring\/SKILL\.md$/u)).toBeVisible();
  });

  it('names what a failed command attempted, and shows what it printed and its exit code', async () => {
    const user = userEvent.setup();
    const command = `sed -n '267,322p' '/Tau/acp-skills/6948/.agents/skills/geospec-authoring/api-types.md' && command -v dotnet`;
    const part = await partFromLog([
      {
        id: 'm-fail',
        role: 'tool-input',
        toolCallId: 'call-fail',
        toolName: command,
        call: { toolCallId: 'exec-2', kind: 'execute', title: command, status: 'pending' },
        content: { command, cwd: '/work' },
        metadata: externalMetadata,
      },
      {
        id: 'm-fail-out',
        role: 'tool-output',
        toolCallId: 'call-fail',
        toolName: command,
        call: { toolCallId: 'exec-2', kind: 'execute', status: 'failed' },
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Codex's own `rawOutput` field names.
        content: { formatted_output: 'GeoSpecMeshIntegrityExpectation: {', exit_code: 1 },
        isError: true,
        metadata: externalMetadata,
      },
    ]);

    renderExternal(part);
    const header = screen.getByRole('button', { name: /Attempted/u });
    expect(header).toHaveTextContent(/^Attempted reading geospec-authoring\/api-types\.md, checking for dotnet$/u);
    await user.click(header);
    expect(screen.getByText(/GeoSpecMeshIntegrityExpectation: \{\s+Exit code 1/u)).toBeVisible();
    expect(document.body.textContent).not.toContain('formatted_output');
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
