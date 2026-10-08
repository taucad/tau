import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { authenticatePackagedDesktop, launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import { currentRun, latestCompletedRun } from '#support/acp-evidence.js';
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

/**
 * Every kernel skill, consumed by a real Codex turn through the packaged app
 * (kernel-skill-api-context W11).
 *
 * Each case asks for a modest model plus GeoSpec verification and asserts what
 * the skill change is for: the kernel skill and `geospec-authoring` are read,
 * the model evaluates, and its GeoSpec run passes. It also records the cost the
 * Core API section exists to cut — tool calls and reference lookups between
 * skill activation and the first model write — using the definitions of the
 * 2026-10-08 transcript baseline (median 16 calls, 10 lookups), so a run's
 * evidence directory answers "did the agent still have to grep?".
 *
 * It spends the operator's own Codex quota and needs a completed package, so it
 * is opt-in (`TAU_E2E_KERNEL_SKILLS=true`) and runs only from its own target.
 */

const enabled = process.env['TAU_E2E_KERNEL_SKILLS'] === 'true';
/** Iterate against the unpackaged shell; the acceptance target selects the completed package. */
const packaged = process.env['TAU_E2E_ACP_PACKAGED'] === 'true';
/** The Codex model every case runs on; no substitution when the adapter does not advertise it. */
const modelPattern = new RegExp(process.env['TAU_E2E_KERNEL_SKILLS_MODEL'] ?? '^GPT-6-Sol$', 'iu');
const only = process.env['TAU_E2E_KERNEL_SKILLS_ONLY']?.split(',').map((name) => name.trim().toLowerCase());

const verify =
  'Write deterministic GeoSpec geometry tests for its intended dimensions, run them, and fix the model until they pass. Report the result.';

const kernelCases = [
  {
    kernel: 'Replicad',
    skill: 'cad-replicad',
    model: 'main.ts',
    prompt: `Design a flanged pipe coupling: 60 mm flange diameter, 12 mm thick, a 20 mm bore, six 5 mm bolt holes on a 45 mm pitch circle and filleted outer edges. ${verify}`,
  },
  {
    kernel: 'Manifold',
    skill: 'cad-manifold',
    model: 'main.ts',
    prompt: `Design a 50 × 30 × 10 mm mounting bracket with two 5 mm through holes and a 12 mm diameter, 8 mm tall boss. ${verify}`,
  },
  {
    kernel: 'JSCAD',
    skill: 'cad-jscad',
    model: 'main.ts',
    prompt: `Design a 40 mm tall vase with a 30 mm wide hexagonal profile, 2 mm walls and a 30 degree twist. ${verify}`,
  },
  {
    kernel: 'OpenCascade',
    skill: 'cad-opencascadejs',
    model: 'main.ts',
    prompt: `Design a 40 × 40 × 10 mm plate with a centred 20 mm through hole and 2 mm filleted vertical edges. ${verify}`,
  },
  {
    kernel: 'PicoVoxel',
    skill: 'cad-picovoxel',
    model: 'main.ts',
    prompt: `Design a 40 mm cube filled with a gyroid lattice inside a 2 mm solid shell. ${verify}`,
  },
  {
    kernel: 'PicoGK',
    skill: 'cad-picogk',
    model: 'main.cs',
    prompt: `Design a 30 mm sphere with a 10 mm diameter cylindrical channel through its centre. ${verify}`,
  },
  {
    kernel: 'Build123d',
    skill: 'cad-build123d',
    model: 'main.py',
    prompt: `Design a 50 × 30 × 15 mm block with a centred counterbored hole (6 mm through, 11 mm × 4 mm counterbore) and 1 mm chamfered top edges. ${verify}`,
  },
  {
    kernel: 'OpenSCAD',
    skill: 'cad-openscad',
    model: 'main.scad',
    prompt: `Design a 60 × 40 × 20 mm enclosure base with 2 mm walls and four corner screw bosses with 3 mm holes. ${verify}`,
  },
  {
    kernel: 'Zoo (KCL)',
    skill: 'cad-zoo',
    // The desktop runtime that serves agent tools has no Zoo kernel yet, so `main.kcl` cannot evaluate.
    blockedBy: 'desktop runtime has no Zoo kernel',
    model: 'main.kcl',
    prompt: `Design a 40 × 20 mm plate with 3 mm rounded corners, 5 mm thick, with two 6 mm holes 24 mm apart. ${verify}`,
  },
  {
    kernel: 'tscircuit',
    skill: 'cad-tscircuit',
    model: 'main.tsx',
    prompt: `Design a 20 × 15 mm LED board: a 330 Ω resistor in series with a red LED, powered from a 2-pin header for 5 V and GND. ${verify}`,
  },
] as const;

/** Every case by default, except blocked ones, which run only when named in TAU_E2E_KERNEL_SKILLS_ONLY. */
const selected = kernelCases.filter((control) =>
  only === undefined ? !('blockedBy' in control) : only.includes(control.kernel.toLowerCase()),
);
const unknownKernels = (only ?? []).filter(
  (name) => !kernelCases.some((control) => control.kernel.toLowerCase() === name),
);
if (unknownKernels.length > 0) {
  throw new Error(
    `TAU_E2E_KERNEL_SKILLS_ONLY names no case: ${unknownKernels.join(', ')}. Cases: ${kernelCases.map(({ kernel }) => kernel).join(', ')}`,
  );
}

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

type ToolCall = {
  readonly id: string;
  readonly name: string;
  readonly kind?: string;
  readonly title: string;
  input?: unknown;
  output?: unknown;
  isError: boolean;
  readonly edits: string[];
};

/** Paths an ACP tool message's content parts name: the files an edit call touched. */
const editedPaths = (content: unknown): readonly string[] =>
  (Array.isArray(content) ? (content as unknown[]) : []).flatMap((part) =>
    typeof part === 'object' && part !== null && 'path' in part && typeof part.path === 'string' ? [part.path] : [],
  );

/** Pair one run's tool inputs and outputs, in order, with the call metadata ACP records. */
const runToolCalls = (events: string, runId: string): readonly ToolCall[] => {
  const calls = new Map<string, ToolCall>();
  for (const line of events.split('\n').filter((row) => row.trim() !== '')) {
    const event = JSON.parse(line) as {
      type: string;
      runId?: string;
      message?: {
        role?: string;
        toolCallId?: string;
        toolName?: string;
        content?: unknown;
        isError?: boolean;
        call?: { nativeName?: string; kind?: string };
      };
    };
    const { message } = event;
    if (
      event.type !== 'message.appended' ||
      event.runId !== runId ||
      message?.toolCallId === undefined ||
      (message.role !== 'tool-input' && message.role !== 'tool-output')
    ) {
      continue;
    }
    const call = calls.get(message.toolCallId) ?? {
      id: message.toolCallId,
      name: message.call?.nativeName ?? message.toolName ?? '',
      ...(message.call?.kind === undefined ? {} : { kind: message.call.kind }),
      title: message.toolName ?? '',
      isError: false,
      edits: [],
    };
    calls.set(message.toolCallId, call);
    if (message.role === 'tool-input') {
      call.input = message.content;
    } else {
      call.output = message.content;
      call.isError = message.isError === true;
    }
    call.edits.push(...editedPaths(message.content));
  }
  return [...calls.values()];
};

/** Codex titles a search of a skill directory or reference file `Search for '<pattern>' in <slug | api-*.md>`, with no path. */
const skillSearch = /^Search for .* in (?:cad-[\da-z-]+|geospec-authoring|workbench|(?:tau-)?api-[\w-]+\.md)$/u;
const skillFile = /\.agents\/skills\/([\da-z-]+)\/([\w./-]+\.md)/gu;

/** Calls and reference lookups from first skill activation to the first write of the model file. */
const lookupMetrics = (calls: readonly ToolCall[], model: string) => {
  const haystack = (call: ToolCall): string => `${call.title} ${JSON.stringify(call.input ?? null)}`;
  const writes = (call: ToolCall): boolean => {
    const input = call.input as { targetFile?: string } | undefined;
    return (
      ((call.name === 'create_file' || call.name === 'edit_file' || call.name === 'write_file') &&
        input?.targetFile?.endsWith(model) === true) ||
      (call.kind === 'edit' && call.edits.some((path) => path.endsWith(model)))
    );
  };
  const activation = calls.findIndex(
    (call) => call.name === 'use_skill' || [...haystack(call).matchAll(skillFile)].length > 0,
  );
  const firstWrite = calls.findIndex((call, index) => index >= activation && writes(call));
  const window = activation === -1 || firstWrite === -1 ? [] : calls.slice(activation, firstWrite);
  const lookups = window.filter(
    (call) =>
      skillSearch.test(call.title) ||
      [...haystack(call).matchAll(skillFile)].some((match) => match[2] !== undefined && !match[2].endsWith('SKILL.md')),
  );
  const outputText = (call: ToolCall): string => JSON.stringify(call.output ?? '');
  return {
    activated: activation !== -1,
    wroteModel: firstWrite !== -1,
    callsBeforeFirstWrite: window.length,
    lookupsBeforeFirstWrite: lookups.length,
    failedLookups: lookups.filter((call) => call.isError || /"totalMatches":0\b/u.test(outputText(call))).length,
    referenceBytes: lookups.reduce((sum, call) => sum + outputText(call).length, 0),
    skillFilesRead: [
      ...new Set(
        calls.flatMap((call) => [...haystack(call).matchAll(skillFile)].map(([, slug, file]) => `${slug}/${file}`)),
      ),
    ].toSorted(),
  };
};

const lastOutput = (calls: readonly ToolCall[], toolName: string): ToolCall | undefined =>
  calls.findLast((call) => call.title === toolName && call.output !== undefined);

let session: DesktopSession | undefined;
let seededEmail: string | undefined;

afterEach(async () => {
  await session?.close();
  session = undefined;
  if (seededEmail) {
    await deleteTauTestUser(seededEmail);
    seededEmail = undefined;
  }
});

test.skipIf(!enabled).each(selected)(
  '[kernel-skills] $kernel authors with its skill and verifies with GeoSpec',
  async (control) => {
    expect(codexAvailable, 'Kernel-skill acceptance requires the installed Codex adapter and CLI.').toBe(true);
    const account = tauTestAccount(`kernel-skills-${control.skill}`);
    seededEmail = account.email;
    const token = await seedTauTestUser(account);
    session = await launchDesktopApp({ token, packaged });
    if (packaged) {
      await authenticatePackagedDesktop(session, token);
    }
    const { page } = session;
    const label = control.kernel.replaceAll(/\W+/gu, '-').toLowerCase();
    try {
      await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
      await expectSignedIn(page);
      await selectKernel(page, control.kernel);
      await connectPickedFolder(session);
      await openAgentList(page);
      await page.getByRole('option', { name: /^Codex/u }).click();
      const options = await page.getByRole('option').allTextContents();
      const advertised = options.find((name) => modelPattern.test(name));
      if (advertised === undefined) {
        throw new Error(
          `The Codex adapter advertises no model matching ${String(modelPattern)}: ${options.join(' | ')}`,
        );
      }
      await page.keyboard.press('Escape');
      await selectAgent(page, 'Codex', advertised);
      const slug = await submitPrompt(page, control.prompt);
      await expect.poll(() => new URL(page.url()).searchParams.get('chat'), { timeout: 120_000 }).toBeTruthy();
      const projectRoot = join(session.pickedDirectory, slug);
      const eventsPath = join(projectRoot, '.tau/chats', activeChatId(page), 'events.jsonl');
      const read = (): string => (existsSync(eventsPath) ? readFileSync(eventsPath, 'utf8') : '');
      // A cancelled or failed run never completes; stop waiting instead of spending the whole poll.
      const halted = (): string | undefined => {
        const run = currentRun(read());
        return run?.lifecycle === 'cancelled' || run?.lifecycle === 'failed'
          ? `run ${run.runId} ${run.lifecycle}`
          : undefined;
      };
      await expect
        .poll(
          () => {
            if (halted() !== undefined) {
              return 'halted';
            }
            try {
              return latestCompletedRun(read());
            } catch {
              return undefined;
            }
          },
          { timeout: 1_200_000, interval: 5000 },
        )
        .toBeTruthy();
      const halt = halted();
      if (halt !== undefined) {
        throw new Error(`The Codex turn ended without completing: ${halt.slice(0, 400)}`);
      }
      const events = read();
      const runId = latestCompletedRun(events);
      const calls = runToolCalls(events, runId);
      const metrics = lookupMetrics(calls, control.model);
      const evaluation = lastOutput(calls, 'evaluate_model');
      const tests = lastOutput(calls, 'test_model');
      const directory = await session.capture(`kernel-skills-${label}-${runId}`);
      writeFileSync(
        join(directory, 'kernel-skills.json'),
        JSON.stringify(
          {
            kernel: control.kernel,
            skill: control.skill,
            advertised,
            runId,
            metrics,
            evaluation: evaluation?.output,
            tests: tests?.output,
            calls: calls.map(({ name, kind, title, isError }) => ({ name, kind, title, isError })),
          },
          null,
          2,
        ),
      );

      expect(events).toMatch(/"agentId":"codex"/u);
      expect(metrics.skillFilesRead).toContain(`${control.skill}/SKILL.md`);
      expect(metrics.skillFilesRead).toContain('geospec-authoring/SKILL.md');
      expect(metrics.wroteModel).toBe(true);
      expect(existsSync(join(projectRoot, control.model))).toBe(true);
      expect((evaluation?.output as { status?: string } | undefined)?.status).toBe('ready');
      expect((tests?.output as { runStatus?: string } | undefined)?.runStatus).toBe('passed');
    } catch (error) {
      await session.capture(`kernel-skills-failure-${label}`);
      throw error;
    }
  },
  // The turn alone may take the 20-minute poll above, plus launch and sign-in.
  1_500_000,
);
