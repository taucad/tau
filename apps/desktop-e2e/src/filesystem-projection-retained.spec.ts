import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { createHash } from 'node:crypto';
import { emptyChatLedger, foldChatLedger, parseEventLog, parseLogEvent, reduceEventLog } from '@taucad/agent-host';
import { projectManifestSchema } from '@taucad/project-core';
import type { AgentLogEvent } from '@taucad/agent-host';
import { expect, test } from 'vitest';
import { authenticatePackagedDesktop, launchDesktopApp } from '#support/desktop-app.js';
import {
  activeChatId,
  connectPickedFolder,
  expectCount,
  expectSignedIn,
  expectVisible,
  selectChatModel,
  selectKernel,
  stopButtonOf,
  submitPrompt,
} from '#support/scenario.js';
import { desktopE2ECompletedArtifact } from '#support/config.js';
import {
  gatewayFixtureModelName,
  gatewayFixtureScadSource,
  failedGatewayToolResults,
  startGatewayFixture,
} from '#support/gateway-fixture.js';
import { deleteTauTestUser, seedTauTestUser, tauTestAccount } from '#support/tau-account.js';

test('adopts independent native layout and view records in the retained document', async () => {
  const session = await launchDesktopApp({ token: 'offline-preferences' });
  try {
    const { page } = session;
    await page.goto('app://tau/__e2e/project-file-tree');
    await page.waitForURL(/\/w\//u, { timeout: 60_000 });
    const slug = new URL(page.url()).pathname.split('/').at(-1);
    if (!slug) {
      throw new Error('The native fixture did not create a rooted project.');
    }
    const root = join(session.homeRoot, slug);
    const layoutPath = join(root, '.tau/workbench/layout.json');
    await expect
      .poll(async () => readFile(layoutPath, 'utf8').catch(() => undefined), { timeout: 60_000 })
      .toBeDefined();
    const initial = JSON.parse(await readFile(layoutPath, 'utf8')) as {
      viewer: { kind: 'group'; tabs: Array<{ kind: 'view'; view: string }> };
    };
    const before = await page.evaluate(() => ({ href: location.href, timeOrigin: performance.timeOrigin }));
    const viewId = 'projection-retained-front';
    await mkdir(join(root, '.tau/workbench/views'), { recursive: true });
    await writeFile(
      join(root, `.tau/workbench/views/${viewId}.json`),
      JSON.stringify({
        version: 1,
        entryPath: 'public/models/honeycomb.js',
        name: 'Retained front',
        camera: { kind: 'look', direction: [1, 0, 0] },
        grid: { unit: 'in' },
        section: { active: true, cuts: [{ kind: 'plane', plane: 'xy', offset: 0.012, isFlipped: false }] },
      }),
    );
    await writeFile(
      layoutPath,
      JSON.stringify({
        ...initial,
        viewer: {
          ...initial.viewer,
          tabs: [...initial.viewer.tabs, { kind: 'view', view: viewId }],
          active: initial.viewer.tabs.length,
        },
      }),
    );
    await expectVisible(page.locator(`.dv-tab[data-tab-panel-id="${viewId}"]`));
    await expectVisible(page.getByRole('button', { name: /Grid .* in, units and grid/iu }));
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const bridges =
              (
                globalThis as {
                  __TAU_SECTION_VIEW_TEST_BRIDGES__?: Array<{
                    getCamera(): { position: number[]; target: number[] };
                    getSectionState(): {
                      isActive: boolean;
                      cuts: Array<{ kind: string; plane?: string; offset?: number }>;
                    };
                  }>;
                }
              ).__TAU_SECTION_VIEW_TEST_BRIDGES__ ?? [];
            return bridges.some((bridge) => {
              const camera = bridge.getCamera();
              const direction = camera.position.map((value, index) => value - camera.target[index]!);
              const length = Math.hypot(...direction);
              const section = bridge.getSectionState();
              return (
                direction[0]! / length > 0.95 &&
                Math.abs(direction[1]! / length) < 0.05 &&
                Math.abs(direction[2]! / length) < 0.05 &&
                section.isActive &&
                section.cuts.some((cut) => cut.kind === 'plane' && cut.plane === 'xy' && cut.offset === 0.012)
              );
            });
          }),
        { timeout: 60_000 },
      )
      .toBe(true);
    await writeFile(
      join(root, 'public/models/honeycomb.js'),
      `import { makeBaseBox } from 'replicad';
  export default function main() { return [{ name: 'Base', shape: makeBaseBox(20, 14, 4) }, { name: 'Cap', shape: makeBaseBox(10, 10, 5).translate([30, 0, 0]) }]; }
  `,
    );
    const componentIds = async (): Promise<string[]> =>
      page.evaluate(() => {
        const bridge = (globalThis as { __TAU_SECTION_VIEW_TEST__?: { getModelComponents(): Array<{ id: string }> } })
          .__TAU_SECTION_VIEW_TEST__;
        return bridge?.getModelComponents().map(({ id }) => id) ?? [];
      });
    await expect
      .poll(
        async () => {
          const ids = await componentIds();
          return ids.length;
        },
        { timeout: 60_000 },
      )
      .toBeGreaterThanOrEqual(2);
    const [componentId, otherComponentId] = await componentIds();
    if (!componentId) {
      throw new Error('The seeded native kernel rendered no components.');
    }
    await writeFile(
      join(root, '.tau/workbench/entries.json'),
      JSON.stringify({
        version: 1,
        entries: { 'public/models/honeycomb.js': { renderTimeout: 0, components: { hidden: [componentId] } } },
      }),
    );
    await expect
      .poll(
        async () =>
          page.evaluate((id) => {
            const bridges =
              (
                globalThis as {
                  __TAU_SECTION_VIEW_TEST_BRIDGES__?: Array<{ getModelVisibility(): { hiddenComponentIds: string[] } }>;
                }
              ).__TAU_SECTION_VIEW_TEST_BRIDGES__ ?? [];
            return bridges.some((bridge) => bridge.getModelVisibility().hiddenComponentIds.includes(id));
          }, componentId),
        { timeout: 60_000 },
      )
      .toBe(true);
    await writeFile(
      join(root, '.tau/workbench/entries.json'),
      JSON.stringify({
        version: 1,
        entries: {
          'public/models/honeycomb.js': {
            renderTimeout: 0,
            components: { hidden: [], isolated: [componentId], opacity: [{ id: componentId, opacity: 0.25 }] },
          },
        },
      }),
    );
    await expect
      .poll(
        async () =>
          page.evaluate(
            ({ id, otherId }) => {
              const bridges =
                (
                  globalThis as {
                    __TAU_SECTION_VIEW_TEST_BRIDGES__?: Array<{
                      getModelVisibility(): { isolatedComponentIds: string[] };
                      getRenderedModelComponentState(id: string): {
                        meshCount: number;
                        visibleMeshCount: number;
                        materialOpacities: number[];
                      };
                    }>;
                  }
                ).__TAU_SECTION_VIEW_TEST_BRIDGES__ ?? [];
              return bridges.some((bridge) => {
                const chosen = bridge.getRenderedModelComponentState(id);
                const other = bridge.getRenderedModelComponentState(otherId);
                return (
                  bridge.getModelVisibility().isolatedComponentIds.includes(id) &&
                  chosen.visibleMeshCount > 0 &&
                  other.meshCount > 0 &&
                  other.visibleMeshCount === 0 &&
                  chosen.materialOpacities.length > 0 &&
                  chosen.materialOpacities.every((opacity) => Math.abs(opacity - 0.25) < 0.001)
                );
              });
            },
            { id: componentId, otherId: otherComponentId! },
          ),
        { timeout: 60_000 },
      )
      .toBe(true);
    await page.getByRole('button', { name: 'Viewer settings' }).last().click();
    await expectVisible(
      page.locator('[data-slot="dropdown-menu-select-item"] [role="combobox"]').filter({ hasText: 'Disabled' }),
    );
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.getByPlaceholder('Search projects, chats, and actions…').fill('Export');
    await page.getByRole('option', { name: /^Export(?:\s|$)/u }).click();
    await expectVisible(page.locator('[data-slot="export-panel-body"]'));
    await mkdir(join(root, '.tau/export'), { recursive: true });
    await writeFile(
      join(root, '.tau/export/preferences.json'),
      JSON.stringify({
        selectedFormats: ['stl'],
        shouldDownload: false,
        shouldSaveToProject: true,
      }),
    );
    await expect
      .poll(async () => page.getByRole('button', { name: /^STL$/iu }).getAttribute('aria-pressed'), { timeout: 60_000 })
      .toBe('true');
    await expect
      .poll(
        async () =>
          page
            .getByRole('checkbox', { name: 'Download to disk', exact: true })
            .evaluate((element) => element.dataset['state']),
        {
          timeout: 60_000,
        },
      )
      .toBe('unchecked');
    await expect
      .poll(
        async () =>
          page
            .getByRole('checkbox', { name: 'Save to project', exact: true })
            .evaluate((element) => element.dataset['state']),
        {
          timeout: 60_000,
        },
      )
      .toBe('checked');
    expect(await page.evaluate(() => ({ href: location.href, timeOrigin: performance.timeOrigin }))).toEqual(before);
  } finally {
    await session.close();
  }
});

// Fixture-local canonical cloning keeps native revision identities within the native workload.
const createNativeProjectionHistory = (
  template: string,
  turns: number,
): { text: string; turns: number; rows: number; bytes: number; messages: number; prompts: string[] } => {
  const source = parseEventLog(template);
  const sourceMessages = reduceEventLog(source);
  if (source.filter((row) => row.type === 'turn.history-projection-committed').length !== 1) {
    throw new Error('A benchmark template must contain exactly one complete committed turn.');
  }
  const identities = new Set<string>();
  const protectedIdentities = new Set<string>();
  const identityFields = new Set([
    'id',
    'runId',
    'messageId',
    'userMessageId',
    'requestMessageId',
    'commandId',
    'attemptId',
    'operationId',
    'toolCallId',
    'leaseId',
    'turnId',
    'requestId',
    'invocationId',
    'interactionId',
    'bindingId',
    'receiptId',
    'stepId',
    'parentMessageId',
    'responseId',
  ]);
  const collect = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const child of value) {
        collect(child);
      }
    } else if (typeof value === 'object' && value !== null) {
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        if (
          ['model', 'provider', 'project', 'checkout', 'host'].includes(key) &&
          typeof child === 'object' &&
          child !== null &&
          'id' in child &&
          typeof child.id === 'string'
        ) {
          protectedIdentities.add(child.id);
        }
        if (
          typeof child === 'string' &&
          (/revisionId$/iu.test(key) ||
            ['projectId', 'chatId', 'checkoutId', 'modelId', 'providerId', 'hostId'].includes(key))
        ) {
          protectedIdentities.add(child);
        }
        if (identityFields.has(key) && typeof child === 'string') {
          identities.add(child);
        }
        collect(child);
      }
    }
  };
  for (const row of source) {
    collect(row);
  }
  for (const protectedIdentity of protectedIdentities) {
    identities.delete(protectedIdentity);
  }
  const rows: AgentLogEvent[] = [];
  const prompts: string[] = [];
  const retained: string[] = [];
  for (let turn = 0; turn < turns; turn += 1) {
    const replacements = new Map([...identities].map((id) => [id, `${id}:projection:${turn}`]));
    const rewrite = (value: unknown): unknown => {
      if (typeof value === 'string') {
        return replacements.get(value) ?? value;
      }
      if (Array.isArray(value)) {
        return value.map((child) => rewrite(child));
      }
      if (typeof value === 'object' && value !== null) {
        return Object.fromEntries(
          Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, rewrite(child)]),
        );
      }
      return value;
    };
    for (const row of source) {
      const rewritten = rewrite(row) as Record<string, unknown>;
      rewritten['leaderEpoch'] = source[0]!.leaderEpoch;
      rewritten['epoch'] = source[0]!.epoch;
      rewritten['sequence'] = rows.length;
      if (row.type === 'turn.history-projection-committed') {
        rewritten['retainedMessageIds'] = [...retained];
        const message = rewritten['message'] as { content: unknown };
        const marker = `Fixture turn ${turn + 1} of ${turns}.`;
        message.content =
          typeof message.content === 'string'
            ? `${message.content} ${marker}`
            : [...(message.content as unknown[]), { type: 'text', text: marker }];
        prompts.push(marker);
      }
      rows.push(parseLogEvent(rewritten));
    }
    retained.push(...sourceMessages.map((message) => replacements.get(message.id) ?? message.id));
  }
  const messages = reduceEventLog(rows);
  const ledger = foldChatLedger(emptyChatLedger, rows);
  if (
    !ledger.historyIntact ||
    ledger.anomalies.length > 0 ||
    messages.length !== retained.length ||
    Object.keys(ledger.runs).length !== turns
  ) {
    throw new Error('Generated history failed canonical reducer/ledger qualification.');
  }
  const text = rows.map((row) => JSON.stringify(row)).join('\n') + '\n';
  return {
    text,
    turns,
    rows: rows.length,
    bytes: new TextEncoder().encode(text).byteLength,
    messages: messages.length,
    prompts,
  };
};

test('diagnoses actual native 1000 turn possibly prewarmed selection warm and held stream paths', async () => {
  const next = Promise.withResolvers<void>();
  let shouldHold = false;
  const fixture = await startGatewayFixture({
    toolCalls: [],
    textChunks: ['Native diagnostic alpha.', ' Native diagnostic beta.'],
    beforeTextChunk: async (index) => {
      if (shouldHold && index === 1) {
        await next.promise;
      }
    },
  });
  const account = tauTestAccount('filesystem-native-diagnostic');
  const token = await seedTauTestUser(account);
  const session = await launchDesktopApp({ token });
  try {
    const { page } = session;
    await fixture.routeThrough(page);
    await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
    if (desktopE2ECompletedArtifact) {
      await authenticatePackagedDesktop(session, token);
    }
    await expectSignedIn(page);
    await selectChatModel(page, gatewayFixtureModelName);
    const slug = await submitPrompt(page, 'Create the canonical native projection template.');
    await expectCount(stopButtonOf(page), 0, 120_000);
    const templateChat = activeChatId(page);
    const root = join(session.homeRoot, slug);
    const templatePath = join(root, '.tau/chats', templateChat, 'events.jsonl');
    await expect.poll(async () => readFile(templatePath, 'utf8'), { timeout: 60_000 }).toContain('turn.finalized');
    const history = createNativeProjectionHistory(await readFile(templatePath, 'utf8'), 1000);
    await page.locator('[data-slot="project-trigger"]').first().hover();
    await page
      .getByRole('button', { name: /^New chat in /u })
      .first()
      .click();
    await expect.poll(() => new URL(page.url()).searchParams.get('chat'), { timeout: 60_000 }).not.toBe(templateChat);
    const benchmarkChat = activeChatId(page);
    await page.locator(`a[href*="chat=${templateChat}"]`).first().click();
    const benchmarkRoot = join(root, '.tau/chats', benchmarkChat);
    await mkdir(benchmarkRoot, { recursive: true });
    await writeFile(join(benchmarkRoot, 'events.jsonl'), history.text);
    const artifactRoot = resolve(
      process.env['TAU_E2E_PROJECTION_ARTIFACT_ROOT'] ??
        'out/research/filesystem-projection-performance-charter/2026-10-08-live-delivery/host-replay/native-diagnostic',
    );
    await mkdir(artifactRoot, { recursive: true });
    await writeFile(join(artifactRoot, 'events.jsonl'), history.text);
    // Construct only a disposable closure; retain the template's actual chat/revision identity.
    const closureRoot = join(artifactRoot, 'rooted-project');
    await mkdir(closureRoot);
    await cp(root, closureRoot, {
      recursive: true,
      filter: (path) => !path.endsWith('.lock') && path !== benchmarkRoot,
    });
    await writeFile(join(closureRoot, '.tau/chats', templateChat, 'events.jsonl'), history.text);
    expect(await readdir(join(closureRoot, '.tau/chats'))).toEqual([templateChat]);
    const coldStarted = performance.now();
    await page.locator(`a[href*="chat=${benchmarkChat}"]`).first().click();
    await expectVisible(page.getByRole('button', { name: /Fixture turn 1000 of 1000\./u }).last(), 120_000);
    /** Milliseconds. */
    const coldOpen = performance.now() - coldStarted;
    await page.locator(`a[href*="chat=${templateChat}"]`).first().click();
    await expect.poll(() => activeChatId(page), { timeout: 60_000 }).toBe(templateChat);
    const warmStarted = performance.now();
    await page.locator(`a[href*="chat=${benchmarkChat}"]`).first().click();
    await expectVisible(page.getByRole('button', { name: /Fixture turn 1000 of 1000\./u }).last(), 120_000);
    /** Milliseconds. */
    const warmSwitch = performance.now() - warmStarted;
    shouldHold = true;
    const admissionStarted = performance.now();
    await submitPrompt(page, 'Continue the native 1000 turn diagnostic.');
    await expectVisible(page.getByText('Native diagnostic alpha.', { exact: true }).last(), 120_000);
    /** Milliseconds. */
    const firstChunk = performance.now() - admissionStarted;
    expect(await page.getByText('Native diagnostic alpha. Native diagnostic beta.', { exact: true }).count()).toBe(0);
    next.resolve();
    await expectVisible(
      page.getByText('Native diagnostic alpha. Native diagnostic beta.', { exact: true }).last(),
      120_000,
    );
    await expectCount(stopButtonOf(page), 0, 120_000);
    await writeFile(
      join(artifactRoot, 'receipt.json'),
      JSON.stringify(
        {
          schema: 'tau-native-projection-fixture-v1',
          producerSpecSha256: createHash('sha256')
            .update(await readFile(import.meta.filename))
            .digest('hex'),
          manifest: {
            ...projectManifestSchema.parse(JSON.parse(await readFile(join(closureRoot, 'tau.json'), 'utf8'))),
            sha256: createHash('sha256')
              .update(await readFile(join(closureRoot, 'tau.json')))
              .digest('hex'),
          },
          backend: 'native',
          workload: 'canonical native production turn clone; 1000 transcript turns, not kernel publications',
          templateChat,
          benchmarkChat: templateChat,
          excludedChatDirectories: [benchmarkChat],
          slug,
          history: { turns: history.turns, rows: history.rows, bytes: history.bytes, messages: history.messages },
          sha256: createHash('sha256').update(history.text).digest('hex'),
          fixtureClosure: 'rooted-project',
          closureFiles: await nativeFixtureFiles(join(artifactRoot, 'rooted-project')),
          baselineRequirement:
            'Copy exact rooted project into the picked folder, Connect a folder, then open its discovered library card; no foreign revision substitution',
          measurement: 'runner inclusive diagnostic; not sub100ms browser gesture acceptance',
          possiblyPrewarmedFirstSelection: coldOpen,
          warmSwitch,
          firstChunk,
        },
        null,
        2,
      ),
    );
  } finally {
    next.resolve();
    await session.close();
    await fixture.close();
    await deleteTauTestUser(account.email);
  }
});

/** Hash every retained physical project/revision file; writer locks are deliberately outside the fixture. */
const nativeFixtureFiles = async (root: string, prefix = ''): Promise<Record<string, string>> => {
  const children = await readdir(join(root, prefix), { withFileTypes: true });
  const entries = await Promise.all(
    children.map(async (child) => {
      const path = prefix ? `${prefix}/${child.name}` : child.name;
      if (child.isDirectory()) {
        return nativeFixtureFiles(root, path);
      }
      if (!child.isFile()) {
        throw new Error(`Unsupported native fixture entry ${path}.`);
      }
      return {
        [path]: createHash('sha256')
          .update(await readFile(join(root, path)))
          .digest('hex'),
      };
    }),
  );
  return Object.assign({}, ...entries) as Record<string, string>;
};

type NativeProjectionWitness = {
  requests: string[];
  targetRequests: number;
  dropped: number;
  armedHref: string;
  gestureAt?: number;
  firstTargetRequestAt?: number;
  trusted: boolean;
  targetRequestsAtGesture?: number;
};

test.skipIf(!process.env['TAU_E2E_PROJECTION_IMPORT_ROOT'])(
  'diagnoses imported exact native workload through folder discovery',
  async () => {
    const artifactRoot = resolve(process.env['TAU_E2E_PROJECTION_IMPORT_ROOT']!);
    const receipt = JSON.parse(await readFile(join(artifactRoot, 'receipt.json'), 'utf8')) as {
      schema: string;
      producerSpecSha256: string;
      manifest: { id: string; name: string; sha256: string };
      slug: string;
      templateChat: string;
      benchmarkChat: string;
      sha256: string;
      closureFiles: Record<string, string>;
    };
    expect(receipt.schema).toBe('tau-native-projection-fixture-v1');
    expect(receipt.producerSpecSha256).toMatch(/^[a-f0-9]{64}$/u);
    const closure = join(artifactRoot, 'rooted-project');
    const manifestBytes = await readFile(join(closure, 'tau.json'));
    const manifest = projectManifestSchema.parse(JSON.parse(manifestBytes.toString('utf8')));
    expect(createHash('sha256').update(manifestBytes).digest('hex')).toBe(receipt.manifest.sha256);
    expect(manifest.id).toBe(receipt.manifest.id);
    expect(manifest.name).toBe(receipt.manifest.name);
    expect(await nativeFixtureFiles(closure)).toEqual(receipt.closureFiles);
    expect(await readdir(join(closure, '.tau/chats'))).toEqual([receipt.benchmarkChat]);
    expect(receipt.benchmarkChat).toBe(receipt.templateChat);
    const history = await readFile(join(artifactRoot, 'events.jsonl'), 'utf8');
    expect(createHash('sha256').update(history).digest('hex')).toBe(receipt.sha256);
    const rows = parseEventLog(history);
    const ledger = foldChatLedger(emptyChatLedger, rows);
    expect(ledger.historyIntact).toBe(true);
    expect(ledger.anomalies).toEqual([]);
    expect(Object.keys(ledger.runs)).toHaveLength(1000);
    const next = Promise.withResolvers<void>();
    const fixture = await startGatewayFixture({
      toolCalls: [],
      textChunks: ['Imported native alpha.', ' Imported native beta.'],
      beforeTextChunk: async (index) => {
        if (index === 1) {
          await next.promise;
        }
      },
    });
    const account = tauTestAccount('filesystem-native-import');
    let session: Awaited<ReturnType<typeof launchDesktopApp>> | undefined;
    let accountSeeded = false;
    try {
      const token = await seedTauTestUser(account);
      accountSeeded = true;
      session = await launchDesktopApp({ token });
      const { page } = session;
      await fixture.routeThrough(page);
      await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
      if (desktopE2ECompletedArtifact) {
        await authenticatePackagedDesktop(session, token);
      }
      await expectSignedIn(page);
      const importedRoot = join(session.pickedDirectory, receipt.slug);
      await cp(closure, importedRoot, { recursive: true });
      expect(await nativeFixtureFiles(importedRoot)).toEqual(receipt.closureFiles);
      expect(await readFile(join(importedRoot, '.tau/chats', receipt.benchmarkChat, 'events.jsonl'), 'utf8')).toBe(
        history,
      );
      // Observe the fresh document before even registering the folder, not after potential discovery prewarm.
      await page.addInitScript((benchmarkChat: string) => {
        const witness = {
          requests: [] as string[],
          targetRequests: 0,
          dropped: 0,
          armedHref: '',
          gestureAt: undefined as number | undefined,
          firstTargetRequestAt: undefined as number | undefined,
          trusted: false,
          targetRequestsAtGesture: undefined as number | undefined,
        };
        Object.assign(globalThis, { __tauNativeProjectionReads: witness });
        document.addEventListener(
          'click',
          (event) => {
            const link = event.target instanceof Element ? event.target.closest('a') : undefined;
            if (
              witness.armedHref &&
              link?.getAttribute('href') === witness.armedHref &&
              witness.gestureAt === undefined
            ) {
              witness.gestureAt = performance.now();
              witness.trusted = event.isTrusted;
              witness.targetRequestsAtGesture = witness.targetRequests;
            }
          },
          { capture: true },
        );
        const original = MessagePort.prototype.postMessage;
        MessagePort.prototype.postMessage = function (
          this: MessagePort,
          message: unknown,
          options?: Transferable[] | StructuredSerializeOptions,
        ): void {
          const frame = message as { n?: string; a?: { chatId?: string } } | undefined;
          if ((frame?.n === 'read' || frame?.n === 'liveEvents' || frame?.n === 'catchUp') && frame.a?.chatId) {
            if (witness.requests.length < 32) {
              witness.requests.push(frame.a.chatId.slice(0, 128));
            } else {
              witness.dropped += 1;
            }
            if (frame.a.chatId === benchmarkChat) {
              witness.targetRequests += 1;
              witness.firstTargetRequestAt ??= performance.now();
            }
          }
          original.call(this, message, Array.isArray(options) ? { transfer: options } : options);
        };
      }, receipt.benchmarkChat);
      await page.reload();
      await connectPickedFolder(session);
      await page.getByRole('link', { name: 'Projects', exact: true }).click();
      await page.waitForURL((url) => url.pathname === '/projects', { timeout: 60_000 });
      const readsBeforeCard = await page.evaluate(
        () =>
          (globalThis as typeof globalThis & { __tauNativeProjectionReads: NativeProjectionWitness })
            .__tauNativeProjectionReads,
      );
      expect(readsBeforeCard.targetRequests).toBe(0);
      expect(readsBeforeCard.firstTargetRequestAt).toBeUndefined();
      const project = page.getByRole('link', { name: `Open ${manifest.name}`, exact: true });
      await expectVisible(project, 60_000);
      const projectHref = await project.getAttribute('href');
      expect(projectHref).toBeTruthy();
      await page.evaluate((href: string) => {
        (
          globalThis as typeof globalThis & { __tauNativeProjectionReads: NativeProjectionWitness }
        ).__tauNativeProjectionReads.armedHref = href;
      }, projectHref!);
      const coldStarted = performance.now();
      await project.click();
      await page.waitForURL(/\/w\//u, { timeout: 60_000 });
      await expect.poll(() => activeChatId(page), { timeout: 60_000 }).toBe(receipt.benchmarkChat);
      await expectVisible(page.getByRole('button', { name: /Fixture turn 1000 of 1000\./u }).last(), 120_000);
      /** Milliseconds. */
      const coldOpen = performance.now() - coldStarted;
      const readsAfterCard = await page.evaluate(() => ({
        ...(globalThis as typeof globalThis & { __tauNativeProjectionReads: NativeProjectionWitness })
          .__tauNativeProjectionReads,
        observedAt: performance.now(),
      }));
      expect(readsAfterCard.targetRequests).toBeGreaterThan(0);
      expect(readsAfterCard.trusted).toBe(true);
      expect(readsAfterCard.targetRequestsAtGesture).toBe(0);
      expect(readsAfterCard.gestureAt).toBeDefined();
      expect(readsAfterCard.firstTargetRequestAt).toBeGreaterThanOrEqual(readsAfterCard.gestureAt!);
      /** Milliseconds. */
      const trustedGestureToObserved = readsAfterCard.observedAt - readsAfterCard.gestureAt!;
      await page.locator('[data-slot="project-trigger"]').first().hover();
      await page
        .getByRole('button', { name: /^New chat in /u })
        .first()
        .click();
      await expect.poll(() => activeChatId(page), { timeout: 60_000 }).not.toBe(receipt.benchmarkChat);
      const warmStarted = performance.now();
      await page.locator(`a[href*="chat=${receipt.benchmarkChat}"]`).first().click();
      await expectVisible(page.getByRole('button', { name: /Fixture turn 1000 of 1000\./u }).last(), 120_000);
      /** Milliseconds. */
      const warmSwitch = performance.now() - warmStarted;
      await selectChatModel(page, gatewayFixtureModelName);
      const admissionStarted = performance.now();
      await submitPrompt(page, 'Continue the imported canonical native workload.');
      await expectVisible(page.getByText('Imported native alpha.', { exact: true }).last(), 120_000);
      /** Milliseconds. */
      const firstChunk = performance.now() - admissionStarted;
      expect(await page.getByText('Imported native alpha. Imported native beta.', { exact: true }).count()).toBe(0);
      next.resolve();
      await expectVisible(
        page.getByText('Imported native alpha. Imported native beta.', { exact: true }).last(),
        120_000,
      );
      await expectCount(stopButtonOf(page), 0, 120_000);
      const outputRoot = resolve(
        process.env['TAU_E2E_PROJECTION_ARTIFACT_ROOT'] ??
          'out/research/filesystem-projection-performance-charter/2026-10-08-live-delivery/host-replay/native-import-diagnostic',
      );
      expect(outputRoot === artifactRoot || outputRoot.startsWith(`${artifactRoot}/`)).toBe(false);
      expect(await nativeFixtureFiles(closure)).toEqual(receipt.closureFiles);
      expect(
        createHash('sha256')
          .update(await readFile(join(artifactRoot, 'events.jsonl')))
          .digest('hex'),
      ).toBe(receipt.sha256);
      await mkdir(outputRoot, { recursive: true });
      await writeFile(
        join(outputRoot, 'import-receipt.json'),
        JSON.stringify(
          {
            schema: 'tau-native-projection-import-v1',
            source: artifactRoot,
            producerSpecSha256: receipt.producerSpecSha256,
            importerSpecSha256: createHash('sha256')
              .update(await readFile(import.meta.filename))
              .digest('hex'),
            manifest: receipt.manifest,
            sha256: receipt.sha256,
            closureFiles: receipt.closureFiles,
            authority:
              'actual picked native folder discovered through production Connect a folder and Projects library',
            measurement: 'runner inclusive first project connection; fresh host/renderer, not cold OS page cache',
            readsBeforeCard,
            readsAfterCard,
            monitorScope:
              'Renderer MessagePort read/liveEvents only; does not observe direct filesystem, native daemon or OS reads. Installed before folder registration; witnesses renderer read/liveEvents before and after trusted card gesture. It cannot prove preload/native IPC connector creation timing; that qualification remains pending.',
            coldOpen,
            trustedGestureToObserved,
            warmSwitch,
            firstChunk,
          },
          null,
          2,
        ),
      );
    } finally {
      next.resolve();
      try {
        await session?.close();
      } finally {
        try {
          await fixture.close();
        } finally {
          if (accountSeeded) {
            await deleteTauTestUser(account.email);
          }
        }
      }
    }
  },
);

const installRetainedControls = (title: string): void => {
  const state = { writes: [] as string[], checkpoints: [] as string[], end: false };
  Object.assign(globalThis, { __tauRetainedManual: state });
  document.title = title;
  const controls = document.createElement('aside');
  controls.setAttribute('aria-label', 'Retained fixture controls');
  controls.style.cssText =
    'position:fixed;top:8px;right:8px;z-index:2147483647;background:white;color:black;padding:8px;border:1px solid black';
  for (const kind of ['view', 'entries', 'preferences']) {
    const button = document.createElement('button');
    button.textContent = `Apply independent ${kind}`;
    button.addEventListener('click', () => {
      state.writes.push(kind);
    });
    controls.append(button);
  }
  const name = document.createElement('input');
  name.setAttribute('aria-label', 'Checkpoint name');
  const capture = document.createElement('button');
  capture.textContent = 'Capture checkpoint';
  capture.addEventListener('click', () => {
    state.checkpoints.push(name.value.trim() || `checkpoint-${Date.now()}`);
  });
  const end = document.createElement('button');
  end.textContent = 'End manual fixture';
  end.addEventListener('click', () => {
    state.checkpoints.push('end');
    state.end = true;
  });
  controls.append(name, capture, end);
  document.body.append(controls);
};

const readRetainedFlags = (): { writes: string[]; checkpoints: string[]; end: boolean } => {
  const state = (
    globalThis as typeof globalThis & { __tauRetainedManual: { writes: string[]; checkpoints: string[]; end: boolean } }
  ).__tauRetainedManual;
  const flags = { writes: [...state.writes], checkpoints: [...state.checkpoints], end: state.end };
  state.writes = [];
  state.checkpoints = [];
  return flags;
};

test.describe.skipIf(process.env['TAU_E2E_RETAINED_MANUAL'] !== 'true')('retained native manual fixture', () => {
  const prepare = async () => {
    const session = await launchDesktopApp({
      token: 'offline-preferences',
      visible: true,
      windowTitle: 'Tau candidate retained manual',
    });
    try {
      const { page } = session;
      await page.goto('app://tau/__e2e/project-file-tree');
      await page.waitForURL(/\/w\//u, { timeout: 60_000 });
      const slug = new URL(page.url()).pathname.split('/').at(-1);
      if (!slug) {
        throw new Error('Native retained manual seed has no rooted project.');
      }
      const root = join(session.homeRoot, slug);
      const model = `import { makeBaseBox } from 'replicad';
export default function main() { return [{ name: 'Base', shape: makeBaseBox(20, 14, 4) }, { name: 'Cap', shape: makeBaseBox(10, 10, 5).translate([30, 0, 0]) }]; }
`;
      await writeFile(join(root, 'public/models/honeycomb.js'), model);
      const components = async (): Promise<string[]> =>
        page.evaluate(
          () =>
            (
              globalThis as { __TAU_SECTION_VIEW_TEST__?: { getModelComponents(): Array<{ id: string }> } }
            ).__TAU_SECTION_VIEW_TEST__
              ?.getModelComponents()
              .map(({ id }) => id) ?? [],
        );
      await expect
        .poll(
          async () => {
            const ids = await components();
            return ids.length;
          },
          { timeout: 60_000 },
        )
        .toBeGreaterThanOrEqual(2);
      const componentIds = await components();
      const layoutPath = join(root, '.tau/workbench/layout.json');
      await expect
        .poll(async () => readFile(layoutPath, 'utf8').catch(() => undefined), { timeout: 60_000 })
        .toBeDefined();
      const layout = JSON.parse(await readFile(layoutPath, 'utf8')) as { viewer: { tabs: Array<{ view: string }> } };
      const viewId = layout.viewer.tabs[0]!.view;
      const view = {
        version: 1,
        entryPath: 'public/models/honeycomb.js',
        camera: { kind: 'look', direction: [1, 0, 0] },
        grid: { unit: 'in' },
        section: { active: true, cuts: [{ kind: 'plane', plane: 'xy', offset: 0.012, isFlipped: false }] },
      };
      const entries = {
        version: 1,
        entries: {
          'public/models/honeycomb.js': {
            renderTimeout: 0,
            components: { isolated: [componentIds[0]], opacity: [{ id: componentIds[0], opacity: 0.25 }] },
          },
        },
      };
      const preferences = { selectedFormats: ['stl'], shouldDownload: false, shouldSaveToProject: true };
      await page.evaluate(installRetainedControls, 'Tau candidate retained native manual');
      const identity = await page.evaluate(() => ({
        href: location.href,
        timeOrigin: performance.timeOrigin,
        title: document.title,
      }));
      const sourceSha256 = createHash('sha256')
        .update(await readFile(resolve(import.meta.dirname, '../../ui/app/workbench-records/view-store.ts')))
        .digest('hex');
      const executable = session.application.process();
      const launcher = {
        pid: executable.pid,
        executable: executable.spawnfile,
        argv: executable.spawnargs,
        visible: true,
      };
      const initialHashes = await nativeFixtureFiles(root);
      return {
        session,
        root,
        componentIds,
        viewId,
        view,
        entries,
        preferences,
        identity,
        sourceSha256,
        launcher,
        initialHashes,
      };
    } catch (error) {
      await session.close();
      throw error;
    }
  };
  let fixture: Awaited<ReturnType<typeof prepare>> | undefined;
  test.beforeEach(async () => {
    fixture = await prepare();
  });
  test('manual retained native workbench view entries converter window', async () => {
    if (!fixture) {
      throw new Error('Native retained manual setup did not finish.');
    }
    const { session, root, identity, sourceSha256, launcher, initialHashes } = fixture;
    const { page } = session;
    const output = resolve(
      process.env['TAU_E2E_PROJECTION_ARTIFACT_ROOT'] ??
        'out/research/filesystem-projection-performance-charter/2026-10-08-live-delivery/host-replay/retained-native-manual',
    );
    await mkdir(output, { recursive: true });
    const readyAt = Date.now();
    const receipt = {
      root,
      componentIds: fixture.componentIds,
      viewId: fixture.viewId,
      identity,
      sourceSha256,
      launcher,
      readyAt,
      operatorDeadline: readyAt + 300_000,
      instructions:
        'Principal owns all product gestures including actual conversion/export; checkpoint captures changed saved output bytes/hashes. Named controls perform only independent OS writes/capture. End or five-minute operator deadline closes the visible native fixture.',
    };
    try {
      await writeFile(join(output, 'handoff.json'), JSON.stringify(receipt, null, 2));
      console.info('Retained native manual ready', JSON.stringify(receipt));
      while (Date.now() < readyAt + 300_000) {
        // oxlint-disable-next-line no-await-in-loop -- Poll only explicit fixture operator flags, never product state.
        const flags = await page.evaluate(readRetainedFlags);
        for (const kind of flags.writes) {
          const path =
            kind === 'view'
              ? `.tau/workbench/views/${fixture.viewId}.json`
              : kind === 'entries'
                ? '.tau/workbench/entries.json'
                : '.tau/export/preferences.json';
          const value = kind === 'view' ? fixture.view : kind === 'entries' ? fixture.entries : fixture.preferences;
          // oxlint-disable-next-line no-await-in-loop -- Prepare only the explicitly requested independent native mutation path.
          await mkdir(join(root, path, '..'), { recursive: true });
          // oxlint-disable-next-line no-await-in-loop -- The Principal's named fixture control is the only mutation trigger.
          await writeFile(join(root, path), JSON.stringify(value));
          // oxlint-disable-next-line no-await-in-loop -- Reacquire exact physical bytes for the native writer receipt.
          const bytes = await readFile(join(root, path));
          // oxlint-disable-next-line no-await-in-loop -- Persist each requested physical mutation receipt immediately.
          await writeFile(
            join(output, `write-${kind}-${Date.now()}.json`),
            JSON.stringify(
              { identity, sourceSha256, root, path, value, sha256: createHash('sha256').update(bytes).digest('hex') },
              null,
              2,
            ),
          );
        }
        for (const name of flags.checkpoints) {
          const artifactName = `${Date.now()}-${name.replaceAll(/[^a-zA-Z0-9._-]+/gu, '-')}.png`;
          // oxlint-disable-next-line no-await-in-loop -- Capture only the requested Principal checkpoint without product gestures.
          const bytes = await page.screenshot({
            path: join(output, artifactName),
            fullPage: true,
            animations: 'disabled',
          });
          // oxlint-disable-next-line no-await-in-loop -- Observe actual saved outputs only on the requested checkpoint.
          const currentHashes = await nativeFixtureFiles(root);
          const outputs = Object.keys(currentHashes).filter(
            (path) =>
              /\.(?:stl|step|stp|3mf|obj|glb|gltf|usdz|ply|svg|dxf)$/iu.test(path) &&
              initialHashes[path] !== currentHashes[path],
          );
          for (const path of outputs) {
            const destination = join(output, 'saved-output', artifactName, path);
            // oxlint-disable-next-line no-await-in-loop -- Preserve the actual operator-generated binary output.
            await mkdir(join(destination, '..'), { recursive: true });
            // oxlint-disable-next-line no-await-in-loop -- Copy only; never invoke converter/export from the driver.
            await cp(join(root, path), destination);
          }
          // oxlint-disable-next-line no-await-in-loop -- Save exact screenshot/source/root receipt while the operator session is live.
          await writeFile(
            join(output, artifactName.replace(/\.png$/u, '.json')),
            JSON.stringify(
              {
                identity,
                sourceSha256,
                root,
                launcher,
                name,
                artifactName,
                outputs,
                currentHashes,
                capturedAt: Date.now(),
                screenshotSha256: createHash('sha256').update(bytes).digest('hex'),
              },
              null,
              2,
            ),
          );
        }
        if (flags.end) {
          break;
        }
        // oxlint-disable-next-line no-await-in-loop -- Bounded fixture-only operator cadence; no product data refresh.
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 100);
        });
      }
      expect(
        await page.evaluate(() => ({ href: location.href, timeOrigin: performance.timeOrigin, title: document.title })),
      ).toEqual(identity);
    } finally {
      await session.close();
    }
  });
});

test.describe.skipIf(process.env['TAU_E2E_REVISIONS_MANUAL'] !== 'true')(
  'production revisions native manual fixture',
  () => {
    const prepare = async () => {
      const account = tauTestAccount('filesystem-native-revisions-manual');
      const token = await seedTauTestUser(account);
      const gateway = await startGatewayFixture({
        toolCalls: (turn) => [
          {
            name: 'create_file',
            input: {
              targetFile: 'main.scad',
              content: `${gatewayFixtureScadSource.replace('cube_size = 20;', `cube_size = ${20 + turn * 5};`)}\n// revision turn ${turn}\n`,
            },
          },
          { name: 'evaluate_model', input: { targetFile: 'main.scad' } },
        ],
      });
      const session = await launchDesktopApp({ token, visible: true, windowTitle: 'Tau candidate revisions manual' });
      try {
        const { page } = session;
        await gateway.routeThrough(page);
        await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
        if (desktopE2ECompletedArtifact) {
          await authenticatePackagedDesktop(session, token);
        }
        await expectSignedIn(page);
        await selectKernel(page, 'OpenSCAD');
        await selectChatModel(page, gatewayFixtureModelName);
        const slug = await submitPrompt(page, 'Build the first actual revision.');
        await expect.poll(() => gateway.gatewayRequests.length, { timeout: 120_000 }).toBeGreaterThanOrEqual(3);
        await expectCount(stopButtonOf(page), 0, 120_000);
        const before = gateway.gatewayRequests.length;
        await submitPrompt(page, 'Build a changed second revision.');
        await expect
          .poll(() => gateway.gatewayRequests.length, { timeout: 120_000 })
          .toBeGreaterThanOrEqual(before + 3);
        await expectCount(stopButtonOf(page), 0, 120_000);
        expect(failedGatewayToolResults(gateway.gatewayRequests)).toEqual([]);
        await expectVisible(page.getByRole('button', { name: /^Open Revisions\..*Rev [2-9]/u }), 120_000);
        const root = join(session.homeRoot, slug);
        const hashes = await nativeFixtureFiles(root);
        expect(Object.keys(hashes).some((path) => path.startsWith('.git/'))).toBe(true);
        await page.evaluate(installRetainedControls, 'Tau candidate native revisions restore comparison manual');
        await page.evaluate(() => {
          for (const button of document.querySelectorAll('button')) {
            if (button.textContent.startsWith('Apply independent ')) {
              button.remove();
            }
          }
        });
        const identity = await page.evaluate(() => ({
          href: location.href,
          timeOrigin: performance.timeOrigin,
          title: document.title,
        }));
        return { session, account, gateway, root, hashes, identity };
      } catch (error) {
        await session.close();
        await gateway.close();
        await deleteTauTestUser(account.email);
        throw error;
      }
    };
    let fixture: Awaited<ReturnType<typeof prepare>> | undefined;
    test.beforeEach(async () => {
      fixture = await prepare();
    });
    test('manual native production revisions restore comparison sidebar window', async () => {
      if (!fixture) {
        throw new Error('Native revision preparation did not finish.');
      }
      const { session, root, hashes, identity, gateway, account } = fixture;
      const { page } = session;
      const output = resolve(
        process.env['TAU_E2E_PROJECTION_ARTIFACT_ROOT'] ??
          'out/research/filesystem-projection-performance-charter/2026-10-08-live-delivery/host-replay/native-revisions-manual',
      );
      await mkdir(output, { recursive: true });
      const checkpoints = new Set<string>();
      let observedExportBytes = 0;
      const requireCheckpoints = process.env['TAU_E2E_REVISIONS_ACCEPTANCE'] === 'true';
      const downloads: Array<Promise<void>> = [];
      page.on('download', (download) => {
        downloads.push(
          (async () => {
            const name = `${Date.now()}-${download.suggestedFilename().replaceAll(/[^a-zA-Z0-9._-]+/gu, '-')}`;
            await download.saveAs(join(output, name));
            const bytes = await readFile(join(output, name));
            observedExportBytes += bytes.length;
            await writeFile(
              join(output, `${name}.json`),
              JSON.stringify({
                identity,
                root,
                suggestedFilename: download.suggestedFilename(),
                bytes: bytes.length,
                sha256: createHash('sha256').update(bytes).digest('hex'),
              }),
            );
          })(),
        );
      });
      const readyAt = Date.now();
      const child = session.application.process();
      const sourceSha256 = createHash('sha256')
        .update(await readFile(import.meta.filename))
        .digest('hex');
      const receipt = {
        sourceSha256,
        identity,
        root,
        hashes,
        readyAt,
        operatorDeadline: readyAt + 300_000,
        launcher: { pid: child.pid, executable: child.spawnfile, argv: child.spawnargs, visible: true },
        instructions:
          'Principal alone performs revision/history/restore/comparison/sidebar and actual converter/export gestures. Only Capture checkpoint and End are active. Actual downloads are saved passively with exact byte hashes; checkpoints save changed rooted output bytes.',
      };
      try {
        await writeFile(join(output, 'handoff.json'), JSON.stringify(receipt, null, 2));
        console.info('Production revisions native manual ready', JSON.stringify(receipt));
        while (Date.now() < readyAt + 300_000) {
          // oxlint-disable-next-line no-await-in-loop -- Only explicit fixture flags are polled after READY.
          const flags = await page.evaluate(readRetainedFlags);
          for (const name of flags.checkpoints) {
            checkpoints.add(name);
            const prefix = `${Date.now()}-${name.replaceAll(/[^a-zA-Z0-9._-]+/gu, '-')}`;
            // oxlint-disable-next-line no-await-in-loop -- Capture only the requested Principal checkpoint.
            const png = await page.screenshot({
              path: join(output, `${prefix}.png`),
              fullPage: true,
              animations: 'disabled',
            });
            // oxlint-disable-next-line no-await-in-loop -- Reacquire actual rooted file hashes on explicit checkpoint.
            const current = await nativeFixtureFiles(root);
            const outputs = Object.keys(current).filter(
              (path) =>
                /\.(?:stl|step|stp|3mf|obj|glb|gltf|usdz|ply|svg|dxf)$/iu.test(path) && hashes[path] !== current[path],
            );
            for (const path of outputs) {
              const destination = join(output, 'saved-output', prefix, path);
              // oxlint-disable-next-line no-await-in-loop -- Preserve exact operator-created output binary bytes.
              await mkdir(join(destination, '..'), { recursive: true });
              // oxlint-disable-next-line no-await-in-loop -- No converter invocation; copy only actual generated files.
              await cp(join(root, path), destination);
            }
            // oxlint-disable-next-line no-await-in-loop -- Observe only the Principal-selected revision presentation.
            const presentation = await page.evaluate(() => ({
              chatId: new URL(location.href).searchParams.get('chat'),
              revisionControls: [...document.querySelectorAll('button')]
                .filter((node) =>
                  /revision|restore|compare|comparison|read.only/iu.test(
                    node.textContent + (node.getAttribute('aria-label') ?? ''),
                  ),
                )
                .slice(0, 32)
                .map((node) => ({
                  text: node.textContent,
                  label: node.getAttribute('aria-label'),
                  disabled: node.disabled,
                })),
              readonly: document.querySelectorAll('[readonly], [aria-readonly="true"]').length,
              canvases: [...document.querySelectorAll('canvas')].map((node) => ({
                width: node.width,
                height: node.height,
              })),
            }));
            for (const path of outputs) {
              // oxlint-disable-next-line no-await-in-loop -- Count only actual Principal-created saved output bytes.
              const bytes = await readFile(join(root, path));
              observedExportBytes += bytes.length;
            }
            // oxlint-disable-next-line no-await-in-loop -- Durable receipt binds output hashes to the actual document/root.
            await writeFile(
              join(output, `${prefix}.json`),
              JSON.stringify({
                receipt,
                name,
                current,
                outputs,
                presentation,
                observedExportBytes,
                screenshotSha256: createHash('sha256').update(png).digest('hex'),
              }),
            );
          }
          if (flags.end) {
            break;
          }
          // oxlint-disable-next-line no-await-in-loop -- Bounded fixture-only operator cadence.
          await new Promise<void>((resolve) => {
            setTimeout(resolve, 100);
          });
        }
        await Promise.all(downloads);
        if (requireCheckpoints) {
          for (const name of ['restore', 'comparison', 'export']) {
            expect(checkpoints.has(name)).toBe(true);
          }
          expect(observedExportBytes).toBeGreaterThan(0);
        }
        expect(
          await page.evaluate(() => ({
            href: location.href,
            timeOrigin: performance.timeOrigin,
            title: document.title,
          })),
        ).toEqual(identity);
      } finally {
        await session.close();
        await gateway.close();
        await deleteTauTestUser(account.email);
      }
    });
  },
);
