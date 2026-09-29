import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import * as xstate from 'xstate';
import {
  checkStateInCallee,
  deprecatedSnapshotImports,
  gatedExports,
  gatedModules,
  registryImports,
  workspaceRoot,
  xstateContractRule,
} from './xstate-contract.js';

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
  },
});

// Oxlint hands rules absolute paths, and file classes are relative to the workspace root.
const at = (relative) => path.join(workspaceRoot, relative);
const product = at('packages/example/src/owner.ts');
const productMachine = at('packages/example/src/owner.machine.ts');
const test = at('packages/example/src/owner.test.ts');
const spike = at('packages/example/src/__spikes__/probe.ts');
const tooling = at('tools/example/probe.ts');
const harness = at('libs/xstate-testing/src/inspect.ts');
const productTools = at('libs/chat/src/schemas/tools/probe.ts');

/** Prefixes a body with an `xstate` import, which member and key checks require. */
const withXstate = (body) => `import { setup } from 'xstate';\n${body}`;

/**
 * A product-invalid, test-invalid case pair: the forbidden forms of MC-R13 and
 * MC-R15 stay out of tests too.
 */
const everywhereInvalid = (name, code, messageId) => [
  { name: `${name} (product)`, filename: product, code, errors: [{ messageId }] },
  { name: `${name} (test)`, filename: test, code, errors: [{ messageId }] },
];

/** A product-invalid case that is valid under a spike, a test and tooling (MC-A2). */
const gated = (name, code, messageId) => ({
  invalid: [product, productTools].map((filename) => ({
    name: `${name} (${path.relative(workspaceRoot, filename)})`,
    filename,
    code,
    errors: [{ messageId }],
  })),
  valid: [spike, test, tooling, harness].map((filename) => ({
    name: `${name} (${path.relative(workspaceRoot, filename)})`,
    filename,
    code,
  })),
});

const gatedCases = [
  ...gatedModules.map((module) => gated(`import of ${module}`, `import { x } from '${module}';`, 'gatedModule')),
  gated('export from a gated module', "export * from 'xstate/durable';", 'gatedModule'),
  gated('named import of createFSM', "import { createFSM } from 'xstate';", 'gatedExport'),
  gated('type import of ActorSystemRuntime', "import type { ActorSystemRuntime } from 'xstate';", 'gatedExport'),
  gated('call of enq.step', withXstate("const f = (_, enq) => enq.step('s', () => 1);"), 'gatedMember'),
  gated('system.runtime member', withXstate('const f = ({ self }) => self.system.runtime;'), 'gatedMember'),
  gated('embedChildren key', withXstate('const options = { embedChildren: true };'), 'gatedMember'),
];

describe('xstate-contract', () => {
  it('reports every forbidden form (MC-A1)', () => {
    ruleTester.run('xstate-contract', xstateContractRule, {
      valid: [],
      invalid: [
        ...everywhereInvalid(
          'registry: systemId key',
          withXstate("setup({}).createMachine({ invoke: { src: 'child', id: 'child', systemId: 'child' } });"),
          'registry',
        ),
        ...everywhereInvalid(
          'registry: registryKey key',
          withXstate("const options = { registryKey: 'root' };"),
          'registry',
        ),
        ...everywhereInvalid('registry: createSystem import', "import { createSystem } from 'xstate';", 'registry'),
        ...everywhereInvalid(
          'systemLookup: system.get',
          withXstate("const f = ({ system }) => system.get('child');"),
          'systemLookup',
        ),
        ...everywhereInvalid(
          'systemLookup: self.system.getAll',
          withXstate('const f = ({ self }) => self.system.getAll();'),
          'systemLookup',
        ),
        ...everywhereInvalid(
          'parentAddress: parent destructured in setup',
          withXstate("setup({ actions: { notify: ({ parent }) => parent?.send({ type: 'x' }) } });"),
          'parentAddress',
        ),
        ...everywhereInvalid(
          'parentAddress: parent read off the first parameter in createMachine',
          withXstate("setup({}).createMachine({ entry: (args, enq) => enq.sendTo(args.parent, { type: 'x' }) });"),
          'parentAddress',
        ),
        ...everywhereInvalid(
          'parentAddress: sendParent import',
          "import { sendParent } from 'xstate';",
          'parentAddress',
        ),
        ...everywhereInvalid(
          'stringTarget: undeclared string sendTo target',
          withXstate("setup({}).createMachine({ entry: (_, enq) => enq.sendTo('peer', { type: 'x' }) });"),
          'stringTarget',
        ),
        ...everywhereInvalid(
          'stringTarget: undeclared template sendTo target',
          withXstate("setup({}).createMachine({ entry: (_, enq) => enq.sendTo(`peer`, { type: 'x' }) });"),
          'stringTarget',
        ),
        ...everywhereInvalid(
          'routeState: route key on a state node',
          withXstate('setup({}).createMachine({ states: { idle: { route: {} } } });'),
          'routeState',
        ),
        ...everywhereInvalid(
          'routeState: the xstate.route literal',
          withXstate("const f = (_, enq) => enq.raise({ type: 'xstate.route', to: '#a' });"),
          'routeState',
        ),
        ...everywhereInvalid(
          'checkStateInSelf',
          "import { checkStateIn } from 'xstate';\nconst f = ({ self }) => checkStateIn(self.getSnapshot(), 'busy');",
          'checkStateInSelf',
        ),
        ...everywhereInvalid(
          'deprecatedSnapshot: getNextSnapshot',
          "import { getNextSnapshot } from 'xstate';",
          'deprecatedSnapshot',
        ),
        ...everywhereInvalid(
          'deprecatedSnapshot: getInitialSnapshot',
          "import { getInitialSnapshot } from 'xstate';",
          'deprecatedSnapshot',
        ),
        ...everywhereInvalid(
          'internalEventsArray',
          withXstate("setup({ schemas: { internalEvents: ['tick'] } });"),
          'internalEventsArray',
        ),
        {
          name: 'persistedSnapshot: getPersistedSnapshot',
          filename: product,
          code: withXstate('const saved = actor.getPersistedSnapshot();'),
          errors: [{ messageId: 'persistedSnapshot' }],
        },
        {
          name: 'persistedSnapshot: restoreSnapshot',
          filename: product,
          code: withXstate('store.restoreSnapshot(saved);'),
          errors: [{ messageId: 'persistedSnapshot' }],
        },
        {
          name: 'persistedSnapshot: snapshot option on createActor',
          filename: product,
          code: "import { createActor } from 'xstate';\nconst actor = createActor(machine, { snapshot: saved });",
          errors: [{ messageId: 'persistedSnapshot' }],
        },
        {
          name: 'persistedSnapshot: migrate key',
          filename: product,
          code: withXstate('const versions = { migrate: (snapshot) => snapshot };'),
          errors: [{ messageId: 'persistedSnapshot' }],
        },
        {
          name: 'provideActions: actions provided in a *.machine.ts',
          filename: productMachine,
          code: 'export const provided = machine.provide({ actions: { appendRows: (rows) => rows } });',
          errors: [{ messageId: 'provideActions' }],
        },
        {
          name: 'provideActions: an action provided under another name',
          filename: product,
          code: 'const actor = machine.provide({ actions: { appendRows: appendRowsImpl } });',
          errors: [{ messageId: 'provideActions' }],
        },
        {
          name: 'provideActions: a spread of actions',
          filename: product,
          code: 'const actor = machine.provide({ actions: { ...effects } });',
          errors: [{ messageId: 'provideActions' }],
        },
      ],
    });
  });

  it('keeps gated forms out of product code only (MC-A2)', () => {
    ruleTester.run('xstate-contract', xstateContractRule, {
      valid: gatedCases.flatMap((entry) => entry.valid),
      invalid: gatedCases.flatMap((entry) => entry.invalid),
    });
  });

  it('keeps the near-misses valid (MC-A3)', () => {
    ruleTester.run('xstate-contract', xstateContractRule, {
      valid: [
        {
          name: 'a state named route',
          filename: product,
          code: withXstate('setup({}).createMachine({ states: { route: { on: {} } } });'),
        },
        {
          name: 'a route key outside a file that imports xstate',
          filename: product,
          code: "const table = { states: { idle: { route: '/x' } } };",
        },
        { name: 'unitData.system', filename: product, code: withXstate('const units = unitData.system;') },
        {
          name: 'system.get outside a file that imports xstate',
          filename: product,
          code: "const value = system.get('key');",
        },
        {
          name: 'enq.sendTo to an own invoke id',
          filename: product,
          code: withXstate(
            "setup({}).createMachine({ invoke: { id: 'child', src: 'child' }, entry: (_, enq) => enq.sendTo('child', { type: 'x' }) });",
          ),
        },
        {
          name: 'enq.sendTo to an own spawn id',
          filename: product,
          code: withXstate(
            "setup({}).createMachine({ entry: (_, enq) => { enq.spawn(child, { id: 'child' }); enq.sendTo('child', { type: 'x' }); } });",
          ),
        },
        {
          name: 'enq.sendTo to an input ref',
          filename: product,
          code: withXstate(
            "setup({}).createMachine({ entry: ({ context }, enq) => enq.sendTo(context.parentRef, { type: 'x' }) });",
          ),
        },
        {
          name: 'a parent field on a nested callback parameter',
          filename: product,
          code: withXstate(
            'setup({}).createMachine({ entry: ({ context }) => context.rows.map((row) => row.parent) });',
          ),
        },
        {
          name: 'matchesState over an argument value',
          filename: product,
          code: "import { matchesState } from 'xstate';\nconst f = (value, args) => matchesState(value, args.value);",
        },
        {
          name: 'internalEvents as a schema map',
          filename: product,
          code: withXstate('setup({ schemas: { internalEvents: { tick: types() } } });'),
        },
        {
          name: 'getPersistedSnapshot in a test',
          filename: test,
          code: withXstate('const saved = actor.getPersistedSnapshot();'),
        },
        {
          name: 'provide with actions built by a call in a root',
          filename: product,
          code: 'const actor = machine.provide({ actions: createEffects(deps) });',
        },
        {
          name: 'provide with a same-name shorthand',
          filename: product,
          code: 'const actor = machine.provide({ actions: { appendRows } });',
        },
        {
          name: 'provide with a keyed arrow',
          filename: product,
          code: 'const actor = machine.provide({ actions: { appendRows: (rows) => store.append(rows) } });',
        },
        {
          name: 'provide with a method and an anonymous function expression',
          filename: product,
          code: 'const actor = machine.provide({ actions: { appendRows(rows) {}, clear: function () {} } });',
        },
        {
          name: 'provide with actors only',
          filename: productMachine,
          code: 'export const provided = machine.provide({ actors: { load: loadLogic } });',
        },
        {
          name: 'any form under a spike',
          filename: spike,
          code: withXstate(
            "const f = ({ system }) => system.get('child');\nconst saved = actor.getPersistedSnapshot();",
          ),
        },
      ],
      invalid: [],
    });
  });

  it('should name only value exports and subpaths that xstate still has', () => {
    const require = createRequire(import.meta.url);
    const packageJsonPath = require.resolve('xstate/package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    const declarations = readFileSync(
      path.join(path.dirname(packageJsonPath), 'dist/declarations/src/index.d.ts'),
      'utf8',
    );
    const typeExports = ['ActorSystemRuntime'];
    // `sendParent` is also flagged, as a v5 habit; alpha.59 no longer exports it, so it is not listed here.
    const valueNames = [
      ...gatedExports.filter((name) => !typeExports.includes(name)),
      ...registryImports,
      ...deprecatedSnapshotImports,
      checkStateInCallee,
    ];

    expect(valueNames.filter((name) => !(name in xstate))).toEqual([]);
    expect(typeExports.filter((name) => !new RegExp(`\\b${name}\\b`, 'u').test(declarations))).toEqual([]);
    expect(
      gatedModules.map((module) => module.replace('xstate', '.')).filter((key) => !(key in packageJson.exports)),
    ).toEqual([]);
  });

  it('keeps the harness out of product code (MC-A6)', () => {
    ruleTester.run('xstate-contract', xstateContractRule, {
      valid: [
        {
          name: 'harness in a test',
          filename: test,
          code: "import { guardActors } from '@taucad/xstate-testing/inspect';",
        },
        { name: 'harness root in a test', filename: test, code: "import * as harness from '@taucad/xstate-testing';" },
      ],
      invalid: [
        {
          name: 'harness subpath in product',
          filename: product,
          code: "import { guardActors } from '@taucad/xstate-testing/inspect';",
          errors: [{ messageId: 'harnessImport' }],
        },
        {
          name: 'harness root in product',
          filename: product,
          code: "import * as harness from '@taucad/xstate-testing';",
          errors: [{ messageId: 'harnessImport' }],
        },
      ],
    });
  });
});
