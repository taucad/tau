import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
/* oxlint-disable no-restricted-imports -- This projectless e2e harness cannot resolve the host package export. */
// eslint-disable-next-line @nx/enforce-module-boundaries -- Its desktop sibling owns the host package dependency.
import { createHostToolRegistry } from '../../../packages/host/src/agent-tools.js';
/* oxlint-enable no-restricted-imports */
import { NodeFsChannel, NodeFsProviderClient } from '@taucad/filesystem/backend';
import {
  acquireNodeAuthorityWriter,
  NodeFsAuthorityHost,
  NodeFsProvider,
  serveNodeFsProvider,
} from '@taucad/filesystem/backend/node';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import { launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import { installGatewayFixture } from '#support/gateway-fixture.js';
import type { GatewayFixture } from '#support/gateway-fixture.js';
import { deleteTauTestUser, seedTauTestUser, tauTestAccount } from '#support/tau-account.js';
import {
  activeChatId,
  connectPickedFolder,
  expectSignedIn,
  expectVisible,
  openAgentList,
  selectAgent,
  selectKernel,
  submitPrompt,
} from '#support/scenario.js';

const fakeAcpAgent = join(resolve(import.meta.dirname, '../../..'), 'packages/host/src/acp/fixtures/fake-agent.ts');
let session: DesktopSession | undefined;
let fixture: GatewayFixture | undefined;
let seededEmail: string | undefined;

afterEach(async () => {
  await session?.close();
  session = undefined;
  await fixture?.close();
  fixture = undefined;
  if (seededEmail) {
    await deleteTauTestUser(seededEmail);
    seededEmail = undefined;
  }
});

test('opens a named view through the desktop utility MCP endpoint and renders its native card', async () => {
  const account = tauTestAccount('arrange-mcp');
  seededEmail = account.email;
  const token = await seedTauTestUser(account);
  session = await launchDesktopApp({
    token,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variables keep their wire names.
    env: { NODE_ENV: 'test', TAU_ACP_ADAPTER_OVERRIDE: `${fakeAcpAgent}:codex` },
  });
  const { page } = session;
  fixture = await installGatewayFixture(page);
  try {
    await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
    await expectSignedIn(page);
    await selectKernel(page, 'OpenSCAD');
    await connectPickedFolder(session);
    expect(await openAgentList(page)).toContainEqual(expect.stringMatching(/^Codex/u));
    await selectAgent(page, 'Codex');
    const gatewayRequestsBefore = fixture.gatewayRequests.length;
    await submitPrompt(page, 'mcp-arrange-conflict noask');
    await expect.poll(() => new URL(page.url()).searchParams.get('chat'), { timeout: 120_000 }).toBeTruthy();
    const chatId = activeChatId(page);
    const projectRoot = (): string => {
      const { pathname } = new URL(page.url());
      return join(session!.pickedDirectory, pathname.slice(pathname.lastIndexOf('/') + 1));
    };
    const eventsPath = (): string => join(projectRoot(), '.tau/chats', chatId, 'events.jsonl');
    const hasOutput = (callId: string): boolean =>
      existsSync(eventsPath()) &&
      readFileSync(eventsPath(), 'utf8')
        .split('\n')
        .some(
          (line) =>
            line.includes('"role":"tool-output"') &&
            line.includes('"toolName":"arrange_workbench"') &&
            line.includes(`"call":{"toolCallId":"${callId}"`),
        );
    await expect
      .poll(() => (existsSync(session!.logPath) ? readFileSync(session!.logPath, 'utf8') : ''), { timeout: 300_000 })
      .toMatch(/services\.mcp-listening.*"origin":"http:\/\/127\.0\.0\.1:\d+"/u);
    const authorityRoot = join(dirname(dirname(session.logPath)), 'filesystem-authority');
    await expect.poll(() => existsSync(join(authorityRoot, 'authority.writer.lock')), { timeout: 120_000 }).toBe(true);
    await expect(acquireNodeAuthorityWriter({ authorityRoot })).rejects.toMatchObject({
      code: 'AUTHORITY_ALREADY_OWNED',
    });
    await expect.poll(() => hasOutput('mcp-arrange-1'), { timeout: 300_000 }).toBe(true);
    await expect.poll(() => hasOutput('mcp-arrange-conflict-2'), { timeout: 300_000 }).toBe(true);
    const events = readFileSync(eventsPath(), 'utf8');
    const output = events
      .split('\n')
      .findLast((line) => line.includes('"toolCallId":"mcp-arrange-1"') && line.includes('"role":"tool-output"'));
    expect(output).toContain('"status":"written"');
    expect(output).not.toContain('"isError":true');
    expect(output).toContain('"agentId":"codex"');
    const conflict = events
      .split('\n')
      .findLast(
        (line) => line.includes('"toolCallId":"mcp-arrange-conflict-2"') && line.includes('"role":"tool-output"'),
      );
    expect(conflict).toContain('RECORD_CONFLICT');
    expect(conflict).toContain('"isError":true');
    const revisionsText = /"revisions":(\[[^\]]+\])/u.exec(output ?? '')?.[1];
    expect(revisionsText, output).toBeDefined();
    const revisions = JSON.parse(revisionsText!) as Array<{ path: string; digest: string }>;
    expect(revisions.map(({ path }) => path).sort()).toEqual([
      '.tau/workbench/layout.json',
      '.tau/workbench/views/front.json',
    ]);
    for (const revision of revisions) {
      const bytes = readFileSync(join(projectRoot(), revision.path));
      expect(`sha256:${createHash('sha256').update(bytes).digest('hex')}`).toBe(revision.digest);
    }
    const view = JSON.parse(readFileSync(join(projectRoot(), '.tau/workbench/views/front.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(view).toMatchObject({
      version: 1,
      name: 'Front',
      entryPath: 'main.scad',
      camera: { kind: 'preset', preset: 'front' },
    });
    const layout = JSON.parse(readFileSync(join(projectRoot(), '.tau/workbench/layout.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(layout).toMatchObject({ viewer: { kind: 'group' } });
    const viewer = layout['viewer'] as { tabs: Array<{ kind: string; view?: string }> };
    expect(viewer.tabs.some((tab) => tab.kind === 'view' && tab.view === 'front')).toBe(true);
    expect(JSON.stringify(layout)).not.toContain('parameters');
    const frontTab = page.locator('.dv-tab[data-tab-panel-id="front"]');
    await expectVisible(frontTab, 120_000);
    expect(await frontTab.locator('.dockview-tab-title').textContent()).toBe('main.scad');
    const arrangeCard = page
      .locator('[data-variant="minimal"][data-status="ready"]')
      .filter({ has: page.getByRole('button', { name: /^Arranged 1 view/u }) });
    await expectVisible(arrangeCard, 60_000);
    await arrangeCard.getByRole('button', { name: /^Arranged 1 view/u }).click();
    await expectVisible(arrangeCard.getByRole('button', { name: 'Restore previous layout' }));
    await expect.poll(async () => arrangeCard.getByRole('status').textContent(), { timeout: 60_000 }).toBe('Shown');
    expect(await page.getByText(/Explored .*front/u).count()).toBe(0);
    expect(fixture.gatewayRequests.length).toBe(gatewayRequestsBefore);
  } catch (error) {
    await session.capture('arrange-mcp-failure');
    throw error;
  }
});

test('uses the daemon provider fallback only for an explicit unsupported checked write', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tau-arrange-daemon-'));
  try {
    await writeFile(
      join(root, 'tau.json'),
      JSON.stringify({ id: 'proj_arrange', name: 'Arrange fallback', assets: { main: { entryPath: 'main.scad' } } }),
    );
    await writeFile(join(root, 'main.scad'), 'cube(10);\n');
    const provider = new NodeFsProvider(root);
    await expect(
      provider.writeFileChecked({
        path: '.tau/workbench/layout.json',
        data: '{}',
        preconditions: [{ path: '.tau/workbench/layout.json', expected: null }],
      }),
    ).rejects.toMatchObject({ code: 'CHECKED_WRITE_UNSUPPORTED' });
    const registry = createHostToolRegistry({ workspaceRoot: root, geospecRunner: false });
    const invoke = async (input: Parameters<typeof registry.invoke>[0]['input']) =>
      registry.invoke({
        toolCallId: 'arrange-daemon',
        toolName: 'arrange_workbench',
        input,
        signal: new AbortController().signal,
      });
    const written = await invoke({ open: [{ kind: 'pane', pane: 'model' }] });
    expect(written.isError, JSON.stringify(written.content)).toBe(false);
    const path = join(root, '.tau/workbench/layout.json');
    const bytes = await readFile(path, 'utf8');
    expect(JSON.parse(bytes)).toMatchObject({ workbench: { tabs: [{ kind: 'pane', pane: 'model' }] } });
    const refused = await invoke({ basedOn: 'missing', open: [{ kind: 'pane', pane: 'parameters' }] });
    expect(refused.isError).toBe(true);
    expect(JSON.stringify(refused.content)).toContain('RECORD_CONFLICT');
    expect(await readFile(path, 'utf8')).toBe(bytes);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('refuses an arrangement when the desktop authority fences a concurrent checked write', async () => {
  const sandbox = await mkdtemp(join(tmpdir(), 'tau-arrange-authority-'));
  const root = join(sandbox, 'project');
  const authorityRoot = join(sandbox, 'authority');
  await Promise.all([mkdir(root), mkdir(authorityRoot)]);
  const layoutPath = '.tau/workbench/layout.json';
  const before = JSON.stringify({
    version: 1,
    lanes: { chat: true, workbench: true },
    viewer: { kind: 'group', tabs: [] },
    workbench: { kind: 'group', tabs: [] },
  });
  const concurrent = JSON.stringify({
    version: 1,
    lanes: { chat: false, workbench: true },
    viewer: { kind: 'group', tabs: [] },
    workbench: { kind: 'group', tabs: [] },
  });
  const authority = new NodeFsAuthorityHost({ authorityDirectory: () => authorityRoot, authorityIdentity: () => root });
  const firstPorts = new MessageChannel();
  const secondPorts = new MessageChannel();
  const stopFirst = serveNodeFsProvider(firstPorts.port2, {
    policy: tauPathPolicy,
    allowRoot: (candidate) => candidate === root,
    authority,
  });
  const stopSecond = serveNodeFsProvider(secondPorts.port2, {
    policy: tauPathPolicy,
    allowRoot: (candidate) => candidate === root,
    authority,
  });
  const firstChannel = new NodeFsChannel(firstPorts.port1);
  const secondChannel = new NodeFsChannel(secondPorts.port1);
  const first = new NodeFsProviderClient(firstChannel, root);
  const second = new NodeFsProviderClient(secondChannel, root);
  try {
    await first.writeFile(layoutPath, before);
    const checked = first.writeFileChecked.bind(first);
    let raced = false;
    const checkedSpy = vi.spyOn(first, 'writeFileChecked').mockImplementation(async (input) => {
      if (!raced && input.path === layoutPath) {
        raced = true;
        expect(
          await second.writeFileChecked({
            path: layoutPath,
            data: concurrent,
            preconditions: [{ path: layoutPath, expected: before }],
          }),
        ).toMatchObject({ status: 'applied' });
      }
      return checked(input);
    });
    const registry = createHostToolRegistry({ workspaceRoot: root, filesystem: () => first, geospecRunner: false });
    const result = await registry.invoke({
      toolCallId: 'arrange-authority-race',
      toolName: 'arrange_workbench',
      input: {
        basedOn: `sha256:${createHash('sha256').update(before).digest('hex')}`,
        open: [{ kind: 'pane', pane: 'parameters' }],
      },
      signal: new AbortController().signal,
    });
    expect(checkedSpy).toHaveBeenCalled();
    expect(raced).toBe(true);
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('RECORD_CONFLICT');
    expect(await readFile(join(root, layoutPath), 'utf8')).toBe(concurrent);
  } finally {
    firstChannel.close();
    secondChannel.close();
    await stopFirst();
    await stopSecond();
    firstPorts.port2.close();
    secondPorts.port2.close();
    await rm(sandbox, { recursive: true, force: true });
  }
});
