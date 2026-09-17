import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import {
  getKernelResultOutputSchema,
  rpcSchemasRegistry,
  screenshotOutputSchema,
  testModelOutputSchema,
} from '@taucad/chat';
import { afterEach, expect, test } from 'vitest';
import type { Locator, Page } from 'playwright';
import { authenticatePackagedDesktop, launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import { durableMessages, latestCompletedRun, toolResult } from '#support/acp-evidence.js';
import { gatewayFixtureFinalText, gatewayFixtureModelName, installGatewayFixture } from '#support/gateway-fixture.js';
import type { GatewayFixture } from '#support/gateway-fixture.js';
import { deleteTauTestUser, seedTauTestUser, tauTestAccount } from '#support/tau-account.js';
import {
  activeChatId,
  connectPickedFolder,
  expectCount,
  expectSignedIn,
  expectVisible,
  openExecutionPicker,
  parkPointer,
  selectAgentModel,
  selectChatModel,
  selectKernel,
  sendPrompt,
  submitPrompt,
  waitForProjectOnDisk,
} from '#support/scenario.js';

/**
 * The external-agent arm of the desktop shell (W4-ACP), end to end on a real
 * machine: main discovers the pinned ACP adapters beside the app, the renderer
 * draws one execution row per adapter, and a turn placed on the Codex row is
 * answered by the operator's own Codex login.
 *
 * Not a mocked tier, and it cannot be: every other desktop spec drives the Tau
 * gateway through a fixture, but an external turn never reaches the gateway at
 * all — the adapter brings its own model, its own tools and its own credential
 * (X6). What is being asserted here is exactly the part no fixture can stand in
 * for: that the adapters resolve from `apps/desktop/node_modules`, that the
 * services utility can spawn one under Electron, and that its reply reaches the
 * transcript. It therefore spends the operator's own Codex quota, and skips
 * when the machine has no Codex to spend.
 *
 * The gateway fixture is still installed: the *seeding* turn that creates the
 * project is an ordinary Tau turn, and only the second turn is external.
 */

const seedPrompt = 'Create a cube with a centered cylindrical cutout and verify it.';
/** One word, no tools, cheap on every model — and unambiguous on screen. */
const externalPrompt = 'Reply with the single word pong.';
const cadInspectionPrompt =
  'Create a simple 20 mm cube in main.scad. Do not export anything. Check your work and briefly report the result.';
const packaged = process.env['TAU_E2E_ACP_PACKAGED'] === 'true';
const turbojetSourcePath = process.env['TAU_E2E_ACP_TURBOJET_SOURCE'];
const nativeTurbojet = process.env['TAU_E2E_TURBOJET_NATIVE'] === 'true';

if (turbojetSourcePath !== undefined && !existsSync(turbojetSourcePath)) {
  throw new Error(`Requested Turbojet fixture does not exist: ${turbojetSourcePath}`);
}

/**
 * Whether this machine can answer a Codex turn at all.
 *
 * Both halves are what the desktop's own discovery checks: the adapter must
 * resolve beside the app, and its CLI must answer — an adapter whose CLI is
 * missing is never advertised, so there would be no row to click.
 */
const codexAvailable = ((): boolean => {
  try {
    createRequire(join(import.meta.dirname, '../../desktop/package.json')).resolve(
      '@agentclientprotocol/codex-acp/package.json',
    );
    execFileSync('codex', ['--version'], { stdio: 'ignore', timeout: 30_000 });
    return true;
  } catch {
    return false;
  }
})();

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

test.skipIf(!codexAvailable)('uses native Tau skills and tools through the Codex row', async () => {
  const account = tauTestAccount('acp');
  seededEmail = account.email;
  const token = await seedTauTestUser(account);
  session = await launchDesktopApp({ token, packaged });
  if (packaged) {
    await authenticatePackagedDesktop(session, token);
  }
  const { page } = session;
  fixture = await installGatewayFixture(page);

  try {
    await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
    await expectSignedIn(page);

    await selectKernel(page, 'OpenSCAD');
    await connectPickedFolder(session);
    /* 1. Both adapters main discovered are offered as rows on this computer.
     * The renderer asks main for them over `externalAgentsChannel` (D17), so
     * this is the renderer half of the one discovery main performed. */
    const rows = await openExecutionPicker(page);
    /* Lane 15's selector work replaced the "· This computer" suffix: a row is
     * named for the adapter and described by where it runs (Q12.3). */
    expect(rows.join('\n')).toMatch(/Codex\s*Runs with your local Codex login/u);
    /* Claude Code is matched on the row's name alone: its note is a refusal
     * when that login is absent, and this cell is about discovery. */
    expect(rows.join('\n')).toMatch(/^Claude Code/mu);

    /* 2. The services utility received the same answer. Written inside the
     * process that spawns the adapter, so the renderer cannot produce it. */
    await expect
      .poll(() => (existsSync(session!.logPath) ? readFileSync(session!.logPath, 'utf8') : ''), { timeout: 60_000 })
      .toMatch(/agent-host-config-received.*"externalAgents":\[[^\]]*"codex"/u);

    /* 3. The first project turn is placed on the Codex row and answered by the
     * real adapter. Keeping this ACP-first makes the ACP contract independent
     * of a separate Tau-provider seed. */
    await page
      .getByRole('option', { name: /^Codex/u })
      .first()
      .click();
    await selectAgentModel(page, 'GPT-5.6-Sol');
    const gatewayCallsBefore = fixture.gatewayRequests.length;
    await submitPrompt(page, cadInspectionPrompt);
    await expect.poll(() => new URL(page.url()).searchParams.get('chat'), { timeout: 120_000 }).toBeTruthy();
    const chatId = activeChatId(page);
    const eventsPathNow = (): string => {
      const { pathname } = new URL(page.url());
      const projectRoot = join(session!.pickedDirectory, pathname.slice(pathname.lastIndexOf('/') + 1));
      return join(projectRoot, '.tau/chats', chatId, 'events.jsonl');
    };

    await expect.poll(() => readLog(eventsPathNow()), { timeout: 300_000 }).toMatch(/"state":"completed"/u);

    /* 4. Codex loaded the native skill and used Tau's ordinary MCP tools. The
     * prompt names neither skill, tool nor verification action, so these are
     * adoption assertions, not a coached transport probe. */
    const events = readLog(eventsPathNow());
    const runId = latestCompletedRun(events);
    expect(events).toMatch(/cad-openscad\/SKILL\.md/u);
    const messages = durableMessages(events);
    for (const toolName of ['get_kernel_result', 'screenshot']) {
      expect(
        messages.findLast((message) => message.role === 'tool-input' && message.toolName === toolName)?.content,
      ).toMatchObject({ targetFile: 'main.scad' });
    }
    expect(
      getKernelResultOutputSchema.parse(
        toolResult(events, { runId, toolName: 'get_kernel_result', targetFile: 'main.scad' }),
      ),
    ).toMatchObject({
      status: 'ready',
      kernelIssues: [],
    });
    const modelTest = testModelOutputSchema.parse(
      toolResult(events, { runId, toolName: 'test_model', targetFile: 'main.geospec.ts' }),
    );
    expect(modelTest.total).toBeGreaterThan(0);
    expect(modelTest.passed).toBe(modelTest.total);
    const capture = screenshotOutputSchema.parse(
      toolResult(events, { runId, toolName: 'screenshot', targetFile: 'main.scad' }),
    );
    expect(capture.images.every((image) => image.dataUrl.startsWith('data:image/'))).toBe(true);
    await expect
      .poll(() => finalizedRevisions(eventsPathNow()).at(-1)?.changedPaths.includes('main.scad'), { timeout: 60_000 })
      .toBe(true);
    const cadActivityGroups = await page
      .getByRole('button', {
        name: /^(?:Rendered models(?:, captured images)?(?:, ran tests)?|Captured images(?:, ran tests)?|Ran tests)$/u,
      })
      .all();
    expect(cadActivityGroups.length).toBeGreaterThan(0);
    for (const group of cadActivityGroups) {
      // oxlint-disable-next-line no-await-in-loop -- each disclosure state must settle before the next React update.
      await group.click();
    }
    await expectVisible(
      page.getByText(`Tested ${String(modelTest.total)} requirement${modelTest.total === 1 ? '' : 's'}`, {
        exact: true,
      }),
      60_000,
    );
    await expectVisible(page.getByRole('button', { name: /Captured 1 screenshot of main\.scad/u }), 60_000);
    await expectCount(page.getByText(/Received unknown part tool-/u), 0);

    /* 5. The turn was external, not a Tau turn wearing the row's label: the
     * gateway saw nothing, and the durable log records the ACP marker. */
    expect(fixture.gatewayRequests.length).toBe(gatewayCallsBefore);
    expect(events).toMatch(/"kind":"external-agent"/u);
    expect(events).toMatch(/"agentId":"codex"/u);

    // A colorful capture alone can be stale. Hold the geometry specification
    // fixed while distinguishing two targets and then editing only one target.
    const projectRoot = dirname(dirname(dirname(dirname(eventsPathNow()))));
    const otherSource = 'cube([8, 8, 40], center=true);\n';
    writeFileSync(join(projectRoot, 'other.scad'), otherSource);
    let previousCapture: string | undefined;
    let previousRun = runId;
    for (const dimensions of [
      [20, 20, 20],
      [40, 10, 10],
    ] as const) {
      const priorRun = previousRun;
      const controlledSource = `cube([${dimensions.join(', ')}], center=true);\n`;
      const volume = dimensions[0] * dimensions[1] * dimensions[2];
      const spec = `import { it, expectGeo } from 'geospec';
import { loadModel } from 'geospec/model';
it('conformance main volume and envelope', async () => {
  const model = await loadModel({ file: 'main.scad', format: 'glb' });
  expectGeo(model).toHaveVolume({ value: ${String(volume)}, tolerance: 0.01 });
  expectGeo(model).toHaveBoundingBox({ size: { x: ${String(dimensions[0])}, y: ${String(dimensions[1])}, z: ${String(dimensions[2])} }, tolerance: 0.01 });
});
it('conformance other volume and envelope', async () => {
  const model = await loadModel({ file: 'other.scad', format: 'glb' });
  expectGeo(model).toHaveVolume({ value: 2560, tolerance: 0.01 });
  expectGeo(model).toHaveBoundingBox({ size: { x: 8, y: 8, z: 40 }, tolerance: 0.01 });
});\n`;
      writeFileSync(join(projectRoot, 'main.scad'), controlledSource);
      writeFileSync(join(projectRoot, 'conformance.geospec.ts'), spec);
      const completionLine = `ACP verification ${dimensions.join('x')} complete.`;
      // oxlint-disable-next-line no-await-in-loop -- each turn measures the source version just written.
      await sendPrompt(
        page,
        `Do not edit any file. Use Tau get_kernel_result and one isometric screenshot for EACH of main.scad and other.scad, then run test_model with files ["conformance.geospec.ts"]. Report the observed results. End with this plain paragraph exactly once: ${completionLine}`,
      );
      // oxlint-disable-next-line no-await-in-loop -- await this exact subsequent run, not an older completed run.
      await expect
        .poll(
          () => {
            try {
              return latestCompletedRun(readLog(eventsPathNow()));
            } catch {
              return priorRun;
            }
          },
          { timeout: 300_000 },
        )
        .not.toBe(priorRun);
      const current = readLog(eventsPathNow());
      const currentRun = latestCompletedRun(current);
      // oxlint-disable-next-line no-await-in-loop -- check this run's actual rendered text, not only its correct durable log.
      await expectCount(page.getByRole('article').last().getByText(completionLine, { exact: true }), 1);
      const captures = ['main.scad', 'other.scad'].map((targetFile) => {
        expect(
          getKernelResultOutputSchema.parse(
            toolResult(current, { runId: currentRun, toolName: 'get_kernel_result', targetFile }),
          ),
        ).toMatchObject({ status: 'ready', kernelIssues: [] });
        const tests = testModelOutputSchema.parse(
          toolResult(current, { runId: currentRun, toolName: 'test_model', targetFile: 'conformance.geospec.ts' }),
        );
        expect(tests).toMatchObject({ passed: 2, total: 2, failures: [] });
        return screenshotOutputSchema.parse(
          toolResult(current, { runId: currentRun, toolName: 'screenshot', targetFile }),
        ).images[0]!.dataUrl;
      });
      expect(captures[0]).not.toBe(captures[1]);
      if (previousCapture !== undefined) {
        expect(captures[0]).not.toBe(previousCapture);
      }
      expect(readFileSync(join(projectRoot, 'main.scad'), 'utf8')).toBe(controlledSource);
      expect(readFileSync(join(projectRoot, 'other.scad'), 'utf8')).toBe(otherSource);
      expect(readFileSync(join(projectRoot, 'conformance.geospec.ts'), 'utf8')).toBe(spec);
      // oxlint-disable-next-line no-await-in-loop -- finalization is asynchronous relative to the terminal log row.
      await expect
        .poll(() => finalizedRevisions(eventsPathNow()).at(-1)?.runIds, { timeout: 60_000 })
        .toContain(currentRun);
      // A read-only turn mints no revision: admission has already saved the
      // controlled edit as its base. Verify that immutable head instead.
      const revision = execFileSync('git', ['-C', projectRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
      expect(execFileSync('git', ['-C', projectRoot, 'show', `${revision}:main.scad`], { encoding: 'utf8' })).toBe(
        controlledSource,
      );
      previousCapture = captures[0];
      previousRun = currentRun;
    }
    await expectCount(page.getByText(/Received (?:unknown part|reasoning-)/u), 0);
    await session.capture('acp-current-targets');

    console.info(`[desktop-e2e] acp chat=${chatId} rows=${rows.length}`);
  } catch (error) {
    await session.capture('acp-failure');
    throw error;
  }
});

test.skipIf(!codexAvailable || turbojetSourcePath === undefined)(
  'repairs the copied Turbojet Bézier failure through native Tau tools',
  async () => {
    const account = tauTestAccount('acp-turbojet');
    seededEmail = account.email;
    const token = await seedTauTestUser(account);
    session = await launchDesktopApp({ token, packaged });
    if (packaged) {
      await authenticatePackagedDesktop(session, token);
    }
    const { page } = session;
    fixture = await installGatewayFixture(page);

    try {
      await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
      await expectSignedIn(page);
      await selectKernel(page, 'Build123d');
      await connectPickedFolder(session);
      if (nativeTurbojet) {
        await selectChatModel(page, 'GPT-5.6 Luna');
      } else {
        const rows = await openExecutionPicker(page);
        expect(rows.join('\n')).toMatch(/Codex\s*Runs with your local Codex login/u);
        await page
          .getByRole('option', { name: /^Codex/u })
          .first()
          .click();
        await selectAgentModel(page, 'GPT-5.6-Sol');
      }

      const slug = await submitPrompt(page, externalPrompt);
      const sourcePath = await waitForProjectOnDisk(session.pickedDirectory, slug, { extension: '.py' });
      await expect.poll(() => new URL(page.url()).searchParams.get('chat'), { timeout: 120_000 }).toBeTruthy();
      const chatId = activeChatId(page);
      const eventsPath = join(dirname(sourcePath), '.tau/chats', chatId, 'events.jsonl');
      await expect.poll(() => readLog(eventsPath), { timeout: 300_000 }).toMatch(/"state":"completed"/u);

      if (turbojetSourcePath === undefined) {
        throw new Error('TAU_E2E_ACP_TURBOJET_SOURCE was removed after test selection.');
      }
      const source = readFileSync(turbojetSourcePath, 'utf8');
      const brokenSource = source
        .split('\n')
        .map((line) =>
          line.includes('Edge.make_bezier(')
            ? `${line.replace('Edge.make_bezier(', 'Edge.make_bezier([').slice(0, -1)}])`
            : line,
        )
        .join('\n');
      expect(brokenSource.match(/Edge\.make_bezier\(\[/gu)).toHaveLength(2);
      writeFileSync(sourcePath, brokenSource, 'utf8');
      await expectVisible(page.getByText(/At least two control points must be provided/u), 120_000);

      const completedBefore = (readLog(eventsPath).match(/"state":"completed"/gu) ?? []).length;
      await sendPrompt(
        page,
        'Repair the current Build123d turbojet model failure without changing its design. Make only the necessary argument-list correction in main.py; preserve every other source statement. Put any GeoSpec checks in main.geospec.ts. Check the repaired geometry and capture the result.',
      );
      await expect
        .poll(() => (readLog(eventsPath).match(/"state":"completed"/gu) ?? []).length, { timeout: 600_000 })
        .toBe(completedBefore + 1);

      const events = readLog(eventsPath);
      const runId = latestCompletedRun(events);
      expect(events).toMatch(/cad-build123d/u);
      expect(readFileSync(sourcePath, 'utf8')).not.toMatch(/Edge\.make_bezier\(\[/u);
      // The requested surgical repair must recover the controlled assembly, not replace
      // it with an unrelated shape that also compiles and produces colourful pixels.
      // Both removing the list wrapper and unpacking that exact list restore
      // the same variadic control points. No other assembly edits are allowed.
      const expectedRepairs = [source, brokenSource.replaceAll('Edge.make_bezier([', 'Edge.make_bezier(*[')];
      expect(expectedRepairs.map((repair) => repair.replaceAll(/\s/gu, ''))).toContain(
        readFileSync(sourcePath, 'utf8').replaceAll(/\s/gu, ''),
      );
      expect(
        getKernelResultOutputSchema.parse(
          toolResult(events, { runId, toolName: 'get_kernel_result', targetFile: 'main.py' }),
        ),
      ).toMatchObject({
        status: 'ready',
        kernelIssues: [],
      });
      const modelTest = testModelOutputSchema.parse(
        toolResult(events, { runId, toolName: 'test_model', targetFile: 'main.geospec.ts' }),
      );
      expect(modelTest.total).toBeGreaterThan(0);
      expect(modelTest.passed).toBe(modelTest.total);
      const captureResult = toolResult(events, { runId, toolName: 'screenshot', targetFile: 'main.py' });
      // Native tools retain the RPC envelope; MCP exposes the tool output itself.
      const capture = nativeTurbojet
        ? rpcSchemasRegistry.capture_images.resultSchema.parse(captureResult)
        : screenshotOutputSchema.parse(captureResult);
      if (!('images' in capture)) {
        throw new Error('The native Turbojet capture failed.');
      }
      const image = capture.images[0];
      if (image === undefined) {
        throw new Error('The repaired Turbojet capture returned no image.');
      }
      const pixels = await page.evaluate(async (dataUrl) => {
        const response = await fetch(dataUrl);
        const blob = await response.blob();
        const bitmap = await createImageBitmap(blob);
        const { height, width } = bitmap;
        const canvas = new OffscreenCanvas(64, 64);
        const context = canvas.getContext('2d');
        if (context === null) {
          throw new Error('2D canvas context unavailable while validating the ACP capture.');
        }
        context.drawImage(bitmap, 0, 0, 64, 64);
        bitmap.close();
        const rgba = context.getImageData(0, 0, 64, 64).data;
        const colors = new Set<string>();
        let minimum = 255;
        let maximum = 0;
        let opaque = 0;
        for (let index = 0; index < rgba.length; index += 4) {
          if (rgba[index + 3]! === 0) {
            continue;
          }
          opaque += 1;
          const red = rgba[index]!;
          const green = rgba[index + 1]!;
          const blue = rgba[index + 2]!;
          const luminance = (red + green + blue) / 3;
          minimum = Math.min(minimum, luminance);
          maximum = Math.max(maximum, luminance);
          colors.add(
            `${String(Math.floor(red / 16))}:${String(Math.floor(green / 16))}:${String(Math.floor(blue / 16))}`,
          );
        }
        return { colors: colors.size, height, luminanceRange: maximum - minimum, opaque, width };
      }, image.dataUrl);
      expect(pixels.width).toBeGreaterThan(100);
      expect(pixels.height).toBeGreaterThan(100);
      expect(pixels.opaque).toBeGreaterThan(1000);
      expect(pixels.colors).toBeGreaterThan(8);
      expect(pixels.luminanceRange).toBeGreaterThan(24);
      // Completion precedes revision settlement; wait for this run, not the seed's revision.
      await expect.poll(() => finalizedRevisions(eventsPath).at(-1)?.runIds, { timeout: 60_000 }).toContain(runId);
      expect(finalizedRevisions(eventsPath).at(-1)?.changedPaths).toContain('main.py');

      const activity = page.getByRole('button', { name: /Captured images/u }).last();
      await expectVisible(activity, 60_000);
      await activity.click();
      await expectVisible(
        page.getByRole('button', {
          name: `Captured ${String(capture.images.length)} screenshot${capture.images.length === 1 ? '' : 's'} of main.py`,
        }),
        60_000,
      );
      await expectCount(page.getByText(/Received unknown part tool-/u), 0);
      await session.capture(nativeTurbojet ? 'native-turbojet-repaired' : 'acp-turbojet-repaired');
      console.info(
        `[desktop-e2e] turbojet native=${String(nativeTurbojet)} chat=${chatId} pixels=${JSON.stringify(pixels)}`,
      );
    } catch (error) {
      await session.capture('acp-turbojet-failure');
      throw error;
    }
  },
  900_000,
);

/**
 * The operator's actual flow, and the one turn the spec above cannot reach:
 * Codex is picked on the **home hero**, and the very first turn of the new
 * project is the seeded one.
 *
 * That turn is the app's only bodyless dispatch — `loadChatActor` consumes
 * `Chat.startupRequest` and dispatches it before the chat row's
 * `activeExecution` has hydrated into the React tree — so it is the only place
 * a selection can be honoured everywhere durable and still be discarded on the
 * wire. It ran as Tau-on-the-daemon at the cookie model until the consumed
 * row's execution was threaded onto the dispatch itself.
 */
test.skipIf(!codexAvailable)(
  'answers the seeded first turn through the Codex row picked on the home hero',
  async () => {
    const account = tauTestAccount('acp-seeded');
    seededEmail = account.email;
    const token = await seedTauTestUser(account);
    session = await launchDesktopApp({ token, packaged });
    if (packaged) {
      await authenticatePackagedDesktop(session, token);
    }
    const { page } = session;
    /* Only the project-name turn reaches the gateway on this leg; the CAD turn
     * is external and never does. The fixture is still what funds that name. */
    fixture = await installGatewayFixture(page);

    try {
      await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
      await expectSignedIn(page);

      await selectKernel(page, 'OpenSCAD');
      await connectPickedFolder(session);

      /* Picked *before* the first submit: the home hero is session-backed, so the
       * choice lands in the Home composer record and the new project's chat row is
       * created carrying it. */
      const rows = await openExecutionPicker(page);
      expect(rows.join('\n')).toMatch(/Codex\s*Runs with your local Codex login/u);
      await page
        .getByRole('option', { name: /^Codex/u })
        .first()
        .click();
      await selectAgentModel(page, 'GPT-5.6-Sol');

      await submitPrompt(page, externalPrompt);

      /* A home-hero submit routes to `/w/<workspace>/new-project` with no `chat`
       * param, and both the slug and the directory on disk are renamed when the
       * name generator answers — so the log path is re-derived from the live URL
       * on every poll rather than captured once. */
      await expect.poll(() => new URL(page.url()).searchParams.get('chat'), { timeout: 120_000 }).toBeTruthy();
      const chatId = activeChatId(page);
      const eventsPathNow = (): string => {
        const { pathname } = new URL(page.url());
        return join(session!.pickedDirectory, pathname.slice(pathname.lastIndexOf('/') + 1), '.tau/chats', chatId);
      };
      const durableLog = (): string => {
        const path = join(eventsPathNow(), 'events.jsonl');
        return existsSync(path) ? readFileSync(path, 'utf8') : '';
      };

      /* Settlement is read from the durable log the daemon wrote, not from the
       * transcript: a partially rendered reply must not pass for a finished turn.
       * The seeded turn ran on Codex, not on a Tau host wearing the chip's label. */
      await expect.poll(durableLog, { timeout: 300_000 }).toMatch(/"state":"completed"/u);
      const events = durableLog();
      expect(events).toMatch(/"kind":"external-agent"/u);
      expect(events).toMatch(/"agentId":"codex"/u);
      await expectVisible(page.getByText(/^\s*pong[\s.!]*$/iu).first(), 60_000);

      console.info(`[desktop-e2e] acp seeded chat=${chatId} log=${eventsPathNow()}`);
    } catch (error) {
      await session.capture('acp-seeded-failure');
      throw error;
    }
  },
);

/** The candidate turn's instruction: one deterministic, cheap edit to the seeded model. */
const candidatePrompt =
  "Add the exact line `// candidate` as the very first line of main.scad. Change nothing else in the file and edit no other file. Then use Tau's get_kernel_result, test_model, and screenshot tools against this checkout and briefly report their results.";

/** The one line the candidate turn is asked to prepend. */
const candidateMarker = '// candidate';

/** One chat's durable log as text, empty until the appender has created it. */
const readLog = (logPath: string): string => (existsSync(logPath) ? readFileSync(logPath, 'utf8') : '');

/**
 * One `turn.finalized` record as the durable log carries it (north star S9, W5).
 *
 * One schema on every host: the same object the browser worker emits on its
 * revision port is the record this Node host appends to the chat's own log.
 */
type FinalizedTurn = {
  readonly turnId: string;
  readonly runId: string;
  readonly revisionId?: string;
  readonly treeId?: string;
  readonly branch?: string;
  readonly changedPaths: readonly string[];
  readonly runIds: readonly string[];
};

/**
 * Every turn one chat's durable log has settled, in order.
 *
 * Parsed rather than pattern-matched because the *identity* is the evidence
 * this cell owes: the revision ids in order, and the branch each landed on.
 *
 * @param logPath - The chat's `events.jsonl`.
 * @returns The settled turns, oldest first.
 */
const finalizedRevisions = (logPath: string): readonly FinalizedTurn[] =>
  (existsSync(logPath) ? readFileSync(logPath, 'utf8') : '').split('\n').flatMap((line) => {
    if (line.trim().length === 0) {
      return [];
    }
    try {
      const event = JSON.parse(line) as { readonly type?: string };
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the discriminant is checked.
      return event.type === 'turn.finalized' ? [event as unknown as FinalizedTurn] : [];
    } catch {
      /* An appender flushing its last line mid-read is the next poll's problem. */
      return [];
    }
  });

/** The Branches porcelain's own section, and one branch's row inside it. */
const branchesSection = (page: Page): Locator => page.getByRole('list', { name: 'Branches' });
/* Matched on the row's *name*, not on its text: every row also carries a diff
 * line naming the branch it is compared against ("1 file differs from main"),
 * so `hasText` alone matched both rows. */
const branchRow = (page: Page, branchName: string): Locator =>
  branchesSection(page)
    .locator('li')
    .filter({ has: page.getByText(branchName, { exact: true }) });

const expectCurrentBranch = async (page: Page, branchName: string): Promise<void> => {
  await expect
    .poll(async () => branchRow(page, branchName).getAttribute('aria-current'), { timeout: 60_000 })
    .toBe('true');
};

/**
 * G-REV-EXT live in candidate mode (J-E), and the populated look G-REV-PORCELAIN
 * owes — one project, one Tau turn in the live folder, one Codex turn in a
 * checkout of its own, and the four branch verbs over what they published.
 *
 * The two turns are on **two chats** on purpose: a direct turn records onto the
 * trunk the live tree tracks (`main`) and a candidate onto the named linked
 * checkout (`isolated-run`), so two chats is the smallest shape in which
 * switch, merge and discard exist at all.
 *
 * Isolation is sampled rather than inferred: the live `main.scad` stays
 * byte-identical to the seed while the candidate runs and after it settles;
 * only an explicit Switch or Merge moves those bytes into the project folder.
 */
test.skipIf(!codexAvailable)(
  'switches Tau to a Codex candidate and back while driving branch revision verbs',
  async () => {
    const account = tauTestAccount('acp-rev');
    seededEmail = account.email;
    const token = await seedTauTestUser(account);
    session = await launchDesktopApp({ token, packaged });
    if (packaged) {
      await authenticatePackagedDesktop(session, token);
    }
    const { page } = session;
    /* The shell opens at 1440×900 (`apps/desktop/src/main/main.ts`), and at that
     * width the project route's composer is narrow enough that its right-hand
     * action group sits *over* the left group's last controls — the revision
     * selector included, which is the one control this spec has to click.
     * Maximizing does not clear it (the chat pane still opens at its Allotment
     * minimum); the sash drag below is what makes the control hittable
     * (lane 9-je-live finding 1). Maximized is still the operator's real state. */
    await session.application.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.maximize();
    });
    fixture = await installGatewayFixture(page);

    try {
      await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
      await expectSignedIn(page);

      await selectKernel(page, 'OpenSCAD');
      await connectPickedFolder(session);
      await selectChatModel(page, gatewayFixtureModelName);

      /* 1–2. The Tau turn, in the default `direct` mode: it creates the project,
       * its first chat, and the first revision every later step names. */
      const slug = await submitPrompt(page, seedPrompt);
      await waitForProjectOnDisk(session.pickedDirectory, slug, { extension: '.scad' });
      const directChatId = activeChatId(page);
      /* Re-derived on every read: the slug and the directory are both renamed
       * when the project-name generator answers. */
      const projectRoot = (): string => {
        const { pathname } = new URL(page.url());
        return join(session!.pickedDirectory, pathname.slice(pathname.lastIndexOf('/') + 1));
      };
      const logOf = (chatId: string): string => join(projectRoot(), '.tau/chats', chatId, 'events.jsonl');
      const liveSource = (): string => {
        const path = join(projectRoot(), 'main.scad');
        return existsSync(path) ? readFileSync(path, 'utf8') : '(main.scad is missing)';
      };

      await expect.poll(() => finalizedRevisions(logOf(directChatId)).length, { timeout: 300_000 }).toBeGreaterThan(0);
      const directRevision = finalizedRevisions(logOf(directChatId))[0]!;
      /* The durable settlement is written before the worker's projection has
       * necessarily published the new head. A branch created in that window is
       * correctly refused as unborn because no base revision is visible yet.
       * Synchronize on the user-visible head instead of racing that projection. */
      await expectVisible(page.getByRole('button', { name: /^Open Revisions\. You are on main, Rev \d+\.$/u }), 60_000);
      const seededSource = liveSource();
      expect(seededSource).toContain('difference()');
      /* A direct turn records onto the trunk the live tree tracks, and creates
       * it on a project's first turn (operator decisions 2026-09-09, Q11). */
      expect(directRevision.branch).toBe('main');

      /* 3. A second chat gets a named branch and linked checkout. Created before
       * anything is spent: a failure here costs no quota. */
      await parkPointer(page);
      await page
        .getByRole('button', { name: /^New chat in /u })
        .first()
        .click();
      await expect.poll(() => new URL(page.url()).searchParams.get('chat'), { timeout: 60_000 }).not.toBe(directChatId);
      const candidateChatId = activeChatId(page);
      const candidateBranch = 'isolated-run';

      /* The chat pane opens at its minimum width, and at that width the
       * composer's right-hand action group ("Add context", attach, send) sits
       * *over* the tail of its left group — the revision selector included, so
       * the one control this cell has to click cannot be hit. Widening the pane
       * is what an operator does about it, and it is the honest fix here; the
       * overlap itself is reported as a finding rather than papered over with a
       * synthetic event. */
      /* Scoped to the project workspace's own Allotment: the app sidebar has a
       * sash of its own, and it is the first one in the document. */
      const sash = page.locator('[data-project-workspace] .sash-container > .sash').first();
      const sashBounds = await sash.boundingBox();
      expect(sashBounds, 'the chat pane offers no drag handle to widen it').not.toBeNull();
      await page.mouse.move(sashBounds!.x + sashBounds!.width / 2, sashBounds!.y + sashBounds!.height / 2);
      await page.mouse.down();
      await page.mouse.move(sashBounds!.x + 360, sashBounds!.y + sashBounds!.height / 2, { steps: 12 });
      await page.mouse.up();
      await parkPointer(page);

      /* The Codex row, then `New branch`: the revision control is offered by the
       * placement's capability, so it is the same control a Tau turn picks. */
      const rows = await openExecutionPicker(page);
      /* The row is named for the adapter and described by where it runs. */
      expect(rows.join('\n')).toMatch(/Codex\s*Runs with your local Codex login/u);
      await page
        .getByRole('option', { name: /^Codex/u })
        .first()
        .click();
      await selectAgentModel(page, 'GPT-5.6-Sol');
      await parkPointer(page);
      /* The composer picker replaced the deleted revision-mode selector (W7): a
         branch is made by name, and the chip then names it. */
      await page.locator('[data-slot="chat-branch-picker"]').first().click();
      await page.getByText('New branch', { exact: true }).first().click();
      await page.getByLabel('Name for the new branch').fill('isolated-run');
      await page.getByRole('button', { name: 'Create' }).first().click();
      await expectVisible(page.locator('[aria-label="Work in isolated-run. Choose a branch."]'), 30_000);

      /* 4. The isolation claim, sampled rather than inferred. */
      const samples: Array<{ readonly live: string; readonly settled: boolean }> = [];
      const sampler = setInterval(() => {
        const live = liveSource();
        samples.push({ live, settled: readLog(logOf(candidateChatId)).includes('"state":"completed"') });
      }, 200);
      const gatewayCallsBefore = fixture.gatewayRequests.length;
      try {
        await sendPrompt(page, candidatePrompt);
        await expect.poll(() => readLog(logOf(candidateChatId)), { timeout: 300_000 }).toMatch(/"state":"completed"/u);
      } finally {
        clearInterval(sampler);
      }
      const leaked = samples.filter((sample) => !sample.settled && sample.live !== seededSource);
      expect(samples.length, 'the candidate turn was never sampled').toBeGreaterThan(0);
      expect(
        leaked.length,
        `the live main.scad changed in ${String(leaked.length)} of ${String(samples.length)} mid-turn samples`,
      ).toBe(0);

      /* The turn really was external, really was a candidate, and really landed
       * on the candidate lane's own branch. */
      const candidateEvents = readLog(logOf(candidateChatId));
      /* The three facts on one envelope, not three matches anywhere in the log
       * (9-review N3). */
      const envelope = candidateEvents
        .split('\n')
        .filter((line) => line.includes('"message.envelope-replaced"'))
        .map((line) => JSON.parse(line) as { replacement?: { metadata?: { tauInternal?: Record<string, unknown> } } })
        .map((event) => event.replacement?.metadata?.tauInternal)
        .find((marker) => marker !== undefined);
      expect(envelope).toMatchObject({ kind: 'external-agent', agentId: 'codex', mode: 'candidate' });
      for (const toolName of ['get_kernel_result', 'test_model', 'screenshot']) {
        expect(candidateEvents).toMatch(new RegExp(`"role":"tool-output"[^\\n]*"toolName":"${toolName}"`, 'u'));
      }
      expect(candidateEvents).not.toMatch(/Main refused the desktop runtime-port request/u);
      expect(fixture.gatewayRequests.length, 'an external turn must not reach the Tau gateway').toBe(
        gatewayCallsBefore,
      );
      await expect
        .poll(() => finalizedRevisions(logOf(candidateChatId)).length, { timeout: 120_000 })
        .toBeGreaterThan(0);
      const candidateRevision = finalizedRevisions(logOf(candidateChatId)).at(-1)!;
      expect(candidateRevision.branch).toBe(candidateBranch);
      expect(candidateRevision.changedPaths).toContain('main.scad');
      const candidateRevisionId = candidateRevision.revisionId;
      if (candidateRevisionId === undefined) {
        throw new Error('Candidate turn finalized without a revision ID.');
      }
      const candidateRevisionNumber = Number.parseInt(
        execFileSync('git', ['-C', projectRoot(), 'rev-list', '--first-parent', '--count', candidateRevisionId], {
          encoding: 'utf8',
        }).trim(),
        10,
      );
      const checkoutMetadata = readdirSync(join(projectRoot(), '.git/worktrees'))[0]!;
      const candidateRoot = dirname(
        readFileSync(join(projectRoot(), '.git/worktrees', checkoutMetadata, 'gitdir'), 'utf8').trim(),
      );
      const candidateSource = readFileSync(join(candidateRoot, 'main.scad'), 'utf8');
      expect(candidateSource, 'the candidate turn wrote nothing to distinguish it from the seed').not.toBe(
        seededSource,
      );

      /* 5. The porcelain. */
      await parkPointer(page);
      await page
        .getByRole('button', { name: /Search/u })
        .first()
        .click();
      await page.getByPlaceholder('Search projects, chats, and actions...').fill('Open revision history');
      await page.getByText('Open revision history', { exact: true }).first().click();
      await expectVisible(branchesSection(page), 60_000);
      // oxlint-disable-next-line unicorn/prefer-dom-node-text-content -- `innerText` keeps the line breaks this evidence is read by.
      const listedText = await branchesSection(page).innerText();
      const listed = listedText.trim();
      expect(listed).toContain(candidateBranch);
      expect(listed).toContain(directRevision.branch ?? 'main');
      await session.capture('rev-branches-list');

      /* 6. Re-root between the live and linked checkouts without copying either
       * tree over the other. */
      // Selecting a chat checkout does not move the independently browsed workbench.
      await expectCurrentBranch(page, 'main');
      await expectVisible(
        page.getByRole('button', { name: `Restore to Revision ${String(candidateRevisionNumber)}`, exact: true }),
        60_000,
      );
      expect(liveSource()).toBe(seededSource);

      await branchRow(page, candidateBranch)
        .getByRole('button', { name: `Switch to ${candidateBranch}`, exact: true })
        .click();
      await expectCurrentBranch(page, candidateBranch);
      expect(liveSource()).toBe(seededSource);
      expect(candidateSource).toContain(candidateMarker);
      await session.capture('rev-branches-after-switch');

      /* Back onto the trunk, the same verb in the other direction. */
      await branchRow(page, 'main').getByRole('button', { name: 'Switch to main', exact: true }).click();
      await expect.poll(liveSource, { timeout: 120_000 }).toBe(seededSource);
      await expectCurrentBranch(page, 'main');

      /* Merge the candidate into the trunk from their shared base. */
      const revisionStatusButton = page.getByRole('button', { name: /^Open Revisions\./u }).first();
      const beforeMerge = await revisionStatusButton.getAttribute('aria-label');
      await branchRow(page, candidateBranch)
        .getByRole('button', { name: `Actions for ${candidateBranch}`, exact: true })
        .click();
      await page.getByRole('menuitem', { name: `Merge ${candidateBranch} into main`, exact: true }).click();
      await expectVisible(page.getByText(`Merged ${candidateBranch}`, { exact: true }), 120_000);
      await expect
        .poll(async () => revisionStatusButton.getAttribute('aria-label'), { timeout: 120_000 })
        .not.toBe(beforeMerge);
      const mergeResult = `Merged ${candidateBranch} into main`;
      /* And the live tree follows the head reference: the merge lands in the
       * project folder without a second checkout. */
      await expect.poll(liveSource, { timeout: 120_000 }).toContain(candidateMarker);
      await session.capture('rev-branches-after-merge');

      /* Discard the candidate's checkout and ref. The revisions it reached
       * stay in the store; only the independent branch and worktree go. */
      await branchRow(page, candidateBranch)
        .getByRole('button', { name: `Actions for ${candidateBranch}`, exact: true })
        .click();
      await page.getByRole('menuitem', { name: `Discard branch changes from ${candidateBranch}`, exact: true }).click();
      await expectCount(branchRow(page, candidateBranch), 0, 60_000);
      await session.capture('rev-branches-after-discard');

      // Discard does not silently transfer a chat's write authority to main.
      await page.getByRole('button', { name: 'Branch unavailable. Choose a branch.' }).click();
      await page.getByRole('option', { name: 'main', exact: true }).click();
      await expectVisible(page.getByRole('button', { name: 'Work in main. Choose a branch.' }), 30_000);

      /* Switch the same chat back to Tau after the ACP turn. The provider
       * fixture proves the next turn used Tau's gateway, while the durable
       * settlement proves the chat and revision loop continued normally. */
      const completedBeforeNativeReturn = (candidateEvents.match(/"state":"completed"/gu) ?? []).length;
      const finalizedBeforeNativeReturn = finalizedRevisions(logOf(candidateChatId)).length;
      const gatewayCallsBeforeNativeReturn = fixture.gatewayRequests.length;
      await openExecutionPicker(page);
      await page.getByRole('option', { name: 'Select agent: Tau' }).click();
      await selectChatModel(page, gatewayFixtureModelName);
      await expectVisible(page.getByRole('button', { name: 'Select agent: Tau' }), 30_000);
      await sendPrompt(page, 'Continue this chat with Tau.');
      await expect
        .poll(() => (readLog(logOf(candidateChatId)).match(/"state":"completed"/gu) ?? []).length, {
          timeout: 180_000,
        })
        .toBe(completedBeforeNativeReturn + 1);
      expect(fixture.gatewayRequests.length).toBeGreaterThan(gatewayCallsBeforeNativeReturn);
      await expectVisible(page.getByText(gatewayFixtureFinalText, { exact: true }).last(), 60_000);
      await expect
        .poll(() => finalizedRevisions(logOf(candidateChatId)).length, { timeout: 120_000 })
        .toBe(finalizedBeforeNativeReturn + 1);
      expect(finalizedRevisions(logOf(candidateChatId)).at(-1)?.branch).toBe('main');

      /* Restore to the direct turn's revision: the live folder is the seed again. */
      await page.getByRole('button', { name: 'Restore to Revision 2', exact: true }).first().click();
      await expect.poll(liveSource, { timeout: 120_000 }).toBe(seededSource);
      await session.capture('rev-branches-after-restore');

      console.info(
        `[desktop-e2e] j-e ${JSON.stringify({
          project: projectRoot(),
          directChatId,
          candidateChatId,
          revisionsInOrder: [directRevision, candidateRevision].map((revision) => ({
            turnId: revision.turnId,
            revisionId: revision.revisionId,
            treeId: revision.treeId,
            branch: revision.branch,
            changedPaths: revision.changedPaths,
            runIds: revision.runIds,
          })),
          candidateBranch,
          mergeResult,
          midTurnSamples: samples.length,
          midTurnLeaks: leaked.length,
          branchesListed: listed,
        })}`,
      );
    } catch (error) {
      await session.capture('acp-revision-failure');
      throw error;
    }
  },
  900_000,
);

/**
 * W15: an image and a PDF reach the external agent as content blocks (D23).
 *
 * An ACP turn never touches the gateway, so the only place the bytes can be
 * observed from here is the agent's own answer: the two numbers live *only*
 * inside `bracket-spec.pdf`, and the dark bore lives *only* inside the photo.
 * The durable rows are checked beside it — a chat that inlined base64 instead of
 * writing `file-ref` rows would still answer, and would still be wrong.
 */
test.skipIf(!codexAvailable)(
  'hands an image and a PDF to the external agent as content blocks',
  async () => {
    const account = tauTestAccount('acp-attachments');
    seededEmail = account.email;
    const token = await seedTauTestUser(account);
    session = await launchDesktopApp({ token, packaged });
    if (packaged) {
      await authenticatePackagedDesktop(session, token);
    }
    const { page } = session;
    fixture = await installGatewayFixture(page);
    const fixturesRoot = join(import.meta.dirname, '../fixtures');
    const attachmentPrompt =
      'Two files are attached: a specification and a photo. ' +
      'Do not create or edit any file. Reply with exactly one line: ' +
      'HOLE=<hole diameter in mm from the specification> PLATE=<plate thickness in mm from the specification> ' +
      'DARK=<yes if the photo shows a dark circular bore, otherwise no>';

    try {
      await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
      await expectSignedIn(page);
      await selectKernel(page, 'OpenSCAD');
      await connectPickedFolder(session);

      /* The model row is picked first: the model picker exists only while the
       * execution is Tau, and its catalog row is what gates the composer's
       * attachment picker (D20). */
      await selectChatModel(page, gatewayFixtureModelName);
      const slug = await submitPrompt(page, seedPrompt);
      await waitForProjectOnDisk(session.pickedDirectory, slug, { extension: '.scad' });

      const rows = await openExecutionPicker(page);
      expect(rows.join('\n')).toMatch(/Codex/u);
      await page
        .getByRole('option', { name: /^Codex/u })
        .first()
        .click();
      await selectAgentModel(page, 'GPT-5.6-Sol');

      await page
        .locator('input[type="file"][accept*="application/pdf"]')
        .first()
        .setInputFiles([join(fixturesRoot, 'bracket-photo.jpg'), join(fixturesRoot, 'bracket-spec.pdf')]);
      await expectVisible(page.getByText(/^PDF · /u).first(), 60_000);
      await expectVisible(page.getByRole('button', { name: 'Open uploaded image 1' }), 60_000);

      const chatId = activeChatId(page);
      const logPath = join(session.pickedDirectory, slug, '.tau/chats', chatId, 'events.jsonl');
      await sendPrompt(page, attachmentPrompt);

      await expect
        .poll(() => (existsSync(logPath) ? readFileSync(logPath, 'utf8') : ''), { timeout: 600_000 })
        .toMatch(/HOLE\s*=/u);
      const events = readFileSync(logPath, 'utf8');
      /* Durable rows stay by reference on every path, external included (D14). */
      expect(events).toContain('"file-ref"');
      expect(events).not.toContain('"data":"/9j/');
      const answer = events.slice(events.lastIndexOf('HOLE='));
      expect(answer, 'the agent did not read the specification PDF').toMatch(/HOLE\s*=\s*"?7\.3/u);
      expect(answer, 'the agent did not read the specification PDF').toMatch(/PLATE\s*=\s*"?4\.5/u);
      expect(answer, 'the agent did not receive the image').toMatch(/DARK\s*=\s*"?yes/iu);
      console.info(`[desktop-e2e] acp attachment answer: ${answer.slice(0, 200)}`);
    } catch (error) {
      await session.capture('acp-attachments-failure');
      throw error;
    }
  },
  900_000,
);
