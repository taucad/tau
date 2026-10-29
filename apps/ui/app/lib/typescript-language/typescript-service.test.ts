import { describe, expect, it, vi } from 'vitest';
import { EditorDocument } from '#lib/editor-document.js';
import { TypeAcquisitionController } from '#lib/typescript-language/type-acquisition.js';
import { createTypeScriptService, TypeScriptService } from '#lib/typescript-language/typescript-service.js';
import type { TypeScriptWorkerPort } from '#lib/typescript-language/typescript-service.js';

const setExtraLib = vi.hoisted(() => vi.fn(async (_uri: string, _text: string) => undefined));
vi.mock('@taucad/lsp/typescript-worker/client', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Mock the exported worker class name.
  TypeScriptWorkerClient: class {
    public readonly setExtraLib = setExtraLib;
    public readonly request = vi.fn(async () => []);
    public dispose(): void {
      /* No worker in this service boot test. */
    }
  },
}));

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let release = (): void => {
    throw new Error('not initialized');
  };
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, resolve: release };
}

function fixture(open: TypeScriptWorkerPort['open'] = vi.fn(async () => undefined)) {
  const client: TypeScriptWorkerPort = {
    open,
    change: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    setExtraLib: vi.fn(async () => undefined),
    removeExtraLib: vi.fn(async () => undefined),
    request: vi.fn(async () => {
      throw new Error('No semantic request expected in lifecycle test');
    }),
    dispose: vi.fn(),
  };
  const acquisition = new TypeAcquisitionController({ client, staticTypes: [], dynamicTypes: false });
  return { service: new TypeScriptService(client, acquisition), client };
}

describe('TypeScriptService document lifecycle', () => {
  it('subscribes before the initial worker round-trip and replays the intervening UTF-16 edit', async () => {
    const gate = deferred();
    const { service, client } = fixture(vi.fn(async () => gate.promise));
    const document = new EditorDocument('main.ts', 'const x = 1;');
    const attaching = service.attach(document);
    const changed = document.apply({
      expectedVersion: 1,
      origin: 'view',
      changes: [{ from: 10, to: 11, insert: '2' }],
    });
    expect(changed?.version).toBe(2);
    gate.resolve();
    await attaching;
    expect(client.open).toHaveBeenCalledWith('file:///main.ts', 'const x = 1;', 1);
    expect(client.change).toHaveBeenCalledWith(changed);
    await service.detach(document);
    service.dispose();
  });

  it('shares one worker document across split views and closes on final detach', async () => {
    const { service, client } = fixture();
    const document = new EditorDocument('main.ts', 'const x = 1;');
    await Promise.all([service.attach(document), service.attach(document)]);
    expect(client.open).toHaveBeenCalledTimes(1);
    await service.detach(document);
    expect(client.close).not.toHaveBeenCalled();
    await service.detach(document);
    expect(client.close).toHaveBeenCalledOnce();
    service.dispose();
  });

  it('does not let a pending old detach close a newly attached document', async () => {
    const first = deferred();
    const { service, client } = fixture(
      vi
        .fn()
        .mockImplementationOnce(async () => first.promise)
        .mockImplementation(async () => undefined),
    );
    const document = new EditorDocument('main.ts', 'const x = 1;');
    const attaching = service.attach(document);
    const detaching = service.detach(document);
    const reattaching = service.attach(document);
    first.resolve();
    await Promise.all([attaching, detaching, reattaching]);
    expect(client.close).not.toHaveBeenCalled();
    await service.detach(document);
    expect(client.close).toHaveBeenCalledOnce();
    service.dispose();
  });

  it('moves an attached worker mirror to the document URI after a filesystem rename', async () => {
    const { service, client } = fixture();
    const document = new EditorDocument('old.ts', 'export const value = 1;');
    await service.attach(document);
    document.rename('new.ts');
    await service.relocate(document);
    expect(client.close).toHaveBeenCalledWith('file:///old.ts');
    expect(client.open).toHaveBeenCalledWith('file:///new.ts', 'export const value = 1;', 1);
    await service.detach(document);
    expect(client.close).toHaveBeenLastCalledWith('file:///new.ts');
    service.dispose();
  });
});

describe('TypeScript service static declarations', () => {
  it('loads the selected project dependency ambient declarations without an import', async () => {
    setExtraLib.mockClear();
    const files = new Map([
      ['/node_modules/tscircuit/package.json', '{"name":"tscircuit","types":"index.d.ts"}'],
      [
        '/node_modules/tscircuit/index.d.ts',
        'declare global { namespace JSX { interface IntrinsicElements { board: object } } }',
      ],
      ['/node_modules/unrelated/index.d.ts', 'declare global { interface Window { unrelated: true } }'],
    ]);
    function readFile(path: string, options: 'utf8'): Promise<string>;
    function readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
    async function readFile(path: string, options?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
      const content = files.get(path);
      if (content === undefined) {
        throw new Error(`Missing ${path}`);
      }
      return options === 'utf8' ? content : new TextEncoder().encode(content);
    }
    const dependencyReader = {
      readdir: vi.fn(async (path: string) =>
        path === '/node_modules/tscircuit' ? ['index.d.ts', 'package.json'] : [],
      ),
      readFile,
    };
    const service = await createTypeScriptService({
      dependencyReader,
      dynamicTypes: false,
      readProjectFile: async (path) =>
        path === 'package.json'
          ? JSON.stringify({ dependencies: { tscircuit: 'npm:@tscircuit/core@0.0.1844' } })
          : undefined,
    });
    expect(setExtraLib).toHaveBeenCalledWith(
      'file:///node_modules/tscircuit/index.d.ts',
      expect.stringContaining('namespace JSX'),
    );
    expect(dependencyReader.readdir).toHaveBeenCalledWith('/node_modules/tscircuit');
    expect(dependencyReader.readdir.mock.calls.every(([path]) => path.startsWith('/node_modules/tscircuit'))).toBe(
      true,
    );
    expect(setExtraLib).not.toHaveBeenCalledWith('file:///node_modules/unrelated/index.d.ts', expect.anything());
    service.dispose();
  });

  it.each([undefined, '{invalid', '{"dependencies":[]}'])(
    'keeps plain editing available with package.json %s',
    async (manifest) => {
      setExtraLib.mockClear();
      const dependencyReader = { readdir: vi.fn(), readFile: vi.fn() };
      const service = await createTypeScriptService({
        dependencyReader,
        dynamicTypes: false,
        readProjectFile: async () => manifest,
      });
      expect(dependencyReader.readdir).not.toHaveBeenCalled();
      expect(setExtraLib).not.toHaveBeenCalled();
      service.dispose();
    },
  );
});
