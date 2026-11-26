import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { queueTarget, shadowTarget } from '#ci-shadow-rows.js';

/*
 * The shadow lane (CI decomposition DC-25, operator ruling Q1 option C, global review rulings 5 and 8; CI flake
 * quarantine blueprint FQ-13). A suite a project lists in its `test:e2e:shadow` `dependsOn` runs as its own row in
 * ci.yml's `e2e-shadow` lane, in the merge queue and on a push to `main` the queue did not prove, set up as an
 * `e2e-queue` row is, and gates nothing: the flake ledger counts its outcome rows against the 100-run bar, and
 * `shadow-row-promotion.yml` proposes its move to `test:e2e:queue`. The plan's rows and failures are pinned with the
 * other lanes in `ci-affected-lanes.test.ts`; the registry and the count in `ci-shadow-rows.test.ts`.
 */

const root = resolve(import.meta.dirname, '../..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');

type Step = {
  readonly id?: string;
  readonly if?: string;
  readonly name?: string;
  readonly run?: string;
  readonly uses?: string;
  readonly env?: Record<string, string>;
  readonly with?: Record<string, string>;
  readonly 'continue-on-error'?: boolean;
  readonly 'timeout-minutes'?: number;
};
type Job = {
  readonly if?: string;
  readonly name?: string;
  readonly needs?: string | readonly string[];
  readonly outputs?: Record<string, string>;
  readonly steps?: readonly Step[];
  readonly strategy?: { readonly 'fail-fast'?: boolean | string; readonly matrix?: Record<string, unknown> };
  readonly 'continue-on-error'?: boolean;
  readonly 'timeout-minutes'?: number;
};
type Workflow = { readonly jobs: Record<string, Job> };
type Command = string | { readonly command: string; readonly forwardAllArgs?: boolean };
type Target = {
  readonly executor?: string;
  readonly dependsOn?: readonly unknown[];
  readonly metadata?: { readonly browsers?: readonly string[]; readonly shards?: number };
  readonly options?: { readonly commands?: readonly Command[]; readonly env?: Record<string, string> };
};

const ci = load(read('.github/workflows/ci.yml')) as Workflow;
/** A GitHub Actions `${{ … }}` expression, built so the source holds no template-like string literal. */
const expression = (body: string): string => ['$', '{{ ', body, ' }}'].join('');
const lane = ci.jobs['e2e-shadow'];
const queueLane = ci.jobs['e2e-queue'];
const step = (job: Job | undefined, name: string): Step | undefined => job?.steps?.find((entry) => entry.name === name);

describe('ci.yml shadow lane (operator ruling Q1)', () => {
  it('should plan one row per shadow suite, never on a pull request', () => {
    const planStep = ci.jobs['plan']?.steps?.find((entry) => entry.id === 'plan');
    const selectors = JSON.parse(planStep?.env?.['LANE_SELECTORS'] ?? '{}') as Record<string, unknown>;
    expect(selectors['e2e-shadow']).toEqual({ targets: [shadowTarget], pr: 'queue' });
    expect(ci.jobs['plan']?.outputs).toMatchObject({
      'e2e-shadow': expression('steps.plan.outputs.e2e-shadow'),
      'e2e-shadow-suites': expression('steps.plan.outputs.e2e-shadow-suites'),
    });
    expect(lane?.needs).toEqual(['plan', 'queue-builds']);
    expect(lane?.if).toBe(
      expression("!cancelled() && needs.plan.result == 'success' && needs.plan.outputs.e2e-shadow == 'true'"),
    );
    expect(lane?.strategy?.matrix?.['suite']).toBe(expression('fromJSON(needs.plan.outputs.e2e-shadow-suites)'));
    expect(lane?.name).toBe(`Shadow end-to-end (${expression('matrix.suite.label')})`);
  });

  it('should never be required: outside the gate, outside Fail fast, and out of the run conclusion', () => {
    const gate = ci.jobs['affected'];
    expect([gate?.needs ?? []].flat()).not.toContain('e2e-shadow');
    expect(JSON.stringify(gate?.steps?.[0]?.env ?? {})).not.toContain('e2e-shadow');
    for (const [name, job] of Object.entries(ci.jobs)) {
      if (name !== 'e2e-shadow') {
        expect([job.needs ?? []].flat(), name).not.toContain('e2e-shadow');
      }
    }
    expect(Object.keys(ci.jobs).filter((name) => name.startsWith('fail-fast-') && name.includes('shadow'))).toEqual([]);
    // A failed row cancels no sibling, and neither its failure nor its timeout fails the run (`main-ci-success`).
    expect(lane?.strategy?.['fail-fast']).toBe(false);
    expect(lane?.['continue-on-error']).toBe(true);
    // The suite step continues too, so the job ends green and the queue-health report sees no failed lane.
    expect(step(lane, 'Run the end-to-end suite')?.['continue-on-error']).toBe(true);
    expect(step(lane, 'Validate captured chat logs')?.['continue-on-error']).toBe(true);
    expect(read('scripts/src/ci-queue-health.ts')).toContain("export const shadowRowPrefix = 'Shadow end-to-end';");
  });

  it('should run a row as an e2e-queue row runs its suite, so a promoted suite runs as it ran here', () => {
    const suite = step(lane, 'Run the end-to-end suite');
    const queued = step(queueLane, 'Run the end-to-end suite');
    expect(suite?.run).toBe(queued?.run);
    expect(suite?.env).toEqual(queued?.env);
    expect(suite?.['timeout-minutes']).toBe(queued?.['timeout-minutes']);
    expect(lane?.['timeout-minutes']).toBe(queueLane?.['timeout-minutes']);
    for (const name of [
      'Install Pandoc for reference conversion',
      'Install a software Vulkan driver for native rendering',
      'Select the software Vulkan driver',
      'Prepare API env file',
      'Setup Linux sandbox prerequisites',
      'Check workspace root hygiene',
    ]) {
      expect({ ...step(lane, name), if: undefined }, name).toEqual({ ...step(queueLane, name), if: undefined });
    }
    // Ruling 5: only the suite's own browsers.
    expect(step(lane, 'Install browsers for Vitest Browser (system dependencies)')?.with).toEqual({
      'playwright-browsers': expression('matrix.suite.browsers'),
    });
    expect(Object.entries(step(lane, 'Install browsers for Vitest Browser')?.env ?? {})).toEqual([
      ['BROWSERS', expression('matrix.suite.browsers')],
    ]);
  });

  it('should upload its outcome rows as an e2e-queue row does, under a prefix the required gate leaves out', () => {
    const upload = step(lane, 'Upload test outcomes');
    const queued = step(queueLane, 'Upload test outcomes');
    expect(upload?.if).toBe('always()');
    expect(upload?.uses).toBe(queued?.uses);
    expect(upload?.with).toEqual({
      ...queued?.with,
      name: `test-outcomes-shadow-${expression('matrix.suite.slug')}`,
    });
    // The flake ledger reads every `test-outcomes-*` artifact, the shadow rows' included.
    expect(read('scripts/src/ci-flake-ledger-ingest-cli.ts')).toContain(
      "export const artifactPrefix = 'test-outcomes-';",
    );
    // The gate's retried-pass budget (§ 16.2, RT-4) counts gating lanes only.
    const gate = ci.jobs['affected'];
    const download = step(gate, 'Download test outcomes');
    expect(download?.with?.['pattern']).toBe('test-outcomes-*');
    const check = step(gate, "Check the run's retried passes")?.run ?? '';
    expect(check).toContain('rm -rf "$dir"/test-outcomes-shadow-*');
    expect(check.indexOf('rm -rf "$dir"/test-outcomes-shadow-*')).toBeLessThan(check.indexOf('find "$dir"'));
  });
});

describe('ui-e2e journey families (DC-25, global review ruling 5)', () => {
  const project = JSON.parse(read('apps/ui-e2e/project.json')) as { readonly targets: Record<string, Target> };
  const { targets } = project;
  const shadow = (targets[shadowTarget]?.dependsOn ?? []) as readonly string[];
  const queued = (targets[queueTarget]?.dependsOn ?? []) as readonly string[];
  const families = Object.keys(targets).filter((name) => name.startsWith('test:e2e:journey-'));
  const config = read('apps/ui-e2e/vitest.config.ts');
  /** The `include` list of the Vitest browser instance `name` in vitest.config.ts. */
  const instanceFiles = (name: string): readonly string[] => {
    const block = new RegExp(`name: '${name}',\\s*include: \\[([^\\]]*)\\]`, 'u').exec(config)?.[1] ?? '';
    return [...block.matchAll(/'([^']+)'/gu)].map(([, file]) => file ?? '');
  };
  /** A `const <name> = [...]` list of spec files in vitest.config.ts. */
  const listed = (name: string): readonly string[] => {
    const block = new RegExp(`const ${name} = \\[([^\\]]*)\\]`, 'u').exec(config)?.[1] ?? '';
    return [...block.matchAll(/'([^']+)'/gu)].map(([, file]) => file ?? '');
  };
  const specsOf = (name: string): readonly string[] =>
    (targets[name]?.options?.commands ?? [])
      .map((command) => (typeof command === 'string' ? command : command.command))
      .filter((command) => command.startsWith('vitest run '))
      .flatMap((command) => command.split(/\s+/u).filter((word) => /^src\/.+\.spec\.ts$/u.test(word)));

  it('should register every journey family and the service worker suite as shadow rows, none of them gating', () => {
    expect(families.length).toBeGreaterThanOrEqual(15);
    // DC-27 adds the browser-host row after the families (pinned below).
    expect(shadow).toEqual(['test:e2e:service-worker', ...families, 'test:e2e:browser-host-chat']);
    // Ruling 7: one row each, never both lists.
    expect(shadow.filter((name) => queued.includes(name))).toEqual([]);
    expect(targets[shadowTarget]?.executor).toBe('nx:noop');
  });

  it('should list each family file once, with no file another tier owns', () => {
    const excluded = new Set([
      ...listed('timingBudgetSpecs'),
      ...listed('hostSpecs'),
      ...listed('liveProviderSpecs'),
      'src/picogk-browser.spec.ts',
      'src/global-setup-preflight.spec.ts',
    ]);
    expect(excluded.size).toBeGreaterThan(15);
    const specs = families.flatMap((family) => specsOf(family).map((spec) => `${family}: ${spec}`));
    for (const entry of specs) {
      const spec = entry.split(': ')[1] ?? '';
      expect(existsSync(resolve(root, 'apps/ui-e2e', spec)), entry).toBe(true);
      expect(excluded.has(spec), entry).toBe(false);
    }
    const files = specs.map((entry) => entry.split(': ')[1]);
    expect(files.length).toBe(new Set(files).size);
  });

  it('should run each family as test:e2e runs its files, one row per family', () => {
    const suite = targets['test:e2e'];
    for (const family of families) {
      const target = targets[family];
      const specs = specsOf(family);
      expect(specs.length, family).toBeGreaterThan(0);
      // The suite's own env fixture and its first command, ui:build under it; no shards, so one row is the suite.
      expect(target?.options?.env, family).toEqual(suite?.options?.env);
      expect(target?.options?.commands?.[0], family).toEqual(suite?.options?.commands?.[0]);
      expect(target?.options?.commands, family).toHaveLength(2);
      expect(target?.metadata?.shards, family).toBeUndefined();
      // The one spec that starts `tau serve` needs the serve build, as test:e2e does.
      expect(target?.dependsOn ?? [], family).toEqual(
        specs.includes('src/external-agent.spec.ts') ? suite?.dependsOn : [],
      );
    }
  });

  it('should run each half of the multi-turn admission vertical as its own family', () => {
    // The whole of chat-multi-turn.spec.ts took 7.5–9.6 min, over the 6.5-min family bound, so it was split in two;
    // both halves in one family would put that row back over the bound.
    const halves = families.flatMap((family) => specsOf(family)).filter((spec) => spec.includes('/chat-multi-turn'));
    expect(halves.toSorted()).toEqual(['src/chat-multi-turn-resume.spec.ts', 'src/chat-multi-turn.spec.ts']);
    for (const half of halves) {
      const owners = families.filter((family) => specsOf(family).includes(half));
      expect(owners, half).toHaveLength(1);
      expect(specsOf(owners[0] ?? ''), half).toEqual([half]);
    }
  });

  it("should install the browsers each family's Vitest instances launch, and no other", () => {
    const firefox = instanceFiles('firefox');
    const webkit = instanceFiles('webkit-smoke');
    expect(firefox).toContain('src/picovoxel-multi.spec.ts');
    expect(webkit).toContain('src/preview.spec.ts');
    for (const family of families) {
      const specs = specsOf(family);
      expect(targets[family]?.metadata?.browsers, family).toEqual([
        'chromium',
        ...(specs.some((spec) => firefox.includes(spec)) ? ['firefox'] : []),
        ...(specs.some((spec) => webkit.includes(spec)) ? ['webkit'] : []),
      ]);
    }
  });
});

describe('desktop-e2e and ui-e2e browser-host shadow rows (DC-27)', () => {
  const desktop = (JSON.parse(read('apps/desktop-e2e/project.json')) as { readonly targets: Record<string, Target> })
    .targets;
  const ui = (JSON.parse(read('apps/ui-e2e/project.json')) as { readonly targets: Record<string, Target> }).targets;
  /** The spec files a target's vitest commands name. */
  const specsOf = (target: Target | undefined): readonly string[] =>
    (target?.options?.commands ?? [])
      .map((command) => (typeof command === 'string' ? command : command.command))
      .filter((command) => /(?:^|\/)vitest run /u.test(command))
      .flatMap((command) => command.split(/\s+/u).filter((word) => /^src\/.+\.spec\.ts$/u.test(word)));
  const families = ['test:e2e:onboarding', 'test:e2e:chat', 'test:e2e:project'];
  /** The desktop-e2e test:e2e files red on an e2e-nightly from 11-22 to 11-25, with their owner issues. */
  const heldOut: Record<string, string> = {
    'src/desktop-adaptive-mode.spec.ts': '#2891',
    'src/desktop-onboarding-offline.spec.ts': '#2285',
    'src/two-client.spec.ts': '#2285',
    'src/sync-refusals.spec.ts': '#2754',
    'src/desktop-share-link-copy.spec.ts': '#2754',
    'src/desktop-print-dry-run.spec.ts': '#2754',
  };

  it('should register the desktop families as shadow rows selected by the desktop lane', () => {
    const shadowRows = desktop[shadowTarget] as
      | (Target & { readonly metadata?: { readonly lane?: string } })
      | undefined;
    expect(shadowRows?.executor).toBe('nx:noop');
    expect(shadowRows?.dependsOn).toEqual(families);
    expect(shadowRows?.metadata?.lane).toBe('desktop');
    expect(desktop[queueTarget]).toBeUndefined();
    // The lane exists and selects the tag:ci:desktop projects.
    const planStep = ci.jobs['plan']?.steps?.find((entry) => entry.id === 'plan');
    const selectors = JSON.parse(planStep?.env?.['LANE_SELECTORS'] ?? '{}') as Record<string, unknown>;
    expect(selectors['desktop']).toEqual({ tags: ['ci:desktop'] });
  });

  it('should split test:e2e into families and held-out files that together are every file it runs, once', () => {
    const whole = specsOf(desktop['test:e2e']);
    const split = [...families, 'test:e2e:print'].flatMap((family) => specsOf(desktop[family]));
    expect(split.length).toBe(new Set(split).size);
    for (const spec of split) {
      expect(whole, spec).toContain(spec);
    }
    // Two-client and sync-refusals keep their own operator target, test:e2e:two-client; print has its own.
    expect(specsOf(desktop['test:e2e:two-client'])).toEqual(['src/two-client.spec.ts', 'src/sync-refusals.spec.ts']);
    expect(specsOf(desktop['test:e2e:print'])).toEqual(['src/desktop-print-dry-run.spec.ts']);
    const familyFiles = families.flatMap((family) => specsOf(desktop[family]));
    expect(familyFiles.filter((spec) => spec in heldOut)).toEqual([]);
    expect([...familyFiles, ...Object.keys(heldOut)].toSorted()).toEqual([...whole].toSorted());
  });

  it('should run each desktop row as test:e2e runs its files', () => {
    const suite = desktop['test:e2e'];
    for (const name of [...families, 'test:e2e:print']) {
      const target = desktop[name];
      expect(target?.dependsOn, name).toEqual(suite?.dependsOn);
      expect(target?.options?.env, name).toEqual(suite?.options?.env);
      expect(target?.options?.commands?.slice(0, 2), name).toEqual(suite?.options?.commands?.slice(0, 2));
      expect(target?.options?.commands, name).toHaveLength(3);
      expect(target?.metadata?.shards, name).toBeUndefined();
      // Electron needs Chromium's system libraries; no desktop file launches Firefox or WebKit.
      expect(target?.metadata?.browsers, name).toEqual(['chromium']);
    }
  });

  const browserHost = ui['test:e2e:browser-host'];
  const browserHostRow = ui['test:e2e:browser-host-chat'];
  /** The command strings of a target, in order. */
  const commandsOf = (target: Target | undefined): readonly string[] =>
    (target?.options?.commands ?? []).map((command) => (typeof command === 'string' ? command : command.command));

  it('should run the passing browser-host files under the env and first command of test:e2e:browser-host', () => {
    expect(browserHostRow?.options?.env).toEqual(browserHost?.options?.env);
    expect(commandsOf(browserHostRow)[0]).toEqual(commandsOf(browserHost)[0]);
    expect(browserHostRow?.metadata?.browsers).toEqual(['chromium']);
    expect(browserHostRow?.metadata?.shards).toBeUndefined();
  });

  it('should take only the files test:e2e:browser-host runs on Chromium alone, none of the red ones', () => {
    const [, chromium = '', ...others] = commandsOf(browserHost);
    expect(chromium).toContain('--project chromium');
    const files = specsOf(browserHostRow);
    expect(files).toEqual(['src/chat-questions.spec.ts', 'src/chat-todo-list.spec.ts']);
    // Each is in the Chromium command and in neither the Firefox nor the WebKit one, so the row's one command is all.
    expect(files.filter((file) => !chromium.includes(file))).toEqual([]);
    expect(others.filter((command) => files.some((file) => command.includes(file)))).toEqual([]);
  });

  it('should keep the desktop diagnostics of a shadow row, as the nightly does', () => {
    const upload = step(lane, 'Upload Vitest Browser diagnostics');
    expect(upload?.with?.['path']).toContain('out/test-results/desktop-e2e');
  });
});
