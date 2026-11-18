/**
 * Build-key identity through the real esbuild bundler (audit R24, catalogue G1).
 *
 * A kernel that declares `sourceIdentity: 'bundle'` is keyed on the bundler's output: comment-only
 * and formatting-only edits print the same bundle, so they hit the previous build. Anything that
 * changes behaviour (code, an import target, an imported asset, a parameter, a content flag, the
 * kernel version) must still change the key. A kernel that does not opt in, or that resolves on its
 * own, keeps raw content. Every scenario runs in a fresh runtime client, so equal keys also agree
 * across workers.
 */
import { describe, expect, it } from 'vitest';
import { createRuntimeClient } from '@taucad/runtime/client';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import {
  createKernelParameterDeclaration,
  createKernelSuccess,
  defineKernel,
  registerKernelModule,
} from '@taucad/runtime/kernel';
import type { KernelServices } from '@taucad/runtime/kernel';
import { defineMiddleware } from '@taucad/runtime/middleware';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { defineRuntime } from '@taucad/runtime/worker';
import { esbuildBundler } from '#esbuild.bundler.js';

type Keys = { evaluate: string; render: string };

const base = {
  'main.ts': [
    "import { radius } from './lib.js';",
    "import { label } from './label.json';",
    'export const defaultParams = { size: 1 };',
    'export default function main(params: { size: number }) {',
    '  return label + ":" + String(radius * params.size);',
    '}',
  ].join('\n'),
  'lib.ts': 'export const radius = 2;\n',
  'other.ts': 'export const radius = 2;\n',
  'label.json': '{"label":"disc"}',
} as const;

type Files = Record<string, string>;

const bundledProgram = async (entryPath: string, runtime: KernelServices) => {
  const bundle = await runtime.bundler.bundle(entryPath);
  if (!bundle.success) {
    throw new Error(bundle.issues.map(({ message }: { message: string }) => message).join('; '));
  }
  const executed = await runtime.execute(bundle.code);
  if (!executed.success) {
    throw new Error(executed.issues.map(({ message }: { message: string }) => message).join('; '));
  }
  return executed.value as { default: (params: { size: number }) => string };
};

type ProbeOptions = {
  kernelVersion?: string;
  resolveThroughBundler?: boolean;
  detected?: boolean;
  /** Opt into bundle source identity (default on for the probe). */
  bundleSourced?: boolean;
};

const keyProbe = ({
  kernelVersion = '1.0.0',
  resolveThroughBundler = true,
  detected = false,
  bundleSourced = true,
}: ProbeOptions = {}) => {
  const probe = defineKernel({
    id: 'build-key-probe',
    extensions: ['ts'],
    // Selected by import detection when the library is imported only by a dependency.
    ...(detected ? { detectImport: /from ['"]probe-lib['"]/u, builtinModuleNames: ['probe-lib'] } : {}),
    name: 'Build key probe',
    version: kernelVersion,
    sourceIdentity: bundleSourced ? 'bundle' : 'files',
    views: { model: { title: 'Model', mimeType: 'image/svg+xml' } },
    exports: {},
    initialize: async (_options, runtime) => {
      registerKernelModule(runtime, {
        name: 'probe-lib',
        exports: { scale: 1 },
        globalName: 'probeLib',
        version: '1.0.0',
      });
      return {};
    },
    resolve: async ({ entryPath }, runtime) =>
      resolveThroughBundler
        ? runtime.bundler.resolveDependencies(entryPath)
        : { resolved: [entryPath, 'lib.ts', 'label.json'], unresolved: [] },
    // Like the bundled kernels, describe executes the module to read its parameters.
    describe: async ({ entryPath }, runtime) => {
      await bundledProgram(entryPath, runtime);
      return createKernelSuccess({
        parameters: createKernelParameterDeclaration(
          { size: 1 },
          { type: 'object', properties: { size: { type: 'number', default: 1 } } },
          { id: 'urn:taucad:test:build-key-probe', name: 'BuildKeyProbeParameters' },
        ),
      });
    },
    evaluate: async ({ entryPath, parameters }, runtime) => {
      const program = await bundledProgram(entryPath, runtime);
      return { handle: program.default(parameters as { size: number }) };
    },
    render: async ({ handle }) => ({
      content: `<svg xmlns="http://www.w3.org/2000/svg"><text>${String(handle)}</text></svg>`,
    }),
  });
  return probe();
};

const evaluateKeys = async (
  files: Files,
  options: ProbeOptions & {
    parameters?: Record<string, unknown>;
    content?: { includeEdges?: boolean };
  } = {},
): Promise<Keys> => {
  const keys: Partial<Keys> = {};
  const recorder = defineMiddleware({
    id: 'KeyRecorder',
    name: 'KeyRecorder',
    version: '1.0.0',
    wrapEvaluate: async (input, handler, { dependencyHash }) => {
      keys.evaluate = dependencyHash;
      return handler(input);
    },
    wrapRender: async (input, handler, { dependencyHash }) => {
      keys.render = dependencyHash;
      return handler(input);
    },
  });
  // Supplies the `includeEdges` content property so a view may ask for it.
  const edges = defineMiddleware({
    id: 'EdgeContent',
    name: 'EdgeContent',
    version: '1.0.0',
    content: { views: { 'image/svg+xml': ['includeEdges'] } },
    wrapRender: async (input, handler) => handler(input),
  });
  const runtime = defineRuntime({
    kernels: [keyProbe(options)],
    bundlers: [esbuildBundler()],
    middleware: [recorder(), edges()],
  });
  const client = createRuntimeClient({ transport: inProcessTransport({ runtime, fileSystem: fromMemoryFs(files) }) });
  const document = client.open({ source: { path: 'main.ts' }, parameters: options.parameters ?? {}, watch: false });
  const view = document.view('model', options.content ? { content: options.content } : undefined);
  try {
    const rendered = await view.rendering();
    if (rendered.superseded || !rendered.rendering.success) {
      throw new Error(`Render failed: ${JSON.stringify(rendered)}`);
    }
  } finally {
    view.close();
    document.close();
    client.terminate();
  }
  if (keys.evaluate === undefined || keys.render === undefined) {
    throw new Error('The recorder saw no build');
  }
  return keys as Keys;
};

describe('build key from the bundled output', () => {
  it('is a hit for a comment-only edit in the entry and in an imported module', async () => {
    const reference = await evaluateKeys(base);
    const commented = await evaluateKeys({
      ...base,
      'main.ts': `// A note about the model\n${base['main.ts']}\n/* trailing block comment */\n`,
      'lib.ts': `/** The radius. */\n${base['lib.ts']}`,
    });

    expect(commented).toEqual(reference);
  });

  it('is a hit for a formatting-only edit', async () => {
    const reference = await evaluateKeys(base);
    const reformatted = await evaluateKeys({
      ...base,
      'main.ts': base['main.ts'].replaceAll('  return', '\t\treturn').replaceAll(';', ' ;\n'),
    });

    expect(reformatted).toEqual(reference);
  });

  it('is a miss for a code edit', async () => {
    const reference = await evaluateKeys(base);
    const edited = await evaluateKeys({ ...base, 'lib.ts': 'export const radius = 3;\n' });

    expect(edited.evaluate).not.toBe(reference.evaluate);
    expect(edited.render).not.toBe(reference.render);
  });

  it('is a miss when an import moves to another file with the same content', async () => {
    const reference = await evaluateKeys(base);
    const retargeted = await evaluateKeys({ ...base, 'main.ts': base['main.ts'].replace('./lib.js', './other.js') });

    expect(retargeted.evaluate).not.toBe(reference.evaluate);
  });

  it('is a miss when an imported asset changes', async () => {
    const reference = await evaluateKeys(base);
    const relabelled = await evaluateKeys({ ...base, 'label.json': '{"label":"ring"}' });

    expect(relabelled.evaluate).not.toBe(reference.evaluate);
  });

  it('is a miss for a parameter change', async () => {
    const reference = await evaluateKeys(base, { parameters: { size: 1 } });
    const resized = await evaluateKeys(base, { parameters: { size: 2 } });

    expect(resized.evaluate).not.toBe(reference.evaluate);
  });

  it('is a miss for a kernel version change', async () => {
    const reference = await evaluateKeys(base);
    const upgraded = await evaluateKeys(base, { kernelVersion: '1.0.1' });

    expect(upgraded.evaluate).not.toBe(reference.evaluate);
  });

  it('is a hit for a comment-only edit when the kernel is selected by import detection', async () => {
    const detected = {
      ...base,
      'lib.ts': "import { scale } from 'probe-lib';\nexport const radius = 2 * scale;\n",
    };
    const reference = await evaluateKeys(detected, { detected: true });
    const commented = await evaluateKeys(
      { ...detected, 'main.ts': `// A note\n${base['main.ts']}` },
      { detected: true },
    );
    const edited = await evaluateKeys(
      { ...detected, 'lib.ts': detected['lib.ts'].replace('2 *', '3 *') },
      { detected: true },
    );

    expect(commented.evaluate).toBe(reference.evaluate);
    expect(edited.evaluate).not.toBe(reference.evaluate);
  });

  it('keys raw source content for a kernel that does not resolve through the bundler', async () => {
    const reference = await evaluateKeys(base, { resolveThroughBundler: false });
    const commented = await evaluateKeys(
      { ...base, 'main.ts': `// A note about the model\n${base['main.ts']}` },
      { resolveThroughBundler: false },
    );

    expect(commented.evaluate).not.toBe(reference.evaluate);
  });

  it('keys raw source content for a kernel that does not opt into bundle source identity', async () => {
    const reference = await evaluateKeys(base, { bundleSourced: false });
    const commented = await evaluateKeys(
      { ...base, 'main.ts': `// A note about the model\n${base['main.ts']}` },
      { bundleSourced: false },
    );

    expect(commented.evaluate).not.toBe(reference.evaluate);
  });

  it('keys render content on its effective value, and a changed value misses', async () => {
    const reference = await evaluateKeys(base);
    const explicitDefault = await evaluateKeys(base, { content: { includeEdges: false } });
    const edges = await evaluateKeys(base, { content: { includeEdges: true } });

    expect(explicitDefault.render).toBe(reference.render);
    expect(edges.render).not.toBe(reference.render);
    expect(edges.evaluate).toBe(reference.evaluate);
  });
});

describe('module execution across an edit', () => {
  it('reuses the executed module when an edit prints the same bundle, and executes changed code', async () => {
    const executions = { count: 0 };
    const counter = '__buildKeyExecutions';
    Object.assign(globalThis, { [counter]: executions });
    const source = `(globalThis as any).${counter}.count++;\n${base['main.ts']}`;
    const runtime = defineRuntime({ kernels: [keyProbe()], bundlers: [esbuildBundler()] });
    const client = createRuntimeClient({
      transport: inProcessTransport({ runtime, fileSystem: fromMemoryFs({ ...base, 'main.ts': source }) }),
    });
    const document = client.open({ source: { path: 'main.ts' }, parameters: {}, watch: false });
    const encode = (text: string) => new TextEncoder().encode(text);
    try {
      const first = await document.evaluation();
      expect(executions.count).toBe(1);

      const commented = await document.update({ stage: { 'main.ts': encode(`// edited comment\n${source}`) } });
      expect(executions.count).toBe(1);
      // The build is reused, but the result still names the bytes it was asked about.
      const revisionOf = (outcome: typeof first) =>
        outcome.superseded ? undefined : outcome.evaluation.sourceRevision?.files['main.ts'];
      expect(revisionOf(commented)).toBeDefined();
      expect(revisionOf(commented)).not.toBe(revisionOf(first));

      await document.update({
        stage: { 'main.ts': encode(source.replace('radius * params.size', 'radius + params.size')) },
      });
      expect(executions.count).toBe(2);
    } finally {
      document.close();
      client.terminate();
      Reflect.deleteProperty(globalThis, counter);
    }
  });
});

const emptyParameters = createKernelParameterDeclaration(
  {},
  { type: 'object', properties: {} },
  { id: 'urn:taucad:test:build-key-review', name: 'BuildKeyReviewParameters' },
);

/**
 * A kernel that resolves through the bundler (as every first-party JS kernel does) but whose output
 * also depends on the raw entry text: here the first line, standing in for a header comment, a
 * `// @param` annotation or a JSDoc label a third-party kernel might read.
 */
const rawReadingKernel = defineKernel({
  id: 'raw-reader',
  extensions: ['ts'],
  name: 'Raw reader',
  version: '1.0.0',
  views: { model: { title: 'Model', mimeType: 'image/svg+xml' } },
  exports: {},
  initialize: async () => ({}),
  resolve: async ({ entryPath }, runtime) => runtime.bundler.resolveDependencies(entryPath),
  describe: async () => createKernelSuccess({ parameters: emptyParameters }),
  evaluate: async ({ entryPath }, runtime) => {
    const bundle = await runtime.bundler.bundle(entryPath);
    if (!bundle.success) {
      throw new Error('bundle failed');
    }
    const text = await runtime.filesystem.readFile(entryPath, 'utf8');
    return { handle: text.split('\n', 1)[0] };
  },
  render: async ({ handle }) => ({
    content: `<svg xmlns="http://www.w3.org/2000/svg"><text>${String(handle)}</text></svg>`,
  }),
});

/** A bundling kernel whose initialize registers one global built-in. */
const bundlingKernel = ({
  id,
  extension,
  moduleName,
  globalName,
}: Record<'id' | 'extension' | 'moduleName' | 'globalName', string>) =>
  defineKernel({
    id,
    extensions: [extension],
    name: id,
    version: '1.0.0',
    sourceIdentity: 'bundle',
    views: { model: { title: 'Model', mimeType: 'image/svg+xml' } },
    exports: {},
    initialize: async (_options, runtime) => {
      registerKernelModule(runtime, { name: moduleName, exports: { a: 1 }, globalName, version: '1.0.0' });
      return {};
    },
    resolve: async ({ entryPath }, runtime) => runtime.bundler.resolveDependencies(entryPath),
    describe: async () => createKernelSuccess({ parameters: emptyParameters }),
    evaluate: async ({ entryPath }, runtime) => {
      const bundle = await runtime.bundler.bundle(entryPath);
      const executed = await runtime.execute(bundle.code);
      if (!executed.success) {
        throw new Error('execute failed');
      }
      return { handle: String((executed.value as { default: () => unknown }).default()) };
    },
    render: async ({ handle }) => ({
      content: `<svg xmlns="http://www.w3.org/2000/svg"><text>${String(handle)}</text></svg>`,
    }),
  });
const tsKernel = bundlingKernel({ id: 'ts-probe', extension: 'ts', moduleName: 'ts-lib', globalName: 'tsLib' });
const jsKernel = bundlingKernel({ id: 'js-probe', extension: 'js', moduleName: 'js-lib', globalName: 'jsLib' });

const svgText = (rendering: unknown): string => /<text>(.*?)<\/text>/u.exec(JSON.stringify(rendering))?.[1] ?? '';

describe('a kernel that resolves through the bundler but reads raw sources, without the opt-in', () => {
  it('re-evaluates when the first line of the entry changes', async () => {
    const runtime = defineRuntime({ kernels: [rawReadingKernel()], bundlers: [esbuildBundler()] });
    const source = '// title: first\nexport default function main() { return 1; }\n';
    const client = createRuntimeClient({
      transport: inProcessTransport({ runtime, fileSystem: fromMemoryFs({ 'main.ts': source }) }),
    });
    const document = client.open({ source: { path: 'main.ts' }, parameters: {}, watch: false });
    const encode = (text: string) => new TextEncoder().encode(text);
    try {
      const view = document.view('model');
      const first = await view.rendering();
      expect(svgText(first)).toBe('// title: first');

      await document.update({ stage: { 'main.ts': encode(source.replace('first', 'second')) } });
      const second = await view.rendering();
      expect(svgText(second)).toBe('// title: second');
      view.close();
    } finally {
      document.close();
      client.terminate();
    }
  });
});

describe('build key across workers with different kernel histories', () => {
  const files = {
    'main.ts': 'export default function main() { return 1; }\n',
    'other.js': 'export default function main() { return 2; }\n',
  };

  const keyOf = async (openFirst: readonly string[]): Promise<string> => {
    let key: string | undefined;
    const recorder = defineMiddleware({
      id: 'KeyRecorder',
      name: 'KeyRecorder',
      version: '1.0.0',
      wrapEvaluate: async (input, handler, { dependencyHash }) => {
        if (input.entryPath === 'main.ts') {
          key = dependencyHash;
        }
        return handler(input);
      },
    });
    const runtime = defineRuntime({
      kernels: [tsKernel(), jsKernel()],
      bundlers: [esbuildBundler()],
      middleware: [recorder()],
    });
    const client = createRuntimeClient({ transport: inProcessTransport({ runtime, fileSystem: fromMemoryFs(files) }) });
    try {
      for (const path of [...openFirst, 'main.ts']) {
        const document = client.open({ source: { path }, parameters: {}, watch: false });
        const view = document.view('model');
        // oxlint-disable-next-line no-await-in-loop -- the order the worker opens files is the history under test
        const rendered = await view.rendering();
        if (rendered.superseded || !rendered.rendering.success) {
          throw new Error(`Render of ${path} failed: ${JSON.stringify(rendered)}`);
        }
        view.close();
        document.close();
      }
    } finally {
      client.terminate();
    }
    if (key === undefined) {
      throw new Error('no key recorded');
    }
    return key;
  };

  it('keys main.ts the same whether or not the worker has initialized another kernel first', async () => {
    const fresh = await keyOf([]);
    const warm = await keyOf(['other.js']);
    // The bundle binds only the selected kernel's globals, so another kernel's registrations do not
    // reach main.ts's bundle or key.
    expect(warm).toBe(fresh);
  });
});

/**
 * A kernel that resolves on its own (`resolve` never touches the bundler) but bundles in evaluate,
 * and whose output also reads the raw entry: it keeps raw content hashes whatever the worker saw.
 */
const ownResolveKernel = defineKernel({
  id: 'own-resolve',
  extensions: ['ts'],
  name: 'Own resolve',
  version: '1.0.0',
  views: { model: { title: 'Model', mimeType: 'image/svg+xml' } },
  exports: {},
  initialize: async () => ({}),
  resolve: async ({ entryPath }) => ({ resolved: [entryPath], unresolved: [] }),
  describe: async () =>
    createKernelSuccess({
      parameters: createKernelParameterDeclaration(
        { size: 1 },
        { type: 'object', properties: { size: { type: 'number', default: 1 } } },
        { id: 'urn:taucad:test:own-resolve', name: 'OwnResolveParameters' },
      ),
    }),
  evaluate: async ({ entryPath, parameters }, runtime) => {
    await runtime.bundler.bundle(entryPath);
    const text = await runtime.filesystem.readFile(entryPath, 'utf8');
    return { handle: `${text.split('\n', 1)[0]}|${String(parameters['size'])}` };
  },
  render: async ({ handle }) => ({
    content: `<svg xmlns="http://www.w3.org/2000/svg"><text>${String(handle)}</text></svg>`,
  }),
});

describe('a kernel that resolves on its own', () => {
  it('re-evaluates a first-line edit after an unrelated file changed', async () => {
    const runtime = defineRuntime({ kernels: [ownResolveKernel()], bundlers: [esbuildBundler()] });
    const source = '// title: first\nexport default function main() { return 1; }\n';
    const client = createRuntimeClient({
      transport: inProcessTransport({ runtime, fileSystem: fromMemoryFs({ 'main.ts': source, 'notes.txt': 'a' }) }),
    });
    const document = client.open({ source: { path: 'main.ts' }, parameters: { size: 1 }, watch: false });
    const view = document.view('model');
    try {
      expect(svgText(await view.rendering())).toBe('// title: first|1');
      // An unrelated write clears the common dependency cache but not main.ts's bundle, which
      // evaluate left in the worker; the key must still read the raw entry.
      await document.update({ stage: { 'notes.txt': 'b' } });
      expect(svgText(await view.rendering())).toBe('// title: first|1');
      await document.update({ stage: { 'main.ts': source.replace('first', 'second') } });
      expect(svgText(await view.rendering())).toBe('// title: second|1');
    } finally {
      view.close();
      document.close();
      client.terminate();
    }
  });
});
