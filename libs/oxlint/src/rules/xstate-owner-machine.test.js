import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { xstateOwnerMachineRule } from './xstate-owner-machine.js';

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
  },
});

const owner = 'packages/example/src/owner.machine.ts';
const spike = 'packages/example/src/__spikes__/owner.machine.ts';
const spec = [{ spec: true }];

/** Wraps state-node keys in a compliant owner machine: a version, a root `onError` with meta, and nothing else. */
const machine = (keys = '') =>
  [
    "import { setup } from 'xstate';",
    'export const ownerMachine = setup({}).createMachine({',
    "  version: '1',",
    "  onError: { target: '.failed', meta: { tla: 'Fail' } },",
    `  ${keys}`,
    '});',
  ].join('\n');

const impureForms = [
  ['Date.now()', 'const at = Date.now();'],
  ['argument-less new Date()', 'const at = new Date();'],
  ['performance.now()', 'const at = performance.now();'],
  ['Math.random()', 'const roll = Math.random();'],
  ['a crypto.* call', 'const id = crypto.getRandomValues(bytes);'],
  ['randomUUID', "import { randomUUID } from 'node:crypto';\nconst id = randomUUID();"],
  ['randomUuid', 'const id = randomUuid();'],
  ['generatePrefixedId', "const id = generatePrefixedId('log');"],
];

describe('xstate-owner-machine', () => {
  it('reports one case per message and per impure call form (MC-A5)', () => {
    ruleTester.run('xstate-owner-machine', xstateOwnerMachineRule, {
      valid: [
        { name: 'a compliant owner', filename: owner, code: machine() },
        {
          name: 'a select* read of another snapshot',
          filename: owner,
          code: `${machine()}\nexport const selectFacet = (snapshot) => snapshot.children.branch?.getSnapshot();\nexport function selectBusy(ref) { return [ref].some((child) => child.getSnapshot().context.busy); }`,
        },
        {
          name: 'a named effect: enq(actions.appendRows, …)',
          filename: owner,
          code: machine('entry: ({ actions, context }, enq) => enq(actions.appendRows, context.rows),'),
        },
        {
          name: 'a type-only import under portable',
          filename: owner,
          options: [{ portable: true }],
          code: `import type { Chat } from '@taucad/chat';\nimport { type Row } from '@taucad/chat';\nimport { eventSchemas } from '#machine-schemas.js';\n${machine()}`,
        },
        {
          name: 'a value import outside portable mode',
          filename: owner,
          code: `import { modelSupportsInput } from '@taucad/chat';\n${machine()}`,
        },
        { name: 'new Date with an argument', filename: owner, code: `${machine()}\nconst at = new Date(0);` },
        {
          name: 'spawn by logic value',
          filename: owner,
          code: machine("entry: ({ actors }, enq) => enq.spawn(actors.turn, { id: 'turn' }),"),
        },
        {
          name: 'transitions with meta and a spec',
          filename: owner,
          options: spec,
          code: machine(
            "on: { go: { target: '.b', meta: { tla: 'Go' } }, stop: [{ target: '.c', meta: { tla: 'Stop' } }] }, always: { target: '.d', meta: { tla: 'D' } },",
          ),
        },
        {
          name: 'transitions without meta and no spec',
          filename: owner,
          code: machine("on: { go: ({ context }) => ({ target: '.b' }), stop: '.c' },"),
        },
        {
          name: 'the transitionMeta invalid cases without spec',
          filename: owner,
          code: machine(
            "on: { go: { target: '.b' } }, after: { 100: '.b' }, always: [{ target: '.c' }], states: { busy: { invoke: { src: 'load', onDone: { target: 'idle' } }, timeout: 100, onTimeout: 'idle' }, idle: {} },",
          ),
        },
        {
          name: 'anything under a spike',
          filename: spike,
          options: spec,
          code: "import { fromSafeAsync } from '#lib/xstate.lib.js';\nconst at = Date.now();",
        },
      ],
      invalid: [
        {
          name: 'inlineEffect: enq with an arrow',
          filename: owner,
          code: machine("entry: (_, enq) => enq(() => console.error('x')),"),
          errors: [{ messageId: 'inlineEffect' }],
        },
        {
          name: 'inlineEffect: a renamed second parameter with a function expression',
          filename: owner,
          code: machine('entry: (_, queue) => queue(function () {}),'),
          errors: [{ messageId: 'inlineEffect' }],
        },
        ...impureForms.map(([name, code]) => ({
          name: `impure: ${name}`,
          filename: owner,
          code: `${machine()}\n${code}`,
          errors: [{ messageId: 'impure' }],
        })),
        {
          name: 'snapshotRead: getSnapshot outside a select* function',
          filename: owner,
          code: `${machine()}\nconst heldBy = (ref) => ref.getSnapshot().context.runId;`,
          errors: [{ messageId: 'snapshotRead' }],
        },
        {
          name: 'rootOnError',
          filename: owner,
          code: "import { setup } from 'xstate';\nexport const m = setup({}).createMachine({ version: '1' });",
          errors: [{ messageId: 'rootOnError' }],
        },
        {
          name: 'version',
          filename: owner,
          code: "import { setup } from 'xstate';\nexport const m = setup({}).createMachine({ onError: { target: '.failed', meta: {} } });",
          errors: [{ messageId: 'version' }],
        },
        {
          name: 'fromSafeAsync',
          filename: owner,
          code: `import { fromSafeAsync } from '#lib/xstate.lib.js';\n${machine()}`,
          errors: [{ messageId: 'fromSafeAsync' }],
        },
        {
          name: 'portableImport: a value import from another package',
          filename: owner,
          options: [{ portable: true }],
          code: `import { modelSupportsInput } from '@taucad/chat';\n${machine()}`,
          errors: [{ messageId: 'portableImport' }],
        },
        {
          name: 'portableImport: a value import beside an inline type',
          filename: owner,
          options: [{ portable: true }],
          code: `import { type Row, append } from '@taucad/chat';\n${machine()}`,
          errors: [{ messageId: 'portableImport' }],
        },
        {
          name: 'spawnByKey',
          filename: owner,
          code: machine("entry: (_, enq) => enq.spawn('turn', { id: 'turn' }),"),
          errors: [{ messageId: 'spawnByKey' }],
        },
        {
          name: 'transitionMeta: a transition function',
          filename: owner,
          options: spec,
          code: machine("on: { go: ({ context }) => ({ target: '.b' }) },"),
          errors: [{ messageId: 'transitionMeta' }],
        },
        {
          name: 'transitionMeta: an object without meta',
          filename: owner,
          options: spec,
          code: machine("on: { go: { target: '.b' } },"),
          errors: [{ messageId: 'transitionMeta' }],
        },
        {
          name: 'transitionMeta: a string target shorthand',
          filename: owner,
          options: spec,
          code: machine("after: { 100: '.b' },"),
          errors: [{ messageId: 'transitionMeta' }],
        },
        {
          name: 'transitionMeta: one array element without meta',
          filename: owner,
          options: spec,
          code: machine("always: [{ target: '.b', meta: { tla: 'B' } }, { target: '.c' }],"),
          errors: [{ messageId: 'transitionMeta' }],
        },
        {
          name: 'transitionMeta: an invoke onDone and a state onTimeout',
          filename: owner,
          options: spec,
          code: machine(
            "states: { busy: { invoke: { src: 'load', onDone: { target: 'idle' } }, timeout: 100, onTimeout: 'idle' }, idle: {} },",
          ),
          errors: [{ messageId: 'transitionMeta' }, { messageId: 'transitionMeta' }],
        },
      ],
    });
  });

  it('should suppress only the pending message ids', () => {
    ruleTester.run('xstate-owner-machine', xstateOwnerMachineRule, {
      valid: [
        {
          name: 'every violation pending',
          filename: owner,
          options: [{ spec: true, pending: ['rootOnError', 'version', 'impure', 'transitionMeta'] }],
          code: "import { setup } from 'xstate';\nexport const m = setup({}).createMachine({ on: { go: '.b' } });\nconst at = Date.now();",
        },
      ],
      invalid: [
        {
          name: 'impure is not pending',
          filename: owner,
          options: [{ spec: true, pending: ['rootOnError', 'version', 'transitionMeta'] }],
          code: "import { setup } from 'xstate';\nexport const m = setup({}).createMachine({ on: { go: '.b' } });\nconst at = Date.now();",
          errors: [{ messageId: 'impure' }],
        },
      ],
    });
  });
});
