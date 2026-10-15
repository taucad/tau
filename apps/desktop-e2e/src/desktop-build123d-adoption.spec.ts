import { copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import {
  evaluateModelOutputSchema,
  exportModelOutputSchema,
  screenshotOutputSchema,
  testModelOutputSchema,
} from '@taucad/chat';
import { systemSkillBundles } from '@taucad/skills/resources';
import { currentRun, durableMessages, latestCompletedRun } from '#support/acp-evidence.js';
import { authenticatePackagedDesktop, launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import { deleteTauTestUser, seedTauTestUser, tauTestAccount } from '#support/tau-account.js';
import {
  activeChatId,
  connectPickedFolder,
  expectSignedIn,
  expectVisible,
  selectAgent,
  selectKernel,
  submitPrompt,
} from '#support/scenario.js';

/** Real Codex authoring acceptance; opt-in because this uses the operator's quota. */
const enabled = process.env['TAU_E2E_BUILD123D_ADOPTION'] === 'true';
const packaged = process.env['TAU_E2E_ACP_PACKAGED'] === 'true';
const prompt = `Use the cad-build123d and geospec-authoring skills to create a small reusable two-rotor assembly in main.py.
Make a 100 by 40 by 6 mm chassis, and define one reusable Python factory that returns a native Compound module with a housing and an asymmetric rotor. Instantiate it twice, 50 mm apart. Each rotor must connect to its housing using native RevoluteJoint and RigidJoint objects; each complete module connects to the chassis with native RigidJoint attachment points. Keep the resulting assembly hierarchy and give parts meaningful labels.
Use a native bd_materials wood.oak() textured material on one housing and a plain green color on the other. Use native materials on the rotors too. Do not invent a material library, tessellator or GLB writer.
Using the skill's supported motion(model) supplement, ground the chassis, give the chassis, rotors and housings the occurrence_ids chassis, left-rotor, right-rotor, left-housing and right-housing, and add one named animation that turns the two rotors independently in opposite directions. The left housing is oak and the right housing is green. Keep geometry and joint authoring in Build123D.
Write deterministic GeoSpec tests for the chassis dimensions and assembly separation, run them and fix errors until they pass. Evaluate main.py, export a canonical GLB with export_model, inspect the model with a screenshot and leave the final assembly visible. Report the result.`;

let session: DesktopSession | undefined;
let seededEmail: string | undefined;

afterEach(async () => {
  await session?.close();
  session = undefined;
  if (seededEmail !== undefined) {
    await deleteTauTestUser(seededEmail);
    seededEmail = undefined;
  }
});

test.skipIf(!enabled)(
  'should let Codex author native textured reusable Build123D mechanisms in Tau Desktop',
  async () => {
    const account = tauTestAccount('build123d-adoption');
    seededEmail = account.email;
    const token = await seedTauTestUser(account);
    session = await launchDesktopApp({ token, packaged });
    if (packaged) {
      await authenticatePackagedDesktop(session, token);
    }
    const { page } = session;
    try {
      await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
      await expectSignedIn(page);
      await selectKernel(page, 'Build123d');
      await connectPickedFolder(session);
      // The adapter advertises the model; this acceptance never pins a retired model name.
      const advertised = await selectAgent(page, 'Codex');
      const slug = await submitPrompt(page, prompt);
      await expect.poll(() => new URL(page.url()).searchParams.get('chat'), { timeout: 120_000 }).toBeTruthy();
      const projectRoot = join(session.pickedDirectory, slug);
      const eventsPath = join(projectRoot, '.tau/chats', activeChatId(page), 'events.jsonl');
      const read = (): string => (existsSync(eventsPath) ? readFileSync(eventsPath, 'utf8') : '');
      await expect
        .poll(
          () => {
            const run = currentRun(read());
            return run?.lifecycle === 'completed' || run?.lifecycle === 'cancelled' || run?.lifecycle === 'failed';
          },
          { timeout: 1_200_000, interval: 5000 },
        )
        .toBe(true);
      const events = read();
      const runId = latestCompletedRun(events);
      const messages = durableMessages(events).filter((message) => message.runId === runId);
      const outputs = messages.filter((message) => message.role === 'tool-output' && message.isError === false);
      const evaluation = evaluateModelOutputSchema.parse(
        outputs.findLast((message) => message.toolName === 'evaluate_model')?.content,
      );
      expect(evaluation.status).toBe('ready');
      const tests = testModelOutputSchema
        .omit({ passes: true })
        .parse(outputs.findLast((message) => message.toolName === 'test_model')?.content);
      expect(tests.runStatus).toBe('passed');
      expect(tests.passed).toBeGreaterThan(0);
      const screenshot = screenshotOutputSchema.parse(
        outputs.findLast((message) => message.toolName === 'screenshot')?.content,
      );
      const exported = exportModelOutputSchema.parse(
        outputs.findLast((message) => message.toolName === 'export_model')?.content,
      );
      expect(exported.files.some((file) => file.mimeType === 'model/gltf-binary')).toBe(true);
      const skills = ['cad-build123d', 'geospec-authoring'].map((slug) => {
        const bundle = systemSkillBundles.find((bundle) => bundle.slug === slug);
        const source = bundle?.files.find((file) => file.path === 'SKILL.md');
        expect(source).toBeDefined();
        const input = messages.find(
          (message) =>
            message.role === 'tool-input' &&
            JSON.stringify(message.content).includes(`/.agents/skills/${slug}/SKILL.md`),
        );
        expect(input, `Codex must read the ${slug} skill`).toBeDefined();
        expect(outputs.some((message) => message.toolCallId === input?.toolCallId)).toBe(true);
        return { slug, sha256: source?.sha256, toolCallId: input?.toolCallId };
      });
      const authoredFiles = readdirSync(projectRoot, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.py') && !entry.parentPath.includes('/.tau/'))
        .map((entry) => ({
          path: join(entry.parentPath, entry.name),
          content: readFileSync(join(entry.parentPath, entry.name), 'utf8'),
        }));
      const sources = authoredFiles.map((entry) => entry.content).join('\n');
      expect(sources).toMatch(/\bCompound\b/u);
      expect(sources).toMatch(/\bRevoluteJoint\b/u);
      expect(sources).toMatch(/\bRigidJoint\b/u);
      expect(sources).toContain('connect_to');
      expect(sources).toContain('bd_materials');
      expect(sources).toMatch(/\boak\(/u);
      expect(sources).toMatch(/def motion\(/u);
      await expectVisible(page.getByTestId('cad-viewer-canvas-region').locator('canvas'), 120_000);
      await page.keyboard.press('Control+m');
      await expectVisible(page.getByTestId('kinematics-pane'), 60_000);
      await expect
        .poll(async () => page.locator('[data-testid^="kinematics-dof-"]').count(), { timeout: 60_000 })
        .toBe(2);
      const matrices = async () =>
        page.evaluate(() => {
          const bridge = (
            globalThis as typeof globalThis & {
              __TAU_KINEMATICS_TEST__?: {
                getComponentWorldMatrix(unit: string, component: string): number[] | undefined;
              };
            }
          ).__TAU_KINEMATICS_TEST__;
          return ['chassis', 'left-rotor', 'right-rotor'].map((id) =>
            bridge?.getComponentWorldMatrix('file:main.py', `occurrence:${id}`),
          );
        });
      await expect
        .poll(async () => {
          const current = await matrices();
          return current.every((matrix) => matrix !== undefined);
        })
        .toBe(true);
      const before = await matrices();
      await page.getByTestId('kinematics-play').click();
      await expectVisible(page.getByTestId('kinematics-pause'), 10_000);
      await expect
        .poll(async () => {
          const after = await matrices();
          return [1, 2].every((index) => JSON.stringify(after[index]) !== JSON.stringify(before[index]));
        })
        .toBe(true);
      await page.getByTestId('kinematics-pause').click();
      const after = await matrices();
      expect(after[0]).toEqual(before[0]);
      await page.keyboard.press('Control+a');
      const row = page.locator('[data-model-component-row][data-model-component-id="occurrence:left-housing"]');
      const otherRow = page.locator('[data-model-component-row][data-model-component-id="occurrence:right-housing"]');
      await expectVisible(row, 60_000);
      await expectVisible(otherRow, 60_000);
      await expect
        .poll(
          async () =>
            row
              .locator('img')
              .evaluateAll(
                (images) =>
                  images.length > 0 &&
                  images.every(
                    (image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
                  ),
              ),
          { timeout: 120_000 },
        )
        .toBe(true);
      await expect
        .poll(
          async () =>
            otherRow
              .locator('img')
              .evaluateAll(
                (images) =>
                  images.length > 0 &&
                  images.every(
                    (image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
                  ),
              ),
          { timeout: 120_000 },
        )
        .toBe(true);
      await row.locator('[data-model-part-button]').click();
      expect(await row.locator('[data-model-part-button]').getAttribute('aria-pressed')).toBe('true');
      const visibility = async () =>
        page.evaluate(() => {
          const bridges =
            (
              globalThis as typeof globalThis & {
                __TAU_SECTION_VIEW_TEST_BRIDGES__?: Array<{
                  getRenderedModelComponentState(id: string): { visibleMeshCount: number };
                }>;
              }
            ).__TAU_SECTION_VIEW_TEST_BRIDGES__ ?? [];
          return bridges.map((bridge) => ({
            left: bridge.getRenderedModelComponentState('occurrence:left-housing').visibleMeshCount,
            right: bridge.getRenderedModelComponentState('occurrence:right-housing').visibleMeshCount,
          }));
        });
      await row.getByRole('button', { name: /^Hide /u }).click();
      await expect
        .poll(async () => {
          const states = await visibility();
          return states.some(({ left, right }) => left === 0 && right > 0);
        })
        .toBe(true);
      await row.getByRole('button', { name: /^Show /u }).click();
      await row.getByRole('button', { name: /^Isolate /u }).click();
      await expect
        .poll(async () => {
          const states = await visibility();
          return states.some(({ left, right }) => left > 0 && right === 0);
        })
        .toBe(true);
      await session.capture(`build123d-adoption-isolated-${runId}`);
      await row.getByRole('button', { name: /^Remove isolation for /u }).click();
      const directory = await session.capture(`build123d-adoption-${runId}`);
      const glb = exported.files.find((file) => file.mimeType === 'model/gltf-binary');
      if (glb === undefined) {
        throw new Error('Codex did not produce a canonical GLB artifact');
      }
      copyFileSync(join(projectRoot, glb.artifactPath), join(directory, 'authored-assembly.glb'));
      writeFileSync(join(directory, 'authored-source.json'), JSON.stringify(authoredFiles, null, 2));
      writeFileSync(
        join(directory, 'build123d-adoption.json'),
        JSON.stringify(
          { advertised, runId, projectRoot, skills, evaluation, tests, screenshot, exported, before, after },
          null,
          2,
        ),
      );
    } catch (error) {
      await session.capture('build123d-adoption-failure');
      throw error;
    }
  },
  1_500_000,
);
