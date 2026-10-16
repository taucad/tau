import { copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import {
  evaluateModelOutputSchema,
  exportModelOutputSchema,
  screenshotOutputSchema,
  testModelOutputSchema,
} from '@taucad/chat';
import { systemSkillBundles } from '@taucad/skills/resources';
import { glbToDocument } from '@taucad/runtime-testing';
import { validateTauCadTopology } from '@taucad/geometry-core';
import type { TauCadTopologyPayload, TauCadTopologyRoot } from '@taucad/geometry-core';
import { currentRun, durableMessages, latestCompletedRun } from '#support/acp-evidence.js';
import { authenticatePackagedDesktop, launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import { deleteTauTestUser, seedTauTestUser, tauTestAccount } from '#support/tau-account.js';
import {
  activeChatId,
  connectPickedFolder,
  expectGeometryFramed,
  expectSignedIn,
  expectVisible,
  selectAgent,
  selectKernel,
  submitPrompt,
} from '#support/scenario.js';

/** Real Codex authoring acceptance; opt-in because this uses the operator's quota. */
const enabled = process.env['TAU_E2E_BUILD123D_ADOPTION'] === 'true';
const packaged = process.env['TAU_E2E_ACP_PACKAGED'] === 'true';
const retainReview = process.env['TAU_E2E_RETAIN_REVIEW'] === 'true';
const planetarySource = readFileSync(
  resolve(import.meta.dirname, '../../../libs/tau-examples/src/kernels/build123d/planetary-gear-system/main.py'),
  'utf8',
);
const topologySchema = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, '../../../packages/core/geometry/schema/tau-cad-topology.schema.json'),
    'utf8',
  ),
) as Record<string, unknown>;
const isTopologyPayload = new Ajv2020({ strict: true, allErrors: true }).compile<TauCadTopologyPayload>(topologySchema);
const assemblyComponents = {
  chassis: 'occurrence:0/chassis',
  carrier: 'occurrence:0/movingAssembly/carrier',
  leftHousing: 'occurrence:0/movingAssembly/left/housing',
  rightHousing: 'occurrence:0/movingAssembly/right/housing',
  leftRotor: 'occurrence:0/movingAssembly/left/rotor',
  rightRotor: 'occurrence:0/movingAssembly/right/rotor',
  leftFollower: 'occurrence:0/movingAssembly/left/follower',
  rightFollower: 'occurrence:0/movingAssembly/right/follower',
};
const assemblyDrivers = {
  carrier: 'occurrence:0/connection/carrier',
  left: 'occurrence:0/movingAssembly/left/connection/drive',
  right: 'occurrence:0/movingAssembly/right/connection/drive',
};
const assertAssemblyIntent = (topology: TauCadTopologyPayload): void => {
  const intent = topology.mechanismIntent;
  if (intent === undefined) {
    throw new Error('Exported assembly has no mechanism intent');
  }
  const couplings = intent.couplings ?? [];
  expect(intent.schemaVersion).toBe(1);
  expect(intent.ground).toBe(assemblyComponents.chassis);
  expect(intent.connections).toHaveLength(7);
  expect(couplings).toHaveLength(2);
  for (const side of ['left', 'right']) {
    const moduleId = `occurrence:0/movingAssembly/${side}`;
    const driveId = `${moduleId}/connection/drive`;
    const drive = intent.connections.find((connection) => connection.id === driveId);
    expect(drive?.parent.componentId).toBe(`${moduleId}/housing`);
    expect(drive?.child.componentId).toBe(`${moduleId}/rotor`);
    expect(drive?.playbackCoordinates).toEqual({ angle: driveId });
    const mount = intent.connections.find(
      (connection) => connection.id === `occurrence:0/movingAssembly/connection/${side}-mount`,
    );
    expect(mount?.parent.componentId).toBe(assemblyComponents.carrier);
    // Exposed mount resolves to its housing owner, never a synthetic assembly joint.
    expect(mount?.child).toEqual({ componentId: `${moduleId}/housing`, interfaceId: 'mount' });
    const coupling = couplings.find((entry) => entry.driver === driveId);
    expect(coupling).toMatchObject({
      driver: driveId,
      follower: `${moduleId}/connection/follower`,
      ratio: -2,
    });
    expect(coupling && 'offset' in coupling ? (coupling.offset ?? 0) : 0).toBe(0);
  }
  const carrier = intent.connections.find((connection) => connection.id === assemblyDrivers.carrier);
  expect(carrier?.parent.componentId).toBe(assemblyComponents.chassis);
  expect(carrier?.child).toEqual({ componentId: assemblyComponents.carrier, interfaceId: 'mount' });
};

const prompt = `Use the cad-build123d and geospec-authoring skills to create a reusable assembly in main.py using Assembly from tau_assembly.
Make a grounded 100 by 40 by 6 mm chassis and a moving carrier above it. The root Assembly has exactly the named children chassis and movingAssembly. movingAssembly is an Assembly with named children carrier, left and right. Keep these keys exactly, because we independently inspect their stable occurrence identities.
Define one reusable factory returning an Assembly with named children housing, rotor and follower. The rotor and follower are asymmetric visible parts with native +Z RevoluteJoint/RigidJoint attachment points. Inside that factory, persist both connections using module.connect with names drive and follower and zero authored angles, then persist a coupling using module.couple with driver=(drive, "angle"), follower=(follower, "angle"), ratio=-2 and offset=0. Expose a housing-owned native mount joint as module.expose_joint("mount", housing.joints["mount"]). Keep the alias in module.interfaces; never reparent a joint or alias it into module.joints.
Make one module and use copy.copy or copy.deepcopy to obtain the second complete independent module, retaining its internal connections, coupling and mount alias. Mount these left and right instances 50 mm apart on the moving carrier using movingAssembly.connect with names left-mount and right-mount and the exposed interfaces. Do not recreate the internal module connections at the root. Expose a carrier-owned mount as movingAssembly.interfaces["mount"] and use root.connect("carrier", ...) to attach the whole movingAssembly to a +Z chassis revolute joint at zero authored angle. Both modules must travel with the carrier and rotate their own rotors independently.
Use native bd_materials wood.oak() on the left housing and plain green on the right housing, preserving their geometry, connections and mount ownership. Use native materials on the rotors too. Give parts readable labels. Do not invent a material library, tessellator or GLB writer.
The motion(model) supplement must contain only root grounding and named animation clips. Ground model.parts["chassis"]. Use actual connection handles and authored angle coordinates for one clip: at time0 all three independent drivers are0; at time4 carrier=30 degrees, left drive=90 degrees, right drive=-60 degrees. Let each module's own -2 coupling drive its follower. Do not provide flat occurrence_ids, root coupling records or string joint guesses.
Write deterministic GeoSpec tests only for the requested chassis dimensions and 50 mm assembly separation, using supported STEP occurrence bounds. Run them and fix errors until test_model returns runStatus "passed". This bounded acceptance does not request additional interference or other assertions that need unavailable evidence. An inconclusive or unsupported result does not satisfy the task; preserve both requested dimension and separation proofs. Evaluate main.py, export a canonical GLB with export_model, inspect the model with a screenshot and leave the final assembly visible. Report the result. Work only inside this project; if the desktop runtime itself is unavailable, report the blocker without modifying app installations or other worktrees.`;

let session: DesktopSession | undefined;
let seededEmail: string | undefined;

afterEach(async () => {
  await session?.close();
  session = undefined;
  if (seededEmail !== undefined) {
    if (!retainReview) {
      await deleteTauTestUser(seededEmail);
    }
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
      expect(sources).toMatch(/from tau_assembly import[^\n]*\bAssembly\b/u);
      expect(sources).toMatch(/\b(?:copy|deepcopy)\(/u);
      expect(sources).toMatch(/\bRevoluteJoint\b/u);
      expect(sources).toMatch(/\bRigidJoint\b/u);
      expect(sources).toContain('.connect(');
      expect(sources).toContain('.couple(');
      expect(sources).toContain('.expose_joint(');
      expect(sources).toContain('bd_materials');
      expect(sources).toMatch(/\boak\(/u);
      expect(sources).toMatch(/def motion\(/u);
      await expectVisible(page.getByTestId('cad-viewer-canvas-region').locator('canvas'), 120_000);
      await page.keyboard.press('Control+m');
      await expectVisible(page.getByTestId('kinematics-pane'), 60_000);
      await expect.poll(async () => page.locator('[data-driver-control]').count(), { timeout: 60_000 }).toBe(3);
      const matrices = async () =>
        page.evaluate((componentIds) => {
          const bridge = (
            globalThis as typeof globalThis & {
              __TAU_KINEMATICS_TEST__?: {
                getComponentWorldMatrix(unit: string, component: string): number[] | undefined;
              };
            }
          ).__TAU_KINEMATICS_TEST__;
          return componentIds.map((id) => bridge?.getComponentWorldMatrix('file:main.py', id));
        }, Object.values(assemblyComponents));
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
          return [1, 4, 5, 6, 7].every((index) => JSON.stringify(after[index]) !== JSON.stringify(before[index]));
        })
        .toBe(true);
      await page.getByTestId('kinematics-pause').click();
      const after = await matrices();
      expect(after[0]).toEqual(before[0]);
      const assertAssemblyPose = async (coordinates: { carrier: number; left: number; right: number }) => {
        for (const key of ['carrier', 'left', 'right'] as const) {
          const control = page
            .locator('[data-driver-control]')
            .filter({ has: page.getByTestId(`kinematics-dof-${assemblyDrivers[key]}`) })
            .getByRole('spinbutton');
          // oxlint-disable-next-line no-await-in-loop -- Each user control commits a distinct independent coordinate.
          await control.fill(String(coordinates[key]));
          // oxlint-disable-next-line no-await-in-loop -- Commit before proceeding to the next independent control.
          await control.press('Enter');
        }
        const { carrier, left, right } = coordinates;
        const expectedDegrees = [
          0,
          carrier,
          carrier,
          carrier,
          carrier + left,
          carrier + right,
          carrier - 2 * left,
          carrier - 2 * right,
        ];
        await expect
          .poll(async () => {
            const observed = await matrices();
            return observed.every((matrix, index) => {
              if (matrix === undefined) {
                return false;
              }
              // Native +Z becomes GLB +Y; measure each actual scene placement independently of the coupling solver.
              const actual = Math.atan2(matrix[8]!, matrix[0]!);
              const expected = (expectedDegrees[index]! * Math.PI) / 180;
              return Math.abs(Math.atan2(Math.sin(actual - expected), Math.cos(actual - expected))) < 1e-6;
            });
          })
          .toBe(true);
        const observed = await matrices();
        expect(observed[0]).toEqual(before[0]);
        return { coordinates, expectedDegrees, matrices: observed };
      };
      const assemblyReference = await assertAssemblyPose({ carrier: 0, left: 0, right: 0 });
      const assemblyMoved = await assertAssemblyPose({ carrier: 30, left: 0, right: 0 });
      const assemblyLeft = await assertAssemblyPose({ carrier: 30, left: 40, right: 0 });
      const assemblyBoth = await assertAssemblyPose({ carrier: 30, left: 40, right: -25 });
      // Driving one copied module cannot move the other's internals or the common moving parent.
      for (const index of [1, 2, 3, 5, 7]) {
        expect(assemblyLeft.matrices[index]).toEqual(assemblyMoved.matrices[index]);
      }
      for (const index of [1, 2, 3, 4, 6]) {
        expect(assemblyBoth.matrices[index]).toEqual(assemblyLeft.matrices[index]);
      }
      const assemblyPoses = [assemblyReference, assemblyMoved, assemblyLeft, assemblyBoth];
      await page.keyboard.press('Control+a');
      await page.getByRole('searchbox', { name: 'Filter parts', exact: true }).fill('housing');
      const row = page.locator(
        `[data-model-component-row][data-model-component-id="${assemblyComponents.leftHousing}"]`,
      );
      const otherRow = page.locator(
        `[data-model-component-row][data-model-component-id="${assemblyComponents.rightHousing}"]`,
      );
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
        page.evaluate((components) => {
          const bridges =
            (
              globalThis as typeof globalThis & {
                __TAU_SECTION_VIEW_TEST_BRIDGES__?: Array<{
                  getRenderedModelComponentState(id: string): { visibleMeshCount: number };
                }>;
              }
            ).__TAU_SECTION_VIEW_TEST_BRIDGES__ ?? [];
          return bridges.map((bridge) => ({
            left: bridge.getRenderedModelComponentState(components.leftHousing).visibleMeshCount,
            right: bridge.getRenderedModelComponentState(components.rightHousing).visibleMeshCount,
          }));
        }, assemblyComponents);
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
      await page.getByRole('searchbox', { name: 'Filter parts', exact: true }).fill('');
      await page.getByRole('button', { name: 'Fit view', exact: true }).first().click();
      await expectGeometryFramed(page);
      const directory = await session.capture(`build123d-adoption-${runId}`);
      const glb = exported.files.find((file) => file.mimeType === 'model/gltf-binary');
      if (glb === undefined) {
        throw new Error('Codex did not produce a canonical GLB artifact');
      }
      copyFileSync(join(projectRoot, glb.artifactPath), join(directory, 'authored-assembly.glb'));
      const reopened = await glbToDocument(Uint8Array.from(readFileSync(join(directory, 'authored-assembly.glb'))));
      const reopenedTopology = reopened.getRoot().getExtension<TauCadTopologyRoot>('TAU_cad_topology')?.getPayload();
      if (!isTopologyPayload(reopenedTopology)) {
        throw new Error(`Exported topology failed structural admission: ${JSON.stringify(isTopologyPayload.errors)}`);
      }
      const meshes = reopened.getRoot().listMeshes();
      expect(
        validateTauCadTopology(reopenedTopology, {
          nodes: reopened
            .getRoot()
            .listNodes()
            .map((node) => ({
              meshIndex: node.getMesh() === null ? undefined : meshes.indexOf(node.getMesh()!),
            })),
          meshes: meshes.map((mesh) =>
            mesh.listPrimitives().map((primitive) => ({
              mode: primitive.getMode(),
              indexCount: primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION')?.getCount() ?? 0,
            })),
          ),
        }),
      ).toEqual([]);
      assertAssemblyIntent(reopenedTopology);
      expect(reopenedTopology.mechanism?.animations?.length).toBeGreaterThan(0);
      expect(reopened.getRoot().listTextures().length).toBeGreaterThan(0);
      expect(
        reopened
          .getRoot()
          .listTextures()
          .every((texture) => (texture.getImage()?.byteLength ?? 0) > 0),
      ).toBe(true);
      expect(
        reopened
          .getRoot()
          .listMaterials()
          .some((material) => material.getBaseColorTexture() !== null),
      ).toBe(true);
      writeFileSync(join(directory, 'authored-source.json'), JSON.stringify(authoredFiles, null, 2));
      writeFileSync(
        join(directory, 'build123d-adoption.json'),
        JSON.stringify(
          {
            advertised,
            runId,
            projectRoot,
            skills,
            evaluation,
            tests,
            screenshot,
            exported,
            before,
            after,
            assemblyPoses,
          },
          null,
          2,
        ),
      );

      // Keep the real agent-authored model editable, then qualify the original
      // tracked planetary baseline in this same desktop and renderer.
      copyFileSync(join(projectRoot, 'main.py'), join(projectRoot, 'reusable-assembly.py'));
      writeFileSync(join(projectRoot, 'main.py'), planetarySource);
      await page.keyboard.press('Control+m');
      const planetary = async () =>
        page.evaluate(() => {
          const bridge = (
            globalThis as typeof globalThis & {
              __TAU_KINEMATICS_TEST__?: {
                getState(unit: string): { coordinates: Record<string, number> } | undefined;
                getComponentWorldMatrix(unit: string, component: string): number[] | undefined;
              };
            }
          ).__TAU_KINEMATICS_TEST__;
          const sceneBridge = (
            globalThis as typeof globalThis & {
              __TAU_SECTION_VIEW_TEST__?: {
                getRenderedModelComponentSurfaceBounds(id: string): { min: number[]; max: number[] } | undefined;
              };
            }
          ).__TAU_SECTION_VIEW_TEST__;
          const surfaceCenter = (id: string) => {
            const bounds = sceneBridge?.getRenderedModelComponentSurfaceBounds(`occurrence:0/${id}`);
            return bounds?.min.map((minimum, index) => (minimum + bounds.max[index]!) / 2);
          };
          return {
            ringCenter: surfaceCenter('ring'),
            coordinates: bridge?.getState('file:main.py')?.coordinates,
            matrices: [
              'ring',
              'sun',
              'carrier/front',
              'carrier/planet-1/gear',
              'carrier/planet-2/gear',
              'carrier/planet-3/gear',
            ].map((id) => bridge?.getComponentWorldMatrix('file:main.py', `occurrence:0/${id}`)),
            // These centrally symmetric gears and pins have their bore-axis midpoint at the surface bounds center.
            // Read rendered vertices, not joint metadata: a correct pivot can still carry incorrectly baked geometry.
            boreCenters: [1, 2, 3].map((planet) =>
              ['gear', 'pin'].map((role) => surfaceCenter(`carrier/planet-${planet}/${role}`)),
            ),
          };
        });
      await expect
        .poll(
          async () => {
            const state = await planetary();
            return state.matrices.every((matrix) => matrix !== undefined);
          },
          { timeout: 420_000 },
        )
        .toBe(true);
      await expect.poll(async () => page.locator('[data-driver-control]').count()).toBe(1);
      const planetaryInitial = await planetary();
      const driver = page.locator('[data-driver-control]').getByRole('spinbutton');
      const assertPlanetaryPose = async (angle: number) => {
        await driver.fill(String(angle));
        await driver.press('Enter');
        await expect
          .poll(async () => {
            const state = await planetary();
            if (Math.abs((Object.values(state.coordinates ?? {})[0] ?? Infinity) - angle) >= 1e-6) {
              return false;
            }
            return [1, 0.25, -0.5, -0.5, -0.5].every((ratio, index) => {
              const matrix = state.matrices[index + 1];
              if (!matrix) {
                return false;
              }
              const expected = (angle * ratio * Math.PI) / 180;
              const observed = Math.atan2(matrix[8]!, matrix[0]!);
              return Math.abs(Math.atan2(Math.sin(observed - expected), Math.cos(observed - expected))) < 1e-6;
            });
          })
          .toBe(true);
        const state = await planetary();
        expect(state.matrices[0]).toEqual(planetaryInitial.matrices[0]);
        for (const [index, ratio] of [1, 0.25, -0.5, -0.5, -0.5].entries()) {
          const matrix = state.matrices[index + 1]!;
          const expected = (angle * ratio * Math.PI) / 180;
          const observed = Math.atan2(matrix[8]!, matrix[0]!);
          expect(Math.abs(Math.atan2(Math.sin(observed - expected), Math.cos(observed - expected)))).toBeLessThan(1e-6);
        }
        expect(state.ringCenter).toBeDefined();
        const errors = state.boreCenters.map(([gear, pin]) => {
          expect(gear).toBeDefined();
          expect(pin).toBeDefined();
          // The canonical 24/24-tooth, module-2 stage has a 48 mm center distance.
          const radius = Math.hypot(...gear!.map((value, index) => value - state.ringCenter![index]!));
          expect(Math.abs(radius - 0.048)).toBeLessThan(1e-7);
          return Math.hypot(...gear!.map((value, index) => value - pin![index]!));
        });
        // 0.0001 mm admits Float32 meshing roundoff while detecting independent geometry/pivot drift.
        expect(
          errors.every((error) => error < 1e-7),
          JSON.stringify({ angle, errors }),
        ).toBe(true);
        return { ...state, centerErrorsMeters: errors };
      };
      const anchorPoses: Array<Awaited<ReturnType<typeof assertPlanetaryPose>>> = [];
      for (const angle of [0, 61.21, -84.18, -720]) {
        // oxlint-disable-next-line no-await-in-loop -- Each requested UI pose must settle before measuring its vertices.
        anchorPoses.push(await assertPlanetaryPose(angle));
      }
      const time = page.getByRole('slider', { name: 'Time', exact: true });
      await time.press('Home');
      await time.press('ArrowRight');
      const ratiosApplied = async () => {
        const state = await planetary();
        const angle = Object.values(state.coordinates ?? {})[0] ?? 0;
        if (angle <= 5 || angle >= 170) {
          return false;
        }
        return [1, 0.25, -0.5, -0.5, -0.5].every((ratio, index) => {
          const matrix = state.matrices[index + 1];
          return (
            matrix !== undefined &&
            Math.abs((Math.atan2(matrix[8]!, matrix[0]!) * 180) / Math.PI - angle * ratio) < 0.01
          );
        });
      };
      await expect.poll(ratiosApplied).toBe(true);
      const planetaryFirstPose = await planetary();
      await time.press('ArrowRight');
      await expect.poll(ratiosApplied).toBe(true);
      const planetarySecondPose = await planetary();
      expect(planetarySecondPose.coordinates).not.toEqual(planetaryFirstPose.coordinates);
      expect(planetarySecondPose.matrices[0]).toEqual(planetaryInitial.matrices[0]);
      await page.getByTestId('kinematics-play').click();
      await expect
        .poll(async () => {
          const state = await planetary();
          return JSON.stringify(state.matrices[1]) !== JSON.stringify(planetarySecondPose.matrices[1]);
        })
        .toBe(true);
      await page.getByTestId('kinematics-pause').click();
      await page.keyboard.press('Control+a');
      await expectVisible(page.getByText('Weight · 0 of 34 parts known', { exact: true }), 60_000);
      const planetaryParts = await page.evaluate(() => {
        const bridges =
          (
            globalThis as typeof globalThis & {
              __TAU_SECTION_VIEW_TEST_BRIDGES__?: Array<{
                getModelComponents(): Array<{ id: string; name: string }>;
                getRenderedModelComponentState(id: string): { meshCount: number };
              }>;
            }
          ).__TAU_SECTION_VIEW_TEST_BRIDGES__ ?? [];
        return bridges
          .map((bridge) =>
            bridge.getModelComponents().filter((part) => bridge.getRenderedModelComponentState(part.id).meshCount > 0),
          )
          .find((parts) => parts.length === 34);
      });
      expect(planetaryParts).toHaveLength(34);
      if (planetaryParts === undefined) {
        throw new Error('The planetary renderer did not expose its 34 leaf components');
      }
      const ringRow = page.locator('[data-model-component-row][data-model-component-id="occurrence:0/ring"]');
      await expectVisible(ringRow);
      await expect
        .poll(
          async () =>
            ringRow
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
      await page.getByRole('button', { name: 'Fit view', exact: true }).first().click();
      await expectGeometryFramed(page);
      const planetaryDirectory = await session.capture(`build123d-planetary-${runId}`);
      writeFileSync(
        join(planetaryDirectory, 'planetary-baseline.json'),
        JSON.stringify(
          {
            projectRoot,
            desktopLogPath: session.logPath,
            retainedReview: retainReview,
            originalAuthoredEntry: 'reusable-assembly.py',
            source: planetarySource,
            initial: planetaryInitial,
            anchorPoses,
            firstPose: planetaryFirstPose,
            secondPose: planetarySecondPose,
            parts: planetaryParts,
          },
          null,
          2,
        ),
      );

      // A fresh image service must populate native part previews without the
      // earlier agent screenshot or a manual retry warming its worker first.
      await page.reload();
      await expectVisible(page.getByText('Weight · 0 of 34 parts known', { exact: true }), 120_000);
      const planetaryPartIds = planetaryParts.map((part) => part.id);
      await expect
        .poll(
          async () =>
            page.locator('[data-model-component-row]').evaluateAll((rows, ids) => {
              const parts = rows.filter(
                (part) => part instanceof HTMLElement && ids.includes(part.dataset['modelComponentId'] ?? ''),
              );
              return (
                parts.length >= 5 &&
                parts.every((part) => {
                  const image = part.querySelector('img');
                  return image?.complete === true && image.naturalWidth > 0;
                })
              );
            }, planetaryPartIds),
          { timeout: 120_000 },
        )
        .toBe(true);
      await session.capture(`build123d-planetary-reloaded-${runId}`);

      // A nonzero authored placement must remain the reference pose, not be applied twice during playback.
      const nonzeroSource = planetarySource.replace('input_angle: float = 0.0', 'input_angle: float = 30.0');
      expect(nonzeroSource).not.toBe(planetarySource);
      try {
        writeFileSync(join(projectRoot, 'main.py'), nonzeroSource);
        await page.reload();
        await expectVisible(page.getByText('Weight · 0 of 34 parts known', { exact: true }), 120_000);
        await page.keyboard.press('Control+m');
        await expectVisible(page.getByTestId('kinematics-pane'));
        await driver.fill('0');
        await driver.press('Enter');
        await expect
          .poll(
            async () => {
              const state = await planetary();
              const center = state.boreCenters[0]?.[1];
              const original = anchorPoses[0]?.boreCenters[0]?.[1];
              return center && original ? Math.hypot(...center.map((value, index) => value - original[index]!)) : 0;
            },
            { timeout: 120_000 },
          )
          .toBeGreaterThan(0.001);
        const nonzeroPoses = [];
        for (const angle of [0, 61.21, -84.18, -720]) {
          // oxlint-disable-next-line no-await-in-loop -- Each pose belongs to this newly built reference geometry.
          nonzeroPoses.push(await assertPlanetaryPose(angle));
        }
        const nonzeroDirectory = await session.capture(`build123d-planetary-reference-30-${runId}`);
        writeFileSync(
          join(nonzeroDirectory, 'anchor-poses.json'),
          JSON.stringify({ referenceDegrees: 30, nonzeroPoses }, null, 2),
        );
      } finally {
        writeFileSync(join(projectRoot, 'main.py'), planetarySource);
      }
    } catch (error) {
      await session.capture('build123d-adoption-failure');
      throw error;
    }
  },
  1_800_000,
);
