// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CadAgentConfigInput, CadAgentExecution } from '@taucad/chat';
import { toolName } from '@taucad/chat/constants';
import { agentHostClientConfig, agentHostConfig, dialExecutionHost } from '#chat-clients/_internal/turn-body.js';
import { buildSnapshotKernel, renderKernelGuidance } from '@taucad/chat/prompts';
import type { ResolvedModel } from '#hooks/use-models.js';
import { AgentHostPlacementError, daemonPlacementOf } from '#lib/agent-host-placement.js';
import { createAgentHostClient } from '#services/agent-host-client.js';
import { createDaemonAgentHostTransport } from '@taucad/chat-ui/services/daemon-agent-host-client';

const storage = vi.hoisted(() => ({
  getProjectFileSystemConfig: vi.fn(async (): Promise<{ backend: 'memory' }> => ({ backend: 'memory' })),
}));

vi.mock('#flags/feature-flags.js', () => ({ isFeatureEnabled: () => false }));
vi.mock('#filesystem/handle-store.js', () => ({ getProjectFileSystemConfig: storage.getProjectFileSystemConfig }));

/** A Tau chat placed on Tau Desktop, exactly as its stored `activeExecution` reads once synced to the web. */
const desktopTauExecution: CadAgentExecution = { kind: 'tau', model: 'openai-gpt-5.5', hostId: 'desktop' };
/** An external agent started in Tau Desktop: its CLI is on that computer, so the pin is real. */
const desktopCodexExecution: CadAgentExecution = { kind: 'acp', hostId: 'desktop', agentId: 'codex' };

describe('placing a chat started in Tau Desktop, on the web', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should place a stored desktop Tau chat on this page’s own worker instead of refusing it', () => {
    // `undefined` is the browser worker: the read connector and admission take that branch, never a dial.
    expect(daemonPlacementOf(desktopTauExecution)).toBeUndefined();
  });

  it('should refuse an external agent pinned to Tau Desktop with a typed reason, without resolving or dialling it', async () => {
    const dial = dialExecutionHost(desktopCodexExecution, 'project-widget');

    await expect(dial).rejects.toBeInstanceOf(AgentHostPlacementError);
    await expect(dial).rejects.toHaveProperty('code', 'HOST_NOT_ON_THIS_DEVICE');
    await expect(dial).rejects.toThrow(/runs in Tau Desktop/);
    expect(storage.getProjectFileSystemConfig).not.toHaveBeenCalled();
  });

  it('should leave no unhandled rejection when a desktop external-agent chat is observed on the web (TAU-UI-5)', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      // The project route's read connector, for a chat whose stored execution names the desktop launcher.
      const client = createAgentHostClient(
        createDaemonAgentHostTransport(async () => dialExecutionHost(desktopCodexExecution, 'project-widget')),
      );
      // The observer detaches before it ever reads, as a project switch or a republished connector does.
      await client.close();
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });

      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });
});

describe('chat settings in a Tau admission (U10)', () => {
  const resolvedModel = {
    id: 'openai-gpt-5.5',
    name: 'GPT 5.5',
    family: 'gpt',
    provider: { id: 'openai', name: 'OpenAI' },
    isResolved: true,
    isNamePending: false,
    model: {
      id: 'openai-gpt-5.5',
      providerKind: 'tau-hosted',
      name: 'GPT 5.5',
      slug: 'openai-gpt-5.5',
      model: 'gpt-5.5',
      provider: { id: 'openai', name: 'OpenAI' },
      details: {
        family: 'gpt',
        families: ['gpt'],
        contextWindow: 200_000,
        maxTokens: 32_000,
        cost: { inputTokens: 1, outputTokens: 4, cacheReadTokens: 0.1, cacheWriteTokens: 1.25 },
      },
      configuration: { streaming: true },
      support: { modalities: { input: ['text', 'image'], output: ['text'] }, tools: true },
    },
  } satisfies ResolvedModel;
  const defaults: CadAgentConfigInput = {
    profile: 'cad',
    execution: { kind: 'tau', model: 'openai-gpt-5.5' },
    kernel: 'replicad',
    mode: 'agent',
    toolChoice: 'auto',
    testingEnabled: true,
  };
  const admit = (settings: Partial<CadAgentConfigInput>): ReturnType<typeof agentHostConfig> =>
    agentHostConfig({ agent: { ...defaults, ...settings }, chatId: 'chat-1', runId: 'run-1', resolvedModel });
  const stateNote = (
    settings: Partial<CadAgentConfigInput>,
  ): NonNullable<ReturnType<typeof agentHostConfig>['contextMessages']>[number] | undefined =>
    admit(settings).contextMessages?.find((message) => message.metadata?.tauInternal?.['kind'] === 'chat-state');
  const base = admit({});

  const changes: ReadonlyArray<readonly [string, Partial<CadAgentConfigInput>, string]> = [
    ['plan mode', { mode: 'plan' }, '<plan_mode>'],
    ['testing off', { testingEnabled: false }, '<testing_off>'],
    ['tools off', { toolChoice: 'none' }, '<tools_off>'],
    ['a tool selection', { toolChoice: [toolName.readFile, toolName.editFile] }, '<tools_limited>'],
  ];

  it.each(changes)('should send the same system prompt and declare the same tools under %s', (_, settings) => {
    const admission = admit(settings);
    expect(admission.systemPrompt).toBe(base.systemPrompt);
    expect(admission.systemPromptBlocks).toEqual(base.systemPromptBlocks);
    expect(admission.allowedTools).toEqual(base.allowedTools);
  });

  it('should declare every tool the model supports, the test tool among them, and mask nothing by default', () => {
    expect(base.allowedTools).toContain(toolName.testModel);
    expect(base.toolChoice).toBe('auto');
    expect(stateNote({})?.metadata?.tauInternal?.['default']).toBe(true);
  });

  it('should mask the test tool, and only it, while testing is off', () => {
    const { toolChoice, allowedTools } = admit({ testingEnabled: false });
    expect(toolChoice).toEqual(allowedTools.filter((name) => name !== toolName.testModel));
  });

  it('should mask every tool the selection leaves out, and keep tools-off as it is', () => {
    expect(admit({ toolChoice: [toolName.readFile, toolName.testModel], testingEnabled: false }).toolChoice).toEqual([
      toolName.readFile,
    ]);
    expect(admit({ toolChoice: 'none' }).toolChoice).toBe('none');
  });

  it.each(changes)('should say %s in the state note, not in the system prompt', (_, settings, marker) => {
    const note = stateNote(settings);
    expect(note?.content).toContain(marker);
    expect(note?.metadata?.tauInternal?.['default']).toBeUndefined();
    expect(admit(settings).systemPrompt).not.toContain(marker);
  });
});

describe('the kernel text an admission freezes (automatic kernel selection D2)', () => {
  const profile = { available: ['openscad', 'replicad'] } as const;
  const agent = (kernel: CadAgentConfigInput['kernel'], owner?: { kernel: 'openscad'; entryPath: string }) =>
    ({
      profile: 'cad',
      execution: { kind: 'tau', model: 'anthropic-claude-sonnet-5.5' },
      kernel,
      mode: 'agent',
      toolChoice: 'auto',
      testingEnabled: true,
      snapshot: { kernel: buildSnapshotKernel({ preference: kernel, ...(owner ? { owner } : {}), profile }) },
    }) satisfies CadAgentConfigInput;
  const systemPrompt = (input: CadAgentConfigInput): string =>
    agentHostClientConfig({
      agent: input,
      chatId: 'chat-auto',
      resolvedModel: { model: undefined } as unknown as ResolvedModel,
    }).systemPrompt;

  it('should render the same text the snapshot carries, from its owner and available list', () => {
    const entryless = agent('auto');
    const owned = agent('auto', { kernel: 'openscad', entryPath: 'main.scad' });

    expect(systemPrompt(entryless)).toContain(renderKernelGuidance({ preference: 'auto', profile }));
    expect(systemPrompt(entryless)).toContain(entryless.snapshot.kernel.guidance);
    expect(systemPrompt(owned)).toContain(owned.snapshot.kernel.guidance);
    expect(systemPrompt(owned)).not.toContain('### Kernels available here');
  });

  it("should keep a manual pick's pin sentence", () => {
    expect(systemPrompt(agent('replicad'))).toContain('This project uses Replicad; activate the cad-replicad skill.');
  });
});
