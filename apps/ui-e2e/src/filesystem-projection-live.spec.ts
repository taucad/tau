import { base64ToUint8Array } from 'uint8array-extras';
import { agentLogEventSchema } from '@taucad/agent-host';
import type { ProjectionBenchmarkFixture } from '#support/filesystem-projection.js';
import { decodeProjectionFile } from '#support/filesystem-projection-writer.js';
import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import {
  chatLog,
  continueAction,
  editFirstMessage,
  expectLogInvariant,
  openChat,
  reply,
  switchToChat,
} from '#support/chat-admission.js';
import { sendDraft } from '#support/chat-attachments.js';
import {
  captureProjectionTurn,
  exportProjectionProjectClosure,
  importProjectionProjectClosure,
  armProjectionGestureMeasurement,
  projectionGestureMeasurement,
  createProjectionHistory,
  createProjectionBenchmarkFixture,
  holdProjectionDelivery,
  installProjectionDeliveryControl,
  projectionDeliveryEvidence,
  probeProjectionUnrelatedRead,
  projectionLog,
  projectionProject,
  replaceProjectionLog,
  restoreProjectionDelivery,
} from '#support/filesystem-projection.js';

test('renders distinct held current-turn chunks and qualifies actual delivery without navigation', async () => {
  await installProjectionDeliveryControl();
  const [chatId] = await openChat([
    reply('', {
      reasoningChunks: ['Projection reasoning alpha.', ' Projection reasoning beta.'],
      textChunks: ['Projection prose alpha.', ' Projection prose beta.', ' Projection prose gamma.'],
      gateChunks: true,
    }),
  ]);
  expect(chatId).toBeDefined();
  const project = await projectionProject();
  expect(['opfs', 'indexeddb']).toContain(project.backend);
  const identity = await target.evaluate(() => {
    const documentIdentity = crypto.randomUUID();
    document.documentElement.dataset['projectionIdentity'] = documentIdentity;
    return { documentIdentity, href: location.href, timeOrigin: performance.timeOrigin };
  });

  await sendDraft('Verify the current projection.');
  await target.waitForAgentHostGatewayGate({ kind: 'stream' });
  try {
    await target.expectVisible(selectors.getByText('Projection reasoning alpha.', { exact: true }), 30_000);
  } catch (error) {
    const diagnostics = await target.commands.uiCaptureTargetDiagnostics();
    await target.writeArtifact(
      'projection-initial-held-failure.json',
      JSON.stringify(
        {
          diagnostics: { ...diagnostics, screenshot: undefined },
          dom: await target.evaluate(() => ({ text: document.body.textContent, html: document.body.innerHTML })),
          liveness: await target.evaluate(() => {
            const globals = globalThis as typeof globalThis &
              Partial<Record<'__TAU_CHAT_SESSION_LIVENESS__', () => unknown>>;
            return globals.__TAU_CHAT_SESSION_LIVENESS__?.();
          }),
          physicalLog: await projectionLog(chatId!),
          delivery: await projectionDeliveryEvidence(),
          requests: await target.readAgentHostGatewayRequests(),
        },
        null,
        2,
      ),
    );
    await target.screenshot(undefined, 'projection-initial-held-failure.png');
    throw error;
  }
  const runId = await captureProjectionTurn(chatId!, 'Verify the current projection.');
  const turn = selectors.getByCss(`[data-projection-turn="${runId}"]`);
  await target.releaseAgentHostGatewayFixture();
  await target.waitForAgentHostGatewayGate({ kind: 'stream' });
  await target.expectVisible(turn.getByText(/Projection reasoning alpha\. Projection reasoning beta\./u), 30_000);
  await target.releaseAgentHostGatewayFixture();
  await target.waitForAgentHostGatewayGate({ kind: 'stream' });
  await target.expectVisible(turn.getByText('Projection prose alpha.', { exact: true }), 30_000);

  await target.releaseAgentHostGatewayFixture();
  await target.waitForAgentHostGatewayGate({ kind: 'stream' });
  await target.expectVisible(turn.getByText(/Projection prose alpha\. Projection prose beta\./u), 30_000);
  const sourceBefore = await projectionLog(chatId!);
  const deliveryBefore = await projectionDeliveryEvidence();
  await holdProjectionDelivery(chatId!);
  try {
    const unrelated = await probeProjectionUnrelatedRead();
    expect(unrelated.status).toBe('refused');
    expect(unrelated.chatId).not.toBe(chatId);
    await target.writeArtifact('projection-unrelated-read-receipt.json', JSON.stringify(unrelated));
    await target.releaseAgentHostGatewayFixture();
    await target.waitForAgentHostGatewayGate({ kind: 'stream' });
    await expect
      .poll(
        async () => {
          const evidence = await projectionDeliveryEvidence();
          return evidence.held;
        },
        { timeout: 30_000 },
      )
      .toBeGreaterThan(0);
    await target.releaseAgentHostGatewayFixture();
    await expect.poll(async () => projectionLog(chatId!), { timeout: 30_000 }).not.toBe(sourceBefore);
    // The provider and command channel advanced while actual read/live delivery was held.
    expect(await target.readAgentHostGatewayRequests()).toHaveLength(1);
    await target.expectCount(turn.getByText(/Projection prose gamma\./u), 0);
    const held = await projectionDeliveryEvidence();
    expect(held.chats).toEqual([chatId]);
    expect(held.ports.length).toBeGreaterThan(0);
    expect(held.frames).toHaveLength(held.held);
    expect(held.frames.every((frame) => frame.chatId === chatId && frame.id.length > 0)).toBe(true);
    await expect
      .poll(
        async () => {
          const evidence = await projectionDeliveryEvidence();
          return evidence.keepalives;
        },
        { timeout: 30_000 },
      )
      .toBeGreaterThan(deliveryBefore.keepalives);
    const currentDelivery = await projectionDeliveryEvidence();
    expect(currentDelivery.unrelatedResponses).toBeGreaterThan(0);
  } finally {
    await restoreProjectionDelivery();
  }
  const restored = await projectionDeliveryEvidence();
  expect(restored.restored).toBe(restored.held);
  await target.expectVisible(
    turn.getByText(/Projection prose alpha\. Projection prose beta\. Projection prose gamma\./u),
    30_000,
  );
  await target.expectCount(selectors.getByCss('button:has(svg.lucide-square)'), 0, 30_000);
  expect(
    await target.evaluate(() => ({
      documentIdentity: document.documentElement.dataset['projectionIdentity'],
      href: location.href,
      timeOrigin: performance.timeOrigin,
    })),
  ).toEqual(identity);
});

test('replays physical nonwriter replacement in order and rewinds the admitted chat through its real gesture', async () => {
  const scrollHistoryToStart = async (): Promise<void> => {
    await target.evaluate(() => {
      const scroller = document.querySelector<HTMLElement>('[role="region"][aria-label="Chat history"]');
      if (!scroller) {
        throw new Error('The actual chat history scroller must be mounted.');
      }
      scroller.scrollTop = 0;
      scroller.dispatchEvent(new Event('scroll'));
    });
  };
  const [ownedChat, externalChat] = await openChat(
    [
      reply('Source original alpha.'),
      reply('Source appended beta.'),
      reply('Source retained tail.'),
      reply('Source rewritten gamma.'),
    ],
    '?chats=2',
  );
  expect(ownedChat).toBeDefined();
  expect(externalChat).toBeDefined();
  const currentProject = await projectionProject();
  expect(['opfs', 'indexeddb']).toContain(currentProject.backend);
  await sendDraft('First plain message.');
  await target.expectVisible(selectors.getByText('Source original alpha.', { exact: true }), 30_000);
  await expectLogInvariant(ownedChat!, { runs: 1, settlements: ['turn.finalized'] });
  const prefix = await projectionLog(ownedChat!);
  await sendDraft('Second plain message.');
  await target.expectVisible(selectors.getByText('Source appended beta.', { exact: true }), 30_000);
  await expectLogInvariant(ownedChat!, { runs: 2, settlements: ['turn.finalized', 'turn.finalized'] });
  const appended = await projectionLog(ownedChat!);
  expect(appended.startsWith(prefix)).toBe(true);
  await sendDraft('Third plain message.');
  await target.expectVisible(selectors.getByText('Source retained tail.', { exact: true }), 30_000);
  await expectLogInvariant(ownedChat!, {
    runs: 3,
    settlements: ['turn.finalized', 'turn.finalized', 'turn.finalized'],
  });
  const threeTurns = await projectionLog(ownedChat!);
  expect(threeTurns.startsWith(appended)).toBe(true);
  await switchToChat('Second chat');
  const identity = await target.evaluate(() => ({ href: location.href, timeOrigin: performance.timeOrigin }));
  const receipt = await replaceProjectionLog(externalChat!, prefix);
  expect(receipt.events).toContain('fileWritten');
  expect(receipt.storageRootKey).toBeTruthy();
  await target.expectVisible(selectors.getByText('Source original alpha.', { exact: true }), 30_000);
  await replaceProjectionLog(externalChat!, appended);
  await target.expectVisible(selectors.getByText('Source appended beta.', { exact: true }), 30_000);
  await scrollHistoryToStart();
  await target.expectVisible(selectors.getByText('Source original alpha.', { exact: true }), 30_000);
  const replaced = appended.replaceAll('Source original alpha.', 'Source original omega.');
  expect(new TextEncoder().encode(replaced).byteLength).toBe(new TextEncoder().encode(appended).byteLength);
  // The final row and its cursor key stay identical while an earlier visible row changes.
  expect(replaced.trimEnd().split('\n').at(-1)).toBe(appended.trimEnd().split('\n').at(-1));
  await replaceProjectionLog(externalChat!, replaced);
  expect(await projectionLog(externalChat!)).toBe(replaced);
  try {
    await target.expectVisible(selectors.getByText('Source original omega.', { exact: true }), 30_000);
  } catch (error) {
    const diagnostics = await target.commands.uiCaptureTargetDiagnostics();
    await target.writeArtifact(
      'projection-physical-replacement-failure.json',
      JSON.stringify(
        {
          diagnostics: { ...diagnostics, screenshot: undefined },
          physicalLog: await projectionLog(externalChat!),
          expectedLog: replaced,
          dom: await target.evaluate(() => ({ text: document.body.textContent, html: document.body.innerHTML })),
        },
        null,
        2,
      ),
    );
    await target.screenshot(undefined, 'projection-physical-replacement-failure.png');
    throw error;
  }
  await target.expectCount(selectors.getByText('Source original alpha.', { exact: true }), 0);
  await target.expectCount(selectors.getByText('Source appended beta.', { exact: true }), 1);
  await replaceProjectionLog(externalChat!);
  await expect.poll(async () => projectionLog(externalChat!), { timeout: 30_000 }).toBe('');
  await replaceProjectionLog(externalChat!, appended);
  await target.expectVisible(selectors.getByText('Source appended beta.', { exact: true }), 30_000);
  await scrollHistoryToStart();
  await target.expectVisible(selectors.getByText('Source original alpha.', { exact: true }), 30_000);
  await target.expectCount(selectors.getByText('Source original omega.', { exact: true }), 0);
  await replaceProjectionLog(externalChat!, threeTurns);
  await target.expectVisible(selectors.getByText('Source retained tail.', { exact: true }), 30_000);
  await scrollHistoryToStart();
  await target.expectVisible(selectors.getByText('First plain message.', { exact: true }), 30_000);
  await target.expectVisible(selectors.getByText('Source appended beta.', { exact: true }), 30_000);
  await target.expectVisible(selectors.getByText('Source retained tail.', { exact: true }), 30_000);
  const edges = await target.evaluate(() => {
    const paragraphs = [...document.querySelectorAll('article p')];
    const first = paragraphs.find((node) => node.textContent.trim() === 'First plain message.')?.closest('article');
    const tail = paragraphs.find((node) => node.textContent.trim() === 'Source retained tail.')?.closest('article');
    if (!first || !tail) {
      throw new Error('The first user and retained tail must both be mounted.');
    }
    first.dataset['projectionEdge'] = 'first';
    tail.dataset['projectionEdge'] = 'tail';
    return { count: document.querySelectorAll('article').length, first: first.textContent, tail: tail.textContent };
  });
  const rows = threeTurns
    .trimEnd()
    .split('\n')
    .map((line) => agentLogEventSchema.parse(JSON.parse(line)));
  const admissions = rows.filter((row) => row.type === 'run.lifecycle' && row.state === 'admitted');
  const middleRun = admissions[1];
  const lastRow = rows.at(-1);
  const middleAssistant = rows.findLast(
    (row) => row.type === 'message.appended' && row.runId === middleRun?.runId && row.message.role === 'assistant',
  );
  if (
    !lastRow ||
    !middleRun ||
    middleAssistant?.type !== 'message.appended' ||
    middleAssistant.message.role !== 'assistant'
  ) {
    throw new Error('The completed physical source must contain the middle assistant envelope.');
  }
  const correction = agentLogEventSchema.parse({
    version: lastRow.version,
    leaderEpoch: lastRow.leaderEpoch,
    sequence: lastRow.sequence + 1,
    recordedAt: new Date().toISOString(),
    runId: middleAssistant.runId,
    ...(middleAssistant.epoch === undefined ? {} : { epoch: middleAssistant.epoch }),
    ...(middleAssistant.commandId === undefined ? {} : { commandId: middleAssistant.commandId }),
    ...(middleAssistant.attempt === undefined ? {} : { attempt: middleAssistant.attempt }),
    type: 'message.envelope-replaced',
    messageId: middleAssistant.message.id,
    replacement: { ...middleAssistant.message, content: 'Source corrected middle.' },
  });
  const corrected = `${threeTurns.trimEnd()}\n${JSON.stringify(correction)}\n`;
  expect(corrected.startsWith(threeTurns)).toBe(true);
  await replaceProjectionLog(externalChat!, corrected);
  await expect.poll(async () => projectionLog(externalChat!), { timeout: 30_000 }).toBe(corrected);
  await target.expectVisible(selectors.getByText('Source corrected middle.', { exact: true }), 30_000);
  await target.expectCount(selectors.getByText('Source appended beta.', { exact: true }), 0);
  await target.expectCount(selectors.getByText('Source retained tail.', { exact: true }), 1);
  expect(
    await target.evaluate(() => ({
      count: document.querySelectorAll('article').length,
      first: document.querySelector('[data-projection-edge="first"]')?.textContent,
      tail: document.querySelector('[data-projection-edge="tail"]')?.textContent,
    })),
  ).toEqual(edges);
  expect(await target.evaluate(() => ({ href: location.href, timeOrigin: performance.timeOrigin }))).toEqual(identity);

  await switchToChat('Attachments chat');
  await target.expectVisible(selectors.getByText('Source retained tail.', { exact: true }), 30_000);
  await scrollHistoryToStart();
  await target.expectVisible(selectors.getByText('First plain message.', { exact: true }), 30_000);
  await editFirstMessage(' Edited.');
  await target.expectVisible(selectors.getByText('Source rewritten gamma.', { exact: true }), 30_000);
  await expectLogInvariant(ownedChat!, {
    runs: 4,
    settlements: ['turn.finalized', 'turn.finalized', 'turn.finalized', 'turn.finalized'],
  });
  const rewoundSource = await projectionLog(ownedChat!);
  const rewound = rewoundSource
    .split('\n')
    .filter(Boolean)
    .map((line) => agentLogEventSchema.parse(JSON.parse(line)));
  expect(rewound.filter((row) => row.type === 'history.rewound')).toHaveLength(1);
  await target.expectCount(selectors.getByText('Source original alpha.', { exact: true }), 0);
  await target.expectCount(selectors.getByText('Source appended beta.', { exact: true }), 0);
  await target.expectCount(selectors.getByText('Source retained tail.', { exact: true }), 0);
  await target.expectCount(selectors.getByText('Source rewritten gamma.', { exact: true }), 1);
});

test('diagnoses actual 1000 turn cold projection, warm switch and held stream before the full sample matrix', async () => {
  await installProjectionDeliveryControl();
  const [templateChat, historyChat] = await openChat(
    [
      reply('Canonical projection benchmark answer.'),
      reply('', { textChunks: ['Diagnostic stream alpha.', ' Diagnostic stream beta.'], gateChunks: true }),
    ],
    '?chats=2',
  );
  expect(templateChat).toBeDefined();
  expect(historyChat).toBeDefined();
  await sendDraft('Canonical projection benchmark prompt.');
  await expectLogInvariant(templateChat!, { runs: 1, settlements: ['turn.finalized'] });
  const fixture = createProjectionHistory(await projectionLog(templateChat!), 1000);
  const fixtureDigest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fixture.text));
  await target.writeArtifact(
    'projection-diagnostic-1000-transfer-size.json',
    JSON.stringify({
      turns: fixture.turns,
      rows: fixture.rows,
      rawJsonlBytes: fixture.bytes,
      serializedJsonStringBytes: new TextEncoder().encode(JSON.stringify(fixture.text)).length,
      sha256: [...new Uint8Array(fixtureDigest)].map((byte) => byte.toString(16).padStart(2, '0')).join(''),
      chunkBytes: 65_536,
    }),
  );
  await target.writeArtifact('projection-diagnostic-1000-events.jsonl', fixture.text);
  const producerClosure = await exportProjectionProjectClosure(await projectionProject());
  await target.writeArtifact(
    'projection-diagnostic-1000-closure.json',
    JSON.stringify(await createProjectionBenchmarkFixture(producerClosure, templateChat!, fixture)),
  );
  await replaceProjectionLog(historyChat!, fixture.text);
  const start = await target.evaluate(() => performance.now());
  await switchToChat('Second chat');
  try {
    await target.expectVisible(selectors.getByText(/Fixture turn 1000 of 1000\./u));
  } catch (error) {
    await target.writeArtifact(
      'projection-diagnostic-1000-open-failure.json',
      JSON.stringify(
        {
          elapsed: (await target.evaluate(() => performance.now())) - start,
          dom: await target.evaluate(() => ({
            href: location.href,
            text: document.body.textContent.slice(-12_000),
            articles: document.querySelectorAll('article').length,
          })),
          liveness: await target.evaluate(() => {
            const globals = globalThis as typeof globalThis &
              Partial<Record<'__TAU_CHAT_SESSION_LIVENESS__', () => unknown>>;
            return globals.__TAU_CHAT_SESSION_LIVENESS__?.();
          }),
          delivery: await projectionDeliveryEvidence(),
          fixture: { turns: fixture.turns, rows: fixture.rows, bytes: fixture.bytes },
        },
        null,
        2,
      ),
    );
    await target.screenshot(undefined, 'projection-diagnostic-1000-open-failure.png');
    throw error;
  }
  const renderedTurns = await target.evaluate(() =>
    [...document.querySelectorAll('article [role="button"] p')].flatMap((node) => {
      const match = /Fixture turn (\d+) of 1000\./u.exec(node.textContent);
      return match ? [Number(match[1])] : [];
    }),
  );
  expect(renderedTurns.length).toBeGreaterThan(0);
  expect(renderedTurns).toEqual([...new Set(renderedTurns)].sort((left, right) => left - right));
  expect(renderedTurns).toContain(1000);
  /** Milliseconds. */
  const coldEnd = await target.evaluate(() => performance.now());
  const coldProjection = coldEnd - start;
  const appColdStart = Date.now();
  await target.reload();
  await target.expectVisible(selectors.getByText(/Fixture turn 1000 of 1000\./u));
  /** Milliseconds. */
  const appColdOpen = Date.now() - appColdStart;
  await switchToChat('Attachments chat');
  await armProjectionGestureMeasurement('diagnostic1000-warm', 'Second chat', 'Fixture turn 1000 of 1000.');
  const warmStart = await target.evaluate(() => performance.now());
  await switchToChat('Second chat');
  await target.expectVisible(selectors.getByText(/Fixture turn 1000 of 1000\./u));
  /** Milliseconds. */
  const warmEnd = await target.evaluate(() => performance.now());
  const warmSwitch = warmEnd - warmStart;
  await expect
    .poll(async () => {
      const evidence = await projectionGestureMeasurement();
      return evidence?.duration;
    })
    .toBeDefined();
  const browserWarm = await projectionGestureMeasurement();
  expect(browserWarm?.trusted).toBe(true);
  await target.writeArtifact(
    'projection-diagnostic-1000-prestream.json',
    JSON.stringify(
      {
        diagnosticOnly: true,
        turns: fixture.turns,
        rows: fixture.rows,
        bytes: fixture.bytes,
        messages: fixture.messages,
        renderedTurns,
        coldProjection,
        firstSelectionQualification: 'same-project sidebar may prewarm; not cold source acquisition',
        appColdOpen,
        warmSwitch,
        browserWarm,
        streamQualified: false,
      },
      null,
      2,
    ),
  );
  const admissionStart = await target.evaluate(() => performance.now());
  await sendDraft('Diagnostic live admission after 1000 historical turns.');
  await target.waitForAgentHostGatewayGate({ kind: 'stream' });
  await target.expectVisible(selectors.getByText('Diagnostic stream alpha.', { exact: true }));
  /** Milliseconds. */
  const admissionFirstChunk = (await target.evaluate(() => performance.now())) - admissionStart;
  const tokenStart = await target.evaluate(() => performance.now());
  await target.releaseAgentHostGatewayFixture();
  await target.waitForAgentHostGatewayGate({ kind: 'stream' });
  await target.expectVisible(selectors.getByText(/Diagnostic stream alpha\. Diagnostic stream beta\./u));
  /** Milliseconds. */
  const heldToken = (await target.evaluate(() => performance.now())) - tokenStart;
  await target.releaseAgentHostGatewayFixture();
  await target.expectCount(selectors.getByCss('button:has(svg.lucide-square)'), 0);
  await target.writeArtifact(
    'projection-diagnostic-1000.json',
    JSON.stringify(
      {
        diagnosticOnly: true,
        coldMeaning:
          'coldProjection is same-project first selection, potentially sidebar-prewarmed; appColdOpen is a new document reload with persistent source and browser disk cache retained.',
        turns: fixture.turns,
        rows: fixture.rows,
        bytes: fixture.bytes,
        messages: fixture.messages,
        renderedTurns,
        coldProjection,
        firstSelectionQualification:
          'same-project inactive chats may be prewarmed by project-chat-list observe; not a cold source acquisition',
        appColdOpen,
        warmSwitch,
        browserWarm,
        timingMetadata: {
          warmSwitch: 'harness-inclusive diagnostic only',
          browserWarm:
            'actual captured native click to two animation frames after uniquely matching render mutation; excludes fixture round trips',
        },
        admissionFirstChunk,
        heldToken,
      },
      null,
      2,
    ),
  );
});

test('retains historical renderer node identity and user scroll through a genuine held Resume', async () => {
  await installProjectionDeliveryControl();
  const prefix =
    'Retained prefix anchor.\n\n' +
    Array.from({ length: 80 }, (_, index) => `Retained paragraph ${index + 1}.`).join('\n\n');
  const [chatId] = await openChat([
    reply(prefix, { gated: true, toolCalls: [{ name: 'list_directory', args: {} }] }),
    reply('', { textChunks: ['Resumed distinct alpha.', ' Resumed distinct beta.'], gateChunks: true }),
  ]);
  expect(chatId).toBeDefined();
  await sendDraft('Keep the retained prefix through Resume.');
  await target.waitForAgentHostGatewayGate({ kind: 'stream' });
  await target.expectVisible(selectors.getByText('Retained prefix anchor.', { exact: true }));
  const runId = await captureProjectionTurn(chatId!, 'Keep the retained prefix through Resume.');
  await target.setAgentHostGatewayFailure({
    status: 400,
    message: 'Refused continuation after retained prose.',
    type: 'INVALID_REQUEST',
  });
  await target.releaseAgentHostGatewayFixture();
  await target.expectVisible(continueAction);
  const failedLog = await chatLog(chatId!);
  const failedLifecycle = failedLog.find(
    (row) => row.type === 'run.lifecycle' && row.runId === runId && row.state === 'failed',
  );
  expect(failedLifecycle).toBeDefined();
  expect(failedLifecycle).toHaveProperty('detail.code', 'INVALID_REQUEST');
  expect(failedLifecycle).toHaveProperty('detail.status', 400);
  await target.setAgentHostGatewayFailure();
  const identity = await target.evaluate(
    ({ runId }) => {
      const turn = document.querySelector(`[data-projection-turn="${runId}"]`);
      const node = [...(turn?.querySelectorAll('p') ?? [])].find(
        (candidate) => candidate.textContent === 'Retained prefix anchor.',
      );
      if (!node) {
        throw new Error('The actual retained paragraph did not mount.');
      }
      Object.assign(globalThis, { __projectionRetainedNode: node });
      return { href: location.href, timeOrigin: performance.timeOrigin };
    },
    { runId },
  );
  await target.holdNextAgentHostGatewayRequest();
  await target.click(continueAction);
  await target.waitForAgentHostGatewayGate({ kind: 'request' });
  const scrollTop = await target.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>('[role="region"][aria-label="Chat history"]');
    if (!scroller || scroller.scrollHeight <= scroller.clientHeight) {
      throw new Error('The retained turn did not provide actual scroll extent.');
    }
    scroller.scrollTop = Math.floor((scroller.scrollHeight - scroller.clientHeight) / 3);
    scroller.dispatchEvent(new Event('scroll'));
    return scroller.scrollTop;
  });
  await target.releaseAgentHostGatewayRequest();
  await target.waitForAgentHostGatewayGate({ kind: 'stream' });
  try {
    await target.expectVisible(selectors.getByText('Resumed distinct alpha.', { exact: true }));
  } catch (error) {
    await target.writeArtifact(
      'projection-resume-held-failure.json',
      JSON.stringify(
        {
          chatId,
          runId,
          identity,
          scrollTop,
          gateway: await target.readAgentHostGatewayState(),
          delivery: await projectionDeliveryEvidence(),
          dom: await target.evaluate(() => ({
            href: location.href,
            paragraphs: [...document.querySelectorAll('article p')].map((node) => node.textContent),
            liveness: (
              globalThis as typeof globalThis & Partial<Record<'__TAU_CHAT_SESSION_LIVENESS__', () => unknown>>
            ).__TAU_CHAT_SESSION_LIVENESS__?.(),
          })),
        },
        null,
        2,
      ),
    );
    await target.screenshot(undefined, 'projection-resume-held-failure.png');
    throw error;
  }
  const witness = async () =>
    target.evaluate(
      ({ runId }) => {
        const retained = (globalThis as typeof globalThis & { __projectionRetainedNode: Element })
          .__projectionRetainedNode;
        const turn = document.querySelector(`[data-projection-turn="${runId}"]`);
        const paragraph = [...(turn?.querySelectorAll('p') ?? [])].find(
          (candidate) => candidate.textContent === 'Retained prefix anchor.',
        );
        const scroller = document.querySelector<HTMLElement>('[role="region"][aria-label="Chat history"]');
        return {
          sameNode: retained === paragraph && retained.isConnected,
          scrollTop: scroller?.scrollTop,
          href: location.href,
          timeOrigin: performance.timeOrigin,
        };
      },
      { runId },
    );
  expect(await witness()).toEqual({ sameNode: true, scrollTop, ...identity });
  await target.releaseAgentHostGatewayFixture();
  await target.waitForAgentHostGatewayGate({ kind: 'stream' });
  await target.expectVisible(selectors.getByText(/Resumed distinct alpha\. Resumed distinct beta\./u));
  expect(await witness()).toEqual({ sameNode: true, scrollTop, ...identity });
  await target.releaseAgentHostGatewayFixture();
  await expectLogInvariant(chatId!, { runs: 1, attempts: [2], settlements: ['turn.finalized', 'turn.finalized'] });
  await target.writeArtifact(
    'projection-resume-renderer-scroll.json',
    JSON.stringify({ runId, identity, scrollTop, failedLog, final: await witness() }, null, 2),
  );
});

test('retains historical renderer node identity and user scroll through actual Stop and a genuine held Resume', async () => {
  await installProjectionDeliveryControl();
  const prefix =
    'Stopped prefix anchor.\n\n' +
    Array.from({ length: 80 }, (_, index) => `Stopped paragraph ${index + 1}.`).join('\n\n');
  const [chatId] = await openChat([
    reply(prefix, { gated: true }),
    reply('', { textChunks: ['Stop-resumed distinct alpha.', ' Stop-resumed distinct beta.'], gateChunks: true }),
  ]);
  expect(chatId).toBeDefined();
  await sendDraft('Keep the stopped prefix through Resume.');
  await target.waitForAgentHostGatewayGate({ kind: 'stream' });
  await target.expectVisible(selectors.getByText('Stopped prefix anchor.', { exact: true }));
  const runId = await captureProjectionTurn(chatId!, 'Keep the stopped prefix through Resume.');
  const identity = await target.evaluate(
    ({ runId }) => {
      const turn = document.querySelector(`[data-projection-turn="${runId}"]`);
      const node = [...(turn?.querySelectorAll('p') ?? [])].find(
        (candidate) => candidate.textContent === 'Stopped prefix anchor.',
      );
      if (!node) {
        throw new Error('The actual retained paragraph did not mount.');
      }
      Object.assign(globalThis, { __projectionStoppedRetainedNode: node });
      return { href: location.href, timeOrigin: performance.timeOrigin };
    },
    { runId },
  );
  const witness = async () =>
    target.evaluate(
      ({ runId }) => {
        const retained = (globalThis as typeof globalThis & { __projectionStoppedRetainedNode: Element })
          .__projectionStoppedRetainedNode;
        const turn = document.querySelector(`[data-projection-turn="${runId}"]`);
        const paragraph = [...(turn?.querySelectorAll('p') ?? [])].find(
          (candidate) => candidate.textContent === 'Stopped prefix anchor.',
        );
        const scroller = document.querySelector<HTMLElement>('[role="region"][aria-label="Chat history"]');
        return {
          // Settled Stop crosses the streaming Markdown provider boundary; retain this pre-Stop diagnostic.
          sameNode: retained === paragraph && retained.isConnected,
          retainedContent: [...(turn?.querySelectorAll('p') ?? [])]
            .map((node) => node.textContent)
            .filter((text) => text === 'Stopped prefix anchor.' || text.startsWith('Stopped paragraph ')),
          samePostStopNode:
            paragraph ===
              (globalThis as typeof globalThis & { __projectionPostStopNode?: Element }).__projectionPostStopNode &&
            paragraph?.isConnected === true,
          scrollTop: scroller?.scrollTop,
          href: location.href,
          timeOrigin: performance.timeOrigin,
        };
      },
      { runId },
    );
  await target.click(selectors.getByCss('button:has(svg.lucide-square)').last());
  await target.expectVisible(continueAction);
  await expectLogInvariant(chatId!, { runs: 1, attempts: [1], settlements: ['turn.finalized'] });
  const stoppedLog = await chatLog(chatId!);
  const stoppedLifecycle = stoppedLog.find((row) => row.type === 'run.lifecycle' && row.state === 'cancelled');
  expect(stoppedLifecycle).toBeDefined();
  expect(stoppedLifecycle).toHaveProperty('detail.code', 'USER_STOPPED');
  await target.evaluate(
    ({ runId }) => {
      const turn = document.querySelector(`[data-projection-turn="${runId}"]`);
      const paragraph = [...(turn?.querySelectorAll('p') ?? [])].find(
        (candidate) => candidate.textContent === 'Stopped prefix anchor.',
      );
      Object.assign(globalThis, { __projectionPostStopNode: paragraph });
    },
    { runId },
  );
  const postStop = {
    witness: await witness(),
    dom: await target.evaluate(() => ({
      paragraphs: [...document.querySelectorAll('article p')].slice(0, 100).map((node) => node.textContent),
      articleHtml: document.querySelector('article')?.outerHTML.slice(0, 16_384),
      pipeline: (
        globalThis as typeof globalThis & Partial<Record<'__TAU_CHAT_SESSION_LIVENESS__', () => unknown>>
      ).__TAU_CHAT_SESSION_LIVENESS__?.(),
    })),
  };
  await target.writeArtifact(
    'projection-stop-before-resume-node.json',
    JSON.stringify({ chatId, runId, identity, postStop, stoppedLog }, null, 2),
  );
  expect(postStop.witness).toMatchObject({
    samePostStopNode: true,
    retainedContent: prefix.split('\n\n'),
    ...identity,
  });
  // Drain the cancelled response fixture before admitting the actual Resume request.
  await target.releaseAgentHostGatewayFixture();
  await target.holdNextAgentHostGatewayRequest();
  await target.click(continueAction);
  await target.waitForAgentHostGatewayGate({ kind: 'request' });
  const scrollGesture = await target.evaluate(async () => {
    const scroller = document.querySelector<HTMLElement>('[role="region"][aria-label="Chat history"]');
    if (!scroller || scroller.scrollHeight <= scroller.clientHeight) {
      throw new Error('The retained turn did not provide actual scroll extent.');
    }
    const chosen = Math.floor((scroller.scrollHeight - scroller.clientHeight) / 3);
    scroller.scrollTop = chosen;
    scroller.dispatchEvent(new Event('scroll'));
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    });
    return { chosen, settled: scroller.scrollTop };
  });
  const scrollTop = scrollGesture.chosen;
  const beforeRelease = await witness();
  await target.writeArtifact(
    'projection-stop-resume-before-release.json',
    JSON.stringify({ chatId, runId, identity, postStop, scrollGesture, beforeRelease }, null, 2),
  );
  expect(scrollGesture.settled).toBe(scrollGesture.chosen);
  expect(beforeRelease).toMatchObject({
    samePostStopNode: true,
    retainedContent: prefix.split('\n\n'),
    scrollTop,
    ...identity,
  });
  await target.releaseAgentHostGatewayRequest();
  await target.waitForAgentHostGatewayGate({ kind: 'stream' });
  try {
    await target.expectVisible(selectors.getByText('Stop-resumed distinct alpha.', { exact: true }));
    expect(await witness()).toMatchObject({
      samePostStopNode: true,
      retainedContent: prefix.split('\n\n'),
      scrollTop,
      ...identity,
    });
  } catch (error) {
    await target.writeArtifact(
      'projection-stop-resume-held-failure.json',
      JSON.stringify(
        {
          chatId,
          runId,
          identity,
          postStop,
          beforeRelease,
          scrollGesture,
          currentWitness: await witness(),
          scrollTop,
          gateway: await target.readAgentHostGatewayState(),
          delivery: await projectionDeliveryEvidence(),
          dom: await target.evaluate(() => ({
            href: location.href,
            paragraphs: [...document.querySelectorAll('article p')].slice(0, 100).map((node) => node.textContent),
            articleHtml: document.querySelector('article')?.outerHTML.slice(0, 16_384),
            liveness: (
              globalThis as typeof globalThis & Partial<Record<'__TAU_CHAT_SESSION_LIVENESS__', () => unknown>>
            ).__TAU_CHAT_SESSION_LIVENESS__?.(),
          })),
        },
        null,
        2,
      ),
    );
    await target.screenshot(undefined, 'projection-stop-resume-held-failure.png');
    throw error;
  }
  await target.releaseAgentHostGatewayFixture();
  await target.waitForAgentHostGatewayGate({ kind: 'stream' });
  await target.expectVisible(selectors.getByText(/Stop-resumed distinct alpha\. Stop-resumed distinct beta\./u));
  expect(await witness()).toMatchObject({
    samePostStopNode: true,
    retainedContent: prefix.split('\n\n'),
    scrollTop,
    ...identity,
  });
  await target.releaseAgentHostGatewayFixture();
  await expectLogInvariant(chatId!, { runs: 1, attempts: [2], settlements: ['turn.finalized', 'turn.finalized'] });
  await target.writeArtifact(
    'projection-stop-resume-renderer-scroll.json',
    JSON.stringify(
      { runId, identity, scrollTop, stoppedLog, postStop, beforeRelease, scrollGesture, final: await witness() },
      null,
      2,
    ),
  );
});

test.describe.skipIf(
  (import.meta as ImportMeta & { readonly env: Readonly<Record<string, string | undefined>> }).env[
    'VITE_TAU_E2E_MANUAL'
  ] !== 'true',
)('manual candidate fixture', () => {
  const prepare = async () => {
    await installProjectionDeliveryControl();
    const [chatId] = await openChat([
      reply('', {
        textChunks: ['Manual first alpha.', ' Manual first beta.', ' Manual first gamma.'],
        gateChunks: true,
      }),
      reply('', {
        textChunks: ['Manual second alpha.', ' Manual second beta.', ' Manual second gamma.'],
        gateChunks: true,
      }),
      reply('', {
        textChunks: ['Manual resumed alpha.', ' Manual resumed beta.', ' Manual resumed gamma.'],
        gateChunks: true,
      }),
    ]);
    if (chatId === undefined) {
      throw new Error('The manual fixture did not seed its chat.');
    }
    const project = await projectionProject();
    const source = await target.commands.readFile('../../packages/agent-host/src/launchers/agent-launcher.ts');
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
    const sourceSha256 = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    const identity = await target.evaluate(
      ({ sourceSha256 }) => {
        const state = { releases: 0, checkpoints: [] as string[], end: false };
        Object.assign(globalThis, { __tauProjectionManual: state });
        document.title = 'Tau candidate filesystem manual · 3317';
        const controls = document.createElement('aside');
        controls.id = 'projection-manual-controls';
        controls.setAttribute('aria-label', 'Manual fixture controls');
        controls.style.cssText =
          'position:fixed;top:8px;right:8px;z-index:2147483647;background:white;color:black;padding:8px;border:1px solid black';
        const release = document.createElement('button');
        release.textContent = 'Release next fixture chunk';
        release.addEventListener('click', () => {
          state.releases += 1;
        });
        const end = document.createElement('button');
        end.textContent = 'End manual fixture';
        end.addEventListener('click', () => {
          state.end = true;
        });
        const checkpointName = document.createElement('input');
        checkpointName.setAttribute('aria-label', 'Checkpoint name');
        checkpointName.placeholder = 'Checkpoint name';
        const capture = document.createElement('button');
        capture.textContent = 'Capture checkpoint';
        capture.addEventListener('click', () => {
          state.checkpoints.push(checkpointName.value.trim() || `checkpoint-${Date.now()}`);
        });
        controls.append(release, checkpointName, capture, end);
        document.body.append(controls);
        return { href: location.href, timeOrigin: performance.timeOrigin, title: document.title, sourceSha256 };
      },
      { sourceSha256 },
    );
    return { identity, project, chatId };
  };
  let fixture: Awaited<ReturnType<typeof prepare>> | undefined;
  test.beforeEach(async () => {
    fixture = await prepare();
  });
  test('manual candidate window for actual Send Stop Resume gestures', async () => {
    if (fixture === undefined) {
      throw new Error('Manual setup did not complete.');
    }
    const { identity, project, chatId } = fixture;
    const readyAt = Date.now();
    await target.writeArtifact(
      'projection-manual-handoff.json',
      JSON.stringify(
        {
          identity,
          project,
          chatId,
          readyAt,
          operatorDeadline: readyAt + 300_000,
          boundedBy: 'existing ui-e2e300000ms test timeout',
          instructions:
            'Use actual composer Send. Release first turn to completion. Send second turn, Stop while held, then Resume; third independently gated response is resumed. Name and Capture checkpoint after gestures to save screenshot/source digests. Driver never sends, refreshes or revisits product state after handoff.',
        },
        null,
        2,
      ),
    );
    console.info(
      'Filesystem manual ready',
      JSON.stringify({ ...identity, chatId, readyAt, operatorDeadline: readyAt + 300_000 }),
    );
    const releases: Array<{ status: string; error?: string }> = [];
    const checkpoints: Array<{
      name: string;
      artifactName: string;
      screenshotSha256: string;
      sourceSha256: string;
      logSha256: string;
      capturedAt: number;
    }> = [];
    while (Date.now() < readyAt + 300_000) {
      // oxlint-disable-next-line no-await-in-loop -- Poll only fixture operator flags; product state is never polled or refreshed.
      const flags = await target.evaluate(() => {
        const state = (
          globalThis as typeof globalThis & {
            __tauProjectionManual: { releases: number; checkpoints: string[]; end: boolean };
          }
        ).__tauProjectionManual;
        const flags = { ...state, checkpoints: [...state.checkpoints] };
        state.releases = 0;
        state.checkpoints = [];
        return flags;
      });
      for (const name of flags.checkpoints) {
        const artifactName = `projection-manual-checkpoint-${checkpoints.length + 1}-${name.replaceAll(/[^a-zA-Z0-9._-]+/gu, '-')}.png`;
        // oxlint-disable-next-line no-await-in-loop -- Each explicit operator checkpoint captures one durable screenshot.
        const screenshot = await target.screenshot(undefined, artifactName);
        const bytes = base64ToUint8Array(screenshot);
        // oxlint-disable-next-line no-await-in-loop -- Hash the exact saved screenshot bytes for this named checkpoint.
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        // oxlint-disable-next-line no-await-in-loop -- Read-only source receipt is explicitly requested by the operator checkpoint.
        const physicalLog = await projectionLog(chatId);
        // oxlint-disable-next-line no-await-in-loop -- The source digest is paired with the requested screenshot checkpoint.
        const logDigest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(physicalLog));
        const checkpoint = {
          name,
          artifactName,
          screenshotSha256: [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join(''),
          sourceSha256: identity.sourceSha256,
          logSha256: [...new Uint8Array(logDigest)].map((byte) => byte.toString(16).padStart(2, '0')).join(''),
          capturedAt: Date.now(),
        };
        checkpoints.push(checkpoint);
        // oxlint-disable-next-line no-await-in-loop -- Persist each checkpoint immediately, including before a later operator timeout.
        await target.writeArtifact(
          artifactName.replace(/\.png$/u, '.json'),
          JSON.stringify({ ...checkpoint, identity, project, chatId }, null, 2),
        );
      }
      if (flags.end) {
        break;
      }
      for (let index = 0; index < flags.releases; index += 1) {
        try {
          // oxlint-disable-next-line no-await-in-loop -- Each explicit operator request releases only one actual queued gateway chunk.
          await target.releaseAgentHostGatewayFixture();
          releases.push({ status: 'released' });
        } catch (error) {
          releases.push({ status: 'no queued gate', error: String(error) });
        }
      }
      // oxlint-disable-next-line no-await-in-loop -- Fixture-only operator flag cadence, bounded by the existing five-minute test owner.
      await target.delay(100);
    }
    expect(
      await target.evaluate(() => ({ href: location.href, timeOrigin: performance.timeOrigin, title: document.title })),
    ).toEqual({ href: identity.href, timeOrigin: identity.timeOrigin, title: identity.title });
    const delivery = await projectionDeliveryEvidence();
    const physicalLog = await projectionLog(chatId);
    expect(delivery.deliveredFrames.some((frame) => frame.chatId === chatId)).toBe(true);
    expect(physicalLog).toContain('"state":"admitted"');
    await target.writeArtifact(
      'projection-manual-result.json',
      JSON.stringify(
        {
          identity,
          releases,
          checkpoints,
          delivery,
          gateway: await target.readAgentHostGatewayRequests(),
          physicalLog,
        },
        null,
        2,
      ),
    );
  });
});

const importedClosurePath = (import.meta as ImportMeta & { readonly env: Readonly<Record<string, string | undefined>> })
  .env['VITE_TAU_E2E_PROJECTION_IMPORT_FILE'];

test.skipIf(importedClosurePath === undefined)(
  'measures immutable imported browser workload through first project connection and warm chat gesture',
  async () => {
    const diagnostics =
      (import.meta as ImportMeta & { readonly env: Readonly<Record<string, string | undefined>> }).env[
        'VITE_TAU_E2E_PROJECTION_DIAGNOSTICS'
      ] === 'true';
    const readWorkerFlow = async () => (diagnostics ? target.workerCatchUpFlow(false) : []);

    const phaseStartedAt = Date.now();
    const phaseFacts: { chatId?: string; fixtureTextCodeUnits?: number } = {};
    const phase = async (name: string, bytes?: number) => {
      await target.writeArtifact(
        'projection-imported-browser-phase.json',
        JSON.stringify({
          phase: name,
          at: Date.now(),
          elapsed: Date.now() - phaseStartedAt,
          fixture: importedClosurePath,
          chatId: phaseFacts.chatId,
          bytes,
          fixtureTextCodeUnits: phaseFacts.fixtureTextCodeUnits,
          diagnostics,
        }),
      );
    };
    await phase('before-node-canonical-proof');
    const canonicalProof = await target.validateProjectionFixture(importedClosurePath!);
    await phase('after-node-canonical-proof', canonicalProof.historyByteLength);
    await phase('before-fixture-read');
    const fixtureText = await target.readFixtureText(importedClosurePath!);
    phaseFacts.fixtureTextCodeUnits = fixtureText.length;
    await phase('after-fixture-read');
    const importedFixture = JSON.parse(fixtureText) as ProjectionBenchmarkFixture;
    phaseFacts.chatId = importedFixture.chatId;
    await phase('after-fixture-json-parse');
    const { closure } = importedFixture;
    expect({
      version: closure.version,
      project: closure.project,
      directories: closure.directories,
      files: closure.files.map(({ path, byteLength, sha256 }) => ({ path, byteLength, sha256 })),
    }).toEqual(canonicalProof.manifest);
    const history = closure.files.find((file) => file.path === canonicalProof.historyPath);
    if (!history) {
      throw new Error('The exact canonical history is absent from the imported closure.');
    }
    const { chatId } = canonicalProof;
    expect(importedFixture.chatId).toBe(chatId);
    expect(canonicalProof).toMatchObject({ turnCount: 1000, historyIntact: true, anomalyCount: 0 });
    const manifest = JSON.parse(
      new TextDecoder().decode(decodeProjectionFile(closure.files.find((file) => file.path === 'tau.json')!)),
    ) as { name: string };
    const chatRecord = JSON.parse(
      new TextDecoder().decode(
        decodeProjectionFile(closure.files.find((file) => file.path === `.tau/chats/${chatId}/chat.json`)!),
      ),
    ) as { name: string };
    await phase('after-small-manifest-proof-binding', history.byteLength);
    await installProjectionDeliveryControl();
    await target.installAgentHostGatewayFixture([
      reply('', { textChunks: ['Imported stream alpha.', ' Imported stream beta.'], gateChunks: true }),
    ]);
    await target.navigate('/projects');
    await phase('before-rooted-closure-import', history.byteLength);
    const importedClosure = await importProjectionProjectClosure(closure);
    await phase('after-rooted-closure-import', history.byteLength);
    await phase('before-rooted-closure-deep-equality', history.byteLength);
    expect(importedClosure).toEqual(closure);
    await phase('after-rooted-closure-deep-equality', history.byteLength);
    // A new document starts at the library, before this project's connector or chat attachments exist.
    await phase('before-fresh-library-document');
    await target.reload();
    await phase('after-fresh-library-document');
    const project = selectors.getByRole('link', { name: `Open ${manifest.name}`, exact: true });
    await target.expectVisible(project, 60_000);
    const before = await projectionDeliveryEvidence();
    expect(before.requestedChats).not.toContain(chatId);
    expect(before.deliveredFrames.some((frame) => frame.chatId === chatId)).toBe(false);
    const discoveredHref = await target.getAttribute(project, 'href');
    expect(importedFixture.chatId).toBe(chatId);
    expect(closure.files.filter((file) => file.path.endsWith('/chat.json'))).toHaveLength(1);
    await armProjectionGestureMeasurement(
      'imported-project-first-connection',
      `Open ${manifest.name}`,
      'Fixture turn 1000 of 1000.',
      chatRecord.name,
      'Canonical projection benchmark answer.',
    );
    if (diagnostics) {
      await target.startCpuProfile();
      await target.writeArtifact(
        'projection-imported-browser-cold-profiler-armed.json',
        JSON.stringify(
          {
            armedAt: Date.now(),
            beforeTrustedGesture: true,
            chatId,
            workersBeforeGesture: await target.workers('agent-host.worker'),
            workerProfiles: 'projection-imported-browser-cold-renderer.cpuprofile.workers.json',
            scope: 'Diagnostic worker startup pauses are recorded separately; this is not a W7 latency sample.',
          },
          null,
          2,
        ),
      );
    }
    await phase('before-cold-project-card-gesture', history.byteLength);
    await target.click(project);
    await phase('after-cold-project-card-gesture', history.byteLength);
    try {
      await target.expectVisible(selectors.getByText(/Fixture turn 1000 of 1000\./u), 120_000);
    } catch (error) {
      if (diagnostics) {
        await target.stopCpuProfile('projection-imported-browser-cold-renderer.cpuprofile');
      }
      await target.writeArtifact(
        'projection-imported-browser-open-failure.json',
        JSON.stringify(
          {
            diagnostics,
            fixture: importedClosurePath,
            project: closure.project,
            chatId,
            preGesture: before,
            gesture: await projectionGestureMeasurement(),
            delivery: await projectionDeliveryEvidence(),
            dom: await target.evaluate(() => ({
              href: location.href,
              text: document.body.textContent.slice(-12_000),
              articles: document.querySelectorAll('article').length,
              scroll: [...document.querySelectorAll('[data-virtuoso-scroller], [role=region]')].map((node) => ({
                label: node.getAttribute('aria-label'),
                top: node.scrollTop,
                height: node.scrollHeight,
                viewport: node.clientHeight,
                items: [...node.querySelectorAll<HTMLElement>('[data-index]')].map((item) => item.dataset['index']),
              })),
            })),
            liveness: await target.evaluate(() => {
              const globals = globalThis as typeof globalThis &
                Partial<Record<'__TAU_CHAT_SESSION_LIVENESS__', () => unknown>>;
              return globals.__TAU_CHAT_SESSION_LIVENESS__?.();
            }),
          },
          null,
          2,
        ),
      );
      await target.screenshot(undefined, 'projection-imported-browser-open-failure.png');
      throw error;
    }
    try {
      await expect
        .poll(async () => {
          const evidence = await projectionGestureMeasurement();
          return evidence?.duration;
        })
        .toBeDefined();
    } catch (error) {
      await target.writeArtifact(
        'projection-imported-browser-complete-turn-failure.json',
        JSON.stringify(
          {
            measurement: await projectionGestureMeasurement(),
            finalTurn: await target.evaluate(() => document.querySelector('[data-index="999"]')?.outerHTML),
          },
          null,
          2,
        ),
      );
      await target.screenshot(undefined, 'projection-imported-browser-complete-turn-failure.png');
      throw error;
    } finally {
      if (diagnostics) {
        await target.stopCpuProfile('projection-imported-browser-cold-renderer.cpuprofile');
      }
    }
    const firstConnection = await projectionGestureMeasurement();
    expect(firstConnection?.trusted).toBe(true);
    await target.writeArtifact(
      'projection-imported-browser-cold-visible.json',
      JSON.stringify(
        {
          diagnostics,
          fixture: importedClosurePath,
          chatId,
          firstConnection,
          preGesture: before,
          finalTurn: await target.evaluate(() => ({
            html: document.querySelector('[data-index="999"]')?.outerHTML,
            articles: [...document.querySelectorAll('[data-index="999"] article')].map((node) => node.textContent),
          })),
        },
        null,
        2,
      ),
    );
    await target.screenshot(undefined, 'projection-imported-browser-cold-visible.png');
    await target.expectVisible(
      selectors.getByCss('[data-index="999"]').getByText('Canonical projection benchmark answer.', { exact: true }),
    );
    await expect
      .poll(async () => new URL(await target.currentUrl()).searchParams.get('chat'), { timeout: 60_000 })
      .toBe(chatId);
    const workerFlowInstalled = diagnostics ? await target.workerCatchUpFlow(true) : [];
    await target.writeArtifact(
      'projection-imported-browser-worker-flow-installed.json',
      JSON.stringify({ diagnostics, chatId, firstConnection, workers: workerFlowInstalled }, null, 2),
    );
    const historyLabel = chatRecord.name;
    await target.hover(selectors.getByCss('[data-slot="project-trigger"]').first());
    await target.click(selectors.getByRole('button', { name: /^New chat in /u }).first());
    await expect
      .poll(async () => new URL(await target.currentUrl()).searchParams.get('chat'), { timeout: 60_000 })
      .not.toBe(chatId);
    const emptyChatId = new URL(await target.currentUrl()).searchParams.get('chat');
    try {
      await expect
        .poll(
          async () =>
            target.evaluate(
              ({ emptyChatId }) => {
                const active = [...document.querySelectorAll<HTMLElement>('[data-slot="chat-trigger"]')]
                  .find((row) => row.dataset['active'] === 'true')
                  ?.querySelector('a');
                const activeChatId =
                  active === undefined || active === null ? undefined : new URL(active.href).searchParams.get('chat');
                return (
                  emptyChatId !== null &&
                  new URL(location.href).searchParams.get('chat') === emptyChatId &&
                  activeChatId === emptyChatId &&
                  ![...document.querySelectorAll('[aria-label="Chat history"] article [role="button"] p')].some(
                    (node) => node.textContent.includes('Fixture turn 1000 of 1000.'),
                  )
                );
              },
              { emptyChatId },
            ),
          { timeout: 60_000 },
        )
        .toBe(true);
    } catch (error) {
      await target.writeArtifact(
        'projection-imported-browser-warm-setup-failure.json',
        JSON.stringify(
          {
            phase: 'empty-chat-presentation-before-warm-measurement',
            capturedAt: Date.now(),
            href: await target.currentUrl(),
            delivery: await projectionDeliveryEvidence(),
            dom: await target.evaluate(() => ({
              text: document.body.textContent.slice(-12_000),
              priorPromptCount: [...document.querySelectorAll('article p')].filter(
                (node) => node.textContent === 'Fixture turn 1000 of 1000.',
              ).length,
            })),
          },
          null,
          2,
        ),
      );
      throw error;
    }
    await armProjectionGestureMeasurement(
      'imported-browser-warm',
      historyLabel,
      'Fixture turn 1000 of 1000.',
      historyLabel,
      'Canonical projection benchmark answer.',
    );
    if (diagnostics) {
      await target.startCpuProfile();
    }
    await switchToChat(historyLabel);
    try {
      await expect
        .poll(async () => {
          const evidence = await projectionGestureMeasurement();
          return evidence?.duration;
        })
        .toBeDefined();
    } catch (error) {
      const originalFailureAt = Date.now();
      if (diagnostics) {
        await target.stopCpuProfile('projection-imported-browser-warm-renderer.cpuprofile');
      }
      const initialWorkerFlow = await readWorkerFlow();
      await target.writeArtifact(
        'projection-imported-browser-warm-failure.json',
        JSON.stringify(
          {
            diagnostics,
            workerFlowInstalled,
            workerFlow: await readWorkerFlow(),
            firstConnection,
            warm: await projectionGestureMeasurement(),
            delivery: await projectionDeliveryEvidence(),
            dom: await target.evaluate(() => ({
              href: location.href,
              activeRow: document
                .querySelector('[data-slot="chat-trigger"][data-active="true"] a')
                ?.getAttribute('href'),
              liveness: (
                globalThis as typeof globalThis & Partial<Record<'__TAU_CHAT_SESSION_LIVENESS__', () => unknown>>
              ).__TAU_CHAT_SESSION_LIVENESS__?.(),
              text: document.body.textContent.slice(-12_000),
              scroll: [...document.querySelectorAll('[aria-label="Chat history"]')].map((node) => ({
                top: node.scrollTop,
                height: node.scrollHeight,
                viewport: node.clientHeight,
                items: [...node.querySelectorAll<HTMLElement>('[data-index]')].map((item) => item.dataset['index']),
              })),
            })),
          },
          null,
          2,
        ),
      );
      await target.screenshot(undefined, 'projection-imported-browser-warm-failure.png');
      try {
        // Preserve the original default-poll failure; this later wait is diagnostic only.
        let laterFailure: string | undefined;
        try {
          await expect
            .poll(
              async () => {
                const measurement = await projectionGestureMeasurement();
                return measurement?.duration;
              },
              { timeout: 60_000 },
            )
            .toBeDefined();
        } catch (diagnosticError) {
          laterFailure = String(diagnosticError);
        }
        await target.writeArtifact(
          'projection-imported-browser-warm-later-convergence.json',
          JSON.stringify(
            {
              diagnostics,
              originalFailureAt,
              initialWorkerFlow,
              capturedAt: Date.now(),
              elapsedSinceOriginalFailure: Date.now() - originalFailureAt,
              laterFailure,
              warm: await projectionGestureMeasurement(),
              workerFlow: await readWorkerFlow(),
              delivery: await projectionDeliveryEvidence(),
              dom: await target.evaluate(() => ({
                href: location.href,
                text: document.body.textContent.slice(-12_000),
                liveness: (
                  globalThis as typeof globalThis & Partial<Record<'__TAU_CHAT_SESSION_LIVENESS__', () => unknown>>
                ).__TAU_CHAT_SESSION_LIVENESS__?.(),
              })),
              diagnosticOnly: true,
            },
            null,
            2,
          ),
        );
      } catch {
        // A diagnostic failure must not replace the original latency assertion.
      }
      throw error;
    }
    /** Milliseconds. */
    const warmSwitch = await projectionGestureMeasurement();
    expect(warmSwitch?.trusted).toBe(true);
    if (diagnostics) {
      await target.stopCpuProfile('projection-imported-browser-warm-renderer.cpuprofile');
    }
    await target.writeArtifact(
      'projection-imported-browser-first-connection.json',
      JSON.stringify(
        {
          diagnostics,
          fixture: importedClosurePath,
          project: closure.project,
          workerFlowInstalled,
          workerFlow: await readWorkerFlow(),
          firstConnection,
          warmSwitch,
          discoveredHref,
          excludedChatDirectories: importedFixture.excludedChatDirectories,
          importedChatId: chatId,
          preGestureRequests: before.requestedChats,
          coldQualification:
            'fresh library document, no matching agent delivery before actual project-card gesture; first connection, not same-project sidebar first selection',
          revisionClosure: closure.files.map(({ path, sha256 }) => ({ path, sha256 })),
          tracing: 'must be disabled by TAU_E2E_TRACE=false for comparable sampling',
        },
        null,
        2,
      ),
    );
    await sendDraft('Continue the exact imported browser workload.');
    await target.waitForAgentHostGatewayGate({ kind: 'stream' });
    await target.expectVisible(selectors.getByText('Imported stream alpha.', { exact: true }));
    await target.releaseAgentHostGatewayFixture();
    await target.waitForAgentHostGatewayGate({ kind: 'stream' });
    await target.expectVisible(selectors.getByText(/Imported stream alpha\. Imported stream beta\./u));
    await target.releaseAgentHostGatewayFixture();
  },
);

const multichatDiagnostic =
  (import.meta as ImportMeta & { readonly env: Readonly<Record<string, string | undefined>> }).env[
    'VITE_TAU_E2E_PROJECTION_MULTICHAT'
  ] === 'true';

test.skipIf(!multichatDiagnostic)(
  'diagnoses six connected histories while hidden, collapsed and disconnected',
  async () => {
    expect(
      (import.meta as ImportMeta & { readonly env: Readonly<Record<string, string | undefined>> }).env[
        'VITE_TAU_E2E_PROJECTION_DIAGNOSTICS'
      ],
    ).toBe('true');
    await installProjectionDeliveryControl();
    const seeded = await openChat(
      [
        ...Array.from({ length: 6 }, (_, index) => reply(`Independent history answer ${index + 1}.`)),
        reply('Hidden history suffix completed.'),
      ],
      '?chats=2',
    );
    const project = await projectionProject();
    const histories: Array<{
      chatId: string;
      href: string;
      text: string;
      bytes: number;
      rows: number;
      sha256: string;
    }> = [];
    // Each template is independently admitted in its real chat; protected chat/checkout/revision identities are never copied.
    for (let index = 0; index < 6; index++) {
      if (index === 1) {
        // oxlint-disable-next-line no-await-in-loop -- Real admissions run in deterministic gateway order.
        await switchToChat('Second chat');
      } else if (index > 1) {
        // oxlint-disable-next-line no-await-in-loop -- Create each chat through the existing product gesture.
        await target.hover(selectors.getByCss('[data-slot="project-trigger"]').first());
        // oxlint-disable-next-line no-await-in-loop -- The previous chat must exist before creating the next.
        await target.click(selectors.getByRole('button', { name: /^New chat in /u }).first());
        // oxlint-disable-next-line no-await-in-loop -- Await the actual route identity before admission.
        await expect
          .poll(async () => new URL(await target.currentUrl()).searchParams.get('chat'))
          .not.toBe(histories.at(-1)?.chatId);
      }
      // oxlint-disable-next-line no-await-in-loop -- Bind each template to the selected actual chat.
      const href = await target.currentUrl();
      const chatId = new URL(href).searchParams.get('chat');
      expect(chatId).toBeTruthy();
      if (chatId === null) {
        throw new Error('A real chat route is required for the multi-chat diagnostic.');
      }
      if (index < 2) {
        expect(chatId).toBe(seeded[index]);
      }
      // oxlint-disable-next-line no-await-in-loop -- One gateway response belongs to each real chat admission.
      await sendDraft(`Independent history seed ${index + 1}.`);
      // oxlint-disable-next-line no-await-in-loop -- Durable settlement qualifies this chat's template.
      await expectLogInvariant(chatId, { runs: 1, settlements: ['turn.finalized'] });
      // oxlint-disable-next-line no-await-in-loop -- Read only the current chat's own authoritative template.
      const fixture = createProjectionHistory(await projectionLog(chatId), 250);
      // oxlint-disable-next-line no-await-in-loop -- Save the exact per-chat identity proof.
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fixture.text));
      histories.push({
        chatId,
        href,
        text: fixture.text,
        bytes: fixture.bytes,
        rows: fixture.rows,
        sha256: [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join(''),
      });
    }
    expect(new Set(histories.map(({ chatId }) => chatId)).size).toBe(6);
    // Stop the connected producer before replacing its logs; the fixture writer never writes through an active writer.
    await target.click(
      selectors
        .getByCss('[data-slot="project-trigger"]')
        .first()
        .getByRole('button', { name: /^More actions for /u }),
    );
    await target.click(selectors.getByRole('menuitem', { name: /^Close /u }));
    await target.navigate('/projects');
    await expect
      .poll(
        async () => {
          const evidence = await projectionDeliveryEvidence();
          return evidence.outstandingReadCount;
        },
        { timeout: 30_000 },
      )
      .toBe(0);
    for (const history of histories) {
      // oxlint-disable-next-line no-await-in-loop -- Each independently admitted log receives only its own expanded template.
      await replaceProjectionLog(history.chatId, history.text);
    }
    const closure = await exportProjectionProjectClosure(project);
    await target.writeArtifact('projection-multichat-closure.json', JSON.stringify(closure));
    const manifest = JSON.parse(
      new TextDecoder().decode(decodeProjectionFile(closure.files.find((file) => file.path === 'tau.json')!)),
    ) as { name: string };
    await target.writeArtifact(
      'projection-multichat-sources.json',
      JSON.stringify(
        {
          project,
          histories: histories.map(({ text: _text, ...history }) => history),
          turnsPerChat: 250,
          totalRawBytes: histories.reduce((sum, history) => sum + history.bytes, 0),
          authority:
            'Each history derives from its own real admission in this project; no cross-chat identity substitution.',
        },
        null,
        2,
      ),
    );
    await target.startCpuProfile();
    try {
      // Fresh document drops producer SDK sessions and starts instrumentation before any renewed host connection.
      await target.reload();
      const checkpoint = async (name: string): Promise<void> => {
        const delivery = await projectionDeliveryEvidence();
        await target.writeArtifact(
          `projection-multichat-${name}.json`,
          JSON.stringify(
            {
              at: Date.now(),
              project,
              delivery,
              workers: await target.workers(),
              workerFlow: await target.workerCatchUpFlow(false),
              liveness: await target.evaluate(() => {
                const scope = globalThis as typeof globalThis &
                  Partial<Record<'__TAU_CHAT_SESSION_LIVENESS__', () => unknown>>;
                return scope.__TAU_CHAT_SESSION_LIVENESS__?.();
              }),
              note: 'Pending client RPC is not private activeReads proof; heap snapshots are intrusive retained reachability, not peak memory.',
            },
            null,
            2,
          ),
        );
        await target.snapshotProjectionHeap(`projection-multichat-${name}`);
      };
      const closedEvidence = await projectionDeliveryEvidence();
      expect(
        closedEvidence.requestedChats.filter((chatId) => histories.some((history) => history.chatId === chatId)),
      ).toEqual([]);
      await checkpoint('closed-before-connection');
      await target.click(selectors.getByRole('link', { name: `Open ${manifest.name}`, exact: true }));
      await expect
        .poll(
          async () => {
            const delivery = await projectionDeliveryEvidence();
            return histories.every((history) =>
              delivery.outstandingReads.some((read) => read.chatId === history.chatId && read.cursor === history.rows),
            );
          },
          { timeout: 120_000 },
        )
        .toBe(true);
      const list = selectors.getByCss(`#project-chats-${project.projectId}`);
      await target.expectCount(list.getByRole('link'), 5);
      await target.workerCatchUpFlow(true);
      const hidden = histories[0]!;
      const hiddenLink = list.getByCss(`a[href*="chat=${encodeURIComponent(hidden.chatId)}"]`);
      await target.expectCount(hiddenLink, 0);
      await checkpoint('six-connected-five-visible');
      await target.click(selectors.getByRole('button', { name: `Collapse ${manifest.name}`, exact: true }));
      await target.expectCount(list, 0);
      expect(await target.workers('agent-host.worker')).not.toHaveLength(0);
      await checkpoint('six-connected-collapsed');
      await target.click(selectors.getByRole('button', { name: `Expand ${manifest.name}`, exact: true }));
      await target.click(selectors.getByRole('button', { name: 'Show more chats', exact: true }));
      await target.click(hiddenLink);
      await target.expectVisible(selectors.getByText(/Fixture turn 250 of 250\./u), 120_000);
      await sendDraft('Continue a history that remained observed while hidden.');
      await target.expectVisible(selectors.getByText('Hidden history suffix completed.', { exact: true }), 60_000);
      await expectLogInvariant(hidden.chatId, { runs: 251 });
      await checkpoint('hidden-suffix-current');
      await target.click(selectors.getByRole('button', { name: `More actions for ${manifest.name}`, exact: true }));
      await target.click(selectors.getByRole('menuitem', { name: `Close ${manifest.name}`, exact: true }));
      await target.navigate('/projects');
      await expect
        .poll(
          async () => {
            const evidence = await projectionDeliveryEvidence();
            return evidence.outstandingReadCount;
          },
          { timeout: 30_000 },
        )
        .toBe(0);
      await target.delay(2100);
      await checkpoint('connector-closed-after-retirement');
    } finally {
      await target.stopCpuProfile('projection-multichat-profile.cpuprofile');
    }
  },
);
